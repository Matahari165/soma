"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";

import { ScoreRing } from "@/components/dashboard/score-ring";

import { AnimatedMetricReading } from "./animated-value";
import type { HealthMetricTone } from "./health-metric-utils";

function ExplanationPopover({ open, panelId, title, subtitle, rows, onClose }: { open: boolean; panelId: string; title: string; subtitle: string; rows: Array<{ label: string; value: string; detail: string }>; onClose: () => void }) {
  if (!open) return null;
  return <div className="health-explanation-popover" id={panelId} role="dialog" aria-label={title}>
    <header><div><small>How it works</small><strong>{title}</strong></div><button type="button" aria-label={`Close ${title}`} onClick={onClose}><X size={16} aria-hidden="true" /></button></header>
    <p>{subtitle}</p>
    <dl>{rows.map((row) => <div key={row.label}><dt>{row.label}<small>{row.detail}</small></dt><dd>{row.value}</dd></div>)}</dl>
  </div>;
}

function usePopover(rootRef: RefObject<HTMLElement | null>, triggerRef: RefObject<HTMLButtonElement | null>) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, rootRef, triggerRef]);
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  return { open, setOpen, panelId, close };
}

export function ActivityScorePopover({ score, zoneMinutes, exerciseMinutes, activeEnergyKcal, steps }: { score: number | null; zoneMinutes: number | null; exerciseMinutes: number | null; activeEnergyKcal: number | null; steps: number | null }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popover = usePopover(rootRef, triggerRef);
  const rows = [
    { label: "Heart-rate zones", value: zoneMinutes === null ? "Unavailable" : `${Math.round(zoneMinutes)} min`, detail: "50% · reference 75 min" },
    { label: "Exercise", value: exerciseMinutes === null ? "Unavailable" : `${Math.round(exerciseMinutes)} min`, detail: "25% · reference 60 min" },
    { label: "Active calories", value: activeEnergyKcal === null ? "Unavailable" : `${Math.round(activeEnergyKcal)} kcal`, detail: "15% · reference 700 kcal" },
    { label: "Steps", value: steps === null ? "Unavailable" : Math.round(steps).toLocaleString("en-US"), detail: "10% · reference 12,000" },
  ];
  return <div className="activity-score-control" ref={rootRef}>
    <button ref={triggerRef} type="button" className="health-score-trigger" aria-expanded={popover.open} aria-controls={popover.panelId} aria-haspopup="dialog" onClick={() => popover.setOpen((value) => !value)}>
      <ScoreRing kind="effort" label="Score" score={score} animate decorative />
      <span className="sr-only">{popover.open ? "Close" : "Open"} activity score calculation</span>
    </button>
    <ExplanationPopover open={popover.open} panelId={popover.panelId} title="Activity score" subtitle="Soma combines four signals with diminishing returns. Missing inputs are removed and the remaining weights are rebalanced." rows={rows} onClose={popover.close} />
  </div>;
}

export function ActivityRegularityCard({ value, average, tone, observedDays }: { value: number | null; average: string; tone: HealthMetricTone; observedDays: number }) {
  const rootRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popover = usePopover(rootRef, triggerRef);
  const visibleContent: ReactNode = <><span>Activity regularity</span><AnimatedMetricReading value={value} format="number" decimals={0} unit={value === null ? undefined : "%"} className={`metric-reading--${tone}`} /><p className="health-primary-card__average">30-day average · {average}%</p></>;
  return <article className={`health-primary-card health-primary-card--interactive metric-tone--${tone}`} ref={rootRef}>
    <button ref={triggerRef} type="button" className="health-primary-card__trigger" aria-expanded={popover.open} aria-controls={popover.panelId} aria-haspopup="dialog" onClick={() => popover.setOpen((current) => !current)}>{visibleContent}<span className="health-primary-card__hint">View calculation</span></button>
    <ExplanationPopover open={popover.open} panelId={popover.panelId} title="Activity regularity" subtitle="This score measures how stable your daily activity effort has been, not whether you trained every day." rows={[
      { label: "Period", value: `${observedDays} days`, detail: "Up to the latest 28 measured days" },
      { label: "Daily input", value: "Effort score", detail: "One score for each measured day" },
      { label: "Variation", value: "Lower is better", detail: "Less variation brings the result closer to 100%" },
    ]} onClose={popover.close} />
  </article>;
}
