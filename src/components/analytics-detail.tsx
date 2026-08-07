import { ArrowDownRight, ArrowUpRight, CircleHelp, Clock3 } from "lucide-react";

import type { DetailPoint } from "@/services/details";

type Stat = { label: string; value: string; note: string };

export function AnalyticsDetail({ eyebrow, title, description, points, stats, primaryLabel, secondaryLabel, explanation, recommendation }: { eyebrow: string; title: string; description: string; points: DetailPoint[]; stats: Stat[]; primaryLabel: string; secondaryLabel: string; explanation: string; recommendation: string }) {
  const latest = points.at(-1)?.score ?? null;
  const previous = points.at(-2)?.score ?? null;
  const delta = latest !== null && previous !== null ? latest - previous : null;
  return (
    <div className="analytics-page" id="main-page-content">
      <header className="analytics-hero">
        <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
        <div className="analytics-score"><span>Latest score</span><strong>{latest ?? "—"}<small>/100</small></strong>{delta !== null && <p className={delta >= 0 ? "is-up" : "is-down"}>{delta >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}{Math.abs(delta)} vs. previous day</p>}</div>
      </header>
      <section className="analytics-stats" aria-label={`${title} highlights`}>{stats.map((stat) => <article key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong><p>{stat.note}</p></article>)}</section>
      <section className="analytics-panel">
        <div className="section-heading"><div><span className="eyebrow">Last {points.length} days</span><h2>Score trend</h2></div><span className="quality-pill">Personal data</span></div>
        {points.length ? <div className="bar-chart" role="img" aria-label={`${title} scores over time`}>{points.map((point) => <div className="bar-column" key={point.date}><span className="bar-value">{point.score ?? "—"}</span><span className="bar-track"><span style={{ height: `${point.score ?? 0}%` }} /></span><small>{new Date(`${point.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "narrow" })}</small></div>)}</div> : <p className="empty-state">No complete days yet. Connect Google Health and sync your data.</p>}
      </section>
      <div className="analytics-two-column">
        <section className="analytics-panel"><span className="eyebrow">Inputs</span><h2>What this score uses</h2><div className="driver-list"><p><span>{primaryLabel}</span><strong>{points.at(-1)?.primary ?? "—"}</strong></p><p><span>{secondaryLabel}</span><strong>{points.at(-1)?.secondary ?? "—"}</strong></p></div><p className="explanation"><CircleHelp size={17} />{explanation}</p></section>
        <section className="recommendation-card"><Clock3 size={21} /><span className="eyebrow">Recommended next step</span><h2>{recommendation}</h2><p>Recommendations are general wellness guidance, not medical advice.</p></section>
      </div>
    </div>
  );
}
