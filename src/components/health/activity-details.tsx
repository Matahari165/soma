import { Footprints } from "lucide-react";

import { calculateSignalFreshness } from "@/domain/health/freshness";
import { activityRegularity, completedActivityDays } from "@/domain/metrics/wellness";
import { calculateEffortScoreFromAvailable, diminishingLoad, effortScoreTargets, type EffortScoreTargets } from "@/domain/scores/effort";
import type { HealthAnalytics, HealthMetricDay, ScoreDay } from "@/services/health-analytics";

import { ActivityScoreOverview, type ActivityScoreBreakdown } from "./activity-score-overview";
import { ActivityBenchmarks } from "./activity-benchmarks";
import { ActivityHistory } from "./activity-history";
import type { ActivityRadarDimension } from "./activity-radar";
import { HealthPageShell } from "./health-page-shell";
import { HealthScrollReveal } from "./health-scroll-reveal";
import { averageLast30Measured, formatAverage, healthSourceLabel, latestSourceMeasuredAt, metricTone } from "./health-metric-utils";
import { MetricTrendCard } from "./metric-trend-card";
import { RefreshActiveHealthPage } from "./refresh-active-health-page";
import styles from "./activity-redesign.module.css";

type EffortComponentId = "zoneMinutes" | "exerciseMinutes" | "activeEnergyKcal" | "steps";
type NumericHealthMetricKey = {
  [Key in keyof HealthMetricDay]-?: NonNullable<HealthMetricDay[Key]> extends number ? Key : never
}[keyof HealthMetricDay];
type EffortComponentDefinition = { id: EffortComponentId; label: string; target: number; targetLabel: string; weight: number; unit: string; key: NumericHealthMetricKey; formula: string };

type EffortTargetSource = "nutrition_targets" | "fallback";

export function effortComponentDefinitions(targets: EffortScoreTargets, targetSource: EffortTargetSource): readonly EffortComponentDefinition[] {
  return [
    { id: "zoneMinutes", label: "Zone minutes", target: targets.zoneMinutes, targetLabel: `${targets.zoneMinutes} min`, weight: 50, unit: "min", key: "zone_minutes", formula: `diminishing returns · baseline ${targets.zoneMinutes} min` },
    { id: "exerciseMinutes", label: "Exercise duration", target: targets.exerciseMinutes, targetLabel: `${targets.exerciseMinutes} min`, weight: 25, unit: "min", key: "exercise_minutes", formula: `diminishing returns · baseline ${targets.exerciseMinutes} min` },
    { id: "activeEnergyKcal", label: "Active calories", target: targets.activeEnergyKcal, targetLabel: `${targets.activeEnergyKcal.toLocaleString("en-US")} kcal`, weight: 15, unit: "kcal", key: "active_energy_kcal", formula: targetSource === "nutrition_targets" ? "diminishing returns · app calorie target" : `diminishing returns · default target ${targets.activeEnergyKcal.toLocaleString("en-US")} kcal (no target set)` },
    { id: "steps", label: "Steps", target: targets.steps, targetLabel: `${targets.steps.toLocaleString("en-US")} steps`, weight: 10, unit: "steps", key: "steps", formula: `diminishing returns · baseline ${targets.steps.toLocaleString("en-US")} steps` },
  ];
}

function measured(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function points(days: HealthMetricDay[], key: keyof HealthMetricDay) { return days.map((day) => { const value = day[key]; return { date: day.metric_date, value: typeof value === "number" && Number.isFinite(value) ? value : null }; }); }
function number(value: number | null, unit?: string) { return !measured(value) ? "—" : `${Math.round(value).toLocaleString("en-US")}${unit ? ` ${unit}` : ""}`; }
function decimal(value: number | null, digits = 1) { return measured(value) ? value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—"; }
function formatComponentValue(value: number | null, unit: string) { return !measured(value) ? "Unavailable" : `${Math.round(value).toLocaleString("en-US")} ${unit}`; }

function averageScores(scores: ScoreDay[], endDate: string | undefined) {
  if (!endDate) return null;
  const end = new Date(`${endDate}T12:00:00.000Z`);
  if (!Number.isFinite(end.getTime())) return null;
  end.setUTCDate(end.getUTCDate() - 29);
  const startDate = end.toISOString().slice(0, 10);
  const values = scores.filter((item) => item.kind === "effort" && item.score_date >= startDate && item.score_date <= endDate).map((item) => item.score).filter(measured);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function activityScoreBreakdown(latest: HealthMetricDay | undefined, targets: EffortScoreTargets, definitions: readonly EffortComponentDefinition[]): ActivityScoreBreakdown | null {
  if (!latest) return null;
  const values = definitions.map((component) => ({ ...component, value: latest[component.key] as number | null }));
  const result = calculateEffortScoreFromAvailable({ zoneMinutes: latest.zone_minutes, activeEnergyKcal: latest.active_energy_kcal, exerciseMinutes: latest.exercise_minutes, steps: latest.steps }, { activeEnergyKcalTarget: targets.activeEnergyKcal });
  const availableWeight = values.filter((component) => measured(component.value)).reduce((sum, component) => sum + component.weight, 0);
  const components = values.map((component) => {
    const normalizedValue = normalizeEffortTargetValue(component.value, component.target);
    const scoreNormalizedValue = measured(component.value) ? Math.min(1, Math.max(0, diminishingLoad(component.value, component.target))) : null;
    return {
      id: component.id, label: component.label, weight: component.weight, sourceValueLabel: formatComponentValue(component.value, component.unit), targetLabel: component.targetLabel, normalizedValue,
      scoreNormalizedValue,
      contribution: scoreNormalizedValue === null || availableWeight === 0 ? null : scoreNormalizedValue * component.weight / availableWeight * 100,
      formula: component.formula, normalization: `visual gauge ${normalizedValue === null ? "unavailable" : `${Math.round(normalizedValue * 100)} /100`} · diminishing sub-score ${scoreNormalizedValue === null ? "unavailable" : `${Math.round(scoreNormalizedValue * 100)} /100`}`,
    };
  });
  return { score: result.score, algorithmVersion: result.algorithmVersion, coverage: result.coverage, components };
}

/** The radar/detail reference is linear and capped: reaching a target fills it. */
export function normalizeEffortTargetValue(value: number | null, target: number) {
  if (!measured(value) || !Number.isFinite(target) || target <= 0) return null;
  return Math.min(1, Math.max(0, value / target));
}

function comparison(value: number | null, average: number | null): ActivityRadarDimension["comparison"] {
  if (!measured(value) || !measured(average)) return null;
  if (Math.abs(value - average) < 0.005) return "equal";
  return value > average ? "up" : "down";
}
function comparisonLabel(average: number | null, unit: string) { return measured(average) ? `30-day avg · ${formatComponentValue(average, unit)}` : undefined; }
function dateOffset(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  if (!Number.isFinite(value.getTime())) return null;
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function finiteValuesInWindow<Key extends NumericHealthMetricKey>(days: readonly HealthMetricDay[], key: Key, endDate: string): number[] {
  const startDate = dateOffset(endDate, -29);
  if (!startDate) return [];
  const values: Array<number | null> = days
    .filter((day) => day.metric_date >= startDate && day.metric_date <= endDate)
    .map((day) => day[key]);
  return values.filter((value): value is number => measured(value));
}

/** Min-max normalization for a context-only axis; null stays unavailable. */
export function normalizeEffortContextValue(value: number | null, windowValues: readonly number[]) {
  if (!measured(value) || !windowValues.length) return null;
  const finite = windowValues.filter((item) => Number.isFinite(item));
  if (!finite.length) return null;
  const minimum = Math.min(...finite);
  const maximum = Math.max(...finite);
  if (maximum === minimum) return 1;
  return Math.min(1, Math.max(0, (value - minimum) / (maximum - minimum)));
}

export function ActivityDetails({ data }: { data: HealthAnalytics }) {
  const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: data.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const activityDays = completedActivityDays(data.days, currentDate);
  const latest = activityDays.findLast((day) => day.metric_date === currentDate);
  const effortTargets = data.effortTargets ?? effortScoreTargets();
  const effortTargetSource = data.effortTargetSource ?? "fallback";
  const effortComponents = effortComponentDefinitions(effortTargets, effortTargetSource);
  const effortScores = data.scores.filter((item) => item.kind === "effort");
  const scoreBreakdown = activityScoreBreakdown(latest, effortTargets, effortComponents);
  const latestEffort = effortScores.findLast((item) => item.score_date === currentDate);
  const persistedScore = latestEffort?.score ?? null;
  // Use the same recorded daily score as the home view. The radar/breakdown
  // derives only its component values from today's raw measurements.
  const score = persistedScore;
  const averages = {
    steps: latest ? averageLast30Measured(activityDays, "steps", latest.metric_date) : null,
    zoneMinutes: latest ? averageLast30Measured(activityDays, "zone_minutes", latest.metric_date) : null,
    exerciseMinutes: latest ? averageLast30Measured(activityDays, "exercise_minutes", latest.metric_date) : null,
    activeCalories: latest ? averageLast30Measured(activityDays, "active_energy_kcal", latest.metric_date) : null,
    effort: averageScores(effortScores, latest?.metric_date),
    weeklyLoad: latest ? averageLast30Measured(activityDays, "weekly_load", latest.metric_date) : null,
    acuteChronicLoadRatio: latest ? averageLast30Measured(activityDays, "acute_chronic_load_ratio", latest.metric_date) : null,
  };
  const weeklyLoadWindow = latest ? finiteValuesInWindow(activityDays, "weekly_load", latest.metric_date) : [];
  const weeklyLoadNormalized = latest ? normalizeEffortContextValue(latest.weekly_load, weeklyLoadWindow) : null;
  const regularity = activityRegularity(activityDays.slice(-28).map((day) => ({ steps: day.steps, activeZoneMinutes: day.zone_minutes, activeMinutes: day.active_minutes, effortScore: effortScores.findLast((item) => item.score_date === day.metric_date)?.score ?? null })));
  const scoreCoverage = score === null ? null : scoreBreakdown?.coverage ?? null;
  const freshness = calculateSignalFreshness({ measuredAt: latestSourceMeasuredAt(latest), importedAt: data.importedAt, coverage: scoreCoverage ?? 0 });
  const sourceLabel = healthSourceLabel(latest);
  const radarDimensions: ActivityRadarDimension[] = latest ? [...effortComponents.map((component) => {
    const value = latest[component.key] as number | null;
    const average = component.id === "steps" ? averages.steps : component.id === "zoneMinutes" ? averages.zoneMinutes : component.id === "exerciseMinutes" ? averages.exerciseMinutes : averages.activeCalories;
    const breakdown = scoreBreakdown?.components.find((item) => item.id === component.id);
    return {
      id: component.id, label: component.label, normalizedValue: breakdown?.normalizedValue ?? null, valueLabel: formatComponentValue(value, component.unit), averageLabel: comparisonLabel(average, component.unit),
      definition: component.id === "zoneMinutes" ? "Cumulative time in measured intensity zones." : component.id === "exerciseMinutes" ? "Exercise duration recorded by health source." : component.id === "activeEnergyKcal" ? "Active energy estimated by health source." : "Number of steps recorded during the day.",
      readingDirection: "Higher = more load achieved", scoreRole: `Activity score component · ${component.weight}%`, scoreWeight: component.weight, scoreFormula: component.formula, scoreNormalization: "diminishing returns, then weighting", scoreContribution: breakdown?.contribution ?? null, comparison: comparison(value, average), comparisonLabel: comparisonLabel(average, component.unit), comparisonTone: metricTone(value, average, "higher_is_better"),
      sourceLabel,
    };
  }), {
    id: "weeklyLoad",
    label: "Weekly load",
    normalizedValue: weeklyLoadNormalized,
    valueLabel: formatComponentValue(latest.weekly_load, "pts"),
    averageLabel: comparisonLabel(averages.weeklyLoad, "pts"),
    definition: "Context reference to situate recent load within 30-day finite values.",
    readingDirection: "Context, not a score component",
    scoreRole: "Context · excluded from score",
    scoreFormula: "min–max normalization over 30-day finite values",
    comparison: comparison(latest.weekly_load, averages.weeklyLoad),
    comparisonLabel: comparisonLabel(averages.weeklyLoad, "pts"),
    comparisonTone: "neutral",
    sourceLabel: "Soma",
  }] : [];
  return <div className={styles.root}>
    <RefreshActiveHealthPage />
    <HealthPageShell kind="activity" title="Activity" description="Today's activity score based on zone minutes, exercise duration, active energy, and steps." score={score} freshness={freshness} timezone={data.timezone} showFreshness={true} heroScore={<span className="sr-only">Activity score: {score === null ? "unavailable" : `${score} out of 100`}. 30-day average: {averages.effort === null ? "unavailable" : `${Math.round(averages.effort)} out of 100`}. {scoreCoverage === null ? "Score coverage unavailable" : `${Math.round(scoreCoverage * 100)}% score coverage`}.</span>}>
      <section className={`${styles.content} health-observatory-content`} aria-label="Activity content" data-health-reveal-root>
        <HealthScrollReveal />
        {latest ? <>
          <section className={`${styles.heroScene} health-observatory-panel`} aria-labelledby="activity-score-summary-title"><div className={styles.radarRegion}><ActivityScoreOverview dimensions={radarDimensions} score={score} average={averages.effort} breakdown={scoreBreakdown} persistedScore={persistedScore} /></div></section>
          <section className={`${styles.section} health-observatory-panel`} aria-label="Activity benchmarks" data-health-reveal><ActivityBenchmarks items={[
            { id: "weekly-load", label: "Weekly load", value: number(latest.weekly_load), context: `30-day avg · ${formatAverage(averages.weeklyLoad, "number")}`, explanation: "Soma additionne les scores d’effort disponibles depuis le début de la semaine. La moyenne compare cette valeur aux jours mesurés des 30 derniers jours." },
            { id: "load-ratio", label: "Acute / chronic load ratio", value: measured(latest.acute_chronic_load_ratio) ? `${decimal(latest.acute_chronic_load_ratio, 2)}×` : "—", context: `30-day avg · ${decimal(averages.acuteChronicLoadRatio, 2)}×`, explanation: "Soma divise la somme des 7 derniers scores d’effort disponibles par la charge hebdomadaire habituelle calculée sur les 28 derniers scores disponibles. Il faut au moins 21 scores pour obtenir ce ratio." },
            { id: "consistency", label: "Consistency · 28d", value: regularity.consistencyScore === null ? "—" : `${regularity.consistencyScore}%`, explanation: "Soma compare la variation des scores d’effort à leur moyenne sur les jours observés des 28 derniers jours. Plus les scores se ressemblent, plus le pourcentage est élevé. Sans moyenne exploitable, le résultat reste indisponible." },
            { id: "active-days", label: "Active days · 28d", value: regularity.activeDayRate === null ? "—" : `${regularity.activeDayRate}%`, explanation: "Nombre de jours actifs divisé par le nombre de jours observés sur les 28 derniers jours. Un jour est actif avec au moins 7 500 pas, 20 minutes en zone active ou 30 minutes d’activité. Les jours sans mesure sont exclus." },
          ]} /></section>
          <ActivityHistory exercises={data.exercises} referenceDate={currentDate} />
          <section className={`${styles.section} ${styles.trendsSection} health-observatory-panel`} aria-label="Activity trends" data-health-reveal><div className={styles.trendGrid}><MetricTrendCard label="Zone minutes" points={points(activityDays, "zone_minutes")} unit="min" direction="higher_is_better" format={(value) => Math.round(value).toString()} valueFormat="number" chartType="bar" compact averageInChart animateCurrent animationFormat="number" /><MetricTrendCard label="Exercise duration" points={points(activityDays, "exercise_minutes")} unit="min" direction="higher_is_better" format={(value) => Math.round(value).toString()} valueFormat="number" chartType="bar" compact averageInChart animateCurrent animationFormat="number" /><MetricTrendCard label="Active calories" points={points(activityDays, "active_energy_kcal")} unit="kcal" direction="higher_is_better" format={(value) => Math.round(value).toString()} valueFormat="number" chartType="bar" compact averageInChart animateCurrent animationFormat="number" /><MetricTrendCard label="Steps" points={points(activityDays, "steps")} direction="higher_is_better" format={(value) => Math.round(value).toLocaleString("en-US")} valueFormat="number" chartType="bar" compact averageInChart animateCurrent animationFormat="number" /><MetricTrendCard label="Weekly load" points={points(activityDays, "weekly_load")} direction="context_only" format={(value) => Math.round(value).toLocaleString("en-US")} valueFormat="number" chartType="bar" barAggregation="week" compact averageInChart animateCurrent animationFormat="number" /><MetricTrendCard label="Activity consistency" points={points(activityDays, "activity_consistency_28d")} unit="%" direction="higher_is_better" format={(value) => Math.round(value).toString()} valueFormat="number" chartType="bar" compact averageInChart animateCurrent animationFormat="number" /></div></section>
        </> : <><section className={`${styles.empty} health-observatory-panel`} aria-labelledby="activity-empty-heading"><Footprints size={24} aria-hidden="true" /><div><h2 id="activity-empty-heading">No activity measurement for today yet</h2><p>Activity for today will appear after Google Health sends new measurements. Older workouts remain available below.</p><p><a href="/settings">Check your health connection</a></p></div></section>{data.exercises.length > 0 && <ActivityHistory exercises={data.exercises} referenceDate={currentDate} />}</>}
      </section>
    </HealthPageShell>
  </div>;
}
