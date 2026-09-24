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
  breakdown: ActivityScoreBreakdown | null;
  persistedScore?: number | null;
};

type SelectedDetail = "score" | string;

function measured(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatScore(value: number | null | undefined) {
  return measured(value) ? Math.round(value).toLocaleString("en-US") : "—";
}

function formatContribution(value: number | null) {
  return measured(value) ? `${value.toFixed(1).replace(".0", "")} pts` : "—";
}

function scoreLabel(score: number | null) {
  return score === null ? "Activity score unavailable" : `Activity score: ${formatScore(score)} out of 100`;
}

function DetailCloseButton({ label, onClose, closeButtonRef, tabIndex }: { label: string; onClose: () => void; closeButtonRef: RefObject<HTMLButtonElement | null>; tabIndex: number }) {
  return <button ref={closeButtonRef} className={styles.detailClose} type="button" tabIndex={tabIndex} onClick={onClose} aria-label={`Close ${label} details`}>Close</button>;
}

function BreakdownDetail({ breakdown, persistedScore }: { breakdown: ActivityScoreBreakdown | null; persistedScore?: number | null }) {
  if (!breakdown) return <div className={styles.detailUnavailable}><strong>Details unavailable</strong><p>Available data is insufficient to verify the calculation.</p></div>;
  const missing = breakdown.components.filter((component) => component.normalizedValue === null).map((component) => component.label);
  const scoreMismatch = measured(persistedScore) && measured(breakdown.score) && persistedScore !== breakdown.score;
  return <>
    {scoreMismatch && <p className={styles.detailFootnote}>Recorded score: {formatScore(persistedScore)} /100 · v3 recomputed from inputs: {formatScore(breakdown.score)} /100.</p>}
    <dl className={styles.breakdownList}>
      {breakdown.components.map((component) => <div className={styles.breakdownRow} key={component.id}>
        <dt><span>{component.label}</span><small>{component.weight}%</small></dt>
        <dd><span><small>Mesuré</small><strong>{component.sourceValueLabel}</strong></span><span><small>Repère</small><strong>{component.targetLabel}</strong></span><span><small>Points</small><strong>{formatContribution(component.contribution)}</strong></span></dd>
      </div>)}
    </dl>
    {missing.length > 0 && <p className={styles.detailFootnote}>Données absentes : {missing.join(", ")}. Le score utilise les mesures disponibles.</p>}
    {breakdown.coverage < 1 && missing.length === 0 && <p className={styles.detailFootnote}>Couverture du score : {Math.round(breakdown.coverage * 100)} %.</p>}
  </>;
}

function DimensionDetail({ dimension }: { dimension: ActivityRadarDimension | null }) {
  if (!dimension) return null;
  return <>
    <dl className={styles.dimensionMetrics}>
      <div><dt>Current value</dt><dd>{dimension.valueLabel?.trim() || "—"}</dd></div>
      <div><dt>30-day avg</dt><dd>{dimension.averageLabel?.trim() || "—"}</dd></div>
      <div><dt>Reading</dt><dd>{dimension.readingDirection || "—"}</dd></div>
      <div><dt>Role</dt><dd>{dimension.scoreRole || "Activity score component"}</dd></div>
      <div><dt>Source</dt><dd>{dimension.sourceLabel?.trim() || "—"}</dd></div>
    </dl>
    {dimension.scoreFormula && (dimension.scoreWeight !== undefined || dimension.scoreContribution !== undefined)
      ? <dl className={styles.dimensionFormula}><div><dt>Formula</dt><dd>{dimension.scoreFormula}</dd></div><div><dt>Contribution</dt><dd>{measured(dimension.scoreContribution) ? `${formatContribution(dimension.scoreContribution)} · ${dimension.scoreWeight ?? 0}%` : "Unavailable"}</dd></div></dl>
      : dimension.scoreFormula ? <dl className={styles.dimensionFormula}><div><dt>Normalization</dt><dd>{dimension.scoreFormula}</dd></div></dl> : null}
    {dimension.definition && <p className={styles.detailSummary}>{dimension.definition}</p>}
  </>;
}

export function ActivityScoreOverview({ dimensions, score, average, breakdown, persistedScore }: ActivityScoreOverviewProps) {
  const [selectedDetail, setSelectedDetail] = useState<SelectedDetail | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const scoreButtonRef = useRef<HTMLButtonElement>(null);
  const radarButtonRefs = useRef<Record<string, SVGGElement | null>>({});
  const selectedDimension = selectedDetail && selectedDetail !== "score"
    ? dimensions.find((dimension) => dimension.id === selectedDetail) ?? null
    : null;

  useEffect(() => {
    if (selectedDetail && selectedDetail !== "score") headingRef.current?.focus({ preventScroll: true });
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

  const detailOpen = selectedDetail !== null && selectedDetail !== "score";
  const scoreOpen = selectedDetail === "score";
  return <div className={styles.scoreOverview} data-detail-open={detailOpen}>
    <div className={styles.radarStage} data-detail-open={detailOpen}>
      <ActivityRadar dimensions={dimensions} title="Activity radar" detailId="activity-detail-panel" interactive selectedId={selectedDetail === "score" ? null : selectedDetail} onSelect={(id) => selectDetail(id)} registerButton={(id, node) => { radarButtonRefs.current[id] = node; }} />
      <aside className={styles.detailPanel} data-open={detailOpen} id="activity-detail-panel" aria-hidden={!detailOpen} aria-labelledby="activity-detail-heading" inert={!detailOpen}>
        <div className={styles.detailHeader}><h3 id="activity-detail-heading" ref={headingRef} tabIndex={-1}>{selectedDimension?.label ?? "Activity details"}</h3><DetailCloseButton label={selectedDimension?.label ?? "activity"} onClose={closeDetail} closeButtonRef={closeButtonRef} tabIndex={detailOpen ? 0 : -1} /></div>
        <DimensionDetail dimension={selectedDimension} />
      </aside>
    </div>

    <aside className={styles.scoreSummary} aria-labelledby="activity-score-summary-title">
      <button ref={scoreButtonRef} className={styles.scoreButton} type="button" aria-controls="activity-score-inline" aria-expanded={scoreOpen} aria-label={`${scoreLabel(score)}. ${scoreOpen ? "Close" : "View"} score breakdown.`} onClick={() => selectDetail("score")}>
        <span id="activity-score-summary-title" className={styles.scoreLabel}>Activity score</span><strong>{formatScore(score)}<small>/100</small></strong><p>30-day avg · {formatScore(average)} /100</p>
      </button>
      <div className={styles.scoreInline} id="activity-score-inline" data-open={scoreOpen} aria-hidden={!scoreOpen} inert={!scoreOpen} role="region" aria-label="Activity score details">
        <div className={styles.scoreInlineInner}><BreakdownDetail breakdown={breakdown} persistedScore={persistedScore} /></div>
      </div>
      <div className={styles.scoreRail} aria-hidden="true"><span style={{ transform: `scaleX(${score === null ? 0 : Math.min(100, Math.max(0, score)) / 100})` }} /></div>
    </aside>
  </div>;
}
