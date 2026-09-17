"use client";

import { X } from "lucide-react";
import type { RefObject } from "react";

import type { MatrixRelation } from "@/domain/lab/matrix";

import { localizedMetricLabel, localizedMetricSentenceLabel } from "./lab-copy";

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

export function effectText(relation: Pick<MatrixRelation, "effect" | "outcomeUnit">) {
  if (relation.effect === null) return "—";
  const unit = effectUnit(relation.outcomeUnit);
  return `${signed(relation.effect, effectDigits(relation.effect, relation.outcomeUnit))}${unit ? ` ${unit}` : ""}`;
}

export function percentText(relation: Pick<MatrixRelation, "percentEffect">) {
  return relation.percentEffect === null ? null : `${signed(relation.percentEffect, 1)}%`;
}

function overnightOutcome(relation: MatrixRelation) {
  return ["sleep_minutes", "sleep_efficiency", "sleep_latency", "sleep_awake", "sleep_fragmentation", "deep_sleep", "rem_sleep", "light_sleep", "hrv", "rhr", "respiratory", "spo2", "recovery"].some((id) => relation.outcomeId.startsWith(id));
}

const predictorDefinitions: Record<string, string> = {
  steps: "Total step count recorded throughout the day.",
  active_minutes: "Minutes classified as active by your device.",
  sedentary_minutes: "Minutes classified as sedentary by Google Health.",
  active_day: "Indicates whether the day reached Soma’s activity threshold.",
  effort: "Soma’s daily activity strain estimate.",
  zone_minutes: "Minutes spent in your device heart rate zones.",
  intense_minutes: "Minutes spent in vigorous and peak heart rate zones.",
  exercise_minutes: "Total recorded workout duration.",
  running_distance: "Distance covered across recorded running sessions.",
  running_pace: "Average pace during recorded running sessions.",
  running_average_heart_rate: "Average heart rate during recorded running sessions.",
  vo2_max: "Device estimate of maximal oxygen uptake during exercise.",
  sleep_minutes: "Duration of the preceding sleep session.",
  sleep_regularity: "Recent sleep timing consistency score.",
};

export function outcomeExplanation(outcomeId: string, label: string) {
  const explanations: Record<string, string> = {
    sleep_minutes: "Total time asleep during the sleep session.",
    sleep_efficiency: "Percentage of time in bed spent asleep.",
    sleep_latency: "Time required to fall asleep.",
    sleep_awake: "Time awake during the sleep session.",
    sleep_fragmentation: "Degree of sleep session disruption.",
    deep_sleep: "Time spent in deep sleep.",
    rem_sleep: "Time spent in REM sleep.",
    light_sleep: "Time spent in light sleep.",
    hrv: "Heart rate variability, measured in milliseconds.",
    rhr: "Average resting heart rate.",
    recovery: "Soma recovery estimate derived from multiple health signals.",
    vo2_max: "Device estimate of maximal oxygen uptake during exercise.",
    running_average_heart_rate: "Average heart rate during recorded running sessions.",
    running_pace: "Average pace during recorded running sessions.",
  };
  return explanations[outcomeId] ?? `${label}, measured by Soma from your connected health data.`;
}

export function predictorExplanation(relation: Pick<MatrixRelation, "predictorId" | "predictorLabel">) {
  if (relation.predictorId.startsWith("journal:")) return `${relation.predictorLabel} is a personal variable logged by you in your journal.`;
  return predictorDefinitions[relation.predictorId] ?? `${relation.predictorLabel} is a daily measurement from your connected health data.`;
}

export function timingText(relation: MatrixRelation) {
  if (relation.lagDays === 0) return overnightOutcome(relation) ? "This sleep session" : "Same day";
  if (relation.lagDays === 1) return overnightOutcome(relation) ? "Next night / following morning" : "Next day";
  return "Two days later";
}

export function shortTimingText(relation: MatrixRelation) {
  if (relation.lagDays === 0) return overnightOutcome(relation) ? "Sleep" : "D";
  return `D+${relation.lagDays}`;
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

function sentenceComparisonText(relation: MatrixRelation) {
  if (relation.comparisonLabel === "yes vs no") return "yes vs no";
  if (relation.comparisonLabel === "30 min later") return "30 minutes later";
  const readable = relation.comparisonLabel.replace(/([+−-]?\d+(?:\.\d+)?)\s*min\b/g, (match, raw: string) => {
    const value = Number(raw.replace("−", "-"));
    if (Math.abs(value) <= 120) return match;
    const absolute = Math.abs(Math.round(value));
    const hours = Math.floor(absolute / 60);
    const minutes = absolute % 60;
    return `${raw.startsWith("+") ? "+" : raw.startsWith("-") || raw.startsWith("−") ? "−" : ""}${hours} h${minutes ? ` ${minutes} min` : ""}`;
  });
  const amountComparison = readable.match(/^(.+?) avg vs 0$/);
  if (amountComparison) return `${amountComparison[1]} average vs 0`;
  const higherSteps = readable.match(/^\+?(\d+(?:\.\d+)?) steps$/);
  if (higherSteps) return `${higherSteps[1]} more steps`;
  const threshold = readable.match(/^threshold above (.+)$/);
  if (threshold) return `above ${threshold[1]}`;
  const plateau = readable.match(/^plateau after (.+)$/);
  if (plateau) return `after ${plateau[1]}`;
  const zone = readable.match(/^(?:optimal|adverse|middle) zone (.+)$/);
  if (zone) return `in zone ${zone[1]}`;
  if (readable.startsWith("+")) return `${readable.slice(1)} higher`;
  return readable;
}

function sentenceTimingText(relation: MatrixRelation) {
  if (relation.lagDays === 0) return overnightOutcome(relation) ? "during the same sleep session" : "on the same day";
  if (relation.lagDays === 1) return overnightOutcome(relation) ? "during the next night" : "on the following day";
  return "two days later";
}

function effectMagnitudeText(relation: MatrixRelation) {
  if (relation.effect === null) return null;
  const unit = effectUnit(relation.outcomeUnit);
  const digits = unit === "pts" && Math.abs(relation.effect) >= 1 ? 0 : effectDigits(relation.effect, relation.outcomeUnit);
  const numericValue = Math.abs(Number(relation.effect.toFixed(digits)));
  const value = numericValue.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (unit === "pp") return `${value} percentage point${numericValue === 1 ? "" : "s"}`;
  if (unit === "count") return `${value} ${localizedMetricLabel(relation.outcomeId, relation.outcomeLabel).toLocaleLowerCase("en")}`;
  if (unit === "/h") return `${value} per hour`;
  if (unit === "/min") return `${value} per minute`;
  if (unit === "pts") return `${value} point${numericValue === 1 ? "" : "s"}`;
  if (unit === "min") return `${value} minute${numericValue === 1 ? "" : "s"}`;
  if (unit === "ms") return `${value} millisecond${numericValue === 1 ? "" : "s"}`;
  return `${value}${unit ? ` ${unit}` : ""}`;
}

export function findingSentence(relation: MatrixRelation) {
  const predictorLabel = localizedMetricSentenceLabel(relation.predictorId, relation.predictorLabel);
  const outcomeLabel = localizedMetricSentenceLabel(relation.outcomeId, relation.outcomeLabel);
  const effect = relation.effect;
  const magnitude = effectMagnitudeText(relation);
  if (magnitude === null || effect === null || effect === 0) {
    return `${predictorLabel} (${sentenceComparisonText(relation)}) is associated with a measurable change in ${outcomeLabel} ${sentenceTimingText(relation)}.`;
  }
  const direction = effect > 0 ? "increase" : "decrease";
  const relative = relation.percentEffect === null
    ? ""
    : ` (${Math.abs(relation.percentEffect).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% ${direction} relative to baseline)`;
  return `${predictorLabel} (${sentenceComparisonText(relation)}) is associated with a ${magnitude} ${direction} in ${outcomeLabel} ${sentenceTimingText(relation)}${relative}.`;
}

export function RelationDetail({ relations, direction, onClose, detailRef }: { relations: MatrixRelation[]; direction: "higher" | "lower" | "target"; onClose: () => void; detailRef: RefObject<HTMLElement | null> }) {
  const first = relations[0];
  if (!first) return null;
  void direction;
  const predictorLabel = localizedMetricLabel(first.predictorId, first.predictorLabel);
  const outcomeLabel = localizedMetricLabel(first.outcomeId, first.outcomeLabel);
  return <aside ref={detailRef} className="relation-detail relation-detail--popover" tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="relation-detail-title">
    <header>
      <div><span className="relation-detail__eyebrow">Relation</span><h3 id="relation-detail-title">{predictorLabel} → {outcomeLabel}</h3></div>
      <button type="button" className="icon-button" aria-label="Close relation details" onClick={onClose}><X size={17} /></button>
    </header>
    <div className="relation-detail__popover-body">
      {relations.map((relation) => <p className="relation-detail__finding" key={`${relation.predictorId}:${relation.outcomeId}:${relation.lagDays}`}>{findingSentence(relation)}</p>)}
      <dl className="relation-detail__definitions">
        <div><dt>Predictor</dt><dd>{predictorExplanation({ ...first, predictorLabel })}</dd></div>
        <div><dt>Outcome</dt><dd>{outcomeExplanation(first.outcomeId, outcomeLabel)}</dd></div>
      </dl>
    </div>
  </aside>;
}
