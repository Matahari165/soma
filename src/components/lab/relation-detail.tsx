"use client";

import { X } from "lucide-react";
import type { RefObject } from "react";

import type { MatrixDoseResponse, MatrixRelation } from "@/domain/lab/matrix";

function signed(value: number, digits = 1) {
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(digits)}`;
}

function effectDigits(effect: number | null, unit: string) {
  return ["bpm", "ms", "min", "count"].includes(unit) && Math.abs(effect ?? 0) >= 1 ? 0 : 1;
}

function effectUnit(unit: string) {
  return unit === "%" ? "pp" : unit;
}

function predictorDeltaText(relation: MatrixRelation) {
  if (relation.habitualPredictorDelta === null) return null;
  const value = relation.predictorUnit === "steps"
    ? Math.round(relation.habitualPredictorDelta).toLocaleString("en-US")
    : Number(relation.habitualPredictorDelta.toFixed(1)).toString();
  return `${value}${relation.predictorUnit ? ` ${relation.predictorUnit}` : ""}`;
}

export function effectText(relation: Pick<MatrixRelation, "effect" | "outcomeUnit">) {
  if (relation.effect === null) return "—";
  const unit = effectUnit(relation.outcomeUnit);
  return `${signed(relation.effect, effectDigits(relation.effect, relation.outcomeUnit))}${unit ? ` ${unit}` : ""}`;
}

export function percentText(relation: Pick<MatrixRelation, "percentEffect">) {
  return relation.percentEffect === null ? null : `${signed(relation.percentEffect, 1)}%`;
}

function probability(value: number) {
  return value < .001 ? "<.001" : value.toFixed(3);
}

function modelText(modelType: MatrixRelation["modelType"]) {
  if (modelType === "binary") return "Exposure comparison";
  if (modelType === "linear") return "Linear relation retained";
  if (modelType === "threshold") return "Threshold detected";
  if (modelType === "plateau") return "Plateau detected";
  if (modelType === "optimal-zone") return "Optimal zone detected";
  if (modelType === "adverse-zone") return "Adverse zone detected";
  return "Middle zone detected";
}

function modelEvidence(modelType: MatrixRelation["modelType"], improvement: number, nonlinearTested: boolean) {
  return modelType === "binary"
    ? modelText(modelType)
    : modelType === "linear"
      ? nonlinearTested ? "Linear relation retained after the non-linear check" : "Linear estimate · non-linear check needs 30 varied paired days"
    : `${modelText(modelType)} · ${Math.round(improvement * 100)}% less unexplained variation than a straight line`;
}

function overnightOutcome(relation: MatrixRelation) {
  return ["sleep_minutes", "sleep_efficiency", "sleep_latency", "sleep_awake", "sleep_awakenings", "sleep_fragmentation", "deep_sleep", "rem_sleep", "light_sleep", "hrv", "rhr", "respiratory", "spo2", "recovery"].some((id) => relation.outcomeId.startsWith(id));
}

export function timingText(relation: MatrixRelation) {
  if (relation.lagDays === 0) return overnightOutcome(relation) ? "That sleep episode" : "Same day";
  if (relation.lagDays === 1) return overnightOutcome(relation) ? "Following night / next morning" : "Next day";
  return "Two days later";
}

export function shortTimingText(relation: MatrixRelation) {
  if (relation.lagDays === 0) return overnightOutcome(relation) ? "Sleep" : "J";
  return `J+${relation.lagDays}`;
}

export function relationTone(relation: MatrixRelation, direction: "higher" | "lower" | "target") {
  if (relation.effect === null) return "is-neutral";
  if (direction === "higher") return relation.effect > 0 ? "is-positive" : "is-negative";
  if (direction === "lower") return relation.effect < 0 ? "is-positive" : "is-negative";
  if (relation.outcomeId === "sleep_minutes" && relation.baselineMean !== null && relation.comparisonMean !== null) {
    return Math.abs(relation.comparisonMean - 510) < Math.abs(relation.baselineMean - 510) ? "is-positive" : "is-negative";
  }
  return "is-neutral";
}

function sourceText(relation: MatrixRelation) {
  const coverage = relation.coverageBySource.map((item) => `${item.source} ${item.pairedDays} days`).join(" · ") || "No paired source";
  return `One longitudinal history · ${coverage}`;
}

function findingSentence(relation: MatrixRelation) {
  const relative = percentText(relation) ? ` (${percentText(relation)} relative to baseline ${relation.outcomeLabel})` : "";
  return `${relation.predictorLabel} (${relation.comparisonLabel}) is associated with ${effectText(relation)}${relative} in ${relation.outcomeLabel} ${timingText(relation).toLowerCase()}.`;
}

function doseEffectText(dose: MatrixDoseResponse, unit: string) {
  const digits = effectDigits(dose.effect, unit);
  const displayedUnit = effectUnit(unit);
  return `${signed(dose.effect, digits)}${displayedUnit ? ` ${displayedUnit}` : ""}`;
}

function RelationEvidence({ relation, direction }: { relation: MatrixRelation; direction: "higher" | "lower" | "target" }) {
  const maximum = Math.max(Math.abs(relation.baselineMean ?? 0), Math.abs(relation.comparisonMean ?? 0), 1);
  return <article className="relation-evidence">
    <header><span>{timingText(relation)}</span><strong>{relation.qValue < .05 ? "q < 0.05" : "Not significant"}</strong></header>
    <p className="relation-detail__finding">{findingSentence(relation)}</p>
    <div className="relation-detail__plot" aria-label={`Compared ${relation.outcomeLabel} values ${timingText(relation).toLowerCase()}`}>
      <div><span>Baseline outcome</span><i style={{ width: `${Math.abs(relation.baselineMean ?? 0) / maximum * 100}%` }} /><strong>{relation.baselineMean ?? "—"} {relation.outcomeUnit}</strong></div>
      <div><span>{relation.comparisonLabel}</span><i className={relationTone(relation, direction)} style={{ width: `${Math.abs(relation.comparisonMean ?? 0) / maximum * 100}%` }} /><strong>{relation.comparisonMean ?? "—"} {relation.outcomeUnit}</strong></div>
    </div>
    <dl>
      <div><dt>Outcome change</dt><dd>{percentText(relation) ? `${percentText(relation)} of baseline · ` : ""}{effectText(relation)}</dd></div>
      {relation.habitualEffect !== null && <div><dt>Your habitual variation</dt><dd>{predictorDeltaText(relation)} → {effectText({ effect: relation.habitualEffect, outcomeUnit: relation.outcomeUnit })}</dd></div>}
      <div><dt>95% interval</dt><dd>{relation.effectConfidenceLow === null ? "—" : `${signed(relation.effectConfidenceLow, effectDigits(relation.effect, relation.outcomeUnit))} to ${signed(relation.effectConfidenceHigh ?? 0, effectDigits(relation.effect, relation.outcomeUnit))} ${effectUnit(relation.outcomeUnit)}`}</dd></div>
      <div><dt>Compared days</dt><dd>{relation.baselineCount} baseline · {relation.comparisonCount} comparison</dd></div>
      <div><dt>Detected shape</dt><dd>{modelEvidence(relation.modelType, relation.modelImprovement, relation.nonlinearTested)}</dd></div>
      <div><dt>Tests</dt><dd>p {probability(relation.pValue)} · q {probability(relation.qValue)}</dd></div>
    </dl>
    {relation.doseResponse && <section className="relation-dose">
      <h5>Dose response</h5>
      <p><strong>{relation.doseResponse.comparisonLabel}</strong> is associated with {doseEffectText(relation.doseResponse, relation.outcomeUnit)}{relation.doseResponse.percentEffect === null ? "" : ` (${signed(relation.doseResponse.percentEffect, 1)}% of baseline)`}. This uses all {relation.doseResponse.sampleSize} recorded days, including zero-amount days.</p>
      <p><small>{modelEvidence(relation.doseResponse.modelType, relation.doseResponse.modelImprovement, relation.doseResponse.nonlinearTested)}.</small></p>
      <small>Exploratory quantity estimate · {relation.doseResponse.modelType === "linear" ? "raw" : "shape-search adjusted"} p {probability(relation.doseResponse.pValue)} · not used to qualify the main exposure relation · 95% interval {signed(relation.doseResponse.effectConfidenceLow, effectDigits(relation.doseResponse.effect, relation.outcomeUnit))} to {signed(relation.doseResponse.effectConfidenceHigh, effectDigits(relation.doseResponse.effect, relation.outcomeUnit))} {effectUnit(relation.outcomeUnit)}</small>
    </section>}
  </article>;
}

export function RelationDetail({ relations, direction, onClose, detailRef }: { relations: MatrixRelation[]; direction: "higher" | "lower" | "target"; onClose: () => void; detailRef: RefObject<HTMLElement | null> }) {
  const first = relations[0];
  if (!first) return null;
  return <aside ref={detailRef} className="relation-detail" tabIndex={-1} aria-labelledby="relation-detail-title">
    <header>
      <div><h3 id="relation-detail-title">{first.predictorLabel} × {first.outcomeLabel}</h3></div>
      <button type="button" className="icon-button" aria-label="Close relation detail" onClick={onClose}><X size={17} /></button>
    </header>
    <p className="relation-detail__explanation">Each percentage below is the relative change in the <strong>outcome</strong> for the predictor contrast written beside it. It is never an effect per one unit unless that exact unit is stated.</p>
    {relations.map((relation) => <RelationEvidence key={`${relation.predictorId}:${relation.outcomeId}:${relation.lagDays}`} relation={relation} direction={direction} />)}
    <footer><span>Period</span><strong>{first.period === "all" ? "All history" : `${first.period} days`}</strong><span>Sources</span><strong>{sourceText(first)}</strong><span>Method</span><strong>Raw within-person · device baseline adjusted · serial-dependence robust · BH corrected</strong></footer>
  </aside>;
}
