import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import crypto from "crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { closeNeo4jDriver } from "./neo4j-client.js";
import { initializeEmbeddings } from "./services/embedding.js";
import { registerMcpTools } from "./services/mcp-tools.js";
import healthRouter from "./routes/health.js";
import queryRouter from "./routes/query.js";
import ingestionRouter from "./routes/ingestion.js";
import chatRouter from "./routes/chat.js";
import { cleanupStuckRunningExecutions } from "./services/execution-logger.js";


import { createRateLimiter } from "./services/rate-limiter.js";

dotenv.config();

const mcpServer = new Server({
  name: "supply-chain-mcp",
  version: "1.0.0",
}, {
  capabilities: {
    tools: {},
  },
});

// Register all MCP Protocol Tools
registerMcpTools(mcpServer);

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
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  // Rate Limiting Middleware for MCP Transports (Enhancement #4)
  const mcpRateLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 120,
    message: "MCP rate limit exceeded: maximum 120 requests per minute allowed."
  });
  app.use(["/sse", "/messages"], mcpRateLimiter);

  // Request Logger
  app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    next();
  });

  // Mount API & Feature Routes
  app.use("/", healthRouter);
  app.use("/api", queryRouter);
  app.use("/", ingestionRouter);
  app.use("/", chatRouter);

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

  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => {
    console.log(`Supply Chain MCP Server listening on port ${PORT}`);
    console.log(`- MCP Streamable HTTP endpoint: http://localhost:${PORT}/sse`);
    console.log(`- MCP Message endpoint: http://localhost:${PORT}/messages`);
    console.log(`- REST Query endpoint: http://localhost:${PORT}/api/query`);
    console.log(`- REST Health endpoint: http://localhost:${PORT}/api/health`);
    console.log(`- REST Ingestion Status endpoint: http://localhost:${PORT}/api/ingestion/status`);
    console.log(`- Multi-Agent Chat endpoint: http://localhost:${PORT}/chat`);
    
    // Initialize vector embeddings at startup
    initializeEmbeddings();

    // Clean up stuck running executions
    cleanupStuckRunningExecutions();
  });

  // Graceful shutdown
  async function handleShutdown() {
    console.log("Shutting down MCP Server...");
    await closeNeo4jDriver();
    process.exit(0);
  }
  process.on("SIGINT", handleShutdown);
  process.on("SIGTERM", handleShutdown);
}
