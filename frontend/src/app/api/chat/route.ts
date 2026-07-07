import { NextRequest, NextResponse } from "next/server";

type ChatRequestBody = {
  message?: string;
  question?: string;
  sessionId?: string;
  reasoning?: string;
  ragLimit?: number;
  engine?: "auto" | "n8n" | "express";
};

const N8N_CHAT_WEBHOOK_URL =
  process.env.N8N_CHAT_WEBHOOK_URL || "http://localhost:5678/webhook/chat";
const EXPRESS_CHAT_URL =
  process.env.EXPRESS_CHAT_URL || "http://localhost:8000/chat";

async function fetchFromEndpoint(url: string, payload: object, timeoutMs = 120000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      throw new Error(`HTTP status ${res.status}`);
    }
    const text = await res.text();
    try {
      return { ok: true, data: JSON.parse(text) };
    } catch {
      return { ok: false, error: "Non-JSON response received", raw: text };
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    return { ok: false, error: err.message || "Request failed" };
  }
}



export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const message = (body.message || body.question || "").trim();
    const sessionId = body.sessionId || "scales-command-session";
    const reasoning = body.reasoning || "low";
    const ragLimit = body.ragLimit || 3;
    const engine = body.engine || "auto";

    if (!message) {
      return NextResponse.json(
        { success: false, error: "Message cannot be empty." },
        { status: 400 }
      );
    }

    const payload = { message, question: message, sessionId, reasoning, ragLimit };

    // Explicit Engine Routing
    if (engine === "n8n") {
      const result = await fetchFromEndpoint(N8N_CHAT_WEBHOOK_URL, payload);
      if (result.ok && result.data) {
        return NextResponse.json({ 
          ...result.data, 
          engineUsed: "n8n Workflow Engine (:5678)",
          embeddingMode: "fallback"
        });
      }
      return NextResponse.json(
        { success: false, error: `n8n Chat Orchestrator failed: ${result.error}` },
        { status: 502 }
      );
    }

    if (engine === "express") {
      const result = await fetchFromEndpoint(EXPRESS_CHAT_URL, payload);
      if (result.ok && result.data) {
        return NextResponse.json({ 
          ...result.data, 
          engineUsed: "Express MCP Server (:8000)",
          embeddingMode: result.data.embeddingMode || "gemini"
        });
      }
      return NextResponse.json(
        { success: false, error: `Express Chat Server failed: ${result.error}` },
        { status: 502 }
      );
    }

    // Auto-Routing: Try n8n first with full timeout (120s), fallback to Express if n8n is offline or unreachable
    const n8nResult = await fetchFromEndpoint(N8N_CHAT_WEBHOOK_URL, payload, 120000);
    if (n8nResult.ok && n8nResult.data && !n8nResult.data.error) {
      return NextResponse.json({ 
        ...n8nResult.data, 
        engineUsed: "n8n Workflow Engine (:5678)",
        embeddingMode: "fallback"
      });
    }

    // Fallback to Express Multi-Agent Engine
    const expressResult = await fetchFromEndpoint(EXPRESS_CHAT_URL, payload);
    if (expressResult.ok && expressResult.data) {
      return NextResponse.json({ 
        ...expressResult.data, 
        engineUsed: "Express MCP Engine (:8000 - Fallback)",
        embeddingMode: expressResult.data.embeddingMode || "gemini"
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: "All chat orchestration engines (n8n and Express MCP) failed to respond.",
        details: { n8nError: n8nResult.error, expressError: expressResult.error }
      },
      { status: 503 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}