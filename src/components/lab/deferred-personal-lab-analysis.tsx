"use client";

import { useState } from "react";

import type { PersonalLabSnapshot } from "@/services/personal-lab";

import { PersonalLabAnalysisSection } from "./personal-lab";

type LoadState = "idle" | "loading" | "error";

export function DeferredPersonalLabAnalysis() {
  const [snapshot, setSnapshot] = useState<PersonalLabSnapshot | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function showAnalysis() {
    if (loadState === "loading" || snapshot) return;
    setLoadState("loading");
    setError(null);
    try {
      const response = await fetch("/api/lab/analysis?period=90", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.snapshot) throw new Error(typeof body.error === "string" ? body.error : "Les analyses ne sont pas disponibles pour le moment.");
      setSnapshot(body.snapshot as PersonalLabSnapshot);
      setLoadState("idle");
    } catch (reason) {
      setLoadState("error");
      setError(reason instanceof Error ? reason.message : "Les analyses ne sont pas disponibles pour le moment.");
    }
  }

  if (snapshot) return <PersonalLabAnalysisSection data={snapshot} refreshNarrative={false} />;

  return <section className="lab-entry__section lab-entry__analysis-deferred" aria-labelledby="analysis-deferred-title" aria-busy={loadState === "loading"}>
    <div>
      <span className="eyebrow">Personal Lab</span>
      <h2 id="analysis-deferred-title">Analyses</h2>
      <p>Les analyses se chargent uniquement à la demande. La matrice reste ensuite masquée par défaut.</p>
    </div>
    <button type="button" className="primary-button" disabled={loadState === "loading"} onClick={() => void showAnalysis()}>
      {loadState === "loading" ? "Chargement…" : "Afficher les analyses"}
    </button>
    {error && <p className="lab-analysis-deferred__error" role="alert">{error} <button type="button" className="text-link" onClick={() => void showAnalysis()}>Réessayer</button></p>}
  </section>;
}
