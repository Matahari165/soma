"use client";
import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MEAL_TOTALS_EVENT, MEAL_TOTALS_REQUEST_EVENT, type MealTotalsEventDetail } from "@/domain/meal-record";

type RadarData = { sleepMinutes:number|null; recoveryScore:number|null; effortScore:number|null; caloriesKcal:number|null; averageSleepMinutes:number|null; averageRecoveryScore:number|null; averageEffortScore:number|null; averageCaloriesKcal:number|null };
export function ObservatoryRadar({data, date}:{data:RadarData; date?:string}) {
  const router = useRouter();
  const caloriesRef = useRef(data.caloriesKcal);
  const [calories,setCalories] = useState(data.caloriesKcal);
  useEffect(()=>{ caloriesRef.current=data.caloriesKcal; startTransition(()=>setCalories(data.caloriesKcal)); },[data.caloriesKcal]);
  useEffect(()=>{
    const update=(event:Event)=>{
      const detail=(event as CustomEvent<MealTotalsEventDetail>).detail;
      const matches = date ? detail?.date === date : detail?.isToday;
      if(matches){
        const changed=caloriesRef.current!==detail.calories;
        caloriesRef.current=detail.calories;
        setCalories(detail.calories);
        if(changed)router.refresh();
      }
    };
    window.addEventListener(MEAL_TOTALS_EVENT,update);window.dispatchEvent(new Event(MEAL_TOTALS_REQUEST_EVENT));
    return()=>window.removeEventListener(MEAL_TOTALS_EVENT,update);
  },[router, date]);
  const axes=[
    {label:"Sommeil",average:data.averageSleepMinutes,value:data.sleepMinutes,target:480,unit:"min",display:data.sleepMinutes===null?"—":`${Math.floor(data.sleepMinutes/60)}h ${Math.round(data.sleepMinutes%60).toString().padStart(2,"0")}`,goal:"8 h"},
    {label:"Récupération",average:data.averageRecoveryScore,value:data.recoveryScore,target:100,unit:"",display:data.recoveryScore===null?"—":`${Math.round(data.recoveryScore)}`,goal:"100 %"},
    {label:"Effort",average:data.averageEffortScore===null?null:data.averageEffortScore*.21,value:data.effortScore===null?null:data.effortScore*.21,target:21,unit:"",display:data.effortScore===null?"—":`${(data.effortScore*.21).toFixed(1)}`,goal:"21 / 21 (100 %)"},
    {label:"Calories",average:data.averageCaloriesKcal,value:calories,target:2200,unit:"kcal",display:calories===null?"—":Math.round(calories).toLocaleString("fr-FR"),goal:"2 200 kcal"},
  ];
  const coordinate=(index:number,ratio:number)=>{const angle=-Math.PI/2+index*Math.PI/2;return [300+Math.cos(angle)*175*ratio,250+Math.sin(angle)*175*ratio];};
  const points=axes.map((axis,index)=>axis.value===null?null:coordinate(index,Math.min(1.2,Math.max(0,axis.value/axis.target))));
  const validPoints=points.filter((p):p is [number,number]=>p!==null);
  return <figure className="observatory-radar" aria-label="Progression des quatre indicateurs par rapport aux repères de démonstration">
    <svg viewBox="0 0 600 500" role="img" aria-label={`Graphique radar. Le contour représente les objectifs de démonstration. ${axes.map(axis => `${axis.label} : ${axis.display} ${axis.unit}. ${axis.value === null || axis.average === null ? "Comparaison indisponible" : axis.value > axis.average ? "Au-dessus de la moyenne sur 30 jours" : axis.value < axis.average ? "Sous la moyenne sur 30 jours" : "Au niveau de la moyenne sur 30 jours"}. Objectif : ${axis.goal}.`).join(" ")}`}>
      {[.25,.5,.75,1].map(ratio=><polygon key={ratio} className="radar-grid" points={[0,1,2,3].map(i=>coordinate(i,ratio).join(",")).join(" ")} />)}
      {[0,1,2,3].map(i=><line key={i} className="radar-axis" x1="300" y1="250" x2={coordinate(i,1)[0]} y2={coordinate(i,1)[1]}/>)}
      {validPoints.length>=3&&<polygon className="radar-value" points={validPoints.map(p=>p.join(",")).join(" ")} />}
      {validPoints.length===2&&<line className="radar-value" x1={validPoints[0][0]} y1={validPoints[0][1]} x2={validPoints[1][0]} y2={validPoints[1][1]}/>}
      {validPoints.map((point,i)=><circle className="radar-point" key={i} cx={point[0]} cy={point[1]} r="5"/>)}
      {axes.map((axis,i)=>{
        const [x,y]=coordinate(i,1.23);
        const trend=axis.value===null||axis.average===null?"":axis.value>axis.average?"↑":axis.value<axis.average?"↓":"↔";
        const comparison=trend==="↑"?"Au-dessus de la moyenne sur 30 jours":trend==="↓"?"Sous la moyenne sur 30 jours":trend==="↔"?"Au niveau de la moyenne sur 30 jours":"Moyenne indisponible";
        return <g key={axis.label} className="radar-axis-label"><title>{`${axis.label} : ${axis.display}. ${comparison}. Objectif de démonstration : ${axis.goal}.`}</title><text x={x} y={y-9} textAnchor="middle" className="radar-label">{axis.label}</text><text x={x} y={y+17} textAnchor="middle" className="radar-number">{axis.display}{axis.unit==="kcal"?" kcal":""} {trend}</text></g>;
      })}
    </svg>

  </figure>;
}
