"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { ScoreRing } from "@/components/dashboard/score-ring";

function driverValue(value: number | null) {
  return value === null ? "Indisponible" : Math.round(value).toLocaleString("fr-FR");
}

export function RecoveryScorePopover({ score, hrv, restingHeartRate, sleep }: { score: number | null; hrv: number | null; restingHeartRate: number | null; sleep: number | null }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

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
  }, [open]);

  return <div className="recovery-score-control" ref={rootRef}>
    <button ref={triggerRef} type="button" className="health-score-trigger" aria-expanded={open} aria-controls={panelId} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
      <ScoreRing kind="recovery" label="Score" score={score} animate decorative />
      <span className="sr-only">{open ? "Fermer" : "Ouvrir"} le calcul du score de récupération</span>
    </button>
    {open ? <div className="recovery-score-popover" id={panelId} role="dialog" aria-label="Calcul du score de récupération">
      <header><div><small>Entrées du score</small><strong>Calcul de la récupération</strong></div><button type="button" aria-label="Fermer le calcul de la récupération" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}><X size={16} aria-hidden="true" /></button></header>
      <p>Comparaison avec votre référence personnelle.</p>
      <dl>
        <div><dt>VFC vs référence</dt><dd>{driverValue(hrv)}</dd><small>40&nbsp;%</small></div>
        <div><dt>Fréquence cardiaque au repos</dt><dd>{driverValue(restingHeartRate)}</dd><small>30&nbsp;%</small></div>
        <div><dt>Score de sommeil</dt><dd>{driverValue(sleep)}</dd><small>30&nbsp;%</small></div>
      </dl>
    </div> : null}
  </div>;
}
