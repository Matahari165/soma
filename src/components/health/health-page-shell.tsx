import type { ReactNode } from "react";

type HealthPageKind = "sleep" | "recovery" | "activity";

export function HealthPageShell({ kind, title, description, score, scoreLabel, children }: { kind: HealthPageKind; title: string; description: string; score: number | null; scoreLabel: string; children: ReactNode }) {
  return <div className={`health-detail-page health-detail-page--${kind}`} id="main-page-content"><header className="health-detail-hero"><div><h1>{title}</h1><span className="sr-only">{description}</span></div><div className="health-hero-score"><span>{scoreLabel}</span><strong>{score ?? "—"}</strong><small>{score === null ? "Baseline pending" : "/100"}</small></div></header>{children}</div>;
}
