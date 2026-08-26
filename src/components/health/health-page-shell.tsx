import type { ReactNode } from "react";

import { ScoreRing } from "@/components/dashboard/score-ring";
import type { SignalFreshness } from "@/domain/health";
import { formatFreshnessMoment } from "@/domain/health/freshness";

type HealthPageKind = "sleep" | "recovery" | "activity";

const stateLabel: Record<SignalFreshness["state"], string> = {
  current: "Current",
  partial: "Partial",
  stale: "Out of date",
  missing: "Unavailable",
};

export function HealthPageShell({ kind, title, description, score, freshness, timezone, children }: { kind: HealthPageKind; title: string; description: string; score: number | null; freshness: SignalFreshness; timezone: string; children: ReactNode }) {
  const scoreKind = kind === "activity" ? "effort" : kind;
  return <div className={`health-detail-page health-detail-page--${kind}`} id="main-page-content"><header className="health-detail-hero"><div><h1>{title}</h1><span className="sr-only">{description}</span></div><div className="health-hero-score"><ScoreRing kind={scoreKind} label="Score" score={score} animate /></div></header><div className="health-signal-meta" aria-label={`${title} data quality`}><strong data-state={freshness.state}>{stateLabel[freshness.state]}</strong><span>Measured {formatFreshnessMoment(freshness.measuredAt, timezone)}</span><span>Imported {formatFreshnessMoment(freshness.importedAt, timezone)}</span><span>{Math.round(freshness.coverage * 100)}% score coverage</span></div>{children}</div>;
}
