"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type TodaySignalValues = {
  sleepMinutes: number | null;
  sleepRegularity: number | null;
  recoveryScore: number | null;
  effortScore: number | null;
  averageSleepMinutes?: number | null;
  averageSleepRegularity?: number | null;
  averageRecoveryScore?: number | null;
  averageEffortScore?: number | null;
  overnightFingerprint: string | null;
};

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type AnimatedSignalValues = Pick<TodaySignalValues, "sleepMinutes" | "recoveryScore" | "effortScore">;

const ANIMATION_DURATION_MS = 1_020;

function animatedValues(values: TodaySignalValues): AnimatedSignalValues {
  return {
    sleepMinutes: values.sleepMinutes,
    recoveryScore: values.recoveryScore,
    effortScore: values.effortScore,
  };
}

function valuesDiffer(left: AnimatedSignalValues, right: AnimatedSignalValues) {
  return left.sleepMinutes !== right.sleepMinutes
    || left.recoveryScore !== right.recoveryScore
    || left.effortScore !== right.effortScore;
}

function interpolateValue(from: number | null, to: number | null, progress: number) {
  if (to === null) return null;
  const start = from === null ? 0 : from;
  return start + (to - start) * progress;
}

function useAnimatedSignalValues(values: TodaySignalValues) {
  const target = animatedValues(values);
  const [displayed, setDisplayed] = useState<AnimatedSignalValues>(target);
  const previousTarget = useRef(target);
  const mounted = useRef(false);

  useClientLayoutEffect(() => {
    const previous = previousTarget.current;
    const firstMount = !mounted.current;
    const from: AnimatedSignalValues = {
      sleepMinutes: firstMount ? (target.sleepMinutes === null ? null : 0) : previous.sleepMinutes,
      recoveryScore: firstMount ? (target.recoveryScore === null ? null : 0) : previous.recoveryScore,
      effortScore: firstMount ? (target.effortScore === null ? null : 0) : previous.effortScore,
    };
    const changed = firstMount || valuesDiffer(previous, target);
    mounted.current = true;
    previousTarget.current = target;

    if (!changed) {
      setDisplayed(target);
      return;
    }

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion || typeof window.requestAnimationFrame !== "function") {
      setDisplayed(target);
      return;
    }

    setDisplayed(from);
    const startedAt = performance.now();
    let frame = 0;
    let animationComplete = false;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / ANIMATION_DURATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed({
        sleepMinutes: interpolateValue(from.sleepMinutes, target.sleepMinutes, eased),
        recoveryScore: interpolateValue(from.recoveryScore, target.recoveryScore, eased),
        effortScore: interpolateValue(from.effortScore, target.effortScore, eased),
      });
      if (progress < 1) frame = window.requestAnimationFrame(tick);
      else animationComplete = true;
    };
    frame = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(frame);
      // React Strict Mode probes effects twice in development. If that probe
      // interrupts the initial animation, let the second setup replay it.
      if (firstMount && !animationComplete) {
        mounted.current = false;
        previousTarget.current = target;
      }
    };
  }, [target.effortScore, target.recoveryScore, target.sleepMinutes]);

  return displayed;
}

function duration(minutes: number | null) {
  if (minutes === null) return "—";
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60).toString().padStart(2, "0")}`;
}

function comparison(value: number | null, average: number | null) {
  if (value === null || average === null || value === average) return "neutral";
  return value > average ? "above" : "below";
}

function displayValue(key: keyof AnimatedSignalValues, value: number | null) {
  if (value === null) return "—";
  if (key === "sleepMinutes") return duration(Math.round(value));
  return String(Math.round(value));
}

function accessibleValue(key: keyof AnimatedSignalValues, value: number | null) {
  if (value === null) return "not available";
  if (key === "sleepMinutes") return duration(value);
  return String(Math.round(value));
}

export function TodaySignals({ initial }: { initial: TodaySignalValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const animated = useAnimatedSignalValues(values);
  const valuesRef = useRef(values);
  const announcedInitial = useRef(false);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    if (!announcedInitial.current) {
      announcedInitial.current = true;
      return;
    }
    setAnnouncement("Today values updated.");
    const timeout = window.setTimeout(() => setAnnouncement(""), 1200);
    return () => window.clearTimeout(timeout);
  }, [values.effortScore, values.recoveryScore, values.sleepMinutes]);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    setRefreshing(true);
    try {
      const response = await fetch("/api/lab/today", { cache: "no-store" });
      if (!response.ok) return;
      const next = await response.json() as TodaySignalValues;
      setValues(next);
      if (next.overnightFingerprint && next.overnightFingerprint !== valuesRef.current.overnightFingerprint) router.refresh();
    } finally {
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    const interval = window.setInterval(() => void refresh(), 60_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  const signals = [
    { key: "sleepMinutes" as const, label: "Sleep duration", value: displayValue("sleepMinutes", animated.sleepMinutes), finalValue: accessibleValue("sleepMinutes", values.sleepMinutes), average: values.averageSleepMinutes === null || values.averageSleepMinutes === undefined ? "—" : duration(Math.round(values.averageSleepMinutes)), trend: comparison(values.sleepMinutes, values.averageSleepMinutes ?? null), href: "/sleep" },
    { key: "recoveryScore" as const, label: "Recovery", value: displayValue("recoveryScore", animated.recoveryScore), finalValue: accessibleValue("recoveryScore", values.recoveryScore), average: values.averageRecoveryScore === null || values.averageRecoveryScore === undefined ? "—" : String(Math.round(values.averageRecoveryScore)), trend: comparison(values.recoveryScore, values.averageRecoveryScore ?? null), href: "/recovery" },
    { key: "effortScore" as const, label: "Effort", value: displayValue("effortScore", animated.effortScore), finalValue: accessibleValue("effortScore", values.effortScore), average: values.averageEffortScore === null || values.averageEffortScore === undefined ? "—" : String(Math.round(values.averageEffortScore)), trend: comparison(values.effortScore, values.averageEffortScore ?? null), href: "/activity" },
  ];
  return <section className="lab-signals" aria-label="Today" aria-busy={refreshing}>{signals.map(({ label, value, finalValue, average, trend, href }) => <Link href={href} prefetch={false} key={label} aria-label={`${label}: ${finalValue}`}>
    <span><span className="lab-signal__label">{label}</span><small className="lab-signal__average">30-day avg · {average}</small></span>
    <strong className={`lab-signal__value lab-signal__value--${trend}`} aria-hidden="true">{value}</strong>
  </Link>)}<span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span></section>;
}
