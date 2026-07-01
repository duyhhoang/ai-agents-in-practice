export type NodeType =
    | "Supplier"
    | "Product"
    | "Material"
    | "RiskEvent"
    | "Location"
    | "Document"
    | "Chunk"
    | "Process"
    | "PurchaseOrder"
    | "SupplyEvent"
    | "Actor"
    | "GoodsMovement"
    | "InventorySnapshot"
    | "QualityNotification"
    | "InspectionRecord"
    | "SourceDocument"
    | "ProcessedFile"
    | "Entity";

export type EvidenceValue =
    | string
    | number
    | boolean
    | null
    | undefined;

export type EvidenceNode = {
    id: string;
    label: string;
    name: string;
    type: string;
    properties?: Record<string, EvidenceValue>;
};

export type EvidenceEdge = {
    id: string;
    source: string;
    target: string;
    type: string;
    properties?: Record<string, EvidenceValue>;
};

export type ToolCall = {
    id: string;
    name: string;
    status: "success" | "error";
    durationMs?: number;
    inputSummary?: string;
    outputSummary?: string;
};

export type CypherQuery = {
    query: string;
    params?: Record<string, string | number | boolean>;
};

export type SourceChunk = {
    id: string;
    documentName: string;
    page?: number;
    row?: number;
    text: string;
};

export type EvidenceTrace = {
    toolsUsed: ToolCall[];
    cypherQueries: CypherQuery[];
    accessedNodes: EvidenceNode[];
    sourceChunks: SourceChunk[];
};

export type EvidenceGraph = {
    nodes: EvidenceNode[];
    edges: EvidenceEdge[];
};

export type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    tableData?: TableData;
    evidenceGraph?: EvidenceGraph;
    evidenceTrace?: EvidenceTrace;
};

import type { ChatResponse } from "@/lib/chatApi";
export type { ChatResponse };

export type TableRow = Record<string, EvidenceValue>;

export type TableData = {
    columns: string[];
    rows: TableRow[];
};

export type EvidenceTab = "tools" | "nodes" | "sources" | "cypher";