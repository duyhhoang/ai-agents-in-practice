import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getNeo4jDriver, closeNeo4jDriver } from "./neo4j-client.js";

dotenv.config();

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
  app.use(cors());
  app.use(express.json());

  // Global Request Logger
  app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url} - Headers: ${JSON.stringify(req.headers)}`);
    next();
  });
  
  // Setup SSE Transport routes
  const activeTransports = new Map<string, SSEServerTransport>();

  app.get("/sse", async (req, res) => {
    console.log("New SSE connection established.");
    const transport = new SSEServerTransport("/sse", res);
    const sessionId = transport.sessionId;
    activeTransports.set(sessionId, transport);
    
    transport.onclose = () => {
      console.log(`SSE connection closed for session: ${sessionId}`);
      activeTransports.delete(sessionId);
    };
    
    await mcpServer.connect(transport);
  });

  const handlePostMessage = async (req: express.Request, res: express.Response) => {
    let sessionId = (req.query.sessionId as string) || (req.headers["mcp-session-id"] as string);
    if (!sessionId && activeTransports.size === 1) {
      sessionId = activeTransports.keys().next().value as string;
    }
    if (!sessionId) {
      res.status(400).send("Missing sessionId parameter.");
      return;
    }
    const transport = activeTransports.get(sessionId);
    if (transport) {
      await transport.handlePostMessage(req, res, req.body);
    } else {
      res.status(400).send(`No active SSE session for ID: ${sessionId}`);
    }
  };

  app.post("/messages", handlePostMessage);
  app.post("/sse", handlePostMessage);

  const port = process.env.PORT || 3000;
  const server = app.listen(port, () => {
    console.log(`Supply Chain MCP Server listening on http://localhost:${port}`);
    console.log(`SSE Route: http://localhost:${port}/sse`);
    console.log(`Message Route: http://localhost:${port}/messages`);
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
