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
    hasData(sleepScores) ? <MetricTrendCard key="sleep" label="Sleep score" points={sleepScores} unit="/100" direction="higher_is_better" description="Duration, efficiency and timing regularity." /> : null,
    hasData(recoveryScores) ? <MetricTrendCard key="recovery" label="Recovery score" points={recoveryScores} unit="/100" direction="higher_is_better" description="HRV, resting heart rate and sleep support." /> : null,
    hasData(effortScores) ? <MetricTrendCard key="effort" label="Effort score" points={effortScores} unit="/100" direction="context_only" description="Completed load beside your recommended range." /> : null,
    hasData(hrvPoints) ? <MetricTrendCard key="hrv" label="HRV" points={hrvPoints} unit="ms" direction="higher_is_better" description="Daily RMSSD against your personal range." /> : null,
    hasData(restingHeartRatePoints) ? <MetricTrendCard key="rhr" label="Resting heart rate" points={restingHeartRatePoints} unit="bpm" direction="lower_is_better" description="Changes relative to your baseline." /> : null,
    hasData(stepPoints) ? <MetricTrendCard key="steps" label="Steps" points={stepPoints} direction="higher_is_better" description="Movement across measured days." format={(value) => Math.round(value).toLocaleString("en-US")} /> : null,
  ].filter((card) => card !== null);
  const hiddenMetrics = 6 - trendCards.length;

  return <div className="analytics-page" id="main-page-content">
    <header className="analytics-hero">
      <div><span className="eyebrow">Your timeline</span><h1>Trends</h1><p>Changes that matter, measured against your own history.</p></div>
      <div className="correlation-key" aria-label="How to read trends"><strong>Personal baseline</strong><span>Missing days stay missing</span></div>
    </header>

    <section className="metric-trend-grid trends-overview" aria-label="Personal trend overview">
      {trendCards}
      {hiddenMetrics > 0 && <article className="metric-trend-card metric-trend-card--locked"><strong>{hiddenMetrics}</strong><h2>more patterns will unlock</h2><p>Sleep and overnight measurements are still incomplete.</p></article>}
    </section>

    <div className="health-section-heading trends-heading"><div><span className="eyebrow">Relationships</span><h2>What moves together</h2></div></div>
    {correlations.length ? <section className="correlation-grid" aria-label="Your correlations">{correlations.map((item) => {
      const coefficient = item.coefficient === null ? null : Number(item.coefficient);
      return <article className="correlation-card" key={item.id}><div><span className="quality-pill">{String(item.quality_status).replaceAll("_", " ")}</span><span className="correlation-value" aria-label={relationshipLabel(coefficient)}>{coefficient === null ? "—" : `${coefficient > 0 ? "+" : ""}${coefficient.toFixed(2)}`}</span></div><span className="correlation-strength">{relationshipLabel(coefficient)}</span><h2>{String(item.variable_x).replaceAll("_", " ")} ↔ {String(item.variable_y).replaceAll("_", " ")}</h2><p>{item.explanation}</p><footer><span>{item.sample_size} paired days</span><span>Lag {item.lag_days} day{item.lag_days === 1 ? "" : "s"}</span></footer></article>;
    })}</section> : <section className="analytics-panel empty-state"><h2>No relationships yet</h2><p>Fourteen paired days unlock this view.</p></section>}
    <p className="medical-note">A relationship is a clue, not a cause.</p>
  </div>;
}
