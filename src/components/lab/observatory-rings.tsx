"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { X } from "lucide-react";
import { MEAL_TOTALS_EVENT, MEAL_TOTALS_REQUEST_EVENT, type MealTotalsEventDetail } from "@/domain/meal-record";
import styles from "./observatory-rings.module.css";

type Measure = number | null | undefined;
export type ObservatoryRingsData = {
  sleepMinutes: Measure;
  recoveryScore: Measure;
  effortScore: Measure;
  caloriesKcal: Measure;
  calorieTarget?: Measure;
  averageSleepMinutes?: Measure;
  averageRecoveryScore?: Measure;
  averageEffortScore?: Measure;
  averageCaloriesKcal?: Measure;
};

const valid = (value: Measure): value is number => typeof value === "number" && Number.isFinite(value);
const progress = (value: Measure, target: Measure) => valid(value) && valid(target) && target > 0 ? Math.max(0, value / target) : null;
const duration = (minutes: number) => `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60).toString().padStart(2, "0")}`;
const ringStartAngle = -90;
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
  const detailId = `${ringPathPrefix}-detail`;
  const figureRef = useRef<HTMLElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const select = (id: string) => {
    setLastSelectedId(id);
    setSelectedId(current => current === id ? null : id);
  };
  useEffect(() => {
    if (selectedId) headingRef.current?.focus({ preventScroll: true });
  }, [selectedId]);
  useEffect(() => {
    if (!selectedId) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.button !== 0 || !(event.target instanceof Node)) return;
      const figure = figureRef.current;
      if (figure?.querySelector("svg")?.contains(event.target) || figure?.querySelector("aside")?.contains(event.target)) return;
      setSelectedId(null);
      setFocusedId(null);
      setHoveredId(null);
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    return () => document.removeEventListener("pointerdown", dismissOutside, true);
  }, [selectedId]);
  const closeDetail = () => {
    figureRef.current?.querySelector<SVGGElement>(`[data-ring="${selectedId}"]`)?.focus();
    setSelectedId(null);
  };
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
    { id: "sleep", label: "Sommeil", value: data.sleepMinutes, target: 510, display: valid(data.sleepMinutes) ? duration(data.sleepMinutes) : "—", ringDisplay: valid(data.sleepMinutes) ? duration(data.sleepMinutes).replace(" ", "") : "—", goal: "8h 30", color: "var(--lab-ring-sleep)", labelColor: "var(--lab-ring-sleep-label)" },
    { id: "recovery", label: "Récupération", value: data.recoveryScore, target: 100, display: valid(data.recoveryScore) ? String(Math.round(data.recoveryScore)) : "—", ringDisplay: valid(data.recoveryScore) ? String(Math.round(data.recoveryScore)) : "—", goal: "100", color: "var(--lab-ring-recovery)", labelColor: "var(--lab-ring-recovery-label)" },
    { id: "effort", label: "Effort", value: data.effortScore, target: 100, display: valid(data.effortScore) ? (data.effortScore * .21).toFixed(1) : "—", ringDisplay: valid(data.effortScore) ? (data.effortScore * .21).toFixed(1) : "—", goal: "21", color: "var(--lab-ring-effort)", labelColor: "var(--lab-ring-effort-label)" },
    { id: "calories", label: "Calories", value: calories, target: calorieTarget, display: valid(calories) ? `${Math.round(calories).toLocaleString("fr-FR")} kcal` : "—", ringDisplay: valid(calories) ? String(Math.round(calories)) : "—", goal: valid(calorieTarget) && calorieTarget > 0 ? `${Math.round(calorieTarget).toLocaleString("fr-FR")} kcal` : "—", color: "var(--lab-ring-calories)", labelColor: "var(--lab-ring-calories-label)" },
  ] as const;
  const details = {
    sleep: { reference: "Repère de sommeil", average: valid(data.averageSleepMinutes) ? duration(data.averageSleepMinutes) : null },
    recovery: { reference: "Échelle du score", average: valid(data.averageRecoveryScore) ? String(Math.round(data.averageRecoveryScore)) : null },
    effort: { reference: "Échelle de charge", average: valid(data.averageEffortScore) ? (data.averageEffortScore * .21).toFixed(1) : null },
    calories: { reference: "Cible alimentaire", average: valid(data.averageCaloriesKcal) ? `${Math.round(data.averageCaloriesKcal).toLocaleString("fr-FR")} kcal` : null },
  };
  const activeId = hoveredId ?? focusedId ?? selectedId;
  const selectedRing = rings.find(ring => ring.id === (selectedId ?? lastSelectedId));
  const selectedDetail = selectedRing ? details[selectedRing.id] : null;

  return <figure ref={figureRef} className={styles.figure} data-home-rings="" data-expanded={Boolean(selectedId)} aria-label="Progression du jour pour le sommeil, la récupération, l’effort et les calories" onKeyDown={event => {
    if (event.key === "Escape" && selectedId) { event.preventDefault(); closeDetail(); }
  }}>
    <div className={styles.visual}>
      <svg className={styles.chart} viewBox="0 0 320 320" role="group" aria-label={rings.map(ring => `${ring.label} : ${ring.display}, objectif ${ring.goal}${progress(ring.value, ring.target) === null ? ", progression indisponible" : `, ${Math.round(progress(ring.value, ring.target)! * 100)} % de l’objectif`}`).join(". ")}>
        <defs><filter id={`${ringPathPrefix}-lap-shadow`} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB"><feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000" className={styles.overlapShadow} /></filter>{rings.map((ring, index) => <path key={ring.id} id={`${ringPathPrefix}-${ring.id}`} d={ringTextPath(136 - index * 29)} />)}</defs>
        {rings.map((ring, index) => {
          const radius = 136 - index * 29;
          const ratio = progress(ring.value, ring.target);
          const dash = `${Math.min(1, ratio ?? 0) * 100} 100`;
          const extraLaps = ratio === null ? 0 : Math.max(0, Math.floor(ratio) - 1);
          const overflow = ratio !== null && ratio > 1 ? ratio % 1 : 0;
          const end = ratio !== null && ratio > 1 ? ringPoint(radius, ringStartAngle + overflow * 360) : null;
          return <g key={ring.id} className={styles.control} data-ring={ring.id} data-turns={ratio === null ? undefined : ratio} data-active={activeId === ring.id} data-dimmed={Boolean(activeId && activeId !== ring.id)} role="button" tabIndex={0} aria-label={`${ring.label} : ${ring.display}. Afficher les détails`} aria-expanded={selectedId === ring.id} aria-controls={detailId}
            onPointerEnter={event => { if (event.pointerType === "mouse") setHoveredId(ring.id); }} onPointerLeave={() => setHoveredId(null)}
            onFocus={() => setFocusedId(ring.id)} onBlur={() => setFocusedId(null)}
            onClick={() => select(ring.id)}
            onKeyDown={event => {
              if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(ring.id); return; }
              const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : ["ArrowLeft", "ArrowUp"].includes(event.key) ? -1 : 0;
              if (direction || event.key === "Home" || event.key === "End") {
                event.preventDefault();
                const next = event.key === "Home" ? 0 : event.key === "End" ? rings.length - 1 : (index + direction + rings.length) % rings.length;
                figureRef.current?.querySelector<SVGGElement>(`[data-ring="${rings[next].id}"]`)?.focus();
              }
            }} style={{ "--ring-color": ring.color, "--ring-label": ring.labelColor, "--ring-radius": `${radius}px`, "--ring-extra-laps": extraLaps, "--ring-delay": `${index * 40}ms` } as CSSProperties}>
            <g className={styles.ring} transform={`rotate(${ringStartAngle} 160 160)`}>
              <circle className={styles.track} cx="160" cy="160" r={radius} />
              {ratio !== null && <circle className={styles.progress} data-complete={ratio >= 1} cx="160" cy="160" r={radius} pathLength="100" strokeDasharray={dash} />}
              {ratio === null && <circle className={styles.unknown} cx="160" cy="160" r={radius} pathLength="100" strokeDasharray="1 2.8" />}
              {extraLaps > 0 && <circle className={styles.completedOverlap} cx="160" cy="160" r={radius} pathLength="100" strokeDasharray="100 100" />}
              {overflow > 0 && <circle className={styles.overlap} filter={`url(#${ringPathPrefix}-lap-shadow)`} cx="160" cy="160" r={radius} pathLength="100" strokeDasharray={`${overflow * 100} 100`} />}
            </g>
            {end && overflow === 0 && <circle className={styles.lapEnd} data-lap-end={ring.id} filter={`url(#${ringPathPrefix}-lap-shadow)`} cx={end.x} cy={end.y} r="13.5" />}
            <circle className={styles.focusRing} cx="160" cy="160" r={radius} />
            <text className={styles.ringNumber} data-ring-value={ring.id} dy="6" aria-hidden="true"><textPath href={`#${ringPathPrefix}-${ring.id}`} startOffset="8">{ring.ringDisplay}</textPath></text>
            <circle className={styles.hitArea} cx="160" cy="160" r={radius} />
          </g>;
        })}
      </svg>
    </div>
    <aside id={detailId} className={styles.detail} aria-hidden={!selectedId} inert={!selectedId} aria-labelledby={`${detailId}-title`}>
      {selectedRing && selectedDetail && <div className={styles.detailContent}>
        <div className={styles.detailHeader}><h2 ref={headingRef} tabIndex={-1} id={`${detailId}-title`}>{selectedRing.label}</h2><button type="button" className={styles.close} onClick={closeDetail} aria-label="Fermer le détail"><X size={18} aria-hidden="true" /></button></div>
        <p className={styles.detailValue}>{selectedRing.display}</p>
        {!valid(selectedRing.value) && <p className={styles.unavailable}>Aucune mesure disponible pour ce jour.</p>}
        <dl className={styles.facts}>
          <div><dt>{selectedDetail.reference}</dt><dd>{selectedRing.goal === "—" ? "Non renseignée" : selectedRing.goal}</dd></div>
          <div><dt>Progression</dt><dd>{progress(selectedRing.value, selectedRing.target) === null ? "Indisponible" : `${Math.round(progress(selectedRing.value, selectedRing.target)! * 100)} %`}</dd></div>
          {selectedRing.id === "effort" && valid(selectedRing.value) && <div><dt>Score d’activité Soma</dt><dd>{Math.round(selectedRing.value)} / 100</dd></div>}
          {selectedDetail.average && <div><dt>Moyenne sur 30 jours</dt><dd>{selectedDetail.average}</dd></div>}
        </dl>
      </div>}
    </aside>
  </figure>;
}
