"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { MEAL_TOTALS_EVENT, MEAL_TOTALS_REQUEST_EVENT, type MealTotalsEventDetail } from "@/domain/meal-record";
import type { PersonalLabHistoryPoint } from "@/services/personal-lab";
import { MetricHistoryTrace } from "./metric-history-trace";

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
  if (value === null) return "indisponible";
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
    setAnnouncement("Valeurs du jour actualisées.");
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
      setValues((current) => {
        const calorieTarget = "calorieTarget" in next ? next.calorieTarget : current.calorieTarget;
        return {
          ...current,
          ...next,
          calorieProgress: "calorieProgress" in next ? next.calorieProgress : current.calorieProgress,
          calorieTarget: current.calorieTarget !== null && current.calorieTarget !== undefined
            && (calorieTarget === null || calorieTarget === undefined || calorieTarget < current.calorieTarget)
            ? current.calorieTarget
            : calorieTarget,
        };
      });
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
    { key: "sleepMinutes" as const, label: "Sommeil", node: <AnimatedSignalNumber value={values.sleepMinutes} format="duration" />, finalValue: accessibleValue("sleepMinutes", values.sleepMinutes), supporting: `Moy. 30 j · ${values.averageSleepMinutes === null || values.averageSleepMinutes === undefined ? "—" : duration(Math.round(values.averageSleepMinutes))}`, trend: comparison(values.sleepMinutes, values.averageSleepMinutes ?? null), href: "/sleep" },
    { key: "recoveryScore" as const, label: "Récupération", node: <AnimatedSignalNumber value={values.recoveryScore} format="number" />, finalValue: accessibleValue("recoveryScore", values.recoveryScore), supporting: `Moy. 30 j · ${values.averageRecoveryScore === null || values.averageRecoveryScore === undefined ? "—" : Math.round(values.averageRecoveryScore)}`, trend: comparison(values.recoveryScore, values.averageRecoveryScore ?? null), href: "/recovery" },
    { key: "effortScore" as const, label: "Effort", node: <AnimatedSignalNumber value={values.effortScore} format="number" />, finalValue: accessibleValue("effortScore", values.effortScore), supporting: `Moy. 30 j · ${values.averageEffortScore === null || values.averageEffortScore === undefined ? "—" : Math.round(values.averageEffortScore)}`, trend: comparison(values.effortScore, values.averageEffortScore ?? null), href: "/activity" },
    { key: "calorieProgress" as const, label: "Calories", node: <AnimatedSignalNumber value={values.calorieProgress ?? null} format="percentage" />, finalValue: accessibleValue("calorieProgress", values.calorieProgress ?? null), supporting: null, trend: values.calorieProgress !== null && values.calorieProgress !== undefined && values.calorieProgress < 100 ? "below" : "neutral", href: "/meals" },
  ];
  return <section className="lab-signals" aria-label="Aujourd’hui" aria-busy={refreshing}>{signals.map(({ label, node, finalValue, supporting, trend, href }) => <Link href={href} key={label} aria-label={`${label} : ${finalValue}`}>
    <span><span className="lab-signal__label">{label}</span>{supporting && <small className="lab-signal__average">{supporting}</small>}</span>
    <strong className={`lab-signal__value lab-signal__value--${trend}`} aria-hidden="true">{node}</strong>
  </Link>)}<span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span></section>;
}

type PersonalLabMetricKey = "sleep" | "recovery" | "strain" | "energy";

export type PersonalLabMetricValues = {
  overnightFingerprint?: string | null;
  sleepMinutes: number | null;
  recoveryScore: number | null;
  effortScore: number | null;
  caloriesKcal: number | null;
  calorieTarget?: number | null;
  averageSleepMinutes: number | null;
  averageRecoveryScore: number | null;
  averageEffortScore: number | null;
  averageCaloriesKcal: number | null;
  history: PersonalLabHistoryPoint[];
};

type PersonalLabMetricRefresh = Partial<PersonalLabMetricValues> & { overnightFingerprint?: string | null };

export function applyMealTotals(values: PersonalLabMetricValues, detail: MealTotalsEventDetail) {
  if (!detail.isToday) return values;
  return {
    ...values,
    caloriesKcal: detail.calories,
    history: values.history.map((point) => point.date === detail.date ? { ...point, caloriesKcal: detail.calories } : point),
  };
}

export function mergePersonalLabMetricRefresh(values: PersonalLabMetricValues, next: PersonalLabMetricRefresh) {
  const calorieTarget = values.calorieTarget !== null && values.calorieTarget !== undefined
    && (next.calorieTarget === null || next.calorieTarget === undefined || next.calorieTarget < values.calorieTarget)
    ? values.calorieTarget
    : next.calorieTarget ?? values.calorieTarget;
  return {
    ...values,
    ...next,
    calorieTarget,
    history: Array.isArray(next.history) ? next.history : values.history,
  };
}

function strainScore(value: number | null) {
  return value === null ? null : value * 0.21;
}

function metricDuration(value: number | null) {
  if (value === null) return "—";
  return `${Math.floor(value / 60)}h ${Math.round(value % 60).toString().padStart(2, "0")}`;
}

function metricNumber(value: number | null) {
  return value === null ? "—" : Math.round(value).toString();
}

function metricCalories(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function metricStrain(value: number | null) {
  const score = strainScore(value);
  return score === null ? "—" : `${score.toFixed(1)} / 21.0`;
}

function metricValue(key: PersonalLabMetricKey, value: number | null) {
  if (key === "sleep") return metricDuration(value);
  if (key === "recovery") return metricNumber(value);
  if (key === "strain") return metricStrain(value);
  return metricCalories(value);
}

function accessibleHistoryDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(`${date}T12:00:00`));
}

function visibleMetricValue(key: PersonalLabMetricKey, value: number | null) {
  if (key !== "strain") return metricValue(key, value);
  const score = strainScore(value);
  if (score === null) return "—";
  return <><span>{score.toFixed(1)}</span><small className="personal-lab-metric__denominator" aria-hidden="true">/21</small></>;
}

function signedDelta(key: PersonalLabMetricKey, value: number | null, averageValue: number | null, calorieTarget?: number | null) {
  const targetLabel = key === "energy" && calorieTarget !== null && calorieTarget !== undefined ? `Cible ${metricCalories(calorieTarget)} · ` : "";
  if (value === null || averageValue === null) return `${targetLabel}Moy. 30 j —`;
  const delta = value - averageValue;
  if (key === "sleep") return `Moy. 30 j ${metricDuration(averageValue)} · ${delta >= 0 ? "+" : "−"}${metricDuration(Math.abs(delta))}`;
  if (key === "strain") return `Moy. 30 j ${metricStrain(averageValue)} · ${delta >= 0 ? "+" : "−"}${Math.abs(delta * 0.21).toFixed(1)}`;
  if (key === "energy") return `${targetLabel}Moy. 30 j ${metricCalories(averageValue)} · ${delta >= 0 ? "+" : "−"}${metricCalories(Math.abs(delta))}`;
  return `Moy. 30 j ${metricNumber(averageValue)} · ${delta >= 0 ? "+" : "−"}${Math.round(Math.abs(delta))}`;
}

function valueForHistory(key: PersonalLabMetricKey, point: PersonalLabHistoryPoint) {
  if (key === "sleep") return point.sleepMinutes;
  if (key === "recovery") return point.recoveryScore;
  if (key === "strain") return point.effortScore;
  return point.caloriesKcal;
}

function historyMax(key: PersonalLabMetricKey, history: PersonalLabHistoryPoint[]) {
  const values = history.map((point) => valueForHistory(key, point)).filter((value): value is number => value !== null && Number.isFinite(value));
  if (key === "sleep") return 600;
  if (key === "recovery" || key === "strain") return 100;
  return Math.max(2_500, ...values, 1);
}

function PersonalLabMetricCard({ label, keyName, value, averageValue, calorieTarget, history, href, showTrace = false }: {
  label: string;
  keyName: PersonalLabMetricKey;
  value: number | null;
  averageValue: number | null;
  calorieTarget?: number | null;
  history: PersonalLabHistoryPoint[];
  href: string;
  showTrace?: boolean;
}) {
  const visibleHistory = history.slice(-5);
  const max = historyMax(keyName, visibleHistory);
  const trend = comparison(value, averageValue);
  const accessibleHistory = visibleHistory.map((point) => `${accessibleHistoryDate(point.date)} : ${metricValue(keyName, valueForHistory(keyName, point))}`).join(", ");
  return <Link className={`personal-lab-metric personal-lab-metric--${trend}`} data-trend={trend} href={href} aria-label={`${label} : ${metricValue(keyName, value)}. Historique des cinq derniers jours : ${accessibleHistory}`}>
    <span className="personal-lab-metric__copy">
      <span className="personal-lab-metric__label">{label}</span>
      <strong className="personal-lab-metric__value">{visibleMetricValue(keyName, value)}</strong>
      <small className="personal-lab-metric__average">{signedDelta(keyName, value, averageValue, calorieTarget)}</small>
    </span>
    <span className="personal-lab-metric__bars" aria-hidden="true">
      {visibleHistory.map((point) => {
        const pointValue = valueForHistory(keyName, point);
        const height = pointValue === null ? 7 : Math.max(12, Math.round(pointValue / max * 100));
        return <span className={`personal-lab-metric__bar${pointValue === null ? " is-empty" : ""}`} style={{ height: `${height}%` }} key={point.date} />;
      })}
    </span>
    {showTrace && <MetricHistoryTrace values={visibleHistory.map(point => valueForHistory(keyName, point))} maximum={max} />}
  </Link>;
}

export function PersonalLabMetrics({ data, presentation = "default" }: { data: PersonalLabMetricValues; presentation?: "default" | "worlds" }) {
  const router = useRouter();
  const [values, setValues] = useState(data);
  const valuesRef = useRef(values);

  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  useEffect(() => {
    startTransition(() => setValues(data));
  }, [data]);

  useEffect(() => {
    const onMealTotals = (event: Event) => {
      const detail = (event as CustomEvent<MealTotalsEventDetail>).detail;
      if (!detail?.isToday) return;
      setValues((current) => applyMealTotals(current, detail));
      // The event has the current total, but the 30-day average only exists
      // in the server-rendered Personal Lab snapshot. Refresh that snapshot
      // so the comparison is recalculated immediately after a meal save.
      router.refresh();
    };
    window.addEventListener(MEAL_TOTALS_EVENT, onMealTotals);
    window.dispatchEvent(new Event(MEAL_TOTALS_REQUEST_EVENT));
    return () => window.removeEventListener(MEAL_TOTALS_EVENT, onMealTotals);
  }, [router]);

  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const response = await fetch("/api/lab/today", { cache: "no-store" }).catch(() => null);
      if (!response?.ok) return;
      const next = await response.json() as PersonalLabMetricRefresh;
      setValues((current) => mergePersonalLabMetricRefresh(current, next));
      if (next.overnightFingerprint && next.overnightFingerprint !== valuesRef.current.overnightFingerprint) window.location.reload();
    };
    const interval = window.setInterval(() => void refresh(), 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const metrics = [
    { label: "Sommeil", keyName: "sleep" as const, value: values.sleepMinutes, averageValue: values.averageSleepMinutes, href: "/sleep" },
    { label: "Récupération", keyName: "recovery" as const, value: values.recoveryScore, averageValue: values.averageRecoveryScore, href: "/recovery" },
    { label: "Effort", keyName: "strain" as const, value: values.effortScore, averageValue: values.averageEffortScore, href: "/activity" },
    { label: "Énergie", keyName: "energy" as const, value: values.caloriesKcal, averageValue: values.averageCaloriesKcal, calorieTarget: values.calorieTarget, href: "/meals" },
  ];
  return <section className="personal-lab-metrics" aria-label="Métriques du jour">{metrics.map((metric) => <PersonalLabMetricCard {...metric} history={values.history} showTrace={presentation === "worlds"} key={metric.keyName} />)}</section>;
}
