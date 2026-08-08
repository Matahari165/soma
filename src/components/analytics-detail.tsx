import { Activity, BedDouble, CircleHelp, CircleSlash, Clock3, HeartPulse, Radio } from "lucide-react";

import type { ScoreKind } from "@/domain/health";
import type { DetailPoint } from "@/services/details";

function metricValue(kind: ScoreKind, field: "primary" | "secondary", value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  if (kind === "sleep" && field === "primary") return `${Math.floor(value / 60)}h ${Math.round(value % 60)}m`;
  if (kind === "sleep") return `${Math.round(value)}%`;
  if (kind === "recovery" && field === "primary") return `${Math.round(value)} ms`;
  if (kind === "recovery") return `${Math.round(value)} bpm`;
  if (field === "primary") return Math.round(value).toLocaleString("en-US");
  return `${Math.round(value)} min`;
}

export function AnalyticsDetail({
  kind,
  eyebrow,
  title,
  description,
  points,
  primaryLabel,
  secondaryLabel,
  explanation,
  recommendation,
}: {
  kind: ScoreKind;
  eyebrow: string;
  title: string;
  description: string;
  points: DetailPoint[];
  primaryLabel: string;
  secondaryLabel: string;
  explanation: string;
  recommendation: string;
}) {
  const latestPoint = points.at(-1);
  const previous = points.at(-2)?.score ?? null;
  const latest = latestPoint?.score ?? null;
  const delta = latest !== null && previous !== null ? latest - previous : null;
  const Icon = kind === "sleep" ? BedDouble : kind === "recovery" ? HeartPulse : Activity;
  const observedDate = latestPoint?.date
    ? new Date(`${latestPoint.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className={`analytics-page analytics-page--${kind}`} id="main-page-content">
      <header className="analytics-hero">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
          <span className="analytics-source"><Radio size={13} aria-hidden="true" />{observedDate ? `Last complete signal · ${observedDate}` : "No complete personal signal"}</span>
        </div>
        <div className={`analytics-score analytics-score--${kind}`}>
          <span className="analytics-score__label"><Icon size={17} aria-hidden="true" />Latest score</span>
          <strong>{latest ?? "—"}</strong>
          <small>{latest === null ? "Unavailable" : "/ 100"}</small>
          {delta !== null && <p>{delta > 0 ? "+" : ""}{delta} vs. previous complete day</p>}
        </div>
      </header>

      {latestPoint ? <section className="analytics-stats" aria-label={`${title} measured highlights`}>
        <article><span>{primaryLabel}</span><strong>{metricValue(kind, "primary", latestPoint.primary)}</strong><p>Measured input used by this signal.</p></article>
        <article><span>{secondaryLabel}</span><strong>{metricValue(kind, "secondary", latestPoint.secondary)}</strong><p>Latest available supporting input.</p></article>
        <article><span>Complete history</span><strong>{points.length} days</strong><p>Only complete scored days are shown.</p></article>
      </section> : <section className="analytics-panel analytics-unavailable" role="status"><CircleSlash size={24} aria-hidden="true" /><div><h2>Signal unavailable</h2><p>Connect Google Health and sync complete measurements. Soma does not treat missing data as a zero score.</p></div></section>}

      <section className="analytics-panel chart-frame">
        <div className="section-heading"><div><span className="eyebrow">Last {points.length} complete days</span><h2>Signal over time</h2></div><span className="quality-pill">Personal data</span></div>
        {points.length ? <>
          <ol className="bar-chart" aria-label={`${title} scores over time`}>{points.map((point) => {
            const day = new Date(`${point.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
            return <li className="bar-column" key={point.date} aria-label={`${day}: ${point.score === null ? "score unavailable" : `${point.score} out of 100`}`}><span className="bar-value" aria-hidden="true">{point.score ?? "—"}</span><span className="bar-track" aria-hidden="true"><span style={{ height: `${point.score ?? 0}%` }} /></span><small aria-hidden="true">{day.slice(0, 1)}</small></li>;
          })}</ol>
          <p className="chart-summary">{latest === null ? "The latest score is unavailable." : `Latest complete ${title.toLowerCase()} score: ${latest} out of 100${delta === null ? "." : `, ${Math.abs(delta)} points ${delta >= 0 ? "above" : "below"} the previous complete day.`}`}</p>
        </> : <p className="empty-state">No complete days yet. Connect Google Health and sync your data.</p>}
      </section>

      <div className="analytics-two-column">
        <section className="analytics-panel"><span className="eyebrow">Method</span><h2>How Soma reads this signal</h2><p className="explanation"><CircleHelp size={18} aria-hidden="true" />{explanation}</p></section>
        <section className="recommendation-card"><Clock3 size={21} aria-hidden="true" /><span className="eyebrow">General next step</span><h2>{recommendation}</h2><p>This is general wellness guidance, not medical advice or a confirmed personal action.</p></section>
      </div>
    </div>
  );
}
