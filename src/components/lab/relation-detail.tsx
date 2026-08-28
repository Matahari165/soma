"use client";

import { X } from "lucide-react";
import type { RefObject } from "react";

import type { MatrixRelation } from "@/domain/lab/matrix";

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
  steps: "Total steps recorded during the day.",
  active_minutes: "Minutes classified as active by your wearable.",
  sedentary_minutes: "Minutes classified as sedentary by Google Health.",
  active_day: "Whether the day met Soma's activity threshold.",
  effort: "Soma's estimate of your daily activity load.",
  zone_minutes: "Minutes spent in the wearable's heart-rate activity zones.",
  intense_minutes: "Minutes spent in vigorous and peak heart-rate zones.",
  exercise_minutes: "Total duration of recorded exercise.",
  running_distance: "Distance covered during recorded running sessions.",
  running_pace: "Average pace of recorded running sessions.",
  running_average_heart_rate: "Average heart rate during recorded running sessions.",
  vo2_max: "Wearable estimate of the maximum oxygen use during exercise.",
  sleep_minutes: "Duration of the previous sleep episode.",
  sleep_regularity: "How closely your sleep schedule follows its recent pattern.",
};

export function outcomeExplanation(outcomeId: string, label: string) {
  const explanations: Record<string, string> = {
    sleep_minutes: "Total time spent asleep during the sleep episode.",
    sleep_efficiency: "The percentage of time in bed spent asleep.",
    sleep_latency: "Time needed to fall asleep.",
    sleep_awake: "Time awake during the sleep episode.",
    sleep_fragmentation: "How interrupted the sleep episode was.",
    deep_sleep: "Time spent in deep sleep.",
    rem_sleep: "Time spent in REM sleep.",
    light_sleep: "Time spent in light sleep.",
    hrv: "Heart-rate variability, measured in milliseconds.",
    rhr: "Average resting heart rate.",
    recovery: "Soma's recovery estimate from several health inputs.",
    vo2_max: "Wearable estimate of the maximum oxygen use during exercise.",
    running_average_heart_rate: "Average heart rate during recorded running sessions.",
    running_pace: "Average pace of recorded running sessions.",
  };
  return explanations[outcomeId] ?? `${label} measured by Soma from your connected health data.`;
}

export function predictorExplanation(relation: Pick<MatrixRelation, "predictorId" | "predictorLabel">) {
  if (relation.predictorId.startsWith("journal:")) return `${relation.predictorLabel} is a personal measure recorded by you in the Journal.`;
  return predictorDefinitions[relation.predictorId] ?? `${relation.predictorLabel} is a daily measure from your connected health data.`;
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

function sentenceComparisonText(relation: MatrixRelation) {
  if (relation.comparisonLabel === "yes vs no") return "yes rather than no";
  if (relation.comparisonLabel === "30 min later") return "30 minutes later";
  const readable = relation.comparisonLabel.replace(/([+−-]?\d+(?:\.\d+)?)\s*min\b/g, (match, raw: string) => {
    const value = Number(raw.replace("−", "-"));
    if (Math.abs(value) <= 120) return match;
    const absolute = Math.abs(Math.round(value));
    const hours = Math.floor(absolute / 60);
    const minutes = absolute % 60;
    return `${raw.startsWith("+") ? "+" : raw.startsWith("-") || raw.startsWith("−") ? "−" : ""}${hours} hour${hours === 1 ? "" : "s"}${minutes ? ` ${minutes} minutes` : ""}`;
  });
  const amountComparison = readable.match(/^(.+?) avg vs 0$/);
  if (amountComparison) return `${amountComparison[1]} on average rather than zero`;
  const threshold = readable.match(/^threshold above (.+)$/);
  if (threshold) return `above ${threshold[1]}`;
  const plateau = readable.match(/^plateau after (.+)$/);
  if (plateau) return `after ${plateau[1]}`;
  const zone = readable.match(/^(?:optimal|adverse|middle) zone (.+)$/);
  if (zone) return `within ${zone[1]}`;
  if (readable.startsWith("+")) return `${readable.slice(1)} higher`;
  return readable;
}

function associationVerb(label: string) {
  return /\b(?:steps|minutes|awakenings|floors|zones|days)$/i.test(label.trim()) ? "are" : "is";
}

function sentenceTimingText(relation: MatrixRelation) {
  if (relation.lagDays === 0) return overnightOutcome(relation) ? "during the same sleep episode" : "on the same day";
  if (relation.lagDays === 1) return overnightOutcome(relation) ? "during the following night" : "on the next day";
  return "two days later";
}

function effectMagnitudeText(relation: MatrixRelation) {
  if (relation.effect === null) return null;
  const unit = effectUnit(relation.outcomeUnit);
  const digits = unit === "pts" && Math.abs(relation.effect) >= 1 ? 0 : effectDigits(relation.effect, relation.outcomeUnit);
  const value = Math.abs(Number(relation.effect.toFixed(digits))).toFixed(digits);
  if (unit === "pp") return `${value} percentage point${value === "1.0" ? "" : "s"}`;
  if (unit === "count") return `${value} ${relation.outcomeLabel.toLowerCase()}`;
  if (unit === "/h") return `${value} per hour`;
  if (unit === "/min") return `${value} per minute`;
  if (unit === "pts") return `${value} point${value === "1.0" ? "" : "s"}`;
  if (unit === "min") return `${value} minute${value === "1" ? "" : "s"}`;
  if (unit === "ms") return `${value} millisecond${value === "1" ? "" : "s"}`;
  return `${value}${unit ? ` ${unit}` : ""}`;
}

export function findingSentence(relation: MatrixRelation) {
  const effect = relation.effect;
  const magnitude = effectMagnitudeText(relation);
  if (magnitude === null || effect === null || effect === 0) {
    return `${relation.predictorLabel} (${sentenceComparisonText(relation)}) ${associationVerb(relation.predictorLabel)} not associated with a measurable change in ${relation.outcomeLabel} ${sentenceTimingText(relation)}.`;
  }
  const direction = effect > 0 ? "increase" : "decrease";
  const article = direction === "increase" ? "an" : "a";
  const relative = relation.percentEffect === null
    ? ""
    : ` (${Math.abs(relation.percentEffect).toFixed(1)}% ${direction} compared with baseline)`;
  return `${relation.predictorLabel} (${sentenceComparisonText(relation)}) ${associationVerb(relation.predictorLabel)} associated with ${article} ${direction} of ${magnitude} in ${relation.outcomeLabel} ${sentenceTimingText(relation)}${relative}.`;
}

export function RelationDetail({ relations, direction, onClose, detailRef }: { relations: MatrixRelation[]; direction: "higher" | "lower" | "target"; onClose: () => void; detailRef: RefObject<HTMLElement | null> }) {
  const first = relations[0];
  if (!first) return null;
  void direction;
  return <aside ref={detailRef} className="relation-detail relation-detail--popover" tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="relation-detail-title">
    <header>
      <div><span className="relation-detail__eyebrow">Relationship</span><h3 id="relation-detail-title">{first.predictorLabel} → {first.outcomeLabel}</h3></div>
      <button type="button" className="icon-button" aria-label="Close relation detail" onClick={onClose}><X size={17} /></button>
    </header>
    <div className="relation-detail__popover-body">
      {relations.map((relation) => <p className="relation-detail__finding" key={`${relation.predictorId}:${relation.outcomeId}:${relation.lagDays}`}>{findingSentence(relation)}</p>)}
      <dl className="relation-detail__definitions">
        <div><dt>Influence</dt><dd>{predictorExplanation(first)}</dd></div>
        <div><dt>Result</dt><dd>{outcomeExplanation(first.outcomeId, first.outcomeLabel)}</dd></div>
      </dl>
    </div>
  </aside>;
}
