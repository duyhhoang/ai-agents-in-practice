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

export type EvidenceGraph = {
    nodes: EvidenceNode[];
    edges: EvidenceEdge[];
};
