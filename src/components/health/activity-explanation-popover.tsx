"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";

import { ScoreRing } from "@/components/dashboard/score-ring";

import { AnimatedMetricReading } from "./animated-value";
import type { HealthMetricTone } from "./health-metric-utils";

const focusableSelector = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";

function ExplanationPopover({ open, panelId, title, subtitle, rows, onClose, dialogRef, closeButtonRef }: { open: boolean; panelId: string; title: string; subtitle: string; rows: Array<{ label: string; value: string; detail: string }>; onClose: () => void; dialogRef: RefObject<HTMLDivElement | null>; closeButtonRef: RefObject<HTMLButtonElement | null> }) {
  if (!open) return null;
  return <div ref={dialogRef} className="health-explanation-popover" id={panelId} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
    <header><div><small>Fonctionnement</small><strong>{title}</strong></div><button ref={closeButtonRef} type="button" aria-label={`Fermer ${title}`} onClick={onClose}><X size={16} aria-hidden="true" /></button></header>
    <p>{subtitle}</p>
    <dl>{rows.map((row) => <div key={row.label}><dt>{row.label}<small>{row.detail}</small></dt><dd>{row.value}</dd></div>)}</dl>
  </div>;
}

function usePopover(rootRef: RefObject<HTMLElement | null>, triggerRef: RefObject<HTMLButtonElement | null>) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const close = () => {
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current?.contains(document.activeElement)) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
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
  return { open, setOpen, panelId, close, dialogRef, closeButtonRef };
}

export function ActivityScorePopover({ score, zoneMinutes, exerciseMinutes, activeEnergyKcal, steps }: { score: number | null; zoneMinutes: number | null; exerciseMinutes: number | null; activeEnergyKcal: number | null; steps: number | null }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popover = usePopover(rootRef, triggerRef);
  const rows = [
    { label: "Zones cardiaques", value: zoneMinutes === null ? "Indisponible" : `${Math.round(zoneMinutes)} min`, detail: "50 % · référence 75 min" },
    { label: "Exercice", value: exerciseMinutes === null ? "Indisponible" : `${Math.round(exerciseMinutes)} min`, detail: "25 % · référence 60 min" },
    { label: "Calories actives", value: activeEnergyKcal === null ? "Indisponible" : `${Math.round(activeEnergyKcal)} kcal`, detail: "15 % · référence 700 kcal" },
    { label: "Pas", value: steps === null ? "Indisponible" : Math.round(steps).toLocaleString("fr-FR"), detail: "10 % · référence 12 000" },
  ];
  return <div className="activity-score-control" ref={rootRef}>
    <button ref={triggerRef} type="button" className="health-score-trigger" aria-expanded={popover.open} aria-controls={popover.panelId} aria-haspopup="dialog" onClick={() => popover.setOpen((value) => !value)}>
      <ScoreRing kind="effort" label="Score" score={score} animate decorative />
      <span className="sr-only">{popover.open ? "Fermer" : "Ouvrir"} le calcul du score d’effort</span>
    </button>
    <ExplanationPopover open={popover.open} panelId={popover.panelId} title="Score d’effort" subtitle="Soma combine quatre signaux avec des rendements décroissants. Les données absentes sont retirées et les pondérations restantes sont rééquilibrées." rows={rows} onClose={popover.close} dialogRef={popover.dialogRef} closeButtonRef={popover.closeButtonRef} />
  </div>;
}

export function ActivityRegularityCard({ value, average, tone, observedDays }: { value: number | null; average: string; tone: HealthMetricTone; observedDays: number }) {
  const rootRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popover = usePopover(rootRef, triggerRef);
  const visibleContent: ReactNode = <><span>Régularité de l’effort</span><AnimatedMetricReading value={value} format="number" decimals={0} unit={value === null ? undefined : "%"} className={`metric-reading--${tone}`} /><p className="health-primary-card__average">Moy. 30 j · {average}&nbsp;%</p></>;
  return <article className={`health-primary-card health-primary-card--interactive metric-tone--${tone}`} ref={rootRef}>
    <button ref={triggerRef} type="button" className="health-primary-card__trigger" aria-expanded={popover.open} aria-controls={popover.panelId} aria-haspopup="dialog" onClick={() => popover.setOpen((current) => !current)}>{visibleContent}<span className="health-primary-card__hint">Voir le calcul</span></button>
    <ExplanationPopover open={popover.open} panelId={popover.panelId} title="Régularité de l’effort" subtitle="Ce score mesure la stabilité de votre effort quotidien, et non le fait de vous être entraîné chaque jour." rows={[
      { label: "Période", value: `${observedDays} jours`, detail: "Jusqu’à 28 jours mesurés" },
      { label: "Donnée quotidienne", value: "Score d’effort", detail: "Un score par jour mesuré" },
      { label: "Variation", value: "Moins est mieux", detail: "Moins de variation rapproche le résultat de 100 %" },
    ]} onClose={popover.close} dialogRef={popover.dialogRef} closeButtonRef={popover.closeButtonRef} />
  </article>;
}
