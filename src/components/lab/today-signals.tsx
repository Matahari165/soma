"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export type TodaySignalValues = {
  sleepMinutes: number | null;
  recoveryScore: number | null;
  effortScore: number | null;
  overnightFingerprint: string | null;
};

function duration(minutes: number | null) {
  if (minutes === null) return "—";
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60).toString().padStart(2, "0")}`;
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
    { label: "Sleep duration", value: duration(values.sleepMinutes), href: "/sleep" },
    { label: "Recovery", value: values.recoveryScore === null ? "—" : String(Math.round(values.recoveryScore)), href: "/recovery" },
    { label: "Effort", value: values.effortScore === null ? "—" : String(Math.round(values.effortScore)), href: "/activity" },
  ];
  return <section className="lab-signals" aria-label="Today" aria-busy={refreshing} aria-live="polite">{signals.map(({ label, value, href }) => <Link href={href} prefetch={false} key={label}><span>{label}</span><strong>{value}</strong></Link>)}</section>;
}
