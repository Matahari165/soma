import type { Metadata } from "next";

import { getCorrelations } from "@/services/details";

export const metadata: Metadata = { title: "Trends" };

export default async function TrendsPage() {
  const correlations = await getCorrelations();
  return <div className="analytics-page" id="main-page-content"><header className="analytics-hero"><div><span className="eyebrow">Patterns over time</span><h1>Trends</h1><p>Explore relationships with the method, lag, sample size, and limits kept visible.</p></div></header><section className="correlation-grid">{correlations.map((item) => <article className="correlation-card" key={item.id}><div><span className="quality-pill">{item.quality_status}</span><span className="correlation-value">{item.coefficient === null ? "—" : `${Number(item.coefficient) > 0 ? "+" : ""}${Number(item.coefficient).toFixed(2)}`}</span></div><h2>{String(item.variable_x).replaceAll("_", " ")} ↔ {String(item.variable_y).replaceAll("_", " ")}</h2><p>{item.explanation}</p><footer><span>Spearman</span><span>{item.sample_size} paired days</span><span>Lag {item.lag_days} day{item.lag_days === 1 ? "" : "s"}</span></footer></article>)}</section><p className="medical-note">Correlation does not prove causation. Use these patterns as questions to explore, not diagnoses.</p></div>;
}
