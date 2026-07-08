"use client";

import { useState, useEffect } from "react";
import { 
  LayoutDashboard, 
  UploadCloud, 
  Network, 
  MessageSquare, 
  Settings as SettingsIcon, 
  Info,
  Database,
  Activity,
  CheckCircle2,
  HelpCircle,
  Cpu,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import clsx from "clsx";
import DashboardView from "./dashboard/DashboardView";
import IngestionView from "./ingestion/IngestionView";
import ExplorerView from "./explorer/ExplorerView";
import ScalesDashboard from "./scales/ScalesDashboard";

type Tab = "dashboard" | "ingestion" | "explorer" | "chat" | "settings";

type HealthState = {
  status: string;
  services: {
    mcp_server?: { status: string; message?: string };
    neo4j?: { status: string; message?: string };
    n8n?: { status: string; message?: string };
    llm_cluster?: { status: string; message?: string };
  };
};

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // Functional Settings state hooks
  const [reasoning, setReasoning] = useState<string>("low");
  const [ragLimit, setRagLimit] = useState<number>(3);
  const [explorerLimit, setExplorerLimit] = useState<number>(80);
  const [engine, setEngine] = useState<string>("auto");

  // Dynamic health monitoring state
  const [health, setHealth] = useState<HealthState>({
    status: "checking",
    services: {
      mcp_server: { status: "ok" },
      neo4j: { status: "checking" },
      n8n: { status: "checking" },
      llm_cluster: { status: "checking" }
    }
  });

  // Load functional settings on client mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setReasoning(window.localStorage.getItem("scales_reasoning_level") || "low");
      setRagLimit(Number(window.localStorage.getItem("scales_rag_limit")) || 3);
      setExplorerLimit(Number(window.localStorage.getItem("scales_explorer_limit")) || 80);
      setEngine(window.localStorage.getItem("scales_orchestrator_engine") || "auto");
    }
  }, []);

  // Poll real service health
  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch("/api/health");
        if (res.ok) {
          const data = await res.json();
          setHealth(data);
        } else {
          setHealth((prev) => ({ ...prev, status: "degraded" }));
        }
      } catch {
        setHealth((prev) => ({
          ...prev,
          status: "offline",
          services: {
            mcp_server: { status: "offline", message: "Server unreachable" },
            neo4j: { status: "unknown" },
            n8n: { status: "unknown" },
            llm_cluster: { status: "unknown" }
          }
        }));
      }
    }

    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const updateReasoning = (val: string) => {
    setReasoning(val);
    window.localStorage.setItem("scales_reasoning_level", val);
  };

  const updateRagLimit = (val: number) => {
    setRagLimit(val);
    window.localStorage.setItem("scales_rag_limit", String(val));
  };

  const updateExplorerLimit = (val: number) => {
    setExplorerLimit(val);
    window.localStorage.setItem("scales_explorer_limit", String(val));
  };

  const updateEngine = (val: string) => {
    setEngine(val);
    window.localStorage.setItem("scales_orchestrator_engine", val);
  };

  const isNeo4jOk = health.services.neo4j?.status === "ok";
  const isN8nOk = health.services.n8n?.status === "ok";

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-50 text-slate-800 flex">
      {/* Sidebar navigation */}
      <aside
        className={clsx(
          "relative z-20 shrink-0 border-r border-slate-200 bg-white flex flex-col justify-between shadow-sm transition-all duration-300 ease-in-out h-full overflow-hidden",
          sidebarCollapsed ? "w-0 p-0 border-r-0 opacity-0 overflow-hidden" : "w-[280px] p-5"
        )}
      >
        <div>
          {/* Logo Header */}
          <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0065bd] text-white">
                <Network size={20} />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Technical University of Munich
                </div>
                <h1 className="text-md font-bold tracking-tight text-slate-800">
                  Supply Chain Portal
                </h1>
              </div>
            </div>
            <button
              onClick={() => setSidebarCollapsed(true)}
              className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition cursor-pointer shrink-0"
              title="Collapse Sidebar"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex w-full items-center gap-3.5 rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition-all duration-200 ${
                activeTab === "dashboard"
                  ? "border-[#0065bd]/20 bg-[#0065bd]/5 text-[#0065bd]"
                  : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <LayoutDashboard size={16} />
              <span>Lifecycle Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab("chat")}
              className={`flex w-full items-center gap-3.5 rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition-all duration-200 ${
                activeTab === "chat"
                  ? "border-[#0065bd]/20 bg-[#0065bd]/5 text-[#0065bd]"
                  : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <MessageSquare size={16} />
              <span>S.C.A.L.E.S. Chat</span>
            </button>

            <button
              onClick={() => setActiveTab("explorer")}
              className={`flex w-full items-center gap-3.5 rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition-all duration-200 ${
                activeTab === "explorer"
                  ? "border-[#0065bd]/20 bg-[#0065bd]/5 text-[#0065bd]"
                  : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <Network size={16} />
              <span>Network Explorer</span>
            </button>

            <button
              onClick={() => setActiveTab("ingestion")}
              className={`flex w-full items-center gap-3.5 rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition-all duration-200 ${
                activeTab === "ingestion"
                  ? "border-[#0065bd]/20 bg-[#0065bd]/5 text-[#0065bd]"
                  : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <UploadCloud size={16} />
              <span>Data Ingestion</span>
            </button>

            <button
              onClick={() => setActiveTab("settings")}
              className={`flex w-full items-center gap-3.5 rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition-all duration-200 ${
                activeTab === "settings"
                  ? "border-[#0065bd]/20 bg-[#0065bd]/5 text-[#0065bd]"
                  : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <SettingsIcon size={16} />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer status indicators with live health polling */}
        <div className="space-y-2.5 border-t border-slate-100 pt-4">
          <div className="group relative flex items-center gap-1.5 text-[10px] text-slate-600 font-semibold cursor-help">
            <span className={`h-1.5 w-1.5 rounded-full ${isNeo4jOk ? "bg-emerald-500" : "bg-amber-500 animate-pulse"}`} />
            <span>Neo4j: {isNeo4jOk ? "Connected" : (health.services.neo4j?.status || "Checking")}</span>
            <div className="pointer-events-none absolute left-0 bottom-6 z-50 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[10px] text-slate-500 font-normal leading-relaxed normal-case tracking-normal">
              Neo4j Database status: {health.services.neo4j?.message || "Connected at port 7687"}. Serving graph schema and vector embeddings index.
            </div>
          </div>

          <div className="group relative flex items-center gap-1.5 text-[10px] text-slate-600 font-semibold cursor-help">
            <span className={`h-1.5 w-1.5 rounded-full ${isN8nOk ? "bg-emerald-500" : "bg-amber-500"}`} />
            <span>n8n: {isN8nOk ? "Linked (:5678)" : (health.services.n8n?.status || "Standby")}</span>
            <div className="pointer-events-none absolute left-0 bottom-6 z-50 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[10px] text-slate-500 font-normal leading-relaxed normal-case tracking-normal">
              n8n Workflow Engine: {health.services.n8n?.message || "Active at port 5678"}. Handles workflow extraction and Chat Orchestrator.
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-[9px] font-bold text-[#0065bd] uppercase tracking-wider">TUM CIT Practice</div>
            <p className="mt-1 text-[10px] text-slate-500 leading-normal font-sans">
              Multi-Agent RAG Consultant Platform powered by Neo4j & n8n.
            </p>
          </div>
        </div>
      </aside>

      {/* Floating Expand Sidebar Button */}
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(false)}
          className="fixed left-3 top-[18px] z-40 p-2 bg-white rounded-lg border border-slate-200 shadow-md hover:bg-slate-50 text-slate-600 transition cursor-pointer"
          title="Expand Sidebar"
        >
          <ChevronRight size={18} />
        </button>
      )}

      {/* Main Panel content view */}
      <section
        className={clsx(
          "relative z-10 flex-1 overflow-hidden flex flex-col h-full bg-slate-50 transition-all duration-300",
          sidebarCollapsed && "pl-14"
        )}
      >
        <div className="flex-1 h-full w-full relative">
          
          <div className={activeTab === "dashboard" ? "h-full w-full overflow-y-auto" : "hidden"}>
            <DashboardView />
          </div>

          <div className={activeTab === "chat" ? "h-full w-full overflow-y-auto" : "hidden"}>
            <ScalesDashboard />
          </div>

          <div className={activeTab === "explorer" ? "h-full w-full" : "hidden"}>
            <ExplorerView isActive={activeTab === "explorer"} />
          </div>

          <div className={activeTab === "ingestion" ? "h-full w-full overflow-y-auto" : "hidden"}>
            <IngestionView />
          </div>

          <div className={activeTab === "settings" ? "h-full w-full overflow-y-auto" : "hidden"}>
            <div className="p-8 max-w-4xl mx-auto space-y-6">
              <div className="mb-2">
                <div className="text-xs uppercase tracking-wider text-[#0065bd] font-bold">Configuration Dashboard</div>
                <h1 className="text-2xl font-bold text-slate-900 mt-1">SETTINGS</h1>
              </div>

              {/* Functional parameters */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
                <div>
                  <h2 className="text-md font-bold text-slate-900 mb-1">Multi-Agent Consultant Parameters</h2>
                  <p className="text-xs text-slate-500 leading-normal">
                    Adjust LLM strategy, orchestration engine, and document context constraints dynamically. Changes are auto-saved.
                  </p>
                </div>

                {/* Orchestrator Engine Switch */}
                <div className="space-y-2.5 border-t border-slate-100 pt-4">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Agent Orchestration Engine</span>
                  <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200/60 max-w-md text-xs font-bold">
                    {[
                      { id: "auto", label: "Auto (n8n + Fallback)" },
                      { id: "n8n", label: "n8n Engine (:5678)" },
                      { id: "express", label: "Express MCP (:8000)" }
                    ].map((item) => (
                      <button
                        key={item.id}
                        onClick={() => updateEngine(item.id)}
                        className={`flex-1 py-2 rounded-lg text-center transition ${
                          engine === item.id 
                            ? "bg-white text-[#0065bd] shadow-sm border border-slate-200/50" 
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    n8n serves as a multi-agent orchestrator utilizing local similarity fallback, while Express MCP acts as the direct high-performance RAG API (supporting semantic Gemini embeddings when configured).
                  </p>
                </div>

                {/* LLM Reasoning level */}
                <div className="space-y-2.5 border-t border-slate-100 pt-4">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">Specialist LLM Reasoning Level</span>
                  <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200/60 max-w-md text-xs font-bold">
                    {["low", "medium", "high"].map((level) => (
                      <button
                        key={level}
                        onClick={() => updateReasoning(level)}
                        className={`flex-1 py-2 rounded-lg text-center transition capitalize ${
                          reasoning === level 
                            ? "bg-white text-[#0065bd] shadow-sm border border-slate-200/50" 
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Defines reasoning intensity for specialist agents (Sentinel, Calibrator). High mode allocates more tokens for deeper problem analysis.
                  </p>
                </div>

                {/* RAG Context limit slider */}
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <div className="flex justify-between items-center max-w-md">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Unstructured RAG Chunk Limit</span>
                    <span className="text-xs font-mono font-bold text-[#0065bd]">{ragLimit} chunks</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={ragLimit}
                    onChange={(e) => updateRagLimit(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-[#0065bd] max-w-md"
                  />
                  <p className="text-[10px] text-slate-400">
                    Sets the maximum number of matching document source chunks loaded from the vector database to feed the S.C.A.L.E.S. consultation context.
                  </p>
                </div>

                {/* Explorer Fetch Limit slider */}
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <div className="flex justify-between items-center max-w-md">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Default Network Explorer Limit</span>
                    <span className="text-xs font-mono font-bold text-[#0065bd]">{explorerLimit} nodes</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="350"
                    step="10"
                    value={explorerLimit}
                    onChange={(e) => updateExplorerLimit(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-[#0065bd] max-w-md"
                  />
                  <p className="text-[10px] text-slate-400">
                    Determines the default node limit used during custom Cypher console executions in the Network Explorer.
                  </p>
                </div>
              </div>

              {/* Readonly engine settings */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-md font-bold text-slate-900 mb-2">Nexus Engine Settings</h3>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  System configuration variables are driven directly by backend environment mapping. To alter ports or API endpoints, update the local <code className="text-[#0065bd] bg-slate-50 px-1.5 py-0.5 rounded font-mono text-[10px]">frontend/.env.local</code> and <code className="text-[#0065bd] bg-slate-50 px-1.5 py-0.5 rounded font-mono text-[10px]">mcp-server/.env</code> file keys.
                </p>
                <div className="space-y-2.5 font-mono text-[11px] text-slate-600 bg-slate-50 p-4 rounded-xl border border-slate-200/50">
                  <div className="grid grid-cols-[220px_1fr] border-b border-slate-200/60 pb-2">
                    <span className="font-semibold text-slate-400">EXPRESS_BACKEND_PORT</span>
                    <span className="text-slate-800 font-bold">8000</span>
                  </div>
                  <div className="grid grid-cols-[220px_1fr] border-b border-slate-200/60 pb-2">
                    <span className="font-semibold text-slate-400">N8N_ORCHESTRATOR_PORT</span>
                    <span className="text-slate-800 font-bold">5678</span>
                  </div>
                  <div className="grid grid-cols-[220px_1fr] border-b border-slate-200/60 pb-2">
                    <span className="font-semibold text-slate-400">NEO4J_DB_PORT</span>
                    <span className="text-slate-800 font-bold">7687</span>
                  </div>
                  <div className="grid grid-cols-[220px_1fr] pb-1">
                    <span className="font-semibold text-slate-400">DEFAULT_SESSION_ID</span>
                    <span className="text-slate-800 font-bold">scales-command-session</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>
    </main>
  );
}
