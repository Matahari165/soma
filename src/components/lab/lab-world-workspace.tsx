"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

type WorkspaceView = "effects" | "journal" | "meals";

export function LabWorldWorkspace({ date, metrics, effects, capture }: {
  date: string;
  metrics: ReactNode;
  effects: ReactNode;
  capture: ReactNode;
}) {
  const [view, setView] = useState<WorkspaceView>("effects");
  return <div id="main-page-content" className="lab-world" data-workspace-view={view} lang="fr">
    <header className="lab-world__header">
      <div className="lab-world__identity"><h1>Personal Lab</h1><time>{date}</time></div>
      <nav className="lab-world__shortcuts" aria-label="Accès au laboratoire">
        <a href="#world-effects">Effets</a><a href="#daily-journal">Journal</a><a href="#meal-journal-title">Repas</a>
      </nav>
      <nav className="lab-world__navigation" aria-label="Explorer les données">
        <Link href="/sleep">Sommeil</Link><Link href="/recovery">Récupération</Link><Link href="/activity">Effort</Link><Link href="/settings">Réglages</Link>
      </nav>
      <div className="lab-world__modes" role="group" aria-label="Espace de travail">
        {([['effects', 'Effets'], ['journal', 'Journal'], ['meals', 'Repas']] as const).map(([id, label]) =>
          <button type="button" key={id} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>)}
      </div>
    </header>
    <section className="lab-world__metrics" aria-label="Mesures du jour">{metrics}</section>
    <section className="lab-world__effects" id="world-effects" aria-label="Associations personnelles">{effects}</section>
    <section className="lab-world__capture" aria-label="Saisie quotidienne">{capture}</section>
  </div>;
}
