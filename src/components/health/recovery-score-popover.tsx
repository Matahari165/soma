"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { ScoreRing } from "@/components/dashboard/score-ring";

const focusableSelector = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])";

function driverValue(value: number | null) {
  return value === null ? "Indisponible" : Math.round(value).toLocaleString("fr-FR");
}

export function RecoveryScorePopover({ score, hrv, restingHeartRate, sleep }: { score: number | null; hrv: number | null; restingHeartRate: number | null; sleep: number | null }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
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
  }, [open]);

  return <div className="recovery-score-control" ref={rootRef}>
    <button ref={triggerRef} type="button" className="health-score-trigger" aria-expanded={open} aria-controls={panelId} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
      <ScoreRing kind="recovery" label="Score" score={score} animate decorative />
      <span className="sr-only">{open ? "Fermer" : "Ouvrir"} le calcul du score de récupération</span>
    </button>
    {open ? <div ref={dialogRef} className="recovery-score-popover" id={panelId} role="dialog" aria-modal="true" aria-label="Calcul du score de récupération" tabIndex={-1}>
      <header><div><small>Entrées du score</small><strong>Calcul de la récupération</strong></div><button ref={closeButtonRef} type="button" aria-label="Fermer le calcul de la récupération" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}><X size={16} aria-hidden="true" /></button></header>
      <p>Comparaison avec votre référence personnelle.</p>
      <dl>
        <div><dt>VFC vs référence</dt><dd>{driverValue(hrv)}</dd><small>40&nbsp;%</small></div>
        <div><dt>Fréquence cardiaque au repos</dt><dd>{driverValue(restingHeartRate)}</dd><small>30&nbsp;%</small></div>
        <div><dt>Score de sommeil</dt><dd>{driverValue(sleep)}</dd><small>30&nbsp;%</small></div>
      </dl>
    </div> : null}
  </div>;
}
