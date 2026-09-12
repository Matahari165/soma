import type { CSSProperties } from "react";

import type { MealFoodGroupTrendPoint } from "@/domain/lab/meals";
import { MEAL_FOOD_GROUP_LABELS } from "@/domain/meal-taxonomy";
import type { MealFoodGroup } from "@/domain/meals";

import styles from "./meal-food-category-trends.module.css";

export type MealFoodCategoryTrendsProps = {
  points: readonly MealFoodGroupTrendPoint[];
  className?: string;
};

const CATEGORY_COLORS: Record<MealFoodGroup, string> = {
  fruit: "#d4a35f",
  vegetable: "#a8be8b",
  legume: "#c5a87a",
  whole_grain: "#b7a67c",
  refined_grain: "#8f9aa0",
  potato: "#c98d67",
  animal_protein: "#c7877e",
  plant_protein: "#8daa9a",
  egg: "#e2ca83",
  dairy: "#d1d5cc",
  nuts_seeds: "#b9a17c",
  added_fat: "#d6a84e",
  sauce: "#9c8a83",
  sweet: "#c98d9c",
  beverage: "#7fa1b0",
  other: "#737b82",
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

export function MealFoodCategoryTrends({ points, className }: MealFoodCategoryTrendsProps) {
  const totals = totalsFor(points);
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
            <div className={styles.columns} style={{ "--point-count": Math.max(points.length, 1) } as CSSProperties}>
              {points.map((point) => {
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
          <p id="meal-category-trends-description" className={styles.srOnly}>{chartDescription(points, visibleGroups)}</p>
        </figure>
      ) : <p className={styles.empty}>{points.length ? "Aucune famille alimentaire classée sur cette période." : "Aucune période disponible pour cette répartition."}</p>}
      {hasClassifiedData && <ul className={styles.legend} aria-label="Légende des familles alimentaires">
        {visibleGroups.map((group) => <li key={group}><span className={styles.swatch} style={{ background: CATEGORY_COLORS[group] }} aria-hidden="true" /><span>{MEAL_FOOD_GROUP_LABELS[group]}</span></li>)}
      </ul>}
    </section>
  );
}

export default MealFoodCategoryTrends;
