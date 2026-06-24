# Supply Chain Consultant Platform — Future Phases & Implementation Guide

This document outlines the next stages of development for the EV-Charger Supply Chain Consultant project. It is structured so that a subsequent AI Agent or developer can pick up work immediately.

---

## Phase 5: Vector Embeddings & Semantic Search in Neo4j

### Objective
Incorporate text embeddings to enable hybrid search (combining structured Cypher matches with semantic search over unstructured document nodes like VDE quality reports and incident logs).

### Proposed Tasks
1. **Add Vector Indexes**: Declare vector indexes on unstructured node types:
   ```cypher
   CREATE VECTOR INDEX file_embeddings IF NOT EXISTS
   FOR (f:ProcessedFile) ON (f.embedding)
   OPTIONS {indexConfig: {
     `vector.dimensions`: 1536,
     `vector.similarity-function`: 'cosine'
   }};
   ```
2. **Configure Embeddings Ingestion in n8n**:
   - Update the `07_LLM_Entity_Extraction_v3_HTTP` workflow to include a Google Gemini Embedding node.
   - For unstructured text chunks, call the Gemini Embedding API to generate a `1536`-dimensional vector (using model `text-embedding-004`).
   - Store the vector directly on the node properties (e.g. `p.embedding = $vector`).
3. **Extend MCP Tools**:
   - Add a `vector-search` tool to the MCP server.
   - Example query:
     ```cypher
     CALL db.index.vector.queryNodes('file_embeddings', 5, $queryEmbedding)
     YIELD node, score
     RETURN node.name AS file, node.text AS snippet, score;
     ```

---

## Phase 6: Agentic RAG Loop

### Objective
Migrate the multi-agent orchestration logic from the Express server node calls to a dedicated, stateful n8n AI Agent workflow.

### Proposed Tasks
1. **Create an n8n Agent Workflow**:
   - Add an n8n **AI Agent** node triggered by a Webhook (`POST /api/chat/agentic`).
   - Connect the AI Agent node to a **Window Buffer Memory** node to support chat history.
   - Define custom tools inside n8n:
     - **Neo4j Cypher Tool**: Executes read-only queries against `neo4j-supply-chain`.
     - **Knowledge Graph Info Tool**: Fetches schema details.
     - **Sub-graph Visualization Tool**: Extracts adjacent nodes for the UI.
2. **Design the Agentic Reason-Act-Observe Loop**:
   - Program the agent to iteratively query the graph database to verify facts before formulating strategic suggestions.
   - Integrate automated error-recovery (e.g. if a generated Cypher query fails, feed the error message back to the agent so it can self-correct).

---

## Phase 7: Enhanced Visualization & Analytics

### Objective
Upgrade the frontend UI to display interactive nodes and heatmaps, rather than static diagrams and simple lists.

### Proposed Tasks
1. **Interactive Cytoscape.js/D3.js Network Explorer**:
   - Upgrade the current network explorer (which renders simple node connections) to use Cytoscape.js or D3.js force-directed layouts.
   - Support clicking nodes to show their property cards.
   - Implement filtering options (e.g. hide all `Process` nodes, show only `Actor` and `Transport` nodes).
2. **Cost Heatmaps**:
   - Create a dashboard heatmap component showing financial spend by country or lifecycle stage.
   - Query:
     ```cypher
     MATCH (p:Process)<-[:UNDERGOES]-(cs:ChargingStation)
     RETURN p.lifecycle_phase, SUM(p.cost_eur) AS total_spend
     ORDER BY total_spend DESC;
     ```
3. **Mermaid live-previewer**:
   - Build a tab in the UI that compiles PlantUML results to SVG using a public PlantUML render server or Mermaid.js live compile.

---

## Phase 8: Production Hardening & Operations

### Objective
Prepare the platform for deployment by adding security, monitoring, and robust CI/CD.

### Proposed Tasks
1. **Authentication & CORS security**:
   - Enforce authentication on all `/api/` endpoints (e.g. JWT-based authentication for consultants).
   - Configure strict CORS options in Express:
     ```javascript
     app.use(cors({
       origin: process.env.ALLOWED_ORIGINS?.split(",") || "http://localhost:3000"
     }));
     ```
2. **LLM Cost & Rate-limit Monitoring**:
   - Log tokens consumed per strategic chat invocation.
   - Add local caching for repeated user prompts to reduce inference API costs.
3. **CI/CD Pipeline**:
   - Create a GitHub Action to run build and syntax checks on the MCP server.
   - Add unit tests for Cypher query validation.
