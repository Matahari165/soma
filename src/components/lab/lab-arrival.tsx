"use client";

import Link from "next/link";
import { LabArrivalArt } from "./lab-arrival-art";

const destinations = [
  { id: "journal", title: "Journal", caption: "Renseigner ma journée" },
  { id: "meals", title: "Repas", caption: "Ajouter une photo, retrouver mes repas" },
  { id: "effects", title: "Strongest Effects", caption: "Explorer mes corrélations" },
] as const;

export function LabArrival({ theme, date }: { theme: string; date: string }) {
  const titles: Record<string, [string, string]> = {
    observatory: ["Votre propre", "observatoire."], strata: ["Au fil", "des jours."],
    index: ["Le quotidien.", "En perspective."], atelier: ["La matière", "des jours."], focus: ["Un jour.", "Un peu plus clair."],
  };
  const title = titles[theme] || titles.observatory;
  return <section className="lab-arrival" data-arrival-theme={theme} aria-label="Accueil Personal Lab" key={theme}>
    <header className="arrival-masthead"><span>Soma</span><time>{date}</time></header>
    <div className="arrival-composition">
      <div className="arrival-heading"><span className="arrival-kicker">Personal Lab</span><h1 id="arrival-title" tabIndex={-1}>{title[0]}<br />{title[1]}</h1></div>
      <div className="arrival-art"><LabArrivalArt theme={theme} /></div>
      <nav className="arrival-actions" aria-label="Commencer dans Personal Lab">{destinations.map((item, index) =>
        <a className="arrival-action" data-destination={item.id} key={item.id} href={item.id === "journal" ? "#daily-journal" : item.id === "meals" ? "#meal-journal-title" : "#world-effects"}>
          <span className="arrival-action-number">0{index + 1}</span><strong>{item.title}</strong>
          <span className="arrival-action-caption">{item.caption}</span><span className="arrival-action-arrow" aria-hidden="true">↗</span>
        </a>)}</nav>
    </div>
    <footer className="arrival-footer"><Link href="/sleep">Sommeil</Link><Link href="/recovery">Récupération</Link><Link href="/activity">Effort</Link></footer>
  </section>;
}
