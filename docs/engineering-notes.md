# Engineering Notes

Design decisions and lessons learned while building the platform.

## Two chat engines

The n8n Chat Orchestrator is the primary engine because its agents are visible and editable on the n8n canvas. An Express implementation of the same idea (`mcp-server/src/routes/chat.ts`) acts as a fallback. The frontend route `/api/chat` supports three modes:

- `n8n`: n8n only
- `express`: Express only
- `auto` (default): n8n first, Express if n8n fails or times out

Both engines return the same response shape, including an `evidenceTrace` (`toolsUsed`, `cypherQueries`, `accessedNodes`, `sourceChunks`), so the UI renders either one the same way and labels which engine answered.

## Read-only database access

LLM-generated Cypher is executed in read transactions (`session.executeRead`). The REST endpoint `POST /api/query` also rejects queries containing mutating keywords (`CREATE`, `MERGE`, `DELETE`, `SET`, `REMOVE`, `DROP`, `DETACH`) unless `allow_write: true` is passed, and returns `403` otherwise. Search input in the Explorer is escaped before it is used in a regex match.

## Balancing data agnosticism with precision

Early versions guessed the schema for every file with an LLM. This was slow, cost tokens, and produced inconsistent graphs. The final design is hybrid:

- **Known CSVs** are mapped deterministically through an `ENTITY_CONFIG` in the ingestion workflow: fast, free, and exact.
- **Unknown CSVs** still import, using the file name as label and an ID-like header as key, but need a config entry to get cross-entity relationships.
- **Unstructured text** goes through a two-stage LLM loop that first resolves mentions against entities already in the graph, which keeps the graph from fragmenting into near-duplicates.

On the query side, the live schema is read from Neo4j (`getDatabaseSchema`, cached for 5 minutes) and injected into Cypher-generating prompts, and the MCP `analytics` tool discovers asset and process labels from the `UNDERGOES` relationship instead of hardcoding them.

## Specialists write their own queries

Instead of one large query in the orchestrator, each specialist workflow decides which Cypher to run for the question it receives (e.g. the Procurement specialist targets `PurchaseOrder` status, the Logistics specialist uses canonical `ChargingStation` records with `count(DISTINCT unit_id)`). Prompts tell agents not to invent missing records or comment outside their domain.

## Parallel specialists in n8n bring no speed-up

The specialists are independent: each only needs the normalised question and the vector search results. Running them as parallel branches joined by a `Merge` node looked like an easy latency win.

Measured result: n8n runs the branches one after another. *Execute Workflow* nodes block until the sub-workflow finishes, and n8n works through outgoing branches in order, so total latency stayed the sum of the agents' durations (e.g. 9 s + 37 s + 39 s).

Because the parallel layout added a `Merge` node and many crossing connections without any gain, the orchestrator was reverted to a sequential chain. Real concurrency would need asynchronous sub-workflow calls (webhooks) or a code-level fan-out like the Express engine's `Promise.all`.

## Ingestion completion callback

The backend triggers ingestion through a webhook and does not wait for it. The workflow calls back to `POST /api/ingestion/complete` when it finishes. Since the CSV and LLM branches can finish at different times, both are joined by a `Merge` node before the single success callback, so the backend never receives a completion signal while one branch is still writing. After the callback, the backend compares file states before and after the run, records the execution in Neo4j (`IngestionExecution` nodes), and embeds only the newly processed files.

## Embedding fallback

Without a `GEMINI_API_KEY`, `getDeterministicMockEmbedding` produces a seeded, unit-normalised 1536-dimensional vector. This keeps the vector indexes and every code path that depends on them working without external services. The fallback vectors carry no semantic meaning, so similarity scores are only meaningful with real embeddings.
