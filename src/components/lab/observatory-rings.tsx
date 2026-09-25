"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { MEAL_TOTALS_EVENT, MEAL_TOTALS_REQUEST_EVENT, type MealTotalsEventDetail } from "@/domain/meal-record";
import styles from "./observatory-rings.module.css";

type Measure = number | null | undefined;
export type ObservatoryRingsData = {
  sleepMinutes: Measure;
  recoveryScore: Measure;
  effortScore: Measure;
  caloriesKcal: Measure;
  calorieTarget?: Measure;
};

const valid = (value: Measure): value is number => typeof value === "number" && Number.isFinite(value);
const progress = (value: Measure, target: Measure) => valid(value) && valid(target) && target > 0 ? Math.min(1, Math.max(0, value / target)) : null;
const duration = (minutes: number) => `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60).toString().padStart(2, "0")}`;

export function ObservatoryRings({ data, date }: { data: ObservatoryRingsData; date?: string }) {
  const [mealTotals, setMealTotals] = useState<{ date?: string; calories: Measure; target: Measure } | null>(null);
  const calories = mealTotals && mealTotals.date === date ? mealTotals.calories : data.caloriesKcal;
  const calorieTarget = mealTotals && mealTotals.date === date ? mealTotals.target : data.calorieTarget;

  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<MealTotalsEventDetail>).detail;
      if (date ? detail?.date !== date : !detail?.isToday) return;
      setMealTotals((current) => ({
        date,
        calories: detail.calories,
        target: detail.calorieTarget ?? (current && current.date === date ? current.target : data.calorieTarget),
      }));
    };
    window.addEventListener(MEAL_TOTALS_EVENT, update);
    window.dispatchEvent(new Event(MEAL_TOTALS_REQUEST_EVENT));
    return () => window.removeEventListener(MEAL_TOTALS_EVENT, update);
  }, [date, data.calorieTarget]);

  const rings = [
    { id: "sleep", label: "Sommeil", value: data.sleepMinutes, target: 510, display: valid(data.sleepMinutes) ? duration(data.sleepMinutes) : "—", goal: "8h 30", color: "#d4e6ee" },
    { id: "recovery", label: "Récupération", value: data.recoveryScore, target: 100, display: valid(data.recoveryScore) ? String(Math.round(data.recoveryScore)) : "—", goal: "100", color: "#bad8c8" },
    { id: "effort", label: "Effort", value: data.effortScore, target: 100, display: valid(data.effortScore) ? (data.effortScore * .21).toFixed(1) : "—", goal: "21", color: "#d7c9af" },
    { id: "calories", label: "Calories", value: calories, target: calorieTarget, display: valid(calories) ? `${Math.round(calories).toLocaleString("fr-FR")} kcal` : "—", goal: valid(calorieTarget) && calorieTarget > 0 ? `${Math.round(calorieTarget).toLocaleString("fr-FR")} kcal` : "—", color: "#d3bfd4" },
  ] as const;

  const dateLabel = date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00Z`)).toUpperCase()
    : "AUJOURD’HUI";

  return <figure className={styles.figure} data-home-rings="" aria-label="Progression du jour pour le sommeil, la récupération, l’effort et les calories">
    <div className={styles.visual}>
      <svg className={styles.chart} viewBox="0 0 420 420" role="img" aria-label={rings.map(ring => `${ring.label} : ${ring.display}, objectif ${ring.goal}${progress(ring.value, ring.target) === null ? ", progression indisponible" : `, ${Math.round(progress(ring.value, ring.target)! * 100)} % de l’objectif`}`).join(". ")}>
        {rings.map((ring, index) => {
          const radius = 172 - index * 39;
          const ratio = progress(ring.value, ring.target);
          return <g key={ring.id} className={styles.ring} style={{ "--ring-color": ring.color, "--ring-delay": `${index * 90}ms` } as CSSProperties}>
            <circle className={styles.track} cx="210" cy="210" r={radius} />
            {ratio !== null && <circle className={styles.progress} cx="210" cy="210" r={radius} pathLength="100" strokeDasharray={`${Math.max(0, ratio * 100)} 100`} />}
            {ratio === null && <circle className={styles.unknown} cx="210" cy="210" r={radius} pathLength="100" strokeDasharray="1 2.8" />}
          </g>;
        })}
        <text className={styles.centerTop} x="210" y="205" textAnchor="middle">{dateLabel}</text>
        <text className={styles.centerBottom} x="210" y="229" textAnchor="middle">OBJECTIFS</text>
      </svg>
    </div>
    <figcaption className={styles.legend}>
      {rings.map(ring => {
        const ratio = progress(ring.value, ring.target);
        return <div className={styles.metric} key={ring.id} style={{ "--ring-color": ring.color } as CSSProperties}>
          <span className={styles.marker} aria-hidden="true" />
          <span className={styles.label}>{ring.label}</span>
          <strong className={styles.value}>{ring.display}</strong>
          <span className={styles.goal}>{!valid(ring.value) ? "Donnée indisponible" : ratio === null ? "Objectif indisponible" : `${Math.round(ratio * 100)} % de l’objectif`}</span>
        </div>;
      })}
    </figcaption>
  </figure>;
}
