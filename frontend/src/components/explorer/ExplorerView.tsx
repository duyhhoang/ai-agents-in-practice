"use client";

import { useEffect, useState, useMemo } from "react";
import { 
  Network, 
  Search, 
  Settings, 
  Info, 
  Maximize2, 
  LayoutGrid, 
  FileCode 
} from "lucide-react";
import CytoscapeGraph from "../graph/CytoscapeGraph";

import type { EvidenceNode, EvidenceEdge, EvidenceGraph } from "@/types/evidence";

export default function ExplorerView() {
  const [search, setSearch] = useState("");
  const [depth, setDepth] = useState(2);
  const [graph, setGraph] = useState<EvidenceGraph>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<EvidenceNode | null>(null);
  
  // PlantUML modal state
  const [pumlCode, setPumlCode] = useState("");
  const [showPumlModal, setShowPumlModal] = useState(false);
  const [loadingPuml, setLoadingPuml] = useState(false);

  // Client-side parser for Neo4j JSON results returned from /api/query
  function parseNeo4jRecords(results: any[]): EvidenceGraph {
    const nodesMap = new Map<string, EvidenceNode>();
    const edgesMap = new Map<string, EvidenceEdge>();

    function isNode(obj: any): boolean {
      return obj && typeof obj === "object" && Array.isArray(obj.labels) && typeof obj.properties === "object";
    }

    function isRelationship(obj: any): boolean {
      return obj && typeof obj === "object" && typeof obj.type === "string" && typeof obj.properties === "object" &&
        ((obj.start !== undefined && obj.end !== undefined) || (obj.startNodeElementId !== undefined && obj.endNodeElementId !== undefined));
    }

    function getNeo4jId(obj: any): string {
      if (obj.elementId !== undefined) return String(obj.elementId);
      if (obj.identity !== undefined) return String(obj.identity);
      
      const props = obj.properties || {};
      const businessId = props.actor_id || props.location_code || props.unit_id || props.material_id || props.process_id;
      if (businessId) return String(businessId);
      
      return "";
    }

    function extractNode(node: any) {
      const id = getNeo4jId(node);
      if (!id) return;
      
      const props = node.properties || {};
      const label = node.labels[0] || "Entity";
      const name = props.name || props.actor_name || props.location_name || props.material_name || props.serial_number || props.process_name || id;
      
      nodesMap.set(id, {
        id,
        label,
        name,
        type: label,
        properties: props
      });
    }

    function extractRelationship(rel: any) {
      const props = rel.properties || {};
      const startId = rel.startNodeElementId !== undefined ? String(rel.startNodeElementId) :
                      rel.start !== undefined ? String(rel.start) : "";
      const endId = rel.endNodeElementId !== undefined ? String(rel.endNodeElementId) :
                    rel.end !== undefined ? String(rel.end) : "";
      
      if (startId && endId) {
        const type = rel.type || "RELATED_TO";
        const edgeId = rel.elementId !== undefined ? String(rel.elementId) : `${startId}-${type}-${endId}`;
        edgesMap.set(edgeId, {
          id: edgeId,
          source: startId,
          target: endId,
          type,
          properties: props
        });
      }
    }

    function traverse(val: any) {
      if (!val) return;
      if (isNode(val)) {
        extractNode(val);
      } else if (isRelationship(val)) {
        extractRelationship(val);
      } else if (Array.isArray(val)) {
        val.forEach(traverse);
      } else if (typeof val === "object") {
        Object.values(val).forEach(traverse);
      }
    }

    traverse(results);

    return {
      nodes: Array.from(nodesMap.values()),
      edges: Array.from(edgesMap.values())
    };
  }

  // Load the graph from the backend
  async function loadGraph(searchVal = "") {
    setLoading(true);
    setSelectedNode(null);
    try {
      let query = "";
      let params: Record<string, any> = {};

      if (searchVal.trim()) {
        params.search = `(?i).*${searchVal.trim()}.*`;
        query = `
          MATCH (n)
          WHERE NOT n:ProcessedFile AND (
            n.actor_name =~ $search OR 
            n.location_name =~ $search OR 
            n.material_name =~ $search OR 
            n.process_name =~ $search OR 
            n.unit_id =~ $search OR
            n.actor_id =~ $search OR
            n.material_id =~ $search
          )
          OPTIONAL MATCH (n)-[r]-(m)
          WHERE NOT m:ProcessedFile
          RETURN n, r, m LIMIT 150
        `;
      } else {
        query = `
          MATCH (n)
          WHERE NOT n:ProcessedFile
          OPTIONAL MATCH (n)-[r]-(m)
          WHERE NOT m:ProcessedFile
          RETURN n, r, m LIMIT 120
        `;
      }

      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, params })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.results) {
          const parsed = parseNeo4jRecords(data.results);
          setGraph(parsed);
        }
      }
    } catch (err) {
      console.error("Failed to load network graph:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGraph();
  }, []);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    loadGraph(search);
  }

  // Generate PlantUML code via /api/diagram
  async function handleGeneratePlantUML() {
    if (graph.nodes.length === 0) return;
    setLoadingPuml(true);
    setShowPumlModal(true);
    try {
      const res = await fetch("/api/diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodes: graph.nodes,
          relationships: graph.edges
        })
      });
      if (res.ok) {
        const text = await res.text();
        setPumlCode(text);
      } else {
        setPumlCode("Failed to generate PlantUML diagram from backend.");
      }
    } catch (err: any) {
      setPumlCode(`Error: ${err.message}`);
    } finally {
      setLoadingPuml(false);
    }
  }

  // Legend list helper
  const legendItems = [
    { label: "Station", color: "bg-[#22c55e]" },
    { label: "Process", color: "bg-[#0891b2]" },
    { label: "Actor", color: "bg-[#a78bfa]" },
    { label: "Location", color: "bg-[#16a34a]" },
    { label: "Material", color: "bg-[#f97316]" },
    { label: "Transport", color: "bg-[#8b5cf6]" }
  ];

  return (
    <div className="flex h-screen w-full min-h-0 flex-col bg-[#020617] text-cyan-50">
      {/* Top Header Controls */}
      <header className="flex h-20 shrink-0 items-center justify-between border-b border-cyan-400/20 bg-slate-950/70 px-8 backdrop-blur-xl">
        <div>
          <div className="text-xs uppercase tracking-[0.4em] text-cyan-300">Database Topology</div>
          <h1 className="text-2xl font-black tracking-widest text-white mt-0.5">NETWORK EXPLORER</h1>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex items-center gap-3">
          <div className="relative h-10 w-64">
            <input
              type="text"
              placeholder="Search actors, stations, materials..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-full w-full rounded-xl border border-cyan-400/20 bg-black/40 pl-10 pr-4 text-xs text-cyan-50 placeholder:text-cyan-100/30 outline-none focus:border-cyan-300 transition"
            />
            <Search className="absolute left-3.5 top-3 text-cyan-100/30" size={14} />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex h-10 items-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-400/15 px-4 text-xs font-bold text-cyan-100 hover:bg-cyan-400/25 transition disabled:opacity-40"
          >
            Apply Search
          </button>

          <button
            type="button"
            onClick={handleGeneratePlantUML}
            disabled={loading || graph.nodes.length === 0}
            className="flex h-10 items-center gap-2 rounded-xl border border-cyan-400/20 bg-slate-900/40 px-4 text-xs font-semibold text-cyan-100 hover:bg-slate-900/80 transition disabled:opacity-40"
          >
            <FileCode size={14} />
            PlantUML
          </button>
        </form>
      </header>

      {/* Main split dashboard area */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-[1fr_360px] min-h-0">
        {/* Left Side: Graph Canvas */}
        <div className="relative h-full w-full flex flex-col bg-slate-950/20">
          {/* Legend and stats panel overlay */}
          <div className="absolute left-5 top-5 z-20 rounded-2xl border border-cyan-400/15 bg-slate-950/90 p-4 backdrop-blur-xl pointer-events-auto flex flex-col gap-3 max-w-[280px]">
            <div className="border-b border-cyan-400/10 pb-2">
              <h3 className="text-[10px] uppercase tracking-[0.25em] font-bold text-cyan-300">Graph Statistics</h3>
              <p className="text-xs text-white font-mono mt-1 font-bold">
                {loading ? "Refreshing..." : `${graph.nodes.length} nodes · ${graph.edges.length} relationships`}
              </p>
            </div>
            <div>
              <h4 className="text-[9px] uppercase tracking-[0.2em] font-bold text-cyan-100/50 mb-2">Legend</h4>
              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                {legendItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-cyan-100/70">
                    <span className={`h-2 w-2 rounded-full ${item.color}`} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Cytoscape view canvas */}
          <div className="flex-1 h-full w-full">
            {loading ? (
              <div className="h-full w-full flex items-center justify-center font-mono text-xs text-cyan-100/40">
                Traversing Neo4j database records...
              </div>
            ) : graph.nodes.length === 0 ? (
              <div className="h-full w-full flex items-center justify-center px-8 text-center">
                <div className="rounded-3xl border border-cyan-400/15 bg-slate-950/60 px-7 py-6 backdrop-blur-xl">
                  <p className="text-sm font-bold text-white">No elements matched.</p>
                  <p className="mt-1.5 text-xs text-cyan-100/50 leading-relaxed font-mono">
                    Alter search criteria and click Apply Search.
                  </p>
                </div>
              </div>
            ) : (
              <CytoscapeGraph graph={graph} onSelectNode={setSelectedNode} />
            )}
          </div>
        </div>

        {/* Right Side: Properties Panel */}
        <aside className="border-l border-cyan-400/20 bg-slate-950/50 p-6 flex flex-col h-full overflow-y-auto">
          <h2 className="text-sm font-bold text-cyan-300 uppercase tracking-widest flex items-center gap-2 border-b border-cyan-400/10 pb-4 mb-4 shrink-0">
            <Info size={16} />
            Element Properties
          </h2>

          {selectedNode ? (
            <div className="space-y-6 flex-1 min-h-0">
              <div>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-950/40 text-cyan-400 border border-cyan-400/25 uppercase tracking-wider">
                  {selectedNode.type}
                </span>
                <h3 className="text-xl font-extrabold text-white mt-3 tracking-wide">{selectedNode.name}</h3>
                <p className="text-xs text-cyan-100/40 font-mono mt-1 break-all">ID: {selectedNode.id}</p>
              </div>

              <div className="border-t border-cyan-400/10 pt-4">
                <h4 className="text-[10px] uppercase tracking-[0.2em] font-bold text-cyan-300 mb-3">Attributes</h4>
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                  {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 ? (
                    Object.entries(selectedNode.properties).map(([key, val]) => (
                      <div key={key} className="rounded-xl border border-cyan-400/5 bg-black/20 p-3 font-mono text-[11px] leading-relaxed">
                        <span className="text-cyan-400 block text-[9px] uppercase tracking-wider mb-0.5">{key}</span>
                        <span className="text-white break-words">
                          {val === null || val === undefined ? "—" : String(val)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs font-mono text-cyan-100/35">No properties associated with this node.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center p-4">
              <div className="text-cyan-100/40 font-mono text-xs">
                Click any node on the Cytoscape canvas to inspect its database attributes.
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* PlantUML Modal */}
      {showPumlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl rounded-3xl border border-cyan-400/30 bg-[#020617] p-6 shadow-[0_0_50px_rgba(34,211,238,0.2)]">
            <div className="flex items-center justify-between border-b border-cyan-400/10 pb-4 mb-4">
              <h3 className="text-lg font-bold text-white tracking-wider">Generated PlantUML Code</h3>
              <button
                onClick={() => setShowPumlModal(false)}
                className="rounded-full border border-cyan-400/20 px-3 py-1 text-xs text-cyan-100 hover:bg-slate-900 transition"
              >
                Close
              </button>
            </div>
            
            {loadingPuml ? (
              <div className="h-96 flex items-center justify-center font-mono text-xs text-cyan-100/40">
                Compiling Node relations to PlantUML syntax...
              </div>
            ) : (
              <div className="space-y-4">
                <textarea
                  readOnly
                  value={pumlCode}
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                  className="w-full h-96 rounded-2xl border border-cyan-400/10 bg-black/60 p-4 font-mono text-xs text-cyan-100 outline-none focus:border-cyan-400/30 transition resize-none"
                />
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(pumlCode);
                      alert("PlantUML code copied to clipboard!");
                    }}
                    className="flex h-10 items-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-400/15 px-4 text-xs font-bold text-cyan-100 hover:bg-cyan-400/25 transition"
                  >
                    Copy to Clipboard
                  </button>
                  <button
                    onClick={() => setShowPumlModal(false)}
                    className="flex h-10 items-center gap-2 rounded-xl border border-cyan-400/20 bg-slate-900/40 px-4 text-xs font-semibold text-cyan-100 hover:bg-slate-900/80 transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
