# n8n Workflows

Exported n8n workflows for ingestion and multi-agent chat.

| File | Workflow | Trigger |
| :--- | :--- | :--- |
| `Data ingestion workflow.json` | `07_LLM_Entity_Extraction_v3_HTTP`: hybrid CSV / LLM ingestion into Neo4j | Webhook `trigger-extraction` |
| `Chat Orchestrator.json` | Vector search, specialist routing, Manager synthesis | Webhook `chat` |
| `Agent - Risk Analyst.json` | Specialist sub-workflow | Called by orchestrator |
| `Agent - Quality Analyst.json` | Specialist sub-workflow | Called by orchestrator |
| `Agent - Procurement Specialist.json` | Specialist sub-workflow | Called by orchestrator |
| `Agent - Logistics Specialist.json` | Specialist sub-workflow | Called by orchestrator |
| `Agent - Sustainability Analyst.json` | Specialist sub-workflow | Called by orchestrator |
| `Agent - Manager.json` | Final synthesis and evidence trace | Called by orchestrator |
| `original_agent_workflow*.json` | Early prototype: a single n8n AI agent using the MCP server as a tool (Gemini / cluster variants). Kept for reference; it targets an older MCP endpoint and is not part of the running system. | Chat trigger |

## Setup

1. Install the community node package `n8n-nodes-neo4j` (*Settings → Community Nodes*).
2. Create credentials:
   - **Neo4j:** `bolt://neo4j:7687`, user `neo4j`, password from `docker-compose.yml`.
   - **OpenAI-type credential** with your inference cluster API key (used by the LLM HTTP nodes).
3. Import the JSON files, assign the credentials on each Neo4j / HTTP node, and re-link the *Execute Workflow* nodes in the Chat Orchestrator to the imported agent workflows if their IDs changed.
4. Activate **Data ingestion** and **Chat Orchestrator**.

The LLM HTTP nodes read `LLM_AUTHORIZATION` from the container environment (set from `CLUSTER_API_KEY` in `docker-compose.yml`). Workflows call the backend at `http://host.docker.internal:8000`.

## Guides

- [01_DATA_INGESTION_GUIDE.md](./01_DATA_INGESTION_GUIDE.md)
- [02_CHAT_SYSTEM_GUIDE.md](./02_CHAT_SYSTEM_GUIDE.md)
