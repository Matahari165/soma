"use client";

import { ArrowUp, Mic } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { saveHomeAssistantMessage } from "@/lib/assistant-home-handoff";
import styles from "./home-soma-entry.module.css";

type Insight = { text: string; source: string; moment: string; pending?: boolean };

export function HomeSomaEntry({ visible }: { visible: boolean }) {
  const router = useRouter();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    let lastRequest = 0;
    const refresh = async () => {
      if (document.visibilityState === "hidden" || Date.now() - lastRequest < 5 * 60_000) return;
      lastRequest = Date.now();
      try {
        const response = await fetch("/api/lab/home-insight", { method: "POST", cache: "no-store" });
        if (!response.ok) throw new Error("Insight unavailable");
        const payload: unknown = await response.json();
        if (active && payload && typeof payload === "object" && "text" in payload && typeof payload.text === "string") {
          const value = payload as Insight;
          setInsight(value);
        }
      } catch {
        if (active) setInsight((current) => current ?? { text: "Vos observations récentes sont disponibles. Vous pouvez poser une question à Soma.", source: "Observations du jour", moment: "day" });
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => void refresh(), 15 * 60_000);
    return () => { active = false; document.removeEventListener("visibilitychange", onVisible); window.clearInterval(interval); };
  }, [visible]);

  if (!visible) return null;

  function discuss(line: string) {
    setText(`Peux-tu m’expliquer cette observation : ${line}`);
    setExpanded(true);
    requestAnimationFrame(() => textarea.current?.focus());
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message) return;
    if (!saveHomeAssistantMessage(message)) {
      setError("Le message n’a pas pu être préparé. Réessayez.");
      return;
    }
    setError(null);
    router.push("/assistant");
  }

  const lines = insight?.text.split("\n").filter(Boolean) ?? [];
  return <section className={styles.entry} aria-label="Aperçu Soma">
    <div className={styles.header}><span>Soma</span><span>{insight?.moment === "morning" ? "Ce matin" : insight?.moment === "activity" ? "Après l’activité" : insight?.moment === "evening" ? "Ce soir" : "Aujourd’hui"}</span></div>
    {loading && !insight ? <p className={styles.loading} role="status">Lecture des observations…</p> : <div className={styles.observations}>
      {lines.map((line, index) => <button className={styles.observation} type="button" key={`${index}-${line}`} onClick={() => discuss(line)} title="Demander à Soma d’expliquer cette observation"><span aria-hidden="true">↗</span><span>{line}</span></button>)}
    </div>}
    {insight && <p className={styles.source}>{insight.source}{insight.pending ? " · Mise à jour en cours" : ""}</p>}
    <form className={`${styles.composer} ${expanded || text ? styles.expanded : ""}`} onSubmit={submit}>
      <label className={styles.srOnly} htmlFor="home-soma-message">Parler à Soma</label>
      <textarea id="home-soma-message" ref={textarea} rows={expanded || text ? 3 : 1} maxLength={4_000} placeholder="Parler à Soma…" value={text} onChange={(event) => setText(event.target.value)} onFocus={() => setExpanded(true)} onBlur={() => { if (!text.trim()) setExpanded(false); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
      <span className={styles.actions}>
        <button type="button" className={styles.voice} aria-label="Ouvrir Soma pour parler" onClick={() => router.push("/assistant")}><Mic size={18} aria-hidden="true" /></button>
        <button type="submit" className={styles.send} aria-label="Envoyer à Soma" disabled={!text.trim()}><ArrowUp size={18} aria-hidden="true" /></button>
      </span>
    </form>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </section>;
}
