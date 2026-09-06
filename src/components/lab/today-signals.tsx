"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { MEAL_TOTALS_EVENT, MEAL_TOTALS_REQUEST_EVENT, type MealTotalsEventDetail } from "@/domain/meal-record";

export type TodaySignalValues = {
  sleepMinutes: number | null;
  sleepRegularity: number | null;
  recoveryScore: number | null;
  effortScore: number | null;
  averageSleepMinutes?: number | null;
  averageSleepRegularity?: number | null;
  averageRecoveryScore?: number | null;
  averageEffortScore?: number | null;
  calorieProgress?: number | null;
  calorieTarget?: number | null;
  overnightFingerprint: string | null;
};

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const ANIMATION_DURATION_MS = 1_020;

function AnimatedSignalNumber({
  value,
  format,
}: {
  value: number | null;
  format: "duration" | "number" | "percentage";
}) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const mounted = useRef(false);
  const previousValue = useRef(value);

  const formatted = value === null
    ? "—"
    : format === "duration"
      ? duration(value)
      : `${Math.round(value)}${format === "percentage" ? "%" : ""}`;

  useClientLayoutEffect(() => {
    const from = !mounted.current ? 0 : previousValue.current ?? 0;
    const target = value;
    mounted.current = true;
    previousValue.current = value;

    if (target === null || from === target) {
      if (spanRef.current) spanRef.current.textContent = formatted;
      return;
    }

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion || typeof window.requestAnimationFrame !== "function") {
      if (spanRef.current) spanRef.current.textContent = formatted;
      return;
    }

    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / ANIMATION_DURATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (target - from) * eased;
      if (spanRef.current) {
        spanRef.current.textContent = format === "duration"
          ? duration(Math.round(current))
          : `${Math.round(current)}${format === "percentage" ? "%" : ""}`;
      }
      if (progress < 1) frame = window.requestAnimationFrame(tick);
      else if (spanRef.current) spanRef.current.textContent = formatted;
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [format, formatted, value]);

  return <span ref={spanRef}>{formatted}</span>;
}

function duration(minutes: number | null) {
  if (minutes === null) return "—";
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60).toString().padStart(2, "0")}`;
}

function comparison(value: number | null, average: number | null) {
  if (value === null || average === null || value === average) return "neutral";
  return value > average ? "above" : "below";
}

function accessibleValue(key: "sleepMinutes" | "recoveryScore" | "effortScore" | "calorieProgress", value: number | null) {
  if (value === null) return "not available";
  if (key === "sleepMinutes") return duration(value);
  if (key === "calorieProgress") return `${Math.round(value)}%`;
  return String(Math.round(value));
}

export function TodaySignals({ initial }: { initial: TodaySignalValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const valuesRef = useRef(values);
  const announcedInitial = useRef(false);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    const onMealTotals = (event: Event) => {
      const detail = (event as CustomEvent<MealTotalsEventDetail>).detail;
      if (!detail?.isToday) return;
      setValues((current) => ({
        ...current,
        calorieProgress: detail.calorieProgress,
        calorieTarget: detail.calorieTarget,
      }));
    };
    window.addEventListener(MEAL_TOTALS_EVENT, onMealTotals);
    window.dispatchEvent(new Event(MEAL_TOTALS_REQUEST_EVENT));
    return () => window.removeEventListener(MEAL_TOTALS_EVENT, onMealTotals);
  }, []);

  useEffect(() => {
    if (!announcedInitial.current) {
      announcedInitial.current = true;
      return;
    }
    setAnnouncement("Today values updated.");
    const timeout = window.setTimeout(() => setAnnouncement(""), 1200);
    return () => window.clearTimeout(timeout);
  }, [values.calorieProgress, values.effortScore, values.recoveryScore, values.sleepMinutes]);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    setRefreshing(true);
    try {
      const response = await fetch("/api/lab/today", { cache: "no-store" });
      if (!response.ok) return;
      const next = await response.json() as TodaySignalValues;
      setValues((current) => ({
        ...current,
        ...next,
        calorieProgress: "calorieProgress" in next ? next.calorieProgress : current.calorieProgress,
        calorieTarget: "calorieTarget" in next ? next.calorieTarget : current.calorieTarget,
      }));
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
    { key: "sleepMinutes" as const, label: "Sleep duration", node: <AnimatedSignalNumber value={values.sleepMinutes} format="duration" />, finalValue: accessibleValue("sleepMinutes", values.sleepMinutes), supporting: `30-day avg · ${values.averageSleepMinutes === null || values.averageSleepMinutes === undefined ? "—" : duration(Math.round(values.averageSleepMinutes))}`, trend: comparison(values.sleepMinutes, values.averageSleepMinutes ?? null), href: "/sleep" },
    { key: "recoveryScore" as const, label: "Recovery", node: <AnimatedSignalNumber value={values.recoveryScore} format="number" />, finalValue: accessibleValue("recoveryScore", values.recoveryScore), supporting: `30-day avg · ${values.averageRecoveryScore === null || values.averageRecoveryScore === undefined ? "—" : Math.round(values.averageRecoveryScore)}`, trend: comparison(values.recoveryScore, values.averageRecoveryScore ?? null), href: "/recovery" },
    { key: "effortScore" as const, label: "Effort", node: <AnimatedSignalNumber value={values.effortScore} format="number" />, finalValue: accessibleValue("effortScore", values.effortScore), supporting: `30-day avg · ${values.averageEffortScore === null || values.averageEffortScore === undefined ? "—" : Math.round(values.averageEffortScore)}`, trend: comparison(values.effortScore, values.averageEffortScore ?? null), href: "/activity" },
    { key: "calorieProgress" as const, label: "Calories", node: <AnimatedSignalNumber value={values.calorieProgress ?? null} format="percentage" />, finalValue: accessibleValue("calorieProgress", values.calorieProgress ?? null), supporting: `Cible · ${values.calorieTarget === null || values.calorieTarget === undefined ? "—" : `${Math.round(values.calorieTarget)} kcal`}`, trend: "neutral", href: "/meals" },
  ];
  return <section className="lab-signals" aria-label="Today" aria-busy={refreshing}>{signals.map(({ label, node, finalValue, supporting, trend, href }) => <Link href={href} key={label} aria-label={`${label}: ${finalValue}`}>
    <span><span className="lab-signal__label">{label}</span><small className="lab-signal__average">{supporting}</small></span>
    <strong className={`lab-signal__value lab-signal__value--${trend}`} aria-hidden="true">{node}</strong>
  </Link>)}<span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span></section>;
}
