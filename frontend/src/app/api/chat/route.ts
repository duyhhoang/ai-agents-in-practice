import { NextRequest, NextResponse } from "next/server";

type ChatRequestBody = {
  message?: string;
  question?: string;
  sessionId?: string;
};

const N8N_CHAT_WEBHOOK_URL =
  process.env.N8N_CHAT_WEBHOOK_URL || "http://localhost:5678/webhook/chat";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ChatRequestBody;

    const message = body.message || body.question || "";
    const sessionId = body.sessionId || "scales-command-session";
    const reasoning = (body as any).reasoning || "low";
    const ragLimit = (body as any).ragLimit || 3;

    if (!message.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "Message cannot be empty.",
        },
        { status: 400 }
      );
    }

    const n8nResponse = await fetch(N8N_CHAT_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: message.trim(),
        question: message.trim(),
        sessionId,
        reasoning,
        ragLimit
      }),
    });

    const responseText = await n8nResponse.text();

    let data: unknown;

    try {
      data = JSON.parse(responseText);
    } catch {
      data = {
        success: false,
        error: "n8n returned a non-JSON response.",
        rawResponse: responseText,
      };
    }

    if (!n8nResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Chat Orchestrator request failed.",
          status: n8nResponse.status,
          details: data,
        },
        { status: n8nResponse.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}