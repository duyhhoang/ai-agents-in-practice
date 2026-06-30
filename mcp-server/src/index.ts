import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getNeo4jDriver, closeNeo4jDriver } from "./neo4j-client.js";
import neo4j from "neo4j-driver";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const mcpServer = new Server({
  name: "supply-chain-mcp",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {},
  },
});

/**
 * Recursively converts Neo4j-specific types (Integer, DateTime, Date, etc.)
 * into standard JS primitives or ISO strings so they serialize cleanly in JSON.
 */
function convertNeo4jTypes(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }
  
  if (typeof value === "object") {
    // 1. Neo4j Integer (has .low and .high properties, or constructor name is "Integer")
    if (value.constructor && value.constructor.name === "Integer") {
      return value.toNumber();
    }
    if (typeof value.low === "number" && typeof value.high === "number" && Object.keys(value).length === 2) {
      return value.high === 0 ? value.low : (value.high * 4294967296 + (value.low >>> 0));
    }
    
    // 2. Neo4j Temporal Types (Date, DateTime, Time, LocalTime, Duration)
    if (value.constructor && ["Date", "DateTime", "Time", "LocalTime", "Duration"].includes(value.constructor.name)) {
      return value.toString();
    }
    
    // 3. Arrays
    if (Array.isArray(value)) {
      return value.map(convertNeo4jTypes);
    }
    
    // 4. Objects (dicts)
    const converted: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      converted[key] = convertNeo4jTypes(value[key]);
    }
    return converted;
  }
  
  return value;
}

/**
 * Generates a deterministic unit vector of 1536 dimensions seeded by a string hash.
 * This is used as a local fallback for embedding generation.
 */
function getDeterministicMockEmbedding(text: string): number[] {
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
async function getEmbedding(text: string): Promise<number[]> {
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

// Graph extraction helpers
function isNeo4jNode(obj: any): boolean {
  return obj && typeof obj === 'object' && Array.isArray(obj.labels) && typeof obj.properties === 'object';
}

function isNeo4jRelationship(obj: any): boolean {
  return obj && typeof obj === 'object' && typeof obj.type === 'string' && typeof obj.properties === 'object' &&
    ((obj.start !== undefined && obj.end !== undefined) || (obj.startNodeElementId !== undefined && obj.endNodeElementId !== undefined));
}

function getNeo4jId(obj: any): string {
  if (obj.elementId) return String(obj.elementId);
  if (obj.identity) {
    if (typeof obj.identity.toNumber === 'function') return String(obj.identity.toNumber());
    if (typeof obj.identity.low === 'number') return String(obj.identity.low);
    return String(obj.identity);
  }
  return '';
}

function nodeToEvidenceNode(node: any): any {
  const props = convertNeo4jTypes(node.properties) || {};
  const id = props.actor_id || props.location_code || props.unit_id || props.material_id || props.process_id || props.id || getNeo4jId(node) || "unknown";
  const label = node.labels[0] || "Entity";
  const name = props.name || props.actor_name || props.location_name || props.material_name || props.serial_number || props.process_name || id;
  return {
    id,
    label,
    name,
    type: label,
    properties: props
  };
}

function extractGraphFromRecords(records: any[]): any {
  const nodesMap = new Map<string, any>();
  const edgesMap = new Map<string, any>();
  const internalIdToBusinessKey = new Map<string, string>();

  const rawNodes: any[] = [];
  const rawRels: any[] = [];

  function traverse(val: any) {
    if (val === null || val === undefined) return;
    if (isNeo4jNode(val)) {
      rawNodes.push(val);
    } else if (isNeo4jRelationship(val)) {
      rawRels.push(val);
    } else if (Array.isArray(val)) {
      val.forEach(traverse);
    } else if (typeof val === 'object') {
      if (val.segments && Array.isArray(val.segments)) {
        val.segments.forEach((seg: any) => {
          if (seg.start) rawNodes.push(seg.start);
          if (seg.relationship) rawRels.push(seg.relationship);
          if (seg.end) rawNodes.push(seg.end);
        });
      } else {
        Object.values(val).forEach(traverse);
      }
    }
  }

  traverse(records);

  rawNodes.forEach(node => {
    const evidenceNode = nodeToEvidenceNode(node);
    nodesMap.set(evidenceNode.id, evidenceNode);
    const internalId = getNeo4jId(node);
    if (internalId) {
      internalIdToBusinessKey.set(internalId, evidenceNode.id);
    }
  });

  rawRels.forEach(rel => {
    const props = convertNeo4jTypes(rel.properties) || {};
    const startInternalId = rel.startNodeElementId ? String(rel.startNodeElementId) :
                            (rel.start ? (typeof rel.start.toNumber === 'function' ? String(rel.start.toNumber()) : String(rel.start)) : '');
    const endInternalId = rel.endNodeElementId ? String(rel.endNodeElementId) :
                          (rel.end ? (typeof rel.end.toNumber === 'function' ? String(rel.end.toNumber()) : String(rel.end)) : '');

    const source = internalIdToBusinessKey.get(startInternalId) || startInternalId;
    const target = internalIdToBusinessKey.get(endInternalId) || endInternalId;
    
    if (source && target) {
      const type = rel.type || "RELATED_TO";
      const edgeId = getNeo4jId(rel) || `${source}-${type}-${target}`;
      edgesMap.set(edgeId, {
        id: edgeId,
        source,
        target,
        type,
        properties: props
      });
    }
  });

  return {
    nodes: Array.from(nodesMap.values()),
    edges: Array.from(edgesMap.values())
  };
}

// Define MCP Tools
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "graph-query",
        description: "Execute an arbitrary Cypher query against the Neo4j supply chain database",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "The Cypher query string to run" },
            params: { type: "object", description: "Query parameters", additionalProperties: true },
            read_only: { type: "boolean", description: "If true, runs in a read-only transaction to protect the database (default: true)" }
          },
          required: ["query"]
        }
      },
      {
        name: "subgraph-extract",
        description: "Extract a subgraph around a specific node by ID and label up to a given depth",
        inputSchema: {
          type: "object",
          properties: {
            entity_id: { type: "string", description: "ID of the root node (e.g. actor_id, unit_id, material_id, process_id, etc.)" },
            entity_type: { type: "string", description: "Node label (e.g. Actor, ChargingStation, Material, Process)" },
            depth: { type: "number", description: "Maximum traversal depth (default: 2)", minimum: 1, maximum: 4 },
            unit_id: { type: "string", description: "Optional unit ID (required for Process nodes to uniquely identify them)" }
          },
          required: ["entity_id", "entity_type"]
        }
      },
      {
        name: "diagram-generate",
        description: "Generate a PlantUML visualization from a set of nodes and relationships",
        inputSchema: {
          type: "object",
          properties: {
            nodes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  name: { type: "string" }
                },
                required: ["id", "label"]
              }
            },
            relationships: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  source: { type: "string" },
                  target: { type: "string" },
                  type: { type: "string" }
                },
                required: ["source", "target", "type"]
              }
            },
            diagram_type: { type: "string", enum: ["architecture", "process", "dependency"], default: "dependency" }
          },
          required: ["nodes", "relationships"]
        }
      },
      {
        name: "analytics",
        description: "Perform graph analytics on the supply chain database (critical path, bottlenecks, centrality)",
        inputSchema: {
          type: "object",
          properties: {
            analysis_type: { type: "string", enum: ["bottleneck_analysis", "critical_path", "centrality"] }
          },
          required: ["analysis_type"]
        }
      },
      {
        name: "vector-search",
        description: "Perform a vector similarity search over unstructured files (such as incident reports or quality audits)",
        inputSchema: {
          type: "object",
          properties: {
            query_text: { type: "string", description: "The text query to search for" },
            limit: { type: "number", description: "Maximum number of results to return (default: 5)" }
          },
          required: ["query_text"]
        }
      }
    ]
  };
});

// Tool execution logic
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const driver = getNeo4jDriver();

  try {
    if (name === "graph-query") {
      const query = args?.query as string;
      const params = (args?.params as Record<string, any>) || {};
      const readOnly = args?.read_only !== false; // default to true

      const session = driver.session();
      try {
        const startTime = Date.now();
        let result;
        if (readOnly) {
          result = await session.executeRead(tx => tx.run(query, params));
        } else {
          result = await session.executeWrite(tx => tx.run(query, params));
        }
        const records = result.records.map(r => r.toObject());
        const duration = Date.now() - startTime;
        
        // Clean records using type converter
        const cleanedRecords = convertNeo4jTypes(records);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({ results: cleanedRecords, execution_time_ms: duration }, null, 2)
          }]
        };
      } finally {
        await session.close();
      }
    } 
    
    else if (name === "subgraph-extract") {
      const entityId = args?.entity_id as string;
      const entityType = args?.entity_type as string;
      const depth = (args?.depth as number) || 2;
      const unitId = args?.unit_id as string;

      // Map node label to its respective ID property name
      const idField = entityType === "Actor" ? "actor_id" :
                      entityType === "Location" ? "location_code" :
                      entityType === "ChargingStation" ? "unit_id" :
                      entityType === "Process" ? "process_id" :
                      entityType === "Material" ? "material_id" : "id";

      // Match start node depending on compound key requirements
      let startMatch = "";
      if (entityType === "Process" && unitId) {
        startMatch = `MATCH (cs:ChargingStation {unit_id: $unitId})-[:UNDERGOES]->(start:Process {process_id: $entityId})`;
      } else {
        startMatch = `MATCH (start:${entityType} {${idField}: $entityId})`;
      }

      const query = `
        ${startMatch}
        CALL apoc.path.subgraphAll(start, {
          maxLevel: $depth,
          blacklistNodes: []
        })
        YIELD nodes, relationships
        WITH nodes, relationships
        OPTIONAL MATCH (cs:ChargingStation)-[:UNDERGOES]->(p:Process)
        WHERE p IN nodes
        WITH nodes, relationships, collect({p: p, unit_id: cs.unit_id}) AS processMap
        RETURN 
          [n IN nodes | {
            id: CASE 
                  WHEN 'Process' IN labels(n) THEN 
                    CASE
                      WHEN coalesce(n.unit_id, [m IN processMap WHERE m.p = n | m.unit_id][0]) IS NOT NULL
                           AND NOT n.process_id STARTS WITH coalesce(n.unit_id, [m IN processMap WHERE m.p = n | m.unit_id][0]) + '_'
                      THEN coalesce(n.unit_id, [m IN processMap WHERE m.p = n | m.unit_id][0]) + '_' + n.process_id
                      ELSE n.process_id
                    END
                  ELSE coalesce(n.actor_id, n.location_code, n.unit_id, n.material_id, n.id)
                END,
            label: labels(n)[0],
            properties: properties(n)
          }] AS nodes,
          [r IN relationships | {
            source: CASE 
                      WHEN 'Process' IN labels(startNode(r)) THEN 
                        CASE
                          WHEN coalesce(startNode(r).unit_id, [m IN processMap WHERE m.p = startNode(r) | m.unit_id][0]) IS NOT NULL
                               AND NOT startNode(r).process_id STARTS WITH coalesce(startNode(r).unit_id, [m IN processMap WHERE m.p = startNode(r) | m.unit_id][0]) + '_'
                          THEN coalesce(startNode(r).unit_id, [m IN processMap WHERE m.p = startNode(r) | m.unit_id][0]) + '_' + startNode(r).process_id
                          ELSE startNode(r).process_id
                        END
                      ELSE coalesce(startNode(r).actor_id, startNode(r).location_code, startNode(r).unit_id, startNode(r).material_id, startNode(r).id)
                    END,
            target: CASE 
                      WHEN 'Process' IN labels(endNode(r)) THEN 
                        CASE
                          WHEN coalesce(endNode(r).unit_id, [m IN processMap WHERE m.p = endNode(r) | m.unit_id][0]) IS NOT NULL
                               AND NOT endNode(r).process_id STARTS WITH coalesce(endNode(r).unit_id, [m IN processMap WHERE m.p = endNode(r) | m.unit_id][0]) + '_'
                          THEN coalesce(endNode(r).unit_id, [m IN processMap WHERE m.p = endNode(r) | m.unit_id][0]) + '_' + endNode(r).process_id
                          ELSE endNode(r).process_id
                        END
                      ELSE coalesce(endNode(r).actor_id, endNode(r).location_code, endNode(r).unit_id, endNode(r).material_id, endNode(r).id)
                    END,
            type: type(r),
            properties: properties(r)
          }] AS relationships
      `;

      const session = driver.session();
      try {
        const result = await session.run(query, { entityId, depth, unitId });
        const record = result.records[0];
        
        // Convert any custom types recursively (e.g. Integers/DateTimes inside properties)
        const output = record ? convertNeo4jTypes(record.toObject()) : { nodes: [], relationships: [] };
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify(output, null, 2)
          }]
        };
      } finally {
        await session.close();
      }
    } 
    
    else if (name === "diagram-generate") {
      const nodes = (args?.nodes as Array<{ id: string; label: string; name?: string }>) || [];
      const relationships = (args?.relationships as Array<{ source: string; target: string; type: string }>) || [];
      const diagramType = (args?.diagram_type as string) || "dependency";

      let puml = "@startuml\n";
      puml += "skinparam monochrome false\n";
      puml += "skinparam shadowing false\n\n";

      // Write nodes
      nodes.forEach(n => {
        const cleanId = n.id.replace(/[^a-zA-Z0-9_]/g, "_");
        const displayName = n.name || n.id;
        
        if (n.label === "Actor") {
          puml += `actor "${displayName}" as ${cleanId}\n`;
        } else if (n.label === "Location") {
          puml += `boundary "${displayName}" as ${cleanId}\n`;
        } else if (n.label === "ChargingStation") {
          puml += `node "${displayName}" as ${cleanId}\n`;
        } else if (n.label === "Process") {
          puml += `control "${displayName}" as ${cleanId}\n`;
        } else if (n.label === "Material") {
          puml += `artifact "${displayName}" as ${cleanId}\n`;
        } else {
          puml += `entity "${displayName}" as ${cleanId}\n`;
        }
      });

      puml += "\n";

      // Write relationships
      relationships.forEach(r => {
        const cleanSrc = r.source.replace(/[^a-zA-Z0-9_]/g, "_");
        const cleanTgt = r.target.replace(/[^a-zA-Z0-9_]/g, "_");
        puml += `${cleanSrc} --> ${cleanTgt} : ${r.type}\n`;
      });

      puml += "\n@enduml";

      return {
        content: [{
          type: "text",
          text: puml
        }]
      };
    } 
    
    else if (name === "analytics") {
      const type = args?.analysis_type as string;
      const session = driver.session();
      
      try {
        if (type === "bottleneck_analysis") {
          // Identify nodes with high degree of incoming relationships (e.g. materials or processes many nodes depend on)
          const query = `
            MATCH (n)
            WHERE NOT n:ProcessedFile
            OPTIONAL MATCH (cs:ChargingStation)-[:UNDERGOES]->(n)
            WITH n, cs, COUNT { (n)<-[:UNDERGOES|USES_MATERIAL|SUPPLIES|EXECUTED_BY|LOCATED_IN]-() } AS dependency_count
            WHERE dependency_count > 0
            RETURN 
              CASE 
                WHEN 'Process' IN labels(n) THEN 
                  CASE
                    WHEN coalesce(n.unit_id, cs.unit_id) IS NOT NULL
                         AND NOT n.process_id STARTS WITH coalesce(n.unit_id, cs.unit_id) + '_'
                    THEN coalesce(n.unit_id, cs.unit_id) + '_' + n.process_id
                    ELSE n.process_id
                  END
                ELSE coalesce(n.actor_id, n.location_code, n.unit_id, n.material_id, n.id)
              END AS id,
              labels(n)[0] AS label,
              coalesce(n.name, n.actor_name, n.location_name, n.material_name, n.serial_number, n.process_name, n.id) AS name,
              dependency_count
            ORDER BY dependency_count DESC
            LIMIT 10
          `;
          const result = await session.run(query);
          const records = result.records.map(r => r.toObject());
          const bottlenecks = convertNeo4jTypes(records);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ bottlenecks, metric: "In-degree Centrality (Dependencies)" }, null, 2)
            }]
          };
        } 
        
        else if (type === "critical_path") {
          // Identify processes that are connected in sequences
          const query = `
            MATCH p = (start:Process)-[:EXECUTED_BY|UNDERGOES*1..5]-(end)
            UNWIND nodes(p) AS n
            OPTIONAL MATCH (cs:ChargingStation)-[:UNDERGOES]->(n)
            WITH p, collect({
              id: CASE 
                    WHEN 'Process' IN labels(n) THEN 
                      CASE
                        WHEN coalesce(n.unit_id, cs.unit_id) IS NOT NULL
                             AND NOT n.process_id STARTS WITH coalesce(n.unit_id, cs.unit_id) + '_'
                        THEN coalesce(n.unit_id, cs.unit_id) + '_' + n.process_id
                        ELSE n.process_id
                      END
                    ELSE coalesce(n.actor_id, n.location_code, n.unit_id, n.material_id, n.id)
                  END,
              label: labels(n)[0]
            }) AS pathNodes
            RETURN 
              pathNodes AS path,
              length(p) AS path_length
            ORDER BY path_length DESC
            LIMIT 5
          `;
          const result = await session.run(query);
          const records = result.records.map(r => r.toObject());
          const paths = convertNeo4jTypes(records);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ critical_paths: paths, metric: "Process Path Length" }, null, 2)
            }]
          };
        } 
        
        else {
          // Centrality calculation (Degree Centrality)
          const query = `
            MATCH (n)
            WHERE NOT n:ProcessedFile
            OPTIONAL MATCH (cs:ChargingStation)-[:UNDERGOES]->(n)
            WITH n, cs, COUNT { (n)-[]-() } AS degree
            RETURN 
              CASE 
                WHEN 'Process' IN labels(n) THEN 
                  CASE
                    WHEN coalesce(n.unit_id, cs.unit_id) IS NOT NULL
                         AND NOT n.process_id STARTS WITH coalesce(n.unit_id, cs.unit_id) + '_'
                    THEN coalesce(n.unit_id, cs.unit_id) + '_' + n.process_id
                    ELSE n.process_id
                  END
                ELSE coalesce(n.actor_id, n.location_code, n.unit_id, n.material_id, n.id)
              END AS id,
              labels(n)[0] AS label,
              degree
            ORDER BY degree DESC
            LIMIT 10
          `;
          const result = await session.run(query);
          const records = result.records.map(r => r.toObject());
          const centrality = convertNeo4jTypes(records);
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ centrality_ranking: centrality, metric: "Degree Centrality" }, null, 2)
            }]
          };
        }
      } finally {
        await session.close();
      }
    } 
    
    else if (name === "vector-search") {
      const queryText = args?.query_text as string;
      const limit = (args?.limit as number) || 5;

      const embedding = await getEmbedding(queryText);
      const query = `
        CALL db.index.vector.queryNodes('file_embeddings', $limit, $embedding)
        YIELD node, score
        RETURN node.name AS filename, coalesce(node.text, node.name) AS content, score
      `;

      const session = driver.session();
      try {
        const result = await session.run(query, { limit, embedding });
        const records = result.records.map(r => r.toObject());
        const cleaned = convertNeo4jTypes(records);
        return {
          content: [{
            type: "text",
            text: JSON.stringify(cleaned, null, 2)
          }]
        };
      } finally {
        await session.close();
      }
    }
    
    else {
      throw new Error(`Tool ${name} not found`);
    }
  } catch (err: any) {
    return {
      isError: true,
      content: [{
        type: "text",
        text: `Error executing tool ${name}: ${err.message}`
      }]
    };
  }
});

const useStdio = process.argv.includes("--stdio") || process.env.MCP_TRANSPORT === "stdio";

if (useStdio) {
  // Connect via standard Input/Output
  const transport = new StdioServerTransport();
  mcpServer.connect(transport).then(() => {
    console.error("Supply Chain MCP Server running on stdio mode");
  }).catch((err) => {
    console.error("Failed to connect stdio transport:", err);
  });
  
  // Graceful shutdown
  async function handleShutdown() {
    await closeNeo4jDriver();
    process.exit(0);
  }
  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
} else {
  // Start Express HTTP SSE Server
  const app = express();
  app.use(cors({ exposedHeaders: ["mcp-session-id"] }));
  app.use(express.json());

  // Request Logger (before routes so it captures all requests)
  app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    next();
  });


  // Setup upload folder configuration
  const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "../../data-processors");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Multer storage configuration
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    }
  });
  const upload = multer({ storage });

  // Helper to compute Java-like string hashCode as unsigned 32-bit hex
  function getHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return (hash >>> 0).toString(16);
  }

  // Health check endpoint
  app.get("/api/health", async (req, res) => {
    const health: any = {
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        mcp_server: { status: "ok" },
        neo4j: { status: "unknown" },
        n8n: { status: "unknown" },
        llm_cluster: { status: "unknown" }
      }
    };

    // Check Neo4j
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const result = await session.run("RETURN 1 AS ok");
      health.services.neo4j = { status: "ok", message: "Connected" };
    } catch (err: any) {
      health.services.neo4j = { status: "error", message: err.message };
      health.status = "degraded";
    } finally {
      await session.close();
    }

    // Check n8n
    try {
      const n8nRes = await fetch("http://localhost:5678/healthz", { signal: AbortSignal.timeout(3000) });
      health.services.n8n = { status: n8nRes.ok ? "ok" : "error", message: `HTTP ${n8nRes.status}` };
    } catch {
      health.services.n8n = { status: "offline", message: "Cannot reach n8n at localhost:5678" };
    }

    // Check LLM cluster
    const inferenceUrl = process.env.INFERENCE_BASE_URL || "http://131.159.60.153:3000/inference";
    try {
      const llmRes = await fetch(`${inferenceUrl}/models`, { signal: AbortSignal.timeout(5000) });
      health.services.llm_cluster = { status: llmRes.ok ? "ok" : "error", message: `HTTP ${llmRes.status}` };
    } catch {
      health.services.llm_cluster = { status: "offline", message: "Cannot reach LLM inference cluster" };
    }

    const httpStatus = health.status === "ok" ? 200 : 503;
    res.status(httpStatus).json(health);
  });

  // Generic query endpoint for the frontend
  app.post("/api/query", async (req, res) => {
    const { query, params } = req.body;
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const result = await session.run(query, params || {});
      const records = result.records.map(r => r.toObject());
      const cleaned = convertNeo4jTypes(records);
      res.json({ results: cleaned });
    } catch (err: any) {
      console.error("API Query error:", err.message);
      res.status(500).json({ error: err.message });
    } finally {
      await session.close();
    }
  });

  // Subgraph extraction endpoint
  app.post("/api/subgraph", async (req, res) => {
    const { entity_id, entity_type, depth } = req.body;
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const idField = entity_type === "Actor" ? "actor_id" :
                      entity_type === "Location" ? "location_code" :
                      entity_type === "ChargingStation" ? "unit_id" :
                      entity_type === "Process" ? "process_id" :
                      entity_type === "Material" ? "material_id" : "id";

      const query = `
        MATCH (start:${entity_type} {${idField}: $entity_id})
        CALL apoc.path.subgraphAll(start, {
          maxLevel: $depth
        })
        YIELD nodes, relationships
        RETURN 
          [n IN nodes | {
            id: coalesce(n.actor_id, n.location_code, n.unit_id, n.material_id, n.process_id, n.id),
            label: labels(n)[0],
            properties: properties(n)
          }] AS nodes,
          [r IN relationships | {
            source: coalesce(startNode(r).actor_id, startNode(r).location_code, startNode(r).unit_id, startNode(r).material_id, startNode(r).process_id, startNode(r).id),
            target: coalesce(endNode(r).actor_id, endNode(r).location_code, endNode(r).unit_id, endNode(r).material_id, endNode(r).process_id, endNode(r).id),
            type: type(r)
          }] AS relationships
      `;
      const result = await session.run(query, { entity_id, depth: depth || 1 });
      if (result.records.length > 0) {
        const record = result.records[0].toObject();
        res.json(convertNeo4jTypes(record));
      } else {
        res.json({ nodes: [], relationships: [] });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    } finally {
      await session.close();
    }
  });

  // Diagram generation endpoint
  app.post("/api/diagram", (req, res) => {
    const { nodes, relationships } = req.body;
    let puml = "@startuml\n";
    puml += "skinparam monochrome false\n";
    puml += "skinparam shadowing false\n\n";

    if (!Array.isArray(nodes) || !Array.isArray(relationships)) {
      res.status(400).send("Invalid request body: nodes and relationships must be arrays.");
      return;
    }

    nodes.forEach((n: any) => {
      const id = n.id || "";
      const cleanId = id.replace(/[^a-zA-Z0-9_]/g, "_");
      const displayName = n.name || id || "Unknown";
      if (n.label === "Actor") puml += `actor "${displayName}" as ${cleanId}\n`;
      else if (n.label === "Location") puml += `boundary "${displayName}" as ${cleanId}\n`;
      else if (n.label === "ChargingStation") puml += `node "${displayName}" as ${cleanId}\n`;
      else if (n.label === "Process") puml += `control "${displayName}" as ${cleanId}\n`;
      else if (n.label === "Material") puml += `artifact "${displayName}" as ${cleanId}\n`;
      else puml += `entity "${displayName}" as ${cleanId}\n`;
    });

    puml += "\n";
    relationships.forEach((r: any) => {
      const src = r.source || "";
      const tgt = r.target || "";
      const cleanSrc = src.replace(/[^a-zA-Z0-9_]/g, "_");
      const cleanTgt = tgt.replace(/[^a-zA-Z0-9_]/g, "_");
      puml += `${cleanSrc} --> ${cleanTgt} : ${r.type || "RELATED_TO"}\n`;
    });

    puml += "\n@enduml";
    res.setHeader("Content-Type", "text/plain");
    res.send(puml);
  });

  const executionsFile = path.join(__dirname, "../data/ingestion_executions.json");

  function getExecutions() {
    try {
      if (!fs.existsSync(path.dirname(executionsFile))) {
        fs.mkdirSync(path.dirname(executionsFile), { recursive: true });
      }
      if (!fs.existsSync(executionsFile)) {
        const mockHistory = [
          {
            id: "exec-9281",
            timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
            triggerType: "Upload Log",
            status: "Success",
            durationMs: 4210,
            filesProcessed: 1,
            error: null
          },
          {
            id: "exec-9282",
            timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            triggerType: "Manual Trigger",
            status: "Success",
            durationMs: 8900,
            filesProcessed: 10,
            error: null
          },
          {
            id: "exec-9283",
            timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
            triggerType: "Upload Audit",
            status: "Failed",
            durationMs: 1420,
            filesProcessed: 0,
            error: "n8n responded with status 503 Service Unavailable"
          }
        ];
        fs.writeFileSync(executionsFile, JSON.stringify(mockHistory, null, 2));
        return mockHistory;
      }
      return JSON.parse(fs.readFileSync(executionsFile, "utf-8"));
    } catch (err) {
      console.error("Error reading executions file:", err);
      return [];
    }
  }

  function logExecution(triggerType: string, status: string, durationMs: number, filesProcessed: number, error: string | null = null) {
    try {
      const list = getExecutions();
      list.unshift({
        id: "exec-" + Math.floor(1000 + Math.random() * 9000),
        timestamp: new Date().toISOString(),
        triggerType,
        status,
        durationMs,
        filesProcessed,
        error
      });
      fs.writeFileSync(executionsFile, JSON.stringify(list.slice(0, 50), null, 2));
    } catch (err) {
      console.error("Error writing executions file:", err);
    }
  }

  app.get("/api/ingestion/executions", (req, res) => {
    res.json(getExecutions());
  });

  // Ingestion status endpoint
  app.get("/api/ingestion/status", async (req, res) => {
    const driver = getNeo4jDriver();
    const session = driver.session();
    try {
      const dbRes = await session.run("MATCH (f:ProcessedFile) RETURN f.name AS name, f.hash AS hash");
      const processedMap = new Map<string, string>();
      dbRes.records.forEach(r => {
        const name = r.get("name");
        const hash = r.get("hash");
        processedMap.set(name, hash);
      });

      if (!fs.existsSync(uploadDir)) {
        return res.json([]);
      }
      const files = fs.readdirSync(uploadDir);
      const resultList = [];

      for (const file of files) {
        if (!/^\d{2}_.*\.(csv|txt|md)$/.test(file)) continue;
        const filePath = path.join(uploadDir, file);
        const stats = fs.statSync(filePath);
        const text = fs.readFileSync(filePath, "utf-8");
        const hash = getHash(text);
        const dbHash = processedMap.get(file);
        const processed = !!dbHash && dbHash === hash;

        resultList.push({
          name: file,
          size: stats.size,
          hash,
          processed
        });
      }
      res.json(resultList);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    } finally {
      await session.close();
    }
  });

  // Ingestion file upload
  app.post(["/upload", "/api/upload", "/api/ingestion/upload"], upload.single("file"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    const filename = req.file.originalname;
    console.log(`[Upload] File saved: ${filename}`);

    const webhookUrl = process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook/trigger-extraction";
    const startTime = Date.now();

    try {
      console.log(`[Upload] Triggering n8n pipeline: ${webhookUrl}`);
      const n8nRes = await fetch(webhookUrl, { method: "GET" });
      const duration = Date.now() - startTime;

      if (!n8nRes.ok) {
        throw new Error(`n8n webhook responded with status ${n8nRes.status}`);
      }

      const n8nData = await n8nRes.json().catch(() => ({}));
      console.log(`[Upload] Ingestion completed in ${duration}ms:`, n8nData);

      // Now, update embeddings for any files in Neo4j (including this newly uploaded one)
      // to ensure vector search indices stay up-to-date!
      await initializeEmbeddings();

      const filesCount = Array.isArray(n8nData) ? n8nData.length : 1;
      logExecution(`Upload Log (${filename})`, "Success", duration, filesCount);

      const answer = `File **${filename}** uploaded and ingested successfully!\n\n**Ingestion Report:**\n- Pipeline Duration: ${(duration / 1000).toFixed(2)}s\n- Status: Ingestion complete\n- Files processed in batch: ${filesCount}`;

      res.json({
        messageId: crypto.randomUUID(),
        answer,
        evidenceGraph: { nodes: [], edges: [] },
        evidenceTrace: {
          toolsUsed: [
            {
              id: "n8n_ingestion",
              name: "n8n pipeline trigger",
              status: "success",
              durationMs: duration,
              inputSummary: `Filename: ${filename}`,
              outputSummary: `Processed successfully`
            }
          ],
          cypherQueries: [],
          accessedNodes: [],
          sourceChunks: []
        }
      });
    } catch (err: any) {
      const duration = Date.now() - startTime;
      console.error(`[Upload Error]`, err.message);
      logExecution(`Upload Log (${filename})`, "Failed", duration, 0, err.message);
      res.status(500).json({
        error: "Upload & Ingestion failed",
        details: err.message
      });
    }
  });

  let isPipelineRunning = false;

  // Trigger Ingestion (via n8n Webhook)
  app.post("/api/ingestion/trigger", async (req, res) => {
    if (isPipelineRunning) {
      return res.status(429).json({ success: false, error: "The n8n ingestion pipeline is already running. Please wait for it to complete." });
    }
    isPipelineRunning = true;
    const webhookUrl = process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook/trigger-extraction";
    const startTime = Date.now();
    try {
      const n8nRes = await fetch(webhookUrl, { method: "GET" });
      const duration = Date.now() - startTime;
      if (n8nRes.ok) {
        const data = await n8nRes.json().catch(() => ({}));
        const filesCount = Array.isArray(data) ? data.length : 1;
        logExecution("Manual Trigger", "Success", duration, filesCount);
        res.json({
          success: true,
          duration_ms: duration,
          processed_files: filesCount,
          details: data
        });
      } else {
        throw new Error(`n8n responded with status ${n8nRes.status}`);
      }
    } catch (err: any) {
      const duration = Date.now() - startTime;
      logExecution("Manual Trigger", "Failed", duration, 0, err.message);
      res.status(500).json({ success: false, error: err.message });
    } finally {
      isPipelineRunning = false;
    }
  });

  // Helper to call LLM via Chair Clusters API (with 120s timeout)
  async function callLLM(systemPrompt: string, userPrompt: string, temperature = 0.7, reasoning = "low"): Promise<string> {
    const inferenceUrl = process.env.INFERENCE_BASE_URL || "http://131.159.60.153:3000/inference";
    const apiKey = process.env.CLUSTER_API_KEY;
    const LLM_TIMEOUT_MS = 120_000; // 120 seconds
    
    const body: any = {
      model: "google/gemma-4-31B-it",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature
    };
    
    if (reasoning === "high") {
      body.reasoning_effort = "high";
      body.extra_body = {
        chat_template_kwargs: { enable_thinking: true },
        skip_special_tokens: false,
        "mm-processor-kwargs": { max_soft_tokens: 1120 }
      };
    } else {
      body.reasoning_effort = "low";
    }

    const res = await fetch(`${inferenceUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS)
    });

    if (!res.ok) {
      throw new Error(`LLM call failed with status ${res.status}`);
    }

    const data = await res.json();
    return data.choices[0].message.content || "";
  }

  // Multi-Agent Chat Strategy Assistant (Guided Cypher Generator + RAG + Multi-Agent Team)
  app.post(["/chat", "/api/chat"], async (req, res) => {
    const prompt = req.body.question || req.body.prompt || req.body.message;
    const reasoning = req.body.reasoning || "low";
    const ragLimit = Number(req.body.ragLimit) || 3;

    if (!prompt) {
      return res.status(400).json({ error: "question or prompt is required" });
    }

    const driver = getNeo4jDriver();

    try {
      console.log(`[Multi-Agent Chat] Received question: "${prompt}" (Reasoning: ${reasoning}, RAG Limit: ${ragLimit})`);
      
      // Step 0: Perform Vector Similarity Search (Unstructured RAG Context)
      let vectorResults: any[] = [];
      try {
        const embedding = await getEmbedding(prompt);
        const session = driver.session();
        try {
          const vecRes = await session.run(
            `
            CALL db.index.vector.queryNodes('file_embeddings', $limit, $embedding)
            YIELD node, score
            RETURN node.name AS filename, coalesce(node.text, node.name) AS content, score
            `,
            { embedding, limit: neo4j.int(ragLimit) }
          );
          vectorResults = vecRes.records.map(r => r.toObject());
        } finally {
          await session.close();
        }
      } catch (err) {
        console.warn("Vector search failed during chat:", err);
      }

      const contextStr = vectorResults.length > 0 
        ? "\n\nRetrieved Unstructured Document Context:\n" + vectorResults.map(r => `--- File: ${r.filename} (Similarity Score: ${r.score.toFixed(3)}) ---\n${r.content}`).join("\n\n")
        : "";

      // Dynamic reasoning mapping
      const baseReasoning = reasoning === "high" ? "medium" : "low";
      const finalReasoning = reasoning === "low" ? "medium" : "high";

      // Step 1: Coordinator Agent Plan Formulation
      const coordinatorPlanSystem = `You are the Coordinator of a supply chain multi-agent team.
Based on the user's question and any retrieved unstructured documents, state your high-level strategy and what data we need to query from the graph database.
Keep it extremely brief (1-2 sentences max, no bullet points).`;
      
      const coordinatorPlan = await callLLM(coordinatorPlanSystem, `User query: "${prompt}"${contextStr}`, 0.3, baseReasoning);
      console.log("[Agent: Coordinator] Plan:", coordinatorPlan);

      // Step 2: Database Agent (Cypher Specialist)
      const cypherSystem = `You are a Neo4j Cypher query generator for a supply chain lifecycle database.
Based on the user's question, write a Cypher query to retrieve the relevant data.
The database schema contains these nodes:
- ChargingStation {unit_id, serial_number, product_variant, manufacture_date, country, installation_site_id}
- Process {unit_id, process_id, process_name, lifecycle_phase, start_date, end_date, duration_days, status, cost_eur}
- Actor {actor_id, actor_name, region, country}
- Location {location_code, location_name, country}
- Transport {transport_id, unit_id, route_from, route_to, mode, distance_km, cost_eur}

Relationships:
- (cs:ChargingStation)-[:UNDERGOES]->(p:Process)
- (p:Process)-[:EXECUTED_BY]->(a:Actor)
- (cs:ChargingStation)-[:LOCATED_IN]->(l:Location)
- (t:Transport)-[:FOR_UNIT]->(cs:ChargingStation)

Output ONLY the raw Cypher query inside a \`\`\`cypher code block. Do not write explanations.`;

      const cypherOutput = await callLLM(cypherSystem, prompt, 0.1, baseReasoning);
      const blockMatch = cypherOutput.match(/```cypher\s*([\s\S]*?)```/);
      const cypherQuery = blockMatch ? blockMatch[1].trim() : cypherOutput.trim();
      console.log("[Agent: Database Specialist] Generated Cypher:", cypherQuery);

      // Run Cypher query
      let dbResults = null;
      let dbError = null;
      if (cypherQuery && !cypherQuery.toLowerCase().includes("delete") && !cypherQuery.toLowerCase().includes("create") && !cypherQuery.toLowerCase().includes("merge")) {
        const session = driver.session();
        try {
          const queryRes = await session.run(cypherQuery);
          dbResults = queryRes.records.map(r => r.toObject());
          dbResults = convertNeo4jTypes(dbResults);
        } catch (err: any) {
          console.warn("Generated Cypher failed:", err.message);
          dbError = err.message;
        } finally {
          await session.close();
        }
      }

      // Step 3: Operations Specialist analysis
      const opsSystem = `You are the Operations & Logistics Specialist.
Analyze the user's question, retrieved database records, and unstructured document context.
Focus on lead times, process durations, bottleneck phases, transportation modes, and locations.
Provide a concise bulleted summary of operational insights (1-3 bullets max).`;
      
      const opsPrompt = `User Query: "${prompt}"
Retrieved Database Records: ${JSON.stringify(dbResults || (dbError ? `Error: ${dbError}` : "No records found"))}${contextStr}`;
      
      const opsAnalysis = await callLLM(opsSystem, opsPrompt, 0.5, baseReasoning);
      console.log("[Agent: Operations Specialist] Analysis:", opsAnalysis);

      // Step 4: Finance & Risk Specialist analysis
      const financeSystem = `You are the Finance & Risk Specialist.
Analyze the user's question, retrieved database records, and unstructured document context.
Focus on cost distributions, spend optimization, single-source dependency risks, and financial efficiency.
Provide a concise bulleted summary of financial/risk insights (1-3 bullets max).`;
      
      const financePrompt = `User Query: "${prompt}"
Retrieved Database Records: ${JSON.stringify(dbResults || (dbError ? `Error: ${dbError}` : "No records found"))}${contextStr}`;
      
      const financeAnalysis = await callLLM(financeSystem, financePrompt, 0.5, baseReasoning);
      console.log("[Agent: Finance Specialist] Analysis:", financeAnalysis);

      // Step 5: Coordinator Final Synthesis
      const synthesisSystem = `You are the Lead Supply Chain Strategy Consultant.
Synthesize the findings from the Operations Specialist and the Finance & Risk Specialist, incorporating relevant insights from the unstructured documents.
Write a premium, comprehensive strategic response to the user's question.
Use tables and formatted markdown. Conclude with actionable recommendations.`;

      const synthesisPrompt = `User Question: "${prompt}"
Database Results: ${JSON.stringify(dbResults || "None")}
Operations Specialist Insights: ${opsAnalysis}
Finance & Risk Specialist Insights: ${financeAnalysis}${contextStr}`;

      const finalResponse = await callLLM(synthesisSystem, synthesisPrompt, 0.7, finalReasoning);
      console.log("[Agent: Coordinator] Final Response length:", finalResponse.length);

      // Construct dynamic evidence graph
      const evidenceGraph = dbResults ? extractGraphFromRecords(dbResults) : { nodes: [], edges: [] };

      // Compile tools used trace log
      const toolsUsed = [
        {
          id: "coordinator_plan",
          name: "Coordinator Agent: Plan Formulation",
          status: "success" as const,
          inputSummary: prompt,
          outputSummary: coordinatorPlan
        },
        {
          id: "cypher_generator",
          name: "Database Specialist: Cypher Generation",
          status: dbError ? ("error" as const) : ("success" as const),
          inputSummary: prompt,
          outputSummary: `Generated Cypher Query:\n\`\`\`cypher\n${cypherQuery}\n\`\`\`\n` + (dbError ? `Error: ${dbError}` : `Retrieved ${dbResults ? dbResults.length : 0} matching records from Neo4j.`)
        },
        {
          id: "ops_specialist",
          name: "Operations Specialist Analysis",
          status: "success" as const,
          inputSummary: `Query: ${prompt}\nDatabase Results: ${JSON.stringify(dbResults || "None")}`,
          outputSummary: opsAnalysis
        },
        {
          id: "finance_specialist",
          name: "Finance Specialist Analysis",
          status: "success" as const,
          inputSummary: `Query: ${prompt}\nDatabase Results: ${JSON.stringify(dbResults || "None")}`,
          outputSummary: financeAnalysis
        }
      ];

      if (vectorResults.length > 0) {
        toolsUsed.unshift({
          id: "vector_search",
          name: "Vector Search (Unstructured RAG)",
          status: "success" as const,
          inputSummary: prompt,
          outputSummary: `Found ${vectorResults.length} matching unstructured documents.`
        });
      }

      const sourceChunks = vectorResults.map((r, idx) => ({
        id: `chunk_${idx}`,
        documentName: r.filename || "Unknown Document",
        text: r.content || ""
      }));

      const cypherQueries = cypherQuery ? [{ query: cypherQuery }] : [];

      let tableColumns: string[] | undefined = undefined;
      let tableRows: any[] | undefined = undefined;

      if (dbResults && dbResults.length > 0) {
        const cols = new Set<string>();
        dbResults.forEach((row: any) => {
          Object.keys(row).forEach(k => cols.add(k));
        });
        tableColumns = Array.from(cols);
        tableRows = dbResults;
      }

      res.json({
        messageId: crypto.randomUUID(),
        answer: finalResponse,
        tableColumns,
        tableRows,
        evidenceGraph,
        evidenceTrace: {
          toolsUsed,
          cypherQueries,
          accessedNodes: evidenceGraph.nodes,
          sourceChunks
        }
      });
    } catch (err: any) {
      console.error("[Multi-Agent Chat] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  });

  
  // Setup Streamable HTTP Server Transport
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  });

  mcpServer.connect(transport).catch((err) => {
    console.error("Failed to connect Streamable HTTP transport:", err);
  });

  app.all("/sse", async (req, res) => {
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (err: any) {
      console.error("Error handling Streamable HTTP request on /sse:", err);
      if (!res.headersSent) {
        res.status(500).send(err.message);
      }
    }
  });

  app.all("/messages", async (req, res) => {
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (err: any) {
      console.error("Error handling Streamable HTTP request on /messages:", err);
      if (!res.headersSent) {
        res.status(500).send(err.message);
      }
    }
  });

  const port = process.env.PORT || 8000;
  const server = app.listen(port, () => {
    console.log(`Supply Chain MCP Server listening on http://localhost:${port}`);
    console.log(`SSE Route: http://localhost:${port}/sse`);
    console.log(`Message Route: http://localhost:${port}/messages`);
    
    // Initialize embeddings on startup
    initializeEmbeddings().then(() => {
      console.log("[Embedding Startup] Done initializing vector embeddings.");
    }).catch(err => {
      console.error("[Embedding Startup] Error initializing embeddings:", err);
    });
  });

  // Graceful shutdown
  async function handleShutdown() {
    console.log("Shutting down MCP server...");
    server.close(async () => {
      await closeNeo4jDriver();
      console.log("MCP Server connections released. Exiting.");
      process.exit(0);
    });
  }

  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
}
