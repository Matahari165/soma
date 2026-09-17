import type { ReactNode } from "react";

import { ScoreRing } from "@/components/dashboard/score-ring";
import type { SignalFreshness } from "@/domain/health";

import observatoryStyles from "./health-observatory.module.css";

type HealthPageKind = "sleep" | "recovery" | "activity";

const stateLabel: Record<SignalFreshness["state"], string> = {
  current: "Current",
  partial: "Partial",
  stale: "Stale",
  missing: "Unavailable",
};

export function HealthHeroScore({
  label,
  value,
  unit = "%",
  average,
  values,
  tone = "neutral",
  action,
  showBars = true,
}: {
  label: string;
  value: number | null;
  unit?: string;
  average: number | null;
  values: Array<number | null>;
  tone?: "positive" | "negative" | "neutral";
  action?: ReactNode;
  showBars?: boolean;
}) {
  const measured = values.filter((item): item is number => item !== null && Number.isFinite(item));
  const min = measured.length ? Math.min(...measured) : 0;
  const max = measured.length ? Math.max(...measured) : 1;
  const formattedValue = value === null || !Number.isFinite(value) ? "—" : Math.round(value);
  const formattedAverage = average === null || !Number.isFinite(average) ? "—" : Math.round(average);

  return (
    <div
      className={`health-hero-score-card health-hero-score-card--${tone}`}
      role="group"
      aria-label={`${label}: ${formattedValue}${unit ? ` ${unit}` : ""}. 30-day average: ${formattedAverage}${unit ? ` ${unit}` : ""}.`}
    >
      <div className="health-hero-score-card__header">
        <span>{label}</span>
        {action && <div className="health-hero-score-card__action">{action}</div>}
      </div>
      <div className="health-hero-score-card__body">
        <div className="health-hero-score-card__metric">
          <div className="health-hero-score-card__number">
            <strong>{formattedValue}</strong>
            {unit && <small>{unit}</small>}
          </div>
          <p>30-day avg · {formattedAverage}{unit ? ` ${unit}` : ""}</p>
        </div>
        {showBars && <div className="health-hero-score-card__bars" aria-hidden="true">
          {values.map((item, index) => {
            const normalized = typeof item === "number" && Number.isFinite(item) ? item : null;
            const height = normalized === null
              ? 20
              : max === min
                ? 58
                : 28 + ((normalized - min) / Math.max(max - min, 1)) * 52;
            return (
              <i
                key={index}
                className={normalized === null ? "is-empty" : ""}
                style={{ height: `${height}%` }}
              />
            );
          })}
        </div>}
      </div>
    </div>
  );
}

function localizedFreshnessMoment(value: string | null, timezone: string) {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(date).replace(/\s+/g, " ");
}

export function HealthPageShell({ kind, title, description, score, freshness, timezone, heroScore, heroMetrics, showHeroScore = true, showFreshness = true, children }: { kind: HealthPageKind; title: string; description: string; score: number | null; freshness: SignalFreshness; timezone: string; heroScore?: ReactNode; heroMetrics?: ReactNode; showHeroScore?: boolean; showFreshness?: boolean; children: ReactNode }) {
  const scoreKind = kind === "activity" ? "effort" : kind;
  const scoreContent = heroScore ?? <ScoreRing kind={scoreKind} label="Score" score={score} animate />;
  const coverage = Number.isFinite(freshness.coverage) ? Math.min(1, Math.max(0, freshness.coverage)) : 0;
  return <div className={`${observatoryStyles.observatory} health-observatory-route health-detail-page health-detail-page--${kind}`} id="main-page-content"><header className={`health-detail-hero${heroMetrics ? " health-detail-hero--with-metrics" : ""}`}><div><h1>{title}</h1><span className="sr-only">{description}</span></div>{showHeroScore && (heroMetrics ? <div className="health-hero-metrics"><div className="health-hero-score">{scoreContent}</div>{heroMetrics}</div> : <div className="health-hero-score">{scoreContent}</div>)}</header>{children}{showFreshness && <div className="health-signal-meta health-signal-meta--footer" aria-label={`${title} data provenance`}><h2>Provenance</h2><strong data-state={freshness.state}>{stateLabel[freshness.state]}</strong><span>Measured&nbsp;{localizedFreshnessMoment(freshness.measuredAt, timezone)}</span><span>Imported&nbsp;{localizedFreshnessMoment(freshness.importedAt, timezone)}</span><span>{Math.round(coverage * 100)}% score coverage</span></div>}</div>;
}
