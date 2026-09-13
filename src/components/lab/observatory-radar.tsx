"use client";
import { Fragment, startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MEAL_TOTALS_EVENT, MEAL_TOTALS_REQUEST_EVENT, type MealTotalsEventDetail } from "@/domain/meal-record";
type RadarData = { sleepMinutes:number|null; recoveryScore:number|null; effortScore:number|null; caloriesKcal:number|null; averageSleepMinutes:number|null; averageRecoveryScore:number|null; averageEffortScore:number|null; averageCaloriesKcal:number|null };
const DEFAULT_RADAR_RADIUS = 430;
const SLEEP_TARGET_MINUTES = 510;
export function ObservatoryRadar({data, date, radius = DEFAULT_RADAR_RADIUS, shiftX = 0, shiftY = 0}:{data:RadarData; date?:string; radius?:number; shiftX?:number; shiftY?:number}) {
  const router = useRouter();
  const caloriesRef = useRef(data.caloriesKcal);
  const [calories,setCalories] = useState(data.caloriesKcal);
  const [calorieTarget,setCalorieTarget] = useState<number|null>(null);
  useEffect(()=>{ caloriesRef.current=data.caloriesKcal; startTransition(()=>setCalories(data.caloriesKcal)); },[data.caloriesKcal]);
  useEffect(()=>{
    const update=(event:Event)=>{
      const detail=(event as CustomEvent<MealTotalsEventDetail>).detail;
      const matches = date ? detail?.date === date : detail?.isToday;
      if(matches){
        const changed=caloriesRef.current!==detail.calories;
        caloriesRef.current=detail.calories;
        setCalories(detail.calories);
        setCalorieTarget(detail.calorieTarget);
        if(changed)router.refresh();
      }
    };
    window.addEventListener(MEAL_TOTALS_EVENT,update);window.dispatchEvent(new Event(MEAL_TOTALS_REQUEST_EVENT));
    return()=>window.removeEventListener(MEAL_TOTALS_EVENT,update);
  },[router, date]);
  const axes=[
    {label:"Sommeil",average:data.averageSleepMinutes,value:data.sleepMinutes,target:SLEEP_TARGET_MINUTES,unit:"min",display:data.sleepMinutes===null?"—":`${Math.floor(data.sleepMinutes/60)}h ${Math.round(data.sleepMinutes%60).toString().padStart(2,"0")}`,goal:"8 h 30"},
    {label:"Récupération",average:data.averageRecoveryScore,value:data.recoveryScore,target:100,unit:"",display:data.recoveryScore===null?"—":`${Math.round(data.recoveryScore)}`,goal:"100 %"},
    {label:"Effort",average:data.averageEffortScore===null?null:data.averageEffortScore*.21,value:data.effortScore===null?null:data.effortScore*.21,target:21,unit:"",display:data.effortScore===null?"—":`${(data.effortScore*.21).toFixed(1)}`,goal:"21 / 21 (100 %)"},
    {label:"Calories",average:data.averageCaloriesKcal,value:calories,target:calorieTarget&&calorieTarget>0?calorieTarget:2200,unit:"kcal",display:calories===null?"—":Math.round(calories).toLocaleString("fr-FR"),goal:`${Math.round(calorieTarget&&calorieTarget>0?calorieTarget:2200).toLocaleString("fr-FR")} kcal`},
  ];
  const radarRadius = Number.isFinite(radius) && (radius as number) > 0 ? (radius as number) : DEFAULT_RADAR_RADIUS;
  // Les décalages restent proportionnels au rayon pour que les libellés gardent le même écart relatif.
  const unit = radarRadius / DEFAULT_RADAR_RADIUS;
  const gap = (base: number) => Math.round(base * unit);
  const coordinate=(index:number,ratio:number)=>{const angle=-Math.PI/2+index*Math.PI/2;return [330+Math.cos(angle)*radarRadius*ratio,280+Math.sin(angle)*radarRadius*ratio];};
  const points=axes.map((axis,index)=>axis.value===null?null:coordinate(index,Math.min(1,Math.max(0,axis.value/axis.target))));
  const validPoints=points.filter((p):p is [number,number]=>p!==null);
  return <figure className="observatory-radar" aria-label="Progression des quatre indicateurs par rapport à leurs objectifs" style={shiftX || shiftY ? { transform: `translate(${shiftX}px, ${shiftY}px)` } : undefined}>
    <svg viewBox="0 0 660 560" role="img" aria-label={`Graphique radar. Le contour représente les objectifs. ${axes.map(axis => `${axis.label} : ${axis.display} ${axis.unit}. ${axis.value === null || axis.average === null ? "Comparaison indisponible" : axis.value > axis.average ? "Au-dessus de la moyenne sur 30 jours" : axis.value < axis.average ? "Sous la moyenne sur 30 jours" : "Au niveau de la moyenne sur 30 jours"}. Objectif : ${axis.goal}.`).join(" ")}`}>
      {[.25,.5,.75,1].map(ratio=><Fragment key={ratio}>
        <polygon className="radar-grid" points={[0,1,2,3].map(i=>coordinate(i,ratio).join(",")).join(" ")} />
        <path className={`radar-grid-left${ratio === 1 ? " radar-grid-left--outer" : ""}`} d={[0,3,2].map((i,index)=>`${index===0?"M":"L"} ${coordinate(i,ratio).join(" ")}`).join(" ")} />
      </Fragment>)}
      {[0,1,2,3].map(i=><line key={i} className="radar-axis" x1="330" y1="280" x2={coordinate(i,1)[0]} y2={coordinate(i,1)[1]}/>)}
      {validPoints.length>=3&&<polygon className="radar-value" points={validPoints.map(p=>p.join(",")).join(" ")} />}
      {validPoints.length===2&&<line className="radar-value" x1={validPoints[0][0]} y1={validPoints[0][1]} x2={validPoints[1][0]} y2={validPoints[1][1]}/>}
      {validPoints.map((point,i)=><circle className="radar-point" key={i} cx={point[0]} cy={point[1]} r={Math.round(8*unit*10)/10}/>)}
      {axes.map((axis,i)=>{
        const trend=axis.value===null||axis.average===null?"":axis.value>axis.average?"↑":axis.value<axis.average?"↓":"↔";
        const comparison=trend==="↑"?"Au-dessus de la moyenne sur 30 jours":trend==="↓"?"Sous la moyenne sur 30 jours":trend==="↔"?"Au niveau de la moyenne sur 30 jours":"Moyenne indisponible";
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
          : (`${axis.display}${axis.unit === "kcal" ? " kcal" : ""}${trend ? ` ${trend}` : ""}`);

        return (
          <g key={axis.label} className={`radar-axis-label radar-axis-label--${i}`}>
            <title>{`${axis.label} : ${axis.display}. ${comparison}. Objectif : ${axis.goal}.`}</title>
            <text x={labelX} y={labelY} textAnchor={textAnchor} className="radar-label">{axis.label}</text>
            <text x={numberX} y={numberY} textAnchor={textAnchor} className="radar-number">{valueText}</text>
          </g>
        );
      })}
    </svg>

  </figure>;
}

export const OBSERVATORY_RADAR_PRESENTATION = {
  size: 250,
  shiftY: -24,
  shiftX: -24,
  backdrop: "mont-nuages-user",
} as const;
