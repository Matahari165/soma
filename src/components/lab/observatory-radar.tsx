"use client";
import { Fragment, startTransition, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { MEAL_TOTALS_EVENT, MEAL_TOTALS_REQUEST_EVENT, type MealTotalsEventDetail } from "@/domain/meal-record";
type RadarNumber = number | null | undefined;
type RadarData = { sleepMinutes:RadarNumber; recoveryScore:RadarNumber; effortScore:RadarNumber; caloriesKcal:RadarNumber; calorieTarget?:RadarNumber; averageSleepMinutes:RadarNumber; averageRecoveryScore:RadarNumber; averageEffortScore:RadarNumber; averageCaloriesKcal:RadarNumber };
const DEFAULT_RADAR_RADIUS = 430;
const SLEEP_TARGET_MINUTES = 510;
function measured(value: RadarNumber): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function nullable(value: RadarNumber): number | null {
  return measured(value) ? value : null;
}
function formatDuration(minutes: number) {
  return `${Math.floor(minutes/60)}h ${Math.round(minutes%60).toString().padStart(2,"0")}`;
}
function moveRadarFocus(event: KeyboardEvent<SVGGElement>, index: number, count: number) {
  const svg = event.currentTarget.closest("svg");
  if (!svg) return;
  const buttons = Array.from(svg.querySelectorAll<SVGGElement>('[role="button"]'));
  if (!buttons.length) return;
  let next = index;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % count;
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + count) % count;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = count - 1;
  else return;
  event.preventDefault();
  buttons[next]?.focus();
}
export function ObservatoryRadar({data, date, radius = DEFAULT_RADAR_RADIUS, shiftX = 0, shiftY = 0, detailId: detailIdProp, selectedId: selectedIdProp, onSelect: onSelectProp}:{data:RadarData; date?:string; radius?:number; shiftX?:number; shiftY?:number; detailId?:string; selectedId?:string|null; onSelect?:(id:string|null)=>void}) {
  const router = useRouter();
  const sleepMinutes = nullable(data.sleepMinutes);
  const recoveryScore = nullable(data.recoveryScore);
  const effortScore = nullable(data.effortScore);
  const averageSleepMinutes = nullable(data.averageSleepMinutes);
  const averageRecoveryScore = nullable(data.averageRecoveryScore);
  const averageEffortScore = nullable(data.averageEffortScore);
  const averageCaloriesKcal = nullable(data.averageCaloriesKcal);
  const caloriesRef = useRef<number|null>(nullable(data.caloriesKcal));
  const [traceSettledState, setTraceSettled] = useState(false);
  const [calories,setCalories] = useState<number|null>(nullable(data.caloriesKcal));
  const traceSettled = traceSettledState;
  const calorieTargetRef = useRef<number|null>(nullable(data.calorieTarget));
  const [calorieTarget,setCalorieTarget] = useState<number|null>(nullable(data.calorieTarget));
  useEffect(()=>{
    const next=nullable(data.caloriesKcal);
    caloriesRef.current=next;
    startTransition(()=>setCalories(next));
  },[data.caloriesKcal]);
  useEffect(()=>{
    const next = nullable(data.calorieTarget);
    // Une réponse partielle sans cible garde la cible courante ; une cible
    // reçue remplace l’ancienne même si elle est plus basse (pas de max conservé).
    const merged = next === null ? calorieTargetRef.current : next;
    calorieTargetRef.current = merged;
    startTransition(()=>setCalorieTarget(merged));
  },[data.calorieTarget]);
  useEffect(()=>{
    const update=(event:Event)=>{
      const detail=(event as CustomEvent<MealTotalsEventDetail>).detail;
      const matches = date ? detail?.date === date : detail?.isToday;
      if(matches){
        const nextCalories=nullable(detail.calories);
        const nextTarget=nullable(detail.calorieTarget);
        const changed=caloriesRef.current!==nextCalories;
        caloriesRef.current=nextCalories;
        setCalories(nextCalories);
        calorieTargetRef.current=nextTarget;
        setCalorieTarget(nextTarget);
        if(changed)router.refresh();
      }
    };
    window.addEventListener(MEAL_TOTALS_EVENT,update);window.dispatchEvent(new Event(MEAL_TOTALS_REQUEST_EVENT));
    return()=>window.removeEventListener(MEAL_TOTALS_EVENT,update);
  },[router, date]);
  const calorieTargetMeasured = calorieTarget !== null && calorieTarget > 0 ? calorieTarget : null;
  const axes=[
    {id:"sleep",label:"Sommeil",average:averageSleepMinutes,value:sleepMinutes,target:SLEEP_TARGET_MINUTES,unit:"min",display:sleepMinutes===null?"—":formatDuration(sleepMinutes),goal:"8 h 30",source:"Google Health",definition:"Temps de sommeil mesuré comparé au besoin de 8 h 30.",readingDirection:"Plus proche de 8 h 30 = meilleur",role:"Indicateur du jour",formula:"minutes mesurées",normalization:"minutes ÷ 510, plafonné à 100 %"},
    {id:"recovery",label:"Récupération",average:averageRecoveryScore,value:recoveryScore,target:100,unit:"",display:recoveryScore===null?"—":`${Math.round(recoveryScore)}`,goal:"100",source:"Soma",definition:"Score de récupération calculé par Soma à partir de vos signaux.",readingDirection:"Plus élevé = meilleur",role:"Indicateur du jour",formula:"moteur de récupération Soma",normalization:"0–100"},
    {id:"effort",label:"Effort",average:averageEffortScore===null?null:averageEffortScore*.21,value:effortScore===null?null:effortScore*.21,target:21,unit:"",display:effortScore===null?"—":`${(effortScore*.21).toFixed(1)}`,goal:"21 / 21 (100 %)",source:"Soma",definition:"Score d’effort converti sur 21 points.",readingDirection:"Plus élevé = plus de charge accomplie",role:"Indicateur du jour",formula:"score d’effort × 0,21",normalization:"0–21"},
    {id:"calories",label:"Calories",average:averageCaloriesKcal,value:calories,target:calorieTargetMeasured,unit:"kcal",display:calories===null?"—":Math.round(calories).toLocaleString("fr-FR"),goal:calorieTargetMeasured!==null?`${Math.round(calorieTargetMeasured).toLocaleString("fr-FR")} kcal`:"Indisponible",source:"Journal",definition:calorieTargetMeasured!==null?"Énergie des repas confirmés comparée à votre cible.":"Énergie des repas confirmés. Aucune cible personnelle définie : le point n’est pas tracé sur le radar.",readingDirection:calorieTargetMeasured!==null?"Proche de la cible = meilleur":"Comparaison à une cible indisponible",role:"Indicateur du jour",formula:"somme des repas confirmés",normalization:calorieTargetMeasured!==null?"kcal ÷ cible, plafonné à 100 %":"Indisponible sans cible personnelle",targetMissing:calorieTargetMeasured===null},
  ];
  const radarRadius = Number.isFinite(radius) && (radius as number) > 0 ? (radius as number) : DEFAULT_RADAR_RADIUS;
  // Les décalages restent proportionnels au rayon pour que les libellés gardent le même écart relatif.
  const unit = radarRadius / DEFAULT_RADAR_RADIUS;
  const gap = (base: number) => Math.round(base * unit);
  const coordinate=(index:number,ratio:number)=>{const angle=-Math.PI/2+index*Math.PI/2;return [330+Math.cos(angle)*radarRadius*ratio,280+Math.sin(angle)*radarRadius*ratio];};
  const points=axes.map((axis,index)=>axis.value===null||axis.target===null?null:coordinate(index,Math.min(1,Math.max(0,axis.value/axis.target))));
  const validPoints=points.filter((p):p is [number,number]=>p!==null);
  const hasCompleteValueShape = validPoints.length === axes.length;
  const valueSegments = points.flatMap((point, index) => {
    const next = points[(index + 1) % points.length];
    return point && next ? [{ from: point, to: next, sequenceIndex: index }] : [];
  });
  const animatedPoints = points.flatMap((point, index) => point ? [{ point, sequenceIndex: index }] : []);
  const generatedDetailId = useId();
  const detailId = detailIdProp ?? `observatory-radar-detail-${generatedDetailId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const detailTitleId = `${detailId}-title`;
  const [internalSelected, setInternalSelected] = useState<string|null>(null);
  const controlled = selectedIdProp !== undefined && onSelectProp !== undefined;
  const selectedId = controlled ? selectedIdProp : internalSelected;
  const select = (id: string) => {
    const next = selectedId === id ? null : id;
    if (controlled) onSelectProp?.(next);
    else setInternalSelected(next);
  };
  const buttonRefs = useRef<Record<string, SVGGElement|null>>({});
  const mobileButtonRefs = useRef<Record<string, HTMLButtonElement|null>>({});
  const restoreAxisFocus = (id: string) => {
    const mobile = window.matchMedia("(max-width: 700px)").matches;
    (mobile ? mobileButtonRefs.current[id] : buttonRefs.current[id])?.focus();
  };
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selectedAxis = axes.find((axis) => axis.id === selectedId) ?? null;
  const detailOpen = selectedAxis !== null;
  useEffect(() => {
    if (selectedId) headingRef.current?.focus({ preventScroll: true });
  }, [selectedId]);
  useEffect(() => {
    if (!selectedId) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const id = selectedId;
      if (controlled) onSelectProp?.(null);
      else setInternalSelected(null);
      window.requestAnimationFrame(() => restoreAxisFocus(id ?? ""));
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedId, controlled, onSelectProp]);
  function closeDetail(restoreId?: string) {
    const id = restoreId ?? selectedId;
    if (controlled) onSelectProp?.(null);
    else setInternalSelected(null);
    if (id) window.requestAnimationFrame(() => restoreAxisFocus(id));
  }
  return <figure className={`observatory-radar${traceSettled ? " observatory-radar--trace-settled" : ""}`} aria-label="Indicateurs du jour et objectifs disponibles" style={shiftX || shiftY ? { transform: `translate(${shiftX}px, ${shiftY}px)` } : undefined}>
    <svg viewBox="0 0 660 560" role="group" aria-label={`Graphique radar. Le contour représente les objectifs disponibles. ${axes.map(axis => `${axis.label} : ${axis.display} ${axis.unit}. ${axis.value === null || axis.average === null ? "Comparaison indisponible" : axis.value > axis.average ? "Au-dessus de la moyenne sur 30 jours" : axis.value < axis.average ? "Sous la moyenne sur 30 jours" : "Au niveau de la moyenne sur 30 jours"}. Objectif : ${axis.goal}.`).join(" ")}`}>
      {[.25,.5,.75,1].map(ratio=><Fragment key={ratio}>
        <polygon className="radar-grid" points={[0,1,2,3].map(i=>coordinate(i,ratio).join(",")).join(" ")} />
        <path className={`radar-grid-left${ratio === 1 ? " radar-grid-left--outer" : ""}`} d={[0,3,2].map((i,index)=>`${index===0?"M":"L"} ${coordinate(i,ratio).join(" ")}`).join(" ")} />
      </Fragment>)}
      {[0,1,2,3].map(i=><line key={i} className="radar-axis" x1="330" y1="280" x2={coordinate(i,1)[0]} y2={coordinate(i,1)[1]}/>)}
      <g className="radar-data-layer" aria-hidden="true">
        {hasCompleteValueShape&&<polygon className="radar-value" points={validPoints.map(p=>p.join(",")).join(" ")} onAnimationEnd={() => setTraceSettled(true)} />}
        {valueSegments.map(({ from, to, sequenceIndex })=><line className="radar-value-segment" data-radar-trace="" data-radar-segment-index={sequenceIndex} pathLength="1" style={{ "--radar-segment-index": sequenceIndex } as CSSProperties} key={`radar-value-segment-${sequenceIndex}`} x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} />)}
        {animatedPoints.map(({ point, sequenceIndex })=><circle className="radar-point" data-radar-point="" data-radar-point-index={sequenceIndex} style={{ "--radar-point-index": sequenceIndex } as CSSProperties} key={sequenceIndex} cx={point[0]} cy={point[1]} r={Math.round(8*unit*10)/10}/>)}
      </g>
      {axes.map((axis,i)=>{
        const trend=axis.value===null||axis.average===null?"":axis.value>axis.average?"↑":axis.value<axis.average?"↓":"↔";
        const comparison=trend==="↑"?"Au-dessus de la moyenne sur 30 jours":trend==="↓"?"Sous la moyenne sur 30 jours":trend==="↔"?"Au niveau de la moyenne sur 30 jours":"Moyenne indisponible";
        const selected = selectedId === axis.id;
        const readable = `${axis.label} : ${axis.display}${axis.unit ? ` ${axis.unit}` : ""}. ${comparison}. Objectif : ${axis.goal}. Afficher les détails de cette dimension.`;
        let labelX = 330;
        let labelY = 280;
        let numberX = 330;
        let numberY = 280;
        let textAnchor: "middle" | "start" | "end" = "middle";

        if (i === 0) {
          const [, yEdge] = coordinate(0, 1);
          labelX = 330;
          labelY = yEdge - gap(72);
          numberX = 330;
          numberY = yEdge - gap(38);
          textAnchor = "middle";
        } else if (i === 1) {
          const [xEdge, yEdge] = coordinate(1, 1);
          labelX = xEdge + gap(42);
          labelY = yEdge - 8;
          numberX = xEdge + gap(42);
          numberY = yEdge + 10;
          textAnchor = "start";
        } else if (i === 2) {
          const [, yEdge] = coordinate(2, 1);
          labelX = 330;
          labelY = yEdge + gap(68);
          numberX = 330;
          numberY = yEdge + gap(100);
          textAnchor = "middle";
        } else if (i === 3) {
          const [xEdge, yEdge] = coordinate(3, 1);
          labelX = xEdge - gap(42);
          labelY = yEdge - 8;
          numberX = xEdge - gap(42);
          numberY = yEdge + 10;
          textAnchor = "end";
        }

        const valueText = axis.label === "Calories"
          ? (trend ? `${trend} ${axis.display} kcal` : `${axis.display} kcal`)
          : (`${axis.display}${axis.unit === "kcal" ? " kcal" : ""}${trend ? ` ${trend}` : ""}${selected ? " ●" : ""}`);

        function handleKeyDown(event: KeyboardEvent<SVGGElement>) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            select(axis.id);
            return;
          }
          if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            moveRadarFocus(event, i, axes.length);
          }
        }

        return (
          <g key={axis.id} className={`radar-axis-label radar-axis-label--${i}`} role="button" tabIndex={0} aria-controls={detailId} aria-expanded={selected} aria-label={readable} data-selected={selected} onClick={() => select(axis.id)} onKeyDown={handleKeyDown} ref={(node) => { buttonRefs.current[axis.id] = node; }}>
            <title>{`${axis.label} : ${axis.display}. ${comparison}. Objectif : ${axis.goal}.`}</title>
            <rect className="radar-hit-area" x={textAnchor === "start" ? labelX - 10 : textAnchor === "end" ? labelX - 170 : labelX - 110} y={labelY - 37} width={textAnchor === "middle" ? 220 : 180} height={Math.max(82, numberY - labelY + 35)} rx="4" fill="transparent" stroke="transparent" aria-hidden="true" />
            <text x={labelX} y={labelY} textAnchor={textAnchor} className="radar-label" aria-hidden="true">{axis.label}</text>
            <text x={numberX} y={numberY} textAnchor={textAnchor} className="radar-number" aria-hidden="true">{valueText}</text>
          </g>
        );
      })}
    </svg>
    <div className="observatory-radar__mobile-labels">
      {axes.map((axis, index) => {
        const trend = axis.value === null || axis.average === null ? "" : axis.value > axis.average ? "↑" : axis.value < axis.average ? "↓" : "↔";
        return <button key={axis.id} ref={(node) => { mobileButtonRefs.current[axis.id] = node; }} type="button" className={`observatory-radar__mobile-label observatory-radar__mobile-label--${index}`} aria-controls={detailId} aria-expanded={selectedId === axis.id} onClick={() => select(axis.id)}>
          <span>{axis.label}</span>
          <strong>{axis.display}{axis.unit ? ` ${axis.unit}` : ""}{trend ? ` ${trend}` : ""}</strong>
        </button>;
      })}
    </div>
    <aside id={detailId} aria-labelledby={detailTitleId} aria-hidden={!detailOpen} inert={!detailOpen} style={{ display: detailOpen ? "block" : "none", minHeight: 44 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
        <h3 id={detailTitleId} ref={headingRef} tabIndex={-1} style={{ margin: 0 }}>{selectedAxis ? selectedAxis.label : "Détail"}</h3>
        <button type="button" onClick={() => closeDetail()} tabIndex={detailOpen ? 0 : -1} style={{ minHeight: 44, minWidth: 44 }} aria-label={selectedAxis ? `Fermer les détails de ${selectedAxis.label}` : "Fermer les détails"}>Fermer</button>
      </div>
      {selectedAxis && (
        <dl>
          <div><dt>Valeur actuelle</dt><dd>{selectedAxis.display}{selectedAxis.unit ? ` ${selectedAxis.unit}` : ""}</dd></div>
          <div><dt>Moy. 30 j</dt><dd>{selectedAxis.average === null ? "—" : selectedAxis.id === "sleep" ? formatDuration(Math.round(selectedAxis.average)) : selectedAxis.id === "effort" ? selectedAxis.average.toFixed(1) : selectedAxis.id === "calories" ? Math.round(selectedAxis.average).toLocaleString("fr-FR") : Math.round(selectedAxis.average)}</dd></div>
          <div><dt>Sens de lecture</dt><dd>{selectedAxis.readingDirection}</dd></div>
          <div><dt>Rôle</dt><dd>{selectedAxis.role}</dd></div>
          <div><dt>Formule</dt><dd>{selectedAxis.formula}</dd></div>
          <div><dt>Normalisation</dt><dd>{selectedAxis.normalization}</dd></div>
          <div><dt>Objectif</dt><dd>{selectedAxis.goal}</dd></div>
          <div><dt>Source</dt><dd>{selectedAxis.source}</dd></div>
        </dl>
      )}
      {selectedAxis && <p>{selectedAxis.definition}</p>}
    </aside>
  </figure>;
}

export const OBSERVATORY_RADAR_PRESENTATION = {
  // Keep the outer labels inside the 660 × 560 viewBox. The previous
  // presentation radius placed the top and bottom values outside the SVG,
  // where the arrival composition could clip them at some viewport heights.
  size: 220,
  shiftY: -24,
  shiftX: -24,
  backdrop: "mont-nuages-user",
} as const;
