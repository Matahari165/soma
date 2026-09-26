"use client";

import { useId, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

import { ChartHoverTooltip } from "@/components/health/health-charts";
import type { MealFoodGroupTrendPoint } from "@/domain/lab/meals";
import { MEAL_FOOD_GROUP_LABELS } from "@/domain/meal-taxonomy";
import type { MealFoodGroup } from "@/domain/meals";

import styles from "./meal-food-category-trends.module.css";

export type MealFoodCategoryTrendsProps = {
  points: readonly MealFoodGroupTrendPoint[];
  className?: string;
  illustrative?: boolean;
};

const CATEGORY_COLORS: Record<MealFoodGroup, string> = {
  fruit: "var(--lab-category-fruit)",
  vegetable: "var(--lab-category-vegetable)",
  legume: "var(--lab-category-legume)",
  whole_grain: "var(--lab-category-whole_grain)",
  refined_grain: "var(--lab-category-refined_grain)",
  potato: "var(--lab-category-potato)",
  animal_protein: "var(--lab-category-animal_protein)",
  plant_protein: "var(--lab-category-plant_protein)",
  egg: "var(--lab-category-egg)",
  dairy: "var(--lab-category-dairy)",
  nuts_seeds: "var(--lab-category-nuts_seeds)",
  added_fat: "var(--lab-category-added_fat)",
  sauce: "var(--lab-category-sauce)",
  sweet: "var(--lab-category-sweet)",
  beverage: "var(--lab-category-beverage)",
  other: "var(--lab-category-other)",
};

function formatDate(date: string) {
  const parsed = new Date(date + "T12:00:00");
  if (!Number.isFinite(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(parsed).replace(".", "");
}

function formatLongDate(date: string) {
  const parsed = new Date(date + "T12:00:00");
  if (!Number.isFinite(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(parsed);
}

function totalsFor(points: readonly MealFoodGroupTrendPoint[]) {
  const totals = new Map<MealFoodGroup, number>();
  for (const point of points) {
    for (const [key, value] of Object.entries(point.counts ?? {})) {
      if (!Number.isFinite(value) || value <= 0) continue;
      const group = key as MealFoodGroup;
      totals.set(group, (totals.get(group) ?? 0) + value);
    }
  }
  return totals;
}

function withIllustrativePreview(points: readonly MealFoodGroupTrendPoint[]) {
  const firstIllustratedIndex = Math.max(0, points.length - 12);
  const patterns: ReadonlyArray<NonNullable<MealFoodGroupTrendPoint["counts"]>> = [
    { vegetable: 4, animal_protein: 2, refined_grain: 2, fruit: 2, dairy: 1, nuts_seeds: 1 },
    { vegetable: 3, plant_protein: 2, whole_grain: 2, fruit: 2, added_fat: 1 },
    { vegetable: 5, animal_protein: 2, potato: 1, dairy: 1, fruit: 1 },
    { vegetable: 3, egg: 2, whole_grain: 2, fruit: 2, nuts_seeds: 1 },
  ];
  return points.map((point, index) => (
    index >= firstIllustratedIndex && point.counts === null
      ? { ...point, counts: patterns[(index - firstIllustratedIndex) % patterns.length] }
      : point
  ));
}

function tooltipValue(point: MealFoodGroupTrendPoint, groups: readonly MealFoodGroup[], selectedGroups: ReadonlySet<MealFoodGroup>) {
  if (point.counts === null) return "Donnée absente";
  const remainder = Object.entries(point.counts).reduce((sum, [key, value]) => (
    selectedGroups.has(key as MealFoodGroup) || key === "other" || !Number.isFinite(value) || value <= 0 ? sum : sum + value
  ), 0);
  const entries = groups.flatMap((group) => {
    const value = group === "other" ? (point.counts?.other ?? 0) + remainder : point.counts?.[group] ?? 0;
    return value > 0 ? [MEAL_FOOD_GROUP_LABELS[group] + " " + value] : [];
  });
  return entries.length ? entries.join(" · ") + " classified occurrences" : "No food groups classified";
}

function chartDescription(points: readonly MealFoodGroupTrendPoint[], groups: readonly MealFoodGroup[], selectedGroups: ReadonlySet<MealFoodGroup>) {
  if (!points.length) return "No data available for this distribution.";
  const descriptions = points.map((point) => formatLongDate(point.date) + ": " + tooltipValue(point, groups, selectedGroups));
  return descriptions.join(". ") + ". Food groups may overlap: these are classified occurrences, not caloric share.";
}

function handleChartKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  currentIndex: number | null,
  pointCount: number,
  setActiveIndex: (index: number | null) => void,
  setAnnounce: (announce: boolean) => void,
) {
  if (event.key === "Escape") {
    setActiveIndex(null);
    setAnnounce(false);
    return;
  }
  if (!pointCount || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const index = currentIndex ?? pointCount - 1;
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? pointCount - 1
      : Math.min(pointCount - 1, Math.max(0, index + (event.key === "ArrowRight" ? 1 : -1)));
  setActiveIndex(nextIndex);
  setAnnounce(true);
}

function clearOnPointerLeave(
  event: PointerEvent<HTMLDivElement>,
  setActiveIndex: (index: number | null) => void,
  setAnnounce: (announce: boolean) => void,
) {
  if (event.pointerType !== "touch") {
    setActiveIndex(null);
    setAnnounce(false);
  }
}

export function MealFoodCategoryTrends({ points, className, illustrative = false }: MealFoodCategoryTrendsProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [announce, setAnnounce] = useState(false);
  const chartPoints = illustrative ? withIllustrativePreview(points) : points;
  const safeActiveIndex = activeIndex === null || !chartPoints.length ? null : Math.min(activeIndex, chartPoints.length - 1);
  const activePoint = safeActiveIndex === null ? null : chartPoints[safeActiveIndex];
  const totals = totalsFor(chartPoints);
  const groups = [...totals.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, 7)
    .map(([group]) => group);
  const selectedGroups = new Set(groups);
  const hasRemainder = [...totals.keys()].some((group) => !selectedGroups.has(group));
  const visibleGroups = groups.length
    ? [...groups, ...(hasRemainder && !selectedGroups.has("other") ? ["other" as MealFoodGroup] : [])]
    : ["other" as MealFoodGroup];
  const hasClassifiedData = totals.size > 0;
  const activeX = safeActiveIndex === null ? 0 : ((safeActiveIndex + 0.5) / chartPoints.length) * 100;
  const description = chartDescription(chartPoints, visibleGroups, selectedGroups);

  return <article className={[styles.root, className].filter(Boolean).join(" ")} aria-labelledby={titleId}>
    <header className={styles.header}>
      <h3 className={styles.title} id={titleId}>Food group distribution</h3>
      <p className={styles.note}>Classified occurrences · groups may overlap</p>
    </header>
    {chartPoints.length ? <figure className={styles.figure}>
      <div className={styles.chart}>
        <div className={styles.scale} aria-hidden="true"><span>100 %</span><span>50 %</span><span>0</span></div>
        <div className={styles.chartPlot}>
          <div
            className={styles.columns}
            data-testid="meal-food-group-chart"
            style={{ "--point-count": Math.max(chartPoints.length, 1) } as CSSProperties}
            role="img"
            tabIndex={0}
            aria-label="Food group distribution by day"
            aria-describedby={descriptionId}
            onFocus={() => { setActiveIndex(chartPoints.length - 1); setAnnounce(true); }}
            onBlur={() => { setActiveIndex(null); setAnnounce(false); }}
            onKeyDown={(event) => handleChartKeyDown(event, safeActiveIndex, chartPoints.length, setActiveIndex, setAnnounce)}
            onPointerLeave={(event) => clearOnPointerLeave(event, setActiveIndex, setAnnounce)}
          >
            {chartPoints.map((point, index) => {
              const counts = point.counts;
              const total = Object.values(counts ?? {}).reduce((sum, value) => sum + (Number.isFinite(value) && value > 0 ? value : 0), 0);
              const remainder = Object.entries(counts ?? {}).reduce((sum, [key, value]) => selectedGroups.has(key as MealFoodGroup) || key === "other" || !Number.isFinite(value) || value <= 0 ? sum : sum + value, 0);
              return <div
                className={styles.column}
                data-active={safeActiveIndex === index ? "true" : undefined}
                key={point.date}
                onPointerEnter={(event) => { if (event.pointerType !== "touch") { setActiveIndex(index); setAnnounce(false); } }}
                onPointerDown={(event) => { if (event.pointerType === "touch") { setActiveIndex(index); setAnnounce(true); } }}
                onClick={() => { setActiveIndex(index); setAnnounce(true); }}
                aria-hidden="true"
              >
                {total > 0 && <div className={styles.stack}>
                  {visibleGroups.map((group) => {
                    const value = group === "other" ? (counts?.other ?? 0) + remainder : counts?.[group] ?? 0;
                    if (value <= 0) return null;
                    return <span className={styles.segment} data-group={group} key={group} style={{ height: (value / total * 100) + "%", "--category-color": CATEGORY_COLORS[group] } as CSSProperties} />;
                  })}
                </div>}
              </div>;
            })}
          </div>
          {activePoint && <ChartHoverTooltip date={activePoint.date} value={tooltipValue(activePoint, visibleGroups, selectedGroups)} xPercent={activeX} align={activeX < 18 ? "start" : activeX > 82 ? "end" : "center"} announce={announce} />}
        </div>
      </div>
      <figcaption className={styles.caption}><span>{chartPoints[0] ? formatDate(chartPoints[0].date) : "—"}</span><span>{chartPoints.at(-1) ? formatDate(chartPoints.at(-1)!.date) : "—"}</span></figcaption>
      <p id={descriptionId} className={styles.srOnly}>{description}. Empty days remain without bars. Use the left and right arrow keys to move between dates.</p>
      {!hasClassifiedData && <p className={styles.empty}>No food groups classified over this period.</p>}
      {hasClassifiedData && <ul className={styles.legend} aria-label="Food group occurrence legend">
        {visibleGroups.map((group) => <li key={group}><span className={styles.swatch} style={{ "--category-color": CATEGORY_COLORS[group] } as CSSProperties} aria-hidden="true" />{MEAL_FOOD_GROUP_LABELS[group]}</li>)}
      </ul>}
      {illustrative && <p className={styles.previewNote}>ILLUSTRATIVE DATA · NOT PERSONAL HISTORY</p>}
    </figure> : <p className={styles.empty}>No data available for this distribution.</p>}
  </article>;
}
