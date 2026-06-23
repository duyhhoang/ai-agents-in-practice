import { NextRequest, NextResponse } from "next/server";
import type { ChatResponse } from "@/types/evidence";

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!(file instanceof File)) {
            return NextResponse.json(
                { error: "No file uploaded" },
                { status: 400 }
            );
        }

        const webhookUrl = process.env.N8N_UPLOAD_WEBHOOK_URL;

        if (!webhookUrl) {
            return NextResponse.json(
                { error: "N8N_UPLOAD_WEBHOOK_URL is missing in .env.local" },
                { status: 500 }
            );
        }

        const outgoingFormData = new FormData();
        outgoingFormData.append("file", file);
        outgoingFormData.append("fileName", file.name);
        outgoingFormData.append("fileType", file.type);

        const n8nResponse = await fetch(webhookUrl, {
            method: "POST",
            body: outgoingFormData,
        });

        if (!n8nResponse.ok) {
            const errorText = await n8nResponse.text();

            return NextResponse.json(
                {
                    error: "n8n upload webhook failed",
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
                error: "Upload API failed",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
}