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

The server exposes the following **8 tools** for graph analysis and pipeline control:

| Tool | Parameters | Description |
| :--- | :--- | :--- |
| `graph-query` | `query` (string), `params` (object), `read_only` (boolean, default `true`) | Run a Cypher query in a read transaction, or a write transaction when `read_only` is `false`. |
| `schema-inspect` | None | List node labels, relationship types, and property keys. |
| `subgraph-extract` | `entity_id` (string), `entity_type` (string), `depth` (1-4), `unit_id` (optional, for `Process` nodes) | Extract the neighbourhood of a node using APOC `subgraphAll`. |
| `diagram-generate` | `nodes` (array), `relationships` (array) | Render nodes and relationships as PlantUML. |
| `analytics` | `analysis_type` (`bottleneck_analysis` \| `critical_path` \| `centrality`) | In-degree bottlenecks, longest process paths, or degree centrality. |
| `vector-search` | `query_text` (string), `limit` (number) | Semantic search over document chunks in the Neo4j vector index. |
| `file-list` | None | List ingested `ProcessedFile` nodes with hash and embedding status. |
| `ingest-file` | None | Trigger the n8n ingestion pipeline in the background. |

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
        "<absolute_path_to_project_root>/mcp-server/dist/index.js",
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
5. Command: `node "<absolute_path_to_project_root>/mcp-server/dist/index.js" --stdio`
6. Click **Save**.

### n8n Integration
The n8n Multi-Agent Chat Orchestrator interacts with the Express server routes. 
- General queries are dispatched via POST requests to `http://host.docker.internal:8000/api/query`.
- Webhook endpoints automatically receive results along with the dynamically fetched database schema (`schema`) to support data-agnostic prompts.

---

## 6. Security & Rate Limiting

- **Read-only by default**: the `graph-query` tool runs in a read transaction unless `read_only` is `false`. The REST endpoint `POST /api/query` additionally rejects mutating keywords (`CREATE`, `MERGE`, `DELETE`, `SET`, ...) unless `allow_write: true` is passed.
- **Rate Limiting**: When accessed over HTTP SSE, the server implements sliding-window rate limiting of **120 requests per minute per IP** to prevent abuse.
