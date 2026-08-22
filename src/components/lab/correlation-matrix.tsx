"use client";

import { useMemo, useState } from "react";

import type { MatrixRelation } from "@/domain/lab/matrix";
import type { PersonalLabSnapshot } from "@/services/personal-lab";

function signed(value: number, digits = 1) {
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(digits)}`;
}

function formatEffect(relation: MatrixRelation) {
  if (relation.effect === null) return "—";
  const digits = ["bpm", "ms", "min"].includes(relation.outcomeUnit) && Math.abs(relation.effect) >= 1 ? 0 : 1;
  return `${signed(relation.effect, digits)}${relation.outcomeUnit ? ` ${relation.outcomeUnit}` : ""}`;
}

function RelationCell({ relation }: { relation: MatrixRelation }) {
  if (relation.excluded) {
    return <td className="matrix-cell matrix-cell--excluded" title="Mesures qui se recouvrent."><strong>—</strong></td>;
  }
  if (relation.coefficient === null) {
    return <td className="matrix-cell matrix-cell--hidden" title={`${relation.sampleSize} observations appariées`}><strong>—</strong><small>n={relation.sampleSize}</small></td>;
  }
  const title = `${relation.method === "spearman" ? "Spearman" : "Rang bisérial"} ${signed(relation.coefficient, 2)} · effet ${formatEffect(relation)} · intervalle 95 % [${signed(relation.confidenceLow, 2)}, ${signed(relation.confidenceHigh, 2)}] · n=${relation.sampleSize}, n effectif=${relation.effectiveSampleSize} · q=${relation.qValue.toFixed(3)}`;
  return <td className={`matrix-cell matrix-cell--${relation.strength} ${relation.coefficient < 0 ? "matrix-cell--inverse" : "matrix-cell--direct"}`} title={title}>
    <strong>{formatEffect(relation)}</strong>
    <span>ρ {signed(relation.coefficient, 2)}</span>
    <small>n={relation.sampleSize}</small>
  </td>;
}

export function CorrelationMatrix({ matrix }: { matrix: PersonalLabSnapshot["matrix"] }) {
  const [grain, setGrain] = useState<"day" | "week">("day");
  const rows = useMemo(() => matrix.rows.filter((row) => row.grain === grain), [grain, matrix.rows]);
  const top = useMemo(() => rows.flatMap((row) => row.relations)
    .filter((relation) => !relation.excluded && relation.coefficient !== null && relation.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || b.effectiveSampleSize - a.effectiveSampleSize)
    .slice(0, 6), [rows]);

  return <section className="matrix-section" aria-labelledby="matrix-title">
    <header className="matrix-header">
      <h2 id="matrix-title">Relations</h2>
      <div className="matrix-grain" role="group" aria-label="Période d’analyse">
        <button type="button" aria-pressed={grain === "day"} onClick={() => setGrain("day")}>Jours</button>
        <button type="button" aria-pressed={grain === "week"} onClick={() => setGrain("week")}>Semaines</button>
      </div>
    </header>
    <div className="matrix-scroll" role="region" aria-label={`Relations par ${grain === "day" ? "jour" : "semaine"}`} tabIndex={0}>
      <table>
        <thead><tr><th scope="col">Variable</th>{matrix.outcomes.map((outcome) => <th scope="col" key={outcome.id}><span>{outcome.label}</span><small>{outcome.unit}</small></th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}><th scope="row"><strong>{row.label}</strong><small>{row.lagLabel}</small></th>{row.relations.map((relation) => <RelationCell relation={relation} key={relation.outcomeId} />)}</tr>)}</tbody>
      </table>
    </div>
    <div className="matrix-mobile-list" aria-label="Relations principales">
      {top.length ? top.map((relation) => <article key={`${relation.predictorId}-${relation.outcomeId}`}>
        <div><strong>{relation.predictorLabel} → {relation.outcomeLabel}</strong><p>{formatEffect(relation)}</p><small>ρ {signed(relation.coefficient ?? 0, 2)} · n={relation.sampleSize}</small></div>
      </article>) : <p>Pas encore assez de données appariées.</p>}
    </div>
    <details className="matrix-method">
      <summary>Méthode</summary>
      <p>Spearman classe les valeurs avant de les comparer. La taille effective, l’intervalle à 95 % et la correction des comparaisons multiples déterminent la précision affichée. Les champs vides sont exclus.</p>
    </details>
  </section>;
}

export function LeadMatrixFinding({ relation, narrative = null }: { relation: MatrixRelation; narrative?: PersonalLabSnapshot["aiNarrative"] }) {
  return <section className="lab-featured lab-featured--matrix">
    <h2>{narrative?.headline ?? `${relation.predictorLabel} : ${formatEffect(relation)} sur ${relation.outcomeLabel}.`}</h2>
    {narrative?.summary ? <p>{narrative.summary}</p> : null}
    <footer><span>ρ {signed(relation.coefficient ?? 0, 2)} · n={relation.sampleSize} · IC 95 % [{signed(relation.confidenceLow, 2)}, {signed(relation.confidenceHigh, 2)}]</span></footer>
  </section>;
}
