import type { ReactNode } from "react";

import type { NutritionTargets } from "../domain/nutrition-targets";
import styles from "./meal-day-targets.module.css";

export type MealDayTotals = {
  caloriesKcal: number | null;
  proteinG: number | null;
  fatG: number | null;
  carbsG: number | null;
  fiberG: number | null;
};

export type MealDayTargetsProps = {
  totals: MealDayTotals | null;
  targets: NutritionTargets;
  className?: string;
  headerAction?: ReactNode;
  compact?: boolean;
};

type CardState = "pending" | "below" | "ok" | "above";
type MetricTone = "calories" | "protein" | "fat" | "carbs" | "fiber";

type CardDef = {
  key: keyof MealDayTotals;
  label: string;
  unit: string;
  tone: MetricTone;
};

const CARDS: CardDef[] = [
  { key: "caloriesKcal", label: "Calories", unit: "kcal", tone: "calories" },
  { key: "proteinG", label: "Protéines", unit: "g", tone: "protein" },
  { key: "fatG", label: "Lipides", unit: "g", tone: "fat" },
  { key: "carbsG", label: "Glucides", unit: "g", tone: "carbs" },
  { key: "fiberG", label: "Fibres", unit: "g", tone: "fiber" },
];

type TargetRangeKey = Exclude<keyof NutritionTargets, "surplusKcal">;

const TARGET_KEYS: Record<keyof MealDayTotals, TargetRangeKey> = {
  caloriesKcal: "caloriesKcal",
  proteinG: "proteinG",
  fatG: "fatG",
  carbsG: "carbsG",
  fiberG: "fiberG",
};

function stateOf(value: number | null, low: number, high: number): CardState {
  if (value === null || !Number.isFinite(value)) return "pending";
  if (value < low) return "below";
  if (value > high) return "above";
  return "ok";
}

function formatValue(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(value));
}

export function MealDayTargets({ totals, targets, className, headerAction, compact = false }: MealDayTargetsProps) {
  return (
    <section className={`${styles.root} ${compact ? styles.rootCompact : ""} ${className ?? ""}`} aria-labelledby="meal-day-targets-title">
      <div className={styles.header}>
        <h3 id="meal-day-targets-title">Cibles du jour</h3>
        {headerAction}
      </div>
      <ul className={styles.grid}>
        {CARDS.map((card) => {
          const range = targets[TARGET_KEYS[card.key]];
          const value = totals?.[card.key] ?? null;
          const state = stateOf(value, range.low, range.high);
          const max = Math.max(1, range.high);
          const clamped = value === null ? 0 : Math.min(Math.max(0, value), max);
          const percent = Math.round((clamped / max) * 100);
          const valueText = formatValue(value);

          return (
            <li className={styles.card} data-metric={card.tone} key={card.key}>
              <span className={styles.label}>{card.label}</span>
              <span className={styles.value}>
                {valueText}
                <small>{card.unit}</small>
              </span>
              <span className={styles.target}>
                Cible {range.low}–{range.high} {card.unit}
              </span>
              <div
                className={styles.track}
                role="progressbar"
                aria-label={`${card.label} : ${valueText} ${card.unit}, cible ${range.low} à ${range.high} ${card.unit}`}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={value === null ? undefined : Math.round(clamped)}
                aria-valuetext={`${valueText} ${card.unit} sur cible ${range.low} à ${range.high} ${card.unit}`}
              >
                <div className={styles.fill} data-state={state} style={{ width: `${percent}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default MealDayTargets;
