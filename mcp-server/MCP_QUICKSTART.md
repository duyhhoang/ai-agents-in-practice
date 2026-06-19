# MCP Server Setup Guide

This guide helps you build a custom MCP server for supply chain analysis.

## What is an MCP Server?

**MCP = Model Context Protocol**

An MCP server exposes custom tools that AI models (Claude, Gemini, etc.) can call.

**Example:**
- Model: "What are the bottleneck suppliers in our RISC-V supply chain?"
- Model calls MCP tool: `graph-query` with Cypher query
- MCP server executes query against Neo4j
- Model receives results and synthesizes answer

---

## MCP Server Architecture

```
AI Model (Claude/Gemini via n8n)
    ↓
    calls MCP tool
    ↓
MCP Server (Node.js)
    ↓
    ├── graph-query         → Neo4j
    ├── subgraph-extract    → Neo4j
    ├── diagram-generate    → PlantUML
    └── analytics           → Analysis logic
```

---

## Tools to Implement (Phase 4)

### Tool 1: graph-query
**Purpose:** Execute arbitrary Cypher queries against Neo4j

**Input:**
```json
{
  "query": "MATCH (s:Supplier) RETURN s.name, count(s) LIMIT 10",
  "params": {}
}
```

**Output:**
```json
{
  "results": [
    { "s.name": "Chip Fab Inc", "count(s)": 5 },
    { "s.name": "Advanced Materials Ltd", "count(s)": 3 }
  ],
  "execution_time_ms": 125
}
```

---

### Tool 2: subgraph-extract
**Purpose:** Extract relevant subgraph around an entity

**Input:**
```json
{
  "entity_id": "supplier_001",
  "entity_type": "Supplier",
  "depth": 2
}
```

**Output:**
```json
{
  "nodes": [
    { "id": "supplier_001", "label": "Supplier", "properties": {...} },
    { "id": "product_001", "label": "Product", "properties": {...} }
  ],
  "relationships": [
    { "source": "supplier_001", "target": "product_001", "type": "SUPPLIES" }
  ]
}
```

---

### Tool 3: diagram-generate
**Purpose:** Generate PlantUML diagrams from subgraph

**Input:**
```json
{
  "nodes": [...],
  "relationships": [...],
  "diagram_type": "architecture" | "process" | "dependency"
}
```

**Output:**
```
@startuml
actor Supplier_001
artifact Product_001
Supplier_001 --> Product_001 : SUPPLIES
@enduml
```

---

### Tool 4: analytics
**Purpose:** Compute supply chain metrics (bottlenecks, criticality, etc.)

**Input:**
```json
{
  "analysis_type": "bottleneck_analysis" | "critical_path" | "centrality"
}
```

**Output:**
```json
{
  "bottleneck_nodes": [
    { "id": "supplier_001", "centrality_score": 0.95, "reason": "supplies 8/10 products" }
  ],
  "critical_path": ["supplier_001", "process_001", "product_001"],
  "recommendations": [...]
}
```

---

## Setup Steps (To do in Phase 4)

### 1. Initialize Project
```bash
cd mcp-server
npm init -y
npm install @modelcontextprotocol/sdk neo4j
npm install -D typescript @types/node
```

### 2. Create TypeScript Config
```bash
npx tsc --init
```

### 3. Implement Server Structure
```
src/
├── index.ts           # MCP server entry point
├── tools/
│   ├── graph-query.ts
│   ├── subgraph-extract.ts
│   ├── diagram-generate.ts
│   └── analytics.ts
└── neo4j-client.ts    # Neo4j connection pool
```

### 4. Build & Test
```bash
npm run build
npm run test
npm start
```

### 5. Connect to n8n
In n8n, add MCP Server connection:
```
Type: MCP Server
URL: http://localhost:3000
```

---

## Example: graph-query Tool

```typescript
// src/tools/graph-query.ts
import { createClient } from "neo4j-driver";

export async function graphQuery(query: string, params: Record<string, any>) {
  const driver = createClient({
    uri: "bolt://localhost:7687",
    auth: { username: "neo4j", password: "DuyHoang__2909" }
  });

  const session = driver.session();
  
  try {
    const result = await session.run(query, params);
    return {
      results: result.records.map(r => r.toObject()),
      execution_time_ms: result.summary.resultAvailableAfter.toNumber()
    };
  } finally {
    await session.close();
    await driver.close();
  }
}
```

---

## Next: n8n Integration

Once MCP server is running:

1. In n8n, add "MCP Server" node
2. Configure endpoint: `http://localhost:3000`
3. Select tool: `graph-query`
4. Input Cypher query
5. Execute

Example n8n workflow:
```
Manual Trigger
  ↓
Set Query: "MATCH (s:Supplier) RETURN s.name"
  ↓
MCP Server: graph-query
  ↓
Output: List of suppliers
```

---

## Deployment (Later)

When you move to cloud:
1. Deploy MCP server to cloud (e.g., AWS Lambda, Heroku)
2. Update n8n connection to cloud URL
3. Add authentication/API keys
4. Scale: Multiple MCP instances behind load balancer

---

**Status:** Ready to implement in Phase 4  
**Time Estimate:** 2-3 days  
**Complexity:** Medium (Neo4j querying + TypeScript basics)

