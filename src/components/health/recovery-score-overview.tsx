"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { RecoveryRadar, type RecoveryRadarDimension } from "./recovery-radar";
import styles from "./recovery-redesign.module.css";

type RecoveryScoreOverviewProps = {
  dimensions: readonly RecoveryRadarDimension[];
  score: number | null;
  average: number | null;
  coverage: number;
  freshnessLabel: string;
  heroScoreTone: string;
  scoreAction?: ReactNode;
};

function scoreText(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : Math.round(value).toLocaleString("fr-FR");
}

function dimensionValueText(score: number | null) {
  if (score === null || !Number.isFinite(score)) return "—";
  const rounded = Math.round(score).toLocaleString("fr-FR");
  return `${rounded} /100`;
}

const DETAIL_ID = "recovery-radar-detail";
const DETAIL_TITLE_ID = "recovery-radar-detail-title";

function DetailCloseButton({ label, onClose, closeButtonRef, tabIndex }: { label: string; onClose: () => void; closeButtonRef: RefObject<HTMLButtonElement | null>; tabIndex: number }) {
  return <button
    aria-label={`Fermer les détails de ${label}`}
    className={styles.recoveryDetailClose}
    onClick={onClose}
    ref={closeButtonRef}
    tabIndex={tabIndex}
    type="button"
  >Fermer</button>;
}

function DimensionDetail({ dimension }: { dimension: RecoveryRadarDimension | null }) {
  if (!dimension) return null;

  return <>
    <dl className={styles.recoveryDimensionMetrics}>
      <div><dt>Valeur actuelle</dt><dd>{dimensionValueText(dimension.score)}</dd></div>
      <div><dt>Moy. 30 j</dt><dd>Indisponible</dd></div>
      <div><dt>Sens de lecture</dt><dd>{dimension.readingDirection || "—"}</dd></div>
      <div className={styles.recoveryDimensionRole}><dt>Rôle</dt><dd>{dimension.scoreRole || "—"}</dd></div>
    </dl>
    <dl className={styles.recoveryRuleMetrics}>
      <div><dt>Formule</dt><dd>Comparaison avec votre référence personnelle.</dd></div>
      <div><dt>Contribution</dt><dd>Indisponible</dd></div>
    </dl>
  </>;
}

export function RecoveryScoreOverview({ dimensions, score, average, coverage, freshnessLabel, heroScoreTone, scoreAction }: RecoveryScoreOverviewProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const detailCloseButtonRef = useRef<HTMLButtonElement>(null);
  const radarButtonRefs = useRef<Record<string, SVGGElement | null>>({});
  const selectedDimension = selectedKey ? dimensions.find((dimension) => dimension.key === selectedKey) ?? null : null;
  const detailOpen = selectedKey !== null;

  useEffect(() => {
    if (selectedKey) detailHeadingRef.current?.focus({ preventScroll: true });
  }, [selectedKey]);

  useEffect(() => {
    if (!selectedKey) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeDetail();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  // `closeDetail` intentionally reads the current selected trigger from the closure.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  function restoreFocus(key: string) {
    const restore = () => {
      radarButtonRefs.current[key]?.focus();
    };
    if (typeof window === "undefined") restore();
    else window.requestAnimationFrame(restore);
  }

  function closeDetail() {
    if (!selectedKey) return;
    const key = selectedKey;
    setSelectedKey(null);
    restoreFocus(key);
  }

  function selectDimension(key: string) {
    if (selectedKey === key) closeDetail();
    else setSelectedKey(key);
  }

  return <>
    <div className={styles.recoveryRadarStage} data-detail-open={detailOpen}>
      <div className={styles.radarRegion}>
        <h2 className="sr-only">Facteurs du score</h2>
        <RecoveryRadar
          dimensions={dimensions}
          detailId={DETAIL_ID}
          interactive
          onSelect={selectDimension}
          registerButton={(key, node) => { radarButtonRefs.current[key] = node; }}
          selectedId={selectedKey}
        />
      </div>
      <aside
        aria-hidden={!detailOpen}
        aria-labelledby={DETAIL_TITLE_ID}
        className={styles.recoveryDetailPanel}
        data-open={detailOpen}
        id={DETAIL_ID}
      >
        <div className={styles.recoveryDetailHeader}>
          <h3 id={DETAIL_TITLE_ID} ref={detailHeadingRef} tabIndex={-1}>{selectedDimension?.label ?? "Détail de la récupération"}</h3>
          <DetailCloseButton closeButtonRef={detailCloseButtonRef} label={selectedDimension?.label ?? "récupération"} onClose={closeDetail} tabIndex={detailOpen ? 0 : -1} />
        </div>
        <DimensionDetail dimension={selectedDimension} />
      </aside>
    </div>
    <aside className={styles.scoreSummary} aria-labelledby="recovery-score-summary-title">
      <span className={styles.summaryKicker}>Aujourd’hui</span>
      <h2 id="recovery-score-summary-title">Score de récupération</h2>
      <div className={styles.summaryValue} aria-label={`Score de récupération : ${scoreText(score)} sur 100`}><strong>{scoreText(score)}</strong><span>/100</span></div>
      <div className={`${styles.summaryRail} metric-tone--${heroScoreTone}`} aria-hidden="true"><span style={{ width: score === null ? "0%" : `${Math.min(100, Math.max(0, score))}%` }} /></div>
      <dl className={styles.summaryFacts}>
        <div><dt>État</dt><dd>{freshnessLabel}</dd></div>
        <div><dt>Couverture</dt><dd>{Math.round(coverage * 100)} %</dd></div>
        <div><dt>Moyenne · 30 j</dt><dd>{scoreText(average)}<span>/100</span></dd></div>
      </dl>
      {scoreAction ? <div className={styles.summaryAction}>{scoreAction}</div> : null}
    </aside>
  </>;
}
