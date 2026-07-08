import { Router } from "express";
import neo4j from "neo4j-driver";
import crypto from "crypto";
import { getNeo4jDriver, getDatabaseSchema } from "../neo4j-client.js";
import { convertNeo4jTypes } from "../utils.js";
import { getEmbedding, isMockEmbedding } from "../services/embedding.js";

const router = Router();

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
  
  // Find fallback ID property from keys ending in '_id' or '_code'
  let fallbackId = "";
  let fallbackName = "";
  for (const k of Object.keys(props)) {
    if (!fallbackId && (k.endsWith("_id") || k.endsWith("_code"))) {
      fallbackId = props[k];
    }
    if (!fallbackName && (k.endsWith("_name") || k === "title" || k === "serial_number")) {
      fallbackName = props[k];
    }
  }

  const id = props.actor_id || props.location_code || props.unit_id || props.material_id || props.process_id || props.canonical_id || props.id || fallbackId || getNeo4jId(node) || "unknown";
  const label = node.labels[0] || "Entity";
  const name = props.name || props.actor_name || props.location_name || props.material_name || props.serial_number || props.process_name || fallbackName || id;
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
    const errText = await res.text().catch(() => "");
    throw new Error(`LLM call failed with status ${res.status}: ${errText.slice(0, 150)}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content || "No output generated by LLM.";
}

// Multi-Agent Chat Strategy Assistant (Guided Cypher Generator + RAG + Multi-Agent Team)
router.post(["/chat", "/api/chat"], async (req, res) => {
  const prompt = req.body.question || req.body.prompt || req.body.message;
  const reasoning = req.body.reasoning || "low";
  const ragLimit = Number(req.body.ragLimit) || 3;

  if (!prompt) {
    return res.status(400).json({ error: "question or prompt is required" });
  }

  const driver = getNeo4jDriver();

  try {
    console.log(`[Multi-Agent Chat] Received question: "${prompt}" (Reasoning: ${reasoning}, RAG Limit: ${ragLimit})`);
    
    let vectorResults: any[] = [];
    try {
      const embedding = await getEmbedding(prompt);
      const session = driver.session();
      try {
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
        
        let vecRes = await session.executeRead(tx => tx.run(chunkQuery, { embedding, limit: neo4j.int(ragLimit) })).catch(() => null);
        if (!vecRes || vecRes.records.length === 0) {
          vecRes = await session.executeRead(tx => tx.run(fileQuery, { embedding, limit: neo4j.int(ragLimit) }));
        }
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

    const baseReasoning = reasoning === "high" ? "medium" : "low";
    const finalReasoning = reasoning === "low" ? "medium" : "high";

    const coordinatorPlanSystem = `You are the Coordinator of a supply chain multi-agent team.
Based on the user's question and any retrieved unstructured documents, state your high-level strategy and what data we need to query from the graph database.
Keep it extremely brief (1-2 sentences max, no bullet points).`;
    
    const coordinatorPlan = await callLLM(coordinatorPlanSystem, `User query: "${prompt}"${contextStr}`, 0.3, baseReasoning);
    console.log("[Agent: Coordinator] Plan:", coordinatorPlan);

    const activeSchema = await getDatabaseSchema(driver);

    const cypherSystem = `You are a Neo4j Cypher query generator for a supply chain lifecycle database.
Based on the user's question, write a Cypher query to retrieve the relevant data.
${activeSchema}

Output ONLY the raw Cypher query inside a \`\`\`cypher code block. Do not write explanations.`;

    const cypherOutput = await callLLM(cypherSystem, prompt, 0.1, baseReasoning);
    const blockMatch = cypherOutput.match(/```cypher\s*([\s\S]*?)```/);
    const cypherQuery = blockMatch ? blockMatch[1].trim() : cypherOutput.trim();
    console.log("[Agent: Database Specialist] Generated Cypher:", cypherQuery);

    let dbResults = null;
    let dbError = null;
    if (cypherQuery && !cypherQuery.toLowerCase().includes("delete") && !cypherQuery.toLowerCase().includes("create") && !cypherQuery.toLowerCase().includes("merge")) {
      const session = driver.session();
      try {
        const queryRes = await session.executeRead(tx => tx.run(cypherQuery));
        dbResults = queryRes.records.map(r => r.toObject());
        dbResults = convertNeo4jTypes(dbResults);
      } catch (err: any) {
        console.warn("Generated Cypher failed:", err.message);
        dbError = err.message;
      } finally {
        await session.close();
      }
    }

    const opsSystem = `You are the Operations & Logistics Specialist.
Analyze the user's question, retrieved database records, and unstructured document context.
Focus on lead times, process durations, bottleneck phases, transportation modes, and locations.
Provide a concise bulleted summary of operational insights (1-3 bullets max).`;
    
    const opsPrompt = `User Query: "${prompt}"
Retrieved Database Records: ${JSON.stringify(dbResults || (dbError ? `Error: ${dbError}` : "No records found"))}${contextStr}`;
    
    const opsAnalysis = await callLLM(opsSystem, opsPrompt, 0.5, baseReasoning);
    console.log("[Agent: Operations Specialist] Analysis:", opsAnalysis);

    const financeSystem = `You are the Finance & Risk Specialist.
Analyze the user's question, retrieved database records, and unstructured document context.
Focus on cost distributions, spend optimization, single-source dependency risks, and financial efficiency.
Provide a concise bulleted summary of financial/risk insights (1-3 bullets max).`;
    
    const financePrompt = `User Query: "${prompt}"
Retrieved Database Records: ${JSON.stringify(dbResults || (dbError ? `Error: ${dbError}` : "No records found"))}${contextStr}`;
    
    const financeAnalysis = await callLLM(financeSystem, financePrompt, 0.5, baseReasoning);
    console.log("[Agent: Finance Specialist] Analysis:", financeAnalysis);

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

    const evidenceGraph = dbResults ? extractGraphFromRecords(dbResults) : { nodes: [], edges: [] };

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
      embeddingMode: isMockEmbedding() ? "fallback" : "gemini",
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

export default router;
