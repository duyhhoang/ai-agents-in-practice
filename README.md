# GenAI Agents for Supply Chain Analysis

**University:** Technical University of Munich (TUM)  
**Course:** AI Agents in Practice (Practical Course)  
**Project:** 19 - GenAI-Agents for Supply Chain Analysis  
**Student:** Vora Khushi, Hoang Duy (Information Systems B.Sc.)  
**Status:** Phase 4/8 Complete - Next Phase: Phase 5 (Vector Store & Embeddings)

---

## 🎯 Project Goal

Build an **agentic data pipeline** that processes heterogeneous supply chain data (text, diagrams, CSVs) to:
1. Extract key concepts and relationships
2. Map to Neo4j knowledge graph
3. Enable semantic analysis and bottleneck identification
4. Support consultant-grade strategy insights

---

## 📚 Documentation Navigation

This project's documentation includes:

1. **[README.md](file:///c:/Users/hoang/OneDrive%20-%20TUM/Uni/26%20SS/AI%20Agents%20in%20Practice/README.md) (You are here)**: Project overview, goals, architecture, and current status.
2. **[PROJECT_DOCUMENTATION.md](file:///c:/Users/hoang/OneDrive%20-%20TUM/Uni/26%20SS/AI%20Agents%20in%20Practice/PROJECT_DOCUMENTATION.md)**: Main developer & operational guide covering Docker, Neo4j Graph schema, n8n ingestion logic, MCP API, and troubleshooting.
3. **[NEXT_STEPS.md](file:///c:/Users/hoang/OneDrive%20-%20TUM/Uni/26%20SS/AI%20Agents%20in%20Practice/NEXT_STEPS.md)**: Clear implementation guide for upcoming phases (Vector search, stateful agentic RAG, advanced visualization).
4. **[SETUP_GUIDE.md](file:///c:/Users/hoang/OneDrive%20-%20TUM/Uni/26%20SS/AI%20Agents%20in%20Practice/SETUP_GUIDE.md)**: Step-by-step guide for manually setting up Neo4j schema and CSV workflows.
5. **[DATA_REFERENCE.md](file:///c:/Users/hoang/OneDrive%20-%20TUM/Uni/26%20SS/AI%20Agents%20in%20Practice/DATA_REFERENCE.md)**: Detailed files description and Neo4j Cypher analytics queries.

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
| **Orchestration** | n8n | 2.26.4 (Latest Stable) | ✅ Running |
| **Knowledge Graph** | Neo4j | 5.26-community | ✅ Running |
| **Vector Store** | Neo4j native | 5.26-community | ✅ Ready |
| **LLM (Primary)** | Gemini | Latest | ✅ Configured |
| **LLM (Backup)** | OpenAI/Claude | Latest | ✅ Available |
| **MCP Server** | Node.js + TypeScript | 18+ | ✅ Running |
| **Diagram Gen** | PlantUML | Latest (monochrome false) | ✅ Running |

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
| **2** | Data Ingestion Layer | Week 2-3 | ✅ Complete |
| **3** | Knowledge Graph Population | Week 3-4 | ✅ Complete (680 nodes, 2122 edges) |
| **4** | Custom MCP Server & UI | Week 4-5 | ✅ Complete |
| **5** | Vector Store & Embeddings | Week 5-6 | ⏳ Planned |
| **6** | Agentic RAG Layer | Week 6-7 | ⏳ Planned |
| **7** | Visualization & Analytics | Week 7-8 | ⏳ Planned |
| **8** | Optimization & QA | Week 8+ | ⏳ Planned |

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
