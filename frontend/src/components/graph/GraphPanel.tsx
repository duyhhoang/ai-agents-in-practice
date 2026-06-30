"use client";

import { useMemo, useState } from "react";
import CytoscapeGraph from "./CytoscapeGraph";

import type { EvidenceNode } from "@/types/evidence";

type GraphPanelProps = {
    graph?: unknown;
    selectedNode: EvidenceNode | null;
    onSelectNode: (node: EvidenceNode | null) => void;
};

type NormalizedNode = {
    id: string;
    name: string;
    label: string;
    type: string;
    properties: Record<string, unknown>;
    raw: Record<string, unknown>;
};

type NormalizedEdge = {
    id: string;
    source: string;
    target: string;
    type: string;
    label: string;
    properties: Record<string, unknown>;
    raw: Record<string, unknown>;
};

type PositionedNode = NormalizedNode & {
    x: number;
    y: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringifyValue(value: unknown): string {
    if (value === null || value === undefined) {
        return "";
    }

    if (typeof value === "string") {
        return value;
    }

    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function truncate(value: string, length = 22) {
    if (value.length <= length) {
        return value;
    }

    return `${value.slice(0, length - 1)}…`;
}

function getNodeDisplayName(node: Record<string, unknown>) {
    const properties = isRecord(node.properties) ? node.properties : {};

    return String(
        node.name ??
        node.label ??
        properties.name ??
        properties.poNumber ??
        properties.po_number ??
        properties.purchaseOrderId ??
        properties.materialDescription ??
        properties.material_description ??
        properties.vendorName ??
        properties.vendor ??
        properties.country ??
        properties.region ??
        node.id ??
        "Unknown"
    );
}

function normalizeNode(rawNode: unknown): NormalizedNode | null {
    if (!isRecord(rawNode)) {
        return null;
    }

    const name = getNodeDisplayName(rawNode);
    const id = String(rawNode.id ?? rawNode.elementId ?? rawNode.element_id ?? name);
    const type = String(rawNode.type ?? rawNode.category ?? "Unknown");
    const properties = isRecord(rawNode.properties) ? rawNode.properties : {};

    return {
        id,
        name,
        label: String(rawNode.label ?? name),
        type,
        properties,
        raw: {
            ...rawNode,
            id,
            name,
            label: String(rawNode.label ?? name),
            type,
            properties,
        },
    };
}

function nodeRefToId(value: unknown): string {
    if (isRecord(value)) {
        return String(
            value.id ??
            value.elementId ??
            value.element_id ??
            value.name ??
            value.label ??
            ""
        );
    }

    return String(value ?? "");
}

function normalizeEdge(rawEdge: unknown): NormalizedEdge | null {
    if (!isRecord(rawEdge)) {
        return null;
    }

    const source = nodeRefToId(
        rawEdge.source ?? rawEdge.sourceId ?? rawEdge.from ?? rawEdge.start ?? rawEdge.startNode
    );

    const target = nodeRefToId(
        rawEdge.target ?? rawEdge.targetId ?? rawEdge.to ?? rawEdge.end ?? rawEdge.endNode
    );

    if (!source || !target) {
        return null;
    }

    const type = String(
        rawEdge.type ?? rawEdge.relationship ?? rawEdge.relationshipType ?? "RELATED_TO"
    );

    const id = String(rawEdge.id ?? `${source}-${type}-${target}`);
    const properties = isRecord(rawEdge.properties) ? rawEdge.properties : {};

    return {
        id,
        source,
        target,
        type,
        label: String(rawEdge.label ?? type),
        properties,
        raw: {
            ...rawEdge,
            id,
            source,
            target,
            type,
            label: String(rawEdge.label ?? type),
            properties,
        },
    };
}

function normalizeGraph(graph: unknown) {
    if (!isRecord(graph)) {
        return {
            nodes: [] as NormalizedNode[],
            edges: [] as NormalizedEdge[],
        };
    }

    const nodes = Array.isArray(graph.nodes)
        ? graph.nodes
            .map(normalizeNode)
            .filter((node): node is NormalizedNode => Boolean(node))
        : [];

    const rawEdges = Array.isArray(graph.edges)
        ? graph.edges
        : Array.isArray(graph.relationships)
            ? graph.relationships
            : [];

    const nodeIds = new Set(nodes.map((node) => node.id));

    const edges = rawEdges
        .map(normalizeEdge)
        .filter((edge): edge is NormalizedEdge => {
            if (!edge) {
                return false;
            }

            return nodeIds.has(edge.source) && nodeIds.has(edge.target);
        });

    return {
        nodes,
        edges,
    };
}

function buildLayout(nodes: NormalizedNode[]): PositionedNode[] {
    if (nodes.length === 0) {
        return [];
    }

    const centerX = 500;
    const centerY = 335;

    if (nodes.length === 1) {
        return [
            {
                ...nodes[0],
                x: centerX,
                y: centerY,
            },
        ];
    }

    const typeRank: Record<string, number> = {
        Summary: 0,
        PurchaseOrder: 1,
        Purchase_Order: 1,
        Vendor: 2,
        Supplier: 2,
        Material: 3,
        Country: 4,
    };

    const sortedNodes = [...nodes].sort((a, b) => {
        const rankA = typeRank[a.type] ?? 10;
        const rankB = typeRank[b.type] ?? 10;

        if (rankA !== rankB) {
            return rankA - rankB;
        }

        return a.label.localeCompare(b.label);
    });

    const radius = nodes.length > 35 ? 285 : nodes.length > 15 ? 250 : 210;

    return sortedNodes.map((node, index) => {
        const angle = (Math.PI * 2 * index) / sortedNodes.length - Math.PI / 2;

        return {
            ...node,
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
        };
    });
}

export default function GraphPanel({
                                       graph,
                                       selectedNode,
                                       onSelectNode,
                                   }: GraphPanelProps) {
    const normalizedGraph = useMemo(() => normalizeGraph(graph), [graph]);

    const positionedNodes = useMemo(
        () => buildLayout(normalizedGraph.nodes),
        [normalizedGraph.nodes]
    );

    const positionsById = useMemo(() => {
        const map = new Map<string, PositionedNode>();

        positionedNodes.forEach((node) => {
            map.set(node.id, node);
        });

        return map;
    }, [positionedNodes]);

    const selectedNodeId = selectedNode
        ? String((selectedNode as Record<string, unknown>).id ?? "")
        : "";

    const selectedDisplayNode =
        positionedNodes.find((node) => node.id === selectedNodeId) ?? null;

    const visibleEdges = normalizedGraph.edges.filter(
        (edge) => positionsById.has(edge.source) && positionsById.has(edge.target)
    );

    const nodeCount = positionedNodes.length;
    const edgeCount = visibleEdges.length;

    const [viewMode, setViewMode] = useState<"interactive" | "circular">("interactive");

    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-800 text-slate-100">
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-600 px-6">
                <div className="flex-1" />
                <div className="text-center flex-1">
                    <h2 className="text-sm font-semibold tracking-wide text-slate-100">
                        Knowledge Graph
                    </h2>
                    <p className="text-xs text-slate-400">
                        {nodeCount} nodes · {edgeCount} relationships
                    </p>
                </div>
                <div className="flex-1 flex justify-end">
                    {nodeCount > 0 && (
                        <button
                            type="button"
                            onClick={() => setViewMode(prev => prev === "interactive" ? "circular" : "interactive")}
                            className="rounded-lg border border-slate-600 bg-slate-900/50 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700 font-medium transition"
                        >
                            {viewMode === "interactive" ? "Circular Layout" : "Interactive Graph"}
                        </button>
                    )}
                </div>
            </header>

            <section className="relative min-h-0 flex-1 overflow-hidden">
                {nodeCount === 0 ? (
                    <div className="flex h-full items-center justify-center px-8 text-center">
                        <div className="rounded-3xl border border-slate-600/70 bg-slate-900/30 px-7 py-6">
                            <p className="text-sm font-medium text-slate-100">
                                No graph yet.
                            </p>
                            <p className="mt-2 text-xs leading-6 text-slate-400">
                                Ask a question that returns evidence to visualize related
                                purchase orders, vendors, and materials.
                            </p>
                        </div>
                    </div>
                ) : viewMode === "interactive" ? (
                    <CytoscapeGraph graph={normalizedGraph as any} onSelectNode={onSelectNode} />
                ) : (
                    <svg
                        viewBox="0 0 1000 700"
                        className="h-full w-full"
                        role="img"
                        aria-label="Supply chain knowledge graph"
                        onClick={() => onSelectNode(null)}
                    >
                        <defs>
                            <marker
                                id="graph-arrow"
                                markerWidth="10"
                                markerHeight="10"
                                refX="8"
                                refY="3"
                                orient="auto"
                                markerUnits="strokeWidth"
                            >
                                <path d="M0,0 L0,6 L9,3 z" className="fill-slate-500" />
                            </marker>
                        </defs>

                        <g>
                            {visibleEdges.map((edge) => {
                                const source = positionsById.get(edge.source);
                                const target = positionsById.get(edge.target);

                                if (!source || !target) {
                                    return null;
                                }

                                return (
                                    <g key={edge.id}>
                                        <line
                                            x1={source.x}
                                            y1={source.y}
                                            x2={target.x}
                                            y2={target.y}
                                            strokeWidth="1.4"
                                            markerEnd="url(#graph-arrow)"
                                            className="stroke-slate-500/60"
                                        />

                                        <text
                                            x={(source.x + target.x) / 2}
                                            y={(source.y + target.y) / 2}
                                            textAnchor="middle"
                                            className="pointer-events-none fill-slate-400 text-[16px]"
                                        >
                                            {truncate(edge.label, 16)}
                                        </text>
                                    </g>
                                );
                            })}
                        </g>

                        <g>
                            {positionedNodes.map((node) => {
                                const isSelected = node.id === selectedNodeId;

                                return (
                                    <g
                                        key={node.id}
                                        transform={`translate(${node.x}, ${node.y})`}
                                        className="cursor-pointer"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onSelectNode(node.raw as EvidenceNode);
                                        }}
                                    >
                                        <circle
                                            r={isSelected ? 24 : 19}
                                            className={[
                                                "stroke-slate-100",
                                                isSelected
                                                    ? "fill-slate-100 stroke-[4]"
                                                    : "fill-slate-700 stroke-[2]",
                                            ].join(" ")}
                                        />

                                        <circle
                                            r={isSelected ? 12 : 9}
                                            className={isSelected ? "fill-slate-900" : "fill-slate-200"}
                                        />

                                        <text
                                            y={38}
                                            textAnchor="middle"
                                            className="pointer-events-none fill-slate-100 text-[18px] font-medium"
                                        >
                                            {truncate(node.label)}
                                        </text>

                                        <text
                                            y={58}
                                            textAnchor="middle"
                                            className="pointer-events-none fill-slate-400 text-[14px]"
                                        >
                                            {truncate(node.type, 18)}
                                        </text>
                                    </g>
                                );
                            })}
                        </g>
                    </svg>
                )}
            </section>

            <aside className="max-h-52 shrink-0 overflow-auto border-t border-slate-600 bg-slate-900/30 px-5 py-4">
                {selectedDisplayNode ? (
                    <div>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-sm font-semibold text-slate-100">
                                    {selectedDisplayNode.label}
                                </h3>
                                <p className="mt-1 text-xs text-slate-400">
                                    {selectedDisplayNode.type}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() => onSelectNode(null)}
                                className="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
                            >
                                Clear
                            </button>
                        </div>

                        <dl className="mt-4 grid grid-cols-1 gap-2 text-xs">
                            <div className="grid grid-cols-[120px_1fr] gap-3">
                                <dt className="text-slate-400">ID</dt>
                                <dd className="break-all text-slate-100">
                                    {selectedDisplayNode.id}
                                </dd>
                            </div>

                            {Object.entries(selectedDisplayNode.properties)
                                .slice(0, 12)
                                .map(([key, value]) => (
                                    <div
                                        key={key}
                                        className="grid grid-cols-[120px_1fr] gap-3"
                                    >
                                        <dt className="text-slate-400">{key}</dt>
                                        <dd className="break-all text-slate-100">
                                            {stringifyValue(value)}
                                        </dd>
                                    </div>
                                ))}
                        </dl>
                    </div>
                ) : (
                    <div>
                        <p className="text-sm font-medium text-slate-100">
                            Select a node to inspect it.
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                            The graph supports both backend shapes: <code>edges</code> and{" "}
                            <code>relationships</code>.
                        </p>
                    </div>
                )}
            </aside>
        </div>
    );
}