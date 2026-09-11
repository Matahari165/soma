"use client";

import { useState, type CSSProperties } from "react";

import type { MealNutritionTrendMetric, MealNutritionTrendPoint, MealNutritionTrendMetricId } from "@/domain/lab/meals";

import styles from "./meal-nutrition-trends.module.css";

type Period = 7 | 14 | 30;

const periods: ReadonlyArray<{ value: Period; label: string }> = [
  { value: 7, label: "7 jours" },
  { value: 14, label: "2 semaines" },
  { value: 30, label: "1 mois" },
];

const periodLabels: Record<Period, string> = {
  7: "les 7 derniers jours",
  14: "les 2 dernières semaines",
  30: "le dernier mois",
};

const metricCopy: Record<MealNutritionTrendMetricId, { label: string; unit: string }> = {
  caloriesKcal: { label: "Calories", unit: "kcal" },
  proteinG: { label: "Protéines", unit: "g" },
  addedSugarG: { label: "Sucres ajoutés", unit: "g" },
  fatG: { label: "Lipides", unit: "g" },
  carbsG: { label: "Glucides", unit: "g" },
};

function formatValue(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" })
    .format(new Date(`${date}T12:00:00`))
    .replace(".", "");
}

function formatLongDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" })
    .format(new Date(`${date}T12:00:00`));
}

function average(points: readonly MealNutritionTrendPoint[]) {
  const values = points.flatMap((point) => point.value === null || !Number.isFinite(point.value) ? [] : [point.value]);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function latestPoint(points: readonly MealNutritionTrendPoint[]) {
  return [...points].reverse().find((point) => point.value !== null && Number.isFinite(point.value)) ?? null;
}

function pointDescription(point: MealNutritionTrendPoint, unit: string) {
  return point.value === null
    ? `${formatLongDate(point.date)} : aucune estimation disponible`
    : `${formatLongDate(point.date)} : ${formatValue(point.value)} ${unit}`;
}

function NutritionMetricCard({ metric, period }: { metric: MealNutritionTrendMetric; period: Period }) {
  const copy = metricCopy[metric.id];
  const points = metric.points.slice(-period);
  const available = points.filter((point): point is MealNutritionTrendPoint & { value: number } => point.value !== null && Number.isFinite(point.value));
  const current = latestPoint(points);
  const periodAverage = average(points);
  const maxValue = available.length ? Math.max(...available.map((point) => point.value)) : 1;
  const scaleMax = maxValue === 0 ? 1 : maxValue * 1.12;
  const firstDate = points[0]?.date;
  const lastDate = points.at(-1)?.date ?? firstDate;
  const summaryId = `nutrition-${metric.id}-summary`;

  return <article className={styles.card} data-metric={metric.id} aria-labelledby={`nutrition-${metric.id}-title`}>
    <header className={styles.cardHeader}>
      <div>
        <span className={styles.metricLabel} id={`nutrition-${metric.id}-title`}>{copy.label}</span>
        <strong className={styles.value}>{formatValue(current?.value ?? null)}{current ? <small>{copy.unit}</small> : null}</strong>
      </div>
      <span className={styles.average}>{periodAverage === null ? "Aucune mesure" : `Moy. ${formatValue(periodAverage)} ${copy.unit}`}</span>
    </header>

    <div className={styles.chartFrame}>
      <div className={styles.barChart} style={{ "--point-count": points.length } as CSSProperties} role="group" aria-describedby={summaryId} aria-label={`${copy.label}, ${periodLabels[period]}. ${available.length} jours mesurés sur ${points.length}.`}>
        {points.map((point) => {
          const height = point.value === null ? 0 : (point.value / scaleMax) * 100;
          const barStyle = { "--bar-height": `${height}%` } as CSSProperties & { "--bar-height": string };
          return <div className={styles.barColumn} key={point.date}>
            {point.value === null ? <span className={styles.barMissing} aria-hidden="true" /> : <span className={styles.bar} style={barStyle} aria-hidden="true" />}
          </div>;
        })}
      </div>
      <div className={styles.axis} aria-hidden="true"><span>{firstDate ? formatShortDate(firstDate) : ""}</span><span>{lastDate ? formatShortDate(lastDate) : ""}</span></div>
      <p id={summaryId} className="sr-only">{points.map((point) => pointDescription(point, copy.unit)).join(". ")}</p>
    </div>

    <footer className={styles.cardFooter}><span>{available.length}/{points.length} jours mesurés</span><span>{periodLabels[period]}</span></footer>
  </article>;
}

export function MealNutritionTrends({ metrics, className }: { metrics: MealNutritionTrendMetric[]; className?: string }) {
  const [period, setPeriod] = useState<Period>(7);

  return <section className={[styles.root, className].filter(Boolean).join(" ")} aria-labelledby="meal-nutrition-trends-title">
    <header className={styles.sectionHeader}>
      <div>
        <span className={styles.eyebrow}>Historique quotidien</span>
        <h2 id="meal-nutrition-trends-title">Évolution nutritionnelle</h2>
        <p>Une barre correspond au total estimé de la journée. Les jours non renseignés restent vides.</p>
      </div>
      <fieldset className={styles.periodPicker}>
        <legend>Période</legend>
        <div className={styles.periodOptions} role="group" aria-label="Choisir la période">
          {periods.map((option) => <button key={option.value} type="button" aria-pressed={period === option.value} onClick={() => setPeriod(option.value)}>{option.label}</button>)}
        </div>
      </fieldset>
    </header>

    {metrics.length ? <div className={styles.grid}>{metrics.map((metric) => <NutritionMetricCard key={metric.id} metric={metric} period={period} />)}</div> : <p className={styles.emptyState} role="status">Aucune donnée nutritionnelle validée sur cette période.</p>}
  </section>;
}
