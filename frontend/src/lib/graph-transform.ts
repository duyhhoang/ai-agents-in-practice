import type { EvidenceGraph } from "@/types/evidence";

const typeColors: Record<string, string> = {
  PurchaseOrder: "#38bdf8",
  ChargingStation: "#22c55e",
  Charger: "#84cc16",
  Location: "#16a34a",
  Country: "#16a34a",
  Actor: "#a78bfa",
  Supplier: "#2563eb",
  Material: "#f97316",
  SupplyEvent: "#ef4444",
  Process: "#0891b2",
  SourceDocument: "#eab308",
  ProcessedFile: "#a3e635",
  GoodsMovement: "#8b5cf6",
  InventorySnapshot: "#14b8a6",
  QualityNotification: "#f43f5e",
  InspectionRecord: "#6366f1",
  Product: "#7c3aed",
  RiskEvent: "#dc2626",
  Document: "#ca8a04",
  Chunk: "#6b7280",
  Result: "#94a3b8",
  Entity: "#94a3b8"
};

export function getNodeColor(type: string) {
  return typeColors[type] ?? "#94a3b8";
}

export function toCytoscapeElements(graph: EvidenceGraph) {
  const nodes = graph.nodes.map((node) => ({
    data: {
      id: node.id,
      label: node.name,
      type: node.type,
      color: getNodeColor(node.type),
      raw: node
    }
  }));

  const edges = graph.edges.map((edge) => ({
    data: {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.type,
      raw: edge
    }
  }));

  return [...nodes, ...edges];
}