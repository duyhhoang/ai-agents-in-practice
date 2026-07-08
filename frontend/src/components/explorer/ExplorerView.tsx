"use client";

import { useEffect, useState, useMemo } from "react";
import { 
  Network, 
  Search, 
  Info, 
  FileCode,
  Play,
  AlertTriangle,
  X,
  HelpCircle,
  SlidersHorizontal,
  Pointer,
  BoxSelect,
  ChevronLeft,
  ChevronRight,
  Sliders
} from "lucide-react";
import CytoscapeGraph from "../graph/CytoscapeGraph";
import clsx from "clsx";

import type { EvidenceNode, EvidenceEdge, EvidenceGraph } from "@/types/evidence";

type ExplorerViewProps = {
  isActive?: boolean;
};

export default function ExplorerView({ isActive = true }: ExplorerViewProps) {
  const [search, setSearch] = useState("");
  const [graph, setGraph] = useState<EvidenceGraph>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState<EvidenceNode | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string>("");
  
  // Custom Cypher console & Search mode state
  const [searchMode, setSearchMode] = useState<"amateur" | "cypher">("amateur");
  const [customCypher, setCustomCypher] = useState(
    "MATCH (n) WHERE NOT n:ProcessedFile OPTIONAL MATCH (n)-[r]-(m) WHERE NOT m:ProcessedFile RETURN n, r, m LIMIT 80"
  );
  const [cypherError, setCypherError] = useState("");
  
  // Guided search parameters (Data-Agnostic)
  const [dbLabels, setDbLabels] = useState<string[]>([]);
  const [amateurType, setAmateurType] = useState("All");
  const [amateurTerm, setAmateurTerm] = useState("");
  const [resultLimit, setResultLimit] = useState(80);

  // Layout & Mouse Mode controls
  const [layoutName, setLayoutName] = useState<"directed" | "organic" | "circle">("organic");
  const [mouseMode, setMouseMode] = useState<"pan" | "select">("pan");

  // Collapsible view sidebars
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);

  // Client-side filtering of categories (Data-Agnostic)
  const [hiddenLabels, setHiddenLabels] = useState<Set<string>>(new Set());

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
      const businessId = props.actor_id || props.location_code || props.unit_id || props.material_id || props.process_id || props.canonical_id || props.id;
      if (businessId) return String(businessId);
      
      return "";
    }

    function extractNode(node: any) {
      const id = getNeo4jId(node);
      if (!id) return;
      
      const props = node.properties || {};
      const label = node.labels[0] || "Entity";
      const name = props.name || props.actor_name || props.location_name || props.material_name || props.serial_number || props.process_name || props.title || id;
      
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

  // Load database labels on mount for Guided Search dropdown
  async function fetchDbLabels() {
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "CALL db.labels() YIELD label RETURN label" })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.results) {
          const labels = data.results
            .map((r: any) => r.label as string)
            .filter((l: string) => l && l !== "ProcessedFile" && l !== "ProcessedChunk");
          setDbLabels(labels);
        }
      }
    } catch (err) {
      console.warn("Failed to retrieve db labels for guided dropdown:", err);
    }
  }

  // Load graph from Cypher query
  async function runQuery(queryText: string, params?: Record<string, any>) {
    setLoading(true);
    setCypherError("");
    setSelectedNode(null);
    setFocusedNodeId("");

    // Read-only safety validation
    const forbidden = ["create", "merge", "delete", "set", "remove", "drop", "detach"];
    const lowerQuery = queryText.toLowerCase();
    for (const word of forbidden) {
      if (new RegExp(`\\b${word}\\b`).test(lowerQuery)) {
        setCypherError(`Warning: Modifying keyword '${word}' detected. Cypher query explorer is read-only.`);
        setLoading(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryText, params })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.results) {
          const parsed = parseNeo4jRecords(data.results);
          setGraph(parsed);
        } else if (data.error) {
          setCypherError(data.error);
        }
      } else {
        const data = await res.json().catch(() => null);
        setCypherError(data?.error || data?.details || `HTTP error ${res.status}`);
      }
    } catch (err: any) {
      console.error("Failed to run Cypher:", err);
      setCypherError(err.message || "Connection error.");
    } finally {
      setLoading(false);
    }
  }

  // Executes amateur guided query compilation
  function handleAmateurSearch(e: React.FormEvent) {
    e.preventDefault();
    let query = "";
    let queryParams: Record<string, any> | undefined = undefined;
    const term = amateurTerm.trim();
    
    if (!term) {
      if (amateurType === "All") {
        query = `MATCH (n) WHERE NOT n:ProcessedFile AND NOT n:ProcessedChunk OPTIONAL MATCH (n)-[r]-(m) WHERE NOT m:ProcessedFile AND NOT m:ProcessedChunk RETURN n, r, m LIMIT ${resultLimit}`;
      } else {
        query = `MATCH (n:${amateurType}) OPTIONAL MATCH (n)-[r]-(m) WHERE NOT m:ProcessedFile AND NOT m:ProcessedChunk RETURN n, r, m LIMIT ${resultLimit}`;
      }
    } else {
      const sanitizedTerm = term.replace(/[\\^$*+?.()|[\]{}]/g, "\\$&").replace(/'/g, "\\'");
      const searchRegex = `(?i).*${sanitizedTerm}.*`;
      queryParams = { searchTerm: searchRegex };
      
      if (amateurType === "All") {
        query = `
          MATCH (n)
          WHERE NOT n:ProcessedFile AND NOT n:ProcessedChunk AND (
            n.actor_name =~ $searchTerm OR 
            n.location_name =~ $searchTerm OR 
            n.material_name =~ $searchTerm OR 
            n.process_name =~ $searchTerm OR 
            n.unit_id =~ $searchTerm OR
            n.actor_id =~ $searchTerm OR
            n.material_id =~ $searchTerm OR
            n.process_id =~ $searchTerm OR
            n.name =~ $searchTerm OR
            any(key in keys(n) WHERE toString(n[key]) =~ $searchTerm)
          )
          OPTIONAL MATCH (n)-[r]-(m)
          WHERE NOT m:ProcessedFile AND NOT m:ProcessedChunk
          RETURN n, r, m LIMIT ${resultLimit}
        `;
      } else {
        const searchFields = 
          amateurType === "ChargingStation" ? ["n.unit_id", "n.serial_number", "n.product_variant"] :
          amateurType === "Process" ? ["n.process_name", "n.process_id", "n.lifecycle_phase"] :
          amateurType === "Actor" ? ["n.actor_name", "n.actor_id"] :
          amateurType === "Location" ? ["n.location_name", "n.location_code"] :
          amateurType === "Material" ? ["n.material_name", "n.material_id"] :
          amateurType === "Transport" ? ["n.transport_id"] : [];
        
        let whereClause = "";
        if (searchFields.length > 0) {
          whereClause = searchFields.map(f => `${f} =~ $searchTerm`).join(" OR ");
        } else {
          whereClause = `any(key in keys(n) WHERE toString(n[key]) =~ $searchTerm)`;
        }

        query = `
          MATCH (n:${amateurType})
          WHERE ${whereClause}
          OPTIONAL MATCH (n)-[r]-(m)
          WHERE NOT m:ProcessedFile AND NOT m:ProcessedChunk
          RETURN n, r, m LIMIT ${resultLimit}
        `;
      }
    }
    runQuery(query, queryParams);
  }

  // Load configuration defaults and dynamic labels query
  useEffect(() => {
    fetchDbLabels();
    let defaultLimit = 80;
    if (typeof window !== "undefined") {
      defaultLimit = Number(window.localStorage.getItem("scales_explorer_limit")) || 80;
      setResultLimit(defaultLimit);
    }
    const initialCypher = `MATCH (n) WHERE NOT n:ProcessedFile OPTIONAL MATCH (n)-[r]-(m) WHERE NOT m:ProcessedFile RETURN n, r, m LIMIT ${defaultLimit}`;
    setCustomCypher(initialCypher);
    runQuery(initialCypher);
  }, []);

  const handleConsoleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runQuery(customCypher);
  };

  // Client-side filtering of graph nodes and edges based on hidden categories
  const filteredGraph = useMemo(() => {
    const nodes = graph.nodes.filter(n => {
      return !hiddenLabels.has(n.type);
    });

    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = graph.edges.filter(
      e => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    return { nodes, edges };
  }, [graph, hiddenLabels]);

  // Extract unique labels present in the active graph dynamically (data-agnostic layout)
  const activeLabels = useMemo(() => {
    const labels = new Set<string>();
    graph.nodes.forEach(n => {
      if (n.type) labels.add(n.type);
    });
    return Array.from(labels).sort();
  }, [graph.nodes]);

  // Sidebar list search filtering matching visible nodes
  const sidebarSearchNodes = useMemo(() => {
    if (!search.trim()) return filteredGraph.nodes;
    const term = search.toLowerCase();
    return filteredGraph.nodes.filter(
      n => n.name.toLowerCase().includes(term) || (n.id && n.id.toLowerCase().includes(term))
    );
  }, [filteredGraph.nodes, search]);

  const toggleTypeVisibility = (label: string) => {
    setHiddenLabels((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const handleSidebarNodeClick = (node: EvidenceNode) => {
    setSelectedNode(node);
    setFocusedNodeId(node.id);
  };

  // Node coloring function
  const typeColors: Record<string, string> = {
    ChargingStation: "bg-[#22c55e] border-[#16a34a]",
    Process: "bg-[#0891b2] border-[#0891b2]",
    Actor: "bg-[#a78bfa] border-[#8b5cf6]",
    Location: "bg-[#16a34a] border-[#15803d]",
    Material: "bg-[#f97316] border-[#ea580c]",
    Transport: "bg-[#8b5cf6] border-[#7c3aed]",
    Supplier: "bg-[#2563eb] border-[#1d4ed8]"
  };

  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-slate-50 text-slate-800">
      {/* Header Controls */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 shadow-sm">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#0065bd]">Database Topology</div>
          <h1 className="text-xl font-bold text-slate-900">NETWORK EXPLORER</h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="group relative flex items-center gap-1.5 text-slate-400 hover:text-slate-600 cursor-pointer">
            <HelpCircle size={16} />
            <span className="text-xs">Explorer Help</span>
            <div className="pointer-events-none absolute right-0 top-6 z-50 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs text-slate-600 leading-normal font-sans font-normal">
              This explorer visualizes the supply chain network database directly. Use the left column to search nodes, toggle category visibility filters, or execute queries. Click any node to inspect its attributes.
            </div>
          </div>
        </div>
      </header>

      {/* Main split dashboard area */}
      <div className="flex-1 flex min-h-0 relative">
        
        {/* Left Side: Search, Filters & Cypher Console (Collapsible) */}
        <aside className={clsx(
          "shrink-0 bg-white flex flex-col gap-4 overflow-y-auto overflow-x-hidden shadow-sm transition-all duration-300 relative",
          sidebarCollapsed ? "w-0 border-r-0 opacity-0 overflow-hidden p-0" : "w-[320px] border-r border-slate-200 p-4"
        )}>
          {/* Guided Search vs Cypher toggle */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold shrink-0">
            <button
              onClick={() => { setSearchMode("amateur"); setCypherError(""); }}
              className={`flex-1 py-1 rounded-md text-center transition ${
                searchMode === "amateur" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              Guided Search
            </button>
            <button
              onClick={() => { setSearchMode("cypher"); setCypherError(""); }}
              className={`flex-1 py-1 rounded-md text-center transition ${
                searchMode === "cypher" ? "bg-white text-[#0065bd] shadow-sm" : "text-slate-500 hover:text-[#0065bd]"
              }`}
            >
              Cypher Console
            </button>
          </div>

          {/* Search Inputs based on mode */}
          {searchMode === "amateur" ? (
            <form onSubmit={handleAmateurSearch} className="space-y-3 border-b border-slate-100 pb-4 shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Guided Query Parameters</h3>
                <div className="group relative cursor-pointer text-slate-400 hover:text-slate-600">
                  <HelpCircle size={14} />
                  <div className="pointer-events-none absolute right-6 -top-4 z-50 w-52 rounded-lg border border-slate-200 bg-white p-2.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-[10px] text-slate-500 font-sans font-normal leading-normal normal-case">
                    Guided Search automatically compiles node types, search terms, and limit parameters into Cypher queries behind the scenes.
                  </div>
                </div>
              </div>
              
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Node Category</span>
                <select
                  value={amateurType}
                  onChange={(e) => setAmateurType(e.target.value)}
                  className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-800 outline-none focus:border-[#0065bd] transition"
                >
                  <option value="All">All Categories</option>
                  {dbLabels.map((lbl) => (
                    <option key={lbl} value={lbl}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Search Term</span>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Enter keywords (e.g. Munich)..."
                    value={amateurTerm}
                    onChange={(e) => setAmateurTerm(e.target.value)}
                    className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 outline-none focus:border-[#0065bd] transition"
                  />
                </div>
              </div>

              {/* Slider Result Limit Control */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase">
                  <span>Fetch limit</span>
                  <span>{resultLimit} nodes</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="350"
                  step="10"
                  value={resultLimit}
                  onChange={(e) => setResultLimit(Number(e.target.value))}
                  className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0065bd]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#0065bd] text-white text-xs font-bold hover:bg-[#005293] transition disabled:opacity-40"
              >
                <Search size={12} /> Apply Search
              </button>
            </form>
          ) : (
            <form onSubmit={handleConsoleSubmit} className="flex flex-col gap-2 border-b border-slate-100 pb-4 shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1">
                  <FileCode size={13} className="text-[#0065bd]" />
                  Cypher Console
                </h3>
                <button
                  type="submit"
                  disabled={loading || !customCypher.trim()}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#0065bd] text-white text-[10px] font-bold hover:bg-[#005293] transition disabled:opacity-40"
                >
                  <Play size={8} /> Execute
                </button>
              </div>

              <textarea
                value={customCypher}
                onChange={(e) => setCustomCypher(e.target.value)}
                className="h-32 w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[10px] text-slate-700 outline-none focus:border-[#0065bd] transition resize-none leading-normal"
                placeholder="MATCH (n) RETURN n LIMIT 50..."
              />
            </form>
          )}

          {/* Database error reports */}
          {cypherError && (
            <div className="rounded-lg bg-rose-50 border border-rose-100 p-2.5 text-[10px] text-rose-600 leading-normal flex items-start gap-1 max-h-24 overflow-y-auto shrink-0">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              <span>{cypherError}</span>
            </div>
          )}

          {/* Node Search & List selection */}
          <div className="space-y-2 border-b border-slate-100 pb-3 shrink-0">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Canvas Node List</h3>
            <div className="relative">
              <input
                type="text"
                placeholder="Filter catalog list..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-800 outline-none focus:border-[#0065bd] transition"
              />
              <Search className="absolute left-2.5 top-2.5 text-slate-400" size={12} />
            </div>
            
            {/* Matching nodes list */}
            <div className="max-h-[140px] overflow-y-auto border border-slate-100 rounded-lg bg-slate-50/50 p-1.5 text-xs font-mono space-y-1">
              {sidebarSearchNodes.length === 0 ? (
                <div className="text-[10px] text-slate-400 text-center py-2">No matching nodes in canvas</div>
              ) : (
                sidebarSearchNodes.map(node => (
                  <div
                    key={node.id}
                    onClick={() => handleSidebarNodeClick(node)}
                    className={`cursor-pointer px-2 py-1 rounded text-[11px] truncate transition ${
                      focusedNodeId === node.id 
                        ? "bg-[#0065bd] text-white font-semibold" 
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    <span className="text-[9px] font-bold opacity-60 uppercase mr-1.5">[{node.type}]</span>
                    {node.name}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Data-Agnostic Visibility Checkbox Filters */}
          <div className="space-y-2 pb-2 shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Canvas Category Toggle</h3>
              <div className="group relative cursor-pointer text-slate-400 hover:text-slate-600">
                <HelpCircle size={14} />
                <div className="pointer-events-none absolute right-6 -top-4 z-50 w-52 rounded-lg border border-slate-200 bg-white p-2.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-[10px] text-slate-500 font-sans font-normal leading-normal normal-case">
                  Displays only the categories currently fetched and visible on the canvas. Hides or shows nodes on the screen without re-querying the database.
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-medium">
              {activeLabels.length === 0 ? (
                <span className="text-[10px] text-slate-400 italic col-span-2">No nodes on canvas</span>
              ) : (
                activeLabels.map((lbl) => {
                  const colorClass = typeColors[lbl] || "bg-slate-400 border-slate-500";
                  return (
                    <label 
                      key={lbl} 
                      className="flex items-center gap-1.5 cursor-pointer text-slate-600 hover:text-slate-900 transition"
                    >
                      <input
                        type="checkbox"
                        checked={!hiddenLabels.has(lbl)}
                        onChange={() => toggleTypeVisibility(lbl)}
                        className="rounded text-[#0065bd] focus:ring-[#0065bd] border-slate-300 h-3.5 w-3.5"
                      />
                      <span className={`h-2.5 w-2.5 rounded-full ${colorClass} border border-black/10`} />
                      <span>{lbl}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {/* Toggle Left Sidebar Button */}
        <button 
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-30 h-8 w-6 bg-white border border-slate-200 border-l-0 rounded-r-lg flex items-center justify-center text-slate-400 hover:text-slate-700 shadow-sm transition hover:bg-slate-50 cursor-pointer"
          title={sidebarCollapsed ? "Expand Search Filters" : "Collapse Search Filters"}
        >
          {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>

        {/* Center: Graph Canvas */}
        <div className="flex-1 relative h-full bg-slate-100 flex flex-col min-w-0">
          {/* Top Canvas Toolbar (Layout & Mouse Selection Controls) */}
          <div className="shrink-0 flex items-center justify-between bg-white border-b border-slate-200 p-2.5 px-4 z-20">
            {/* Interactive Layout Selection */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Layout:</span>
              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold">
                <button
                  onClick={() => setLayoutName("organic")}
                  className={`px-3 py-1 rounded-md transition ${
                    layoutName === "organic" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                  title="Force-directed organic cose layout"
                >
                  Organic
                </button>
                <button
                  onClick={() => setLayoutName("directed")}
                  className={`px-3 py-1 rounded-md transition ${
                    layoutName === "directed" ? "bg-white text-[#0065bd] shadow-sm" : "text-slate-500 hover:text-[#0065bd]"
                  }`}
                  title="Directed hierarchical layout (top-down)"
                >
                  Top-Down
                </button>
                <button
                  onClick={() => setLayoutName("circle")}
                  className={`px-3 py-1 rounded-md transition ${
                    layoutName === "circle" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                  title="Circular nodes layout"
                >
                  Circular
                </button>
              </div>
            </div>

            {/* Mouse Selection Tools */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Interaction Tool:</span>
              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold">
                <button
                  onClick={() => setMouseMode("pan")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition ${
                    mouseMode === "pan" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                  title="Drag on canvas to pan, drag on node to move"
                >
                  <Pointer size={11} />
                  <span>Pan & Move</span>
                </button>
                <button
                  onClick={() => setMouseMode("select")}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition ${
                    mouseMode === "select" ? "bg-white text-[#0065bd] shadow-sm" : "text-slate-500 hover:text-[#0065bd]"
                  }`}
                  title="Drag on background to draw selection marquee"
                >
                  <BoxSelect size={11} />
                  <span>Box Select</span>
                </button>
              </div>
            </div>
          </div>

          {/* Legend and stats panel overlay */}
          <div className="absolute left-4 top-14 z-20 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-md pointer-events-auto flex flex-col gap-2 max-w-[240px]">
            <div className="border-b border-slate-100 pb-1.5">
              <h3 className="text-[9px] uppercase tracking-wider font-bold text-[#0065bd]">Graph Summary</h3>
              <p className="text-xs text-slate-700 font-mono mt-0.5 font-bold">
                {loading ? "Refreshing..." : `${filteredGraph.nodes.length} nodes · ${filteredGraph.edges.length} relationships`}
              </p>
            </div>
            <div className="text-[10px] text-slate-500 font-sans leading-normal">
              {mouseMode === "pan" 
                ? "Drag canvas to pan. Drag nodes to move. Click to inspect."
                : "Drag cursor to draw a box and select multiple nodes simultaneously."}
            </div>
          </div>

          {/* Cytoscape view canvas */}
          <div className="flex-1 min-h-0 w-full relative">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center font-mono text-xs text-slate-400 bg-slate-50/70 z-10">
                <div className="flex items-center gap-2 bg-white px-4 py-3 rounded-lg border border-slate-200 shadow-sm">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0065bd] border-t-transparent" />
                  <span>Querying database: rendering graph...</span>
                </div>
              </div>
            ) : filteredGraph.nodes.length === 0 ? (
              <div className="h-full w-full flex items-center justify-center px-6 text-center bg-slate-50">
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="text-sm font-bold text-slate-800">No nodes in view.</p>
                  <p className="mt-1 text-xs text-slate-500 leading-normal max-w-xs font-sans">
                    Use Guided Search or Cypher Console to fetch nodes, or toggle visible labels.
                  </p>
                </div>
              </div>
            ) : (
              <CytoscapeGraph 
                graph={filteredGraph} 
                onSelectNode={setSelectedNode} 
                selectedNodeId={focusedNodeId}
                isActive={isActive}
                mouseMode={mouseMode}
                layoutName={layoutName}
              />
            )}
          </div>
        </div>

        {/* Toggle Right Sidebar Button */}
        <button 
          onClick={() => setInspectorCollapsed(!inspectorCollapsed)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-30 h-8 w-6 bg-white border border-slate-200 border-r-0 rounded-l-lg flex items-center justify-center text-slate-400 hover:text-slate-700 shadow-sm transition hover:bg-slate-50 cursor-pointer"
          title={inspectorCollapsed ? "Expand Inspector" : "Collapse Inspector"}
        >
          {inspectorCollapsed ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
        </button>

        {/* Right Side: Properties Panel (Collapsible) */}
        <aside className={clsx(
          "shrink-0 bg-white flex flex-col h-full overflow-y-auto overflow-x-hidden shadow-sm transition-all duration-300 relative",
          inspectorCollapsed ? "w-0 border-l-0 opacity-0 overflow-hidden p-0" : "w-[320px] border-l border-slate-200 p-5"
        )}>
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 shrink-0">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Info size={16} className="text-[#0065bd]" />
              Element Inspector
            </h2>
            {selectedNode && (
              <button 
                onClick={() => { setSelectedNode(null); setFocusedNodeId(""); }}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg hover:bg-slate-100 transition"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {selectedNode ? (
            <div className="space-y-5 flex-1 min-h-0">
              <div>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 uppercase tracking-wider">
                  {selectedNode.type}
                </span>
                <h3 className="text-md font-bold text-slate-900 mt-2 tracking-tight">{selectedNode.name}</h3>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5 break-all">ID: {selectedNode.id}</p>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <h4 className="text-[10px] uppercase tracking-wider font-bold text-[#0065bd] mb-2.5">Database Attributes</h4>
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 ? (
                    Object.entries(selectedNode.properties).map(([key, val]) => (
                      <div key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[10px] leading-normal">
                        <span className="text-[#0065bd] block text-[9px] font-bold uppercase tracking-wider mb-0.5">{key}</span>
                        <span className="text-slate-800 break-all font-semibold">
                          {val === null || val === undefined ? "—" : String(val)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs font-mono text-slate-400">No properties associated with this node.</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center p-4">
              <div className="text-slate-400 text-xs font-mono leading-relaxed">
                Click any node on the Cytoscape canvas or search index in the sidebar to inspect database attributes.
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
