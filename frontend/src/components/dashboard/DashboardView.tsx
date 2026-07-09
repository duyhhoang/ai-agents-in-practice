"use client";

import { useEffect, useState } from "react";
import { 
  Activity, 
  Layers, 
  MapPin, 
  Users, 
  Clock, 
  DollarSign, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle,
  X
} from "lucide-react";

type Stat = {
  stations: number;
  processes: number;
  actors: number;
  locations: number;
};

type ProcessStep = {
  process_id: string;
  process_name: string;
  phase: string;
  cost: number;
  duration: number;
  status: string;
  actor: string | null;
};

export default function DashboardView() {
  const [stats, setStats] = useState<Stat>({ stations: 0, processes: 0, actors: 0, locations: 0 });
  const [loadingStats, setLoadingStats] = useState(true);
  const [units, setUnits] = useState<string[]>([]);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [lifecycle, setLifecycle] = useState<ProcessStep[]>([]);
  const [loadingLifecycle, setLoadingLifecycle] = useState(false);
  const [selectedStep, setSelectedStep] = useState<ProcessStep | null>(null);

  const [assetLabel, setAssetLabel] = useState("ChargingStation");
  const [assetIdField, setAssetIdField] = useState("unit_id");
  const [discovered, setDiscovered] = useState(false);

  // Discovery effect
  useEffect(() => {
    async function discover() {
      try {
        const query = `
          MATCH (start)-[:UNDERGOES]->()
          RETURN DISTINCT labels(start)[0] AS label
          LIMIT 1
        `;
        const res = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.results && data.results[0] && data.results[0].label) {
            const discoveredLabel = data.results[0].label;
            setAssetLabel(discoveredLabel);

            const keysQuery = `
              MATCH (n:${discoveredLabel})
              RETURN keys(n) AS keys
              LIMIT 1
            `;
            const keysRes = await fetch("/api/query", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ query: keysQuery })
            });
            if (keysRes.ok) {
              const keysData = await keysRes.json();
              if (keysData.results && keysData.results[0]) {
                const keys = keysData.results[0].keys || [];
                const idField = keys.find((k: string) => k === "unit_id" || k === "product_id" || k === "canonical_id" || k === "id" || k.endsWith("_id") || k.endsWith("_code")) || "id";
                setAssetIdField(idField);
              }
            }
          }
        }
      } catch (err) {
        console.warn("Schema discovery failed:", err);
      } finally {
        setDiscovered(true);
      }
    }
    discover();
  }, []);

  // Fetch db stats dynamically
  useEffect(() => {
    if (!discovered) return;

    async function fetchStats() {
      try {
        const query = `
          CALL { MATCH (cs:${assetLabel}) RETURN count(cs) AS cs_count }
          CALL { MATCH (p:Process) RETURN count(p) AS p_count }
          CALL { MATCH (a:Actor) RETURN count(a) AS a_count }
          CALL { MATCH (l:Location) RETURN count(l) AS l_count }
          RETURN cs_count, p_count, a_count, l_count
        `;
        const res = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.results && data.results[0]) {
            const row = data.results[0];
            setStats({
              stations: Number(row.cs_count || 0),
              processes: Number(row.p_count || 0),
              actors: Number(row.a_count || 0),
              locations: Number(row.l_count || 0)
            });
          }
        }
      } catch (err) {
        console.error("Failed to load dashboard stats:", err);
      } finally {
        setLoadingStats(false);
      }
    }

    async function fetchUnits() {
      try {
        const query = `MATCH (cs:${assetLabel}) RETURN cs.${assetIdField} AS unitId ORDER BY unitId`;
        const res = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.results) {
            const list = data.results.map((r: any) => r.unitId as string).filter(Boolean);
            setUnits(list);
            if (list.length > 0) {
              setSelectedUnit(list[0]);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load charging station units:", err);
      }
    }

    fetchStats();
    fetchUnits();
  }, [discovered, assetLabel, assetIdField]);

  // Fetch unit lifecycle processes
  useEffect(() => {
    if (!selectedUnit || !discovered) return;

    async function fetchLifecycle() {
      setLoadingLifecycle(true);
      setSelectedStep(null);
      try {
        const query = `
          MATCH (cs:${assetLabel} {${assetIdField}: $unitId})-[:UNDERGOES]->(p:Process)
          OPTIONAL MATCH (p)-[:EXECUTED_BY]->(a:Actor)
          RETURN coalesce(p.process_id, p.id) AS process_id, 
                 p.process_name AS process_name, 
                 p.lifecycle_phase AS phase, 
                 p.cost_eur AS cost, 
                 p.duration_days AS duration, 
                 p.status AS status, 
                 a.actor_name AS actor
          ORDER BY process_id
        `;
        const res = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, params: { unitId: selectedUnit } })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.results) {
            setLifecycle(data.results as ProcessStep[]);
          }
        }
      } catch (err) {
        console.error("Failed to load unit lifecycle:", err);
      } finally {
        setLoadingLifecycle(false);
      }
    }

    fetchLifecycle();
  }, [selectedUnit, discovered, assetLabel, assetIdField]);

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-[#0065bd] font-bold">Operational Overview</div>
          <h1 className="text-2xl font-extrabold text-slate-900 mt-1">LIFECYCLE DASHBOARD</h1>
        </div>
        <div className="group relative flex items-center gap-1.5 text-slate-400 hover:text-slate-600 cursor-pointer">
          <HelpCircle size={16} />
          <span className="text-xs">Dashboard Help</span>
          <div className="pointer-events-none absolute right-0 top-6 z-50 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs text-slate-600 leading-normal">
            This dashboard outlines high-level metrics of the active supply chain network. Use the dropdown to choose a Charging Station and inspect its sequential processes. Click on any step to open the inspector panel.
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          icon={<Activity className="text-[#0065bd]" size={18} />}
          label={assetLabel === "ChargingStation" ? "Charging Stations" : `${assetLabel}s`}
          value={loadingStats ? "..." : stats.stations.toString()}
        />
        <StatCard
          icon={<Layers className="text-emerald-600" size={18} />}
          label="Processes Logged"
          value={loadingStats ? "..." : stats.processes.toString()}
        />
        <StatCard
          icon={<Users className="text-purple-600" size={18} />}
          label="Supply Chain Actors"
          value={loadingStats ? "..." : stats.actors.toString()}
        />
        <StatCard
          icon={<MapPin className="text-amber-600" size={18} />}
          label="Global Locations"
          value={loadingStats ? "..." : stats.locations.toString()}
        />
      </div>

      {/* Tracer & Timeline Section */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        
        {/* Left Side: Timeline */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5 mb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
                <Activity className="text-[#0065bd]" size={18} />
                End-to-End {assetLabel === "ChargingStation" ? "Unit" : assetLabel} Lifecycle Tracer
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Select a physical {assetLabel === "ChargingStation" ? "EV charging unit" : assetLabel.toLowerCase()} to retrieve its structured processes path. Click any card to inspect.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select {assetLabel === "ChargingStation" ? "Unit" : assetLabel}:</span>
              <select
                value={selectedUnit}
                onChange={(e) => setSelectedUnit(e.target.value)}
                className="h-9 bg-white border border-slate-200 rounded-lg px-3 text-xs font-mono text-slate-800 outline-none focus:border-[#0065bd] focus:ring-1 focus:ring-[#0065bd] transition"
              >
                {units.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Timeline Body */}
          {loadingLifecycle ? (
            <div className="h-64 flex items-center justify-center text-slate-400 font-mono text-xs">
              Querying Graph Databases...
            </div>
          ) : lifecycle.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 font-mono text-xs">
              No processes logged for this {assetLabel === "ChargingStation" ? "unit" : assetLabel.toLowerCase()}.
            </div>
          ) : (
            <div className="relative pl-6 border-l border-slate-200 space-y-4 ml-4 py-1">
              {lifecycle.map((step) => {
                const isCompleted = step.status?.toLowerCase() === "completed";
                const isSelected = selectedStep?.process_id === step.process_id;

                return (
                  <div key={step.process_id} className="relative">
                    {/* Circle Indicator */}
                    <span className={`absolute -left-[31px] top-3 flex h-4 w-4 items-center justify-center rounded-full border bg-white shadow-sm transition-all duration-200 ${
                      isCompleted ? "border-emerald-500" : "border-amber-500"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        isCompleted ? "bg-emerald-500" : "bg-amber-500"
                      }`} />
                    </span>

                    {/* Step Card */}
                    <div 
                      onClick={() => setSelectedStep(step)}
                      className={`cursor-pointer rounded-xl border p-4 transition duration-200 text-left ${
                        isSelected 
                          ? "border-[#0065bd] bg-[#0065bd]/5 shadow-sm" 
                          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2">
                        <div>
                          <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">{step.process_id}</span>
                          <h4 className="text-sm font-bold text-slate-800 tracking-tight mt-0.5">{step.process_name}</h4>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            isCompleted ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"
                          }`}>
                            {step.status || "UNKNOWN"}
                          </span>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider">
                            {step.phase || "UNKNOWN"}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-xs font-mono text-slate-600">
                        <div>
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider block">Duration</span>
                          <span className="font-semibold text-slate-700">{step.duration} days</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider block">Cost</span>
                          <span className="font-semibold text-slate-700">{step.cost?.toLocaleString() || 0} EUR</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider block">Actor</span>
                          <span className="font-semibold text-slate-700 truncate block">{step.actor || "Unassigned"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side: Step Details Inspector */}
        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col h-fit">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
              Process Detail Inspector
            </h3>
            {selectedStep && (
              <button 
                onClick={() => setSelectedStep(null)}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg hover:bg-slate-100 transition"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {selectedStep ? (
            <div className="space-y-4">
              <div>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 uppercase tracking-wider">
                  {selectedStep.phase || "Phase Unassigned"}
                </span>
                <h4 className="text-md font-bold text-slate-900 mt-2">{selectedStep.process_name}</h4>
                <p className="text-xs text-slate-400 font-mono mt-0.5">ID: {selectedStep.process_id}</p>
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-3 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-50 font-mono">
                  <span className="text-slate-400">Status</span>
                  <span className={`font-semibold ${selectedStep.status?.toLowerCase() === "completed" ? "text-emerald-600" : "text-amber-600"}`}>
                    {selectedStep.status || "Unknown"}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-50 font-mono">
                  <span className="text-slate-400">Duration</span>
                  <span className="font-semibold text-slate-800">{selectedStep.duration} days</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-50 font-mono">
                  <span className="text-slate-400">Operational Cost</span>
                  <span className="font-semibold text-slate-800">{selectedStep.cost?.toLocaleString() || 0} EUR</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-50 font-mono">
                  <span className="text-slate-400">Assigned Actor</span>
                  <span className="font-semibold text-slate-800">{selectedStep.actor || "Internal Resources"}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-50 font-mono">
                  <span className="text-slate-400">Target Unit</span>
                  <span className="font-semibold text-slate-800">{selectedUnit}</span>
                </div>
              </div>

              <div className="mt-2 rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs text-slate-500 leading-normal">
                <div className="font-bold text-slate-700 text-[10px] uppercase tracking-wider mb-1">Knowledge Notes</div>
                This step was parsed from standard audit logs. S.C.A.L.E.S. automatically estimates bottlenecks and risk factors based on these duration and cost benchmarks.
              </div>
            </div>
          ) : (
            <div className="text-center py-10 px-4 text-slate-400 text-xs font-mono">
              Click any process node or card on the left to inspect its detailed parameters and logs.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 border border-slate-100">
          {icon}
        </div>
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
