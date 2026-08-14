import type { ReactNode } from "react";

import { ScoreRing } from "@/components/dashboard/score-ring";

type HealthPageKind = "sleep" | "recovery" | "activity";

export function HealthPageShell({ kind, title, description, score, children }: { kind: HealthPageKind; title: string; description: string; score: number | null; children: ReactNode }) {
  const scoreKind = kind === "activity" ? "effort" : kind;
  return <div className={`health-detail-page health-detail-page--${kind}`} id="main-page-content"><header className="health-detail-hero"><div><h1>{title}</h1><span className="sr-only">{description}</span></div><div className="health-hero-score"><ScoreRing kind={scoreKind} label="Score" score={score} /></div></header>{children}</div>;
}
