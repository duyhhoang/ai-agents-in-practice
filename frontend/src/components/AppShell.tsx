"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/chat/ChatPanel";
import GraphPanel from "@/components/graph/GraphPanel";
import EvidenceDrawer from "@/components/evidence/EvidenceDrawer";

import type {
  ChatMessage,
  EvidenceNode,
  EvidenceTab,
} from "@/types/evidence";

type ChatSession = {
  id: string;
  title: string;
  messages: ChatMessage[];
  selectedMessageId: string;
  createdAt: string;
  updatedAt: string;
};

const CHAT_STORAGE_KEY = "supply-chain-analyst-chat-sessions";

function createChatSession(): ChatSession {
  const now = new Date().toISOString();

  return {
    id: `chat_${Date.now()}`,
    title: "New chat",
    messages: [],
    selectedMessageId: "",
    createdAt: now,
    updatedAt: now,
  };
}

function makeChatTitle(messages: ChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === "user");

  if (!firstUserMessage) {
    return "New chat";
  }

  const title = firstUserMessage.content.trim();

  if (!title) {
    return "New chat";
  }

  return title.length > 42 ? `${title.slice(0, 42)}...` : title;
}

export default function AppShell() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>("");
  const [hasLoadedChats, setHasLoadedChats] = useState(false);

  const [selectedNode, setSelectedNode] = useState<EvidenceNode | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeEvidenceTab, setActiveEvidenceTab] =
      useState<EvidenceTab>("tools");
  const [activeSidebarItem, setActiveSidebarItem] = useState("New Chat");

  useEffect(() => {
    const saved = localStorage.getItem(CHAT_STORAGE_KEY);

    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ChatSession[];

        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed);
          setActiveChatId(parsed[0].id);
          setHasLoadedChats(true);
          return;
        }
      } catch {
        // Ignore corrupted localStorage.
      }
    }

    const firstSession = createChatSession();

    setSessions([firstSession]);
    setActiveChatId(firstSession.id);
    setHasLoadedChats(true);
  }, []);

  useEffect(() => {
    if (!hasLoadedChats) {
      return;
    }

    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(sessions));
  }, [sessions, hasLoadedChats]);

  const activeSession = useMemo(() => {
    return (
        sessions.find((session) => session.id === activeChatId) ||
        sessions[0]
    );
  }, [sessions, activeChatId]);

  const messages = activeSession?.messages ?? [];
  const selectedMessageId = activeSession?.selectedMessageId ?? "";

  const selectedMessage =
      messages.find((message) => message.id === selectedMessageId) ??
      messages.findLast?.((message) => message.role === "assistant") ??
      messages.find((message) => message.role === "assistant");

  const activeGraph = selectedMessage?.evidenceGraph;
  const activeTrace = selectedMessage?.evidenceTrace;

  function handleNewChat() {
    const newSession = createChatSession();

    setSessions((current) => [newSession, ...current]);
    setActiveChatId(newSession.id);
    setSelectedNode(null);
    setDrawerOpen(false);
    setActiveSidebarItem("New Chat");
  }

  function handleSelectChat(chatId: string) {
    setActiveChatId(chatId);
    setSelectedNode(null);
    setDrawerOpen(false);
    setActiveSidebarItem("New Chat");
  }

  function updateActiveMessages(
      updater: ChatMessage[] | ((messages: ChatMessage[]) => ChatMessage[])
  ) {
    setSessions((current) =>
        current.map((session) => {
          if (session.id !== activeChatId) {
            return session;
          }

          const nextMessages =
              typeof updater === "function" ? updater(session.messages) : updater;

          return {
            ...session,
            messages: nextMessages,
            title:
                session.title === "New chat"
                    ? makeChatTitle(nextMessages)
                    : session.title,
            updatedAt: new Date().toISOString(),
          };
        })
    );
  }

  function updateSelectedMessageId(messageId: string) {
    setSessions((current) =>
        current.map((session) =>
            session.id === activeChatId
                ? {
                  ...session,
                  selectedMessageId: messageId,
                  updatedAt: new Date().toISOString(),
                }
                : session
        )
    );
  }

  function openEvidence(tab: EvidenceTab) {
    setActiveEvidenceTab(tab);

    if (!activeTrace) {
      return;
    }

    setDrawerOpen(true);
  }

  function handleSidebarClick(label: string) {
    setActiveSidebarItem(label);

    if (label === "New Chat") {
      handleNewChat();
      return;
    }

    if (label === "Uploaded Files") {
      alert("Use the paperclip button in the chat input to upload a file.");
      return;
    }

    if (label === "Knowledge Graph") {
      openEvidence("nodes");
      return;
    }

    if (label === "Analytics") {
      openEvidence("tools");
      return;
    }

    if (label === "Settings") {
      alert("Settings page will be added in a later phase.");
    }
  }

  if (!hasLoadedChats || !activeSession) {
    return (
        <main className="flex h-screen w-screen items-center justify-center bg-slate-800 text-slate-100">
          <p className="text-sm text-slate-400">Loading Supply Chain Analyst...</p>
        </main>
    );
  }

  return (
      <main className="h-screen w-screen overflow-hidden bg-slate-800 text-slate-100">
        <div className="grid h-full grid-cols-[260px_1fr_520px]">
          <Sidebar
              activeItem={activeSidebarItem}
              onItemClick={handleSidebarClick}
              chatSessions={sessions}
              activeChatId={activeChatId}
              onNewChat={handleNewChat}
              onSelectChat={handleSelectChat}
          />

          <section className="min-h-0 min-w-0 border-x border-slate-600">
            <ChatPanel
                messages={messages}
                setMessages={updateActiveMessages}
                selectedMessageId={selectedMessageId}
                onSelectMessage={(id) => {
                  updateSelectedMessageId(id);

                  if (id) {
                    setDrawerOpen(true);
                  }
                }}
                onOpenEvidence={(tab) => {
                  setActiveEvidenceTab(tab);

                  if (activeTrace) {
                    setDrawerOpen(true);
                  }
                }}
            />
          </section>

          <section className="min-h-0 min-w-0">
            <GraphPanel
                graph={activeGraph}
                selectedNode={selectedNode}
                onSelectNode={setSelectedNode}
            />
          </section>
        </div>

        {drawerOpen && activeTrace && (
            <EvidenceDrawer
                trace={activeTrace}
                activeTab={activeEvidenceTab}
                onTabChange={setActiveEvidenceTab}
                onClose={() => setDrawerOpen(false)}
            />
        )}
      </main>
  );
}