"use client";

import { useMemo, useState } from "react";

import type { MatrixRelation } from "@/domain/lab/matrix";
import type { PersonalLabSnapshot } from "@/services/personal-lab";

function signed(value: number, digits = 1) {
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(digits)}`;
}

function effectDigits(relation: MatrixRelation) {
  return ["bpm", "ms", "min"].includes(relation.outcomeUnit) && Math.abs(relation.effect ?? 0) >= 1 ? 0 : 1;
}

function formatEffect(relation: MatrixRelation) {
  if (relation.effect === null) return "—";
  return `${signed(relation.effect, effectDigits(relation))}${relation.outcomeUnit ? ` ${relation.outcomeUnit}` : ""}`;
}

function formatInterval(relation: MatrixRelation) {
  if (relation.effectConfidenceLow === null || relation.effectConfidenceHigh === null) return "—";
  const digits = effectDigits(relation);
  return `${signed(relation.effectConfidenceLow, digits)} to ${signed(relation.effectConfidenceHigh, digits)}${relation.outcomeUnit ? ` ${relation.outcomeUnit}` : ""}`;
}

function formatProbability(value: number) {
  return value < 0.001 ? "< .001" : value.toFixed(3).replace(/^0/, "");
}

function evidenceLabel(relation: MatrixRelation) {
  return ({
    insufficient: "Not enough data",
    exploratory: "Exploratory",
    promising: "Promising",
    established: "Established",
  } as const)[relation.evidence];
}

const englishMetricLabels: Record<string, string> = {
  bedtime_deviation: "Bedtime deviation",
  sleep_regularity: "Sleep regularity",
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
  intense_load_7d: "Intense load · 7 days",
  load_ratio_7_28: "Load ratio · 7/28 days",
  active_minutes: "Active minutes",
  exercise_minutes: "Exercise minutes",
  sleep_debt: "Sleep debt",
  calendar_deep_work: "Deep work",
};

function metricLabel(id: string, label: string) {
  return englishMetricLabels[id] ?? label;
}

function sourceLabel(value: string) {
  if (/whoop/i.test(value)) return "WHOOP";
  if (/fitbit|google/i.test(value)) return "Fitbit";
  return value;
}

function coverageText(relation: MatrixRelation) {
  return relation.coverageBySource.map((coverage) => {
    const count = relation.grain === "week" ? coverage.pairedWeeks : coverage.pairedDays;
    return `${sourceLabel(coverage.source)} ${count}`;
  }).join(" · ");
}

function findingSentence(relation: MatrixRelation) {
  const predictor = metricLabel(relation.predictorId, relation.predictorLabel);
  const outcome = metricLabel(relation.outcomeId, relation.outcomeLabel);
  const timing = relation.timeScale === "chronic" ? "across matched weeks" : relation.lagDays === 0 ? "that night" : relation.lagDays === 1 ? "the next day" : "two days later";
  return `${predictor} → ${outcome}: ${formatEffect(relation)} ${timing}.`;
}

function SummaryPanel({ title, eyebrow, relations, empty }: { title: string; eyebrow: string; relations: MatrixRelation[]; empty: string }) {
  const lead = relations[0];
  return <article className={`lab-timescale-card ${lead?.effect !== null && (lead?.effect ?? 0) < 0 ? "lab-timescale-card--inverse" : ""}`}>
    <header><span>{eyebrow}</span><h2>{title}</h2></header>
    {lead ? <>
      <p>{findingSentence(lead)}</p>
      <dl>
        <div><dt>95% interval</dt><dd>{formatInterval(lead)}</dd></div>
        <div><dt>Evidence</dt><dd>{evidenceLabel(lead)}</dd></div>
        <div><dt>Coverage</dt><dd>{coverageText(lead)}</dd></div>
      </dl>
    </> : <p className="lab-timescale-card__empty">{empty}</p>}
  </article>;
}

export function TimeScaleSummary({ matrix, narrative }: { matrix: PersonalLabSnapshot["matrix"]; narrative: PersonalLabSnapshot["aiNarrative"] }) {
  const acuteIntense = matrix.acuteHighlights.find((relation) => relation.predictorId === "intense_minutes" && relation.outcomeId === "hrv" && (relation.effect ?? 0) < 0);
  const chronicIntense = matrix.rows.filter((row) => row.timeScale === "chronic").flatMap((row) => row.relations)
    .find((relation) => relation.predictorId === "intense_minutes" && relation.outcomeId === "hrv" && relation.effect !== null);
  return <section className="lab-timescale" aria-labelledby="timescale-title">
    <div className="lab-timescale__heading"><span>Two time scales</span><h2 id="timescale-title">Short term / Long term</h2></div>
    <div className="lab-timescale__grid">
      <SummaryPanel title="Next day" eyebrow="Acute · J+1 / J+2" relations={matrix.acuteHighlights} empty="No acute result has passed every stability check yet." />
      <SummaryPanel title="Across weeks" eyebrow="Chronic · matched weeks" relations={matrix.chronicHighlights} empty="No chronic result has passed every stability check yet." />
    </div>
    {acuteIntense && <p className="lab-timescale__interpretation">Intense exercise is linked to {formatEffect(acuteIntense)} in HRV {acuteIntense.lagDays === 1 ? "the next day" : "two days later"}{chronicIntense ? `, versus ${formatEffect(chronicIntense)} across matched weeks` : ""}. Short-term recovery and the long-term trend are estimated separately.</p>}
    {narrative && <div className="lab-timescale__narrative"><span>Validated synthesis</span><p>{narrative.summary}</p><ul>{narrative.highlights.slice(0, 3).map((highlight) => <li key={highlight}>{highlight}</li>)}</ul></div>}
  </section>;
}

function RelationCell({ relation, cellKey, expanded, onToggle }: { relation: MatrixRelation; cellKey: string; expanded: boolean; onToggle: (key: string) => void }) {
  if (relation.excluded) return <td className="matrix-cell matrix-cell--excluded"><strong>—</strong></td>;
  const direction = relation.coefficient === null ? "" : relation.coefficient < 0 ? "matrix-cell--inverse" : "matrix-cell--direct";
  const evidenceClass = relation.coefficient === null || relation.evidence === "exploratory" ? "matrix-cell--early" : "matrix-cell--ready";
  return <td className={`matrix-cell matrix-cell--${relation.coefficient === null ? "hidden" : relation.strength} ${direction} ${evidenceClass}`}>
    <button type="button" className="matrix-cell__trigger" aria-expanded={expanded} aria-label={`${relation.predictorLabel} to ${relation.outcomeLabel}: ${formatEffect(relation)}. ${evidenceLabel(relation)}. ${expanded ? "Hide" : "Show"} statistical details.`} onClick={() => onToggle(cellKey)}>
      <strong>{formatEffect(relation)}</strong>
    </button>
    {expanded && <div className="matrix-cell__detail">
      <span>{evidenceLabel(relation)}</span>
      <small>95% CI {formatInterval(relation)} · q {formatProbability(relation.qValue)}</small>
      <small>{coverageText(relation) || `${relation.sampleSize} paired observations`}</small>
      <small>{relation.featureEligible ? `${relation.stability.chronologicalBlocks}/4 blocks · highlight eligible` : relation.exclusionReasons[0] ?? "Stability checks pending"}</small>
    </div>}
  </td>;
}

export function CorrelationMatrix({ matrix }: { matrix: PersonalLabSnapshot["matrix"] }) {
  const [grain, setGrain] = useState<"day" | "week">("week");
  const [openRelation, setOpenRelation] = useState<string | null>(null);
  const rows = useMemo(() => matrix.rows.filter((row) => row.grain === grain), [grain, matrix.rows]);
  const top = useMemo(() => rows.flatMap((row) => row.relations)
    .filter((relation) => !relation.excluded && relation.coefficient !== null)
    .sort((first, second) => first.qValue - second.qValue || second.sampleSize - first.sampleSize)
    .slice(0, 8), [rows]);

  return <section id="relations" className="matrix-section" aria-labelledby="matrix-title">
    <header className="matrix-header">
      <div><span className="section-kicker">All estimates</span><h2 id="matrix-title">Relationships</h2><p>Weeks remain the default view. Every weekly cell uses at least four dates shared by both measures.</p></div>
      <div className="matrix-grain" role="group" aria-label="Analysis period">
        <button type="button" aria-pressed={grain === "day"} onClick={() => { setGrain("day"); setOpenRelation(null); }}>Days · acute</button>
        <button type="button" aria-pressed={grain === "week"} onClick={() => { setGrain("week"); setOpenRelation(null); }}>Weeks · chronic</button>
      </div>
    </header>
    <div className="matrix-scroll" role="region" aria-label={`Relationships by ${grain === "day" ? "day" : "week"}`} tabIndex={0}>
      <table>
        <thead><tr><th scope="col">Variable</th>{matrix.outcomes.map((outcome) => <th scope="col" key={outcome.id}><span>{metricLabel(outcome.id, outcome.label)}</span><small>{outcome.unit}</small></th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><th scope="row"><strong>{metricLabel(row.id.split(":")[0], row.label)}</strong><small>{row.lagLabel}</small></th>{row.relations.map((relation) => {
          const cellKey = `${grain}:${row.id}:${relation.outcomeId}`;
          return <RelationCell relation={relation} cellKey={cellKey} expanded={openRelation === cellKey} onToggle={(key) => setOpenRelation((current) => current === key ? null : key)} key={relation.outcomeId} />;
        })}</tr>)}</tbody>
      </table>
    </div>
    <div className="matrix-mobile-list" aria-label="Top relationships">
      {top.length ? top.map((relation) => {
        const cellKey = `mobile:${grain}:${relation.predictorId}:${relation.outcomeId}:${relation.lagDays}`;
        return <article key={cellKey}>
          <button type="button" className="matrix-mobile-list__trigger" aria-expanded={openRelation === cellKey} onClick={() => setOpenRelation((current) => current === cellKey ? null : cellKey)}><strong>{metricLabel(relation.predictorId, relation.predictorLabel)} → {metricLabel(relation.outcomeId, relation.outcomeLabel)}</strong><span>{formatEffect(relation)} · {evidenceLabel(relation)}</span></button>
          {openRelation === cellKey && <small>95% CI {formatInterval(relation)} · q {formatProbability(relation.qValue)} · {coverageText(relation)} · {relation.exclusionReasons[0] ?? `${relation.stability.chronologicalBlocks}/4 stable blocks`}</small>}
        </article>;
      }) : <p>Not enough paired data yet.</p>}
    </div>
    {matrix.collectionProgress.length > 0 && <aside className="matrix-collection" aria-label="Data still being collected">
      <span>Still collecting</span>
      <ul>{matrix.collectionProgress.map((metric) => <li key={metric.id}><strong>{metricLabel(metric.id, metric.label)}</strong><span>{metric.recordedDays}/{metric.requiredDays} recorded days</span></li>)}</ul>
    </aside>}
    <details className="matrix-method">
      <summary>Method and thresholds</summary>
      <p>Daily estimates compare a behavior on day J with physiology on J+1 or J+2. Weekly estimates use non-overlapping weeks built from the same dates. WHOOP and Fitbit form one continuous history; a device adjustment absorbs a possible level shift at the transition. The model also adjusts for the previous outcome, weekday and a flexible time trend, while Newey–West intervals account for serial dependence. Numeric effects compare the 25th with the 75th percentile. q values are corrected separately for automatic acute, automatic chronic, journal acute and journal chronic families.</p>
      <p>Calculation starts at 15 paired days or 8 paired weeks. A highlight needs 30 days or 20 weeks, the same direction in at least 3 of 4 time blocks, and resilience to trend and extreme values.</p>
    </details>
  </section>;
}
