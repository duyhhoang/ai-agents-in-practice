"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Layers,
  MapPin,
  Users,
  HelpCircle,
  X,
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
  start_date?: string;
  end_date?: string;
};

export default function DashboardView() {
  const [stats, setStats] = useState<Stat>({
    stations: 0,
    processes: 0,
    actors: 0,
    locations: 0,
  });

  const [loadingStats, setLoadingStats] = useState(true);
  const [units, setUnits] = useState<string[]>([]);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [lifecycle, setLifecycle] = useState<ProcessStep[]>([]);
  const [loadingLifecycle, setLoadingLifecycle] = useState(false);
  const [selectedStep, setSelectedStep] = useState<ProcessStep | null>(null);

  useEffect(() => {
    async function fetchStats() {
      setLoadingStats(true);

      try {
        const query = `
CALL {
  MATCH (cs:ChargingStation)
  WHERE coalesce(cs.is_master_record, false) = true
  RETURN count(cs) AS station_count
}
CALL {
  MATCH (p:Process)
  WHERE coalesce(p.is_master_record, false) = false
  RETURN count(p) AS process_count
}
CALL {
  MATCH (a:Actor)
  WHERE coalesce(a.is_master_record, false) = true
  RETURN count(a) AS actor_count
}
CALL {
  MATCH (cs:ChargingStation)
  WHERE coalesce(cs.is_master_record, false) = true
    AND cs.installation_site_id IS NOT NULL
  RETURN count(DISTINCT cs.installation_site_id) AS location_count
}
RETURN station_count, process_count, actor_count, location_count
        `;

        const res = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });

        if (res.ok) {
          const data = await res.json();
          const row = data.results?.[0];

          if (row) {
            setStats({
              stations: Number(row.station_count || 0),
              processes: Number(row.process_count || 0),
              actors: Number(row.actor_count || 0),
              locations: Number(row.location_count || 0),
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
        const query = `
MATCH (cs:ChargingStation)
WHERE coalesce(cs.is_master_record, false) = true
RETURN cs.unit_id AS unitId
ORDER BY unitId
        `;

        const res = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });

        if (res.ok) {
          const data = await res.json();
          const list = (data.results || [])
            .map((r: any) => r.unitId as string)
            .filter(Boolean);

          setUnits(list);

          if (list.length > 0) {
            setSelectedUnit(list[0]);
          }
        }
      } catch (err) {
        console.error("Failed to load charging station units:", err);
      }
    }

    fetchStats();
    fetchUnits();
  }, []);

  useEffect(() => {
    if (!selectedUnit) return;

    async function fetchLifecycle() {
      setLoadingLifecycle(true);
      setSelectedStep(null);

      try {
        const query = `
MATCH (cs:ChargingStation {unit_id: $unitId})
WHERE coalesce(cs.is_master_record, false) = true

CALL {
  WITH cs
  MATCH (p:Process)
  WHERE p.unit_id = cs.unit_id
  RETURN p

  UNION

  WITH cs
  MATCH (p:Process)-[:UNDERGOES|FOR_STATION|FOR_UNIT]-(cs)
  RETURN p
}

OPTIONAL MATCH (p)-[:EXECUTED_BY]-(a:Actor)

RETURN DISTINCT
  coalesce(p.process_id, p.id, p._entity_id) AS process_id,
  coalesce(p.process_name, p.display_name, p.process_id, p._entity_id) AS process_name,
  coalesce(p.lifecycle_phase, p.phase, "Lifecycle") AS phase,
  coalesce(p.cost_eur, p.cost, 0) AS cost,
  coalesce(p.duration_days, p.duration, 0) AS duration,
  coalesce(p.status, "UNKNOWN") AS status,
  coalesce(a.actor_name, a.display_name, a.actor_id, p.actor_id) AS actor,
  p.start_date AS start_date,
  p.end_date AS end_date
ORDER BY process_id
        `;

        const res = await fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            params: {
              unitId: selectedUnit,
            },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setLifecycle((data.results || []) as ProcessStep[]);
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
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-[#0065bd] font-bold">
            Operational Overview
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 mt-1">
            LIFECYCLE DASHBOARD
          </h1>
        </div>

        <div className="group relative flex items-center gap-1.5 text-slate-400 hover:text-slate-600 cursor-pointer">
          <HelpCircle size={16} />
          <span className="text-xs">Dashboard Help</span>
          <div className="pointer-events-none absolute right-0 top-6 z-50 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs text-slate-600 leading-normal">
            This dashboard uses canonical master ChargingStation nodes and structured Process rows from the Neo4j knowledge graph.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard
          icon={<Activity className="text-[#0065bd]" size={18} />}
          label="Charging Stations"
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
          label="Installation Sites"
          value={loadingStats ? "..." : stats.locations.toString()}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5 mb-5">
            <div>
              <h2 className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
                <Activity className="text-[#0065bd]" size={18} />
                End-to-End Unit Lifecycle Tracer
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Select a physical EV charging unit to retrieve its structured process path.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Select Unit:
              </span>
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

          {loadingLifecycle ? (
            <div className="h-64 flex items-center justify-center text-slate-400 font-mono text-xs">
              Querying Graph Database...
            </div>
          ) : lifecycle.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 font-mono text-xs">
              No processes logged for this unit.
            </div>
          ) : (
            <div className="relative pl-6 border-l border-slate-200 space-y-4 ml-4 py-1">
              {lifecycle.map((step) => {
                const normalizedStatus = String(step.status || "").toLowerCase();
                const isCompleted = ["completed", "closed", "done"].includes(normalizedStatus);
                const isSelected = selectedStep?.process_id === step.process_id;

                return (
                  <div key={step.process_id} className="relative">
                    <span
                      className={`absolute -left-[31px] top-3 flex h-4 w-4 items-center justify-center rounded-full border bg-white shadow-sm transition-all duration-200 ${
                        isCompleted ? "border-emerald-500" : "border-amber-500"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isCompleted ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                      />
                    </span>

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
                          <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                            {step.process_id}
                          </span>
                          <h4 className="text-sm font-bold text-slate-800 tracking-tight mt-0.5">
                            {step.process_name}
                          </h4>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                              isCompleted
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                : "bg-amber-50 text-amber-700 border border-amber-100"
                            }`}
                          >
                            {step.status || "UNKNOWN"}
                          </span>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider">
                            {step.phase || "UNKNOWN"}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4 text-xs font-mono text-slate-600">
                        <div>
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider block">
                            Duration
                          </span>
                          <span className="font-semibold text-slate-700">
                            {Number(step.duration || 0)} days
                          </span>
                        </div>

                        <div>
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider block">
                            Cost
                          </span>
                          <span className="font-semibold text-slate-700">
                            {Number(step.cost || 0).toLocaleString()} EUR
                          </span>
                        </div>

                        <div>
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider block">
                            Actor
                          </span>
                          <span className="font-semibold text-slate-700 truncate block">
                            {step.actor || "Unassigned"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

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
                <h4 className="text-md font-bold text-slate-900 mt-2">
                  {selectedStep.process_name}
                </h4>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  ID: {selectedStep.process_id}
                </p>
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-3 text-xs">
                <DetailRow label="Status" value={selectedStep.status || "Unknown"} />
                <DetailRow label="Duration" value={`${Number(selectedStep.duration || 0)} days`} />
                <DetailRow label="Operational Cost" value={`${Number(selectedStep.cost || 0).toLocaleString()} EUR`} />
                <DetailRow label="Assigned Actor" value={selectedStep.actor || "Internal Resources"} />
                <DetailRow label="Target Unit" value={selectedUnit} />
                <DetailRow label="Start Date" value={selectedStep.start_date || "—"} />
                <DetailRow label="End Date" value={selectedStep.end_date || "—"} />
              </div>

              <div className="mt-2 rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs text-slate-500 leading-normal">
                <div className="font-bold text-slate-700 text-[10px] uppercase tracking-wider mb-1">
                  Knowledge Notes
                </div>
                This step is loaded from structured lifecycle process records connected to the selected charging station.
              </div>
            </div>
          ) : (
            <div className="text-center py-10 px-4 text-slate-400 text-xs font-mono">
              Click any process card on the left to inspect its detailed parameters and logs.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex justify-between py-1.5 border-b border-slate-50 font-mono gap-4">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-slate-800 text-right">{value}</span>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {label}
        </span>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 border border-slate-100">
          {icon}
        </div>
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
