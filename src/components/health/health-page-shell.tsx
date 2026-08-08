import type { ReactNode } from "react";

export function HealthPageShell({ eyebrow, title, description, score, scoreLabel, children }: { eyebrow: string; title: string; description: string; score: number | null; scoreLabel: string; children: ReactNode }) {
  return <div className="health-detail-page" id="main-page-content"><header className="health-detail-hero"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><div className="health-hero-score"><span>{scoreLabel}</span><strong>{score ?? "—"}</strong><small>{score === null ? "Building baseline" : "/100"}</small></div></header>{children}<p className="medical-note">Compared with your history · wellness context only.</p></div>;
}
