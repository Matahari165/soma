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
  const hasData = (points: Array<{ value: number | null }>) => points.some((point) => point.value !== null);

  const sleepScores = scorePoints("sleep");
  const recoveryScores = scorePoints("recovery");
  const effortScores = scorePoints("effort");
  const hrvPoints = metricPoints("hrv_ms");
  const restingHeartRatePoints = metricPoints("resting_heart_rate");
  const stepPoints = metricPoints("steps");

  const trendCards = [
    hasData(sleepScores) ? <MetricTrendCard key="sleep" label="Sleep score" points={sleepScores} unit="/100" direction="higher_is_better" href="/sleep" /> : null,
    hasData(recoveryScores) ? <MetricTrendCard key="recovery" label="Recovery score" points={recoveryScores} unit="/100" direction="higher_is_better" href="/recovery" /> : null,
    hasData(effortScores) ? <MetricTrendCard key="effort" label="Effort score" points={effortScores} unit="/100" direction="context_only" href="/activity" /> : null,
    hasData(hrvPoints) ? <MetricTrendCard key="hrv" label="HRV" points={hrvPoints} unit="ms" direction="higher_is_better" href="/recovery" /> : null,
    hasData(restingHeartRatePoints) ? <MetricTrendCard key="rhr" label="Resting heart rate" points={restingHeartRatePoints} unit="bpm" direction="lower_is_better" href="/recovery" /> : null,
    hasData(stepPoints) ? <MetricTrendCard key="steps" label="Steps" points={stepPoints} direction="higher_is_better" format={(value) => Math.round(value).toLocaleString("en-US")} href="/activity" /> : null,
  ].filter((card) => card !== null);
  const hiddenMetrics = 6 - trendCards.length;

  return <div className="analytics-page" id="main-page-content">
    <header className="analytics-hero"><div><h1>Trends</h1></div></header>

    <section className="metric-trend-grid trends-overview" aria-label="Personal trend overview">
      {trendCards}
      {hiddenMetrics > 0 && <article className="metric-trend-card metric-trend-card--locked"><strong>{hiddenMetrics}</strong><h2>signals pending</h2><p>More complete nights will reveal them.</p></article>}
    </section>

    <div className="health-section-heading trends-heading"><h2>Signals in context</h2></div>
    {correlations.length ? <section className="correlation-grid" aria-label="Your correlations">{correlations.map((item) => {
      const coefficient = item.coefficient === null ? null : Number(item.coefficient);
      return <article className="correlation-card" key={item.id}><header><span className="quality-pill">{String(item.quality_status).replaceAll("_", " ")}</span><span className="correlation-value" aria-label={relationshipLabel(coefficient)}>{coefficient === null ? "—" : `${coefficient > 0 ? "+" : ""}${coefficient.toFixed(2)}`}</span></header><span className="correlation-strength">{relationshipLabel(coefficient)}</span><h3>{String(item.variable_x).replaceAll("_", " ")} ↔ {String(item.variable_y).replaceAll("_", " ")}</h3><p>{item.explanation}</p><footer><span>{item.sample_size} paired days</span><span>{item.lag_days === 0 ? "Same day" : `${item.lag_days}-day lag`}</span></footer></article>;
    })}</section> : <section className="analytics-panel empty-state"><h2>No relationships yet</h2><p>Fourteen paired days unlock this view.</p></section>}
    <p className="medical-note">A relationship is a clue, not a cause.</p>
  </div>;
}
