"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { LabArrival } from "./lab-arrival";

export function LabWorldWorkspace({ date, metrics, effects, capture }: {
  date: string; metrics: ReactNode; effects: ReactNode; capture: ReactNode;
}) {
  const [theme, setTheme] = useState("observatory");
  useEffect(() => {
    const change = () => { setTheme(document.documentElement.dataset.labTheme || "observatory"); window.scrollTo({ top: 0 }); };
    window.addEventListener("lab-theme-change", change);
    return () => window.removeEventListener("lab-theme-change", change);
  }, []);
  function scrollToSection(event: MouseEvent<HTMLAnchorElement>) {
    const hash = event.currentTarget.hash;
    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    event.preventDefault();
    window.history.pushState(null, "", hash);
    target.scrollIntoView({ block: "start", inline: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  return <div id="main-page-content" className="lab-experience lab-continuous" data-continuous-theme={theme}>
    <div className="lab-intro">
      <LabArrival theme={theme} date={date} />
      <section className="lab-live-metrics" aria-label="Mesures du jour">{metrics}</section>
    </div>
    <div className="lab-world" lang="fr">
      <header className="lab-world__header"><h2>Au quotidien</h2><nav aria-label="Accès direct"><a onClick={scrollToSection} href="#daily-journal">Journal</a><a onClick={scrollToSection} href="#meal-journal-title">Repas</a><a onClick={scrollToSection} href="#world-effects">Strongest Effects</a></nav></header>
      <section id="world-capture" className="lab-world__capture" aria-label="Journal et repas">{capture}</section>
      <section className="lab-world__effects" id="world-effects" aria-label="Associations personnelles">{effects}</section>
    </div>
  </div>;
}
