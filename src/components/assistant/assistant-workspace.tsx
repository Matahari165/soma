"use client";

import { ArrowDown, Check, Image as ImageIcon, Menu, MoreHorizontal, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { FormEvent, KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import styles from "./assistant-workspace.module.css";

type Conversation = {
  id: string;
  title: string | null;
  summary?: string | null;
  created_at?: string;
  updated_at?: string;
  createdAt?: string;
  updatedAt?: string;
};

type TextPart = { type: "text"; text: string };
type AttachmentPart = { type: "attachment"; attachmentId: string; mediaType: string };
type DataSummaryPart = {
  type: "data-summary";
  label: string;
  period: { from: string; to: string } | null;
  itemCount: number;
  domains: Array<"nutrition" | "sleep" | "recovery" | "effort">;
};
type ActionPart = { type: "action"; actionId: string; actionType: string; state: string };
type MessagePart = TextPart | AttachmentPart | DataSummaryPart | ActionPart;
type Message = {
  id: string;
  conversationId?: string;
  conversation_id?: string;
  sequence: number;
  role: "user" | "assistant" | "tool";
  parts: MessagePart[];
  status: "pending" | "streaming" | "completed" | "failed" | "cancelled";
  createdAt?: string;
  created_at?: string;
};

type PendingPhoto = { id: string; file: File; previewUrl: string };
type StarterPrompt = { id: string; text: string };

const fallbackPrompts: StarterPrompt[] = [
  { id: "overview", text: "Fais le point sur mes données récentes et dis-moi ce qu’on peut en conclure." },
  { id: "missing", text: "Quelles données me manquent pour mieux suivre mes progrès ?" },
  { id: "next-step", text: "Quelle serait une prochaine étape réaliste pour mes objectifs ?" },
];

const DOMAIN_LABELS: Record<DataSummaryPart["domains"][number], string> = {
  nutrition: "nutrition",
  sleep: "sommeil",
  recovery: "récupération",
  effort: "effort",
};

function readError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") return payload.message;
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" && payload.error !== "assistant_not_configured") return payload.error;
  return fallback;
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(readError(payload, "Soma ne peut pas répondre pour le moment."));
    Object.assign(error, { code: payload && typeof payload === "object" && "code" in payload && typeof payload.code === "string" ? payload.code : payload && typeof payload === "object" && "error" in payload ? payload.error : null });
    throw error;
  }
  return payload;
}

function conversationDate(conversation: Conversation) {
  const value = conversation.updatedAt ?? conversation.updated_at ?? conversation.createdAt ?? conversation.created_at;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("fr-CH", { day: "2-digit", month: "short" }).format(date);
}

function analysisPeriod(period: DataSummaryPart["period"]) {
  if (!period) return null;
  const format = new Intl.DateTimeFormat("fr-CH", { day: "numeric", month: "short", year: "numeric" });
  return `${format.format(new Date(`${period.from}T12:00:00`))} – ${format.format(new Date(`${period.to}T12:00:00`))}`;
}

function AnalysisSummary({ part }: { part: DataSummaryPart }) {
  const period = analysisPeriod(part.period);
  const domains = part.domains.map((domain) => DOMAIN_LABELS[domain]).join(", ");
  return (
    <details className={styles.analysis}>
      <summary><strong>Analyse :</strong> {part.label}</summary>
      <dl>
        {period && <><dt>Période</dt><dd>{period}</dd></>}
        <dt>Données</dt><dd>{part.itemCount} élément{part.itemCount > 1 ? "s" : ""}</dd>
        {domains && <><dt>Domaines</dt><dd>{domains}</dd></>}
      </dl>
    </details>
  );
}

function inlineText(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <span key={index}>{part}</span>,
  );
}

function AssistantText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index]?.trim() ?? "";
    if (!line) { index += 1; continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push(<h3 key={`h-${index}`}>{inlineText(heading[2])}</h3>);
      index += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index]?.trim() ?? "")) {
        items.push(<li key={index}>{inlineText((lines[index]?.trim() ?? "").replace(/^[-*]\s+/, ""))}</li>);
        index += 1;
      }
      blocks.push(<ul key={`ul-${index}`}>{items}</ul>);
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index]?.trim() ?? "")) {
        items.push(<li key={index}>{inlineText((lines[index]?.trim() ?? "").replace(/^\d+[.)]\s+/, ""))}</li>);
        index += 1;
      }
      blocks.push(<ol key={`ol-${index}`}>{items}</ol>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length) {
      const next = lines[index]?.trim() ?? "";
      if (!next || /^(#{1,3})\s+/.test(next) || /^[-*]\s+/.test(next) || /^\d+[.)]\s+/.test(next)) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push(<p key={`p-${index}`}>{inlineText(paragraph.join(" "))}</p>);
  }
  return <>{blocks}</>;
}

function MessageBody({ message }: { message: Message }) {
  return <>
    {message.parts.map((part, index) => {
      if (part.type === "text") return message.role === "assistant"
        ? <AssistantText key={`${message.id}-text-${index}`} text={part.text} />
        : <p key={`${message.id}-text-${index}`}>{part.text}</p>;
      if (part.type === "data-summary") return <AnalysisSummary key={`${message.id}-data-${index}`} part={part} />;
      if (part.type === "attachment") return <span className={styles.attachmentNote} key={`${message.id}-attachment-${index}`}><ImageIcon size={15} aria-hidden="true" /> Photo jointe</span>;
      return <span className={styles.actionState} key={`${message.id}-action-${index}`}>{part.state === "proposed" ? "Confirmation requise" : "Action enregistrée"}</span>;
    })}
  </>;
}

function messageText(message: Message) {
  return message.parts.filter((part): part is TextPart => part.type === "text").map((part) => part.text).join("\n\n");
}

export function AssistantWorkspace() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [showLatest, setShowLatest] = useState(false);
  const [progressiveMessageId, setProgressiveMessageId] = useState<string | null>(null);
  const [starterState, setStarterState] = useState<"loading" | "calibration" | "ready" | "unavailable">("loading");
  const [starterPrompts, setStarterPrompts] = useState<StarterPrompt[]>(fallbackPrompts);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const preEditDraftRef = useRef("");
  const fileRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const historyTriggerRef = useRef<HTMLButtonElement>(null);
  const historyPanelRef = useRef<HTMLElement>(null);
  const followConversationRef = useRef(true);
  const starterRequestRef = useRef(0);

  const closeHistory = useCallback(() => {
    setHistoryOpen(false);
    window.requestAnimationFrame(() => historyTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!historyOpen) return;
    const panel = historyPanelRef.current;
    panel?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeHistory();
      }
      if (event.key !== "Tab" || !panel) return;
      const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [historyOpen, closeHistory]);

  useEffect(() => {
    if (!openMenuId) return;
    const closeMenu = (event: PointerEvent | globalThis.KeyboardEvent) => {
      if (event instanceof globalThis.KeyboardEvent && event.key === "Escape") setOpenMenuId(null);
      if (event instanceof PointerEvent && !(event.target as Element).closest("[data-conversation-actions]")) setOpenMenuId(null);
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeMenu);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeMenu);
    };
  }, [openMenuId]);

  const scrollToLatest = useCallback(() => {
    const transcript = transcriptRef.current;
    if (!transcript || !followConversationRef.current) return;
    transcript.scrollTop = transcript.scrollHeight;
  }, []);

  const jumpToLatest = useCallback(() => {
    followConversationRef.current = true;
    setShowLatest(false);
    const transcript = transcriptRef.current;
    transcript?.scrollTo({ top: transcript.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, []);

  const loadConversations = useCallback(async () => {
    try {
      const payload = await readJson(await fetch("/api/assistant/conversations", { cache: "no-store" }));
      setConversations(Array.isArray(payload?.conversations) ? payload.conversations : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Les conversations n’ont pas pu être chargées.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadStarters = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++starterRequestRef.current;
    try {
      const payload = await readJson(await fetch("/api/assistant/starter-prompts", { cache: "no-store", signal }));
      if (signal?.aborted || requestId !== starterRequestRef.current) return;
      if (payload?.calibrated === true) {
        setStarterPrompts(Array.isArray(payload.prompts) && payload.prompts.length === 3 ? payload.prompts : fallbackPrompts);
        setStarterState("ready");
      } else {
        setStarterState("calibration");
      }
    } catch {
      if (signal?.aborted || requestId !== starterRequestRef.current) return;
      setStarterPrompts(fallbackPrompts);
      setStarterState("unavailable");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++starterRequestRef.current;
    fetch("/api/assistant/starter-prompts", { cache: "no-store", signal: controller.signal })
      .then(readJson)
      .then((payload) => {
        if (controller.signal.aborted || requestId !== starterRequestRef.current) return;
        if (payload?.calibrated === true) {
          setStarterPrompts(Array.isArray(payload.prompts) && payload.prompts.length === 3 ? payload.prompts : fallbackPrompts);
          setStarterState("ready");
        } else setStarterState("calibration");
      })
      .catch(() => {
        if (controller.signal.aborted || requestId !== starterRequestRef.current) return;
        setStarterPrompts(fallbackPrompts);
        setStarterState("unavailable");
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/assistant/conversations", { cache: "no-store", signal: controller.signal })
      .then(readJson)
      .then((payload) => setConversations(Array.isArray(payload?.conversations) ? payload.conversations : []))
      .catch((loadError) => {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Les conversations n’ont pas pu être chargées.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoadingList(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const frame = window.requestAnimationFrame(scrollToLatest);
    return () => window.cancelAnimationFrame(frame);
  }, [messages, sending, scrollToLatest]);
  async function openConversation(id: string) {
    if (id === activeId && messages.length) return;
    setActiveId(id);
    setEditingMessageId(null);
    preEditDraftRef.current = "";
    setOpenMenuId(null);
    setProgressiveMessageId(null);
    setText("");
    setLoadingConversation(true);
    setError(null);
    setHistoryOpen(false);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
    followConversationRef.current = true;
    setShowLatest(false);
    try {
      const payload = await readJson(await fetch(`/api/assistant/conversations?conversationId=${encodeURIComponent(id)}`, { cache: "no-store" }));
      setMessages(Array.isArray(payload?.messages) ? payload.messages : []);
    } catch (loadError) {
      setMessages([]);
      setError(loadError instanceof Error ? loadError.message : "Cette conversation n’a pas pu être chargée.");
    } finally {
      setLoadingConversation(false);
    }
  }

  function startConversation() {
    setStarterState("loading");
    setActiveId(null);
    setMessages([]);
    setText("");
    setProgressiveMessageId(null);
    setPhotos((current) => {
      current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      return [];
    });
    setError(null);
    setHistoryOpen(false);
    setEditingMessageId(null);
    setEditingDraft("");
    preEditDraftRef.current = "";
    setOpenMenuId(null);
    setShowLatest(false);
    followConversationRef.current = true;
    void loadStarters();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function deleteConversation(conversation: Conversation) {
    if (!window.confirm(`Supprimer définitivement « ${conversation.title || "Nouvelle conversation"} » et ses photos ?`)) return;
    setDeletingId(conversation.id);
    setError(null);
    try {
      await readJson(await fetch(`/api/assistant/conversations?conversationId=${encodeURIComponent(conversation.id)}`, { method: "DELETE" }));
      setConversations((current) => current.filter((candidate) => candidate.id !== conversation.id));
      if (activeId === conversation.id) startConversation();
      setOpenMenuId(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "La conversation n’a pas pu être supprimée.");
    } finally {
      setDeletingId(null);
    }
  }

  function resizeComposer() {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  }

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const supported = Array.from(files).filter((file) => ["image/jpeg", "image/png", "image/webp", "image/heic"].includes(file.type)
      || /\.(?:jpe?g|png|webp|hei[cf])$/i.test(file.name));
    if (supported.length !== files.length) setError("Utilise une photo JPEG, PNG, WebP ou HEIC.");
    setPhotos((current) => [
      ...current,
      ...supported.slice(0, Math.max(0, 4 - current.length)).map((file) => ({ id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file) })),
    ]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const target = current.find((photo) => photo.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((photo) => photo.id !== id);
    });
  }

  async function ensureConversation() {
    if (activeId) return activeId;
    const payload = await readJson(await fetch("/api/assistant/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: null }),
    }));
    const id = payload?.conversation?.id;
    if (typeof id !== "string") throw new Error("La conversation n’a pas pu être créée.");
    setActiveId(id);
    return id;
  }

  async function uploadPhotos(conversationId: string, pendingPhotos: PendingPhoto[]): Promise<string[]> {
    if (!pendingPhotos.length) return [] as string[];
    const form = new FormData();
    form.set("conversationId", conversationId);
    pendingPhotos.forEach((photo) => form.append("files", photo.file));
    const payload = await readJson(await fetch("/api/assistant/attachments", { method: "POST", body: form }));
    if (!Array.isArray(payload?.attachments)) throw new Error("Les photos n’ont pas pu être jointes.");
    return payload.attachments.map((attachment: { id?: unknown }) => attachment.id).filter((id: unknown): id is string => typeof id === "string");
  }

  async function sendMessage(event?: FormEvent, overrideText?: string) {
    event?.preventDefault();
    const cleanText = (overrideText ?? text).trim() || (!editingMessageId && photos.length ? "Analyse cette photo." : "");
    if ((!cleanText && !photos.length) || (editingMessageId && !cleanText) || sending) return;
    followConversationRef.current = true;

    const submittedPhotos = editingMessageId ? [] : photos;
    const editedMessageId = editingMessageId;
    const editedMessage = editedMessageId ? messages.find((message) => message.id === editedMessageId) : null;
    const previousMessages = messages;
    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      conversationId: activeId ?? undefined,
      sequence: editedMessage?.sequence ?? ((messages.at(-1)?.sequence ?? 0) + 1),
      role: "user",
      parts: [
        { type: "text", text: cleanText },
        ...submittedPhotos.map(() => ({ type: "attachment", attachmentId: crypto.randomUUID(), mediaType: "image/jpeg" } satisfies AttachmentPart)),
      ],
      status: "pending",
    };

    setMessages((current) => editedMessage
      ? [...current.filter((message) => message.sequence < editedMessage.sequence), optimisticMessage]
      : [...current, optimisticMessage]);
    setText(editedMessageId ? preEditDraftRef.current : "");
    if (!editedMessageId) setPhotos([]);
    setEditingMessageId(null);
    setEditingDraft("");
    if (textareaRef.current && !editedMessageId) textareaRef.current.style.height = "auto";
    setSending(true);
    setError(null);
    setNotConfigured(false);
    try {
      const conversationId = await ensureConversation();
      const attachmentIds = await uploadPhotos(conversationId, submittedPhotos);
      const payload = await readJson(await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, requestId: crypto.randomUUID(), text: cleanText, message: cleanText, ...(attachmentIds.length ? { attachmentIds } : {}), ...(editedMessageId ? { editMessageId: editedMessageId } : {}) }),
      }));
      const localUserMessage: Message = {
        id: crypto.randomUUID(),
        conversationId,
        sequence: editedMessage?.sequence ?? (messages.at(-1)?.sequence ? messages.at(-1)!.sequence + 1 : 1),
        role: "user",
        parts: [
          ...(cleanText ? [{ type: "text", text: cleanText } satisfies TextPart] : []),
          ...attachmentIds.map((attachmentId) => ({ type: "attachment", attachmentId, mediaType: "image/jpeg" } satisfies AttachmentPart)),
        ],
        status: "completed",
      };
      const persistedUser = payload?.userMessage ?? localUserMessage;
      const assistantMessage = payload?.assistantMessage ?? payload?.message;
      if (editedMessageId && typeof payload?.conversationId === "string") {
        setActiveId(payload.conversationId);
        setMessages([
          ...previousMessages.filter((message) => editedMessage && message.sequence < editedMessage.sequence),
          persistedUser,
          assistantMessage,
        ].filter(Boolean) as Message[]);
        try {
          const forkPayload = await readJson(await fetch(`/api/assistant/conversations?conversationId=${encodeURIComponent(payload.conversationId)}`, { cache: "no-store" }));
          if (Array.isArray(forkPayload?.messages)) setMessages(forkPayload.messages);
        } catch {
          // The edited response is already persisted. Keep the complete local fork instead of inviting a duplicate retry.
        }
      } else {
        setMessages((current) => [...current.filter((message) => message.id !== optimisticId), persistedUser, assistantMessage].filter(Boolean) as Message[]);
      }
      if (assistantMessage?.id) setProgressiveMessageId(assistantMessage.id);
      submittedPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      await loadConversations();
    } catch (sendError) {
      setMessages(previousMessages);
      setText(editedMessageId ? preEditDraftRef.current : cleanText);
      if (!editedMessageId) setPhotos(submittedPhotos);
      setEditingMessageId(editedMessageId);
      setEditingDraft(cleanText);
      if (!editedMessageId) requestAnimationFrame(resizeComposer);
      const code = sendError && typeof sendError === "object" && "code" in sendError ? sendError.code : null;
      setNotConfigured(code === "assistant_not_configured");
      setError(sendError instanceof Error ? sendError.message : "Le message n’a pas pu être envoyé.");
    } finally {
      setSending(false);
    }
  }

  function editMessage(message: Message) {
    const value = messageText(message);
    if (!value || sending) return;
    preEditDraftRef.current = text;
    setEditingMessageId(message.id);
    setEditingDraft(value);
    setError(null);
    requestAnimationFrame(() => editTextareaRef.current?.focus());
  }

  function cancelEditing() {
    setEditingMessageId(null);
    setEditingDraft("");
    setText(preEditDraftRef.current);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && !editingMessageId) {
      event.preventDefault();
      void sendMessage();
    }
  }

  const empty = !loadingConversation && messages.length === 0;

  return (
    <main id="main-page-content" className={styles.page} lang="fr">
      <header className={styles.mobileToolbar}>
        <button ref={historyTriggerRef} type="button" onClick={() => setHistoryOpen(true)} aria-label="Ouvrir les conversations" aria-controls="assistant-conversations" aria-expanded={historyOpen}><Menu size={20} aria-hidden="true" /></button>
        <span>Soma</span>
        <button type="button" onClick={startConversation} aria-label="Nouvelle conversation"><Plus size={20} aria-hidden="true" /></button>
      </header>

      {historyOpen && <button className={styles.scrim} type="button" aria-label="Fermer les conversations" onClick={closeHistory} />}
      <aside id="assistant-conversations" ref={historyPanelRef} className={`${styles.history} ${historyOpen ? styles.historyOpen : ""}`} aria-label="Conversations" role={historyOpen ? "dialog" : undefined} aria-modal={historyOpen || undefined}>
        <div className={styles.historyHeader}>
          <button type="button" className={styles.newButton} onClick={startConversation}><Plus size={18} aria-hidden="true" /><span>Nouvelle conversation</span></button>
          <button type="button" className={styles.closeHistory} onClick={closeHistory} aria-label="Fermer les conversations"><X size={19} aria-hidden="true" /></button>
        </div>
        <nav aria-label="Historique des conversations" className={styles.conversationList}>
          {loadingList ? <p className={styles.listStatus} role="status">Chargement…</p> : conversations.length ? conversations.map((conversation) => (
            <div className={styles.conversationRow} key={conversation.id}>
              <button type="button" aria-current={activeId === conversation.id ? "page" : undefined} onClick={() => void openConversation(conversation.id)}>
                <span>{conversation.title || "Nouvelle conversation"}</span>
                {conversationDate(conversation) && <time>{conversationDate(conversation)}</time>}
              </button>
              <div className={styles.rowActions} data-conversation-actions>
                <button className={styles.moreConversation} type="button" onClick={() => setOpenMenuId((current) => current === conversation.id ? null : conversation.id)} aria-label={`Options pour ${conversation.title || "la conversation"}`} aria-expanded={openMenuId === conversation.id}><MoreHorizontal size={17} aria-hidden="true" /></button>
                {openMenuId === conversation.id && <div className={styles.conversationMenu}>
                  <button type="button" onClick={() => void deleteConversation(conversation)} disabled={deletingId === conversation.id}><Trash2 size={15} aria-hidden="true" /> Supprimer</button>
                </div>}
              </div>
            </div>
          )) : <p className={styles.listStatus}>Aucune conversation.</p>}
        </nav>
      </aside>

      <section className={styles.conversation} aria-label="Conversation avec Soma">
        <div ref={transcriptRef} className={`${styles.transcript} ${empty ? styles.transcriptEmpty : ""}`} role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions" aria-busy={loadingConversation || sending} onScroll={(event) => {
          const element = event.currentTarget;
          const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
          followConversationRef.current = distance < 80;
          setShowLatest(distance > 240);
        }}>
          {loadingConversation ? <div className={styles.loadingState} role="status"><span /><span /><span /><p>Chargement de la conversation…</p></div> : empty && starterState === "loading" ? (
            <div className={styles.loadingState} role="status"><span /><span /><span /><p>Préparation de votre espace…</p></div>
          ) : empty && starterState === "calibration" ? (
            <div className={styles.welcome}>
              <span className={styles.welcomeLabel}>Calibration initiale</span>
              <h2>Partons d’une base propre.</h2>
              <p>Je vais relire ton profil et tes objectifs actuels. Tu pourras confirmer, corriger ou compléter chaque élément, un par un.</p>
              <button type="button" onClick={() => void sendMessage(undefined, "Commence ma calibration initiale. Présente-moi d’abord l’état actuel de mes objectifs connus, distingue ce qui est confirmé, ancien, incomplet ou supposé, puis pose une seule question à la fois.")} disabled={sending || notConfigured}>Faire le point</button>
            </div>
          ) : empty && starterState === "unavailable" ? (
            <div className={styles.welcome}>
              <h2>Écris à Soma.</h2>
              <p>Je n’arrive pas à charger les questions suggérées. Tu peux écrire directement ou réessayer.</p>
              <button type="button" onClick={() => { setStarterState("loading"); void loadStarters(); }}>Réessayer</button>
            </div>
          ) : empty ? (
            <div className={styles.starters}>
              <h2>Que veux-tu explorer ?</h2>
              <div className={styles.starterList} role="group" aria-label="Questions suggérées">
                {starterPrompts.map((prompt) => <button key={prompt.id} type="button" onClick={() => void sendMessage(undefined, prompt.text)} disabled={sending || notConfigured}>{prompt.text}<span aria-hidden="true">↗</span></button>)}
              </div>
            </div>
          ) : (
            <ol className={styles.messages}>
              {messages.filter((message) => message.role !== "tool").map((message) => (
                <li key={message.id} className={`${message.role === "user" ? styles.userMessage : styles.assistantMessage} ${message.status === "pending" ? styles.pendingMessage : ""} ${message.id === progressiveMessageId ? styles.freshMessage : ""}`}>
                  <span className={styles.speaker}>{message.role === "user" ? "Vous" : "Soma"}</span>
                  {editingMessageId === message.id ? <div className={styles.inlineEditor}>
                    <label className={styles.srOnly} htmlFor={`edit-${message.id}`}>Modifier le message</label>
                    <textarea id={`edit-${message.id}`} ref={editTextareaRef} value={editingDraft} onChange={(event) => setEditingDraft(event.target.value)} rows={Math.max(3, Math.min(8, editingDraft.split("\n").length + 1))} onKeyDown={(event) => {
                      if (event.key === "Escape") cancelEditing();
                      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void sendMessage(undefined, editingDraft);
                    }} disabled={sending} />
                    <div className={styles.inlineEditorActions}><button type="button" onClick={cancelEditing} disabled={sending}>Annuler</button><button type="button" onClick={() => void sendMessage(undefined, editingDraft)} disabled={sending || !editingDraft.trim()}><Check size={15} aria-hidden="true" /> Enregistrer et envoyer</button></div>
                  </div> : <div className={styles.messageBody}><MessageBody message={message} /></div>}
                  {message.role === "user" && message.status !== "pending" && editingMessageId !== message.id && <button type="button" className={styles.editMessage} onClick={() => editMessage(message)} disabled={sending} aria-label="Modifier ce message"><Pencil size={14} aria-hidden="true" /> Modifier</button>}
                  {message.status === "failed" && <span className={styles.failedMessage}>Réponse interrompue</span>}
                </li>
              ))}
              {sending && <li className={styles.assistantMessage}><span className={styles.speaker}>Soma</span><div className={styles.thinking} role="status" aria-label="Soma analyse votre demande"><span /><span /><span /></div></li>}
            </ol>
          )}
        </div>

        {showLatest && !empty && <button type="button" className={styles.jumpToLatest} onClick={jumpToLatest}><ArrowDown size={16} aria-hidden="true" /> Dernier message</button>}

        <div className={styles.composerRegion}>
          {error && <div className={`${styles.error} ${notConfigured ? styles.configurationError : ""}`} role="alert"><strong>{notConfigured ? "Assistant non configuré" : "Envoi impossible"}</strong><span>{error}</span></div>}
          <form className={styles.composer} onSubmit={(event) => void sendMessage(event)}>
            {photos.length > 0 && <ul className={styles.photoList} aria-label="Photos à joindre">{photos.map((photo) => (
              <li key={photo.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- local object URL selected by the user */}
                <img src={photo.previewUrl} alt="Aperçu de la photo à joindre" />
                <button type="button" onClick={() => removePhoto(photo.id)} aria-label={`Retirer ${photo.file.name}`}><X size={15} aria-hidden="true" /></button>
              </li>
            ))}</ul>}
            <label className={styles.srOnly} htmlFor="assistant-message">Message à Soma</label>
            <textarea
              id="assistant-message"
              ref={textareaRef}
              rows={1}
              value={text}
              onChange={(event) => { setText(event.target.value); resizeComposer(); }}
              onKeyDown={onComposerKeyDown}
              placeholder={editingMessageId ? "Termine la modification ci-dessus…" : "Demande à Soma…"}
              disabled={sending || notConfigured || Boolean(editingMessageId)}
            />
            <div className={styles.composerActions}>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,.heic,.heif" multiple hidden onChange={(event) => addPhotos(event.target.files)} />
              <button type="button" className={styles.attachButton} onClick={() => fileRef.current?.click()} disabled={sending || Boolean(editingMessageId) || photos.length >= 4 || notConfigured} aria-label="Joindre une image"><Plus size={20} aria-hidden="true" /></button>
              <button type="submit" className={styles.sendButton} disabled={sending || notConfigured || Boolean(editingMessageId) || (!text.trim() && !photos.length)} aria-label="Envoyer le message"><Send size={18} aria-hidden="true" /></button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
