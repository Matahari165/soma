"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { ActivityRadar, type ActivityRadarDimension } from "./activity-radar";
import styles from "./activity-redesign.module.css";

export type ActivityScoreComponent = {
  id: string;
  label: string;
  weight: number;
  sourceValueLabel: string;
  targetLabel: string;
  normalizedValue: number | null;
  scoreNormalizedValue?: number | null;
  contribution: number | null;
  formula: string;
  normalization: string;
};

export type ActivityScoreBreakdown = {
  score: number | null;
  algorithmVersion: string;
  coverage: number;
  components: readonly ActivityScoreComponent[];
};

type ActivityScoreOverviewProps = {
  dimensions: readonly ActivityRadarDimension[];
  score: number | null;
  average: number | null;
  coverage: number | null;
  breakdown: ActivityScoreBreakdown | null;
  persistedScore?: number | null;
};

type SelectedDetail = "score" | string;

function measured(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatScore(value: number | null | undefined) {
  return measured(value) ? Math.round(value).toLocaleString("fr-FR") : "—";
}

function formatNormalized(value: number | null) {
  return measured(value) ? `${Math.round(value * 100)} /100` : "—";
}

function formatContribution(value: number | null) {
  return measured(value) ? `${value.toFixed(1).replace(".0", "")} pts` : "—";
}

function scoreLabel(score: number | null) {
  return score === null ? "Score d’effort indisponible" : `Score d’effort : ${formatScore(score)} sur 100`;
}

function DetailCloseButton({ label, onClose, closeButtonRef, tabIndex }: { label: string; onClose: () => void; closeButtonRef: RefObject<HTMLButtonElement | null>; tabIndex: number }) {
  return <button ref={closeButtonRef} className={styles.detailClose} type="button" tabIndex={tabIndex} onClick={onClose} aria-label={`Fermer les détails de ${label}`}>Fermer</button>;
}

function BreakdownDetail({ breakdown, persistedScore }: { breakdown: ActivityScoreBreakdown | null; persistedScore?: number | null }) {
  if (!breakdown) return <div className={styles.detailUnavailable}><strong>Détail indisponible</strong><p>Les données disponibles ne permettent pas de confirmer le calcul.</p></div>;
  const missing = breakdown.components.filter((component) => component.normalizedValue === null).map((component) => component.label);
  const scoreMismatch = measured(persistedScore) && measured(breakdown.score) && persistedScore !== breakdown.score;
  return <>
    <p className={styles.detailNote}>Calcul Soma · {breakdown.algorithmVersion}</p>
    {scoreMismatch && <p className={styles.detailFootnote}>Score enregistré : {formatScore(persistedScore)} /100 · recalcul v3 à partir des mesures : {formatScore(breakdown.score)} /100.</p>}
    <dl className={styles.breakdownList}>
      {breakdown.components.map((component) => <div className={styles.breakdownRow} key={component.id}>
        <dt><span>{component.label}</span><small>{component.weight} %</small></dt>
        <dd><span><small>Mesuré</small><strong>{component.sourceValueLabel}</strong></span><span><small>Cible</small><strong>{component.targetLabel}</strong></span><span><small>Repère visuel</small><strong>{formatNormalized(component.normalizedValue)}</strong></span><span><small>Sous-score</small><strong>{formatNormalized(component.scoreNormalizedValue ?? component.normalizedValue)}</strong></span><span><small>Contribution</small><strong>{formatContribution(component.contribution)}</strong></span></dd>
        <dd className={styles.breakdownFormula}><span>{component.formula}</span><span>{component.normalization}</span></dd>
      </div>)}
    </dl>
    {missing.length > 0 && <p className={styles.detailFootnote}>Indisponible : {missing.join(", ")}. Les pondérations observées sont renormalisées.</p>}
    {breakdown.coverage < 1 && missing.length === 0 && <p className={styles.detailFootnote}>Couverture du score : {Math.round(breakdown.coverage * 100)} %. Les pondérations observées sont renormalisées.</p>}
  </>;
}

function DimensionDetail({ dimension }: { dimension: ActivityRadarDimension | null }) {
  if (!dimension) return null;
  return <>
    <dl className={styles.dimensionMetrics}>
      <div><dt>Valeur actuelle</dt><dd>{dimension.valueLabel?.trim() || "—"}</dd></div>
      <div><dt>Moy. 30 j</dt><dd>{dimension.averageLabel?.trim() || "—"}</dd></div>
      <div><dt>Lecture</dt><dd>{dimension.readingDirection || "—"}</dd></div>
      <div><dt>Rôle</dt><dd>{dimension.scoreRole || "Composante du score d’effort"}</dd></div>
      <div><dt>Source</dt><dd>{dimension.sourceLabel?.trim() || "—"}</dd></div>
    </dl>
    {dimension.scoreFormula && (dimension.scoreWeight !== undefined || dimension.scoreContribution !== undefined)
      ? <dl className={styles.dimensionFormula}><div><dt>Formule</dt><dd>{dimension.scoreFormula}</dd></div><div><dt>Contribution</dt><dd>{measured(dimension.scoreContribution) ? `${formatContribution(dimension.scoreContribution)} · ${dimension.scoreWeight ?? 0} %` : "Indisponible"}</dd></div></dl>
      : dimension.scoreFormula ? <dl className={styles.dimensionFormula}><div><dt>Normalisation</dt><dd>{dimension.scoreFormula}</dd></div></dl> : null}
    {dimension.definition && <p className={styles.detailSummary}>{dimension.definition}</p>}
  </>;
}

export function ActivityScoreOverview({ dimensions, score, average, coverage, breakdown, persistedScore }: ActivityScoreOverviewProps) {
  const [selectedDetail, setSelectedDetail] = useState<SelectedDetail | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const scoreButtonRef = useRef<HTMLButtonElement>(null);
  const radarButtonRefs = useRef<Record<string, SVGGElement | null>>({});
  const selectedDimension = selectedDetail && selectedDetail !== "score"
    ? dimensions.find((dimension) => dimension.id === selectedDetail) ?? null
    : null;

  useEffect(() => {
    if (selectedDetail) headingRef.current?.focus({ preventScroll: true });
  }, [selectedDetail]);

  useEffect(() => {
    if (!selectedDetail) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeDetail();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  // closeDetail intentionally restores focus to the active trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDetail]);

  function restoreFocus(detail: SelectedDetail) {
    const restore = () => detail === "score" ? scoreButtonRef.current?.focus() : radarButtonRefs.current[detail]?.focus();
    if (typeof window === "undefined") restore();
    else window.requestAnimationFrame(restore);
  }

  function closeDetail() {
    if (!selectedDetail) return;
    const detail = selectedDetail;
    setSelectedDetail(null);
    restoreFocus(detail);
  }

  function selectDetail(detail: SelectedDetail) {
    if (selectedDetail === detail) closeDetail();
    else setSelectedDetail(detail);
  }

  const detailOpen = selectedDetail !== null;
  return <div className={styles.scoreOverview} data-detail-open={detailOpen}>
    <div className={styles.radarStage} data-detail-open={detailOpen}>
      <ActivityRadar dimensions={dimensions} title="Radar de l’effort" detailId="activity-detail-panel" interactive selectedId={selectedDetail === "score" ? null : selectedDetail} onSelect={(id) => selectDetail(id)} registerButton={(id, node) => { radarButtonRefs.current[id] = node; }} />
      <aside className={styles.detailPanel} data-open={detailOpen} id="activity-detail-panel" aria-hidden={!detailOpen} aria-labelledby="activity-detail-heading" inert={!detailOpen}>
        <div className={styles.detailHeader}><h3 id="activity-detail-heading" ref={headingRef} tabIndex={-1}>{selectedDetail === "score" ? "Score d’effort" : selectedDimension?.label ?? "Détail de l’effort"}</h3><DetailCloseButton label={selectedDetail === "score" ? "score d’effort" : selectedDimension?.label ?? "l’effort"} onClose={closeDetail} closeButtonRef={closeButtonRef} tabIndex={detailOpen ? 0 : -1} /></div>
        {selectedDetail === "score" ? <BreakdownDetail breakdown={breakdown} persistedScore={persistedScore} /> : <DimensionDetail dimension={selectedDimension} />}
      </aside>
    </div>

    <aside className={styles.scoreSummary} aria-labelledby="activity-score-summary-title">
      <span className={styles.summaryKicker}>Aujourd’hui</span>
      <button ref={scoreButtonRef} className={styles.scoreButton} type="button" aria-controls="activity-detail-panel" aria-expanded={selectedDetail === "score"} aria-label={`${scoreLabel(score)}. Afficher la décomposition du score.`} onClick={() => selectDetail("score")}>
        <span id="activity-score-summary-title" className={styles.scoreLabel}>Score d’effort</span><strong>{formatScore(score)}<small>/100</small></strong><p>Moy. 30 j · {formatScore(average)} /100</p>
      </button>
      <div className={styles.scoreRail} aria-hidden="true"><span style={{ transform: `scaleX(${score === null ? 0 : Math.min(100, Math.max(0, score)) / 100})` }} /></div>
      <dl className={styles.summaryFacts}><div><dt>Couverture</dt><dd>{coverage === null ? "—" : `${Math.round(coverage * 100)} %`}</dd></div><div><dt>Composantes</dt><dd>{breakdown ? `${breakdown.components.filter((component) => component.normalizedValue !== null).length}/4` : "—"}</dd></div></dl>
    </aside>
  </div>;
}
