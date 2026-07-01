export type EvidenceGraphNode = {
  id: string;
  name: string;
  type: string;
  properties: Record<string, unknown>;
};

export type EvidenceGraphEdge = {
  id: string;
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
};

export type ChatResponse = {
  messageId?: string;
  success?: boolean;
  answer?: string;
  executiveSummary?: string;
  keyFindings?: string[];
  recommendations?: string[];
  nextActions?: string[];
  riskLevel?: string;
  confidence?: string;
  tableColumns?: string[];
  tableRows?: Record<string, unknown>[];
  evidenceGraph?: {
    nodes: EvidenceGraphNode[];
    edges: EvidenceGraphEdge[];
  };
  evidenceTrace?: {
    toolsUsed?: {
      id: string;
      name: string;
      status: string;
      inputSummary?: string;
      outputSummary?: string;
    }[];
    cypherQueries?: {
      query: string;
    }[];
    sourceChunks?: {
      id: string;
      documentName: string;
      text: string;
    }[];
  };
  specialistSummary?: unknown[];
  specialistResults?: unknown[];
  question?: string;
  sessionId?: string;
  timestamp?: string;
  engineUsed?: string;
  error?: string;
};

export async function sendChatMessage(
  message: string,
  sessionId = "scales-command-session"
): Promise<ChatResponse> {
  if (!message.trim()) {
    throw new Error("Message cannot be empty.");
  }

  let reasoning = "low";
  let ragLimit = 3;
  let engine = "auto";
  if (typeof window !== "undefined") {
    reasoning = window.localStorage.getItem("scales_reasoning_level") || "low";
    ragLimit = Number(window.localStorage.getItem("scales_rag_limit")) || 3;
    engine = window.localStorage.getItem("scales_orchestrator_engine") || "auto";
  }

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: message.trim(),
      question: message.trim(),
      sessionId,
      reasoning,
      ragLimit,
      engine
    }),
  });

  const data = (await response.json()) as ChatResponse;

  if (!response.ok) {
    throw new Error(data.error || `Chat request failed: ${response.status}`);
  }

  return data;
}