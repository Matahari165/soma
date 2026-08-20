import type { Metadata } from "next";

import { TrendsOverview } from "@/components/health/trends-overview";
import { getCorrelations } from "@/services/details";
import { getTrendsAnalytics } from "@/services/health-analytics";

export const metadata: Metadata = { title: "Trends" };

function relationshipLabel(coefficient: number | null) {
  if (coefficient === null) return "Not enough data";
  const strength = Math.abs(coefficient);
  const level = strength >= 0.7 ? "Strong" : strength >= 0.4 ? "Moderate" : "Weak";
  return `${level} ${coefficient >= 0 ? "positive" : "negative"} relationship`;
}

export default async function TrendsPage() {
  const [correlations, analytics] = await Promise.all([getCorrelations(), getTrendsAnalytics()]);

  return <div className="analytics-page" id="main-page-content">
    <header className="analytics-hero"><div><h1>Trends</h1></div></header>

    <TrendsOverview days={analytics.days} scores={analytics.scores} />

    <div className="health-section-heading trends-heading"><h2>Signals in context</h2></div>
    {correlations.length ? <section className="correlation-grid" aria-label="Your correlations">{correlations.map((item) => {
      const coefficient = item.coefficient === null ? null : Number(item.coefficient);
      return <article className="correlation-card" key={item.id}><header><span className="quality-pill">{String(item.quality_status).replaceAll("_", " ")}</span><span className="correlation-value" aria-label={relationshipLabel(coefficient)}>{coefficient === null ? "—" : `${coefficient > 0 ? "+" : ""}${coefficient.toFixed(2)}`}</span></header><span className="correlation-strength">{relationshipLabel(coefficient)}</span><h3>{String(item.variable_x).replaceAll("_", " ")} ↔ {String(item.variable_y).replaceAll("_", " ")}</h3><p>{item.explanation}</p><footer><span>{item.sample_size} paired days</span><span>{item.lag_days === 0 ? "Same day" : `${item.lag_days}-day lag`}</span></footer></article>;
    })}</section> : <section className="analytics-panel empty-state"><h2>No relationships yet</h2><p>Fourteen paired days unlock this view.</p></section>}
    <p className="medical-note">A relationship is a clue, not a cause.</p>
  </div>;
}
