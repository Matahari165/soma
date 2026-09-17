"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { ScoreRing } from "@/components/dashboard/score-ring";

function driverValue(value: number | null) {
  return value === null ? "Unavailable" : Math.round(value).toLocaleString("en-US");
}

export function RecoveryScorePopover({ score, hrv, restingHeartRate, sleep }: { score: number | null; hrv: number | null; restingHeartRate: number | null; sleep: number | null }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const titleId = `${panelId}-title`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closePanel = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [closePanel, open]);

  return <div className="recovery-score-control">
    <button ref={triggerRef} type="button" className="health-score-trigger" aria-expanded={open} aria-controls={panelId} onClick={() => open ? closePanel() : setOpen(true)}>
      <ScoreRing kind="recovery" label="Score" score={score} animate decorative />
      <span className="sr-only">{open ? "Close" : "Open"} recovery score calculation</span>
    </button>
    <div id={panelId} className="recovery-score-inline" data-open={open ? "true" : "false"} aria-hidden={!open} inert={!open} aria-labelledby={titleId}>
      <div className="recovery-score-inline__inner">
        <header><div><strong id={titleId}>Recovery calculation</strong></div></header>
        <p>Comparison with your personal baseline.</p>
        <dl>
          <div><dt>HRV vs baseline</dt><dd>{driverValue(hrv)}</dd><small>40%</small></div>
          <div><dt>Resting heart rate</dt><dd>{driverValue(restingHeartRate)}</dd><small>30%</small></div>
          <div><dt>Sleep score</dt><dd>{driverValue(sleep)}</dd><small>30%</small></div>
        </dl>
      </div>
    </div>
  </div>;
}
