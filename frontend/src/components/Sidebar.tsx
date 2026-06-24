import {
    FileText,
    GitBranch,
    LineChart,
    MessageSquarePlus,
    Settings,
} from "lucide-react";

type ChatSession = {
  id: string;
  title: string;
  createdAt: string;
};

type Props = {
    activeItem: string;
    onItemClick: (label: string) => void;
    chatSessions?: ChatSession[];
    activeChatId?: string;
    onNewChat?: () => void;
    onSelectChat?: (chatId: string) => void;
};

const items = [
    { label: "New Chat", icon: MessageSquarePlus },
    { label: "Uploaded Files", icon: FileText },
    { label: "Knowledge Graph", icon: GitBranch },
    { label: "Analytics", icon: LineChart },
    { label: "Settings", icon: Settings },
];

export default function Sidebar({ 
    activeItem, 
    onItemClick, 
    chatSessions = [], 
    activeChatId, 
    onSelectChat 
}: Props) {
    return (
        <aside className="flex h-full w-[260px] shrink-0 flex-col bg-slate-800 p-4 border-r border-slate-700">
            <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl p-1 bg-slate-900/40">
                    <img
                        src="/supply-chain-logo-transparent.png"
                        alt="Supply Chain Analyst"
                        className="h-10 w-10 object-contain"
                    />
                </div>

                <div>
                    <h1 className="font-semibold text-sm leading-tight">
                        Supply Chain Analyst
                    </h1>
                </div>
            </div>

            <nav className="space-y-1">
                {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeItem === item.label;

                    return (
                        <button
                            key={item.label}
                            onClick={() => onItemClick(item.label)}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm ${
                                isActive
                                    ? "bg-blue-950 text-blue-200"
                                    : "text-slate-300 hover:bg-slate-900 hover:text-white"
                            }`}
                        >
                            <Icon className="h-4 w-4" />
                            {item.label}
                        </button>
                    );
                })}
            </nav>

            {chatSessions.length > 0 && (
                <div className="mt-6 flex-1 overflow-y-auto min-h-0 border-t border-slate-700/50 pt-4">
                    <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        Recent Chats
                    </p>
                    <div className="mt-2 space-y-1">
                        {chatSessions.map((session) => {
                            const isActive = session.id === activeChatId;
                            return (
                                <button
                                    key={session.id}
                                    onClick={() => onSelectChat?.(session.id)}
                                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs truncate ${
                                        isActive
                                            ? "bg-slate-900 text-white font-medium"
                                            : "text-slate-400 hover:bg-slate-900/50 hover:text-white"
                                    }`}
                                >
                                    <MessageSquarePlus className="h-3 w-3 shrink-0 text-slate-500" />
                                    <span className="truncate">{session.title}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="mt-auto rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-wide">TUM CIT Practice</p>
                <p className="mt-1 text-[11px] text-slate-500 leading-normal">
                    Multi-Agent RAG Consultant Platform powered by Neo4j & LLM.
                </p>
            </div>
        </aside>
    );
}