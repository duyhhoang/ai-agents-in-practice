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
  success?: boolean;
  answer?: string;
  executiveSummary?: string;
  keyFindings?: string[];
  recommendations?: string[];
  nextActions?: string[];
  riskLevel?: string;
  confidence?: string;
  evidenceGraph?: {
    nodes: EvidenceGraphNode[];
    edges: EvidenceGraphEdge[];
  };
  specialistSummary?: unknown[];
  specialistResults?: unknown[];
  question?: string;
  sessionId?: string;
  timestamp?: string;
  error?: string;
};

export async function sendChatMessage(
  message: string,
  sessionId = "scales-command-session"
): Promise<ChatResponse> {
  if (!message.trim()) {
    throw new Error("Message cannot be empty.");
  }

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: message.trim(),
      sessionId,
    }),
  });

  const data = (await response.json()) as ChatResponse;

  if (!response.ok) {
    throw new Error(data.error || `Chat request failed: ${response.status}`);
  }

  return data;
}