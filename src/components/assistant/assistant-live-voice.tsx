"use client";

import { AudioLines, LoaderCircle, Mic, MicOff, Square, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./assistant-live-voice.module.css";

type Phase = "idle" | "requesting" | "connecting" | "active" | "closing";
export type LiveVoicePresentation = { phase: Phase; userCaption: string; assistantCaption: string; muted: boolean; error: string | null };
type LiveEvent = Record<string, unknown> & { type?: unknown };
type TranscriptFragment = { startMs: number; endMs: number; text: string };
type PendingDelegation = {
  id: string;
  offsetMs: number;
  timer: ReturnType<typeof setTimeout>;
  startedAt: number;
  lastTranscriptAt: number;
  flush: () => void;
};

const DELEGATION_SETTLE_MS = 420;
const DELEGATION_MAX_WAIT_MS = 1_400;
const SESSION_CLOSE_TIMEOUT_MS = 15_000;
const DELEGATION_DRAIN_TIMEOUT_MS = 45_000;
const IDLE_CLOSE_MS = 5 * 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textFromEvent(event: LiveEvent) {
  return typeof event.delta === "string" ? event.delta : "";
}

function eventTime(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function readApiError(payload: unknown) {
  if (!isRecord(payload)) return null;
  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error === "string") return payload.error;
  if (isRecord(payload.error) && typeof payload.error.message === "string") return payload.error.message;
  return null;
}

function splitCommentary(text: string, maxBytes = 350) {
  const plainText = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plainText) return [];

  const encoder = new TextEncoder();
  const chunks: string[] = [];
  let remaining = Array.from(plainText);
  while (remaining.length) {
    let byteLength = 0;
    let end = 0;
    let lastWhitespace = 0;
    for (; end < remaining.length; end += 1) {
      const nextLength = encoder.encode(remaining[end]).byteLength;
      if (byteLength + nextLength > maxBytes) break;
      byteLength += nextLength;
      if (/\s/u.test(remaining[end])) lastWhitespace = end + 1;
    }
    if (end === remaining.length) {
      const chunk = remaining.join("").trim();
      if (chunk) chunks.push(chunk);
      break;
    }
    const splitAt = lastWhitespace > Math.floor(end * 0.6) ? lastWhitespace : end;
    const chunk = remaining.slice(0, splitAt).join("").trim();
    if (!chunk) return [];
    chunks.push(chunk);
    remaining = remaining.slice(splitAt);
    while (remaining.length && /\s/u.test(remaining[0])) remaining.shift();
  }
  return chunks;
}

function transcriptForOffset(fragments: TranscriptFragment[], cursor: number, offset: number) {
  return fragments
    .filter((fragment) => fragment.endMs > cursor && fragment.startMs <= offset)
    .map((fragment) => fragment.text)
    .join("")
    .trim();
}

function waitForIceGathering(peer: RTCPeerConnection, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(new DOMException("Connexion annulée", "AbortError"));
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", onStateChange);
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    const onStateChange = () => {
      if (peer.iceGatheringState === "complete") finish();
    };
    const onAbort = () => {
      clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", onStateChange);
      reject(new DOMException("Connexion annulée", "AbortError"));
    };
    const timeout = setTimeout(() => {
      clearTimeout(timeout);
      peer.removeEventListener("icegatheringstatechange", onStateChange);
      signal.removeEventListener("abort", onAbort);
      reject(new Error("La connexion audio n’a pas pu être préparée à temps."));
    }, 8_000);
    peer.addEventListener("icegatheringstatechange", onStateChange);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function AssistantLiveVoice({
  conversationId,
  disabled,
  onBusyChange,
  onConversationStarted,
  onConversationUpdated,
  onPresentationChange,
  className,
}: {
  conversationId: string | null;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onConversationStarted: (conversationId: string) => void;
  onConversationUpdated: (conversationId: string) => void;
  onPresentationChange?: (presentation: LiveVoicePresentation | null) => void;
  className?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userCaption, setUserCaption] = useState("");
  const [assistantCaption, setAssistantCaption] = useState("");
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const completedTurnRef = useRef(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const microphoneRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const liveConversationIdRef = useRef<string | null>(null);
  const createAbortRef = useRef<AbortController | null>(null);
  const transcriptFragmentsRef = useRef<TranscriptFragment[]>([]);
  const transcriptCursorRef = useRef(0);
  const pendingDelegationsRef = useRef(new Map<string, PendingDelegation>());
  const handledDelegationsRef = useRef(new Set<string>());
  const queuedDelegationsRef = useRef(new Set<string>());
  const inFlightDelegationsRef = useRef(new Set<string>());
  const delegationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestDelegationRef = useRef<string | null>(null);
  const sessionEpochRef = useRef(0);
  const sessionStartedRef = useRef(false);
  const closeWaiterRef = useRef<((confirmed: boolean) => void) | null>(null);
  const closingPromiseRef = useRef<Promise<boolean> | null>(null);
  const mountedRef = useRef(true);
  const phaseRef = useRef<Phase>("idle");
  const finalizeRef = useRef<(() => void) | null>(null);
  const endSessionRef = useRef<(() => Promise<void>) | null>(null);
  const lastActivityRef = useRef(0);
  const requestedConversationIdRef = useRef<string | null>(null);
  const onBusyChangeRef = useRef(onBusyChange);
  const onConversationStartedRef = useRef(onConversationStarted);
  const onConversationUpdatedRef = useRef(onConversationUpdated);

  useEffect(() => {
    onBusyChangeRef.current = onBusyChange;
    onConversationStartedRef.current = onConversationStarted;
    onConversationUpdatedRef.current = onConversationUpdated;
  }, [onBusyChange, onConversationStarted, onConversationUpdated]);

  const setCurrentPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
    onBusyChangeRef.current(next !== "idle");
  }, []);

  const stopMicrophoneInput = useCallback(() => {
    microphoneRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = false;
      if (track.readyState !== "ended") track.stop();
    });
  }, []);

  const releaseTransport = useCallback(() => {
    sessionEpochRef.current += 1;
    createAbortRef.current?.abort();
    createAbortRef.current = null;
    for (const pending of pendingDelegationsRef.current.values()) clearTimeout(pending.timer);
    pendingDelegationsRef.current.clear();
    queuedDelegationsRef.current.clear();
    inFlightDelegationsRef.current.clear();
    latestDelegationRef.current = null;
    const channel = channelRef.current;
    channelRef.current = null;
    if (channel && channel.readyState !== "closed") {
      channel.onmessage = null;
      channel.onopen = null;
      channel.onclose = null;
      try { channel.close(); } catch { /* The peer may already be closed. */ }
    }
    const peer = peerRef.current;
    peerRef.current = null;
    if (peer) {
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      try { peer.close(); } catch { /* The transport may already be closed. */ }
    }
    microphoneRef.current?.getTracks().forEach((track) => {
      if (track.readyState !== "ended") track.stop();
    });
    microphoneRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    sessionTokenRef.current = null;
    liveConversationIdRef.current = null;
    requestedConversationIdRef.current = null;
    transcriptFragmentsRef.current = [];
    transcriptCursorRef.current = 0;
    handledDelegationsRef.current.clear();
    sessionStartedRef.current = false;
    if (mountedRef.current) {
      setMuted(false);
      setPlaybackBlocked(false);
    }
  }, []);

  const finishSession = useCallback((closedEvent?: LiveEvent) => {
    closeWaiterRef.current?.(true);
    closeWaiterRef.current = null;
    releaseTransport();
    if (!mountedRef.current) return;
    if (closedEvent && phaseRef.current !== "closing") {
      const reason = isRecord(closedEvent.session) && typeof closedEvent.session.reason === "string"
        ? closedEvent.session.reason
        : typeof closedEvent.reason === "string" ? closedEvent.reason : null;
      if (reason && reason !== "remote_hangup" && reason !== "close_requested") {
        setError("La session vocale s’est terminée. Tu peux la relancer.");
      }
    }
    setCurrentPhase("idle");
  }, [releaseTransport, setCurrentPhase]);

  const closeLiveSession = useCallback((channel: RTCDataChannel) => {
    if (closingPromiseRef.current) return closingPromiseRef.current;
    const closing = new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (confirmed: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (closeWaiterRef.current === onClosed) closeWaiterRef.current = null;
        resolve(confirmed);
      };
      const timeout = setTimeout(() => settle(false), SESSION_CLOSE_TIMEOUT_MS);
      const onClosed = () => settle(true);
      closeWaiterRef.current = onClosed;
      try {
        channel.send(JSON.stringify({ type: "session.close", event_id: crypto.randomUUID() }));
      } catch {
        settle(false);
      }
    });
    closingPromiseRef.current = closing;
    void closing.finally(() => {
      if (closingPromiseRef.current === closing) closingPromiseRef.current = null;
    });
    return closing;
  }, []);

  useEffect(() => {
    finalizeRef.current = () => {
      createAbortRef.current?.abort();
      for (const pending of pendingDelegationsRef.current.values()) clearTimeout(pending.timer);
      pendingDelegationsRef.current.clear();
      latestDelegationRef.current = null;
      stopMicrophoneInput();
      const channel = channelRef.current;
      if (sessionStartedRef.current && channel?.readyState === "open") {
        void closeLiveSession(channel).finally(() => releaseTransport());
      } else {
        releaseTransport();
      }
    };
  }, [closeLiveSession, releaseTransport, stopMicrophoneInput]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      finalizeRef.current?.();
      onBusyChangeRef.current(false);
    };
  }, []);

  useEffect(() => {
    if (phaseRef.current !== "idle" && conversationId !== requestedConversationIdRef.current) {
      void endSessionRef.current?.();
    }
    // End the live connection if the user navigates to another conversation.
  }, [conversationId]);

  useEffect(() => {
    if (phase !== "active") return;
    const interval = setInterval(() => {
      if (Date.now() - lastActivityRef.current < IDLE_CLOSE_MS) return;
      if (pendingDelegationsRef.current.size || inFlightDelegationsRef.current.size) return;
      setError("Le mode vocal s’est fermé après cinq minutes sans échange.");
      void endSessionRef.current?.();
    }, 15_000);
    return () => clearInterval(interval);
  }, [phase]);

  const sendCommentary = useCallback((delegationId: string, text: string) => {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open") return false;
    const chunks = splitCommentary(text);
    if (!chunks.length) return false;
    try {
      for (const content of chunks) {
        channel.send(JSON.stringify({
          type: "session.commentary.append",
          event_id: crypto.randomUUID(),
          delegation_id: delegationId,
          content,
        }));
      }
    } catch {
      return false;
    }
    return true;
  }, []);

  const enqueueDelegation = useCallback((delegationId: string, transcript: string, epoch: number) => {
    queuedDelegationsRef.current.add(delegationId);
    const run = async () => {
      queuedDelegationsRef.current.delete(delegationId);
      if (!mountedRef.current || epoch !== sessionEpochRef.current) return;

      inFlightDelegationsRef.current.add(delegationId);
      const sessionToken = sessionTokenRef.current;
      const currentConversationId = liveConversationIdRef.current;
      const isCurrent = () => mountedRef.current
        && epoch === sessionEpochRef.current
        && latestDelegationRef.current === delegationId;
      try {
        if (!sessionToken || !currentConversationId) return;
        if (!transcript) {
          if (isCurrent()) {
            setError("Je n’ai pas compris la demande. Répète-la après la réponse en cours.");
            sendCommentary(delegationId, "Je n’ai pas assez entendu la demande. Je vais te laisser la répéter.");
          }
          return;
        }

        const response = await fetch("/api/assistant/live/delegations", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionToken, delegationId, transcript }),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(readApiError(payload) ?? "La réponse de Soma n’a pas pu être préparée.");
        if (!isRecord(payload) || payload.delegationId !== delegationId || typeof payload.responseText !== "string") {
          throw new Error("La réponse vocale reçue n’est pas complète. Réessaie.");
        }
        if (!isCurrent()) return;
        const sent = sendCommentary(delegationId, payload.responseText);
        if (!sent) throw new Error("La session vocale s’est interrompue avant la réponse.");
        completedTurnRef.current = true;
        onConversationUpdatedRef.current(currentConversationId);
      } catch (cause) {
        if (!isCurrent()) return;
        setError(cause instanceof Error ? cause.message : "La demande vocale n’a pas abouti. Réessaie.");
        sendCommentary(delegationId, "Je n’ai pas pu terminer cette demande. Tu peux me la redire dans un instant.");
      } finally {
        if (epoch === sessionEpochRef.current) inFlightDelegationsRef.current.delete(delegationId);
      }
    };

    const queued = delegationQueueRef.current.then(run, run);
    delegationQueueRef.current = queued.catch(() => undefined);
  }, [sendCommentary]);

  const queueDelegation = useCallback((delegationId: string, offsetMs: number) => {
    if (handledDelegationsRef.current.has(delegationId)) return;
    setError(null);
    handledDelegationsRef.current.add(delegationId);
    const superseded = new Set([
      ...pendingDelegationsRef.current.keys(),
      ...queuedDelegationsRef.current,
      ...inFlightDelegationsRef.current,
    ]);
    superseded.delete(delegationId);
    for (const previousId of superseded) {
      sendCommentary(previousId, "Je prends en compte ta dernière précision et je mets à jour la demande précédente.");
    }
    latestDelegationRef.current = delegationId;
    for (const [pendingId, pending] of pendingDelegationsRef.current) {
      if (pendingId === delegationId) continue;
      clearTimeout(pending.timer);
      pendingDelegationsRef.current.delete(pendingId);
    }
    if (superseded.size > 0) {
      sendCommentary(delegationId, "Je vérifie la demande avec ta dernière précision.");
    }
    const epoch = sessionEpochRef.current;
    const startedAt = Date.now();
    const flush = () => {
      const pending = pendingDelegationsRef.current.get(delegationId);
      if (!pending) return;
      const eligibleText = transcriptForOffset(transcriptFragmentsRef.current, transcriptCursorRef.current, offsetMs);
      const elapsed = Date.now() - startedAt;
      const quietFor = Date.now() - pending.lastTranscriptAt;
      if (elapsed < DELEGATION_MAX_WAIT_MS && (!eligibleText || quietFor < DELEGATION_SETTLE_MS)) {
        pending.timer = setTimeout(flush, Math.min(DELEGATION_SETTLE_MS, DELEGATION_MAX_WAIT_MS - elapsed));
        return;
      }
      pendingDelegationsRef.current.delete(delegationId);
      const transcript = transcriptForOffset(transcriptFragmentsRef.current, transcriptCursorRef.current, offsetMs);
      transcriptCursorRef.current = Math.max(transcriptCursorRef.current, offsetMs);
      enqueueDelegation(delegationId, transcript, epoch);
    };
    const timer = setTimeout(flush, DELEGATION_SETTLE_MS);
    pendingDelegationsRef.current.set(delegationId, { id: delegationId, offsetMs, timer, startedAt, lastTranscriptAt: startedAt, flush });
  }, [enqueueDelegation, sendCommentary]);

  const handleServerEvent = useCallback((event: LiveEvent) => {
    if (event.type === "session.started") {
      sessionStartedRef.current = true;
      lastActivityRef.current = Date.now();
      setError(null);
      setCurrentPhase("active");
      return;
    }
    if (event.type === "session.input_transcript.delta") {
      const delta = textFromEvent(event);
      if (delta) {
        lastActivityRef.current = Date.now();
        const startMs = eventTime(event.start_ms) ?? 0;
        const endMs = eventTime(event.end_ms) ?? startMs;
        transcriptFragmentsRef.current.push({ startMs, endMs, text: delta });
        if (transcriptFragmentsRef.current.length > 500) transcriptFragmentsRef.current.splice(0, transcriptFragmentsRef.current.length - 500);
        if (completedTurnRef.current) {
          completedTurnRef.current = false;
          setAssistantCaption("");
          setUserCaption(delta);
        } else setUserCaption((current) => `${current}${delta}`.slice(-12_000));
        for (const pending of pendingDelegationsRef.current.values()) {
          if (startMs <= pending.offsetMs) {
            clearTimeout(pending.timer);
            pending.lastTranscriptAt = Date.now();
            pending.timer = setTimeout(pending.flush, DELEGATION_SETTLE_MS);
          }
        }
      }
      return;
    }
    if (event.type === "session.output_transcript.delta") {
      const delta = textFromEvent(event);
      if (delta) {
        lastActivityRef.current = Date.now();
        setAssistantCaption((current) => `${current}${delta}`.slice(-12_000));
      }
      return;
    }
    if (event.type === "session.delegation.created") {
      const delegation = isRecord(event.delegation) ? event.delegation : null;
      const id = delegation && typeof delegation.id === "string" ? delegation.id : null;
      if (!id || (delegation?.target && delegation.target !== "client")) return;
      const offsetMs = eventTime(event.offset_ms)
        ?? transcriptFragmentsRef.current.at(-1)?.endMs
        ?? transcriptCursorRef.current;
      queueDelegation(id, offsetMs);
      return;
    }
    if (event.type === "session.closed") {
      finishSession(event);
      return;
    }
    if (event.type === "error") {
      setError("Le service vocal a rencontré un problème. Tu peux terminer la session et réessayer.");
    }
  }, [finishSession, queueDelegation, setCurrentPhase]);

  async function startSession() {
    if (disabled || phaseRef.current !== "idle") return;
    requestedConversationIdRef.current = conversationId;
    lastActivityRef.current = Date.now();
    completedTurnRef.current = false;
    setError(null);
    setUserCaption("");
    setAssistantCaption("");
    setCurrentPhase("requesting");
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      setError("Le mode vocal n’est pas disponible dans ce navigateur.");
      setCurrentPhase("idle");
      return;
    }

    const controller = new AbortController();
    createAbortRef.current = controller;
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || controller.signal.aborted) {
        microphone.getTracks().forEach((track) => track.stop());
        return;
      }
      microphoneRef.current = microphone;
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      peer.ontrack = (event) => {
        const audio = remoteAudioRef.current;
        if (!audio) return;
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        audio.srcObject = stream;
        void audio.play().then(() => setPlaybackBlocked(false)).catch(() => setPlaybackBlocked(true));
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed") {
          setError("La connexion vocale a échoué. Vérifie ton réseau puis réessaie.");
          finishSession();
        }
      };
      microphone.getAudioTracks().forEach((track) => peer.addTrack(track, microphone));
      const channel = peer.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onmessage = (message) => {
        try {
          const event: unknown = JSON.parse(message.data);
          if (isRecord(event)) handleServerEvent(event as LiveEvent);
        } catch {
          setError("Un événement vocal n’a pas pu être lu. Termine la session et réessaie.");
        }
      };
      channel.onclose = () => {
        if (phaseRef.current === "closing") {
          closeWaiterRef.current?.(false);
        } else if (phaseRef.current !== "idle") {
          setError("La connexion vocale s’est fermée. Tu peux la relancer.");
          finishSession();
        }
      };

      setCurrentPhase("connecting");
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitForIceGathering(peer, controller.signal);
      const sdp = peer.localDescription?.sdp;
      if (!sdp) throw new Error("Le navigateur n’a pas préparé la connexion audio.");
      const response = await fetch("/api/assistant/live/sessions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, sdp }),
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiError(payload) ?? "Le mode vocal n’a pas pu démarrer.");
      if (!isRecord(payload) || typeof payload.sdp !== "string" || typeof payload.sessionToken !== "string" || typeof payload.sessionId !== "string" || typeof payload.conversationId !== "string") {
        throw new Error("Le serveur n’a pas renvoyé les informations de connexion vocale.");
      }
      sessionTokenRef.current = payload.sessionToken;
      liveConversationIdRef.current = payload.conversationId;
      requestedConversationIdRef.current = payload.conversationId;
      closingPromiseRef.current = null;
      onConversationStartedRef.current(payload.conversationId);
      await peer.setRemoteDescription({ type: "answer", sdp: payload.sdp });
      if (!mountedRef.current || controller.signal.aborted) return;
      const startedDeadline = Date.now() + 20_000;
      while (!sessionStartedRef.current && peer.connectionState !== "failed" && Date.now() < startedDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (controller.signal.aborted) return;
      }
      if (!sessionStartedRef.current) throw new Error("La session vocale n’a pas confirmé son démarrage.");
      lastActivityRef.current = Date.now();
    } catch (cause) {
      if (!controller.signal.aborted && mountedRef.current) {
        const name = cause instanceof DOMException ? cause.name : "";
        const message = name === "NotAllowedError" || name === "PermissionDeniedError"
          ? "Autorise l’accès au microphone dans le navigateur, puis réessaie."
          : cause instanceof Error ? cause.message : "Le mode vocal n’a pas pu démarrer.";
        setError(message);
      }
      const channel = channelRef.current;
      if (sessionStartedRef.current && channel?.readyState === "open") {
        stopMicrophoneInput();
        await closeLiveSession(channel);
      }
      releaseTransport();
      if (mountedRef.current) setCurrentPhase("idle");
    } finally {
      if (createAbortRef.current === controller) createAbortRef.current = null;
    }
  }

  async function endSession() {
    const channel = channelRef.current;
    if (phaseRef.current === "idle") return;
    if (!sessionStartedRef.current || !channel || channel.readyState !== "open") {
      createAbortRef.current?.abort();
      releaseTransport();
      if (mountedRef.current) setCurrentPhase("idle");
      return;
    }
    setCurrentPhase("closing");
    stopMicrophoneInput();
    const drainDeadline = Date.now() + DELEGATION_DRAIN_TIMEOUT_MS;
    while ((pendingDelegationsRef.current.size > 0 || queuedDelegationsRef.current.size > 0 || inFlightDelegationsRef.current.size > 0) && Date.now() < drainDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    const delegationDrainTimedOut = pendingDelegationsRef.current.size > 0
      || queuedDelegationsRef.current.size > 0
      || inFlightDelegationsRef.current.size > 0;
    if (phaseRef.current !== "closing") return;
    const confirmed = await closeLiveSession(channel);
    if (!confirmed && phaseRef.current === "closing") {
      if (mountedRef.current) setError(delegationDrainTimedOut
        ? "Le micro est arrêté. La demande en cours n’a pas pu être confirmée avant la fermeture."
        : "Le micro est arrêté, mais la fin de session n’a pas été confirmée.");
      releaseTransport();
      if (mountedRef.current) setCurrentPhase("idle");
    }
  }

  useEffect(() => {
    endSessionRef.current = endSession;
  });

  function toggleMute() {
    const nextMuted = !muted;
    microphoneRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    setMuted(nextMuted);
  }

  async function enablePlayback() {
    const audio = remoteAudioRef.current;
    if (!audio) return;
    try {
      await audio.play();
      setPlaybackBlocked(false);
    } catch {
      setPlaybackBlocked(true);
    }
  }

  const busy = phase !== "idle";
  useEffect(() => {
    onPresentationChange?.(busy ? { phase, userCaption, assistantCaption, muted, error } : null);
  }, [assistantCaption, busy, error, muted, onPresentationChange, phase, userCaption]);
  const status = phase === "requesting" ? "Autorisation du microphone…"
    : phase === "connecting" ? "Connexion vocale…"
      : phase === "active" ? (muted ? "Micro coupé" : "Mode vocal actif")
        : phase === "closing" ? "Fermeture de la session…" : "";

  return <div className={`${styles.control} ${busy ? styles.expanded : ""} ${className ?? ""}`} data-live-phase={phase}>
    <audio ref={remoteAudioRef} className={styles.audioOutput} autoPlay playsInline aria-label="Voix de Soma" />
    {!busy ? <button
      type="button"
      className={styles.startButton}
      onClick={() => void startSession()}
      disabled={disabled}
      aria-label="Démarrer le mode vocal"
      title="Mode vocal"
    ><AudioLines size={19} aria-hidden="true" /></button> : <>
      <span className={styles.statusIcon} aria-hidden="true">{phase === "active" ? <AudioLines size={19} /> : <LoaderCircle size={18} className={styles.spinner} />}</span>
      <span className={styles.status} role="status" aria-live="polite">{status}</span>
      {playbackBlocked && phase === "active" && <button type="button" className={styles.soundButton} onClick={() => void enablePlayback()} aria-label="Activer le son"><Volume2 size={17} aria-hidden="true" /></button>}
      {phase === "active" && <button type="button" className={styles.muteButton} onClick={toggleMute} aria-label={muted ? "Activer le microphone" : "Couper le microphone"} aria-pressed={muted}>{muted ? <MicOff size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}</button>}
      <button type="button" className={styles.endButton} onClick={() => void endSession()} disabled={phase === "closing"} aria-label="Terminer le mode vocal">
        {phase === "closing" ? <LoaderCircle size={15} className={styles.spinner} aria-hidden="true" /> : <><Square size={12} fill="currentColor" aria-hidden="true" /><span>Terminer</span></>}
      </button>
    </>}
    {error && !busy && <span className={styles.error} role="alert">{error}</span>}
  </div>;
}
