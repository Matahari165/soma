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

export function HealthPageShell({ kind, title, description, score, freshness, timezone, heroScore, heroMetrics, children }: { kind: HealthPageKind; title: string; description: string; score: number | null; freshness: SignalFreshness; timezone: string; heroScore?: ReactNode; heroMetrics?: ReactNode; children: ReactNode }) {
  const scoreKind = kind === "activity" ? "effort" : kind;
  const scoreContent = heroScore ?? <ScoreRing kind={scoreKind} label="Score" score={score} animate />;
  return <div className={`health-detail-page health-detail-page--${kind}`} id="main-page-content"><header className={`health-detail-hero${heroMetrics ? " health-detail-hero--with-metrics" : ""}`}><div><h1>{title}</h1><span className="sr-only">{description}</span></div>{heroMetrics ? <div className="health-hero-metrics"><div className="health-hero-score">{scoreContent}</div>{heroMetrics}</div> : <div className="health-hero-score">{scoreContent}</div>}</header>{children}<div className="health-signal-meta health-signal-meta--footer" aria-label={`${title} data quality`}><strong data-state={freshness.state}>{stateLabel[freshness.state]}</strong><span>Measured {formatFreshnessMoment(freshness.measuredAt, timezone)}</span><span>Imported {formatFreshnessMoment(freshness.importedAt, timezone)}</span><span>{Math.round(freshness.coverage * 100)}% score coverage</span></div></div>;
}
