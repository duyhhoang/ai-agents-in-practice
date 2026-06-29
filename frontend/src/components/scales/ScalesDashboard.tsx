"use client";

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Bot,
  BrainCircuit,
  Database,
  Network,
  Send,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import clsx from "clsx";
import { detectActiveAgents, scalesAgents } from "@/lib/agents";
import { sendChatMessage, type ChatResponse } from "@/lib/chatApi";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  metadata?: ChatResponse;
};

type MissionLogItem = {
  time: string;
  text: string;
};

function getTimeStamp() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getGlowClass(color: string, active: boolean) {
  if (!active) {
    return "border-cyan-400/15 bg-slate-950/60 text-slate-400";
  }

  const map: Record<string, string> = {
    red: "border-red-400/70 bg-red-950/30 text-red-100 shadow-[0_0_28px_rgba(248,113,113,0.25)]",
    purple:
      "border-purple-400/70 bg-purple-950/30 text-purple-100 shadow-[0_0_28px_rgba(192,132,252,0.25)]",
    blue: "border-blue-400/70 bg-blue-950/30 text-blue-100 shadow-[0_0_28px_rgba(96,165,250,0.25)]",
    orange:
      "border-orange-400/70 bg-orange-950/30 text-orange-100 shadow-[0_0_28px_rgba(251,146,60,0.25)]",
    green:
      "border-emerald-400/70 bg-emerald-950/30 text-emerald-100 shadow-[0_0_28px_rgba(52,211,153,0.25)]",
    yellow:
      "border-yellow-300/70 bg-yellow-950/30 text-yellow-100 shadow-[0_0_28px_rgba(250,204,21,0.25)]",
  };

  return map[color] || map.blue;
}

function extractAssistantText(data: unknown): string {
  if (Array.isArray(data)) {
    return extractAssistantText(data[0]);
  }

  if (!data || typeof data !== "object") {
    return "S.C.A.L.E.S received an empty response.";
  }

  const record = data as Record<string, unknown>;

  const possibleTextFields = [
    record.answer,
    record.executiveSummary,
    record.output,
    record.response,
    record.message,
    record.text,
    record.finalAnswer,
    record.final_answer,
    record.result,
    record.data,
    record.body,
    record.json,
  ];

  for (const field of possibleTextFields) {
    if (typeof field === "string" && field.trim()) {
      return field;
    }

    if (Array.isArray(field)) {
      const nested = extractAssistantText(field);
      if (!nested.includes("empty response") && !nested.includes("no readable")) {
        return nested;
      }
    }

    if (field && typeof field === "object") {
      const nested = extractAssistantText(field);
      if (!nested.includes("empty response") && !nested.includes("no readable")) {
        return nested;
      }
    }
  }

  return "S.C.A.L.E.S received a response, but no readable answer field was found.";
}

function normalizeChatResponse(data: unknown): ChatResponse {
  if (Array.isArray(data)) {
    return normalizeChatResponse(data[0]);
  }

  if (!data || typeof data !== "object") {
    return {
      success: false,
      answer: "S.C.A.L.E.S received an empty response.",
    };
  }

  const record = data as Record<string, unknown>;

  const normalized: ChatResponse = {
    ...(record as ChatResponse),
    answer: extractAssistantText(data),
  };

  return normalized;
}

export default function ScalesDashboard() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [latestResponse, setLatestResponse] = useState<ChatResponse | null>(
    null
  );

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "S.C.A.L.E.S online. Ask me about risks, suppliers, quality, logistics, sustainability, or management actions.",
    },
  ]);

  const [missionLog, setMissionLog] = useState<MissionLogItem[]>([]);

  useEffect(() => {
    setMissionLog([
      {
        time: getTimeStamp(),
        text: "S.C.A.L.E.S command interface initialized.",
      },
      {
        time: getTimeStamp(),
        text: "Agent modules standing by.",
      },
    ]);
  }, []);

  const riskLevel = latestResponse?.riskLevel || "Awaiting Scan";
  const confidence = latestResponse?.confidence || "—";
  const evidenceNodes = latestResponse?.evidenceGraph?.nodes?.length || 0;
  const evidenceEdges = latestResponse?.evidenceGraph?.edges?.length || 0;

  const agentStatusText = useMemo(() => {
    if (loading) return "ACTIVE SCAN";
    return "STANDBY";
  }, [loading]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const userMessage = input.trim();

    if (!userMessage || loading) {
      return;
    }

    const detectedAgents = detectActiveAgents(userMessage);
    setActiveAgents(detectedAgents);

    setMessages((previous) => [
      ...previous,
      {
        role: "user",
        content: userMessage,
      },
    ]);

    setMissionLog((previous) => [
      ...previous,
      {
        time: getTimeStamp(),
        text: `Command received: "${userMessage}"`,
      },
      {
        time: getTimeStamp(),
        text: `Activating modules: ${detectedAgents.join(", ")}.`,
      },
    ]);

    setInput("");
    setLoading(true);

    try {
      const rawData = await sendChatMessage(userMessage);
      const data = normalizeChatResponse(rawData);
      const assistantText = extractAssistantText(rawData);

      setLatestResponse(data);

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: assistantText,
          metadata: data,
        },
      ]);

      setMissionLog((previous) => [
        ...previous,
        {
          time: getTimeStamp(),
          text: "Manager Strategist generated final response.",
        },
        {
          time: getTimeStamp(),
          text: `Evidence matrix updated: ${
            data.evidenceGraph?.nodes?.length || 0
          } nodes, ${data.evidenceGraph?.edges?.length || 0} edges.`,
        },
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown connection error.";

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: `Connection error: ${errorMessage}`,
        },
      ]);

      setMissionLog((previous) => [
        ...previous,
        {
          time: getTimeStamp(),
          text: `Connection failure: ${errorMessage}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#020617] text-cyan-50">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(14,165,233,0.18),transparent_35%),linear-gradient(rgba(6,182,212,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.04)_1px,transparent_1px)] bg-[size:100%_100%,48px_48px,48px_48px]" />

      <div className="pointer-events-none absolute -left-40 top-20 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 bottom-20 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />

      <section className="relative z-10 mx-auto flex min-h-screen max-w-[1600px] flex-col gap-5 p-5">
        <header className="flex flex-col gap-4 rounded-3xl border border-cyan-400/20 bg-slate-950/70 p-5 shadow-[0_0_40px_rgba(34,211,238,0.08)] backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-cyan-300">
              <Sparkles size={16} />
              Supply Chain AI Command System
            </div>

            <h1 className="text-4xl font-black tracking-[0.25em] text-white md:text-5xl">
              S.C.A.L.E.S
            </h1>

            <p className="mt-2 max-w-3xl text-sm text-cyan-100/70">
              Sentinel · Calibrator · Acquirer · Logistics Navigator · Eco
              Guardian · Strategist
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <StatusBadge
              icon={<Activity size={15} />}
              label="Core"
              value="Online"
            />
            <StatusBadge
              icon={<Network size={15} />}
              label="n8n"
              value="Linked"
            />
            <StatusBadge
              icon={<Database size={15} />}
              label="Neo4j"
              value="Ready"
            />
            <StatusBadge icon={<Zap size={15} />} label="MCP" value="Armed" />
          </div>
        </header>

        <div className="grid flex-1 grid-cols-1 gap-5 xl:grid-cols-[330px_1fr_360px]">
          <aside className="rounded-3xl border border-cyan-400/20 bg-slate-950/70 p-5 backdrop-blur-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-bold text-white">
                <Bot size={18} />
                Agent Modules
              </h2>

              <span className="rounded-full border border-cyan-400/30 px-3 py-1 text-[10px] tracking-[0.25em] text-cyan-200">
                {agentStatusText}
              </span>
            </div>

            <div className="space-y-3">
              {scalesAgents.map((agent, index) => {
                const Icon = agent.icon;
                const active = activeAgents.includes(agent.codename);

                return (
                  <motion.div
                    key={`${agent.codename}-${index}`}
                    animate={{
                      scale: active && loading ? [1, 1.02, 1] : 1,
                    }}
                    transition={{
                      repeat: active && loading ? Infinity : 0,
                      duration: 1.4,
                    }}
                    className={clsx(
                      "rounded-2xl border p-4 transition-all",
                      getGlowClass(agent.color, active)
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-current/40 bg-black/30 text-xl font-black">
                        {agent.letter}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Icon size={16} />
                          <h3 className="font-bold">{agent.codename}</h3>
                        </div>

                        <p className="mt-1 text-xs uppercase tracking-[0.2em] opacity-70">
                          {agent.role}
                        </p>

                        <p className="mt-2 text-xs leading-5 opacity-75">
                          {agent.description}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </aside>

          <section className="flex min-h-[820px] flex-col rounded-3xl border border-cyan-400/20 bg-slate-950/70 backdrop-blur-xl">
            <div className="relative flex min-h-[460px] flex-col items-center justify-center overflow-hidden p-6">
              <div className="relative flex h-[330px] w-[330px] items-center justify-center">
                <motion.div
                  animate={{
                    rotate: 360,
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 18,
                    ease: "linear",
                  }}
                  className="absolute inset-0 rounded-full border border-cyan-400/20"
                />

                <motion.div
                  animate={{
                    rotate: -360,
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 12,
                    ease: "linear",
                  }}
                  className="absolute h-[245px] w-[245px] rounded-full border border-blue-400/20 border-t-cyan-300"
                />

                <motion.div
                  animate={{
                    scale: loading ? [1, 1.1, 1] : [1, 1.04, 1],
                    boxShadow: loading
                      ? [
                          "0 0 35px rgba(34,211,238,0.3)",
                          "0 0 90px rgba(34,211,238,0.7)",
                          "0 0 35px rgba(34,211,238,0.3)",
                        ]
                      : [
                          "0 0 30px rgba(34,211,238,0.25)",
                          "0 0 55px rgba(34,211,238,0.35)",
                          "0 0 30px rgba(34,211,238,0.25)",
                        ],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 2.4,
                  }}
                  className="relative z-10 flex h-40 w-40 items-center justify-center rounded-full border border-cyan-300/60 bg-cyan-400/10"
                >
                  <div className="text-center">
                    <div className="text-xs tracking-[0.45em] text-cyan-200">
                      CORE
                    </div>

                    <div className="mt-2 text-3xl font-black text-white">
                      ONLINE
                    </div>

                    <div className="mt-2 text-[10px] tracking-[0.3em] text-cyan-300/80">
                      {loading ? "SCANNING" : "STANDBY"}
                    </div>
                  </div>
                </motion.div>
              </div>

              <div className="mt-8 grid w-full max-w-2xl grid-cols-3 gap-3 text-center text-xs text-cyan-100/70">
                <MiniMetric
                  label="Active Agents"
                  value={activeAgents.length.toString()}
                />
                <MiniMetric label="Threat Index" value={riskLevel} />
                <MiniMetric label="Confidence" value={confidence} />
              </div>
            </div>

            <div className="flex min-h-[340px] flex-col px-4 pb-4">
              <div className="flex-1 space-y-4 overflow-y-auto">
                {messages.map((message, index) => {
                  const isUser = message.role === "user";

                  return (
                    <div
                      key={`${message.role}-${index}`}
                      className={clsx(
                        "flex",
                        isUser ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={clsx(
                          "max-w-[85%] rounded-2xl border p-4 text-sm leading-6",
                          isUser
                            ? "border-blue-400/40 bg-blue-500/15 text-blue-50"
                            : "border-cyan-400/30 bg-cyan-500/10 text-cyan-50"
                        )}
                      >
                        <div className="mb-2 text-[10px] uppercase tracking-[0.3em] opacity-70">
                          {isUser ? "Commander Input" : "S.C.A.L.E.S Response"}
                        </div>

                        <div className="whitespace-pre-wrap">
                          {message.content}
                        </div>

                        {message.metadata?.keyFindings &&
                          message.metadata.keyFindings.length > 0 && (
                            <div className="mt-4 border-t border-white/10 pt-3">
                              <div className="mb-2 font-semibold text-white">
                                Key Findings
                              </div>

                              <ul className="list-disc space-y-1 pl-5 text-xs opacity-85">
                                {message.metadata.keyFindings.map(
                                  (finding, i) => (
                                    <li key={i}>{finding}</li>
                                  )
                                )}
                              </ul>
                            </div>
                          )}

                        {message.metadata?.recommendations &&
                          message.metadata.recommendations.length > 0 && (
                            <div className="mt-4 border-t border-white/10 pt-3">
                              <div className="mb-2 font-semibold text-white">
                                Recommendations
                              </div>

                              <ul className="list-disc space-y-1 pl-5 text-xs opacity-85">
                                {message.metadata.recommendations.map(
                                  (recommendation, i) => (
                                    <li key={i}>{recommendation}</li>
                                  )
                                )}
                              </ul>
                            </div>
                          )}
                      </div>
                    </div>
                  );
                })}

                {loading && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-4 text-sm text-cyan-50">
                      <div className="mb-2 text-[10px] uppercase tracking-[0.3em] opacity-70">
                        S.C.A.L.E.S Response
                      </div>
                      Analyzing graph data and coordinating agents...
                    </div>
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  disabled={loading}
                  placeholder="Ask S.C.A.L.E.S: Which suppliers are risky and what should we do?"
                  className="h-14 flex-1 rounded-2xl border border-cyan-400/20 bg-black/40 px-5 text-sm text-cyan-50 outline-none placeholder:text-cyan-100/35 focus:border-cyan-300 disabled:opacity-60"
                />

                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="flex h-14 items-center gap-2 rounded-2xl border border-cyan-300/40 bg-cyan-400/15 px-6 font-bold text-cyan-100 transition hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send size={18} />
                  Send
                </button>
              </form>
            </div>
          </section>

          <aside className="flex flex-col gap-5">
            <section className="rounded-3xl border border-cyan-400/20 bg-slate-950/70 p-5 backdrop-blur-xl">
              <h2 className="mb-4 flex items-center gap-2 font-bold text-white">
                <BrainCircuit size={18} />
                Risk Intelligence
              </h2>

              <div className="space-y-3">
                <IntelRow label="Threat Index" value={riskLevel} />
                <IntelRow label="Confidence" value={confidence} />
                <IntelRow
                  label="Evidence Nodes"
                  value={String(evidenceNodes)}
                />
                <IntelRow
                  label="Evidence Edges"
                  value={String(evidenceEdges)}
                />
                <IntelRow
                  label="Active Modules"
                  value={
                    activeAgents.length > 0
                      ? activeAgents.join(", ")
                      : "Standby"
                  }
                />
              </div>
            </section>

            <section className="rounded-3xl border border-cyan-400/20 bg-slate-950/70 p-5 backdrop-blur-xl">
              <h2 className="mb-4 flex items-center gap-2 font-bold text-white">
                <Terminal size={18} />
                Mission Log
              </h2>

              <div className="h-[500px] space-y-3 overflow-y-auto rounded-2xl border border-cyan-400/10 bg-black/35 p-4 font-mono text-xs">
                {missionLog.map((item, index) => (
                  <div
                    key={`${item.time}-${index}`}
                    className="text-cyan-100/80"
                  >
                    <span className="text-cyan-300">[{item.time}]</span>{" "}
                    {item.text}
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

function StatusBadge({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-cyan-400/20 bg-black/30 px-4 py-3">
      <div className="flex items-center gap-2 text-cyan-300">
        {icon}
        <span className="text-[10px] uppercase tracking-[0.25em]">
          {label}
        </span>
      </div>

      <div className="mt-1 font-bold text-white">{value}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-cyan-400/15 bg-black/30 p-3">
      <div className="text-[10px] uppercase tracking-[0.25em] opacity-60">
        {label}
      </div>

      <div className="mt-1 font-bold text-white">{value}</div>
    </div>
  );
}

function IntelRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-cyan-400/10 bg-black/30 p-4">
      <div className="text-[10px] uppercase tracking-[0.25em] text-cyan-300/70">
        {label}
      </div>

      <div className="mt-2 break-words text-sm font-bold text-white">
        {value}
      </div>
    </div>
  );
}