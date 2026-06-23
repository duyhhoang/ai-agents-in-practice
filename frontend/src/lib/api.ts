import type { ChatResponse } from "@/types/evidence";

export async function sendChatMessage(question: string): Promise<ChatResponse> {
    const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            question,
            conversationId: "default",
        }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data?.details || data?.error || "Chat request failed");
    }

    return data as ChatResponse;
}

export async function uploadSupplyChainFile(file: File): Promise<ChatResponse> {
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data?.details || data?.error || "Upload request failed");
    }

    return data as ChatResponse;
}