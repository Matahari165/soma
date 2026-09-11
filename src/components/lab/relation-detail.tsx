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
  steps: "Total des pas enregistrés pendant la journée.",
  active_minutes: "Minutes classées comme actives par ton appareil.",
  sedentary_minutes: "Minutes classées comme sédentaires par Google Health.",
  active_day: "Indique si la journée a atteint le seuil d’activité de Soma.",
  effort: "Estimation par Soma de ta charge d’activité quotidienne.",
  zone_minutes: "Minutes passées dans les zones cardiaques de ton appareil.",
  intense_minutes: "Minutes passées dans les zones cardiaques vigoureuse et maximale.",
  exercise_minutes: "Durée totale de l’exercice enregistré.",
  running_distance: "Distance parcourue pendant les séances de course enregistrées.",
  running_pace: "Allure moyenne des séances de course enregistrées.",
  running_average_heart_rate: "Fréquence cardiaque moyenne pendant les séances de course enregistrées.",
  vo2_max: "Estimation par l’appareil de l’utilisation maximale d’oxygène pendant l’exercice.",
  sleep_minutes: "Durée de l’épisode de sommeil précédent.",
  sleep_regularity: "Degré de respect du rythme de sommeil récent.",
};

export function outcomeExplanation(outcomeId: string, label: string) {
  const explanations: Record<string, string> = {
    sleep_minutes: "Temps total passé à dormir pendant l’épisode de sommeil.",
    sleep_efficiency: "Pourcentage du temps au lit passé à dormir.",
    sleep_latency: "Temps nécessaire pour s’endormir.",
    sleep_awake: "Temps éveillé pendant l’épisode de sommeil.",
    sleep_fragmentation: "Degré d’interruption de l’épisode de sommeil.",
    deep_sleep: "Temps passé en sommeil profond.",
    rem_sleep: "Temps passé en sommeil paradoxal.",
    light_sleep: "Temps passé en sommeil léger.",
    hrv: "Variabilité de la fréquence cardiaque, mesurée en millisecondes.",
    rhr: "Fréquence cardiaque moyenne au repos.",
    recovery: "Estimation de la récupération par Soma à partir de plusieurs données de santé.",
    vo2_max: "Estimation par l’appareil de l’utilisation maximale d’oxygène pendant l’exercice.",
    running_average_heart_rate: "Fréquence cardiaque moyenne pendant les séances de course enregistrées.",
    running_pace: "Allure moyenne des séances de course enregistrées.",
  };
  return explanations[outcomeId] ?? `${label}, mesuré par Soma à partir de tes données de santé connectées.`;
}

export function predictorExplanation(relation: Pick<MatrixRelation, "predictorId" | "predictorLabel">) {
  if (relation.predictorId.startsWith("journal:")) return `${relation.predictorLabel} est une mesure personnelle enregistrée par toi dans le journal.`;
  return predictorDefinitions[relation.predictorId] ?? `${relation.predictorLabel} est une mesure quotidienne issue de tes données de santé connectées.`;
}

export function timingText(relation: MatrixRelation) {
  if (relation.lagDays === 0) return overnightOutcome(relation) ? "Cet épisode de sommeil" : "Même jour";
  if (relation.lagDays === 1) return overnightOutcome(relation) ? "Nuit suivante / matin suivant" : "Lendemain";
  return "Deux jours plus tard";
}

export function shortTimingText(relation: MatrixRelation) {
  if (relation.lagDays === 0) return overnightOutcome(relation) ? "Sommeil" : "J";
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
  if (relation.comparisonLabel === "yes vs no") return "oui plutôt que non";
  if (relation.comparisonLabel === "30 min later") return "30 minutes plus tard";
  const readable = relation.comparisonLabel.replace(/([+−-]?\d+(?:\.\d+)?)\s*min\b/g, (match, raw: string) => {
    const value = Number(raw.replace("−", "-"));
    if (Math.abs(value) <= 120) return match;
    const absolute = Math.abs(Math.round(value));
    const hours = Math.floor(absolute / 60);
    const minutes = absolute % 60;
    return `${raw.startsWith("+") ? "+" : raw.startsWith("-") || raw.startsWith("−") ? "−" : ""}${hours} h${minutes ? ` ${minutes} min` : ""}`;
  });
  const amountComparison = readable.match(/^(.+?) avg vs 0$/);
  if (amountComparison) return `${amountComparison[1]} en moyenne plutôt que zéro`;
  const higherSteps = readable.match(/^\+?(\d+(?:\.\d+)?) steps$/);
  if (higherSteps) return `${higherSteps[1]} pas de plus`;
  const threshold = readable.match(/^threshold above (.+)$/);
  if (threshold) return `au-dessus de ${threshold[1]}`;
  const plateau = readable.match(/^plateau after (.+)$/);
  if (plateau) return `après ${plateau[1]}`;
  const zone = readable.match(/^(?:optimal|adverse|middle) zone (.+)$/);
  if (zone) return `dans la zone ${zone[1]}`;
  if (readable.startsWith("+")) return `${readable.slice(1)} plus élevé`;
  return readable;
}

function associationVerb(label: string) {
  if (label === "Les pas") return "sont associés";
  return /\b(?:minutes|zones|journées)$/i.test(label.trim()) ? "sont associées" : "est associée";
}

function sentenceTimingText(relation: MatrixRelation) {
  if (relation.lagDays === 0) return overnightOutcome(relation) ? "pendant le même épisode de sommeil" : "le même jour";
  if (relation.lagDays === 1) return overnightOutcome(relation) ? "pendant la nuit suivante" : "le lendemain";
  return "deux jours plus tard";
}

function effectMagnitudeText(relation: MatrixRelation) {
  if (relation.effect === null) return null;
  const unit = effectUnit(relation.outcomeUnit);
  const digits = unit === "pts" && Math.abs(relation.effect) >= 1 ? 0 : effectDigits(relation.effect, relation.outcomeUnit);
  const numericValue = Math.abs(Number(relation.effect.toFixed(digits)));
  const value = numericValue.toLocaleString("fr-CH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (unit === "pp") return `${value} point${numericValue < 2 ? "" : "s"} de pourcentage`;
  if (unit === "count") return `${value} ${localizedMetricLabel(relation.outcomeId, relation.outcomeLabel).toLocaleLowerCase("fr")}`;
  if (unit === "/h") return `${value} par heure`;
  if (unit === "/min") return `${value} par minute`;
  if (unit === "pts") return `${value} point${numericValue === 1 ? "" : "s"}`;
  if (unit === "min") return `${value} minute${numericValue === 1 ? "" : "s"}`;
  if (unit === "ms") return `${value} milliseconde${numericValue === 1 ? "" : "s"}`;
  return `${value}${unit ? ` ${unit}` : ""}`;
}

export function findingSentence(relation: MatrixRelation) {
  const predictorLabel = localizedMetricSentenceLabel(relation.predictorId, relation.predictorLabel);
  const outcomeLabel = localizedMetricSentenceLabel(relation.outcomeId, relation.outcomeLabel);
  const effect = relation.effect;
  const magnitude = effectMagnitudeText(relation);
  if (magnitude === null || effect === null || effect === 0) {
    return `${predictorLabel} (${sentenceComparisonText(relation)}) ${associationVerb(predictorLabel)} à une variation mesurable de ${outcomeLabel} ${sentenceTimingText(relation)}.`;
  }
  const direction = effect > 0 ? "hausse" : "baisse";
  const relative = relation.percentEffect === null
    ? ""
    : ` (${Math.abs(relation.percentEffect).toLocaleString("fr-CH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} % de ${direction} par rapport à la référence)`;
  return `${predictorLabel} (${sentenceComparisonText(relation)}) ${associationVerb(predictorLabel)} à une ${direction} de ${magnitude} pour ${outcomeLabel} ${sentenceTimingText(relation)}${relative}.`;
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
      <button type="button" className="icon-button" aria-label="Fermer le détail de la relation" onClick={onClose}><X size={17} /></button>
    </header>
    <div className="relation-detail__popover-body">
      {relations.map((relation) => <p className="relation-detail__finding" key={`${relation.predictorId}:${relation.outcomeId}:${relation.lagDays}`}>{findingSentence(relation)}</p>)}
      <dl className="relation-detail__definitions">
        <div><dt>Influence</dt><dd>{predictorExplanation({ ...first, predictorLabel })}</dd></div>
        <div><dt>Résultat</dt><dd>{outcomeExplanation(first.outcomeId, outcomeLabel)}</dd></div>
      </dl>
    </div>
  </aside>;
}
