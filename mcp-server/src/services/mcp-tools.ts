import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import neo4j from "neo4j-driver";
import { getNeo4jDriver } from "../neo4j-client.js";
import { convertNeo4jTypes } from "../utils.js";
import { getEmbedding } from "./embedding.js";

export function registerMcpTools(mcpServer: Server): void {
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
        },
        {
          name: "schema-inspect",
          description: "Inspect the Neo4j graph database schema, returning available node labels, relationship types, and property keys",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "file-list",
          description: "List all ingested files with their names, MD5 hashes, and vector embedding status",
          inputSchema: { type: "object", properties: {} }
        },
        {
          name: "ingest-file",
          description: "Trigger the n8n data ingestion pipeline programmatically via MCP",
          inputSchema: { type: "object", properties: {} }
        }
      ]
    };
  });

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const driver = getNeo4jDriver();

    try {
      if (name === "graph-query") {
        const query = args?.query as string;
        const params = (args?.params as Record<string, any>) || {};
        const readOnly = args?.read_only !== false;

        const session = driver.session();
        const startTime = Date.now();
        try {
          let result;
          if (readOnly) {
            result = await session.executeRead(tx => tx.run(query, params));
          } else {
            result = await session.executeWrite(tx => tx.run(query, params));
          }
          const records = result.records.map(r => r.toObject());
          const cleaned = convertNeo4jTypes(records);
          const executionTimeMs = Date.now() - startTime;

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                records: cleaned,
                summary: {
                  record_count: cleaned.length,
                  execution_time_ms: executionTimeMs,
                  read_only: readOnly
                }
              }, null, 2)
            }]
          };
        } finally {
          await session.close();
        }
      }

      else if (name === "subgraph-extract") {
        const entity_id = args?.entity_id as string;
        const entity_type = args?.entity_type as string;
        const depth = (args?.depth as number) || 2;
        const unit_id = args?.unit_id as string;

        const session = driver.session();
        try {
          const idField = entity_type === "Actor" ? "actor_id" :
                          entity_type === "Location" ? "location_code" :
                          entity_type === "ChargingStation" ? "unit_id" :
                          entity_type === "Process" ? "process_id" :
                          entity_type === "Material" ? "material_id" : "id";

          let matchClause = `MATCH (start:${entity_type} {${idField}: $entity_id})`;
          const queryParams: any = { entity_id, depth };
          if (entity_type === "Process" && unit_id) {
            const compoundId = `${unit_id}_${entity_id}`;
            matchClause = `MATCH (start:Process) WHERE start.canonical_id = $compoundId OR start.process_id = $compoundId OR (start.process_id = $entity_id AND start.unit_id = $unit_id)`;
            queryParams.compoundId = compoundId;
            queryParams.unit_id = unit_id;
          }

          const query = `
            ${matchClause}
            CALL apoc.path.subgraphAll(start, {
              maxLevel: $depth
            })
            YIELD nodes, relationships
            RETURN 
              [n IN nodes | {
                id: coalesce(n.actor_id, n.location_code, n.unit_id, n.material_id, n.process_id, n.id),
                label: labels(n)[0],
                name: coalesce(n.name, n.actor_name, n.location_name, n.material_name, n.serial_number, n.process_name, n.id),
                properties: properties(n)
              }] AS nodes,
              [r IN relationships | {
                source: coalesce(startNode(r).actor_id, startNode(r).location_code, startNode(r).unit_id, startNode(r).material_id, startNode(r).process_id, startNode(r).id),
                target: coalesce(endNode(r).actor_id, endNode(r).location_code, endNode(r).unit_id, endNode(r).material_id, endNode(r).process_id, endNode(r).id),
                type: type(r),
                properties: properties(r)
              }] AS relationships
          `;

          const result = await session.executeRead(tx => tx.run(query, queryParams));
          if (result.records.length > 0) {
            const record = result.records[0].toObject();
            return {
              content: [{
                type: "text",
                text: JSON.stringify(convertNeo4jTypes(record), null, 2)
              }]
            };
          } else {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ nodes: [], relationships: [] }, null, 2)
              }]
            };
          }
        } finally {
          await session.close();
        }
      }

      else if (name === "diagram-generate") {
        const nodes = args?.nodes as any[];
        const relationships = args?.relationships as any[];

        let puml = "@startuml\n";
        puml += "skinparam monochrome false\n";
        puml += "skinparam shadowing false\n\n";

        nodes.forEach(n => {
          const cleanId = n.id.replace(/[^a-zA-Z0-9_]/g, "_");
          const displayName = n.name || n.id;
          
          if (n.label === "Actor") puml += `actor "${displayName}" as ${cleanId}\n`;
          else if (n.label === "Location") puml += `boundary "${displayName}" as ${cleanId}\n`;
          else if (n.label === "ChargingStation") puml += `node "${displayName}" as ${cleanId}\n`;
          else if (n.label === "Process") puml += `control "${displayName}" as ${cleanId}\n`;
          else if (n.label === "Material") puml += `artifact "${displayName}" as ${cleanId}\n`;
          else puml += `entity "${displayName}" as ${cleanId}\n`;
        });

        puml += "\n";
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
                coalesce(n.name, n.actor_name, n.location_name, n.material_name, n.process_name, n.id) AS name,
                dependency_count AS in_degree
              ORDER BY in_degree DESC
              LIMIT 10
            `;
            const result = await session.executeRead(tx => tx.run(query));
            const records = result.records.map(r => r.toObject());
            const bottlenecks = convertNeo4jTypes(records);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ bottlenecks, metric: "Incoming Dependencies (In-Degree)" }, null, 2)
              }]
            };
          } 
          
          else if (type === "critical_path") {
            const query = `
              MATCH p = (start:ChargingStation)-[:UNDERGOES*1..6]->(end:Process)
              WHERE NOT (end)-[:UNDERGOES]->()
              RETURN 
                start.unit_id AS unit_id,
                [n IN nodes(p) | coalesce(n.process_id, n.unit_id)] AS process_path,
                length(p) AS path_length
              ORDER BY path_length DESC
              LIMIT 5
            `;
            const result = await session.executeRead(tx => tx.run(query));
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
            const result = await session.executeRead(tx => tx.run(query));
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
        const chunkQuery = `
          CALL db.index.vector.queryNodes('chunk_embeddings', $limit, $embedding)
          YIELD node, score
          RETURN node.file_name AS filename, node.index AS chunk_index, node.text AS content, score
        `;
        const fileQuery = `
          CALL db.index.vector.queryNodes('file_embeddings', $limit, $embedding)
          YIELD node, score
          RETURN node.name AS filename, 0 AS chunk_index, coalesce(node.text, node.name) AS content, score
        `;

        const session = driver.session();
        try {
          let result = await session.executeRead(tx => tx.run(chunkQuery, { limit, embedding })).catch(() => null);
          if (!result || result.records.length === 0) {
            result = await session.executeRead(tx => tx.run(fileQuery, { limit, embedding }));
          }
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

      else if (name === "schema-inspect") {
        const session = driver.session();
        try {
          const labelsRes = await session.executeRead(tx => tx.run("CALL db.labels() YIELD label RETURN label"));
          const relsRes = await session.executeRead(tx => tx.run("CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType"));
          const propsRes = await session.executeRead(tx => tx.run("CALL db.propertyKeys() YIELD propertyKey RETURN propertyKey"));
          
          const labels = labelsRes.records.map(r => r.get("label"));
          const relationshipTypes = relsRes.records.map(r => r.get("relationshipType"));
          const propertyKeys = propsRes.records.map(r => r.get("propertyKey"));

          return {
            content: [{
              type: "text",
              text: JSON.stringify({ labels, relationshipTypes, propertyKeys }, null, 2)
            }]
          };
        } finally {
          await session.close();
        }
      }

      else if (name === "file-list") {
        const session = driver.session();
        try {
          const res = await session.executeRead(tx => tx.run("MATCH (f:ProcessedFile) RETURN f.name AS name, f.hash AS hash, f.ingested_at AS ingested_at, f.embedding IS NOT NULL AS has_embedding"));
          const files = res.records.map(r => ({
            name: r.get("name"),
            hash: r.get("hash"),
            ingested_at: r.get("ingested_at"),
            has_embedding: r.get("has_embedding")
          }));
          return {
            content: [{
              type: "text",
              text: JSON.stringify({ total: files.length, files: convertNeo4jTypes(files) }, null, 2)
            }]
          };
        } finally {
          await session.close();
        }
      }

      else if (name === "ingest-file") {
        const webhookUrl = process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook/trigger-extraction";
        const startTime = Date.now();
        let n8nRes = await fetch(webhookUrl, { method: "POST" });
        if (!n8nRes.ok && n8nRes.status === 405) {
          n8nRes = await fetch(webhookUrl, { method: "GET" });
        }
        const duration = Date.now() - startTime;
        const data = await n8nRes.json().catch(() => ({}));
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: n8nRes.ok, duration_ms: duration, result: data }, null, 2)
          }]
        };
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
}
