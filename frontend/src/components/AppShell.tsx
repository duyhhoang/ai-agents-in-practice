"use client";

import { useState } from "react";
import { 
  LayoutDashboard, 
  UploadCloud, 
  Network, 
  MessageSquare, 
  Settings, 
  Sparkles,
  Database,
  Activity,
  Zap
} from "lucide-react";
import DashboardView from "./dashboard/DashboardView";
import IngestionView from "./ingestion/IngestionView";
import ExplorerView from "./explorer/ExplorerView";
import ScalesDashboard from "./scales/ScalesDashboard";

type Tab = "dashboard" | "ingestion" | "explorer" | "chat" | "settings";

export default function AppShell() {
  const [activeTab, setActiveTab] = useState<Tab>("chat");

  return (
    <main className="relative min-h-screen w-screen overflow-hidden bg-[#020617] text-cyan-50 flex">
      {/* Background cyber grid */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.12),transparent_40%),linear-gradient(rgba(6,182,212,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.03)_1px,transparent_1px)] bg-[size:100%_100%,32px_32px,32px_32px]" />
      
      {/* Sidebar navigation */}
      <aside className="relative z-10 w-[280px] shrink-0 border-r border-cyan-400/20 bg-slate-950/70 p-5 flex flex-col justify-between backdrop-blur-xl">
        <div>
          {/* Logo Header */}
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-400">
              <Network size={22} className="animate-pulse" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-400 font-bold">
                Supply Chain
              </div>
              <h1 className="text-xl font-black tracking-widest text-white">
                NEXUS
              </h1>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-2">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-3.5 text-left text-sm font-semibold transition-all duration-300 ${
                activeTab === "dashboard"
                  ? "border-cyan-400/70 bg-cyan-950/30 text-white shadow-[0_0_15px_rgba(34,211,238,0.15)]"
                  : "border-transparent text-cyan-100/60 hover:border-cyan-400/20 hover:bg-slate-900/40 hover:text-cyan-100"
              }`}
            >
              <LayoutDashboard size={18} />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab("ingestion")}
              className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-3.5 text-left text-sm font-semibold transition-all duration-300 ${
                activeTab === "ingestion"
                  ? "border-cyan-400/70 bg-cyan-950/30 text-white shadow-[0_0_15px_rgba(34,211,238,0.15)]"
                  : "border-transparent text-cyan-100/60 hover:border-cyan-400/20 hover:bg-slate-900/40 hover:text-cyan-100"
              }`}
            >
              <UploadCloud size={18} />
              <span>Data Ingestion</span>
            </button>

            <button
              onClick={() => setActiveTab("explorer")}
              className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-3.5 text-left text-sm font-semibold transition-all duration-300 ${
                activeTab === "explorer"
                  ? "border-cyan-400/70 bg-cyan-950/30 text-white shadow-[0_0_15px_rgba(34,211,238,0.15)]"
                  : "border-transparent text-cyan-100/60 hover:border-cyan-400/20 hover:bg-slate-900/40 hover:text-cyan-100"
              }`}
            >
              <Network size={18} />
              <span>Network Explorer</span>
            </button>

            <button
              onClick={() => setActiveTab("chat")}
              className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-3.5 text-left text-sm font-semibold transition-all duration-300 ${
                activeTab === "chat"
                  ? "border-cyan-400/70 bg-cyan-950/30 text-white shadow-[0_0_15px_rgba(34,211,238,0.15)]"
                  : "border-transparent text-cyan-100/60 hover:border-cyan-400/20 hover:bg-slate-900/40 hover:text-cyan-100"
              }`}
            >
              <MessageSquare size={18} />
              <span>S.C.A.L.E.S. Chat</span>
            </button>

            <button
              onClick={() => setActiveTab("settings")}
              className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-3.5 text-left text-sm font-semibold transition-all duration-300 ${
                activeTab === "settings"
                  ? "border-cyan-400/70 bg-cyan-950/30 text-white shadow-[0_0_15px_rgba(34,211,238,0.15)]"
                  : "border-transparent text-cyan-100/60 hover:border-cyan-400/20 hover:bg-slate-900/40 hover:text-cyan-100"
              }`}
            >
              <Settings size={18} />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer status badges */}
        <div className="space-y-2 border-t border-cyan-400/10 pt-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-cyan-100/50 uppercase tracking-widest text-[9px]">Neo4j Connected</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-cyan-100/50 uppercase tracking-widest text-[9px]">n8n Pipeline Linked</span>
          </div>
          <div className="mt-4 rounded-xl border border-cyan-400/10 bg-slate-950/60 p-3">
            <div className="text-[9px] font-bold text-cyan-300 uppercase tracking-widest">TUM CIT Practice</div>
            <p className="mt-1 text-[10px] text-cyan-100/40 leading-relaxed font-mono">
              Multi-Agent RAG Consultant Platform powered by Neo4j & n8n.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Panel content view */}
      <section className="relative z-10 flex-1 overflow-hidden flex flex-col min-h-screen">
        <div className="flex-1 overflow-y-auto">
          {activeTab === "dashboard" && <DashboardView />}
          {activeTab === "ingestion" && <IngestionView />}
          {activeTab === "explorer" && <ExplorerView />}
          {activeTab === "chat" && <ScalesDashboard />}
          {activeTab === "settings" && (
            <div className="p-8 max-w-4xl mx-auto">
              <div className="mb-8">
                <div className="text-xs uppercase tracking-[0.4em] text-cyan-300">Configuration</div>
                <h1 className="text-3xl font-black tracking-widest text-white mt-1">SETTINGS</h1>
              </div>
              <div className="rounded-3xl border border-cyan-400/10 bg-slate-950/60 p-6 backdrop-blur-xl">
                <h3 className="text-lg font-bold text-white mb-2">Nexus Engine Settings</h3>
                <p className="text-sm text-cyan-100/60 mb-6 leading-relaxed">
                  System configuration variables are driven directly by backend environment mapping. To alter ports or API endpoints, update the local <code className="text-cyan-300">frontend/.env.local</code> and <code className="text-cyan-300">mcp-server/.env</code> file keys.
                </p>
                <div className="space-y-4 font-mono text-xs">
                  <div className="grid grid-cols-[200px_1fr] border-b border-cyan-400/5 pb-2">
                    <span className="text-cyan-400">EXPRESS_BACKEND_PORT</span>
                    <span className="text-slate-100">8000</span>
                  </div>
                  <div className="grid grid-cols-[200px_1fr] border-b border-cyan-400/5 pb-2">
                    <span className="text-cyan-400">N8N_ORCHESTRATOR_PORT</span>
                    <span className="text-slate-100">5678</span>
                  </div>
                  <div className="grid grid-cols-[200px_1fr] border-b border-cyan-400/5 pb-2">
                    <span className="text-cyan-400">NEO4J_DB_PORT</span>
                    <span className="text-slate-100">7687</span>
                  </div>
                  <div className="grid grid-cols-[200px_1fr] pb-2">
                    <span className="text-cyan-400">DEFAULT_SESSION_ID</span>
                    <span className="text-slate-100">scales-command-session</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
