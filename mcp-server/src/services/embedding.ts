import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getNeo4jDriver } from "../neo4j-client.js";
import { chunkText } from "./chunker.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Must match the `vector.dimensions` of the file_embeddings / chunk_embeddings indexes. */
export const EMBEDDING_DIMENSIONS = 1536;
const GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";

/**
 * Generates a deterministic unit vector of 1536 dimensions seeded by a string hash.
 * This is used as a local fallback for embedding generation.
 */
export function getDeterministicMockEmbedding(text: string): number[] {
  const embedding: number[] = [];
  let seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed = (seed << 5) - seed + text.charCodeAt(i);
    seed |= 0;
  }

  let state = seed;
  let sumOfSquares = 0;
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    const val = state / 2147483648; // [-1, 1] range
    embedding.push(val);
    sumOfSquares += val * val;
  }

  const magnitude = Math.sqrt(sumOfSquares);
  if (magnitude > 0) {
    for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
      embedding[i] /= magnitude;
    }
  } else {
    embedding[0] = 1.0;
  }
  return embedding;
}

/**
 * Returns true if GEMINI_API_KEY is not defined in the environment.
 */
export function isMockEmbedding(): boolean {
  return !process.env.GEMINI_API_KEY;
}

/**
 * Generates embedding for a given text.
 * Uses Google Gemini if GEMINI_API_KEY is defined, or defaults to a local deterministic unit vector.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  if (process.env.GEMINI_API_KEY) {
    try {
      // gemini-embedding-001 supports Matryoshka truncation, so we request exactly the
      // dimensionality the Neo4j vector indexes were created with.
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          model: `models/${GEMINI_EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
          outputDimensionality: EMBEDDING_DIMENSIONS
        })
      });
      if (response.ok) {
        const data = await response.json();
        const values = data?.embedding?.values;
        if (Array.isArray(values) && values.length === EMBEDDING_DIMENSIONS) {
          return values;
        }
        console.warn(`Gemini returned ${Array.isArray(values) ? values.length : "no"} embedding values (expected ${EMBEDDING_DIMENSIONS}), using deterministic fallback.`);
      } else {
        console.warn(`Gemini embedding API responded with HTTP ${response.status}, using deterministic fallback.`);
      }
    } catch (err: any) {
      console.warn("Gemini embedding API call failed, using deterministic fallback:", err.message);
    }
  }
  return getDeterministicMockEmbedding(text);
}

/**
 * Startup function to read files from data-processors, chunk them into ProcessedChunk nodes,
 * and update ProcessedFile & ProcessedChunk nodes in Neo4j with vector embeddings.
 */
export async function initializeEmbeddings(targetFiles?: string[]): Promise<void> {
  console.log(`[Embedding Init] Initializing chunked vector embeddings${targetFiles ? ` for target files: ${targetFiles.join(", ")}` : "" }...`);
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    // 1. Create file_embeddings index (backward compatibility)
    const createFileIndexQuery = `
      CREATE VECTOR INDEX file_embeddings IF NOT EXISTS
      FOR (f:ProcessedFile) ON (f.embedding)
      OPTIONS {indexConfig: {
        \`vector.dimensions\`: ${EMBEDDING_DIMENSIONS},
        \`vector.similarity_function\`: 'cosine'
      }};
    `;
    await session.executeWrite(tx => tx.run(createFileIndexQuery));

    // 2. Create chunk_embeddings index for fine-grained chunk retrieval
    const createChunkIndexQuery = `
      CREATE VECTOR INDEX chunk_embeddings IF NOT EXISTS
      FOR (c:ProcessedChunk) ON (c.embedding)
      OPTIONS {indexConfig: {
        \`vector.dimensions\`: ${EMBEDDING_DIMENSIONS},
        \`vector.similarity_function\`: 'cosine'
      }};
    `;
    await session.executeWrite(tx => tx.run(createChunkIndexQuery));
    console.log("[Embedding Init] Vector indices 'file_embeddings' and 'chunk_embeddings' verified.");

    let dbFiles: string[] = [];
    if (targetFiles && targetFiles.length > 0) {
      dbFiles = targetFiles;
    } else {
      const result = await session.executeRead(tx => tx.run("MATCH (f:ProcessedFile) WHERE f.embedding IS NULL RETURN f.name AS name"));
      dbFiles = result.records.map(r => r.get("name") as string);
      console.log(`[Embedding Init] Found ${dbFiles.length} ProcessedFile nodes missing embeddings in Neo4j.`);
    }

    if (dbFiles.length === 0) {
      console.log("[Embedding Init] No files to process.");
      return;
    }

    const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "../../data-processors");
    let updatedCount = 0;
    let totalChunksCreated = 0;

    for (const fileName of dbFiles) {
      const filePath = path.join(uploadDir, fileName);
      if (fs.existsSync(filePath)) {
        const text = fs.readFileSync(filePath, "utf-8");
        const fileEmbedding = await getEmbedding(text);
        
        // Update ProcessedFile node
        await session.executeWrite(tx => tx.run(
          `
          MATCH (f:ProcessedFile {name: $name})
          SET f.embedding = $embedding, f.text = $text
          `,
          { name: fileName, embedding: fileEmbedding, text }
        ));

        // Generate fine-grained paragraph/section chunks
        const chunks = chunkText(text, 500, 150);
        
        // Calculate all chunk embeddings in parallel batches of 5 (reduces HTTP wait times by 80%)
        const chunksWithEmbeddings: Array<{ chunk: any, embedding: number[] }> = [];
        const BATCH_SIZE = 5;
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
          const batch = chunks.slice(i, i + BATCH_SIZE);
          const batchResults = await Promise.all(batch.map(async (chunk) => {
            const embedding = await getEmbedding(chunk.text);
            return { chunk, embedding };
          }));
          chunksWithEmbeddings.push(...batchResults);
        }

        // Write chunk data to Neo4j sequentially using the single session
        for (const item of chunksWithEmbeddings) {
          const chunkId = `${fileName}_chunk_${item.chunk.index}`;
          await session.executeWrite(tx => tx.run(
            `
            MATCH (f:ProcessedFile {name: $fileName})
            MERGE (c:ProcessedChunk {chunk_id: $chunkId})
            SET c.index = $index,
                c.text = $text,
                c.file_name = $fileName,
                c.embedding = $embedding
            MERGE (f)-[:HAS_CHUNK]->(c)
            `,
            {
              fileName,
              chunkId,
              index: item.chunk.index,
              text: item.chunk.text,
              embedding: item.embedding
            }
          ));
          totalChunksCreated++;
        }

        updatedCount++;
      } else {
        console.warn(`[Embedding Init] File ${fileName} from Neo4j DB does not exist on disk at ${filePath}`);
      }
    }
    console.log(`[Embedding Init] Processed ${updatedCount} files, created/updated ${totalChunksCreated} ProcessedChunk nodes with vector embeddings.`);
  } catch (err: any) {
    console.error("[Embedding Init] Error populating embeddings:", err.message);
  } finally {
    await session.close();
  }
}
