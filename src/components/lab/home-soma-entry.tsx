"use client";

import { ArrowUp, ArrowUpRight, Mic } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { saveHomeAssistantMessage } from "@/lib/assistant-home-handoff";
import { HOME_ASSISTANT_MAX_LENGTH, readHomeAssistantDraft, saveHomeAssistantDraft } from "@/lib/home-assistant-draft";
import styles from "./home-soma-entry.module.css";

type Insight = { text: string; source: string; moment: string; pending?: boolean; unavailable?: boolean; generatedAt?: string | null };
const refreshDelay = 5 * 60_000;

export type HomeSomaParts = { observations: ReactNode; composer: ReactNode };

export function HomeSomaEntry({ visible, insightRevision, children }: { visible: boolean; insightRevision?: string; children?: (parts: HomeSomaParts) => ReactNode }) {
  const router = useRouter();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);
  const edited = useRef(false);
  const lastRequest = useRef<number | null>(null);
  const previousRevision = useRef(insightRevision);
  const requestRefresh = useRef<(() => void) | null>(null);
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    submitted.current = false;
    const restore = setTimeout(() => {
      if (submitted.current) return;
      setSending(false);
      if (!edited.current) {
        const draft = readHomeAssistantDraft();
        if (draft) { setText(draft); setExpanded(true); }
      }
    }, 0);
    return () => clearTimeout(restore);
  }, []);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    let inFlight = false;
    let queued: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    const refresh = () => {
      if (!active || document.visibilityState === "hidden") return;
      const remaining = lastRequest.current === null ? 0 : refreshDelay - (Date.now() - lastRequest.current);
      if (remaining > 0) {
        if (queued === null) queued = setTimeout(() => { queued = null; refresh(); }, remaining);
        return;
      }
      if (inFlight) return;
      inFlight = true;
      lastRequest.current = Date.now();
      controller = new AbortController();
      const signal = controller.signal;
      void (async () => {
        try {
          const response = await fetch("/api/lab/home-insight", { method: "POST", cache: "no-store", signal });
          if (!response.ok) throw new Error("Insight unavailable");
          const payload: unknown = await response.json();
          if (!payload || typeof payload !== "object" || !("text" in payload) || typeof payload.text !== "string" || !("source" in payload) || typeof payload.source !== "string") throw new Error("Invalid insight");
          if (active) setInsight(payload as Insight);
        } catch {
          if (active) setInsight((current) => current
            ? { ...current, unavailable: true }
            : { text: "Résumé indisponible pour le moment.", source: "", moment: "day", unavailable: true });
        } finally {
          inFlight = false;
          if (active) setLoading(false);
        }
      })();
    };
    requestRefresh.current = refresh;
    const initialRefresh = setTimeout(refresh, 0);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(refresh, 15 * 60_000);
    return () => {
      active = false;
      requestRefresh.current = null;
      controller?.abort();
      clearTimeout(initialRefresh);
      if (queued !== null) clearTimeout(queued);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [visible]);

  useEffect(() => {
    if (previousRevision.current === insightRevision) return;
    previousRevision.current = insightRevision;
    requestRefresh.current?.();
  }, [insightRevision]);

  useEffect(() => {
    if (!expanded) return;
    let frame = 0;
    const reveal = () => {
      if (document.activeElement !== textarea.current || !form.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!form.current) return;
        const viewport = window.visualViewport;
        const top = (viewport?.offsetTop ?? 0) + 16;
        let bottom = (viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - 16;
        const navigation = document.querySelector<HTMLElement>(".lab-global-nav");
        if (navigation && getComputedStyle(navigation).position === "fixed") {
          const navTop = navigation.getBoundingClientRect().top;
          if (navTop > top) bottom = Math.min(bottom, navTop - 16);
        }
        const bounds = form.current.getBoundingClientRect();
        const delta = bounds.bottom > bottom ? bounds.bottom - bottom : bounds.top < top ? bounds.top - top : 0;
        if (delta) window.scrollBy({ top: delta, behavior: "instant" });
      });
    };
    reveal();
    const composer = form.current;
    composer?.addEventListener("focusin", reveal);
    window.addEventListener("resize", reveal);
    window.visualViewport?.addEventListener("resize", reveal);
    window.visualViewport?.addEventListener("scroll", reveal);
    return () => {
      cancelAnimationFrame(frame);
      composer?.removeEventListener("focusin", reveal);
      window.removeEventListener("resize", reveal);
      window.visualViewport?.removeEventListener("resize", reveal);
      window.visualViewport?.removeEventListener("scroll", reveal);
    };
  }, [expanded, insight?.text]);

  function updateDraft(value: string) {
    edited.current = true;
    setText(value);
    saveHomeAssistantDraft(value);
  }

  function discuss(line: string) {
    const question = "Peux-tu m’expliquer cette observation : " + line;
    const next = !text.trim() ? question : text.includes(question) ? text : text + "\n\n" + question;
    if (next.length > HOME_ASSISTANT_MAX_LENGTH) {
      setError("Votre brouillon est conservé. Raccourcissez-le pour ajouter cette observation (4 000 caractères maximum).");
    } else {
      updateDraft(next);
      setError(null);
    }
    setExpanded(true);
    requestAnimationFrame(() => textarea.current?.focus());
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!message || submitted.current) return;
    if (!saveHomeAssistantMessage(message)) { setError("Le message n’a pas pu être préparé. Votre brouillon est conservé ; réessayez."); return; }
    submitted.current = true;
    setSending(true);
    setError(null);
    updateDraft("");
    router.push("/assistant");
  }

  const lines = insight?.unavailable ? [] : insight?.text.split("\n").filter(Boolean).slice(0, 2) ?? [];
  const updated = insight?.generatedAt ? new Date(insight.generatedAt) : null;
  const validUpdated = updated && Number.isFinite(updated.getTime()) ? updated : null;
  const observations = visible && <section className={styles.entry} aria-label="Aperçu Soma">
    {loading && !insight ? <p className={styles.loading} role="status">Actualisation…</p> : <div className={styles.observations}>
      {lines.map((line, index) => <button className={styles.observation} type="button" key={index + "-" + line} onClick={() => discuss(line)} title="Demander à Soma d’expliquer cette observation"><ArrowUpRight size={17} aria-hidden="true" /><span>{line}</span></button>)}
    </div>}
    {validUpdated && <time className={styles.srOnly} dateTime={validUpdated.toISOString()}>Résumé mis à jour à {new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(validUpdated)}</time>}
    {insight?.unavailable && <p className={styles.error} role="status">Résumé indisponible pour le moment.</p>}
  </section>;
  const composer = <div className={styles.conversation}>
    <form ref={form} className={styles.composer + (expanded || text ? " " + styles.expanded : "")} onSubmit={submit} aria-busy={sending}>
      <label className={styles.srOnly} htmlFor="home-soma-message">Parler à Soma</label>
      <textarea id="home-soma-message" ref={textarea} rows={expanded || text ? 3 : 1} maxLength={HOME_ASSISTANT_MAX_LENGTH} placeholder="Parler à Soma…" value={text} disabled={sending} onChange={(event) => { updateDraft(event.target.value); setError(null); }} onFocus={() => setExpanded(true)} onBlur={() => { if (!text.trim()) setExpanded(false); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
      <span className={styles.actions}>
        <button type="button" className={styles.voice} aria-label="Ouvrir Soma pour parler" disabled={sending} onClick={() => { saveHomeAssistantDraft(text); router.push("/assistant"); }}><Mic size={18} aria-hidden="true" /></button>
        <button type="submit" className={styles.send} aria-label="Envoyer à Soma" disabled={!text.trim() || sending}><ArrowUp size={18} aria-hidden="true" /></button>
      </span>
    </form>
    {error && <p role="alert" className={styles.error}>{error}</p>}
  </div>;
  return children ? children({ observations, composer }) : <>{observations}{composer}</>;
}
