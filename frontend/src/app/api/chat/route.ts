import { NextRequest, NextResponse } from "next/server";
import type { ChatResponse } from "@/types/evidence";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const webhookUrl = process.env.N8N_CHAT_WEBHOOK_URL;

        if (!webhookUrl) {
            return NextResponse.json(
                { error: "N8N_CHAT_WEBHOOK_URL is missing in .env.local" },
                { status: 500 }
            );
        }

        const n8nResponse = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                question: body.question,
                conversationId: body.conversationId ?? "default",
            }),
        });

        if (!n8nResponse.ok) {
            const errorText = await n8nResponse.text();

            return NextResponse.json(
                {
                    error: "n8n chat webhook failed",
                    details: errorText,
                },
                { status: 500 }
            );
        }

        const data = (await n8nResponse.json()) as ChatResponse;

        return NextResponse.json(data);
    } catch (error) {
        return NextResponse.json(
            {
                error: "Chat API failed",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
}