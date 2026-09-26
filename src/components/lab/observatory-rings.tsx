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
    { id: "sleep", label: "Sommeil", value: data.sleepMinutes, target: 510, display: valid(data.sleepMinutes) ? duration(data.sleepMinutes) : "—", ringDisplay: valid(data.sleepMinutes) ? duration(data.sleepMinutes).replace(" ", "") : "—", goal: "8h 30", color: "#a9d8f2", labelColor: "#86bada" },
    { id: "recovery", label: "Récupération", value: data.recoveryScore, target: 100, display: valid(data.recoveryScore) ? String(Math.round(data.recoveryScore)) : "—", ringDisplay: valid(data.recoveryScore) ? String(Math.round(data.recoveryScore)) : "—", goal: "100", color: "#a7e0c4", labelColor: "#83c4a4" },
    { id: "effort", label: "Effort", value: data.effortScore, target: 100, display: valid(data.effortScore) ? (data.effortScore * .21).toFixed(1) : "—", ringDisplay: valid(data.effortScore) ? (data.effortScore * .21).toFixed(1) : "—", goal: "21", color: "#f1c995", labelColor: "#d0a46f" },
    { id: "calories", label: "Calories", value: calories, target: calorieTarget, display: valid(calories) ? `${Math.round(calories).toLocaleString("fr-FR")} kcal` : "—", ringDisplay: valid(calories) ? String(Math.round(calories)) : "—", goal: valid(calorieTarget) && calorieTarget > 0 ? `${Math.round(calorieTarget).toLocaleString("fr-FR")} kcal` : "—", color: "#dfb9ef", labelColor: "#b88cd1" },
  ] as const;
  const details = {
    sleep: { reference: "Repère de sommeil", description: "Durée de sommeil issue des mesures synchronisées. Le repère de cet anneau est de 8 h 30.", average: valid(data.averageSleepMinutes) ? duration(data.averageSleepMinutes) : null, href: "/sleep" },
    recovery: { reference: "Échelle du score", description: "Score calculé par Soma à partir des signaux de récupération disponibles. Plus il est élevé, meilleure est la récupération estimée.", average: valid(data.averageRecoveryScore) ? String(Math.round(data.averageRecoveryScore)) : null, href: "/recovery" },
    effort: { reference: "Échelle de charge", description: "Charge quotidienne calculée par Soma, affichée sur 21. Une valeur plus élevée signifie davantage d’effort, pas une meilleure récupération.", average: valid(data.averageEffortScore) ? (data.averageEffortScore * .21).toFixed(1) : null, href: "/activity" },
    calories: { reference: "Cible alimentaire", description: "Énergie des repas confirmés dans le journal. Le total est comparé à votre cible lorsqu’elle est renseignée.", average: valid(data.averageCaloriesKcal) ? `${Math.round(data.averageCaloriesKcal).toLocaleString("fr-FR")} kcal` : null, href: "/meals" },
  };
  const activeId = hoveredId ?? focusedId ?? selectedId;
  const selectedRing = rings.find(ring => ring.id === (selectedId ?? lastSelectedId));
  const selectedDetail = selectedRing ? details[selectedRing.id] : null;

  return <figure ref={figureRef} className={styles.figure} data-home-rings="" data-expanded={Boolean(selectedId)} aria-label="Progression du jour pour le sommeil, la récupération, l’effort et les calories" onKeyDown={event => {
    if (event.key === "Escape" && selectedId) { event.preventDefault(); closeDetail(); }
  }}>
    <div className={styles.visual}>
      <svg className={styles.chart} viewBox="0 0 320 320" role="group" aria-label={rings.map(ring => `${ring.label} : ${ring.display}, objectif ${ring.goal}${progress(ring.value, ring.target) === null ? ", progression indisponible" : `, ${Math.round(progress(ring.value, ring.target)! * 100)} % de l’objectif`}`).join(". ")}>
        <defs>{rings.map((ring, index) => <path key={ring.id} id={`${ringPathPrefix}-${ring.id}`} d={ringTextPath(136 - index * 29)} />)}</defs>
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
            }} style={{ "--ring-color": ring.color, "--ring-label": ring.labelColor, "--ring-radius": `${radius}px`, "--ring-delay": `${index * 90}ms` } as CSSProperties}>
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
            <circle className={styles.focusRing} cx="160" cy="160" r={radius} />
            <text className={styles.ringNumber} data-ring-value={ring.id} dy="6" aria-hidden="true"><textPath href={`#${ringPathPrefix}-${ring.id}`} startOffset="0%">{ring.ringDisplay}</textPath></text>
            <circle className={styles.hitArea} cx="160" cy="160" r={radius} />
          </g>;
        })}
      </svg>
    </div>
    <aside id={detailId} className={styles.detail} aria-hidden={!selectedId} inert={!selectedId} aria-labelledby={`${detailId}-title`}>
      {selectedRing && selectedDetail && <div className={styles.detailContent}>
        <div className={styles.detailHeader}><h2 ref={headingRef} tabIndex={-1} id={`${detailId}-title`}>{selectedRing.label}</h2><button type="button" className={styles.close} onClick={closeDetail} aria-label="Fermer le détail"><X size={18} aria-hidden="true" /></button></div>
        <p className={styles.detailValue}>{selectedRing.display}</p>
        <dl className={styles.facts}>
          <div><dt>{selectedDetail.reference}</dt><dd>{selectedRing.goal === "—" ? "Non renseignée" : selectedRing.goal}</dd></div>
          <div><dt>Progression</dt><dd>{progress(selectedRing.value, selectedRing.target) === null ? "Indisponible" : `${Math.round(progress(selectedRing.value, selectedRing.target)! * 100)} %`}</dd></div>
          {selectedRing.id === "effort" && valid(selectedRing.value) && <div><dt>Score d’activité Soma</dt><dd>{Math.round(selectedRing.value)} / 100</dd></div>}
          {selectedDetail.average && <div><dt>Moyenne sur 30 jours</dt><dd>{selectedDetail.average}</dd></div>}
        </dl>
        <p className={styles.description}>{valid(selectedRing.value) ? selectedDetail.description : "Aucune mesure disponible pour ce jour."}</p>
        <a className={styles.link} href={`${selectedDetail.href}${date ? `?date=${encodeURIComponent(date)}` : ""}`}>Voir {selectedRing.id === "calories" ? "les repas" : selectedRing.id === "effort" ? "l’activité" : selectedRing.id === "sleep" ? "le sommeil" : "la récupération"}</a>
      </div>}
    </aside>
  </figure>;
}
