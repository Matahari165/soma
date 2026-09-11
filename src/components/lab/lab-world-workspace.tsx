"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { LabArrival } from "./lab-arrival";

type WorkspaceView = "effects" | "journal" | "meals";

export function LabWorldWorkspace({ date, metrics, effects, capture }: {
  date: string;
  metrics: ReactNode;
  effects: ReactNode;
  capture: ReactNode;
}) {
  const [view, setView] = useState<WorkspaceView>("journal");
  const [arrival, setArrival] = useState(true);
  const [theme, setTheme] = useState("observatory");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const change = () => { setTheme(document.documentElement.dataset.labTheme || "observatory"); setArrival(true); window.scrollTo({ top: 0 }); };
    const back = () => {
      const destination = window.location.hash.slice(1);
      if (destination === "journal" || destination === "meals" || destination === "effects") { setView(destination); setArrival(false); }
      else setArrival(true);
    };
    window.addEventListener("popstate", back);
    window.addEventListener("lab-theme-change", change);
    return () => { window.removeEventListener("lab-theme-change", change); window.removeEventListener("popstate", back); };
  }, []);
  function open(destination: WorkspaceView) {
    setView(destination); setArrival(false);
    window.history.pushState(null, "", `#${destination}`);
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }
  return <div id="main-page-content" className="lab-experience" data-arrival={arrival}>
    {arrival && <LabArrival theme={theme} date={date} onOpen={open} />}
    <div hidden={arrival}>
  <div className="lab-world" data-workspace-view={view} lang="fr">
    <header className="lab-world__header">
      <div className="lab-world__identity"><button className="lab-back-home" type="button" onClick={() => { setArrival(true); window.history.pushState(null, "", window.location.pathname); window.scrollTo({ top: 0 }); requestAnimationFrame(() => document.getElementById("arrival-title")?.focus({ preventScroll: true })); }}>← Accueil</button><h1 ref={heading} tabIndex={-1}>{view === "journal" ? "Journal" : view === "meals" ? "Repas" : "Personal Lab"}</h1><time>{date}</time></div>
      <nav className="lab-world__shortcuts" aria-label="Accès au laboratoire">
        <a href="#world-effects">Effets</a><a href="#daily-journal">Journal</a><a href="#meal-journal-title">Repas</a>
      </nav>
      <nav className="lab-world__navigation" aria-label="Explorer les données">
        <Link href="/sleep">Sommeil</Link><Link href="/recovery">Récupération</Link><Link href="/activity">Effort</Link><Link href="/settings">Réglages</Link>
      </nav>
      <div className="lab-world__modes" role="group" aria-label="Espace de travail">
        {([['journal', 'Journal'], ['meals', 'Repas'], ['effects', 'Strongest Effects']] as const).map(([id, label]) =>
          <button type="button" key={id} aria-pressed={view === id} aria-controls={id === "effects" ? "world-effects" : "world-capture"} onClick={() => open(id)}>{label}</button>)}
      </div>
    </header>
    <section className="lab-world__metrics" aria-label="Mesures du jour">{metrics}</section>
    <section className="lab-world__effects" id="world-effects" aria-label="Associations personnelles">{effects}</section>
    <section id="world-capture" className="lab-world__capture" aria-label="Saisie quotidienne">{capture}</section>
  </div></div></div>;
}
