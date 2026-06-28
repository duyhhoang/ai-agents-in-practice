# GenAI-Supported EV-Charger Supply Chain Lifecycle Consultant

**University:** Technical University of Munich (TUM)  
**Course:** AI Agents in Practice (Practical Course)  
**Project:** 19 - GenAI-Agents for Supply Chain Analysis  
**Students:** Khushi Vora, Duy Hoang (Information Systems B.Sc.)  
**Status:** Completed (Phases 1-8 Consolidated)

---

## 🎯 Project Overview

This platform implements an **agentic supply chain pipeline** that processes heterogeneous lifecycle data (CSV execution logs, transport spreadsheets, technician notes, incident logs, VDE quality audit reports) to:
1. Extract semantic entities and relationships using a robust n8n double-LLM resolution workflow.
2. Build an interactive **Neo4j Knowledge Graph** representing the EV-charger lifecycle.
3. Index unstructured documents with a native Neo4j **Vector Similarity Search** for semantic RAG.
4. Orchestrate a **Multi-Agent Consultant Team** (Coordinator, Database Specialist, Operations Auditor, Finance Risk Specialist) via Express & Next.js to deliver strategical supply chain consulting reports with interactive Cytoscape network diagrams.

---

## 🏗️ Folder Structure

```text
├── data-processors/      # Folder containing raw CSVs, unstructured text reports, and PDFs
├── frontend/             # Next.js React frontend dashboard (Port 3000)
├── mcp-server/           # Custom Express backend server and MCP standard tools (Port 8000)
├── n8n-workflows/        # Exported JSON and markdown workflow configurations (Port 5678)
├── neo4j/                # Initialization Cypher queries and constraints scripts
├── docker-compose.yml    # Docker services orchestration (Neo4j & n8n)
├── README.md             # This folder-level index & deployment guide
├── PROJECT_DOCUMENTATION.md # Academic master reference guide & university exam preparation Q&As
└── walkthrough.md        # Operations walkthrough with screenshot and video verifications
```

---

## 🚀 Quick Start Guide

Follow these steps to deploy and run the entire platform on your local machine:

### 1. Launch Docker Infrastructure (Neo4j & n8n)
Start the background services using Docker Compose:
```bash
docker compose up -d
```
*Verification*: Ensure both containers are healthy:
- Neo4j Web Console: http://localhost:7474 (credentials: `neo4j` / `neo4jPASSWORD`)
- n8n Workflow Panel: http://localhost:5678 (workflow `07_LLM_Entity_Extraction_v3_HTTP` is active)

### 2. Launch Express Backend Server
Navigate to the `mcp-server` directory, install packages, and start the server:
```bash
cd mcp-server
npm install
powershell -ExecutionPolicy Bypass -Command "npx tsx src/index.ts"
```
*Expected Startup Logs*:
```text
Supply Chain MCP Server listening on http://localhost:8000
[Embedding Init] Initializing vector embeddings...
[Embedding Init] Vector index 'file_embeddings' verified.
[Embedding Init] Found 12 ProcessedFile nodes in Neo4j.
[Embedding Init] Updated 12 files with vector embeddings.
[Embedding Startup] Done initializing vector embeddings.
```

### 3. Launch Next.js Frontend Dashboard
In a new terminal window, navigate to the `frontend` directory, install packages, and start the dev server:
```bash
cd frontend
npm install
powershell -ExecutionPolicy Bypass -Command "npm run dev"
```
Direct Next.js run if shell wrappers fail:
```bash
node node_modules/next/dist/bin/next dev
```
*Access URL*: Open your browser and navigate to **http://localhost:3000** to interact with the console.

---

## 📚 Essential Reading

To understand the codebase in detail, prepare for university evaluations, and see system execution records, read these files in order:
1. **[PROJECT_DOCUMENTATION.md](file:///c:/Users/hoang/OneDrive%20-%20TUM/Uni/26%20SS/AI%20Agents%20in%20Practice/PROJECT_DOCUMENTATION.md)**: Explains the GraphRAG pipeline, data structure, double-LLM resolution logic, local fallback unit vector math, and lists **high-yield exam prep Q&As**.
2. **[walkthrough.md](file:///c:/Users/hoang/OneDrive%20-%20TUM/Uni/26%20SS/AI%20Agents%20in%20Practice/walkthrough.md)**: Displays browser screens and video recordings verifying that chat queries retrieve GraphRAG data and render interactive Cytoscape network diagrams.
