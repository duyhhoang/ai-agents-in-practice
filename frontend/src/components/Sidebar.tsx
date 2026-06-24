import {
    FileText,
    GitBranch,
    LineChart,
    MessageSquarePlus,
    Settings,
} from "lucide-react";

const items = [
    { label: "New Chat", icon: MessageSquarePlus },
    { label: "Uploaded Files", icon: FileText },
    { label: "Knowledge Graph", icon: GitBranch },
    { label: "Analytics", icon: LineChart },
    { label: "Settings", icon: Settings },
];

type Props = {
    activeItem: string;
    onItemClick: (label: string) => void;
};

export default function Sidebar({ activeItem, onItemClick }: Props) {
    return (
        <aside className="flex h-full flex-col bg-slate-800 p-4">
            <div className="mb-8 flex items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl p-1">
                    <img
                        src="/supply-chain-logo-transparent.png"
                        alt="Supply Chain Analyst"
                        className="h-16 w-16 object-contain"
                    />
                </div>

                <div>
                    <h1 className="font-semibold leading-tight">
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

            <div className="mt-auto rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                <p className="text-xs font-medium text-slate-300">Phase 1</p>
                <p className="mt-1 text-xs text-slate-500">
                    Mock chat, mock graph, mock evidence trace.
                </p>
            </div>
        </aside>
    );
}