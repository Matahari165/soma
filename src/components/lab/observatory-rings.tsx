"use client";

import { useEffect, useId, useState, type CSSProperties } from "react";
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
const progress = (value: Measure, target: Measure) => valid(value) && valid(target) && target > 0 ? Math.max(0, value / target) : null;
const duration = (minutes: number) => `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60).toString().padStart(2, "0")}`;
const ringStartAngle = -100;
const ringPoint = (radius: number, angle: number) => {
  const radians = angle * Math.PI / 180;
  return { x: 160 + radius * Math.cos(radians), y: 160 + radius * Math.sin(radians) };
};
const ringTextPath = (radius: number) => {
  const start = ringPoint(radius, ringStartAngle);
  const opposite = ringPoint(radius, ringStartAngle + 180);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${opposite.x} ${opposite.y} A ${radius} ${radius} 0 1 1 ${start.x} ${start.y}`;
};

export function ObservatoryRings({ data, date }: { data: ObservatoryRingsData; date?: string }) {
  const ringPathPrefix = useId();
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
    { id: "sleep", label: "Sommeil", value: data.sleepMinutes, target: 510, display: valid(data.sleepMinutes) ? duration(data.sleepMinutes) : "—", ringDisplay: valid(data.sleepMinutes) ? duration(data.sleepMinutes).replace(" ", "") : "—", goal: "8h 30", color: "#c7e1f1", labelColor: "#98c0dc" },
    { id: "recovery", label: "Récupération", value: data.recoveryScore, target: 100, display: valid(data.recoveryScore) ? String(Math.round(data.recoveryScore)) : "—", ringDisplay: valid(data.recoveryScore) ? String(Math.round(data.recoveryScore)) : "—", goal: "100", color: "#c4e7d3", labelColor: "#99cbae" },
    { id: "effort", label: "Effort", value: data.effortScore, target: 100, display: valid(data.effortScore) ? (data.effortScore * .21).toFixed(1) : "—", ringDisplay: valid(data.effortScore) ? (data.effortScore * .21).toFixed(1) : "—", goal: "21", color: "#f0d5b0", labelColor: "#d5b38a" },
    { id: "calories", label: "Calories", value: calories, target: calorieTarget, display: valid(calories) ? `${Math.round(calories).toLocaleString("fr-FR")} kcal` : "—", ringDisplay: valid(calories) ? String(Math.round(calories)) : "—", goal: valid(calorieTarget) && calorieTarget > 0 ? `${Math.round(calorieTarget).toLocaleString("fr-FR")} kcal` : "—", color: "#e4cdee", labelColor: "#c2a6d4" },
  ] as const;

  const dateLabel = date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00Z`)).toUpperCase()
    : "AUJOURD’HUI";

  return <figure className={styles.figure} data-home-rings="" aria-label="Progression du jour pour le sommeil, la récupération, l’effort et les calories">
    <div className={styles.visual}>
      <svg className={styles.chart} viewBox="0 0 320 320" role="img" aria-label={rings.map(ring => `${ring.label} : ${ring.display}, objectif ${ring.goal}${progress(ring.value, ring.target) === null ? ", progression indisponible" : `, ${Math.round(progress(ring.value, ring.target)! * 100)} % de l’objectif`}`).join(". ")}>
        <defs>{rings.map((ring, index) => <path key={ring.id} id={`${ringPathPrefix}-${ring.id}`} d={ringTextPath(136 - index * 29)} />)}</defs>
        {rings.map((ring, index) => {
          const radius = 136 - index * 29;
          const ratio = progress(ring.value, ring.target);
          const dash = `${Math.min(1, ratio ?? 0) * 100} 100`;
          const extraLaps = ratio === null ? 0 : Math.max(0, Math.floor(ratio) - 1);
          const overflow = ratio !== null && ratio > 1 ? ratio % 1 : 0;
          const end = ratio !== null && ratio > 1 ? ringPoint(radius, ringStartAngle + overflow * 360) : null;
          return <g key={ring.id} data-ring={ring.id} data-turns={ratio === null ? undefined : ratio} style={{ "--ring-color": ring.color, "--ring-delay": `${index * 90}ms` } as CSSProperties}>
            <g className={styles.ring} transform={`rotate(${ringStartAngle} 160 160)`}>
              <circle className={styles.track} cx="160" cy="160" r={radius} />
              {ratio !== null && <circle className={styles.progress} cx="160" cy="160" r={radius} pathLength="100" strokeDasharray={dash} />}
              {ratio !== null && ratio > 0 && <>
                <circle className={styles.glassEdge} cx="160" cy="160" r={radius + 12} pathLength="100" strokeDasharray={dash} />
                <circle className={styles.glassEdgeInner} cx="160" cy="160" r={radius - 12} pathLength="100" strokeDasharray={dash} />
              </>}
              {ratio === null && <circle className={styles.unknown} cx="160" cy="160" r={radius} pathLength="100" strokeDasharray="1 2.8" />}
              {extraLaps > 0 && <circle className={styles.completedOverlap} cx="160" cy="160" r={radius} pathLength="100" strokeDasharray="100 100" strokeOpacity={Math.min(.22 + extraLaps * .1, .5)} />}
              {overflow > 0 && <circle className={styles.overlap} cx="160" cy="160" r={radius} pathLength="100" strokeDasharray={`${overflow * 100} 100`} />}
            </g>
            {end && <circle className={styles.lapEnd} data-lap-end={ring.id} cx={end.x} cy={end.y} r="13.5" />}
          </g>;
        })}
        {rings.map(ring => <text key={ring.id} className={styles.ringNumber} data-ring-value={ring.id} style={{ "--ring-label": ring.labelColor } as CSSProperties} dy="6" aria-hidden="true"><textPath href={`#${ringPathPrefix}-${ring.id}`} startOffset="2%">{ring.ringDisplay}</textPath></text>)}
        <text className={styles.centerTop} x="160" y="158" textAnchor="middle">{dateLabel}</text>
        <text className={styles.centerBottom} x="160" y="176" textAnchor="middle">OBJECTIFS</text>
      </svg>
    </div>
  </figure>;
}
