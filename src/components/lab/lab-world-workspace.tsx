"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useLabArtwork, useLabTheme } from "./lab-theme";
import { LabArrival } from "./lab-arrival";

export function LabWorldWorkspace({ date, metrics, effects, capture, radar }: {
  date: string; radar: ReactNode; metrics: ReactNode; effects: ReactNode; capture: ReactNode;
}) {
  const theme = useLabTheme();
  const artwork = useLabArtwork();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const change = () => { window.scrollTo({ top: 0 }); };
    window.addEventListener("lab-theme-change", change);
    return () => window.removeEventListener("lab-theme-change", change);
  }, []);
  useEffect(() => {
    const elements = root.current?.querySelectorAll<HTMLElement>(".lab-live-metrics .personal-lab-metric, .journal-period, .lab-world__effects");
    if (!elements || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const element = entry.target as HTMLElement;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { observer.unobserve(element); return; }
      element.animate([{ opacity: .35, transform: theme === "index" ? "translateX(-16px)" : theme === "focus" ? "scale(.975)" : "translateY(32px)" }, { opacity: 1, transform: "none" }], { duration: theme === "index" ? 400 : 750, easing: "cubic-bezier(.2,.7,.2,1)" });
      element.querySelectorAll(".metric-trace-line").forEach(line => line.animate([{ strokeDasharray: "500", strokeDashoffset: "500" }, { strokeDasharray: "500", strokeDashoffset: "0" }], { duration: 1000, easing: "ease-out" }));
      observer.unobserve(element);
    }), { threshold: .08 });
    elements.forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [theme]);
  function moveRail(direction: number) {
    const rail = root.current?.querySelector<HTMLElement>(".personal-lab-workbench");
    if (!rail) return;
    rail.scrollBy({ left: direction * (rail.clientWidth + 16), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  return <div ref={root} id="main-page-content" className="lab-experience lab-continuous" data-continuous-theme={theme}>
    <div className="lab-intro">
      <LabArrival theme={theme} date={date} radar={radar} />
      {artwork !== "radar" && <section className="lab-live-metrics" aria-label="Mesures du jour">{metrics}</section>}
    </div>
    <div className="lab-world" lang="fr">
      <header className="lab-world__header"><h2>Au quotidien</h2></header>
      {theme === "focus" && <div className="lab-rail-controls" role="group" aria-label="Faire glisser Journal et Repas"><button type="button" onClick={() => moveRail(-1)} aria-label="Panneau précédent">← Journal</button><span>Glisser pour changer de panneau</span><button type="button" onClick={() => moveRail(1)} aria-label="Panneau suivant">Repas →</button></div>}
      <section id="world-capture" className="lab-world__capture" aria-label="Journal et repas">{capture}</section>
      <section className="lab-world__effects" id="world-effects" aria-label="Associations personnelles">{effects}</section>
    </div>
  </div>;
}
