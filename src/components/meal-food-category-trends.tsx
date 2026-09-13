import type { CSSProperties } from "react";

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
  fruit: "#f1f1f1",
  vegetable: "#dddddd",
  legume: "#c9c9c9",
  whole_grain: "#b5b5b5",
  refined_grain: "#a1a1a1",
  potato: "#8d8d8d",
  animal_protein: "#797979",
  plant_protein: "#e7e7e7",
  egg: "#d3d3d3",
  dairy: "#bfbfbf",
  nuts_seeds: "#ababab",
  added_fat: "#979797",
  sauce: "#838383",
  sweet: "#6f6f6f",
  beverage: "#5b5b5b",
  other: "#474747",
};

function formatDate(date: string) {
  const parsed = new Date(`${date}T12:00:00`);
  if (!Number.isFinite(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(parsed).replace(".", "");
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

function chartDescription(points: readonly MealFoodGroupTrendPoint[], groups: readonly MealFoodGroup[]) {
  if (!points.length) return "Aucune période disponible pour cette répartition.";
  const descriptions = points.map((point) => {
    if (!point.counts) return `${formatDate(point.date)} : aucune classification exploitable`;
    const entries = groups.flatMap((group) => {
      const value = point.counts?.[group];
      return value ? [`${MEAL_FOOD_GROUP_LABELS[group]} ${value}`] : [];
    });
    return `${formatDate(point.date)} : ${entries.length ? entries.join(", ") : "aucune famille classée"}`;
  });
  return `${descriptions.join(". ")}. Les familles peuvent se croiser : il s’agit d’occurrences classées, pas d’une part calorique.`;
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

export function MealFoodCategoryTrends({ points, className, illustrative = false }: MealFoodCategoryTrendsProps) {
  const chartPoints = illustrative ? withIllustrativePreview(points) : points;
  const totals = totalsFor(chartPoints);
  const hasClassifiedData = totals.size > 0;
  const groups = [...totals.entries()]
    .sort((first, second) => second[1] - first[1])
    .slice(0, 7)
    .map(([group]) => group);
  const selectedGroups = new Set(groups);
  const hasRemainder = [...totals.keys()].some((group) => !selectedGroups.has(group));
  const visibleGroups = groups.length
    ? [...groups, ...(hasRemainder && !selectedGroups.has("other") ? ["other" as MealFoodGroup] : [])]
    : ["other" as MealFoodGroup];

  return (
    <section className={[styles.root, className].filter(Boolean).join(" ")} aria-labelledby="meal-category-trends-title">
      <header className={styles.header}>
        <div>
          <h2 id="meal-category-trends-title">Répartition des familles</h2>
        </div>
        <span className={styles.period}>28 JOURS</span>
      </header>
      {points.length > 0 && hasClassifiedData ? (
        <figure className={styles.figure}>
          <div className={styles.chart} role="img" aria-labelledby="meal-category-trends-title" aria-describedby="meal-category-trends-description">
            <div className={styles.scale} aria-hidden="true"><span>100 %</span><span>50 %</span><span>0</span></div>
            <div className={styles.columns} style={{ "--point-count": Math.max(chartPoints.length, 1) } as CSSProperties}>
              {chartPoints.map((point) => {
                const counts = point.counts;
                const total = Object.values(counts ?? {}).reduce((sum, value) => sum + (Number.isFinite(value) && value > 0 ? value : 0), 0);
                const remainder = Object.entries(counts ?? {}).reduce((sum, [key, value]) => selectedGroups.has(key as MealFoodGroup) || key === "other" || !Number.isFinite(value) || value <= 0 ? sum : sum + value, 0);
                return (
                  <div className={styles.column} key={point.date}>
                    {total > 0 && <div className={styles.stack}>
                      {visibleGroups.map((group) => {
                        const value = group === "other" ? (counts?.other ?? 0) + remainder : counts?.[group] ?? 0;
                        if (value <= 0) return null;
                        return <span className={styles.segment} data-group={group} key={group} style={{ height: `${value / total * 100}%`, "--category-color": CATEGORY_COLORS[group] } as CSSProperties} aria-hidden="true" />;
                      })}
                    </div>}
                  </div>
                );
              })}
            </div>
          </div>
          <figcaption className={styles.caption}><span>{points[0] ? formatDate(points[0].date) : "—"}</span><span>{points.at(-1) ? formatDate(points.at(-1)!.date) : "—"}</span></figcaption>
          <p id="meal-category-trends-description" className={styles.srOnly}>{chartDescription(chartPoints, visibleGroups)}</p>
        </figure>
      ) : <p className={styles.empty}>{points.length ? "Aucune famille alimentaire classée sur cette période." : "Aucune période disponible pour cette répartition."}</p>}
      {hasClassifiedData && <ul className={styles.legend} aria-label="Légende des familles alimentaires">
        {visibleGroups.map((group) => <li key={group}><span className={styles.swatch} style={{ background: CATEGORY_COLORS[group] }} aria-hidden="true" /><span>{MEAL_FOOD_GROUP_LABELS[group]}</span></li>)}
      </ul>}
      {illustrative && <p className={styles.previewNote}>APERÇU LOCAL · DONNÉES ILLUSTRATIVES</p>}
    </section>
  );
}

export default MealFoodCategoryTrends;
