"use client";

import {
    type Dispatch,
    type FormEvent,
    type SetStateAction,
    useEffect,
    useRef,
    useState,
} from "react";

import type { ChatMessage, EvidenceTab } from "@/types/evidence";

type ChatPanelProps = {
    messages: ChatMessage[];
    setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
    selectedMessageId: string;
    onSelectMessage: (id: string) => void;
    onOpenEvidence: (tab: EvidenceTab) => void;
    conversationId?: string;
};

type BackendChatResponse = {
    messageId?: string;
    answer?: string;
    tableColumns?: string[];
    tableRows?: Record<string, unknown>[];
    evidenceGraph?: {
        nodes?: unknown[];
        edges?: unknown[];
        relationships?: unknown[];
    };
    evidenceTrace?: unknown;
    error?: string;
    message?: string;
};

type NormalizedNode = {
    id: string;
    name: string;
    label: string;
    type: string;
    properties: Record<string, unknown>;
    [key: string]: unknown;
};

type NormalizedEdge = {
    id: string;
    source: string;
    target: string;
    type: string;
    label: string;
    properties: Record<string, unknown>;
    [key: string]: unknown;
};

const CHAT_API_URL =
    process.env.NEXT_PUBLIC_CHAT_API_URL ?? "http://localhost:8000/chat";

const UPLOAD_API_URL =
    process.env.NEXT_PUBLIC_UPLOAD_API_URL ??
    CHAT_API_URL.replace(/\/chat\/?$/, "/upload");

function createId(prefix: string) {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return `${prefix}_${crypto.randomUUID()}`;
    }

    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringifyCell(value: unknown): string {
    if (value === null || value === undefined) {
        return "";
    }

    if (typeof value === "string") {
        return value;
    }

    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function getNodeDisplayName(node: Record<string, unknown>) {
    const properties = isRecord(node.properties) ? node.properties : {};

    return String(
        node.name ??
        node.label ??
        properties.name ??
        properties.poNumber ??
        properties.po_number ??
        properties.purchaseOrderId ??
        properties.materialDescription ??
        properties.material_description ??
        properties.vendorName ??
        properties.vendor ??
        properties.country ??
        properties.region ??
        node.id ??
        "Unknown"
    );
}

function normalizeNode(rawNode: unknown): NormalizedNode {
    if (!isRecord(rawNode)) {
        const value = String(rawNode ?? "Unknown");

        return {
            id: value,
            name: value,
            label: value,
            type: "Unknown",
            properties: {},
        };
    }

    const name = getNodeDisplayName(rawNode);
    const id = String(rawNode.id ?? rawNode.elementId ?? rawNode.element_id ?? name);
    const type = String(rawNode.type ?? rawNode.category ?? "Unknown");
    const properties = isRecord(rawNode.properties) ? rawNode.properties : {};

    return {
        ...rawNode,
        id,
        name,
        label: String(rawNode.label ?? name),
        type,
        properties,
    };
}

function nodeRefToId(value: unknown): string {
    if (isRecord(value)) {
        return String(
            value.id ??
            value.elementId ??
            value.element_id ??
            value.name ??
            value.label ??
            ""
        );
    }

    return String(value ?? "");
}

function normalizeEdge(rawEdge: unknown): NormalizedEdge | null {
    if (!isRecord(rawEdge)) {
        return null;
    }

    const source = nodeRefToId(
        rawEdge.source ?? rawEdge.sourceId ?? rawEdge.from ?? rawEdge.start ?? rawEdge.startNode
    );

    const target = nodeRefToId(
        rawEdge.target ?? rawEdge.targetId ?? rawEdge.to ?? rawEdge.end ?? rawEdge.endNode
    );

    if (!source || !target) {
        return null;
    }

    const type = String(
        rawEdge.type ?? rawEdge.relationship ?? rawEdge.relationshipType ?? "RELATED_TO"
    );

    const id = String(rawEdge.id ?? `${source}-${type}-${target}`);
    const properties = isRecord(rawEdge.properties) ? rawEdge.properties : {};

    return {
        ...rawEdge,
        id,
        source,
        target,
        type,
        label: String(rawEdge.label ?? type),
        properties,
    };
}

function normalizeGraph(graph: BackendChatResponse["evidenceGraph"]) {
    const nodes = Array.isArray(graph?.nodes)
        ? graph.nodes.map(normalizeNode)
        : [];

    const rawEdges = Array.isArray(graph?.edges)
        ? graph.edges
        : Array.isArray(graph?.relationships)
            ? graph.relationships
            : [];

    const edges = rawEdges
        .map(normalizeEdge)
        .filter((edge): edge is NormalizedEdge => Boolean(edge));

    return {
        nodes,
        edges,
        relationships: edges,
    };
}

function normalizeTrace(trace: unknown) {
    if (!isRecord(trace)) {
        return trace;
    }

    const accessedNodes = Array.isArray(trace.accessedNodes)
        ? trace.accessedNodes.map(normalizeNode)
        : [];

    return {
        ...trace,
        accessedNodes,
    };
}

function buildAssistantMessage(data: BackendChatResponse): ChatMessage {
    const evidenceGraph = normalizeGraph(data.evidenceGraph);
    const evidenceTrace = normalizeTrace(data.evidenceTrace);

    return {
        id: data.messageId ?? createId("assistant"),
        role: "assistant",
        content: data.answer ?? data.message ?? "No answer returned.",
        answer: data.answer ?? data.message ?? "No answer returned.",
        tableColumns: data.tableColumns ?? [],
        tableRows: data.tableRows ?? [],
        evidenceGraph,
        evidenceTrace,
    } as ChatMessage;
}

function MessageTable({
                          columns,
                          rows,
                      }: {
    columns?: string[];
    rows?: Record<string, unknown>[];
}) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const safeColumns =
        Array.isArray(columns) && columns.length > 0
            ? columns
            : safeRows.length > 0
                ? Object.keys(safeRows[0])
                : [];

    if (safeRows.length === 0 || safeColumns.length === 0) {
        return null;
    }

    return (
        <div className="mt-5 max-h-80 overflow-auto rounded-2xl border border-slate-600/80 bg-slate-900/20">
            <table className="min-w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-800">
                <tr>
                    {safeColumns.map((column) => (
                        <th
                            key={column}
                            className="whitespace-nowrap border-b border-slate-600 px-4 py-3 font-medium text-slate-200"
                        >
                            {column}
                        </th>
                    ))}
                </tr>
                </thead>

                <tbody>
                {safeRows.map((row, rowIndex) => (
                    <tr
                        key={`row-${rowIndex}`}
                        className="border-b border-slate-700/70 last:border-b-0 hover:bg-slate-700/30"
                    >
                        {safeColumns.map((column) => (
                            <td
                                key={`${rowIndex}-${column}`}
                                className="whitespace-nowrap px-4 py-3 text-slate-100"
                            >
                                {stringifyCell(row[column])}
                            </td>
                        ))}
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}

export default function ChatPanel({
                                      messages,
                                      setMessages,
                                      selectedMessageId,
                                      onSelectMessage,
                                      onOpenEvidence,
                                      conversationId = "default",
                                  }: ChatPanelProps) {
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const formRef = useRef<HTMLFormElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        const container = scrollRef.current;

        if (!container) {
            return;
        }

        container.scrollTo({
            top: container.scrollHeight,
            behavior: "smooth",
        });
    }, [messages, isSending, isUploading]);

    async function sendQuestion(question: string) {
        const response = await fetch(CHAT_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                question,
                conversationId,
            }),
        });

        const responseText = await response.text();

        if (!response.ok) {
            throw new Error(responseText || `Backend error ${response.status}`);
        }

        return JSON.parse(responseText) as BackendChatResponse;
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        const question = input.trim();

        if (!question || isSending) {
            return;
        }

        const userMessage = {
            id: createId("user"),
            role: "user",
            content: question,
        } as ChatMessage;

        setInput("");
        setIsSending(true);

        setMessages((current) => [...current, userMessage]);
        onSelectMessage(userMessage.id);

        try {
            const data = await sendQuestion(question);
            const assistantMessage = buildAssistantMessage(data);

            setMessages((current) => [...current, assistantMessage]);
            onSelectMessage(assistantMessage.id);
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : "Unknown connection error.";

            const assistantMessage = {
                id: createId("assistant_error"),
                role: "assistant",
                content: `Connection error: ${errorMessage}`,
            } as ChatMessage;

            setMessages((current) => [...current, assistantMessage]);
            onSelectMessage(assistantMessage.id);
        } finally {
            setIsSending(false);
        }
    }

    async function handleFileUpload(file: File) {
        const userMessage = {
            id: createId("user_upload"),
            role: "user",
            content: `Uploaded file: ${file.name}`,
        } as ChatMessage;

        setMessages((current) => [...current, userMessage]);
        onSelectMessage(userMessage.id);
        setIsUploading(true);

        try {
            const formData = new FormData();
            formData.append("file", file);

            const response = await fetch(UPLOAD_API_URL, {
                method: "POST",
                body: formData,
            });

            const responseText = await response.text();

            if (!response.ok) {
                throw new Error(responseText || `Upload failed ${response.status}`);
            }

            const data = JSON.parse(responseText) as BackendChatResponse;
            const assistantMessage = buildAssistantMessage(data);

            setMessages((current) => [...current, assistantMessage]);
            onSelectMessage(assistantMessage.id);
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : "Unknown upload error.";

            const assistantMessage = {
                id: createId("upload_error"),
                role: "assistant",
                content: `Upload error: ${errorMessage}`,
            } as ChatMessage;

            setMessages((current) => [...current, assistantMessage]);
            onSelectMessage(assistantMessage.id);
        } finally {
            setIsUploading(false);

            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    }

    return (
        <div className="flex h-full min-h-0 flex-col bg-slate-800 text-slate-100">
            <header className="flex h-16 shrink-0 items-center justify-center border-b border-slate-600 px-6">
                <div className="text-center">
                    <h1 className="text-sm font-semibold tracking-wide text-slate-100">
                        Supply Chain Analyst
                    </h1>
                    <p className="text-xs text-slate-400">
                        Ask questions over purchasing, vendors, materials, and risk signals.
                    </p>
                </div>
            </header>

            <div
                ref={scrollRef}
                className="min-h-0 flex-1 overflow-y-auto px-7 py-6"
            >
                {messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-center">
                        <div className="max-w-md rounded-3xl border border-slate-600/70 bg-slate-900/30 px-8 py-7">
                            <p className="text-sm font-medium text-slate-100">
                                Start a supply chain query.
                            </p>
                            <p className="mt-2 text-xs leading-6 text-slate-400">
                                Example: give all the purchasing order with status closed
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-7">
                        {messages.map((message) => {
                            const messageAny = message as any;
                            const isUser = message.role === "user";
                            const isSelected = selectedMessageId === message.id;
                            const hasEvidence =
                                messageAny.evidenceGraph || messageAny.evidenceTrace;

                            return (
                                <article
                                    key={message.id}
                                    onClick={() => onSelectMessage(message.id)}
                                    className={[
                                        "rounded-3xl transition",
                                        isSelected && !isUser
                                            ? "ring-1 ring-slate-400/50"
                                            : "ring-0",
                                    ].join(" ")}
                                >
                                    <div
                                        className={[
                                            "flex",
                                            isUser ? "justify-end" : "justify-start",
                                        ].join(" ")}
                                    >
                                        <div
                                            className={[
                                                "max-w-[94%] rounded-3xl px-5 py-4 text-sm leading-7",
                                                isUser
                                                    ? "bg-slate-950/70 text-slate-100"
                                                    : "bg-transparent text-slate-100",
                                            ].join(" ")}
                                        >
                                            <p className="whitespace-pre-wrap">
                                                {messageAny.content ?? messageAny.answer ?? ""}
                                            </p>

                                            {!isUser && (
                                                <MessageTable
                                                    columns={messageAny.tableColumns}
                                                    rows={messageAny.tableRows}
                                                />
                                            )}

                                            {!isUser && hasEvidence && (
                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            onSelectMessage(message.id);
                                                            onOpenEvidence("nodes" as EvidenceTab);
                                                        }}
                                                        className="rounded-full border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
                                                    >
                                                        Evidence Graph
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            onSelectMessage(message.id);
                                                            onOpenEvidence("sources" as EvidenceTab);
                                                        }}
                                                        className="rounded-full border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
                                                    >
                                                        Sources
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            onSelectMessage(message.id);
                                                            onOpenEvidence("tools" as EvidenceTab);
                                                        }}
                                                        className="rounded-full border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
                                                    >
                                                        Tool Trace
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            );
                        })}

                        {(isSending || isUploading) && (
                            <div className="flex justify-start">
                                <div className="rounded-3xl bg-slate-900/40 px-5 py-3 text-sm text-slate-300">
                                    {isUploading ? "Uploading file..." : "Thinking..."}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <footer className="shrink-0 border-t border-slate-600 bg-slate-800 px-6 py-4">
                <form
                    ref={formRef}
                    onSubmit={handleSubmit}
                    className="flex items-end gap-3 rounded-3xl border border-slate-600 bg-slate-900/40 px-4 py-3"
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(event) => {
                            const file = event.target.files?.[0];

                            if (file) {
                                void handleFileUpload(file);
                            }
                        }}
                    />

                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSending || isUploading}
                        className="rounded-full border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Upload file"
                    >
                        +
                    </button>

                    <textarea
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                formRef.current?.requestSubmit();
                            }
                        }}
                        placeholder="Ask about purchase orders, vendors, materials..."
                        rows={1}
                        className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />

                    <button
                        type="submit"
                        disabled={!input.trim() || isSending || isUploading}
                        className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Send
                    </button>
                </form>
            </footer>
        </div>
    );
}