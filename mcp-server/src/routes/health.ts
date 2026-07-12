import { Router } from "express";
import { getNeo4jDriver } from "../neo4j-client.js";

const router = Router();

// Health check endpoint
router.get("/health", async (req, res) => {
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
    await session.executeRead((tx) => tx.run("RETURN 1 AS ok"));
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
  const apiKey = process.env.CLUSTER_API_KEY;
  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    const llmRes = await fetch(`${inferenceUrl}/models`, { headers, signal: AbortSignal.timeout(5000) });
    health.services.llm_cluster = { status: llmRes.ok ? "ok" : "error", message: `HTTP ${llmRes.status}` };
  } catch {
    health.services.llm_cluster = { status: "offline", message: "Cannot reach LLM inference cluster" };
  }

  const httpStatus = health.status === "ok" ? 200 : 503;
  res.status(httpStatus).json(health);
});

export default router;
