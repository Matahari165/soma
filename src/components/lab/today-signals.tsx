"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export type TodaySignalValues = {
  sleepMinutes: number | null;
  recoveryScore: number | null;
  effortScore: number | null;
  averageSleepMinutes?: number | null;
  averageRecoveryScore?: number | null;
  averageEffortScore?: number | null;
  overnightFingerprint: string | null;
};

function duration(minutes: number | null) {
  if (minutes === null) return "—";
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60).toString().padStart(2, "0")}`;
}

function comparison(value: number | null, average: number | null) {
  if (value === null || average === null || value === average) return "neutral";
  return value > average ? "above" : "below";
}

export function TodaySignals({ initial }: { initial: TodaySignalValues }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    setRefreshing(true);
    try {
      const response = await fetch("/api/lab/today", { cache: "no-store" });
      if (!response.ok) return;
      const next = await response.json() as TodaySignalValues;
      setValues(next);
      if (next.overnightFingerprint && next.overnightFingerprint !== values.overnightFingerprint) router.refresh();
    } finally {
      setRefreshing(false);
    }
  }, [router, values.overnightFingerprint]);

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
    { label: "Sleep duration", value: duration(values.sleepMinutes), average: duration(values.averageSleepMinutes ?? null), trend: comparison(values.sleepMinutes, values.averageSleepMinutes ?? null), href: "/sleep" },
    { label: "Recovery", value: values.recoveryScore === null ? "—" : String(Math.round(values.recoveryScore)), average: values.averageRecoveryScore === null || values.averageRecoveryScore === undefined ? "—" : String(Math.round(values.averageRecoveryScore)), trend: comparison(values.recoveryScore, values.averageRecoveryScore ?? null), href: "/recovery" },
    { label: "Effort", value: values.effortScore === null ? "—" : String(Math.round(values.effortScore)), average: values.averageEffortScore === null || values.averageEffortScore === undefined ? "—" : String(Math.round(values.averageEffortScore)), trend: comparison(values.effortScore, values.averageEffortScore ?? null), href: "/activity" },
  ];
  return <section className="lab-signals" aria-label="Today" aria-busy={refreshing} aria-live="polite">{signals.map(({ label, value, average, trend, href }) => <Link href={href} prefetch={false} key={label}>
    <span><span className="lab-signal__label">{label}</span><small className="lab-signal__average">30-day avg · {average}</small></span>
    <strong className={`lab-signal__value lab-signal__value--${trend}`}>{value}</strong>
  </Link>)}</section>;
}
