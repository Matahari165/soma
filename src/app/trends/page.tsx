import type { Metadata } from "next";

import { MetricTrendCard } from "@/components/health/metric-trend-card";
import { getCorrelations } from "@/services/details";
import { getHealthAnalytics, type HealthMetricDay } from "@/services/health-analytics";

export const metadata: Metadata = { title: "Trends" };

function relationshipLabel(coefficient: number | null) {
  if (coefficient === null) return "Not enough data";
  const strength = Math.abs(coefficient);
  const level = strength >= 0.7 ? "Strong" : strength >= 0.4 ? "Moderate" : "Weak";
  return `${level} ${coefficient >= 0 ? "positive" : "negative"} relationship`;
}

export default async function TrendsPage() {
  const [correlations, analytics] = await Promise.all([getCorrelations(), getHealthAnalytics()]);
  const metricPoints = (key: keyof HealthMetricDay) => analytics.days.map((day) => ({ date: day.metric_date, value: typeof day[key] === "number" ? day[key] as number : null }));
  const scorePoints = (kind: "sleep" | "recovery" | "effort") => analytics.scores.filter((score) => score.kind === kind).map((score) => ({ date: score.score_date, value: score.score }));
  return <div className="analytics-page" id="main-page-content"><header className="analytics-hero"><div><span className="eyebrow">Patterns over time</span><h1>Trends</h1><p>See what changed against your previous 7, 30 and 90 complete days before exploring relationships.</p></div><div className="correlation-key" aria-label="How to read trends"><strong>Personal context</strong><span>Values use your own history</span><span>Missing days are never zero</span></div></header>
    <section className="metric-trend-grid trends-overview" aria-label="Personal trend overview">
      <MetricTrendCard label="Sleep score" points={scorePoints("sleep")} unit="/100" direction="higher_is_better" description="Duration, efficiency and timing regularity." />
      <MetricTrendCard label="Recovery score" points={scorePoints("recovery")} unit="/100" direction="higher_is_better" description="HRV, resting heart rate and sleep support." />
      <MetricTrendCard label="Effort score" points={scorePoints("effort")} unit="/100" direction="context_only" description="Completed load is interpreted beside recovery and your target." />
      <MetricTrendCard label="HRV" points={metricPoints("hrv_ms")} unit="ms" direction="higher_is_better" description="Daily RMSSD against your personal range." />
      <MetricTrendCard label="Resting heart rate" points={metricPoints("resting_heart_rate")} unit="bpm" direction="lower_is_better" description="Changes are interpreted relative to your baseline." />
      <MetricTrendCard label="Steps" points={metricPoints("steps")} direction="higher_is_better" description="Measured movement across complete activity days." format={(value) => Math.round(value).toLocaleString("en-US")} />
    </section>
    <div className="health-section-heading trends-heading"><div><span className="eyebrow">Associations</span><h2>What moves together</h2></div></div>
    {correlations.length ? <section className="correlation-grid" aria-label="Your correlations">{correlations.map((item) => { const coefficient = item.coefficient === null ? null : Number(item.coefficient); return <article className="correlation-card" key={item.id}><div><span className="quality-pill">{String(item.quality_status).replaceAll("_", " ")}</span><span className="correlation-value" aria-label={relationshipLabel(coefficient)}>{coefficient === null ? "—" : `${coefficient > 0 ? "+" : ""}${coefficient.toFixed(2)}`}</span></div><span className="correlation-strength">{relationshipLabel(coefficient)}</span><h2>{String(item.variable_x).replaceAll("_", " ")} ↔ {String(item.variable_y).replaceAll("_", " ")}</h2><p>{item.explanation}</p><footer><span>Spearman</span><span>{item.sample_size} paired days</span><span>Lag {item.lag_days} day{item.lag_days === 1 ? "" : "s"}</span></footer></article>; })}</section> : <section className="analytics-panel empty-state"><h2>No reliable patterns yet</h2><p>Keep syncing daily. Soma will show relationships after enough paired days are available.</p></section>}<p className="medical-note">Correlation does not prove causation. Use these patterns as questions to explore, not diagnoses.</p></div>;
}
