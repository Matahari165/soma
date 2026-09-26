"use client";

import { useRef, useState } from "react";

import { useMotionUpdate } from "@/components/motion/use-motion-update";

import { BarTrendChart } from "@/components/health/health-charts";
import type { MetricPoint } from "@/domain/metrics/trends";
import type { MealFoodGroupTrendPoint, MealNutritionTrendMetric, MealNutritionTrendPoint } from "@/domain/lab/meals";

import { MealFoodCategoryTrends } from "./meal-food-category-trends";
import { MealScoreHistoryPanel, type MealScoreTrendPoint } from "./meal-score-overview";
import styles from "./meal-nutrition-trends.module.css";

export type MealTrendPeriod = 7 | 14 | 30;

const periods: ReadonlyArray<{ value: MealTrendPeriod; label: string }> = [
  { value: 7, label: "7 jours" },
  { value: 14, label: "2 semaines" },
  { value: 30, label: "1 mois" },
];

const periodLabels: Record<MealTrendPeriod, string> = {
  7: "les 7 derniers jours",
  14: "les 2 dernières semaines",
  30: "le dernier mois",
};

const metricCopy: Record<MealNutritionTrendMetric["id"], { label: string; unit: string }> = {
  caloriesKcal: { label: "Calories", unit: "kcal" },
  proteinG: { label: "Protéines", unit: "g" },
  addedSugarG: { label: "Sucres ajoutés", unit: "g" },
  fatG: { label: "Lipides", unit: "g" },
  carbsG: { label: "Glucides", unit: "g" },
};

export function limitMealTrendPoints<T extends { date: string }>(points: readonly T[], period: MealTrendPeriod) {
  return points.slice(-period);
}

function formatValue(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" })
    .format(new Date(date + "T12:00:00"))
    .replace(".", "");
}

function formatLongDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    .format(new Date(date + "T12:00:00"));
}

function measuredAverage(points: readonly MealNutritionTrendPoint[]) {
  const values = points.flatMap((point) => point.value === null || !Number.isFinite(point.value) ? [] : [point.value]);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function latestMeasuredPoint(points: readonly MealNutritionTrendPoint[]) {
  return [...points].reverse().find((point) => point.value !== null && Number.isFinite(point.value)) ?? null;
}

function metricPointDescription(point: MealNutritionTrendPoint, unit: string) {
  return point.value === null
    ? formatLongDate(point.date) + " : aucune estimation disponible"
    : formatLongDate(point.date) + " : " + formatValue(point.value) + " " + unit;
}

function NutritionMetricChart({ metric, period }: { metric: MealNutritionTrendMetric; period: MealTrendPeriod }) {
  const copy = metricCopy[metric.id];
  const points = limitMealTrendPoints(metric.points, period);
  const available = points.filter((point) => point.value !== null && Number.isFinite(point.value));
  const latest = latestMeasuredPoint(points);
  const average = measuredAverage(points);
  const coverage = available.length + " " + (available.length === 1 ? "jour mesuré" : "jours mesurés") + " sur " + points.length;
  const titleId = "meal-trend-" + metric.id + "-title";
  const summaryId = "meal-trend-" + metric.id + "-summary";
  const chartPoints: MetricPoint[] = points.map((point) => ({ date: point.date, value: point.value }));
  const firstDate = points[0]?.date;
  const lastDate = points.at(-1)?.date ?? firstDate;

  return <article className={styles.chartCard} data-metric={metric.id} aria-labelledby={titleId} aria-describedby={summaryId}>
    <header className={styles.chartHeader}>
      <div className={styles.chartHeading}>
        <h3 className={styles.metricLabel} id={titleId}>{copy.label}</h3>
        <strong className={styles.value}>{formatValue(latest?.value ?? null)}{latest ? <small>{copy.unit}</small> : null}</strong>
        <p className={styles.average}>{average === null ? "Aucune mesure" : "Moy. " + formatValue(average) + " " + copy.unit}</p>
      </div>
    </header>
    <div className={styles.chartFrame}>
      {available.length ? <BarTrendChart animateUpdates={false} points={chartPoints} label={copy.label + ", " + periodLabels[period] + ". " + coverage} unit={copy.unit} valueFormat="number" average={average} /> : <p className={styles.emptyInline}>Aucune mesure sur cette période.</p>}
      <div className={styles.chartAxis} aria-hidden="true"><span>{firstDate ? formatShortDate(firstDate) : ""}</span><span>{lastDate ? formatShortDate(lastDate) : ""}</span></div>
      <p id={summaryId} className={styles.srOnly}>{points.map((point) => metricPointDescription(point, copy.unit)).join(". ")}. Les jours sans estimation restent vides. Moyenne calculée uniquement sur les jours mesurés.</p>
    </div>
  </article>;
}

export function MealNutritionTrends({
  metrics,
  foodGroups,
  scoreTrend,
  className,
  illustrative = false,
}: {
  metrics: MealNutritionTrendMetric[];
  foodGroups: readonly MealFoodGroupTrendPoint[];
  scoreTrend: readonly MealScoreTrendPoint[];
  className?: string;
  illustrative?: boolean;
}) {
  const [period, setPeriod] = useState<MealTrendPeriod>(30);
  const trendsRef = useRef<HTMLDivElement>(null);
  useMotionUpdate(trendsRef, period);
  const selectedFoodGroups = limitMealTrendPoints(foodGroups, period);
  const selectedScoreTrend = limitMealTrendPoints(scoreTrend, period);
  const hasAnySeries = metrics.length > 0 || foodGroups.length > 0 || scoreTrend.length > 0;

  return <section className={[styles.root, className].filter(Boolean).join(" ")} aria-labelledby="meal-trends-title" data-period={period} data-scroll-reveal="trends">
    <h2 className={styles.srOnly} id="meal-trends-title">Nutrition trends</h2>
    <div className={styles.toolbar}>
      <fieldset className={styles.periodPicker}>
        <legend className={styles.srOnly}>Period</legend>
        <div className={styles.periodOptions} role="group" aria-label="Choose chart period">
          {periods.map((option) => <button className={styles.periodButton} key={option.value} type="button" aria-pressed={period === option.value} onClick={() => setPeriod(option.value)}>{option.label}</button>)}
        </div>
      </fieldset>
      <ul className={styles.legend} aria-label="Trend chart legend">
        <li><span className={styles.barKey} aria-hidden="true" />Daily value</li>
        <li><span className={styles.averageKey} aria-hidden="true" />Measured average</li>
      </ul>
    </div>
    {hasAnySeries ? <div ref={trendsRef} className={styles.chartGrid}>
      {metrics.map((metric) => <NutritionMetricChart key={metric.id} metric={metric} period={period} />)}
      {foodGroups.length > 0 && <MealFoodCategoryTrends points={selectedFoodGroups} illustrative={illustrative} />}
      {scoreTrend.length > 0 && <MealScoreHistoryPanel animateUpdates={false} trend={selectedScoreTrend} />}
    </div> : <p className={styles.emptyState} role="status">Aucune série nutritionnelle disponible.</p>}
  </section>;
}
