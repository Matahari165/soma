import { calculateActiveHours, type ActiveHoursSummary } from "@/domain/health/active-hours";
import { ActiveHoursTimeline } from "./active-hours-timeline";
import { Footprints } from "lucide-react";

import { runningWeekSummary } from "@/domain/health/activity-sport-analytics";

import { calculateSignalFreshness } from "@/domain/health/freshness";
import { activityRegularity, completedActivityDays } from "@/domain/metrics/wellness";
import { calculateDailyStrain, activeHoursFromScoreRow, dailyStrainScoreFromRow, activityLoadFromScoreRow } from "@/domain/scores/effort";
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

type EffortComponentId = "zoneMinutes" | "strengthMinutes" | "activeHoursProgress" | "steps";
type EffortComponentDefinition = { id: EffortComponentId; label: string; target: number; targetLabel: string; weight: number; unit: string; key: string; formula: string };

export function effortComponentDefinitions(): readonly EffortComponentDefinition[] {
  return [
    { id: "zoneMinutes", label: "Minutes en zone", target: 45, targetLabel: "45 min", weight: 25, unit: "min", key: "zone_minutes", formula: "Minutes en zone / 45, plafonné à 100 %" },
    { id: "strengthMinutes", label: "Renforcement", target: 10, targetLabel: "10 min", weight: 25, unit: "min", key: "strength_minutes", formula: "Renforcement enregistré / 10 min, plafonné à 100 %" },
    { id: "activeHoursProgress", label: "Heures actives", target: 1, targetLabel: "100 % des heures", weight: 25, unit: "%", key: "active_hours", formula: "Heures actives / heures éveillées écoulées ; couverture complète requise" },
    { id: "steps", label: "Pas", target: 10_000, targetLabel: "10 000 pas", weight: 25, unit: "pas", key: "steps", formula: "Pas / 10 000, plafonné à 100 %" },
  ];
}

function componentValue(id: EffortComponentId, day: HealthMetricDay | undefined, row: ScoreDay | undefined) {
  if (id === "steps") return day?.steps ?? null;
  if (id === "zoneMinutes") return day?.zone_minutes ?? null;
  if (row?.algorithm_version !== "effort-v5") return null;
  if (id === "strengthMinutes") return measured(row.drivers.strengthMinutes) ? row.drivers.strengthMinutes : null;
  const hours = activeHoursFromScoreRow(row);
  return measured(hours?.progress) ? hours.progress : null;
}

function measured(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function points(days: HealthMetricDay[], key: keyof HealthMetricDay) { return days.map((day) => { const value = day[key]; return { date: day.metric_date, value: typeof value === "number" && Number.isFinite(value) ? value : null }; }); }
function number(value: number | null, unit?: string) { return !measured(value) ? "—" : `${Math.round(value).toLocaleString("en-US")}${unit ? ` ${unit}` : ""}`; }
function decimal(value: number | null, digits = 1) { return measured(value) ? value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—"; }
function formatComponentValue(value: number | null, unit: string) { return !measured(value) ? "Indisponible" : `${Math.round(value).toLocaleString("en-US")} ${unit}`; }

function averageScores(scores: ScoreDay[], endDate: string | undefined) {
  if (!endDate) return null;
  const end = new Date(`${endDate}T12:00:00.000Z`);
  if (!Number.isFinite(end.getTime())) return null;
  end.setUTCDate(end.getUTCDate() - 29);
  const startDate = end.toISOString().slice(0, 10);
  const values = scores.filter((item) => item.kind === "effort" && item.score_date >= startDate && item.score_date <= endDate).map((item) => dailyStrainScoreFromRow(item)).filter(measured);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function activityScoreBreakdown(latest: HealthMetricDay | undefined, row: ScoreDay | undefined, definitions: readonly EffortComponentDefinition[]): ActivityScoreBreakdown {
  const values = definitions.map((component) => ({ ...component, value: componentValue(component.id, latest, row) }));
  const result = calculateDailyStrain({ zoneMinutes: latest?.zone_minutes ?? null, steps: latest?.steps ?? null, strengthMinutes: componentValue("strengthMinutes", latest, row), activeHoursProgress: componentValue("activeHoursProgress", latest, row) });
  const components = values.map((component) => {
    const normalizedValue = normalizeEffortTargetValue(component.value, component.target);
    return { id: component.id, label: component.label, weight: component.weight, sourceValueLabel: component.id === "activeHoursProgress" ? component.value === null ? "Indisponible" : `${Math.round(component.value * 100)} %` : formatComponentValue(component.value, component.unit), targetLabel: component.targetLabel, normalizedValue, scoreNormalizedValue: normalizedValue, contribution: normalizedValue === null ? null : normalizedValue * 25, formula: component.formula, normalization: "Objectif quotidien plafonné à 100 %" };
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
export function ActivityDetails({ data }: { data: HealthAnalytics }) {
  const currentDate = new Intl.DateTimeFormat("en-CA", { timeZone: data.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const runningWeek = runningWeekSummary(data.exercises, currentDate, data.timezone);
  const runningBenchmark = {
    id: "weekly-running", label: "Running · this week",
    value: runningWeek.minutes === null ? "—" : `${runningWeek.missingDurations ? "≥ " : ""}${number(runningWeek.missingDurations ? Math.floor(runningWeek.minutes) : runningWeek.minutes)} min`,
    context: `${runningWeek.sessions} ${runningWeek.sessions === 1 ? "session" : "sessions"}${runningWeek.missingDurations ? " · duration incomplete" : ""}`,
    explanation: `Running sessions recorded since Monday ${runningWeek.startDate}, in your timezone. Each session duration is counted once. ${runningWeek.missingDurations ? "Some durations are missing; minutes show the known subtotal." : "Separate from the daily Strain score."}`,
  };
  const activityDays = completedActivityDays(data.days, currentDate);
  const latest = activityDays.findLast((day) => day.metric_date === currentDate);
  const effortComponents = effortComponentDefinitions();
  const effortScores = data.scores.filter((item) => item.kind === "effort");

  const latestEffort = effortScores.findLast((item) => item.score_date === currentDate);
  const persistedScore = dailyStrainScoreFromRow(latestEffort);
  const scoreBreakdown = activityScoreBreakdown(latest, latestEffort, effortComponents);
  const activeHours = activeHoursFromScoreRow(latestEffort) ?? calculateActiveHours({ date: currentDate, timeZone: data.timezone, now: new Date(), records: [] });
  // Home and Strain share this reader, including hours elapsed since the last import.
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
  const regularity = activityRegularity(activityDays.slice(-28).map((day) => ({ steps: day.steps, activeZoneMinutes: day.zone_minutes, activeMinutes: day.active_minutes, effortScore: activityLoadFromScoreRow(effortScores.findLast((item) => item.score_date === day.metric_date)) })));
  const scoreCoverage = scoreBreakdown.coverage;
  const freshness = calculateSignalFreshness({ measuredAt: latestSourceMeasuredAt(latest), importedAt: data.importedAt, coverage: scoreCoverage ?? 0 });
  const sourceLabel = healthSourceLabel(latest);
  const radarDimensions: ActivityRadarDimension[] = latest ? effortComponents.map((component) => {
    const value = componentValue(component.id, latest, latestEffort);
    const average = component.id === "steps" ? averages.steps : component.id === "zoneMinutes" ? averages.zoneMinutes : null;
    const breakdown = scoreBreakdown?.components.find((item) => item.id === component.id);
    return {
      id: component.id, label: component.label, normalizedValue: breakdown?.normalizedValue ?? null, valueLabel: component.id === "activeHoursProgress" ? `${activeHours.observedHours === 0 ? "—" : `${activeHours.complete ? "" : "≥ "}${activeHours.activeHours}`} / ${activeHours.elapsedHours} h` : formatComponentValue(value, component.unit), averageLabel: comparisonLabel(average, component.unit),
      definition: component.id === "zoneMinutes" ? "Minutes actives en zone enregistrées aujourd’hui par Google Health." : component.id === "strengthMinutes" ? "Durée des séances de renforcement enregistrées aujourd’hui. Une séance générique ne suffit pas à identifier du renforcement." : component.id === "activeHoursProgress" ? "Une heure est active avec 100 pas ou une minute d’activité détectée, même légère. Seuils expérimentaux ; sommeil exclu et données absentes inconnues." : "Nombre de pas enregistrés aujourd’hui.",
      readingDirection: "100% = daily goal reached", scoreRole: `Strain score component · ${component.weight}%`, scoreWeight: component.weight, scoreFormula: component.formula, scoreNormalization: "goal completion capped at 100%, then weighting", scoreContribution: breakdown?.contribution ?? null, comparison: comparison(value, average), comparisonLabel: comparisonLabel(average, component.unit), comparisonTone: metricTone(value, average, "higher_is_better"),
      sourceLabel,
    };
  }) : [];
  return <div className={styles.root}>
    <RefreshActiveHealthPage />
    <HealthPageShell kind="activity" title="Strain" description="Objectifs quotidiens : 10 000 pas, 45 minutes en zone, 10 minutes de renforcement et mouvement chaque heure." score={score} freshness={freshness} timezone={data.timezone} showFreshness={true} heroScore={<span className="sr-only">Strain score: {score === null ? "unavailable" : `${score} out of 100`}. 30-day average: {averages.effort === null ? "unavailable" : `${Math.round(averages.effort)} out of 100`}. {scoreCoverage === null ? "Score coverage unavailable" : `${Math.round(scoreCoverage * 100)}% score coverage`}.</span>}>
      <section className={`${styles.content} health-observatory-content`} aria-label="Strain content" data-scroll-reveal-root>
        <HealthScrollReveal />
        {latest ? <>
          <section className={`${styles.heroScene} health-observatory-panel`} aria-labelledby="activity-score-summary-title"><div className={styles.radarRegion}><ActivityScoreOverview dimensions={radarDimensions} score={score} average={averages.effort} breakdown={scoreBreakdown} persistedScore={persistedScore} /></div></section>
          <ActiveHoursTimeline summary={activeHours} importedAt={data.importedAt} />
          <section className={`${styles.section} health-observatory-panel`} aria-label="Strain benchmarks" data-scroll-reveal="measurements"><ActivityBenchmarks items={[
            runningBenchmark,
            { id: "weekly-load", label: "Weekly load", value: number(latest.weekly_load), context: `30-day avg · ${formatAverage(averages.weeklyLoad, "number")}`, explanation: "Soma additionne les scores d’effort disponibles depuis le début de la semaine. La moyenne compare cette valeur aux jours mesurés des 30 derniers jours." },
            { id: "load-ratio", label: "Acute / chronic load ratio", value: measured(latest.acute_chronic_load_ratio) ? `${decimal(latest.acute_chronic_load_ratio, 2)}×` : "—", context: `30-day avg · ${decimal(averages.acuteChronicLoadRatio, 2)}×`, explanation: "Soma divise la somme des 7 derniers scores d’effort disponibles par la charge hebdomadaire habituelle calculée sur les 28 derniers scores disponibles. Il faut au moins 21 scores pour obtenir ce ratio." },
            { id: "consistency", label: "Consistency · 28d", value: regularity.consistencyScore === null ? "—" : `${regularity.consistencyScore}%`, explanation: "Soma compare la variation des scores d’effort à leur moyenne sur les jours observés des 28 derniers jours. Plus les scores se ressemblent, plus le pourcentage est élevé. Sans moyenne exploitable, le résultat reste indisponible." },
            { id: "active-days", label: "Active days · 28d", value: regularity.activeDayRate === null ? "—" : `${regularity.activeDayRate}%`, explanation: "Nombre de jours actifs divisé par le nombre de jours observés sur les 28 derniers jours. Un jour est actif avec au moins 7 500 pas, 20 minutes en zone active ou 30 minutes d’activité. Les jours sans mesure sont exclus." },
          ]} /></section>
          <ActivityHistory exercises={data.exercises} referenceDate={currentDate} timezone={data.timezone} />
          <section className={`${styles.section} ${styles.trendsSection} health-observatory-panel`} aria-label="Strain trends" data-scroll-reveal="trends"><div className={styles.trendGrid}><MetricTrendCard label="Zone minutes" points={points(activityDays, "zone_minutes")} unit="min" direction="higher_is_better" format={(value) => Math.round(value).toString()} valueFormat="number" chartType="bar" compact averageInChart animateCurrent animationFormat="number" /><MetricTrendCard label="Renforcement" points={effortScores.map((row) => ({ date: row.score_date, value: row.algorithm_version === "effort-v5" && measured(row.drivers.strengthMinutes) ? row.drivers.strengthMinutes : null }))} unit="min" direction="higher_is_better" format={(value) => Math.round(value).toString()} valueFormat="number" chartType="bar" compact averageInChart animateCurrent animationFormat="number" /><MetricTrendCard label="Heures actives" points={effortScores.map((row) => { const hours = row.drivers.activeHours as ActiveHoursSummary | undefined; return { date: row.score_date, value: row.algorithm_version === "effort-v5" && measured(hours?.progress) ? hours.progress * 100 : null }; })} unit="%" direction="higher_is_better" format={(value) => Math.round(value).toString()} valueFormat="number" chartType="bar" compact averageInChart animateCurrent animationFormat="number" /><MetricTrendCard label="Steps" points={points(activityDays, "steps")} direction="higher_is_better" format={(value) => Math.round(value).toLocaleString("en-US")} valueFormat="number" chartType="bar" compact averageInChart animateCurrent animationFormat="number" /><MetricTrendCard label="Weekly load" points={points(activityDays, "weekly_load")} direction="context_only" format={(value) => Math.round(value).toLocaleString("en-US")} valueFormat="number" chartType="bar" barAggregation="week" compact averageInChart animateCurrent animationFormat="number" /><MetricTrendCard label="Activity consistency" points={points(activityDays, "activity_consistency_28d")} unit="%" direction="higher_is_better" format={(value) => Math.round(value).toString()} valueFormat="number" chartType="bar" compact averageInChart animateCurrent animationFormat="number" /></div></section>
        </> : <><section className={`${styles.empty} health-observatory-panel`} aria-labelledby="activity-empty-heading" data-scroll-reveal="empty"><Footprints size={24} aria-hidden="true" /><div><h2 id="activity-empty-heading">No activity measurement for today yet</h2><p>Activity for today will appear after Google Health sends new measurements. Older workouts remain available below.</p><p><a href="/settings">Check your health connection</a></p></div></section><ActiveHoursTimeline summary={activeHours} importedAt={data.importedAt} /><section className={`${styles.section} health-observatory-panel`} aria-label="Strain benchmarks"><ActivityBenchmarks items={[runningBenchmark]} /></section>{data.exercises.length > 0 && <ActivityHistory exercises={data.exercises} referenceDate={currentDate} timezone={data.timezone} />}</>}
      </section>
    </HealthPageShell>
  </div>;
}
