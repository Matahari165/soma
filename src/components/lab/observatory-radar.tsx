"use client";
import { startTransition, useEffect, useState } from "react";
import { MEAL_TOTALS_EVENT, MEAL_TOTALS_REQUEST_EVENT, type MealTotalsEventDetail } from "@/domain/meal-record";

type RadarData = { sleepMinutes:number|null; recoveryScore:number|null; effortScore:number|null; caloriesKcal:number|null };
export function ObservatoryRadar({data}:{data:RadarData}) {
  const [calories,setCalories] = useState(data.caloriesKcal);
  useEffect(()=>{ startTransition(()=>setCalories(data.caloriesKcal)); },[data.caloriesKcal]);
  useEffect(()=>{
    const update=(event:Event)=>{const detail=(event as CustomEvent<MealTotalsEventDetail>).detail;if(detail.isToday)setCalories(detail.calories);};
    window.addEventListener(MEAL_TOTALS_EVENT,update);window.dispatchEvent(new Event(MEAL_TOTALS_REQUEST_EVENT));
    return()=>window.removeEventListener(MEAL_TOTALS_EVENT,update);
  },[]);
  const axes=[
    {label:"Sommeil",value:data.sleepMinutes,target:480,unit:"min",display:data.sleepMinutes===null?"—":`${Math.floor(data.sleepMinutes/60)}h ${Math.round(data.sleepMinutes%60).toString().padStart(2,"0")}`,goal:"8 h"},
    {label:"Récupération",value:data.recoveryScore,target:80,unit:"",display:data.recoveryScore===null?"—":`${Math.round(data.recoveryScore)}`,goal:"80 / 100"},
    {label:"Effort",value:data.effortScore===null?null:data.effortScore*.21,target:16,unit:"",display:data.effortScore===null?"—":`${(data.effortScore*.21).toFixed(1)}`,goal:"16 / 21"},
    {label:"Calories",value:calories,target:2200,unit:"kcal",display:calories===null?"—":Math.round(calories).toLocaleString("fr-FR"),goal:"2 200 kcal"},
  ];
  const coordinate=(index:number,ratio:number)=>{const angle=-Math.PI/2+index*Math.PI/2;return [300+Math.cos(angle)*150*ratio,215+Math.sin(angle)*150*ratio];};
  const points=axes.map((axis,index)=>axis.value===null?null:coordinate(index,Math.min(1,Math.max(0,axis.value/axis.target))));
  return <figure className="observatory-radar" aria-label="Progression des quatre indicateurs par rapport aux repères de démonstration">
    <svg viewBox="0 0 600 430" role="img" aria-label="Graphique radar. Le contour extérieur représente 100 % des repères.">
      {[.25,.5,.75,1].map(ratio=><polygon key={ratio} className="radar-grid" points={[0,1,2,3].map(i=>coordinate(i,ratio).join(",")).join(" ")} />)}
      {[0,1,2,3].map(i=><line key={i} className="radar-axis" x1="300" y1="215" x2={coordinate(i,1)[0]} y2={coordinate(i,1)[1]}/>)}
      {points.every(Boolean)&&<polygon className="radar-value" points={points.map(p=>p!.join(",")).join(" ")} />}
      {points.map((point,i)=>point&&<circle className="radar-point" key={i} cx={point[0]} cy={point[1]} r="5"/>)}
      {axes.map((axis,i)=>{const [x,y]=coordinate(i,1.25);return <g key={axis.label}><text x={x} y={y-5} textAnchor="middle" className="radar-label">{axis.label}</text><text x={x} y={y+16} textAnchor="middle" className="radar-number">{axis.display}{axis.unit==="kcal"?" kcal":""}</text></g>;})}
    </svg>
    <figcaption>Contour : objectif atteint · Repères de démonstration</figcaption>
    <dl className="radar-targets">{axes.map(axis=><div key={axis.label}><dt>{axis.label}</dt><dd>{axis.value===null?"Non renseigné":`${Math.round(axis.value/axis.target*100)} %`}<small>Objectif {axis.goal}</small></dd></div>)}</dl>
  </figure>;
}
