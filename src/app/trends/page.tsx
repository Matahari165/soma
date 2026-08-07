import type { Metadata } from "next";

import { getCorrelations } from "@/services/details";

export const metadata: Metadata = { title: "Trends" };

function relationshipLabel(coefficient: number | null) {
  if (coefficient === null) return "Not enough data";
  const strength = Math.abs(coefficient);
  const level = strength >= 0.7 ? "Strong" : strength >= 0.4 ? "Moderate" : "Weak";
  return `${level} ${coefficient >= 0 ? "positive" : "negative"} relationship`;
}

export default async function TrendsPage() {
  const correlations = await getCorrelations();
  return <div className="analytics-page" id="main-page-content"><header className="analytics-hero"><div><span className="eyebrow">Patterns over time</span><h1>Trends</h1><p>See which habits move with your health scores. Strength, delay, sample size, and data quality stay visible.</p></div><div className="correlation-key" aria-label="How to read correlations"><strong>How to read this</strong><span>Positive: values rise together</span><span>Negative: one rises as the other falls</span></div></header>{correlations.length ? <section className="correlation-grid" aria-label="Your correlations">{correlations.map((item) => { const coefficient = item.coefficient === null ? null : Number(item.coefficient); return <article className="correlation-card" key={item.id}><div><span className="quality-pill">{String(item.quality_status).replaceAll("_", " ")}</span><span className="correlation-value" aria-label={relationshipLabel(coefficient)}>{coefficient === null ? "—" : `${coefficient > 0 ? "+" : ""}${coefficient.toFixed(2)}`}</span></div><span className="correlation-strength">{relationshipLabel(coefficient)}</span><h2>{String(item.variable_x).replaceAll("_", " ")} ↔ {String(item.variable_y).replaceAll("_", " ")}</h2><p>{item.explanation}</p><footer><span>Spearman</span><span>{item.sample_size} paired days</span><span>Lag {item.lag_days} day{item.lag_days === 1 ? "" : "s"}</span></footer></article>; })}</section> : <section className="analytics-panel empty-state"><h2>No reliable patterns yet</h2><p>Keep syncing daily. Soma will show relationships after enough paired days are available.</p></section>}<p className="medical-note">Correlation does not prove causation. Use these patterns as questions to explore, not diagnoses.</p></div>;
}
