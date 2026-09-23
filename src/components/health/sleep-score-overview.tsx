"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { SleepRadar, type SleepRadarDimension } from "./sleep-radar";
import styles from "./sleep-redesign.module.css";

export type SleepScoreComponent = {
  id: "duration" | "efficiency" | "regularity";
  label: string;
  weight: number;
  sourceValueLabel: string;
  formula: string;
  normalization: string;
  normalizedValue: number | null;
  contribution: number | null;
};

export type SleepScoreBreakdown = {
  score: number;
  algorithmVersion: string;
  components: readonly SleepScoreComponent[];
};

type SleepScoreOverviewProps = {
  dimensions: readonly SleepRadarDimension[];
  score: number | null;
  average: number | null;
  breakdown: SleepScoreBreakdown | null;
};

type SelectedDetail = "score" | string;

const DETAIL_ID = "sleep-score-detail";
const DETAIL_TITLE_ID = "sleep-score-detail-title";

function measured(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatScore(value: number | null | undefined) {
  return measured(value) ? String(Math.round(value)) : "—";
}

function formatContribution(value: number | null | undefined) {
  if (!measured(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value);
}

function formatNormalized(value: number | null | undefined) {
  return measured(value) ? formatScore(value * 100) : "—";
}

function scoreDescription(score: number | null) {
  return score === null ? "Sleep score unavailable" : `Sleep score ${formatScore(score)} out of 100`;
}

function DetailCloseButton({ label, onClose, closeButtonRef, tabIndex }: { label: string; onClose: () => void; closeButtonRef: RefObject<HTMLButtonElement | null>; tabIndex: number }) {
  return <button
    aria-label={`Close ${label} details`}
    className={styles.sleepDetailClose}
    onClick={onClose}
    ref={closeButtonRef}
    tabIndex={tabIndex}
    type="button"
  >Close</button>;
}

function ScoreBreakdownDetail({ breakdown }: { breakdown: SleepScoreBreakdown | null }) {
  if (!breakdown) {
    return <div className={styles.sleepDetailUnavailable}>
      <strong>Details unavailable</strong>
      <p>Engine inputs and displayed score are insufficient to verify the three components.</p>
    </div>;
  }

  return <>
    <p className={styles.sleepDetailNote}>Soma calculation · {breakdown.algorithmVersion}</p>
    <dl className={styles.sleepBreakdownList}>
      {breakdown.components.map((component) => <div className={styles.sleepBreakdownRow} key={component.id}>
        <dt><span>{component.label}</span><small>{component.weight}%</small></dt>
        <dd>
          <span><small>Source</small><strong>{component.sourceValueLabel}</strong></span>
          <span><small>Normalized</small><strong>{formatNormalized(component.normalizedValue)}<em>/100</em></strong></span>
          <span><small>Contribution</small><strong>{formatContribution(component.contribution)}<em> pts</em></strong></span>
        </dd>
        <dd className={styles.sleepBreakdownFormula}>
          <span><small>Formula</small><strong>{component.formula}</strong></span>
          <span><small>Normalization</small><strong>{component.normalization}</strong></span>
        </dd>
      </div>)}
    </dl>
  </>;
}

function DimensionDetail({ dimension }: { dimension: SleepRadarDimension | null }) {
  if (!dimension) return null;

  return <>
    <dl className={styles.sleepDimensionMetrics}>
      <div><dt>Current value</dt><dd>{dimension.valueLabel?.trim() || "—"}</dd></div>
      <div><dt>30-day avg</dt><dd>{dimension.averageLabel?.trim() || "—"}</dd></div>
      <div><dt>Reading</dt><dd>{dimension.readingDirection || "—"}</dd></div>
      <div className={styles.sleepDimensionRole}><dt>Role</dt><dd>{dimension.scoreRole || "Context metric · excluded from Sleep score"}</dd></div>
      <div><dt>Source</dt><dd>{dimension.sourceLabel?.trim() || "—"}</dd></div>
    </dl>
    {(dimension.scoreFormula || dimension.scoreNormalization || dimension.scoreWeight !== undefined) && <dl className={styles.sleepScoreAxisMetrics}>
      <div><dt>Formula</dt><dd>{dimension.scoreFormula || "—"}</dd></div>
      <div><dt>Normalization</dt><dd>{dimension.scoreNormalization || "—"}</dd></div>
      <div><dt>Contribution{dimension.scoreWeight !== undefined ? ` · ${dimension.scoreWeight}%` : ""}</dt><dd>{measured(dimension.scoreContribution) ? `${formatContribution(dimension.scoreContribution)} pts` : "Unavailable"}</dd></div>
    </dl>}
    {dimension.definition && <p className={styles.sleepDetailSummary}>{dimension.definition}</p>}
  </>;
}

export function SleepScoreOverview({ dimensions, score, average, breakdown }: SleepScoreOverviewProps) {
  const [selectedDetail, setSelectedDetail] = useState<SelectedDetail | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const detailCloseButtonRef = useRef<HTMLButtonElement>(null);
  const scoreButtonRef = useRef<HTMLButtonElement>(null);
  const radarButtonRefs = useRef<Record<string, SVGGElement | null>>({});
  const selectedDimension = selectedDetail && selectedDetail !== "score"
    ? dimensions.find((dimension) => dimension.id === selectedDetail) ?? null
    : null;
  const detailOpen = selectedDetail !== null && selectedDetail !== "score";
  const scoreOpen = selectedDetail === "score";

  useEffect(() => {
    if (detailOpen) detailHeadingRef.current?.focus({ preventScroll: true });
  }, [detailOpen]);

  useEffect(() => {
    if (!selectedDetail) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeDetail();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  // `closeDetail` intentionally reads the current selected trigger from the closure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDetail]);

  function restoreFocus(detail: SelectedDetail) {
    const restore = () => {
      if (detail === "score") scoreButtonRef.current?.focus();
      else radarButtonRefs.current[detail]?.focus();
    };
    if (typeof window === "undefined") restore();
    else window.requestAnimationFrame(restore);
  }

  function closeDetail() {
    if (!selectedDetail) return;
    const detail = selectedDetail;
    setSelectedDetail(null);
    restoreFocus(detail);
  }

  function selectScore() {
    if (selectedDetail === "score") closeDetail();
    else setSelectedDetail("score");
  }

  function selectDimension(id: string) {
    if (selectedDetail === id) closeDetail();
    else setSelectedDetail(id);
  }

  return <div className={styles.sleepScoreOverview}>
    <div className={styles.sleepRadarStage} data-detail-open={detailOpen}>
      <SleepRadar
        dimensions={dimensions}
        detailId={DETAIL_ID}
        interactive
        onSelect={selectDimension}
        registerButton={(id, node) => { radarButtonRefs.current[id] = node; }}
        selectedId={selectedDetail === "score" ? null : selectedDetail}
        title="Sleep radar"
      />
      <aside
        aria-hidden={!detailOpen}
        aria-labelledby={DETAIL_TITLE_ID}
        className={styles.sleepDetailPanel}
        data-open={detailOpen}
        id={DETAIL_ID}
        inert={!detailOpen}
      >
        <div className={styles.sleepDetailHeader}>
          <h3 id={DETAIL_TITLE_ID} ref={detailHeadingRef} tabIndex={-1}>{selectedDimension?.label ?? "Sleep details"}</h3>
          <DetailCloseButton closeButtonRef={detailCloseButtonRef} label={selectedDimension?.label ?? "sleep"} onClose={closeDetail} tabIndex={detailOpen ? 0 : -1} />
        </div>
        {detailOpen ? <DimensionDetail dimension={selectedDimension} /> : null}
      </aside>
    </div>

    <div className={styles.scoreColumn}>
      <button
        aria-controls="sleep-score-inline"
        aria-expanded={scoreOpen}
        aria-label={`${scoreDescription(score)}. ${scoreOpen ? "Close" : "View"} score breakdown.`}
        className={styles.scorePanel}
        data-detail-selected={scoreOpen}
        onClick={selectScore}
        ref={scoreButtonRef}
        type="button"
      >
        <span>Sleep score</span>
        <strong className={styles.scoreValue}>{formatScore(score)}<small>/100</small></strong>
        <p className={styles.scoreAverage}>30-day avg · <strong>{formatScore(average)}</strong><span> /100</span></p>
      </button>
      <div className={styles.scoreInline} id="sleep-score-inline" data-open={scoreOpen} aria-hidden={!scoreOpen} inert={!scoreOpen} aria-labelledby="sleep-score-inline-heading">
        <div className={styles.scoreInlineInner}><h3 id="sleep-score-inline-heading">Sleep calculation</h3><ScoreBreakdownDetail breakdown={breakdown} /></div>
      </div>
    </div>
  </div>;
}
