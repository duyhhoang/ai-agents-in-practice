"use client";

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  Bot,
  BrainCircuit,
  Database,
  Network,
  Send,
  HelpCircle,
  Terminal,
  Zap,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  FileText,
  X,
  Sparkles
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

function getAgentColorClass(color: string) {
  const map: Record<string, string> = {
    red: "border-red-200 bg-red-50 text-red-700",
    purple: "border-purple-200 bg-purple-50 text-purple-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    orange: "border-orange-200 bg-orange-50 text-orange-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    yellow: "border-amber-200 bg-amber-50 text-amber-700",
  };
  return map[color] || map.blue;
}

// High-fidelity Markdown-to-React component parser
function parseInlineStyles(text: string): ReactNode[] {
  const parts = [];
  let currentText = text;
  let keyIdx = 0;
  
  while (currentText.length > 0) {
    const boldMatch = currentText.match(/\*\*(.*?)\*\*/);
    const codeMatch = currentText.match(/`(.*?)`/);
    
    const boldIdx = boldMatch ? boldMatch.index ?? -1 : -1;
    const codeIdx = codeMatch ? codeMatch.index ?? -1 : -1;
    
    if (boldIdx === -1 && codeIdx === -1) {
      parts.push(<span key={keyIdx++}>{currentText}</span>);
      break;
    }
    
    if (boldIdx !== -1 && (codeIdx === -1 || boldIdx < codeIdx)) {
      if (boldIdx > 0) {
        parts.push(<span key={keyIdx++}>{currentText.substring(0, boldIdx)}</span>);
      }
      parts.push(<strong key={keyIdx++} className="font-bold text-slate-900">{boldMatch![1]}</strong>);
      currentText = currentText.substring(boldIdx + boldMatch![0].length);
    } else {
      if (codeIdx > 0) {
        parts.push(<span key={keyIdx++}>{currentText.substring(0, codeIdx)}</span>);
      }
      parts.push(<code key={keyIdx++} className="bg-slate-100 px-1 py-0.5 rounded text-rose-600 font-mono text-xs">{codeMatch![1]}</code>);
      currentText = currentText.substring(codeIdx + codeMatch![0].length);
    }
  }
  return parts;
}

function renderMarkdown(text: string): ReactNode {
  if (!text) return null;
  const lines = text.split("\n");
  const elements: ReactNode[] = [];
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    
    // Markdown Table Parser
    if (line.trim().startsWith("|")) {
      const tableRows = [];
      let headers: string[] = [];
      let hasDivider = false;
      
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const rowText = lines[i].trim();
        const cells = rowText.split("|").map(c => c.trim()).filter((_, index, arr) => index > 0 && index < arr.length - 1);
        
        if (rowText.includes("---")) {
          hasDivider = true;
        } else if (headers.length === 0 && !hasDivider) {
          headers = cells;
        } else {
          tableRows.push(cells);
        }
        i++;
      }
      
      elements.push(
        <div key={`table-${i}`} className="my-3.5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[9px]">
                {headers.map((h, hIdx) => (
                  <th key={hIdx} className="p-2.5 font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, rIdx) => (
                <tr key={rIdx} className="border-b border-slate-100 hover:bg-slate-50/50">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="p-2.5 text-slate-700 leading-normal">{parseInlineStyles(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }
    
    // Bullet list parser
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const listItems = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        listItems.push(
          <li key={`li-${i}`} className="ml-4 list-disc pl-1 text-slate-700 leading-relaxed my-0.5">
            {parseInlineStyles(lines[i].slice(2))}
          </li>
        );
        i++;
      }
      elements.push(<ul key={`ul-${i}`} className="my-1.5">{listItems}</ul>);
      continue;
    }

    // Numbered list parser
    if (line.match(/^\d+\.\s/)) {
      const listItems = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        const match = lines[i].match(/^\d+\.\s(.*)/);
        listItems.push(
          <li key={`li-${i}`} className="ml-4 list-decimal pl-1 text-slate-700 leading-relaxed my-0.5">
            {parseInlineStyles(match ? match[1] : "")}
          </li>
        );
        i++;
      }
      elements.push(<ol key={`ol-${i}`} className="my-1.5">{listItems}</ol>);
      continue;
    }

    // Headings
    if (line.startsWith("### ")) {
      elements.push(<h4 key={i} className="text-xs font-bold text-slate-800 mt-4 mb-1">{parseInlineStyles(line.slice(4))}</h4>);
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(<h3 key={i} className="text-sm font-extrabold text-[#0065bd] mt-5 mb-2">{parseInlineStyles(line.slice(3))}</h3>);
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(<h2 key={i} className="text-md font-black text-[#0065bd] border-b border-slate-100 pb-1 mt-6 mb-3">{parseInlineStyles(line.slice(2))}</h2>);
      i++;
      continue;
    }
    
    if (line.trim() === "---") {
      elements.push(<hr key={i} className="my-4 border-slate-200" />);
      i++;
      continue;
    }

    if (line.trim() === "") {
      elements.push(<div key={i} className="h-1.5" />);
      i++;
      continue;
    }

    elements.push(
      <p key={i} className="text-slate-700 leading-relaxed my-1">
        {parseInlineStyles(line)}
      </p>
    );
    i++;
  }
  
  return <div className="space-y-1 font-sans text-xs md:text-sm">{elements}</div>;
}

export default function ScalesDashboard() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [latestResponse, setLatestResponse] = useState<ChatResponse | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Welcome to the TUM CIT Supply Chain Consultant Portal. I am S.C.A.L.E.S., your multi-agent strategist. Ask me about supplier risks, logistics, sustainability scores, or operational metrics in the graph database.",
    },
  ]);
  const [missionLog, setMissionLog] = useState<MissionLogItem[]>([]);
  
  // RAG Document Viewer State
  const [selectedRagChunk, setSelectedRagChunk] = useState<{ docName: string; text: string } | null>(null);
  // Collapsed states for each assistant message index
  const [expandedTraceIdx, setExpandedTraceIdx] = useState<Record<number, boolean>>({});
  // Copy state for Cypher query copy button
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [health, setHealth] = useState<any>(null);

  // Poll health status
  useEffect(() => {
    async function checkHealth() {
      try {
        const res = await fetch("/api/health");
        if (res.ok) {
          const data = await res.json();
          setHealth(data);
        }
      } catch {}
    }
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll ref
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    setMissionLog([
      {
        time: getTimeStamp(),
        text: "Supply Chain consultation interface ready.",
      },
      {
        time: getTimeStamp(),
        text: "All agent modules running in standby mode.",
      },
    ]);
  }, []);

  const riskLevel = latestResponse?.riskLevel || "Pending query";
  const confidence = latestResponse?.confidence || "—";
  const evidenceNodes = latestResponse?.evidenceGraph?.nodes?.length || 0;
  const evidenceEdges = latestResponse?.evidenceGraph?.edges?.length || 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const userMessage = input.trim();
    if (!userMessage || loading) return;

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
        text: `Consultant dispatch: "${userMessage}"`,
      },
      {
        time: getTimeStamp(),
        text: `Activated Specialist Agents: ${detectedAgents.join(", ")}.`,
      },
    ]);

    setInput("");
    setLoading(true);

    try {
      const rawData = await sendChatMessage(userMessage);
      
      let normalizedData: ChatResponse = {
        success: true,
      };

      if (Array.isArray(rawData)) {
        normalizedData = { ...normalizedData, ...(rawData[0] as ChatResponse) };
      } else if (rawData && typeof rawData === "object") {
        normalizedData = { ...normalizedData, ...(rawData as ChatResponse) };
      }

      let assistantText = "No response text found.";
      if (normalizedData.answer) assistantText = normalizedData.answer;

      setLatestResponse(normalizedData);
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: assistantText,
          metadata: normalizedData,
        },
      ]);

      setMissionLog((previous) => [
        ...previous,
        {
          time: getTimeStamp(),
          text: "Lead strategist completed report synthesis.",
        },
        {
          time: getTimeStamp(),
          text: `Evidence catalog: Loaded ${
            normalizedData.evidenceGraph?.nodes?.length || 0
          } nodes and ${normalizedData.evidenceGraph?.edges?.length || 0} relationships.`,
        },
      ]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error.";
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: `Failed to retrieve consultant advice. Details: ${errorMessage}`,
        },
      ]);
      setMissionLog((previous) => [
        ...previous,
        {
          time: getTimeStamp(),
          text: `Pipeline failure: ${errorMessage}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const toggleTrace = (index: number) => {
    setExpandedTraceIdx((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleCopyCypher = (cypher: string) => {
    navigator.clipboard.writeText(cypher);
    setCopiedText(cypher);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Header Panel */}
      <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[#0065bd] uppercase tracking-wider">
            <Sparkles size={14} />
            Supply Chain Advisory Console
          </div>

          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">
              S.C.A.L.E.S.
            </h1>
            <div className="group relative cursor-pointer text-slate-400 hover:text-slate-600">
              <HelpCircle size={16} />
              <div className="pointer-events-none absolute left-6 -top-4 z-50 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-[11px] text-slate-600 leading-normal font-sans font-normal normal-case tracking-normal">
                <span className="font-bold text-slate-800">S.C.A.L.E.S. Acronym Explanation:</span>
                <ul className="mt-1 space-y-0.5 list-disc pl-4 font-mono text-[10px]">
                  <li><strong>S</strong>entinel (Risk)</li>
                  <li><strong>C</strong>alibrator (Quality)</li>
                  <li><strong>A</strong>cquirer (Procurement)</li>
                  <li><strong>L</strong>ogistics Navigator (Shipping)</li>
                  <li><strong>E</strong>co Guardian (ESG)</li>
                  <li><strong>S</strong>trategist (Coordinator)</li>
                </ul>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500 mt-1">
            Technical University of Munich · Department of Computer Science & Information Technology
          </p>
        </div>

        <div className="flex gap-2 sm:gap-3 flex-wrap">
          <StatusTag icon={<Activity size={13} />} label="Core" value={health ? (health.status === "ok" ? "Active" : "Degraded") : "Active"} />
          <StatusTag icon={<Network size={13} />} label="n8n" value={health?.services?.n8n ? (health.services.n8n.status === "ok" ? "Linked" : "Offline") : "Linked"} />
          <StatusTag icon={<Database size={13} />} label="Neo4j" value={health?.services?.neo4j ? (health.services.neo4j.status === "ok" ? "Ready" : "Offline") : "Ready"} />
          <StatusTag icon={<Zap size={13} />} label="MCP" value={health?.services?.mcp_server ? (health.services.mcp_server.status === "ok" ? "Enabled" : "Offline") : "Enabled"} />
        </div>
      </header>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        
        {/* Left Side: Specialists List (Col span 3) */}
        <aside className="xl:col-span-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm h-fit">
          <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="flex items-center gap-1.5 font-bold text-slate-800 text-sm">
              <Bot size={16} className="text-[#0065bd]" />
              Agent Specialist Directory
            </h2>
            <span className="rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[9px] tracking-wider text-slate-600 font-bold uppercase">
              {loading ? "PROCESSING" : "STANDBY"}
            </span>
          </div>

          <div className="space-y-3">
            {scalesAgents.map((agent, index) => {
              const Icon = agent.icon;
              const active = activeAgents.includes(agent.codename);

              return (
                <div
                  key={`${agent.codename}-${index}`}
                  className={clsx(
                    "rounded-xl border p-3.5 transition-all text-xs",
                    active
                      ? "border-[#0065bd]/30 bg-[#0065bd]/5 shadow-sm"
                      : "border-slate-100 bg-white"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={clsx(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm font-bold font-mono",
                      getAgentColorClass(agent.color)
                    )}>
                      {agent.letter}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Icon size={14} className="text-slate-600" />
                          <h3 className="font-bold text-slate-800">{agent.codename}</h3>
                        </div>
                        <div className="group relative cursor-pointer text-slate-400 hover:text-slate-600">
                          <HelpCircle size={12} />
                          <div className="pointer-events-none absolute left-6 -top-4 z-50 w-56 rounded-lg border border-slate-200 bg-white p-2.5 shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-[10px] text-slate-500 font-sans font-normal leading-normal">
                            <span className="font-bold text-slate-700 block mb-0.5">{agent.codename} Role:</span>
                            {agent.description}
                          </div>
                        </div>
                      </div>

                      <p className="text-[9px] uppercase tracking-wider text-slate-400 font-mono mt-0.5">
                        {agent.role}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center: Chat Window (Col span 6) */}
        <section className="xl:col-span-6 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm min-h-[600px] h-[720px]">
          <div className="border-b border-slate-100 p-4 flex items-center justify-between bg-slate-50/50 rounded-t-2xl">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Consultation Chat</span>
            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
              <span>ACTIVE SCAN AGENTS: {activeAgents.length || 0}</span>
            </div>
          </div>

          {/* Message Thread */}
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.map((message, index) => {
              const isUser = message.role === "user";
              const hasMetadata = !isUser && message.metadata && (message.metadata.evidenceTrace || message.metadata.keyFindings);

              return (
                <div
                  key={`${message.role}-${index}`}
                  className={clsx(
                    "flex flex-col",
                    isUser ? "items-end" : "items-start"
                  )}
                >
                  <div
                    className={clsx(
                      "max-w-[90%] rounded-xl border p-4 text-xs md:text-sm leading-relaxed",
                      isUser
                        ? "border-[#0065bd]/20 bg-[#0065bd]/5 text-slate-800"
                        : "border-slate-200 bg-white text-slate-800"
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2 text-[9px] uppercase tracking-wider text-slate-400 font-mono font-bold border-b border-slate-100/60 pb-1">
                      <span>{isUser ? "User Consultation Query" : "S.C.A.L.E.S. Advisor"}</span>
                      {!isUser && message.metadata?.engineUsed && (
                        <span className="text-[8px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-600 normal-case">
                          Engine: {message.metadata.engineUsed}
                        </span>
                      )}
                    </div>

                    <div className="leading-relaxed whitespace-pre-line">
                      {message.role === "assistant" ? (
                        renderMarkdown(message.content)
                      ) : (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      )}
                    </div>

                    {/* Structured Cypher Result Table */}
                    {!isUser && message.metadata?.tableColumns && message.metadata.tableColumns.length > 0 && message.metadata?.tableRows && message.metadata.tableRows.length > 0 && (
                      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                        <div className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between font-mono">
                          <span>Structured Graph Database Query Results ({message.metadata.tableRows.length} records):</span>
                        </div>
                        <table className="w-full text-left text-[11px] font-mono border-collapse bg-white rounded-lg overflow-hidden border border-slate-200">
                          <thead>
                            <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 uppercase text-[9px]">
                              {message.metadata.tableColumns.map((col, cIdx) => (
                                <th key={cIdx} className="p-2 font-bold">{col}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {message.metadata.tableRows.slice(0, 10).map((row, rIdx) => (
                              <tr key={rIdx} className="border-b border-slate-100 hover:bg-slate-50">
                                {message.metadata!.tableColumns!.map((col, cIdx) => (
                                  <td key={cIdx} className="p-2 text-slate-700 truncate max-w-[160px]">
                                    {String(row[col] ?? "—")}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {message.metadata.tableRows.length > 10 && (
                          <div className="text-[9px] text-slate-400 mt-1 font-mono text-right">
                            Showing first 10 of {message.metadata.tableRows.length} records
                          </div>
                        )}
                      </div>
                    )}

                    {/* Collapsible trace elements */}
                    {hasMetadata && (
                      <div className="mt-4 border-t border-slate-100 pt-3">
                        <button
                          onClick={() => toggleTrace(index)}
                          className="flex items-center gap-1.5 text-xs text-[#0065bd] hover:text-[#005293] font-semibold transition"
                        >
                          {expandedTraceIdx[index] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          <span>{expandedTraceIdx[index] ? "Hide Agent Execution Trace" : "Inspect Agent Execution Trace"}</span>
                        </button>

                        {expandedTraceIdx[index] && (
                          <div className="mt-3 space-y-4 border-l-2 border-slate-200 pl-3.5 text-xs transition duration-200">
                            {/* Coordinator plan */}
                            {message.metadata?.evidenceTrace?.toolsUsed?.find(t => t.id === "coordinator_plan") && (
                              <div>
                                <span className="font-bold text-slate-700 text-[10px] uppercase tracking-wider">Coordinator Strategy:</span>
                                <p className="mt-1 text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100 leading-normal">
                                  {message.metadata.evidenceTrace.toolsUsed.find(t => t.id === "coordinator_plan")?.outputSummary}
                                </p>
                              </div>
                            )}

                            {/* Specialist Insights summary */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {message.metadata?.evidenceTrace?.toolsUsed?.find(t => t.id === "ops_specialist") && (
                                <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                                  <span className="font-bold text-slate-700 text-[9px] uppercase tracking-wider">Operations Analysis:</span>
                                  <p className="mt-1 text-slate-600 leading-normal whitespace-pre-line text-[11px]">
                                    {message.metadata.evidenceTrace.toolsUsed.find(t => t.id === "ops_specialist")?.outputSummary}
                                  </p>
                                </div>
                              )}
                              {message.metadata?.evidenceTrace?.toolsUsed?.find(t => t.id === "finance_specialist") && (
                                <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                                  <span className="font-bold text-slate-700 text-[9px] uppercase tracking-wider">Finance & Risk Analysis:</span>
                                  <p className="mt-1 text-slate-600 leading-normal whitespace-pre-line text-[11px]">
                                    {message.metadata.evidenceTrace.toolsUsed.find(t => t.id === "finance_specialist")?.outputSummary}
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Cypher generation */}
                            {message.metadata?.evidenceTrace?.cypherQueries && message.metadata.evidenceTrace.cypherQueries.length > 0 && (
                              <div>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-bold text-slate-700 text-[10px] uppercase tracking-wider">Generated Cypher Query (Neo4j):</span>
                                  <button
                                    onClick={() => handleCopyCypher(message.metadata?.evidenceTrace?.cypherQueries?.[0]?.query || "")}
                                    className="flex items-center gap-1 text-[#0065bd] hover:text-[#005293] text-[10px] font-semibold"
                                  >
                                    {copiedText === message.metadata.evidenceTrace.cypherQueries[0].query ? (
                                      <>
                                        <Check size={10} /> Copied!
                                      </>
                                    ) : (
                                      <>
                                        <Copy size={10} /> Copy Query
                                      </>
                                    )}
                                  </button>
                                </div>
                                <pre className="p-2.5 rounded-lg bg-slate-100 text-slate-800 font-mono text-[10px] border border-slate-200 overflow-x-auto">
                                  {message.metadata.evidenceTrace.cypherQueries[0].query}
                                </pre>
                              </div>
                            )}

                            {/* Detailed Tool executions */}
                            {message.metadata?.evidenceTrace?.toolsUsed && message.metadata.evidenceTrace.toolsUsed.length > 0 && (
                              <div className="space-y-2">
                                <span className="font-bold text-slate-700 text-[10px] uppercase tracking-wider block">Specialist Tools Execution Trace:</span>
                                <div className="space-y-2">
                                  {message.metadata.evidenceTrace.toolsUsed.map((tool, tIdx) => {
                                    if (tool.id === "coordinator_plan" || tool.id === "ops_specialist" || tool.id === "finance_specialist") return null;
                                    const isSuccess = tool.status === "success";
                                    return (
                                      <div key={tIdx} className="rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-[11px] leading-normal font-sans">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="font-bold text-slate-800 font-mono text-[10px]">{tool.name}</span>
                                          <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                                            isSuccess ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"
                                          }`}>
                                            {tool.status}
                                          </span>
                                        </div>
                                        {tool.inputSummary && (
                                          <div className="text-[9px] text-slate-400 font-mono truncate">
                                            <span className="text-slate-500 font-semibold uppercase text-[8px] mr-1">INPUT:</span>
                                            {tool.inputSummary}
                                          </div>
                                        )}
                                        {tool.outputSummary && (
                                          <div className="mt-1 text-slate-600 border-t border-slate-100 pt-1 leading-normal text-[10px]">
                                            {tool.outputSummary}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Source document RAG chunks */}
                            {message.metadata?.evidenceTrace?.sourceChunks && message.metadata.evidenceTrace.sourceChunks.length > 0 && (
                              <div>
                                <span className="font-bold text-slate-700 text-[10px] uppercase tracking-wider block mb-1.5">Referenced Document Chunks (RAG):</span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  {message.metadata.evidenceTrace.sourceChunks.map((chunk, i) => (
                                    <div 
                                      key={chunk.id || i}
                                      onClick={() => setSelectedRagChunk({ docName: chunk.documentName, text: chunk.text })}
                                      className="p-3 rounded-xl border border-slate-200 bg-white hover:border-[#0065bd]/40 hover:bg-slate-50/30 cursor-pointer transition flex flex-col gap-1.5 shadow-sm"
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="font-bold text-[10px] text-slate-700 flex items-center gap-1.5 truncate max-w-[140px]">
                                          <FileText size={11} className="text-[#0065bd]" />
                                          {chunk.documentName}
                                        </span>
                                        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500 font-mono font-semibold">
                                          Ref {i + 1}
                                        </span>
                                      </div>
                                      <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed italic">
                                        "{chunk.text}"
                                      </p>
                                      <div className="flex justify-between items-center mt-1 border-t border-slate-100 pt-1.5 text-[9px] text-slate-400">
                                        <span>Read full reference</span>
                                        <span className="text-[#0065bd] font-bold">Open Reader</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500 shadow-sm">
                  <div className="mb-2 text-[9px] uppercase tracking-wider text-slate-400 font-mono font-bold">
                    S.C.A.L.E.S. Advisor
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0065bd] border-t-transparent" />
                    <span>Analyzing graph databases and coordinating specialist agents...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Chips */}
          {messages.length <= 2 && (
            <div className="px-4 py-2.5 bg-slate-50/80 border-t border-slate-100 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Suggested:</span>
              {[
                "Identify top supplier risks across EV charging stations",
                "List all logistics routes and transport delays",
                "Summarize quality defect inspection reports",
                "Check ESG compliance and carbon emissions",
                "Show transport costs",
                "Identify risk suppliers"
              ].map((promptText, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setInput(promptText)}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-[#0065bd]/40 hover:bg-[#0065bd]/5 hover:text-[#0065bd] transition"
                >
                  {promptText}
                </button>
              ))}
            </div>
          )}

          {/* Form input */}
          <form onSubmit={handleSubmit} className="border-t border-slate-100 p-4 flex gap-3 bg-slate-50/50 rounded-b-2xl">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={loading}
              placeholder="Query the AI Portal: Which suppliers present operational risks?"
              className="h-10 flex-1 rounded-lg border border-slate-200 bg-white px-4 text-xs text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#0065bd] focus:ring-1 focus:ring-[#0065bd] disabled:opacity-60 transition"
            />

            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-10 items-center justify-center rounded-lg bg-[#0065bd] px-5 font-bold text-white transition hover:bg-[#005293] disabled:cursor-not-allowed disabled:opacity-40 shadow-sm"
            >
              <Send size={14} />
            </button>
          </form>
        </section>

        {/* Right Side: Risk Diagnostics & Console Logs (Col span 3) */}
        <aside className="xl:col-span-3 flex flex-col gap-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3.5 flex items-center gap-1.5 font-bold text-slate-800 text-sm border-b border-slate-100 pb-2">
              <BrainCircuit size={16} className="text-[#0065bd]" />
              Threat Diagnostics
            </h2>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex flex-col p-2.5 rounded-lg border border-slate-100 bg-slate-50">
                <span className="text-[9px] uppercase tracking-wider text-slate-400">Scan Threat Index</span>
                <span className="font-bold text-slate-800 mt-1">{riskLevel}</span>
              </div>
              <div className="flex flex-col p-2.5 rounded-lg border border-slate-100 bg-slate-50">
                <span className="text-[9px] uppercase tracking-wider text-slate-400">Agent Confidence Score</span>
                <span className="font-bold text-slate-800 mt-1">{confidence}</span>
              </div>
              <div className="flex flex-col p-2.5 rounded-lg border border-slate-100 bg-slate-50">
                <span className="text-[9px] uppercase tracking-wider text-slate-400">Graph Evidence Cache</span>
                <span className="font-bold text-slate-800 mt-1">{evidenceNodes} nodes · {evidenceEdges} edges</span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex-1 flex flex-col min-h-[300px]">
            <h2 className="mb-3.5 flex items-center gap-1.5 font-bold text-slate-800 text-sm border-b border-slate-100 pb-2">
              <Terminal size={16} className="text-slate-500" />
              Portal Terminal Log
            </h2>

            <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3.5 font-mono text-[10px] space-y-2 max-h-[300px] xl:max-h-none">
              {missionLog.map((item, index) => (
                <div
                  key={`${item.time}-${index}`}
                  className="text-slate-600 leading-normal"
                >
                  <span className="text-[#0065bd] font-semibold">[{item.time}]</span>{" "}
                  {item.text}
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {/* RAG Chunk Text Modal */}
      {selectedRagChunk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-xs font-mono font-bold text-slate-800 flex items-center gap-1.5">
                <FileText size={14} className="text-[#0065bd]" />
                RAG Document Reference: {selectedRagChunk.docName}
              </h3>
              <button
                onClick={() => setSelectedRagChunk(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 font-sans text-xs md:text-sm text-slate-700 leading-relaxed whitespace-pre-wrap max-h-[50vh]">
              {selectedRagChunk.text}
            </div>

            <div className="flex justify-end mt-4 border-t border-slate-100 pt-3">
              <button
                onClick={() => setSelectedRagChunk(null)}
                className="h-9 px-4 rounded-lg bg-[#0065bd] text-white text-xs font-bold hover:bg-[#005293] transition"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusTag({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-mono text-slate-600">
      {icon}
      <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">{label}</span>
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 ml-0.5" />
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}