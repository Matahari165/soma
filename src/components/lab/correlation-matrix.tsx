"use client";

import { useMemo, useState } from "react";

import type { MatrixRelation } from "@/domain/lab/matrix";
import type { PersonalLabSnapshot } from "@/services/personal-lab";

function signed(value: number, digits = 1) {
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(digits)}`;
}

function formatEffect(relation: MatrixRelation) {
  if (relation.effect === null) return "—";
  const digits = ["bpm", "ms", "min"].includes(relation.outcomeUnit) && Math.abs(relation.effect) >= 1 ? 0 : 1;
  return `${signed(relation.effect, digits)}${relation.outcomeUnit ? ` ${relation.outcomeUnit}` : ""}`;
}

const englishMetricLabels: Record<string, string> = {
  bedtime: "Bedtime",
  sleep_minutes: "Total sleep",
  sleep_efficiency: "Sleep efficiency",
  deep_sleep: "Deep sleep",
  rem_sleep: "REM sleep",
  hrv: "HRV",
  rhr: "Resting heart rate",
  respiratory: "Respiratory rate",
  spo2: "Oxygen saturation",
  temperature: "Skin temperature",
  steps: "Steps",
  zone_minutes: "Zone minutes",
  vigorous_minutes: "Vigorous-zone minutes",
  active_minutes: "Active minutes",
  exercise_minutes: "Exercise minutes",
  sleep_duration_driver: "Sleep duration",
  sleep_debt: "Sleep debt",
  calendar_deep_work: "Deep work",
  runs_week: "Runs per week",
  vigorous_week: "Vigorous-zone minutes per week",
  active_week: "Active minutes per week",
  exercise_week: "Exercise minutes per week",
  zone_week: "Zone minutes per week",
};

function metricLabel(id: string, label: string) {
  return englishMetricLabels[id] ?? label;
}

function isTechnicalOrNonEnglish(value: string) {
  return /(?:qvalue|relevance|interval|confidence|observation|sample|method|spearman|rank|classement|pertinence|intervalle|observation|semaine[s]? compar[ée]e[s]?)/i.test(value)
    || /[àâäçéèêëîïôöùûüÿœ]/i.test(value);
}

function fallbackFinding(relation: MatrixRelation) {
  const predictor = metricLabel(relation.predictorId, relation.predictorLabel);
  const outcome = metricLabel(relation.outcomeId, relation.outcomeLabel);
  const timing = relation.lagDays === 0 ? "that day" : relation.lagDays === 1 ? "the next day" : `${relation.lagDays} days later`;
  return `${predictor} is linked to ${formatEffect(relation)} in ${outcome} ${timing}.`;
}

function RelationCell({ relation }: { relation: MatrixRelation }) {
  if (relation.excluded) {
    return <td className="matrix-cell matrix-cell--excluded" title="Overlapping measures."><strong>—</strong></td>;
  }
  if (relation.coefficient === null) {
    return <td className="matrix-cell matrix-cell--hidden" title={`${relation.sampleSize} paired observations`}><strong>—</strong><small>n={relation.sampleSize}</small></td>;
  }
  const title = `${relation.method === "spearman" ? "Spearman" : "Rank-biserial"} ${signed(relation.coefficient, 2)} · effect ${formatEffect(relation)} · 95% interval [${signed(relation.confidenceLow, 2)}, ${signed(relation.confidenceHigh, 2)}] · n=${relation.sampleSize}, effective n=${relation.effectiveSampleSize} · q=${relation.qValue.toFixed(3)}`;
  return <td className={`matrix-cell matrix-cell--${relation.strength} ${relation.coefficient < 0 ? "matrix-cell--inverse" : "matrix-cell--direct"}`} title={title}>
    <strong>{formatEffect(relation)}</strong>
    <span>ρ {signed(relation.coefficient, 2)}</span>
    <small>n={relation.sampleSize}</small>
  </td>;
}

export function CorrelationMatrix({ matrix }: { matrix: PersonalLabSnapshot["matrix"] }) {
  const [grain, setGrain] = useState<"day" | "week">("day");
  const rows = useMemo(() => matrix.rows.filter((row) => row.grain === grain), [grain, matrix.rows]);
  const top = useMemo(() => rows.flatMap((row) => row.relations)
    .filter((relation) => !relation.excluded && relation.coefficient !== null && relation.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || b.effectiveSampleSize - a.effectiveSampleSize)
    .slice(0, 6), [rows]);

  return <section id="relations" className="matrix-section" aria-labelledby="matrix-title">
    <header className="matrix-header">
      <h2 id="matrix-title">Relationships</h2>
      <div className="matrix-grain" role="group" aria-label="Analysis period">
        <button type="button" aria-pressed={grain === "day"} onClick={() => setGrain("day")}>Days</button>
        <button type="button" aria-pressed={grain === "week"} onClick={() => setGrain("week")}>Weeks</button>
      </div>
    </header>
    <div className="matrix-scroll" role="region" aria-label={`Relationships by ${grain === "day" ? "day" : "week"}`} tabIndex={0}>
      <table>
        <thead><tr><th scope="col">Variable</th>{matrix.outcomes.map((outcome) => <th scope="col" key={outcome.id}><span>{metricLabel(outcome.id, outcome.label)}</span><small>{outcome.unit}</small></th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><th scope="row"><strong>{metricLabel(row.id, row.label)}</strong><small>{row.lagLabel === "lendemain" ? "next day" : row.lagLabel === "même jour" ? "same day" : row.lagLabel === "même semaine" ? "same week" : row.lagLabel}</small></th>{row.relations.map((relation) => <RelationCell relation={relation} key={relation.outcomeId} />)}</tr>)}</tbody>
      </table>
    </div>
    <div className="matrix-mobile-list" aria-label="Top relationships">
      {top.length ? top.map((relation) => <article key={`${relation.predictorId}-${relation.outcomeId}`}>
        <div><strong>{metricLabel(relation.predictorId, relation.predictorLabel)} → {metricLabel(relation.outcomeId, relation.outcomeLabel)}</strong><p>{formatEffect(relation)}</p><small>ρ {signed(relation.coefficient ?? 0, 2)} · n={relation.sampleSize}</small></div>
      </article>) : <p>Not enough paired data yet.</p>}
    </div>
    <details className="matrix-method">
      <summary>How to read</summary>
      <p>Cells show direction and effect size. Empty cells mean the pair is not ready to use. Missing journal days are left out.</p>
    </details>
  </section>;
}

export function LeadMatrixFinding({ relation, narrative = null }: { relation: MatrixRelation; narrative?: PersonalLabSnapshot["aiNarrative"] }) {
  const headline = narrative?.headline && !isTechnicalOrNonEnglish(narrative.headline)
    ? narrative.headline
    : `${metricLabel(relation.predictorId, relation.predictorLabel)} and ${metricLabel(relation.outcomeId, relation.outcomeLabel)}`;
  const highlights = narrative?.highlights?.filter((highlight) => !isTechnicalOrNonEnglish(highlight)).slice(0, 4) ?? [];
  return <section className="lab-featured lab-featured--matrix">
    <h2>{headline}</h2>
    <ul className="lab-featured__effects">{(highlights.length ? highlights : [fallbackFinding(relation)]).map((highlight, index) => <li key={`${highlight}-${index}`}>{highlight}</li>)}</ul>
  </section>;
}
