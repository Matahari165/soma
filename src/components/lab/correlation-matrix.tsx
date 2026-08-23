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

function formatProbability(value: number) {
  return value < 0.001 ? "< .001" : value.toFixed(3).replace(/^0/, "");
}

function evidenceLabel(relation: MatrixRelation) {
  if (relation.coefficient === null) return "Not enough data";
  if (relation.strength === "hidden" && relation.evidence !== "early") return "Small effect";
  return relation.evidence === "early" ? "Early estimate" : "Clearer estimate";
}

function weeklyEffectSentence(relation: MatrixRelation, predictor: string, outcome: string) {
  if (relation.effect === null) return `${predictor} does not have enough paired weeks yet.`;
  const magnitude = formatEffect({ ...relation, effect: Math.abs(relation.effect) }).replace(/^\+/, "");
  if (relation.effect === 0) return `In weeks with higher ${predictor.toLowerCase()}, ${outcome.toLowerCase()} is unchanged.`;
  return `In weeks with higher ${predictor.toLowerCase()}, ${outcome.toLowerCase()} is ${magnitude} ${relation.effect > 0 ? "higher" : "lower"}.`;
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
  steps: "Steps",
  zone_minutes: "Zone minutes",
  intense_minutes: "Intense-zone minutes",
  active_minutes: "Active minutes",
  exercise_minutes: "Exercise minutes",
  sleep_duration_driver: "Sleep duration",
  sleep_debt: "Sleep debt",
  calendar_deep_work: "Deep work",
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
  if (relation.grain === "week") return weeklyEffectSentence(relation, predictor, outcome);
  const timing = relation.lagDays === 0 ? "that day" : relation.lagDays === 1 ? "the next day" : `${relation.lagDays} days later`;
  return `${predictor} is linked to ${formatEffect(relation)} in ${outcome} ${timing}.`;
}

function RelationCell({ relation, cellKey, expanded, grain, onToggle }: {
  relation: MatrixRelation;
  cellKey: string;
  expanded: boolean;
  grain: "day" | "week";
  onToggle: (key: string) => void;
}) {
  if (relation.excluded) {
    return <td className="matrix-cell matrix-cell--excluded"><strong>—</strong></td>;
  }
  const direction = relation.coefficient === null ? "" : relation.coefficient < 0 ? "matrix-cell--inverse" : "matrix-cell--direct";
  const evidenceClass = relation.coefficient === null || relation.evidence === "early" || relation.strength === "hidden" ? "matrix-cell--early" : "matrix-cell--ready";
  return <td className={`matrix-cell matrix-cell--${relation.coefficient === null ? "hidden" : relation.strength} ${direction} ${evidenceClass}`}>
    <button type="button" className="matrix-cell__trigger" aria-expanded={expanded} aria-label={`${relation.predictorLabel} to ${relation.outcomeLabel}: ${formatEffect(relation)}. ${evidenceLabel(relation)}. ${expanded ? "Hide" : "Show"} statistical details.`} onClick={() => onToggle(cellKey)}>
      <strong>{formatEffect(relation)}</strong>
    </button>
    {expanded && <div className="matrix-cell__detail">
      <span>{evidenceLabel(relation)}</span>
      <small>ρ {relation.coefficient === null ? "—" : signed(relation.coefficient, 2)} · p {formatProbability(relation.pValue)}</small>
      <small>{relation.sampleSize} {grain === "week" ? "weeks" : "days"} · effective {relation.effectiveSampleSize}</small>
    </div>}
  </td>;
}

export function CorrelationMatrix({ matrix }: { matrix: PersonalLabSnapshot["matrix"] }) {
  const [grain, setGrain] = useState<"day" | "week">("week");
  const [openRelation, setOpenRelation] = useState<string | null>(null);
  const rows = useMemo(() => matrix.rows.filter((row) => row.grain === grain), [grain, matrix.rows]);
  const top = useMemo(() => rows.flatMap((row) => row.relations)
    .filter((relation) => !relation.excluded && relation.coefficient !== null && relation.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || b.effectiveSampleSize - a.effectiveSampleSize)
    .slice(0, 6), [rows]);

  return <section id="relations" className="matrix-section" aria-labelledby="matrix-title">
    <header className="matrix-header">
      <h2 id="matrix-title">Relationships</h2>
      <div className="matrix-grain" role="group" aria-label="Analysis period">
        <button type="button" aria-pressed={grain === "day"} onClick={() => { setGrain("day"); setOpenRelation(null); }}>Days</button>
        <button type="button" aria-pressed={grain === "week"} onClick={() => { setGrain("week"); setOpenRelation(null); }}>Weeks</button>
      </div>
    </header>
    <div className="matrix-scroll" role="region" aria-label={`Relationships by ${grain === "day" ? "day" : "week"}`} tabIndex={0}>
      <table>
        <thead><tr><th scope="col">Variable</th>{matrix.outcomes.map((outcome) => <th scope="col" key={outcome.id}><span>{metricLabel(outcome.id, outcome.label)}</span><small>{outcome.unit}</small></th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><th scope="row"><strong>{metricLabel(row.id, row.label)}</strong><small>{row.lagLabel === "lendemain" ? "next day" : row.lagLabel === "même jour" ? "same day" : row.lagLabel === "même semaine" ? "same week" : row.lagLabel}</small></th>{row.relations.map((relation) => {
          const cellKey = `${grain}:${relation.predictorId}:${relation.outcomeId}`;
          return <RelationCell relation={relation} cellKey={cellKey} expanded={openRelation === cellKey} grain={grain} onToggle={(key) => setOpenRelation((current) => current === key ? null : key)} key={relation.outcomeId} />;
        })}</tr>)}</tbody>
      </table>
    </div>
    <div className="matrix-mobile-list" aria-label="Top relationships">
      {top.length ? top.map((relation) => {
        const cellKey = `mobile:${grain}:${relation.predictorId}:${relation.outcomeId}`;
        return <article key={`${relation.predictorId}-${relation.outcomeId}`}>
          <button type="button" className="matrix-mobile-list__trigger" aria-expanded={openRelation === cellKey} onClick={() => setOpenRelation((current) => current === cellKey ? null : cellKey)}><strong>{metricLabel(relation.predictorId, relation.predictorLabel)} → {metricLabel(relation.outcomeId, relation.outcomeLabel)}</strong><span>{formatEffect(relation)}</span></button>
          {openRelation === cellKey && <small>{evidenceLabel(relation)} · ρ {signed(relation.coefficient ?? 0, 2)} · p {formatProbability(relation.pValue)} · {relation.sampleSize} {grain === "week" ? "weeks" : "days"}</small>}
        </article>;
      }) : <p>Not enough paired data yet.</p>}
    </div>
    <details className="matrix-method">
      <summary>How to read</summary>
      <p>Weekly view first averages the raw daily values, then compares complete weeks. Gray values are early estimates or effects too small to surface; colored values are clearer and useful enough to compare; — means there is not enough paired data. Click a value for ρ, p and the paired sample. Missing journal days are left out.</p>
    </details>
  </section>;
}

export function LeadMatrixFinding({ relation, narrative = null }: { relation: MatrixRelation; narrative?: PersonalLabSnapshot["aiNarrative"] }) {
  const headline = narrative?.headline && !isTechnicalOrNonEnglish(narrative.headline)
    ? narrative.headline
    : `${metricLabel(relation.predictorId, relation.predictorLabel)} and ${metricLabel(relation.outcomeId, relation.outcomeLabel)}`;
  const highlights = narrative?.highlights?.filter((highlight) => !isTechnicalOrNonEnglish(highlight)).slice(0, 4) ?? [];
  const displayedHighlights = highlights.length ? highlights : [fallbackFinding(relation)];
  return <section className={`lab-featured lab-featured--matrix ${displayedHighlights.length === 1 ? "lab-featured--brief" : ""}`}>
    <h2>{headline}</h2>
    <ul className="lab-featured__effects">{displayedHighlights.map((highlight, index) => <li key={`${highlight}-${index}`}>{highlight}</li>)}</ul>
  </section>;
}
