# MCP Server Setup & Reference Guide

This guide describes how to configure, run, and connect the custom **Supply Chain Lifecycle Consultant MCP Server** to Model Context Protocol clients (such as Claude Desktop, Cursor, or n8n).

---

## 1. What is an MCP Server?

**MCP = Model Context Protocol**

An MCP server exposes custom tools that LLM agents (e.g. Claude Desktop, Cursor, or n8n workflows) can invoke to query databases or perform actions.

**Example:**
1. Model receives prompt: *"What are the bottleneck suppliers in our EV charger supply chain?"*
2. Model calls custom MCP tool: `graph-query` with a Cypher query.
3. MCP server executes query against the Neo4j database.
4. Model receives the results and synthesizes the final strategic response.

---

## 2. Implemented MCP Tools

The server hosts a high-performance, custom MCP implementation written in TypeScript that exposes the following **8 custom tools** for graph analysis and pipeline control:

| Tool | Parameters | Description |
| :--- | :--- | :--- |
| `graph-query` | `query` (string), `params` (object), `allow_write` (boolean) | Execute read-only Cypher queries (or mutations if `allow_write` is enabled). |
| `schema-inspect` | None | Retrieve the active Neo4j database schema dynamically (node labels, property keys, relationship types). |
| `subgraph-extract` | `entity_id` (string), `entity_type` (string), `depth` (number) | Extracts a localized subgraph around a starting node using APOC. |
| `diagram-generate` | `entity_id` (string), `entity_type` (string), `depth` (number) | Generates a PlantUML diagram representing a node's local subgraph. |
| `analytics` | `type` ("bottleneck_analysis" \| "critical_path" \| "centrality") | Computes graph algorithms: in-degree dependencies, path length, or overall centrality. |
| `vector-search` | `query` (string), `limit` (number) | Query unstructured RAG chunks from the Neo4j vector similarity index. |
| `file-list` | None | Lists raw files in the `data-processors/` directory. |
| `ingest-file` | `fileName` (string) | Triggers the async n8n background ingestion pipeline for a raw file. |

---

## 3. Configuration & Prerequisites

Make sure the backend environment has been configured in your `.env` file (copied from `.env.example`):
```bash
# Neo4j Database Configuration
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=neo4jPASSWORD

# Gemini API Key used for vector search embeddings
GEMINI_API_KEY=your-gemini-api-key-here
```

---

## 4. Running the MCP Server

The server can run in two transport modes: **stdio** (default for local CLI clients) and **SSE (Server-Sent Events)** (default for HTTP-based clients like n8n).

### Stdio Transport Mode (CLI/IDE integrations)
To run the server locally communicating over stdio:
```bash
cd mcp-server
npm run build
npm start -- --stdio
# Or in development watch mode:
npm run dev -- --stdio
```

### SSE Transport Mode (HTTP integrations)
To run the server in HTTP SSE mode (starts Express server on `PORT`):
```bash
cd mcp-server
npm run build
npm start
```
The server will start listening on port `8000`. SSE clients can connect to `http://localhost:8000/sse` and send messages to `http://localhost:8000/messages`.

---

## 5. Connecting to Clients

### Claude Desktop Integration
To connect this MCP server to Claude Desktop, edit your `claude_desktop_config.json` (located at `%APPDATA%\Claude\claude_desktop_config.json` on Windows or `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "supply-chain-mcp": {
      "command": "node",
      "args": [
        "c:/Users/hoang/OneDrive - TUM/Uni/26 SS/AI Agents in Practice/mcp-server/dist/index.js",
        "--stdio"
      ],
      "env": {
        "NEO4J_URI": "bolt://localhost:7687",
        "NEO4J_USER": "neo4j",
        "NEO4J_PASSWORD": "neo4jPASSWORD",
        "GEMINI_API_KEY": "your-gemini-api-key-here",
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

### Cursor Integration
To add the server in Cursor IDE:
1. Open Cursor **Settings** > **Features** > **MCP**.
2. Click **+ Add New MCP Server**.
3. Name: `Supply Chain MCP`
4. Type: `command`
5. Command: `node "c:/Users/hoang/OneDrive - TUM/Uni/26 SS/AI Agents in Practice/mcp-server/dist/index.js" --stdio`
6. Click **Save**.

### n8n Integration
The n8n Multi-Agent Chat Orchestrator interacts with the Express server routes. 
- General queries are dispatched via POST requests to `http://host.docker.internal:8000/api/query`.
- Webhook endpoints automatically receive results along with the dynamically fetched database schema (`schema`) to support data-agnostic prompts.

---

## 6. Security & Rate Limiting

- **Read-Only Enforcement**: By default, `graph-query` blocks mutating Cypher statements (such as `CREATE`, `MERGE`, `DELETE`, `SET`) to prevent accidental schema modifications, unless `allow_write` is explicitly set to `true`.
- **Rate Limiting**: When accessed over HTTP SSE, the server implements sliding-window rate limiting of **120 requests per minute per IP** to prevent abuse.
