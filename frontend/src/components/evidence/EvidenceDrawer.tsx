"use client";

import type { ReactNode } from "react";
import { Code2, Database, FileText, Hammer, X } from "lucide-react";
import type { EvidenceTab, EvidenceTrace } from "@/types/evidence";

type Props = {
    trace: EvidenceTrace;
    activeTab: EvidenceTab;
    onTabChange: (tab: EvidenceTab) => void;
    onClose: () => void;
};

export default function EvidenceDrawer({
                                           trace,
                                           activeTab,
                                           onTabChange,
                                           onClose,
                                       }: Props) {
    return (
        <div className="fixed bottom-0 left-[260px] right-0 z-50 border-t border-slate-600 bg-slate-800 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-slate-700 px-5 py-3">
                <div>
                    <h2 className="font-semibold">Evidence for selected answer</h2>
                    <p className="text-xs text-slate-400">
                        See which tools, graph nodes, documents, and queries supported the
                        answer.
                    </p>
                </div>

                <button
                    onClick={onClose}
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="flex border-b border-slate-600 px-5">
                <TabButton
                    active={activeTab === "tools"}
                    icon={<Hammer className="h-4 w-4" />}
                    label="Tools"
                    onClick={() => onTabChange("tools")}
                />
                <TabButton
                    active={activeTab === "nodes"}
                    icon={<Database className="h-4 w-4" />}
                    label="Nodes"
                    onClick={() => onTabChange("nodes")}
                />
                <TabButton
                    active={activeTab === "sources"}
                    icon={<FileText className="h-4 w-4" />}
                    label="Sources"
                    onClick={() => onTabChange("sources")}
                />
                <TabButton
                    active={activeTab === "cypher"}
                    icon={<Code2 className="h-4 w-4" />}
                    label="Cypher"
                    onClick={() => onTabChange("cypher")}
                />
            </div>

            <div className="max-h-[280px] overflow-y-auto p-5">
                {activeTab === "tools" && (
                    <div className="grid gap-3 md:grid-cols-3">
                        {trace.toolsUsed.map((tool) => (
                            <div
                                key={tool.id}
                                className="rounded-2xl border border-slate-600 bg-slate-900 p-4"
                            >
                                <div className="mb-2 flex items-center justify-between">
                                    <h3 className="font-medium">{tool.name}</h3>
                                    <span className="rounded-full bg-emerald-950 px-2 py-1 text-xs text-emerald-300">
                    {tool.status}
                  </span>
                                </div>
                                <p className="text-xs text-slate-400">{tool.inputSummary}</p>
                                <p className="mt-2 text-xs text-slate-300">
                                    {tool.outputSummary}
                                </p>
                                <p className="mt-3 text-xs text-slate-500">
                                    Duration: {tool.durationMs}ms
                                </p>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === "nodes" && (
                    <div className="overflow-hidden rounded-2xl border border-slate-800">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-900 text-left text-xs text-slate-400">
                            <tr>
                                <th className="px-4 py-3">Name</th>
                                <th className="px-4 py-3">Type</th>
                                <th className="px-4 py-3">ID</th>
                            </tr>
                            </thead>
                            <tbody>
                            {trace.accessedNodes.map((node) => (
                                <tr key={node.id} className="border-t border-slate-800">
                                    <td className="px-4 py-3">{node.name}</td>
                                    <td className="px-4 py-3 text-slate-400">{node.type}</td>
                                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                                        {node.id}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === "sources" && (
                    <div className="space-y-3">
                        {trace.sourceChunks.map((chunk) => (
                            <div
                                key={chunk.id}
                                className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
                            >
                                <div className="mb-2 text-sm font-medium">
                                    {chunk.documentName}
                                    {chunk.page && (
                                        <span className="ml-2 text-xs text-slate-500">
                      page {chunk.page}
                    </span>
                                    )}
                                    {chunk.row && (
                                        <span className="ml-2 text-xs text-slate-500">
                      row {chunk.row}
                    </span>
                                    )}
                                </div>
                                <p className="text-sm leading-6 text-slate-300">{chunk.text}</p>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === "cypher" && (
                    <div className="space-y-3">
                        {trace.cypherQueries.map((cypher, index) => (
                            <pre
                                key={index}
                                className="overflow-x-auto rounded-2xl border border-slate-800 bg-black p-4 text-xs text-emerald-300"
                            >
                {cypher.query}
              </pre>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function TabButton({
                       active,
                       icon,
                       label,
                       onClick,
                   }: {
    active: boolean;
    icon: ReactNode;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm ${
                active
                    ? "border-blue-500 text-white"
                    : "border-transparent text-slate-400 hover:text-white"
            }`}
        >
            {icon}
            {label}
        </button>
    );
}