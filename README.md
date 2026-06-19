# GenAI Agents for Supply Chain Analysis

**University:** Technical University of Munich (TUM)  
**Course:** AI Agents in Practice (Practical Course)  
**Project:** 19 - GenAI-Agents for Supply Chain Analysis  
**Student:** Vora Khushi, Hoang Duy (Information Systems B.Sc.)  
**Status:** Phase 1/8 - Infrastructure Setup (In Progress)

---

## 🎯 Project Goal

Build an **agentic data pipeline** that processes heterogeneous supply chain data (text, diagrams, CSVs) to:
1. Extract key concepts and relationships
2. Map to Neo4j knowledge graph
3. Enable semantic analysis and bottleneck identification
4. Support consultant-grade strategy insights

---

## 📚 Documentation Navigation

This project's documentation has been consolidated into three core files for clarity:

1. **`README.md` (You are here)**: Project overview, goals, architecture, and current status.
2. **`SETUP_GUIDE.md`**: Step-by-step instructions for initializing the Neo4j schema and building the n8n data ingestion workflows.
3. **`DATA_REFERENCE.md`**: Details on the dataset (CSV files, unstructured data) and a comprehensive library of Neo4j Cypher queries for analysis and AI agent training.

---

## 🏗️ Architecture Overview

```text
Input Data (CSV/PDF/Text/Images)
    ↓
Data Ingestion Layer (n8n)
    ↓
Extraction & Chunking
    ↓
Entity & Relationship Extraction (Gemini)
    ↓
Neo4j Knowledge Graph
    ↓
Vector Embeddings (Gemini API)
    ↓
MCP Server (Custom Tools)
    ├── Graph Queries
    ├── Subgraph Extraction
    ├── Diagram Generation (PlantUML)
    └── Analytics (Bottleneck Detection)
    ↓
Agentic RAG Loop
    ↓
Insights & Strategy Report
```

---

## 🛠️ Tech Stack

| Layer | Technology | Version | Status |
|-------|-----------|---------|--------|
| **Orchestration** | n8n | Latest | ✅ Running |
| **Knowledge Graph** | Neo4j | 5.15 Community | ✅ Running |
| **Vector Store** | Neo4j native | 5.13+ | ✅ Ready |
| **LLM (Primary)** | Gemini | Latest | ✅ Configured |
| **LLM (Backup)** | OpenAI/Claude | Latest | ✅ Available |
| **MCP Server** | Node.js + TypeScript | 18+ | ⏳ Next Phase |
| **Diagram Gen** | PlantUML | Latest | ⏳ Next Phase |

---

## 🔑 Key Design Decisions

1. **Data Format Agnostic Approach:** The pipeline is designed to work with CSV, PDF, text, and images interchangeably. This provides future flexibility for production use.
2. **Neo4j Native Vectors:** Using Neo4j 5.13+ built-in vector store instead of a separate vector database to simplify architecture and improve performance.
3. **Custom MCP Server:** A custom implementation with 4 core tools (`graph-query`, `subgraph-extract`, `diagram-generate`, `analytics`) tailored for the supply chain domain.
4. **Full Lifecycle Dataset:** We have opted to proceed with a full 25-process lifecycle scope (Manufacturing → Assembly → Distribution → Installation → Use → End-of-Life) as it provides a rich learning opportunity for multi-stage AI agents.

---

## 🎯 Implementation Phases

| Phase | Focus | Timeline | Status |
|-------|-------|----------|--------|
| **1** | Infrastructure Setup | Week 1-2 | ✅ Complete |
| **2** | Data Ingestion Layer | Week 2-3 | ⏳ In Progress |
| **3** | Knowledge Graph Population | Week 3-4 | 0% |
| **4** | Custom MCP Server | Week 4-5 | 0% |
| **5** | Vector Store & Embeddings | Week 5-6 | 0% |
| **6** | Agentic RAG Layer | Week 6-7 | 0% |
| **7** | Visualization & Analytics | Week 7-8 | 0% |
| **8** | Optimization & QA | Week 8+ | 0% |

---

## 🔌 API Connections

### Neo4j (Knowledge Graph)
```
Host: localhost
Port: 7687 (Bolt)
Auth: neo4j / neo4jPASSWORD
Database: neo4j
Browser: http://localhost:7474
```

### n8n (Orchestration)
```
URL: http://localhost:5678
LLM: Gemini API (configured in credentials)
Workflow Trigger: Manual or scheduled
```

---

## 🚀 Next Steps

Please proceed to the [**SETUP_GUIDE.md**](./SETUP_GUIDE.md) to initialize the Neo4j schema and begin importing the data using n8n workflows.
