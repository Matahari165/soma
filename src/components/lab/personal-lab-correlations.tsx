import { isPersonalLabPublishedRelation, type MatrixRelation } from "@/domain/lab/matrix";
import type { PersonalLabSnapshot } from "@/services/personal-lab";

function formatEffect(relation: MatrixRelation) {
  if (relation.effect === null) return "—";
  const digits = ["bpm", "ms", "min", "count"].includes(relation.outcomeUnit) && Math.abs(relation.effect) >= 1 ? 0 : 1;
  const value = Math.abs(Number(relation.effect.toFixed(digits))).toFixed(digits);
  const sign = relation.effect > 0 ? "+" : relation.effect < 0 ? "−" : "";
  const unit = relation.outcomeUnit === "%" ? "pp" : relation.outcomeUnit;
  return `${sign}${value}${unit ? ` ${unit}` : ""}`;
}

function toneFor(relation: MatrixRelation) {
  if (relation.effect === null || relation.effect === 0) return { label: "NEUTRE", className: "neutral" };
  if (relation.effect > 0) return { label: "POSITIF", className: "positive" };
  return { label: "NÉGATIF", className: "negative" };
}

function groupedRelations(analysis: PersonalLabSnapshot | null) {
  if (!analysis) return [];
  const unique = new Map<string, MatrixRelation>();
  [...analysis.matrix.acuteHighlights, ...analysis.matrix.topRelations]
    .filter(isPersonalLabPublishedRelation)
    .forEach((relation) => unique.set(`${relation.predictorId}:${relation.outcomeId}:${relation.period}:${relation.lagDays}`, relation));
  const groups = new Map<string, MatrixRelation[]>();
  for (const relation of unique.values()) {
    const group = groups.get(relation.predictorId) ?? [];
    group.push(relation);
    groups.set(relation.predictorId, group);
  }
  return [...groups.values()].slice(0, 2);
}

export function PersonalLabCorrelations({ analysis }: { analysis: PersonalLabSnapshot | null }) {
  const groups = groupedRelations(analysis);
  return <section className="personal-lab-correlations" aria-labelledby="personal-lab-correlations-title">
    <header className="personal-lab-correlations__header">
      <h2 id="personal-lab-correlations-title">Corrélations</h2>
      <span className="personal-lab-correlations__meta">Données validées</span>
    </header>
    {groups.length > 0 ? <div className="personal-lab-correlations__list">
      {groups.map((relations) => {
        const first = relations[0];
        const tone = toneFor(first);
        return <article className="personal-lab-correlation" key={first.predictorId}>
          <header>
            <div>
              <strong>{first.predictorLabel}</strong>
            </div>
            <span className={`personal-lab-correlation__tone personal-lab-correlation__tone--${tone.className}`}>{tone.label}</span>
          </header>
          <div className="personal-lab-correlation__outcomes">
            {relations.slice(0, 2).map((relation) => <div className="personal-lab-correlation__outcome" role="group" aria-label={`${relation.outcomeLabel}: ${formatEffect(relation)}, ${relation.period === "all" ? "toutes les données" : `${relation.period} jours`}, échantillon ${relation.sampleSize}`} key={`${relation.outcomeId}:${relation.period}:${relation.lagDays}`}>
              <span>{relation.outcomeLabel}</span>
              <strong>{formatEffect(relation)}</strong>
            </div>)}
          </div>
        </article>;
      })}
    </div> : <p className="personal-lab-correlations__empty" role="status">Pas encore assez de données validées pour afficher une corrélation.</p>}
  </section>;
}
