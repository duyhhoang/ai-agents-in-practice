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
  AlertCircle 
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

  // Fetch db stats dynamically
  useEffect(() => {
    async function fetchStats() {
      try {
        const query = `
          CALL { MATCH (cs:ChargingStation) RETURN count(cs) AS cs_count }
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
        const query = `MATCH (cs:ChargingStation) RETURN cs.unit_id AS unitId ORDER BY unitId`;
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
  }, []);

  // Fetch unit lifecycle processes
  useEffect(() => {
    if (!selectedUnit) return;

    async function fetchLifecycle() {
      setLoadingLifecycle(true);
      try {
        const query = `
          MATCH (cs:ChargingStation {unit_id: $unitId})-[:UNDERGOES]->(p:Process)
          OPTIONAL MATCH (p)-[:EXECUTED_BY]->(a:Actor)
          RETURN p.process_id AS process_id, 
                 p.process_name AS process_name, 
                 p.lifecycle_phase AS phase, 
                 p.cost_eur AS cost, 
                 p.duration_days AS duration, 
                 p.status AS status, 
                 a.actor_name AS actor
          ORDER BY p.process_id
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
  }, [selectedUnit]);

  return (
    <div className="p-8 max-w-[1600px] mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="text-xs uppercase tracking-[0.4em] text-cyan-300">Operational Overview</div>
        <h1 className="text-4xl font-black tracking-widest text-white mt-1">LIFECYCLE DASHBOARD</h1>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          icon={<Activity className="text-emerald-400" size={20} />}
          label="Charging Stations"
          value={loadingStats ? "..." : stats.stations.toString()}
          glowColor="green"
        />
        <StatCard
          icon={<Layers className="text-cyan-400" size={20} />}
          label="Processes Logged"
          value={loadingStats ? "..." : stats.processes.toString()}
          glowColor="blue"
        />
        <StatCard
          icon={<Users className="text-purple-400" size={20} />}
          label="Supply Chain Actors"
          value={loadingStats ? "..." : stats.actors.toString()}
          glowColor="purple"
        />
        <StatCard
          icon={<MapPin className="text-amber-400" size={20} />}
          label="Global Locations"
          value={loadingStats ? "..." : stats.locations.toString()}
          glowColor="yellow"
        />
      </div>

      {/* Tracer & Timeline Section */}
      <div className="rounded-3xl border border-cyan-400/20 bg-slate-950/70 p-6 backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-cyan-400/10 pb-6 mb-6">
          <div>
            <h2 className="text-xl font-bold text-white tracking-wider flex items-center gap-2">
              <Activity className="text-cyan-400 animate-pulse" size={22} />
              End-to-End Unit Lifecycle Tracer
            </h2>
            <p className="text-xs text-cyan-100/60 mt-1">
              Select a physical EV charging unit to retrieve its structured processes path.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-cyan-300 uppercase tracking-widest">Select Unit:</span>
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="h-10 bg-black/60 border border-cyan-400/30 rounded-xl px-4 text-xs font-mono text-cyan-50 outline-none focus:border-cyan-300 transition"
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
          <div className="h-64 flex items-center justify-center text-cyan-100/50 font-mono text-xs">
            Querying Graph Databases...
          </div>
        ) : lifecycle.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-cyan-100/50 font-mono text-xs">
            No processes logged for this unit.
          </div>
        ) : (
          <div className="relative pl-6 sm:pl-8 border-l border-cyan-400/20 space-y-6 ml-4 sm:ml-6 py-2">
            {lifecycle.map((step, idx) => {
              const isCompleted = step.status?.toLowerCase() === "completed";
              return (
                <div key={step.process_id} className="relative">
                  {/* Circle Indicator */}
                  <span className={`absolute -left-[31px] sm:-left-[39px] top-1.5 flex h-4 w-4 sm:h-5 sm:w-5 items-center justify-center rounded-full border bg-black shadow-[0_0_8px_rgba(34,211,238,0.15)] ${
                    isCompleted ? "border-emerald-400 text-emerald-400" : "border-amber-400 text-amber-400"
                  }`}>
                    <span className={`h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full ${
                      isCompleted ? "bg-emerald-500" : "bg-amber-500"
                    }`} />
                  </span>

                  {/* Step Card */}
                  <div className="rounded-2xl border border-cyan-400/10 bg-slate-900/30 p-4 hover:border-cyan-400/30 hover:bg-slate-900/60 transition duration-300">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-cyan-400/5 pb-2 mb-3">
                      <div>
                        <span className="text-[10px] font-mono font-bold text-cyan-300 uppercase tracking-widest">{step.process_id}</span>
                        <h4 className="text-sm font-bold text-white tracking-wide mt-0.5">{step.process_name}</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          isCompleted ? "bg-emerald-950/50 text-emerald-400 border border-emerald-400/30" : "bg-amber-950/50 text-amber-400 border border-amber-400/30"
                        }`}>
                          {step.status || "UNKNOWN"}
                        </span>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-950/50 text-slate-300 border border-slate-700/50 uppercase tracking-wider">
                          {step.phase || "UNKNOWN"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
                      <div>
                        <span className="text-[10px] text-cyan-100/40 uppercase tracking-wider block">Duration</span>
                        <div className="flex items-center gap-1.5 mt-1 text-cyan-100 font-bold">
                          <Clock size={12} className="text-cyan-400" />
                          <span>{step.duration} days</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] text-cyan-100/40 uppercase tracking-wider block">Cost</span>
                        <div className="flex items-center gap-1.5 mt-1 text-cyan-100 font-bold">
                          <DollarSign size={12} className="text-cyan-400" />
                          <span>{step.cost?.toLocaleString() || 0} EUR</span>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <span className="text-[10px] text-cyan-100/40 uppercase tracking-wider block">Executed By</span>
                        <div className="flex items-center gap-1.5 mt-1 text-cyan-100 font-bold">
                          <Users size={12} className="text-cyan-400" />
                          <span className="truncate">{step.actor || "Internal Resources / Unassigned"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  glowColor
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  glowColor: "green" | "blue" | "purple" | "yellow";
}) {
  const glows = {
    green: "hover:border-emerald-400/50 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]",
    blue: "hover:border-cyan-400/50 hover:shadow-[0_0_20px_rgba(6,182,212,0.15)]",
    purple: "hover:border-purple-400/50 hover:shadow-[0_0_20px_rgba(167,139,250,0.15)]",
    yellow: "hover:border-amber-400/50 hover:shadow-[0_0_20px_rgba(245,158,11,0.15)]"
  };

  return (
    <div className={`rounded-3xl border border-cyan-400/10 bg-slate-950/60 p-5 backdrop-blur-xl transition-all duration-300 ${glows[glowColor]}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-cyan-100/50">{label}</span>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/40 border border-cyan-400/5">
          {icon}
        </div>
      </div>
      <div className="mt-3 text-3xl font-black text-white">{value}</div>
    </div>
  );
}
