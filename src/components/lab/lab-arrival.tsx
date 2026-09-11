"use client";

import type { ReactNode } from "react";

export function LabArrival({ theme, date, radar }: { theme: string; date: string; radar: ReactNode }) {
  const titles: Record<string, [string, string]> = {
    observatory: ["Votre propre", "observatoire."],
    index: ["Le quotidien.", "En perspective."], focus: ["Un jour.", "Un peu plus clair."],
  };
  const title = titles[theme] || titles.observatory;
  return <section className="lab-arrival" data-arrival-theme={theme} aria-label="Accueil Personal Lab" key={theme}>
    <div className="arrival-composition">
      <div className="arrival-heading"><h1 id="arrival-title" tabIndex={-1}><span className="arrival-title-line"><span>{title[0]}</span></span><span className="arrival-title-line"><span>{title[1]}</span></span></h1><time className="arrival-date">{date}</time></div>
      <div className="arrival-art">{radar}</div>
    </div>

  </section>;
}
