import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getNeo4jDriver } from "../neo4j-client.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  for (let i = 0; i < 1536; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    const val = state / 2147483648; // [-1, 1] range
    embedding.push(val);
    sumOfSquares += val * val;
  }

  const magnitude = Math.sqrt(sumOfSquares);
  if (magnitude > 0) {
    for (let i = 0; i < 1536; i++) {
      embedding[i] /= magnitude;
    }
  } else {
    embedding[0] = 1.0;
  }
  return embedding;
}

/**
 * Generates embedding for a given text.
 * Uses Google Gemini if GEMINI_API_KEY is defined, or defaults to a local deterministic unit vector.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  if (process.env.GEMINI_API_KEY) {
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text }] }
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.embedding && Array.isArray(data.embedding.values)) {
          return data.embedding.values;
        }
      }
    } catch (err: any) {
      console.warn("Gemini embedding API call failed, using deterministic fallback:", err.message);
    }
  }
  return getDeterministicMockEmbedding(text);
}

/**
 * Startup function to read files from data-processors and update ProcessedFile nodes in Neo4j with vector embeddings.
 */
export async function initializeEmbeddings(): Promise<void> {
  console.log("[Embedding Init] Initializing vector embeddings...");
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const createIndexQuery = `
      CREATE VECTOR INDEX file_embeddings IF NOT EXISTS
      FOR (f:ProcessedFile) ON (f.embedding)
      OPTIONS {indexConfig: {
        \`vector.dimensions\`: 1536,
        \`vector.similarity_function\`: 'cosine'
      }};
    `;
    await session.run(createIndexQuery);
    console.log("[Embedding Init] Vector index 'file_embeddings' verified.");

    const result = await session.run("MATCH (f:ProcessedFile) RETURN f.name AS name");
    const dbFiles = result.records.map(r => r.get("name") as string);
    console.log(`[Embedding Init] Found ${dbFiles.length} ProcessedFile nodes in Neo4j.`);

    const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "../../data-processors");
    let updatedCount = 0;

    for (const fileName of dbFiles) {
      const filePath = path.join(uploadDir, fileName);
      if (fs.existsSync(filePath)) {
        const text = fs.readFileSync(filePath, "utf-8");
        const embedding = await getEmbedding(text);
        
        await session.run(
          `
          MATCH (f:ProcessedFile {name: $name})
          SET f.embedding = $embedding, f.text = $text
          `,
          { name: fileName, embedding, text }
        );
        updatedCount++;
      } else {
        console.warn(`[Embedding Init] File ${fileName} from Neo4j DB does not exist on disk at ${filePath}`);
      }
    }
    console.log(`[Embedding Init] Updated ${updatedCount} files with vector embeddings.`);
  } catch (err: any) {
    console.error("[Embedding Init] Error populating embeddings:", err.message);
  } finally {
    await session.close();
  }
}
