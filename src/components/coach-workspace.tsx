"use client";

import { LoaderCircle, MessageSquarePlus } from "lucide-react";
import { useEffect, useState } from "react";

import { CoachChat, type ChatMessage } from "@/components/coach-chat";

type CoachThread = { id: string; title: string; updatedAt: string };

export function CoachWorkspace() {
  const [threads, setThreads] = useState<CoachThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [conversationVersion, setConversationVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/coach", { signal: controller.signal })
      .then((response) => response.json())
      .then((result) => {
        const nextThreads = (result.threads ?? []) as CoachThread[];
        setThreads(nextThreads);
        if (nextThreads[0]) setSelectedId(nextThreads[0].id);
        else setLoading(false);
      })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setLoading(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    fetch(`/api/coach?threadId=${encodeURIComponent(selectedId)}`, { signal: controller.signal })
      .then((response) => response.json())
      .then((result) => setMessages((result.messages ?? []).map((item: { id: string; role: "assistant" | "user"; content: string; evidence?: string[] }) => ({ ...item, evidence: item.evidence ?? [] }))))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [selectedId]);

  function newConversation() {
    setSelectedId(null);
    setMessages([]);
    setLoading(false);
    setConversationVersion((current) => current + 1);
  }

  function openConversation(threadId: string) {
    setLoading(true);
    setSelectedId(threadId);
    setConversationVersion((current) => current + 1);
  }

  function registerThread(thread: { id: string; title: string }) {
    setThreads((current) => [{ ...thread, updatedAt: new Date().toISOString() }, ...current.filter((item) => item.id !== thread.id)]);
    setSelectedId(thread.id);
  }

  return <div className="coach-page" id="main-page-content">
    <aside className="coach-history">
      <div><span className="eyebrow">Soma Coach</span><h1>Conversations</h1></div>
      <button onClick={newConversation} type="button"><MessageSquarePlus size={17} />New conversation</button>
      <nav aria-label="Conversation history"><span>Recent</span>{threads.map((thread) => <button className={selectedId === thread.id ? "is-active" : ""} key={thread.id} onClick={() => openConversation(thread.id)} type="button">{thread.title}</button>)}</nav>
      <p>Coach uses summarized Soma metrics, not your raw provider payloads.</p>
    </aside>
    <section className="coach-workspace" aria-label="Soma Coach conversation">
      <header><div><strong>Soma Coach</strong><span>Answers grounded in your data</span></div><span className="quality-pill">Confirm before changes</span></header>
      {loading ? <div className="coach-loading"><LoaderCircle className="spin" />Loading conversation…</div> : <CoachChat key={conversationVersion} initialMessages={messages} initialThreadId={selectedId} onThreadCreated={registerThread} />}
    </section>
  </div>;
}
