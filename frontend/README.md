# Frontend

Next.js 16 (App Router) / React 19 dashboard for the supply chain knowledge graph platform. Styling uses Tailwind CSS 4; graphs are rendered with Cytoscape.js.

## Views

| Tab | Component | Purpose |
| :--- | :--- | :--- |
| Dashboard | `components/dashboard/DashboardView.tsx` | Lifecycle KPIs and per-unit process tracing |
| Ingestion | `components/ingestion/IngestionView.tsx` | File upload, pipeline trigger, live progress, execution history |
| Explorer | `components/explorer/ExplorerView.tsx` | Guided search, raw Cypher console, graph and table views |
| Chat | `components/scales/ScalesDashboard.tsx` | Multi-agent chat with evidence trace and graph |
| Settings | `components/AppShell.tsx` | Chat engine (auto / n8n / express), reasoning level, RAG and explorer limits |

## Backend communication

- `src/app/api/chat/route.ts` routes chat requests to the n8n Chat Orchestrator or the Express fallback engine and normalises the response.
- `src/app/api/upload` and `src/app/api/ingestion/trigger` proxy ingestion requests to the backend.
- Other `/api/*` paths are forwarded to the backend on port 8000 via rewrites in `next.config.ts`.

Optional environment variables (`.env.local`):

```text
N8N_CHAT_WEBHOOK_URL=http://localhost:5678/webhook/chat
EXPRESS_CHAT_URL=http://localhost:8000/chat
```

## Development

```bash
npm install
npm run dev     # http://localhost:3000
npm run lint
npx tsc --noEmit
```
