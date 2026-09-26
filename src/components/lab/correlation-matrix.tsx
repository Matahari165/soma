"use client";

import { Check, X } from "lucide-react";
import { cloneElement, Fragment, isValidElement, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactElement, ReactNode, RefObject } from "react";

import { isPersonalLabDisplayableRelation, PRACTICAL_EFFECT_THRESHOLDS, selectMeaningfulRelations, selectSummaryRelations, summaryRelationKey, type AnalysisPeriod, type MatrixRelation, type PersonalLabRelationDisplayOptions } from "@/domain/lab/matrix";
import type { StrongestEffectsRelation, StrongestEffectsResponse } from "@/domain/lab/strongest-effects-response";
import type { PersonalLabSnapshot } from "@/services/personal-lab";

import { useMotionUpdate } from "@/components/motion/use-motion-update";
import { useMotionPresence } from "@/components/motion/use-motion-presence";

import { localizedMetricLabel, localizedMetricUnit } from "./lab-copy";
import { effectText, outcomeExplanation, percentText, RelationDetail } from "./relation-detail";
import { StrongestEffectsLoading } from "./strongest-effects-loading";
import { calculableRelations, compareInfluenceGroups, groupMatrixRows, groupRelationsByComparison, influenceGroup, significantRelations } from "./relationship-groups";
import { useTemporalStabilityPreference } from "./personal-lab-preferences";
import { LatestRequest } from "./latest-request";

export function periodLabel(period: AnalysisPeriod) {
  return period === "all" ? "Tout" : `${period} j`;
}

function periodDisplayLabel(period: AnalysisPeriod) {
  return period === "all" ? "Tout" : `${period} j`;
}

function strongestUncertaintyLabel(relation: Pick<MatrixRelation, "effectConfidenceLow" | "effectConfidenceHigh" | "outcomeUnit">) {
  if (relation.effectConfidenceLow === null || relation.effectConfidenceHigh === null) return "incertitude indisponible";
  const low = effectText({ effect: relation.effectConfidenceLow, outcomeUnit: relation.outcomeUnit });
  const high = effectText({ effect: relation.effectConfidenceHigh, outcomeUnit: relation.outcomeUnit });
  return `intervalle 95 % ${low} à ${high}`;
}

export function defaultAnalysisPeriod(periods: readonly AnalysisPeriod[]) {
  return periods.includes(90) ? 90 : periods[0] ?? 30;
}

/** Keep large daily durations readable without changing the value used by the model. */
export function formatDuration(value: number) {
  const rounded = Math.round(value);
  if (Math.abs(rounded) <= 120) return `${rounded} min`;
  const sign = rounded < 0 ? "−" : "";
  const absolute = Math.abs(rounded);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `${sign}${hours} h${minutes ? ` ${minutes} min` : ""}`;
}

export function formatComparisonLabel(label: string) {
  const formatted = label.replace(/([+−-]?\d+(?:\.\d+)?)\s*min\b/g, (match, raw: string) => {
    const value = Number(raw.replace("−", "-"));
    if (Math.abs(value) <= 120) return match;
    const prefix = raw.startsWith("+") ? "+" : "";
    return `${prefix}${formatDuration(value).replace(/^−/, "")}`;
  });
  if (formatted === "yes vs no") return "oui plutôt que non";
  const amountComparison = formatted.match(/^(.+?) avg vs 0$/);
  if (amountComparison) return `${amountComparison[1]} en moyenne plutôt que zéro`;
  const higherSteps = formatted.match(/^\+?(\d+(?:\.\d+)?) steps$/);
  if (higherSteps) return `${higherSteps[1]} pas de plus`;
  const threshold = formatted.match(/^threshold above (.+)$/);
  if (threshold) return `au-dessus de ${threshold[1]}`;
  const plateau = formatted.match(/^plateau after (.+)$/);
  if (plateau) return `après ${plateau[1]}`;
  const zone = formatted.match(/^(?:optimal|adverse|middle) zone (.+)$/);
  if (zone) return `dans la zone ${zone[1]}`;
  return formatted;
}

/** Keep programmatic scrolling consistent with the user's motion preference. */
export function matrixScrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "auto";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function scrollToMatrixElement(element: Element | null) {
  element?.scrollIntoView({ behavior: matrixScrollBehavior(), block: "start" });
}

function effectDirection(relation: Pick<MatrixRelation, "effect">, direction: "higher" | "lower" | "target") {
  void direction;
  return relation.effect === null || relation.effect === 0 ? 0 : relation.effect > 0 ? 1 : -1;
}

export function matrixCellEffectText(relation: MatrixRelation) {
  return relation.outcomeUnit === "%" ? effectText(relation) : percentText(relation) ?? effectText(relation);
}

export function daysUntilFirstResult(relations: MatrixRelation[]) {
  const eligible = relations.filter((relation) => !relation.excluded);
  if (!eligible.length || eligible.some((relation) => relation.coefficient !== null)) return null;
  const remaining = Math.min(...eligible.map((relation) => relation.minimumDaysRemaining ?? 0));
  return remaining > 0 ? remaining : 0;
}

export type MatrixCellState = "collecting" | "no-signal" | "excluded" | null;

type MatrixCellRelation = Pick<MatrixRelation, "excluded" | "coefficient" | "minimumDaysRemaining"> & Partial<Pick<MatrixRelation, "sampleSize">>;

export function matrixCellState<T extends MatrixCellRelation>(relations: T[], displayed: T[]): MatrixCellState {
  if (displayed.length) return null;
  const eligible = relations.filter((relation) => !relation.excluded);
  if (!eligible.length) return "excluded";
  if (!eligible.some((relation) => relation.coefficient !== null)
    && eligible.some((relation) => (relation.minimumDaysRemaining ?? 0) > 0)) return "collecting";
  return "no-signal";
}

export function strongestEffectsEmptyState<T extends MatrixCellRelation>(relations: T[]): Exclude<MatrixCellState, null> {
  return relations.length ? matrixCellState(relations, []) ?? "no-signal" : "collecting";
}

function cellProgress(relations: MatrixRelation[]) {
  const eligible = relations.filter((relation) => !relation.excluded);
  const closest = [...eligible].sort((first, second) => (first.minimumDaysRemaining ?? 0) - (second.minimumDaysRemaining ?? 0))[0];
  if (!closest) return 0;
  const required = closest.sampleSize + (closest.minimumDaysRemaining ?? 0);
  return required ? Math.min(1, closest.sampleSize / required) : 0;
}

function MatrixStateMark({ state, progress = 0, labelled = false }: { state: Exclude<MatrixCellState, null>; progress?: number; labelled?: boolean }) {
  const labels = { collecting: "Données en cours de collecte", "no-signal": "Données suffisantes, pas de signal clair", excluded: "Non applicable" };
  return <span
    className={`matrix-state matrix-state--${state}`}
    aria-hidden={labelled ? undefined : true}
    aria-label={labelled ? labels[state] : undefined}
    role={labelled ? "img" : undefined}
    style={state === "collecting" ? { "--matrix-state-progress": `${Math.round(progress * 360)}deg` } as CSSProperties : undefined}
  />;
}

function matrixRelationTone(relation: MatrixRelation) {
  // In the matrix, colour communicates the mathematical sign only. It must not
  // silently turn a lower-is-better outcome (such as resting HR) into green.
  const value = relation.effect;
  if (value === null || value === 0) return "is-neutral";
  return value > 0 ? "is-positive" : "is-negative";
}

/** Matrix cells only expose delayed timing when it exists; same-day timing needs no badge. */
export function matrixTimingLabel(lagDays: number) {
  return lagDays > 0 ? `J+${lagDays}` : null;
}

function strongestTimingText(lagDays: number) {
  return lagDays > 0 ? `J+${lagDays}` : "J";
}

function strongestRowKey(relation: Pick<MatrixRelation, "period" | "predictorId" | "outcomeId" | "lagDays">) {
  return `${relation.period}:${relation.predictorId}:${relation.outcomeId}:${relation.lagDays}`;
}

/** Relation details must stay within the published relation set. */
export function publishedRelationsForPair<T extends Parameters<typeof isPersonalLabDisplayableRelation>[0]>(
  relations: T[],
  relation: Pick<MatrixRelation, "predictorId" | "outcomeId">,
  options: PersonalLabRelationDisplayOptions = {},
) {
  return relations.filter((candidate) => candidate.predictorId === relation.predictorId
    && candidate.outcomeId === relation.outcomeId
    && isPersonalLabDisplayableRelation(candidate, options));
}

export type InfluenceExplanation = {
  definition: string;
  calculation: string;
  source: "Google Health" | "Journal" | "Soma";
  sourceDetail: string;
};

const influenceExplanations: Record<string, Omit<InfluenceExplanation, "sourceDetail"> & { sourceDetail?: string }> = {
  bedtime: {
    definition: "Heure locale à laquelle commence l’épisode de sommeil.",
    calculation: "Soma convertit l’heure en minutes et utilise un contraste fixe de 30 minutes pour comparer les relations.",
    source: "Google Health",
    sourceDetail: "Enregistrée par ton appareil connecté puis importée via Google Health.",
  },
  wake_time: {
    definition: "Heure locale à laquelle se termine l’épisode de sommeil.",
    calculation: "Soma convertit l’heure en minutes et compare la plage personnelle observée sur les jours éligibles.",
    source: "Google Health",
    sourceDetail: "Enregistrée par ton appareil connecté puis importée via Google Health.",
  },
  sleep_regularity: {
    definition: "Degré de proximité entre les heures de coucher et de lever de cette nuit et ton rythme récent.",
    calculation: "Soma compare les deux heures à la moyenne circulaire des 13 dernières nuits enregistrées et exprime le résultat en pourcentage.",
    source: "Soma",
    sourceDetail: "Calculée par Soma à partir des épisodes de coucher et de lever importés via Google Health.",
  },
  sleep_debt: {
    definition: "Manque de sommeil cumulé sur la fenêtre récente.",
    calculation: "Soma additionne chaque écart entre le besoin estimé et le sommeil réel, en conservant uniquement les déficits positifs de la fenêtre récente.",
    source: "Soma",
    sourceDetail: "Calculée par Soma à partir de la durée du sommeil et du besoin estimé depuis les données Google Health.",
  },
  steps: {
    definition: "Nombre total de pas enregistrés pendant la journée.",
    calculation: "Le total quotidien est utilisé tel qu’il est reçu ; Soma ne le transforme pas en score séparé avant l’analyse des relations.",
    source: "Google Health",
    sourceDetail: "Collecté par ton appareil connecté puis importé via Google Health.",
  },
  zone_minutes: {
    definition: "Temps passé dans les zones d’activité cardiaque de l’appareil pendant la journée.",
    calculation: "Les minutes quotidiennes sont additionnées à partir des enregistrements de zones fournis par Google Health.",
    source: "Google Health",
    sourceDetail: "Collectées par ton appareil connecté puis importées via Google Health.",
  },
  intense_minutes: {
    definition: "Temps passé dans les zones cardiaques vigoureuse et maximale.",
    calculation: "Soma combine les minutes des zones vigoureuse et maximale en un indicateur quotidien.",
    source: "Soma",
    sourceDetail: "Calculées par Soma à partir des zones cardiaques importées via Google Health.",
  },
  active_minutes: {
    definition: "Temps total classé comme actif par l’appareil.",
    calculation: "Le total quotidien de minutes actives est utilisé tel qu’il est reçu dans l’analyse des relations.",
    source: "Google Health",
    sourceDetail: "Collecté par ton appareil connecté puis importé via Google Health.",
  },
  exercise_minutes: {
    definition: "Durée totale de l’exercice enregistré pendant la journée.",
    calculation: "Le total quotidien de minutes d’exercice est utilisé tel qu’il est reçu dans l’analyse des relations.",
    source: "Google Health",
    sourceDetail: "Collectée par ton appareil connecté puis importée via Google Health.",
  },
  sedentary_minutes: {
    definition: "Nombre de minutes passées en position sédentaire pendant la journée.",
    calculation: "Le total quotidien de minutes sédentaires est utilisé tel qu’il est reçu ; les jours absents restent absents.",
    source: "Google Health",
    sourceDetail: "Collectées par ton appareil connecté puis importées via Google Health.",
  },
  active_day: {
    definition: "Indique si la journée est considérée comme active : oui ou non.",
    calculation: "Soma considère une journée comme active à partir de 7 500 pas, 20 minutes en zone active ou 30 minutes actives ; il compare les journées actives et non actives.",
    source: "Soma",
    sourceDetail: "Calculée par Soma à partir des mesures d’activité quotidiennes importées via Google Health.",
  },
  running_distance: {
    definition: "Distance parcourue pendant les séances de course enregistrées.",
    calculation: "La distance de course du jour est utilisée en kilomètres ; les jours sans course enregistrée restent absents.",
    source: "Google Health",
    sourceDetail: "Collectée par ton appareil connecté puis importée via Google Health.",
  },
  running_pace: {
    definition: "Allure moyenne des séances de course enregistrées.",
    calculation: "Soma utilise l’allure de course du jour en secondes par kilomètre ; une valeur plus faible indique une allure plus rapide.",
    source: "Google Health",
    sourceDetail: "Collectée par ton appareil connecté puis importée via Google Health.",
  },
  running_average_heart_rate: {
    definition: "Fréquence cardiaque moyenne pendant les séances de course enregistrées.",
    calculation: "La moyenne de course du jour est utilisée en battements par minute et comparée à la plage personnelle observée.",
    source: "Google Health",
    sourceDetail: "Collectée par ton appareil connecté puis importée via Google Health.",
  },
  vo2_max: {
    definition: "Estimation de la quantité maximale d’oxygène que ton corps peut utiliser pendant l’exercice.",
    calculation: "L’estimation quotidienne de la VO₂ max est utilisée telle qu’elle est reçue dans l’analyse des relations.",
    source: "Google Health",
    sourceDetail: "Collectée par ton appareil connecté puis importée via Google Health.",
  },
  effort: {
    definition: "Estimation quotidienne par Soma de la charge d’activité réalisée.",
    calculation: "Soma combine les minutes de zone disponibles, les minutes d’exercice, l’énergie active et les pas avec des rendements décroissants, puis normalise le résultat sur 0–100.",
    source: "Soma",
    sourceDetail: "Calculée par Soma à partir des mesures d’activité disponibles importées via Google Health.",
  },
};

export function influenceExplanation(predictorId: string, label: string): InfluenceExplanation {
  const known = influenceExplanations[predictorId];
  if (known) return { ...known, sourceDetail: known.sourceDetail ?? `Fournie par ${known.source}.` };
  if (predictorId.startsWith("journal:")) {
    return {
      definition: `${label} est une mesure personnelle que tu enregistres dans le journal quotidien.`,
      calculation: "Soma utilise la valeur de chaque journée validée ; les mesures numériques utilisent un contraste personnel observé et les mesures oui/non comparent leurs groupes enregistrés.",
      source: "Journal",
      sourceDetail: "Enregistrée par toi dans le Journal. Les valeurs vides restent absentes et ne deviennent pas zéro.",
    };
  }
  return {
    definition: `${label} est une mesure quotidienne pouvant influencer les résultats sélectionnés.`,
    calculation: "Soma utilise la valeur quotidienne telle qu’elle est enregistrée et teste ses relations éligibles du même jour, du lendemain et de deux jours plus tard.",
    source: "Google Health",
    sourceDetail: "Collectée par ton appareil connecté puis importée via Google Health.",
  };
}

function InfluenceDetail({ explanation, label, onClose, detailRef }: { explanation: InfluenceExplanation; label: string; onClose: () => void; detailRef: RefObject<HTMLElement | null> }) {
  return <aside id="influence-detail" ref={detailRef} className="influence-detail" tabIndex={-1} aria-labelledby="influence-detail-title">
    <header>
      <div><span className="influence-detail__eyebrow">Influence</span><h3 id="influence-detail-title">{label}</h3></div>
      <button type="button" className="icon-button" aria-label={`Fermer l’explication de ${label}`} onClick={onClose}><X size={17} /></button>
    </header>
    <dl>
      <div><dt>Ce que la mesure suit</dt><dd>{explanation.definition}</dd></div>
      <div><dt>Comment elle est calculée</dt><dd>{explanation.calculation}</dd></div>
      <div><dt>Origine</dt><dd><strong>{explanation.source}</strong><span>{explanation.sourceDetail}</span></dd></div>
    </dl>
  </aside>;
}

function OutcomeDetail({ outcome, onClose, detailRef }: { outcome: PersonalLabSnapshot["matrix"]["outcomes"][number]; onClose: () => void; detailRef: RefObject<HTMLElement | null> }) {
  const explanation = outcomeExplanation(outcome.id, outcome.label);
  return <aside id="outcome-detail" ref={detailRef} className="influence-detail outcome-detail" tabIndex={-1} aria-labelledby="outcome-detail-title">
    <header>
      <div><span className="influence-detail__eyebrow">Résultat</span><h3 id="outcome-detail-title">{outcome.label}</h3></div>
      <button type="button" className="icon-button" aria-label={`Fermer l’explication de ${outcome.label}`} onClick={onClose}><X size={17} /></button>
    </header>
    <dl className="outcome-detail__definition"><div><dt>Ce que la mesure suit</dt><dd>{explanation}</dd></div></dl>
  </aside>;
}

const outcomeThemeById: Record<string, string> = {
  sleep_minutes: "Sommeil",
  sleep_efficiency: "Sommeil",
  sleep_latency: "Sommeil",
  sleep_awake: "Sommeil",
  sleep_awakenings: "Sommeil",
  sleep_fragmentation: "Sommeil",
  deep_sleep: "Sommeil",
  rem_sleep: "Sommeil",
  hrv: "Cardio et récupération",
  rhr: "Cardio et récupération",
  recovery: "Cardio et récupération",
  vo2_max: "Cardio et récupération",
  running_average_heart_rate: "Performance de course",
  running_pace: "Performance de course",
  respiratory: "Respiration et oxygène",
  spo2: "Respiration et oxygène",
};
const outcomeThemeOrder = ["Sommeil", "Cardio et récupération", "Performance de course", "Respiration et oxygène", "Autres"];

export function groupOutcomeThemes(outcomes: PersonalLabSnapshot["matrix"]["outcomes"]) {
  return outcomes.reduce<Array<{ label: string; count: number }>>((groups, outcome) => {
    const label = outcomeThemeById[outcome.id] ?? "Autres";
    const previous = groups.at(-1);
    if (previous?.label === label) previous.count += 1;
    else groups.push({ label, count: 1 });
    return groups;
  }, []);
}

/** Keep the proof readable during its short exit, but remove it from keyboard navigation. */
function MatrixMotionDetail({ open, children, inline = false }: { open: boolean; children: ReactNode; inline?: boolean }) {
  const present = useMotionPresence(open);
  const exitRef = useRef<HTMLElement | null>(null);
  const [retained, setRetained] = useState(children);
  useEffect(() => {
    if (open) {
      // Retain the last open content only for the bounded exit; no data is synthesized.
      setRetained(isValidElement(children) ? cloneElement(children as ReactElement<{ detailRef?: RefObject<HTMLElement | null>; panelId?: string }>, { detailRef: exitRef, panelId: undefined }) : children);
    }
  }, [open, children]);
  if (!present) return null;
  return <div className={`matrix-motion-detail${inline ? " soma-motion-disclosure" : ""}`} data-motion-open={open} data-state={open ? "open" : "closed"} inert={!open} aria-hidden={!open || undefined}>
    {inline ? <div className="soma-motion-disclosure__content">{open ? children : retained}</div> : open ? children : retained}
  </div>;
}

function StrongestEffects({ relations, outcomes, onSelect, selectedRelations = null, selectedSummaryRelation = null, deferredDetailState = null, onRetryDetail = () => {}, onRefreshDetail = () => {}, detailRef = null, onCloseSelection = () => {}, scrollReveal = false, periodControl = null, filterControl = null, requireTemporalStability = true, standalone = false }: {
  relations: StrongestEffectsRelation[];
  outcomes: PersonalLabSnapshot["matrix"]["outcomes"];
  onSelect: (relation: StrongestEffectsRelation, trigger: HTMLButtonElement) => void;
  selectedRelations?: MatrixRelation[] | null;
  selectedSummaryRelation?: StrongestEffectsRelation | null;
  deferredDetailState?: "loading" | "error" | "stale" | null;
  onRetryDetail?: () => void;
  onRefreshDetail?: () => void;
  detailRef?: RefObject<HTMLElement | null> | null;
  onCloseSelection?: () => void;
  scrollReveal?: boolean;
  periodControl?: ReactNode;
  filterControl?: ReactNode;
  requireTemporalStability?: boolean;
  standalone?: boolean;
}) {
  const meaningful = useMemo(() => selectMeaningfulRelations(relations, relations.length, { requireTemporalStability }), [relations, requireTemporalStability]);
  const emptyState = strongestEffectsEmptyState(relations);
  const meaningfulGroups = useMemo(() => {
    const groups = new Map<string, { group: string; predictorId: string; predictorLabel: string; relations: StrongestEffectsRelation[] }>();
    for (const relation of meaningful) {
      const key = `${relation.period}:${relation.predictorId}`;
      const current = groups.get(key) ?? {
        group: influenceGroup(relation.predictorId),
        predictorId: relation.predictorId,
        predictorLabel: localizedMetricLabel(relation.predictorId, relation.predictorLabel),
        relations: [],
      };
      current.relations.push(relation);
      groups.set(key, current);
    }
    const influences = [...groups.values()].sort((first, second) => {
      const byGroup = compareInfluenceGroups(first.group, second.group);
      if (byGroup !== 0) return byGroup;
      return meaningful.indexOf(first.relations[0]) - meaningful.indexOf(second.relations[0]);
    });
    const categories = new Map<string, typeof influences>();
    for (const influence of influences) categories.set(influence.group, [...(categories.get(influence.group) ?? []), influence]);
    return [...categories.entries()];
  }, [meaningful]);
  const sectionRef = useRef<HTMLElement | null>(null);
  const revealedOnce = useRef(false);
  const motionKey = `${relations[0]?.period ?? "empty"}:${requireTemporalStability}:${relations.length}`;
  useMotionUpdate(sectionRef, motionKey);
  const selectedRelation = selectedSummaryRelation ?? selectedRelations?.[0] ?? null;
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const isLocalObservatory = section.closest('.lab-experience.lab-continuous[data-continuous-theme="observatory"]') !== null;
    const shouldRevealRows = scrollReveal || isLocalObservatory;
    const rowElements = Array.from(section.querySelectorAll<HTMLLIElement>(".strongest-effects__row"));
    if (!rowElements.length) {
      delete section.dataset.motionReady;
      return;
    }

    if (revealedOnce.current) {
      delete section.dataset.motionReady;
      rowElements.forEach((node) => node.classList.add("is-visible"));
      return;
    }
    revealedOnce.current = true;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion || typeof IntersectionObserver === "undefined") {
      delete section.dataset.motionReady;
      rowElements.forEach((node) => node.classList.add("is-visible"));
      return;
    }

    if (shouldRevealRows) {
      section.dataset.motionReady = "true";
      rowElements.forEach((node) => node.classList.remove("is-visible"));
    } else {
      delete section.dataset.motionReady;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });

    rowElements.forEach((node) => observer.observe(node));

    return () => {
      observer.disconnect();
      delete section.dataset.motionReady;
    };
  }, [meaningful, scrollReveal]);

  return <section ref={sectionRef} className="strongest-effects" aria-labelledby="strongest-effects-title">
    <header>
      <div>
        {standalone ? <h2 id="strongest-effects-title">Strongest Effects</h2> : <h3 id="strongest-effects-title">Strongest Effects</h3>}
      </div>
      <div className="strongest-effects__controls">{filterControl}{periodControl}</div>
    </header>
    {!meaningful.length ? (
      <div className="strongest-effects__empty-maturity" role="status">
        <h4>{emptyState === "collecting" ? "Collecte en cours" : emptyState === "excluded" ? "Aucune comparaison applicable" : "Aucune association fiable"}</h4>
        <p>{emptyState === "collecting" ? "Soma attend assez de jours comparables pour calculer les associations." : emptyState === "excluded" ? "Les mesures disponibles ne permettent pas de comparer ces facteurs sur cette période." : "Les données calculables n’ont pas montré de relation assez solide avec le filtre actuel."}</p>
      </div>
    ) : meaningfulGroups.map(([group, influences]) => {
      const groupId = group.replaceAll(" ", "-").toLowerCase();
      return <section className="strongest-effects__group" aria-labelledby={`strongest-${groupId}`} key={group}>
      <h4 id={`strongest-${groupId}`}>{group}</h4>
      {influences.map((influence) => {
        const comparisonGroups = groupRelationsByComparison(influence.relations);
        const singleComparison = comparisonGroups.length === 1;
        const singleResult = singleComparison && comparisonGroups[0].relations.length === 1;
        return <article className={`strongest-effects__influence${singleComparison ? " is-single-comparison" : ""}${singleResult ? " is-single-result" : ""}`} key={`${influence.group}:${influence.predictorId}`}>
        <header className="strongest-effects__influence-header">
          <strong>{influence.predictorLabel}</strong>
        </header>
        {comparisonGroups.map((comparisonGroup) => <section className="strongest-effects__comparison-group" key={comparisonGroup.comparisonLabel}>
        <header className="strongest-effects__comparison-header"><strong>{formatComparisonLabel(comparisonGroup.comparisonLabel)}</strong></header>
        <ol>{comparisonGroup.relations.map((relation) => {
        const index = meaningful.indexOf(relation);
        const direction = outcomes.find((outcome) => outcome.id === relation.outcomeId)?.direction ?? "target";
        const sign = effectDirection(relation, direction);
        const point = Math.max(-1, Math.min(1, sign * relation.practicalRatio / 4));
        const standardizedEffect = Math.sign(relation.effect ?? 0) * relation.practicalRatio * .2;
        const uncertainty = PRACTICAL_EFFECT_THRESHOLDS[relation.outcomeId] === undefined
          ? Math.max(Math.abs(standardizedEffect - relation.confidenceLow), Math.abs(relation.confidenceHigh - standardizedEffect)) / .2 / 4
          : relation.effectConfidenceLow === null || relation.effectConfidenceHigh === null || relation.effect === null
            ? 0
            : Math.max(Math.abs(relation.effect - relation.effectConfidenceLow), Math.abs(relation.effectConfidenceHigh - relation.effect)) / relation.practicalThreshold / 4;
        const low = Math.max(-1, point - uncertainty);
        const high = Math.min(1, point + uncertainty);
        const rowKey = strongestRowKey(relation);
        const selectedForRow = selectedRelation !== null && strongestRowKey(selectedRelation) === rowKey;
        const intervalOrigin = low >= 0 ? "left" : high <= 0 ? "right" : "center";
        const rowDelay = Math.min(index, 4) * 40;
        const rowStyle = { "--matrix-row-delay": `${rowDelay}ms` } as CSSProperties;
        const intervalStyle = {
          left: `${50 + low * 46}%`,
          width: `${Math.max(1, (high - low) * 46)}%`,
          "--matrix-interval-origin": intervalOrigin,
        } as CSSProperties;
        const predictorLabel = localizedMetricLabel(relation.predictorId, relation.predictorLabel);
        const outcomeLabel = localizedMetricLabel(relation.outcomeId, relation.outcomeLabel);
        const relationLabel = `${predictorLabel} (${formatComparisonLabel(relation.comparisonLabel)}) → ${outcomeLabel}: ${effectText(relation)}${percentText(relation) ? ` (${percentText(relation)})` : ""}, ${strongestTimingText(relation.lagDays)}, période ${periodDisplayLabel(relation.period)}, échantillon de ${relation.sampleSize} jours, ${strongestUncertaintyLabel(relation)}`;
        return <li
          className={`strongest-effects__row${selectedForRow ? " is-selected" : ""}`}
          data-matrix-effect-key={rowKey}
          key={rowKey}
          style={rowStyle}
        >
          <button type="button" onClick={(event) => onSelect(relation, event.currentTarget)} aria-expanded={selectedForRow} aria-controls={selectedForRow ? "relation-detail-panel" : undefined} aria-label={`Ouvrir la relation : ${relationLabel}`}>
            <span className={`strongest-effects__plot ${sign > 0 ? "is-positive" : sign < 0 ? "is-negative" : "is-neutral"}`} aria-hidden="true">
              <i className="strongest-effects__zero" />
              <i className="strongest-effects__interval" style={intervalStyle} />
              <i className="strongest-effects__point" style={{ left: `${50 + point * 46}%` }} />
            </span>
            <span className={`strongest-effects__outcome ${sign > 0 ? "is-positive" : sign < 0 ? "is-negative" : "is-neutral"}`}><strong>{outcomeLabel}</strong><small><b>{effectText(relation)}</b>{percentText(relation) && <span> ({percentText(relation)})</span>}<em>{strongestTimingText(relation.lagDays)}</em></small></span>
          </button>
          <MatrixMotionDetail inline open={Boolean(selectedForRow && detailRef && (selectedRelations || selectedSummaryRelation))}>
          {selectedForRow && detailRef && (selectedRelations
            ? <RelationDetail relations={selectedRelations} direction={direction} onClose={onCloseSelection} detailRef={detailRef} variant="inline" panelId="relation-detail-panel" />
            : selectedSummaryRelation && <DeferredRelationDetail relation={relation} state={deferredDetailState ?? "loading"} onClose={onCloseSelection} onRetry={onRetryDetail} onRefresh={onRefreshDetail} detailRef={detailRef} panelId="relation-detail-panel" />)}
          </MatrixMotionDetail>
        </li>;
      })}</ol>
        </section>)}
      </article>;
      })}
    </section>;
    })}
  </section>;
}

const strongestEffectPeriods: AnalysisPeriod[] = [15, 30, 90, "all"];

type StrongestEffectsSelection = {
  relation: StrongestEffectsRelation;
  relations: MatrixRelation[] | null;
  state: "loading" | "loaded" | "error" | "stale";
};

type StrongestEffectsPeriodData = Pick<StrongestEffectsResponse, "rows" | "outcomes" | "generation">;

function EffectsSummary({ relations }: { relations: StrongestEffectsRelation[] }) {
  const entries = relations.slice(0, 3);
  return <section className="effects-summary" aria-label="Résumé des associations">
    {entries.length ? <ol>{entries.map((relation) => <li key={summaryRelationKey(relation)}>
      <span className="effects-summary__arrow" aria-hidden="true">→</span>
      <p><strong>{localizedMetricLabel(relation.predictorId, relation.predictorLabel)}</strong> <span>({formatComparisonLabel(relation.comparisonLabel)})</span> → <strong>{localizedMetricLabel(relation.outcomeId, relation.outcomeLabel)}</strong> <b>{effectText(relation)}</b> <small>{strongestTimingText(relation.lagDays)}</small></p>
    </li>)}</ol> : <p className="effects-summary__empty">Aucune relation assez solide pour un récapitulatif sur cette période.</p>}
  </section>;
}

function DeferredRelationDetail({ relation, state, onClose, onRetry, onRefresh, detailRef, panelId }: {
  relation: StrongestEffectsRelation;
  state: "loading" | "error" | "stale";
  onClose: () => void;
  onRetry: () => void;
  onRefresh: () => void;
  detailRef: RefObject<HTMLElement | null>;
  panelId?: string;
}) {
  const titleId = useId();
  const predictorLabel = localizedMetricLabel(relation.predictorId, relation.predictorLabel);
  const outcomeLabel = localizedMetricLabel(relation.outcomeId, relation.outcomeLabel);
  return <aside id={panelId} ref={detailRef} className="relation-detail relation-detail--inline" tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby={titleId} aria-busy={state === "loading"}>
    <header>
      <div><h3 id={titleId}>{predictorLabel} → {outcomeLabel}</h3></div>
      <button type="button" className="icon-button" aria-label="Fermer le détail de la relation" onClick={onClose}><X size={17} /></button>
    </header>
    <div className="relation-detail__body">
      {state === "loading"
        ? <p className="relation-detail__finding" role="status">Chargement du détail…</p>
        : state === "stale"
          ? <p className="relation-detail__finding" role="alert">Les données ont changé depuis l’affichage de cette relation. <button type="button" className="text-link" onClick={onRefresh}>Recharger cette période</button></p>
          : <p className="relation-detail__finding" role="alert">Le détail n’a pas pu être chargé. <button type="button" className="text-link" onClick={onRetry}>Réessayer</button></p>}
    </div>
  </aside>;
}

export function StrongestEffectsPanel({ showSummary = false }: { showSummary?: boolean } = {}) {
  const [period, setPeriod] = useState<AnalysisPeriod>(90);
  const [dataByPeriod, setDataByPeriod] = useState<Partial<Record<AnalysisPeriod, StrongestEffectsPeriodData>>>({});
  const dataByPeriodRef = useRef(dataByPeriod);
  const [loadingPeriod, setLoadingPeriod] = useState<AnalysisPeriod | null>(90);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<StrongestEffectsSelection | null>(null);
  const requestedPeriod = useRef<AnalysisPeriod>(90);
  const relationDetailRef = useRef<HTMLElement | null>(null);
  const relationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const periodRequestRef = useRef(new LatestRequest());
  const detailRequestRef = useRef(new LatestRequest());
  const { requireTemporalStability, setRequireTemporalStability } = useTemporalStabilityPreference();

  const loadPeriod = useCallback(async (nextPeriod: AnalysisPeriod, force = false) => {
    if (!force && dataByPeriodRef.current[nextPeriod]) {
      periodRequestRef.current.cancel();
      setLoadError(false);
      setLoadingPeriod(null);
      return true;
    }
    const request = periodRequestRef.current.start();
    setLoadingPeriod(nextPeriod);
    setLoadError(false);
    try {
      const response = await fetch(`/api/lab/matrix?period=${nextPeriod}&format=compact`, { cache: "no-store", signal: request.signal });
      const result = await response.json().catch(() => ({})) as Partial<StrongestEffectsResponse>;
      if (!response.ok || !Array.isArray(result.rows) || !Array.isArray(result.outcomes) || typeof result.generation !== "string") throw new Error("Matrix request failed");
      if (!request.isCurrent()) return false;
      const data = { rows: result.rows, outcomes: result.outcomes, generation: result.generation };
      const nextDataByPeriod = { ...dataByPeriodRef.current, [nextPeriod]: data };
      dataByPeriodRef.current = nextDataByPeriod;
      setDataByPeriod(nextDataByPeriod);
      return true;
    } catch {
      if (request.isCurrent()) setLoadError(true);
      return false;
    } finally {
      if (request.isCurrent()) setLoadingPeriod(null);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadPeriod(90), 0);
    return () => window.clearTimeout(timeout);
  }, [loadPeriod]);

  useEffect(() => () => {
    periodRequestRef.current.cancel();
    detailRequestRef.current.cancel();
  }, []);

  useEffect(() => {
    if (!selected) return;
    window.requestAnimationFrame(() => {
      relationDetailRef.current?.focus({ preventScroll: true });
    });
  }, [selected]);

  function selectPeriod(nextPeriod: AnalysisPeriod, force = false) {
    requestedPeriod.current = nextPeriod;
    detailRequestRef.current.cancel();
    setSelected(null);
    setLoadError(false);
    void loadPeriod(nextPeriod, force).then((loaded) => { if (loaded && requestedPeriod.current === nextPeriod) setPeriod(nextPeriod); });
  }

  function toggleTemporalStability(next: boolean) {
    setRequireTemporalStability(next);
    detailRequestRef.current.cancel();
    setSelected(null);
  }

  async function openRelation(relation: StrongestEffectsRelation, trigger?: HTMLButtonElement | null) {
    if (trigger) relationTriggerRef.current = trigger;
    const generation = dataByPeriodRef.current[period]?.generation;
    const request = detailRequestRef.current.start();
    setSelected({ relation, relations: null, state: "loading" });
    if (!generation) {
      if (request.isCurrent()) setSelected({ relation, relations: null, state: "error" });
      return;
    }
    const params = new URLSearchParams({
      period: String(period),
      generation,
      relationKey: summaryRelationKey(relation),
      requireTemporalStability: String(requireTemporalStability),
    });
    try {
      const response = await fetch(`/api/lab/matrix/detail?${params}`, { cache: "no-store", signal: request.signal });
      if (response.status === 409) {
        if (request.isCurrent()) setSelected({ relation, relations: null, state: "stale" });
        return;
      }
      const result = await response.json().catch(() => ({})) as { generation?: unknown; relations?: unknown };
      if (!response.ok || result.generation !== generation || !Array.isArray(result.relations)) throw new Error("Relation detail request failed");
      if (!request.isCurrent()) return;
      const relations = result.relations as MatrixRelation[];
      const primary = relations.find((candidate) => summaryRelationKey(candidate) === summaryRelationKey(relation));
      if (!primary) throw new Error("Relation detail did not match the selected effect");
      setSelected({ relation, relations: [primary, ...relations.filter((candidate) => candidate !== primary)], state: "loaded" });
    } catch {
      if (request.isCurrent()) setSelected({ relation, relations: null, state: "error" });
    }
  }

  function retrySelectedDetail() {
    if (selected) void openRelation(selected.relation);
  }

  function refreshSelectedDetail() {
    selectPeriod(period, true);
  }

  function closeSelectedRelation() {
    const trigger = relationTriggerRef.current;
    detailRequestRef.current.cancel();
    setSelected(null);
    window.requestAnimationFrame(() => trigger?.focus({ preventScroll: true }));
  }

  const periodData = dataByPeriod[period];
  const rows = periodData?.rows ?? [];
  const outcomes = periodData?.outcomes ?? [];
  const relations = rows.flatMap((row) => row.relations);
  const summaryRelations = showSummary ? selectSummaryRelations(relations, { requireTemporalStability }) : [];
  const periodControl = <div className="strongest-effects__periods" role="group" aria-label="Période d’analyse">
    {strongestEffectPeriods.map((value) => <button type="button" aria-label={`Afficher les relations sur ${value === "all" ? "toute la période" : `${value} jours`}`} aria-pressed={period === value} disabled={loadingPeriod !== null} onClick={() => selectPeriod(value)} key={value}>{periodDisplayLabel(value)}</button>)}
  </div>;
  const filterControl = <label className="temporal-stability-toggle">
    <input
      type="checkbox"
      checked={requireTemporalStability}
      onChange={(event) => toggleTemporalStability(event.target.checked)}
    />
    <span className="temporal-stability-toggle__copy">
      <span>Stabilité dans le temps</span>
    </span>
  </label>;

  if (loadError && !periodData) return <div className="strongest-effects-panel lab-entry__section" aria-busy="false">
    <section className="strongest-effects" aria-labelledby="strongest-effects-loading-title">
      <header>
        <div><h2 id="strongest-effects-loading-title">Strongest Effects</h2></div>
        <div className="strongest-effects__controls">{filterControl}{periodControl}</div>
      </header>
      <p className="strongest-effects-panel__state" role="alert">Les relations n’ont pas pu être chargées. <button type="button" className="text-link" onClick={() => selectPeriod(requestedPeriod.current, true)}>Réessayer</button></p>
    </section>
  </div>;

  if (!outcomes.length) return <StrongestEffectsLoading
    showSummary={showSummary}
    filterControl={filterControl}
    periodControl={periodControl}
  />;

  return <div className="strongest-effects-panel lab-entry__section matrix-results-ready" aria-busy={loadingPeriod !== null}>
    {showSummary && <EffectsSummary relations={summaryRelations} />}
    <StrongestEffects
      relations={relations}
      outcomes={outcomes}
      onSelect={(relation, trigger) => void openRelation(relation, trigger)}
      selectedRelations={selected?.relations ?? null}
      selectedSummaryRelation={selected?.relation ?? null}
      deferredDetailState={selected && !selected.relations ? selected.state === "loaded" ? "loading" : selected.state : null}
      onRetryDetail={retrySelectedDetail}
      onRefreshDetail={refreshSelectedDetail}
      detailRef={relationDetailRef}
      onCloseSelection={closeSelectedRelation}
      scrollReveal
      periodControl={periodControl}
      filterControl={filterControl}
      requireTemporalStability={requireTemporalStability}
      standalone
    />
    {loadingPeriod !== null && <p className="strongest-effects-panel__state" role="status">Chargement des relations sur {loadingPeriod === "all" ? "toute la période" : `${loadingPeriod} jours`}…</p>}
    {loadError && <p className="strongest-effects-panel__state" role="alert">Les relations n’ont pas pu être chargées. <button type="button" className="text-link" onClick={() => selectPeriod(requestedPeriod.current, true)}>Réessayer</button></p>}
  </div>;
}

export function MatrixDisclosure({ matrix }: { matrix: PersonalLabSnapshot["matrix"] }) {
  return <details className="matrix-disclosure">
    <summary>Afficher la matrice de relations</summary>
    <CorrelationMatrix matrix={matrix} />
  </details>;
}

export function CorrelationMatrix({ matrix }: { matrix: PersonalLabSnapshot["matrix"] }) {
  const initialPeriod = defaultAnalysisPeriod(matrix.periods);
  const [period, setPeriod] = useState<AnalysisPeriod>(initialPeriod);
  const [rowsByPeriod, setRowsByPeriod] = useState<Partial<Record<AnalysisPeriod, PersonalLabSnapshot["matrix"]["rows"]>>>(() => ({ [initialPeriod]: matrix.rows }));
  const [loadingPeriod, setLoadingPeriod] = useState<AnalysisPeriod | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showNonSignificant, setShowNonSignificant] = useState(false);
  const [selected, setSelected] = useState<MatrixRelation[] | null>(null);
  const [selectedInfluence, setSelectedInfluence] = useState<{ id: string; label: string } | null>(null);
  const [selectedOutcome, setSelectedOutcome] = useState<PersonalLabSnapshot["matrix"]["outcomes"][number] | null>(null);
  const matrixResultsRef = useRef<HTMLDivElement | null>(null);
  const mobileResultsRef = useRef<HTMLDivElement | null>(null);
  useMotionUpdate(matrixResultsRef, `${period}:${showNonSignificant}:${loadingPeriod}`);
  useMotionUpdate(mobileResultsRef, `${period}:${showNonSignificant}:${loadingPeriod}`);
  const relationDetailRef = useRef<HTMLElement | null>(null);
  const influenceDetailRef = useRef<HTMLElement | null>(null);
  const outcomeDetailRef = useRef<HTMLElement | null>(null);
  const outcomes = useMemo(() => [...matrix.outcomes].sort((left, right) => {
    const leftTheme = outcomeThemeById[left.id] ?? "Autres";
    const rightTheme = outcomeThemeById[right.id] ?? "Autres";
    return outcomeThemeOrder.indexOf(leftTheme) - outcomeThemeOrder.indexOf(rightTheme);
  }), [matrix.outcomes]);
  const visibleOutcomes = useMemo(() => outcomes.map((outcome) => ({
    ...outcome,
    label: localizedMetricLabel(outcome.id, outcome.label),
    unit: localizedMetricUnit(outcome.unit),
  })), [outcomes]);
  const outcomeThemes = useMemo(() => groupOutcomeThemes(outcomes), [outcomes]);
  const periodRows = useMemo(() => (rowsByPeriod[period] ?? []).filter((row) => row.period === period), [rowsByPeriod, period]);
  const rows = useMemo(() => groupMatrixRows(periodRows, outcomes.map((outcome) => outcome.id)).map((row) => ({
    ...row,
    label: localizedMetricLabel(row.id, row.label),
  })), [outcomes, periodRows]);

  const loadPeriod = useCallback(async (nextPeriod: AnalysisPeriod) => {
    const cached = rowsByPeriod[nextPeriod];
    if (cached) return cached;
    setLoadingPeriod(nextPeriod);
    try {
      const response = await fetch(`/api/lab/matrix?period=${nextPeriod}`);
      if (!response.ok) throw new Error("Matrix request failed");
      const result = await response.json() as { rows: PersonalLabSnapshot["matrix"]["rows"] };
      setRowsByPeriod((current) => ({ ...current, [nextPeriod]: result.rows }));
      return result.rows;
    } catch {
      setLoadError(true);
      return [];
    } finally {
      setLoadingPeriod(null);
    }
  }, [rowsByPeriod]);

  async function selectPeriod(nextPeriod: AnalysisPeriod) {
    setPeriod(nextPeriod);
    setSelected(null);
    setSelectedInfluence(null);
    setSelectedOutcome(null);
    setLoadError(false);
    await loadPeriod(nextPeriod);
  }

  useEffect(() => {
    if (!selected) return;
    window.requestAnimationFrame(() => {
      relationDetailRef.current?.focus();
      scrollToMatrixElement(relationDetailRef.current);
    });
  }, [selected]);

  useEffect(() => {
    if (!selectedInfluence) return;
    window.requestAnimationFrame(() => {
      influenceDetailRef.current?.focus();
      scrollToMatrixElement(influenceDetailRef.current);
    });
  }, [selectedInfluence]);

  useEffect(() => {
    if (!selectedOutcome) return;
    window.requestAnimationFrame(() => {
      outcomeDetailRef.current?.focus();
      scrollToMatrixElement(outcomeDetailRef.current);
    });
  }, [selectedOutcome]);

  function selectInfluence(row: { id: string; label: string }) {
    setSelected(null);
    setSelectedOutcome(null);
    setSelectedInfluence((current) => current?.id === row.id ? null : row);
  }

  const resultsStatus = loadingPeriod === period
    ? <p className="matrix-no-results" role="status">Chargement des relations…</p>
    : loadError
      ? <p className="matrix-no-results" role="alert">Les relations n’ont pas pu être chargées. Sélectionne la période pour réessayer.</p>
      : !rows.length
        ? <p className="matrix-no-results">{showNonSignificant ? "Aucune relation calculable sur cette période." : "Aucune relation fiable et suffisamment marquée sur cette période."}</p>
        : null;

  return <section id="relations" className="matrix-section" aria-labelledby="matrix-title">
    <header className="matrix-header">
      <div><h2 id="matrix-title">Matrice des relations</h2></div>
      <div className="matrix-controls">
        <div
          className="matrix-periods"
          role="group"
          aria-label="Période d’analyse"
          style={{ "--matrix-period-index": Math.max(0, matrix.periods.indexOf(period)), "--matrix-period-count": Math.max(1, matrix.periods.length) } as CSSProperties}
        >
          {matrix.periods.map((value) => <button type="button" aria-pressed={period === value} disabled={loadingPeriod !== null} onClick={() => void selectPeriod(value)} key={value}>{periodLabel(value)}</button>)}
        </div>
        <div className="matrix-state-controls">
          <div className="matrix-legend" aria-label="États des cellules">
            <span><MatrixStateMark state="collecting" progress={.58} /><small>Collecte</small></span>
            <span><MatrixStateMark state="no-signal" /><small>Pas de signal clair</small></span>
            <span><MatrixStateMark state="excluded" /><small>Non applicable</small></span>
          </div>
          <label className="matrix-toggle"><input type="checkbox" checked={showNonSignificant} onChange={(event) => setShowNonSignificant(event.target.checked)} /><span><Check size={12} /><span className="matrix-toggle__label">Afficher les relations non significatives</span><span className="matrix-toggle__label matrix-toggle__label--mobile">Non significatives</span></span></label>
        </div>
      </div>
    </header>
    <StrongestEffects relations={periodRows.flatMap((row) => row.relations)} outcomes={outcomes} onSelect={(relation) => { setSelectedInfluence(null); setSelectedOutcome(null); setSelected(publishedRelationsForPair(periodRows.flatMap((row) => row.relations), relation)); }} />
    <MatrixMotionDetail open={Boolean(selected?.length)}>{selected?.length && <RelationDetail relations={selected} direction={outcomes.find((outcome) => outcome.id === selected[0].outcomeId)?.direction ?? "target"} onClose={() => setSelected(null)} detailRef={relationDetailRef} />}</MatrixMotionDetail>
    <MatrixMotionDetail open={Boolean(selectedInfluence)}>{selectedInfluence && <InfluenceDetail explanation={influenceExplanation(selectedInfluence.id, selectedInfluence.label)} label={selectedInfluence.label} onClose={() => setSelectedInfluence(null)} detailRef={influenceDetailRef} />}</MatrixMotionDetail>
    <MatrixMotionDetail open={Boolean(selectedOutcome)}>{selectedOutcome && <OutcomeDetail outcome={selectedOutcome} onClose={() => setSelectedOutcome(null)} detailRef={outcomeDetailRef} />}</MatrixMotionDetail>
    <div ref={matrixResultsRef} className="matrix-scroll" role="region" aria-label="Matrice des relations défilable" tabIndex={0}>
      <table>
        <thead>
          <tr className="matrix-theme-row"><th scope="col" rowSpan={2}>Influence</th>{outcomeThemes.map((theme, index) => <th scope="colgroup" colSpan={theme.count} key={`${theme.label}-${index}`}>{theme.label}</th>)}</tr>
          <tr className="matrix-outcome-row">{visibleOutcomes.map((outcome) => <th scope="col" key={outcome.id}><button type="button" className="matrix-outcome-trigger" aria-expanded={selectedOutcome?.id === outcome.id} aria-controls={selectedOutcome?.id === outcome.id ? "outcome-detail" : undefined} onClick={() => { setSelected(null); setSelectedInfluence(null); setSelectedOutcome((current) => current?.id === outcome.id ? null : outcome); }}><span>{outcome.label}</span><small>{outcome.unit}</small></button></th>)}</tr>
        </thead>
        <tbody>{rows.map((row, rowIndex) => <Fragment key={row.id}>{(rowIndex === 0 || rows[rowIndex - 1].group !== row.group) && <tr className="matrix-group-row"><th colSpan={outcomes.length + 1}>{row.group}</th></tr>}<tr><th scope="row"><button type="button" className="matrix-influence-trigger" aria-expanded={selectedInfluence?.id === row.id} aria-controls={selectedInfluence?.id === row.id ? "influence-detail" : undefined} onClick={() => selectInfluence(row)}><strong>{row.emoji && <span aria-hidden="true">{row.emoji}</span>}{row.label}</strong></button></th>{row.relationsByOutcome.map((relations, index) => {
          const calculable = calculableRelations(relations);
          const significant = significantRelations(relations);
          const displayed = showNonSignificant ? calculable : significant;
          const outcome = visibleOutcomes[index];
          const tones = new Set(significant.map(matrixRelationTone));
          const tone = !significant.length ? "is-non-significant" : tones.size === 1 ? [...tones][0] : "is-mixed";
          const state = matrixCellState(relations, displayed);
          return <td className={`${tone}${state ? ` has-state has-state--${state}` : ""}`} key={outcome.id}>
            {!displayed.length && state ? <span className="matrix-empty"><MatrixStateMark state={state} progress={cellProgress(relations)} labelled /><span className="sr-only"> pour {row.label} et {outcome.label}</span></span> : <button type="button" onClick={() => { setSelectedInfluence(null); setSelectedOutcome(null); setSelected(displayed); }} aria-label={`Ouvrir le détail de ${row.label} et ${outcome.label}`}>
              {displayed.map((relation) => <span className={`matrix-effect-line ${matrixRelationTone(relation)}`} key={relation.lagDays}><strong>{matrixCellEffectText(relation)}</strong>{matrixTimingLabel(relation.lagDays) && <small>{matrixTimingLabel(relation.lagDays)}</small>}</span>)}
            </button>}
          </td>;
        })}</tr></Fragment>)}</tbody>
      </table>
    </div>
    <div ref={mobileResultsRef} className="matrix-mobile-list" role="region" aria-label="Liste des relations par influence">
      {rows.map((row, rowIndex) => {
        const displayedCount = row.relationsByOutcome.reduce((count, relations) => count + (showNonSignificant ? calculableRelations(relations) : significantRelations(relations)).length, 0);
        const mobileOutcomes = row.relationsByOutcome.map((relations, index) => ({
          relations,
          outcome: outcomes[index],
          displayed: showNonSignificant ? calculableRelations(relations) : significantRelations(relations),
          priority: significantRelations(relations).length > 0 ? 2 : showNonSignificant && calculableRelations(relations).length > 0 ? 1 : 0,
        })).sort((left, right) => right.priority - left.priority);
        return <Fragment key={row.id}>
          {(rowIndex === 0 || rows[rowIndex - 1].group !== row.group) && <h3>{row.group}</h3>}
          <details className={displayedCount === 0 ? "is-empty" : undefined}>
            <summary>
              <span><strong>{row.emoji && <span aria-hidden="true">{row.emoji}</span>}{row.label}</strong><small>{displayedCount > 0 ? `${displayedCount} ${displayedCount === 1 ? "résultat" : "résultats"}` : "Aucun résultat clair"}</small></span>
            </summary>
            <div className="matrix-mobile-list__outcomes">
              {mobileOutcomes.map(({ relations, outcome, displayed }) => {
                const state = matrixCellState(relations, displayed);
                return displayed.length > 0
                  ? <button type="button" className="matrix-mobile-result" onClick={() => { setSelectedInfluence(null); setSelectedOutcome(null); setSelected(displayed); }} aria-label={`Ouvrir le détail de ${row.label} et ${outcome.label}`} key={outcome.id}>
                    <span><strong>{outcome.label}</strong><small>{outcome.unit}</small></span>
                    <span className="matrix-mobile-result__effects">{displayed.map((relation) => <span className={matrixRelationTone(relation)} key={relation.lagDays}><strong>{matrixCellEffectText(relation)}</strong>{matrixTimingLabel(relation.lagDays) && <small>{matrixTimingLabel(relation.lagDays)}</small>}</span>)}</span>
                  </button>
                  : <div className="matrix-mobile-result matrix-mobile-result--state" key={outcome.id}>
                    <span><strong>{outcome.label}</strong><small>{outcome.unit}</small></span>
                    <span>{state ? <MatrixStateMark state={state} progress={cellProgress(relations)} labelled /> : <small>Aucune donnée</small>}</span>
                  </div>;
              })}
              <button type="button" className="matrix-mobile-list__info" onClick={() => selectInfluence(row)}>À propos de {row.label}</button>
            </div>
          </details>
        </Fragment>;
      })}
    </div>
    {resultsStatus}
    <details className="matrix-method"><summary>Méthode</summary><p>Chaque variable apparaît une fois. Les cellules regroupent les résultats du même jour, du lendemain et de deux jours plus tard lorsque ces décalages sont possibles. Un comportement de la journée n’est jamais associé à un résultat nocturne qui s’est produit auparavant. Les valeurs vides sont omises paire par paire. Les comparaisons binaires et d’exposition nécessitent au moins cinq jours dans chaque groupe ; les mesures continues nécessitent dix jours appariés. À partir de 30 jours appariés, chaque relation numérique teste aussi un seuil, un plateau et une zone médiane par rapport à une droite, en conservant une forme non linéaire uniquement si elle améliore sensiblement l’ajustement. Les quantités utilisent chaque journée enregistrée, y compris les journées à zéro explicite. Les valeurs p bilatérales utilisent des intervalles robustes à la dépendance sérielle, puis une correction de Benjamini–Hochberg. Les effets mis en avant doivent aussi aller dans la même direction dans au moins deux des quatre blocs chronologiques ; les autres blocs peuvent être neutres ou opposés. Le tableau par défaut conserve uniquement les relations fiables et suffisamment marquées.</p></details>
  </section>;
}
