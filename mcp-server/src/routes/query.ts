import { Router } from "express";
import { getNeo4jDriver } from "../neo4j-client.js";
import { convertNeo4jTypes, isForbiddenCypherQuery } from "../utils.js";
import { getEmbedding, isMockEmbedding } from "../services/embedding.js";

const router = Router();

// Generic query endpoint for the frontend (with read-only enforcement)
router.post("/query", async (req, res) => {
  const { query, params, allow_write } = req.body;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Query must be a valid string." });
  }

  const hasMutation = isForbiddenCypherQuery(query);

  if (hasMutation && !allow_write) {
    return res.status(403).json({
      error: "Forbidden: Mutating Cypher operations (CREATE, MERGE, DELETE, SET, etc.) are blocked on /api/query for database security."
    });
  }

  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    let result;
    if (hasMutation && allow_write) {
      result = await session.executeWrite(tx => tx.run(query, params || {}));
    } else {
      result = await session.executeRead(tx => tx.run(query, params || {}));
    }
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
router.post("/subgraph", async (req, res) => {
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
    const result = await session.executeRead(tx => tx.run(query, { entity_id, depth: depth || 1 }));
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
router.post("/diagram", (req, res) => {
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

// Endpoint to calculate embeddings dynamically (Gemini or Mock fallback)
router.post("/embedding", async (req, res) => {
  const { text } = req.body;
  if (!text || typeof text !== "string") {
    return res.status(400).json({ error: "Text must be a valid string." });
  }
  try {
    const embedding = await getEmbedding(text);
    const mode = isMockEmbedding() ? "fallback" : "gemini";
    res.json({ embedding, embeddingMode: mode });
  } catch (err: any) {
    console.error("API Embedding error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
