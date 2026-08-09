"use client";

import { AlertCircle, History, LoaderCircle, MessageSquarePlus, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";

import { CoachChat, type ChatMessage } from "@/components/coach-chat";

type CoachThread = { id: string; title: string; updatedAt: string };

export function CoachWorkspace() {
  const [threads, setThreads] = useState<CoachThread[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversationVersion, setConversationVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/coach", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Conversation history is unavailable.")))
      .then((result) => {
        const nextThreads = (result.threads ?? []) as CoachThread[];
        setThreads(nextThreads);
        if (nextThreads[0]) setSelectedId(nextThreads[0].id);
        else setLoading(false);
      })
      .catch((caughtError) => { if (caughtError instanceof Error && caughtError.name !== "AbortError") { setError(caughtError.message); setLoading(false); } });
    return () => controller.abort();
  }, [retryVersion]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    fetch(`/api/coach?threadId=${encodeURIComponent(selectedId)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("This conversation could not be loaded.")))
      .then((result) => setMessages((result.messages ?? []).map((item: { id: string; role: "assistant" | "user"; content: string; evidence?: string[] }) => ({ ...item, evidence: item.evidence ?? [] }))))
      .catch((caughtError) => { setMessages([]); if (!(caughtError instanceof Error && caughtError.name === "AbortError")) setError(caughtError instanceof Error ? caughtError.message : "This conversation could not be loaded."); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [selectedId]);

  function newConversation() {
    setError(null);
    setSelectedId(null);
    setMessages([]);
    setLoading(false);
    setConversationVersion((current) => current + 1);
    setHistoryOpen(false);
  }

  function openConversation(threadId: string) {
    setLoading(true);
    setError(null);
    setSelectedId(threadId);
    setConversationVersion((current) => current + 1);
    setHistoryOpen(false);
  }

  function registerThread(thread: { id: string; title: string }) {
    setThreads((current) => [{ ...thread, updatedAt: new Date().toISOString() }, ...current.filter((item) => item.id !== thread.id)]);
    setSelectedId(thread.id);
  }

  return <div className="coach-page" id="main-page-content">
    <aside className={historyOpen ? "coach-history is-open" : "coach-history"}>
      <div><h1>Conversations</h1></div>
      <button className="coach-history-toggle" type="button" onClick={() => setHistoryOpen((current) => !current)} aria-expanded={historyOpen} aria-controls="coach-conversation-history">{historyOpen ? <X size={17} /> : <History size={17} />}{historyOpen ? "Close history" : "History"}</button>
      <button onClick={newConversation} type="button"><MessageSquarePlus size={17} />New chat</button>
      <nav id="coach-conversation-history" aria-label="Conversation history"><span>Recent</span>{threads.length ? threads.map((thread) => <button className={selectedId === thread.id ? "is-active" : ""} key={thread.id} onClick={() => openConversation(thread.id)} type="button">{thread.title}</button>) : <p>No saved conversations yet.</p>}</nav>
    </aside>
    <section className="coach-workspace" aria-label="Soma Coach conversation">
      <header><strong>Soma Coach</strong><span className="quality-pill">Approval required</span></header>
      {loading ? <div className="coach-loading" role="status"><LoaderCircle className="spin" />Loading conversation…</div> : error ? <div className="load-error" role="alert"><AlertCircle /><h2>Coach could not load</h2><p>{error}</p><button className="secondary-button" type="button" onClick={() => { setLoading(true); setError(null); setRetryVersion((current) => current + 1); }}><RotateCcw size={16} />Try again</button></div> : <CoachChat key={conversationVersion} initialMessages={messages} initialThreadId={selectedId} onThreadCreated={registerThread} />}
    </section>
  </div>;
}
