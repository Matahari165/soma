"use client";

import { ArrowUp, Mic, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import styles from "./assistant-dictation.module.css";

const MAX_RECORDING_MS = 5 * 60 * 1_000;
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const WAVE_BAR_COUNT = 36;
type Phase = "idle" | "starting" | "recording" | "transcribing";

function recordingType() {
  if (typeof MediaRecorder === "undefined") return null;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
    .find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

function durationLabel(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function AssistantDictation({
  disabled,
  onBusyChange,
  onTranscript,
  className,
}: {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
  onTranscript: (text: string, sendImmediately: boolean) => void;
  className?: string;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRef = useRef(false);
  const sendAfterTranscriptionRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const limitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const waveRef = useRef<HTMLSpanElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const meterLevelsRef = useRef<number[]>([]);
  const meterLastFrameRef = useRef<number | null>(null);
  const [meterAvailable, setMeterAvailable] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      discardRef.current = true;
      abortRef.current?.abort();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (limitRef.current) clearTimeout(limitRef.current);
      if (meterFrameRef.current !== null) cancelAnimationFrame(meterFrameRef.current);
      if (audioContextRef.current) void audioContextRef.current.close();
      onBusyChange(false);
    };
  }, [onBusyChange]);

  function releaseMicrophone() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (limitRef.current) clearTimeout(limitRef.current);
    if (meterFrameRef.current !== null) cancelAnimationFrame(meterFrameRef.current);
    if (audioContextRef.current) void audioContextRef.current.close();
    audioContextRef.current = null;
    meterFrameRef.current = null;
    meterLevelsRef.current = [];
    meterLastFrameRef.current = null;
    setMeterAvailable(false);
    intervalRef.current = null;
    limitRef.current = null;
  }

  function startMeter(stream: MediaStream) {
    if (typeof AudioContext === "undefined") return;
    try {
      const context = new AudioContext();
      audioContextRef.current = context;
      void context.resume().catch(() => {
        if (audioContextRef.current === context) setMeterAvailable(false);
      });
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      setMeterAvailable(true);
      const sample = (timestamp: number) => {
        const elapsed = meterLastFrameRef.current === null ? 16 : Math.min(100, Math.max(0, timestamp - meterLastFrameRef.current));
        meterLastFrameRef.current = timestamp;
        analyser.getFloatTimeDomainData(samples);
        let totalEnergy = 0;
        for (let index = 0; index < samples.length; index += 2) totalEnergy += samples[index] ** 2;
        const overallRms = Math.sqrt(totalEnergy / (samples.length / 2));
        const bars = waveRef.current?.querySelectorAll<HTMLElement>("span");
        const visibleCount = window.matchMedia("(max-width: 700px)").matches ? 12 : WAVE_BAR_COUNT;
        bars?.forEach((bar, index) => {
          if (index >= visibleCount) return;
          const from = Math.floor(index * samples.length / visibleCount);
          const to = Math.floor((index + 1) * samples.length / visibleCount);
          let localEnergy = 0;
          let sampleCount = 0;
          for (let sampleIndex = from; sampleIndex < to; sampleIndex += 2) {
            localEnergy += samples[sampleIndex] ** 2;
            sampleCount += 1;
          }
          const localRms = Math.sqrt(localEnergy / Math.max(1, sampleCount));
          const level = overallRms < .002
            ? .16
            : Math.min(1, Math.max(.16, .16 + .84 * (localRms - .001) / Math.max(.006, overallRms * 1.4)));
          const previous = meterLevelsRef.current[index] ?? .16;
          const responseMs = level > previous ? 100 : 260;
          const smoothed = previous + (level - previous) * (1 - Math.exp(-elapsed / responseMs));
          meterLevelsRef.current[index] = smoothed;
          bar.style.setProperty("--level", String(smoothed));
        });
        meterFrameRef.current = requestAnimationFrame(sample);
      };
      meterFrameRef.current = requestAnimationFrame(sample);
    } catch {
      if (audioContextRef.current) void audioContextRef.current.close();
      audioContextRef.current = null;
      setMeterAvailable(false);
    }
  }

  async function transcribe(blob: Blob, extension: string, sendImmediately: boolean) {
    if (!blob.size) {
      setError("Aucun son enregistré. Réessaie.");
      setPhase("idle");
      onBusyChange(false);
      return;
    }
    if (blob.size > MAX_AUDIO_BYTES) {
      setError("Enregistrement trop volumineux. Essaie une note plus courte.");
      setPhase("idle");
      onBusyChange(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const body = new FormData();
      body.set("file", new File([blob], `dictee.${extension}`, { type: blob.type }));
      const response = await fetch("/api/assistant/transcriptions", { method: "POST", body, signal: controller.signal });
      const result: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = result && typeof result === "object" && "message" in result && typeof result.message === "string"
          ? result.message : "La transcription a échoué. Réessaie.";
        throw new Error(message);
      }
      if (!result || typeof result !== "object" || !("text" in result) || typeof result.text !== "string") {
        throw new Error("Aucune transcription reçue. Réessaie.");
      }
      if (mountedRef.current) onTranscript(result.text, sendImmediately);
    } catch (cause) {
      if (mountedRef.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "La transcription a échoué. Réessaie.");
    } finally {
      abortRef.current = null;
      if (mountedRef.current) {
        setPhase("idle");
        onBusyChange(false);
      }
    }
  }

  async function startRecording() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || !recordingType()) {
      setError("La dictée n’est pas disponible dans ce navigateur.");
      return;
    }
    setPhase("starting");
    onBusyChange(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      chunksRef.current = [];
      discardRef.current = false;
      sendAfterTranscriptionRef.current = false;
      const mimeType = recordingType() as string;
      const extension = mimeType.startsWith("audio/mp4") ? "mp4" : "webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => {
        discardRef.current = true;
        releaseMicrophone();
        if (mountedRef.current) {
          setError("L’enregistrement a été interrompu. Réessaie.");
          setPhase("idle");
          onBusyChange(false);
        }
      };
      recorder.onstop = () => {
        releaseMicrophone();
        if (discardRef.current || !mountedRef.current) return;
        const blob = new Blob(chunksRef.current, { type: mimeType.split(";")[0] });
        void transcribe(blob, extension, sendAfterTranscriptionRef.current);
      };
      recorder.start();
      startMeter(stream);
      const startedAt = Date.now();
      setSeconds(0);
      setPhase("recording");
      intervalRef.current = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1_000)), 1_000);
      limitRef.current = setTimeout(() => stopRecording(false), MAX_RECORDING_MS);
    } catch {
      releaseMicrophone();
      if (mountedRef.current) {
        setError("Autorise le micro dans le navigateur, puis réessaie.");
        setPhase("idle");
        onBusyChange(false);
      }
    }
  }

  function stopRecording(sendImmediately: boolean) {
    if (recorderRef.current?.state !== "recording") return;
    sendAfterTranscriptionRef.current = sendImmediately;
    setPhase("transcribing");
    recorderRef.current.stop();
  }

  function cancelRecording() {
    discardRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    releaseMicrophone();
    setPhase("idle");
    onBusyChange(false);
    setError(null);
  }

  return <div className={`${styles.control} ${className ?? ""}`} data-voice-control="dictation" data-phase={phase} data-error={Boolean(error)}>
    {phase === "recording" ? <>
      <button type="button" className={styles.cancel} onClick={cancelRecording} aria-label="Annuler la dictée"><X size={17} aria-hidden="true" /></button>
      <span ref={waveRef} className={`${styles.wave} ${meterAvailable ? styles.liveMeter : ""}`} aria-hidden="true">{Array.from({ length: WAVE_BAR_COUNT }, (_, bar) => <span key={bar} />)}</span>
      <span className={styles.timer}>{durationLabel(seconds)}</span>
      <button type="button" className={`${styles.action} ${styles.stop}`} onClick={() => stopRecording(false)} aria-label="Arrêter et transcrire"><Square size={13} fill="currentColor" aria-hidden="true" /></button>
      <button type="button" className={`${styles.action} ${styles.send}`} onClick={() => stopRecording(true)} aria-label="Arrêter, transcrire et envoyer"><ArrowUp size={17} aria-hidden="true" /><span>Envoyer</span></button>
    </> : <button
      type="button"
      className={styles.button}
      onClick={() => void startRecording()}
      disabled={disabled || phase === "starting" || phase === "transcribing"}
      aria-label="Dicter un message"
    ><Mic size={19} aria-hidden="true" /></button>}
    <span className={`${styles.status} ${phase === "recording" ? styles.recordingStatus : ""} ${error ? styles.statusError : ""}`} role={error ? "alert" : "status"} aria-live="polite">
      {error ?? (phase === "recording" ? "Enregistrement en cours" : phase === "starting" ? "Ouverture du micro…" : phase === "transcribing" ? "Transcription…" : "")}
    </span>
  </div>;
}
