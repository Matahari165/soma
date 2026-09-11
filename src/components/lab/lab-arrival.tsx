"use client";

import type { ReactNode } from "react";
import { ObservatoryGeometry } from "./observatory-geometry";
import { useLabArtwork } from "./lab-theme";

export function LabArrival({ theme, date, radar }: { theme: string; date: string; radar: ReactNode }) {
  const artwork = useLabArtwork();
  const titles: Record<string, [string, string]> = {
    observatory: ["Votre propre", "observatoire."],
    index: ["Le quotidien.", "En perspective."], focus: ["Un jour.", "Un peu plus clair."],
  };
  const title = titles[theme] || titles.observatory;
  return <section className="lab-arrival" data-arrival-theme={theme} aria-label="Accueil Personal Lab" key={artwork}>
    <header className="arrival-masthead"><span>Soma</span><time>{date}</time></header>
    <div className="arrival-composition">
      <div className="arrival-heading"><span className="arrival-kicker">Personal Lab</span><h1 id="arrival-title" tabIndex={-1}>{title[0]}<br />{title[1]}</h1></div>
      <div className="arrival-art">{artwork === "radar" ? radar : <ObservatoryGeometry />}</div>
    </div>

  </section>;
}
