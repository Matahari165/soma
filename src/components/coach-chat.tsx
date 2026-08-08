"use client";

import { Check, LoaderCircle, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ActionPreview = { type: string; title: string; description: string; payload: Record<string, unknown> };
export type ChatMessage = { id: string; role: "assistant" | "user"; content: string; evidence?: string[]; action?: ActionPreview | null; proposalId?: string | null; actionStatus?: string };

const suggestions = ["Why did my recovery change?", "Compare this week with last week", "Create a strength program"];

const welcomeMessage: ChatMessage = { id: "welcome", role: "assistant", content: "I can explain your Soma data, compare periods, or prepare changes for your confirmation." };

export function CoachChat({ compact = false, initialThreadId = null, initialMessages, onThreadCreated }: { compact?: boolean; initialThreadId?: string | null; initialMessages?: ChatMessage[]; onThreadCreated?: (thread: { id: string; title: string }) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages?.length ? initialMessages : [welcomeMessage]);
  const [message, setMessage] = useState("");
  const [threadId, setThreadId] = useState<string | null>(initialThreadId);
  const [sending, setSending] = useState(false);
  const [decisionPending, setDecisionPending] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior });
  }, [messages, sending]);

  async function send(text = message) {
    const clean = text.trim();
    if (!clean || sending) return;
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: clean }]);
    setMessage(""); setSending(true);
    try {
      const response = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: clean, threadId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Coach is unavailable.");
      setThreadId(result.threadId);
      if (!threadId) onThreadCreated?.({ id: result.threadId, title: clean.slice(0, 80) });
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: result.answer, evidence: result.evidence, action: result.proposedAction, proposalId: result.proposalId }]);
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content: error instanceof Error ? error.message : "Coach is unavailable." }]);
    } finally { setSending(false); }
  }

  async function decide(messageId: string, proposalId: string | null | undefined, decision: "confirm" | "reject") {
    if (!proposalId || decisionPending) return;
    setDecisionPending(messageId);
    try {
      const response = await fetch(`/api/coach/actions/${proposalId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
      const result = await response.json();
      setMessages((current) => current.map((item) => item.id === messageId ? { ...item, actionStatus: response.ok ? result.status : result.error ?? "The action could not be updated." } : item));
    } catch {
      setMessages((current) => current.map((item) => item.id === messageId ? { ...item, actionStatus: "The action could not be updated." } : item));
    } finally {
      setDecisionPending(null);
    }
  }

  return <div className={compact ? "chat chat--compact" : "chat"}>
    <div ref={messagesRef} className="chat-messages" aria-live="polite" aria-busy={sending}>{messages.map((item) => <article className={`chat-bubble chat-bubble--${item.role}`} key={item.id}>{item.role === "assistant" && <span className="chat-avatar" aria-hidden="true"><Sparkles size={15} /></span>}<div><p>{item.content}</p>{item.evidence?.length ? <ul className="evidence-list" aria-label="Evidence used">{item.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul> : null}{item.action && <div className="action-preview"><span>Preview · confirmation required</span><h3>{item.action.title}</h3><p>{item.action.description}</p>{item.actionStatus ? <strong role="status">{item.actionStatus}</strong> : <div><button disabled={decisionPending === item.id} onClick={() => void decide(item.id, item.proposalId, "reject")} type="button"><X size={15} />Reject</button><button disabled={decisionPending === item.id} className="primary" onClick={() => void decide(item.id, item.proposalId, "confirm")} type="button">{decisionPending === item.id ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}Confirm</button></div>}</div>}</div></article>)}{sending && <div className="chat-thinking" role="status"><LoaderCircle className="spin" size={16} /> Soma is checking your data…</div>}</div>
    {messages.length === 1 && <div className="chat-suggestions">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => send(suggestion)} type="button">{suggestion}</button>)}</div>}
    <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}><label className="sr-only" htmlFor={compact ? "coach-compact" : "coach-full"}>Message Soma Coach</label><textarea id={compact ? "coach-compact" : "coach-full"} rows={1} maxLength={4000} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ask Soma about your health…" aria-describedby={compact ? undefined : "coach-send-hint"} /><button disabled={!message.trim() || sending} type="submit" aria-label="Send message">{sending ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}</button>{!compact && <small id="coach-send-hint">Enter to send · Shift + Enter for a new line</small>}</form>
  </div>;
}
