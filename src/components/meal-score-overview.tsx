"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";

import {
  MEAL_BALANCE_COMPONENT_WEIGHTS,
  type MealBalanceComponentKey,
  type MealBalanceScore,
} from "@/domain/scores/meal-balance";

import styles from "./meal-score-overview.module.css";

export type MealScoreRolling = {
  days: 14 | 28;
  score: number | null;
  coveredDays: number;
  readyDays?: number;
  observedDays: number;
  effectiveDays?: number;
  coverage?: number;
  confidence?: number;
  totalDays: number;
};

export type MealScoreTrendPoint = {
  date: string;
  score: number | null;
  status?: "ready" | "limited" | "insufficient" | null;
  coverage?: number | null;
  confidence?: number | null;
};

export type MealScoreOverviewPanelProps = {
  daily: MealBalanceScore | null;
  rolling: readonly MealScoreRolling[];
  trend: readonly MealScoreTrendPoint[];
  className?: string;
};

const DIMENSION_KEYS: readonly MealBalanceComponentKey[] = [
  "variety",
  "foodQuality",
  "addedSugar",
  "sugarExposure",
  "ultraProcessing",
  "nutritionCoverage",
  "energy",
];

const DIMENSION_LABELS: Record<MealBalanceComponentKey, string> = {
  variety: "Variété",
  foodQuality: "Qualité alimentaire",
  addedSugar: "Sucre ajouté",
  sugarExposure: "Exposition liquide / concentrée",
  ultraProcessing: "Ultra-transformation",
  nutritionCoverage: "Couverture nutritionnelle",
  energy: "Énergie",
};

const RADAR_LABEL_LINES: Record<MealBalanceComponentKey, readonly string[]> = {
  variety: ["Variété"],
  foodQuality: ["Qualité", "alimentaire"],
  addedSugar: ["Sucre ajouté"],
  sugarExposure: ["Exposition liquide", "/ concentrée"],
  ultraProcessing: ["Ultra-", "transformation"],
  nutritionCoverage: ["Couverture", "nutritionnelle"],
  energy: ["Énergie"],
};

const RADAR_DETAIL_ID = "meal-score-dimension-detail";

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)} %`;
}

function formatContribution(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value);
}

function formatDate(date: string, long = false) {
  const parsed = new Date(`${date}T12:00:00`);
  if (!Number.isFinite(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("fr-FR", long
    ? { weekday: "long", day: "numeric", month: "long" }
    : { day: "numeric", month: "short" }).format(parsed).replace(".", "");
}

function scoreDescription(score: number | null) {
  return score === null ? "Score indisponible" : `Score ${formatScore(score)} sur 100`;
}

function componentFor(daily: MealBalanceScore | null, key: MealBalanceComponentKey) {
  return daily?.components.find((component) => component.key === key) ?? null;
}

function observationDescription(component: ReturnType<typeof componentFor>) {
  if (!component || component.score === null) return "Aucune observation exploitable";
  const observed = component.observedValue === null ? "valeur non détaillée" : String(component.observedValue);
  return `${observed} · ${formatPercent(component.observationCoverage)} observé · ${formatPercent(component.confidence)} confiance`;
}

function scoreBarStyle(score: number | null): CSSProperties | undefined {
  if (score === null || !Number.isFinite(score)) return undefined;
  const scale = score === 0 ? 0.02 : Math.min(Math.max(score, 0), 100) / 100;
  return { "--bar-scale": String(scale) } as CSSProperties;
}

function RollingWindow({ item, days }: { item: MealScoreRolling | undefined; days: 14 | 28 }) {
  const score = item?.score ?? null;
  const observedLabel = item
    ? `${item.observedDays} observé${item.observedDays > 1 || item.observedDays === 0 ? "s" : ""}`
    : "indisponible";
  return (
    <li className={styles.rollingItem} data-window={`${days}`}>
      <span className={styles.rollingLabel}>{days} jours ({observedLabel})</span>
      <strong className={styles.rollingScore} aria-label={scoreDescription(score)}>{formatScore(score)}<span>/100</span></strong>
    </li>
  );
}

type RadarAxis = {
  keyName: MealBalanceComponentKey;
  label: string;
  score: number | null;
  component: ReturnType<typeof componentFor>;
};

function radarPoint(index: number, radius: number) {
  const angle = -Math.PI / 2 + index * (Math.PI * 2 / DIMENSION_KEYS.length);
  return [210 + Math.cos(angle) * radius, 210 + Math.sin(angle) * radius] as const;
}

function axisData(daily: MealBalanceScore | null): RadarAxis[] {
  return DIMENSION_KEYS.map((keyName) => {
    const component = componentFor(daily, keyName);
    return { keyName, component, label: component?.label ?? DIMENSION_LABELS[keyName], score: component?.score ?? null };
  });
}

type MealBalanceRadarProps = {
  daily: MealBalanceScore | null;
  selectedKey: MealBalanceComponentKey | null;
  onSelect: (key: MealBalanceComponentKey) => void;
  registerButton: (key: MealBalanceComponentKey, node: SVGGElement | null) => void;
};

function MealBalanceRadar({ daily, selectedKey, onSelect, registerButton }: MealBalanceRadarProps) {
  const axes = axisData(daily);
  const complete = axes.every((axis) => axis.score !== null && Number.isFinite(axis.score));
  const description = axes.map((axis) => `${axis.label} : ${scoreDescription(axis.score)}`).join(". ");

  function handleKeyDown(event: KeyboardEvent<SVGGElement>, key: MealBalanceComponentKey) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect(key);
  }

  return (
    <figure className={styles.balanceRadar}>
      <svg viewBox="0 0 420 420" role="group" aria-labelledby="meal-balance-radar-title meal-balance-radar-description">
        <title id="meal-balance-radar-title">Profil des sept dimensions de l’équilibre alimentaire</title>
        <desc id="meal-balance-radar-description">
          {description}. Une valeur absente reste indisponible et n’est pas représentée comme zéro. Sélectionnez une étiquette pour afficher ses détails.
        </desc>
        {[32, 64, 96, 128].map((radius) => (
          <polygon className={styles.radarGrid} key={radius} points={DIMENSION_KEYS.map((_, index) => radarPoint(index, radius).join(",")).join(" ")} aria-hidden="true" />
        ))}
        {axes.map((axis, index) => {
          const edge = radarPoint(index, 128);
          const [x, y] = radarPoint(index, 166);
          const anchor = x < 185 ? "end" : x > 235 ? "start" : "middle";
          const lines = RADAR_LABEL_LINES[axis.keyName];
          const firstDy = lines.length > 1 ? -7 : 0;
          const point = axis.score === null || !Number.isFinite(axis.score)
            ? null
            : radarPoint(index, 128 * Math.min(Math.max(axis.score, 0), 100) / 100);
          const selected = selectedKey === axis.keyName;
          const actionLabel = selected ? "Masquer les détails de cette dimension" : "Afficher les détails de cette dimension";
          return (
            <g
              aria-controls={RADAR_DETAIL_ID}
              aria-expanded={selected}
              aria-label={`${axis.label}. ${scoreDescription(axis.score)}. ${actionLabel}.`}
              aria-pressed={selected}
              className={styles.radarAxisButton}
              data-key={axis.keyName}
              data-selected={selected}
              key={axis.keyName}
              onClick={() => onSelect(axis.keyName)}
              onKeyDown={(event) => handleKeyDown(event, axis.keyName)}
              ref={(node) => registerButton(axis.keyName, node)}
              role="button"
              tabIndex={0}
            >
              <line className={styles.radarAxis} x1="210" y1="210" x2={edge[0]} y2={edge[1]} aria-hidden="true" />
              <line className={styles.radarAxisHit} x1="210" y1="210" x2={edge[0]} y2={edge[1]} aria-hidden="true" />
              {point ? <circle className={styles.radarPoint} cx={point[0]} cy={point[1]} r="3" aria-hidden="true" /> : null}
              <circle className={styles.radarLabelHit} cx={x} cy={y} r="30" aria-hidden="true" />
              <circle className={styles.radarFocusRing} cx={x} cy={y} r="26" aria-hidden="true" />
              <text className={styles.radarLabel} x={x} y={y} textAnchor={anchor} aria-hidden="true">
                {lines.map((line, lineIndex) => <tspan x={x} dy={lineIndex === 0 ? firstDy : 13} key={line}>{line}</tspan>)}
                <tspan className={styles.radarLabelValue} x={x} dy="16">{formatScore(axis.score)}</tspan>
              </text>
            </g>
          );
        })}
        {complete ? (
          <polygon className={styles.radarValue} points={axes.map((axis, index) => radarPoint(index, 128 * Math.min(Math.max(axis.score ?? 0, 0), 100) / 100).join(",")).join(" ")} aria-hidden="true" />
        ) : null}
      </svg>
      <figcaption className={styles.srOnly}>Graphique interactif. Les axes sont des boutons accessibles au clavier.</figcaption>
    </figure>
  );
}

type DimensionDetailProps = {
  dimension: RadarAxis | null;
  open: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
};

function DimensionDetail({ dimension, open, headingRef }: DimensionDetailProps) {
  const component = dimension?.component ?? null;
  const score = component?.score ?? null;
  const weight = component?.weight ?? (dimension ? MEAL_BALANCE_COMPONENT_WEIGHTS[dimension.keyName] : null);
  const summary = component?.summary ?? "Aucune observation exploitable pour cette dimension.";
  const label = dimension?.label ?? "Détails de la dimension";
  return (
    <aside aria-hidden={!open} aria-labelledby="meal-score-dimension-detail-title" className={styles.dimensionDetail} data-open={open} id={RADAR_DETAIL_ID}>
      <div className={styles.dimensionDetailHeader}>
        <h3 id="meal-score-dimension-detail-title" ref={headingRef} tabIndex={-1}>{label}</h3>
      </div>
      <dl className={styles.dimensionDetailMetrics}>
        <div><dt>Score</dt><dd>{formatScore(score)}<span>/100</span></dd></div>
        <div><dt>Poids</dt><dd>{weight === null ? "—" : `${weight} %`}</dd></div>
        <div><dt>Contribution</dt><dd>{score === null ? "—" : formatContribution(component?.contribution)}</dd></div>
        <div className={styles.dimensionDetailObservation}><dt>Observation / confiance</dt><dd>{observationDescription(component)}</dd></div>
      </dl>
      <p className={styles.dimensionDetailSummary}>{summary}{component?.target ? ` Cible : ${component.target}.` : ""}</p>
    </aside>
  );
}

export function MealScoreOverviewPanel({ daily, rolling, trend, className }: MealScoreOverviewPanelProps) {
  const dailyScore = daily?.score ?? null;
  const observedTrend = trend.filter((point) => point.score !== null && Number.isFinite(point.score));
  const rolling14 = rolling.find((item) => item.days === 14);
  const rolling28 = rolling.find((item) => item.days === 28);
  const chartDescription = trend.length
    ? trend.map((point) => point.score === null
      ? `${formatDate(point.date, true)} : aucun score, jour absent du tracé`
      : `${formatDate(point.date, true)} : score ${formatScore(point.score)} sur 100${point.status === "limited" ? `, partiel, couverture ${formatPercent(point.coverage)}, confiance ${formatPercent(point.confidence)}` : ""}`).join(". ")
    : "Aucun jour disponible pour cette évolution.";
  const [selectedKey, setSelectedKey] = useState<MealBalanceComponentKey | null>(null);
  const radarButtonRefs = useRef<Partial<Record<MealBalanceComponentKey, SVGGElement | null>>>({});
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const selectedDimension = selectedKey ? axisData(daily).find((axis) => axis.keyName === selectedKey) ?? null : null;

  useEffect(() => {
    if (selectedKey) detailHeadingRef.current?.focus({ preventScroll: true });
  }, [selectedKey]);

  function restoreRadarFocus(key: MealBalanceComponentKey) {
    const restore = () => radarButtonRefs.current[key]?.focus();
    if (typeof window === "undefined") restore();
    else window.requestAnimationFrame(restore);
  }

  function toggleDimension(key: MealBalanceComponentKey) {
    if (selectedKey === key) {
      setSelectedKey(null);
      restoreRadarFocus(key);
    } else setSelectedKey(key);
  }

  return (
    <section className={[styles.root, className].filter(Boolean).join(" ")} aria-label="Équilibre alimentaire">
      <div className={styles.scoreTop} data-score-part="top">
        <div className={styles.scoreEssentials}>
          <div className={styles.radarStage} data-detail-open={selectedDimension ? "true" : "false"}>
            <MealBalanceRadar daily={daily} onSelect={toggleDimension} registerButton={(key, node) => { radarButtonRefs.current[key] = node; }} selectedKey={selectedKey} />
            <div className={styles.dimensionDetailShell} data-open={selectedDimension !== null}>
              <DimensionDetail dimension={selectedDimension} headingRef={detailHeadingRef} open={selectedDimension !== null} />
            </div>
          </div>
          <article className={styles.dailyPanel} aria-labelledby="meal-score-daily-title">
            <div className={styles.panelHeading}><h3 id="meal-score-daily-title">Aujourd’hui</h3></div>
            <strong className={styles.dailyScore} aria-label={scoreDescription(dailyScore)}>{formatScore(dailyScore)}<span>/100</span></strong>
            <div className={styles.scoreRail} aria-hidden="true">{dailyScore === null ? null : <span style={{ width: `${Math.min(Math.max(dailyScore, 0), 100)}%` }} />}</div>
            <dl className={styles.coverageList}>
              <div><dt>Statut</dt><dd>{daily ? daily.status === "ready" ? "Complet" : daily.status === "limited" ? "Partiel" : "Insuffisant" : "—"}</dd></div>
              <div><dt>Couverture</dt><dd>{formatPercent(daily?.coverage)}</dd></div>
              <div><dt>Confiance</dt><dd>{formatPercent(daily?.confidence)}</dd></div>
            </dl>
          </article>
        </div>

        <section className={styles.historySection} aria-labelledby="meal-score-history-title">
          <h2 className={styles.sectionTitle} id="meal-score-history-title">Historique du score</h2>
          <div className={styles.historyContent}>
            <section className={styles.rollingPanel} aria-labelledby="meal-score-rolling-title">
              <div className={styles.panelHeading}><h3 id="meal-score-rolling-title">Moyennes mobiles</h3></div>
              {rolling.length ? <ul className={styles.rollingList}><RollingWindow days={14} item={rolling14} /><RollingWindow days={28} item={rolling28} /></ul> : <p className={styles.emptyInline}>Aucune moyenne disponible.</p>}
            </section>
            <section className={styles.trendSection} aria-labelledby="meal-score-trend-title">
              <div className={styles.panelHeading}><h3 id="meal-score-trend-title">Évolution du score</h3></div>
              {observedTrend.length ? (
                <figure className={styles.chartFigure}>
                  <div className={styles.chart} role="img" aria-labelledby="meal-score-trend-title" aria-describedby="meal-score-trend-description">
                    <div className={styles.chartScale} aria-hidden="true"><span>100</span><span>50</span><span>0</span></div>
                    <div className={styles.barChart} style={{ "--point-count": trend.length } as CSSProperties}>{trend.map((point) => <div className={styles.barColumn} key={point.date}>{point.score === null ? null : <span className={styles.bar} style={scoreBarStyle(point.score)} aria-hidden="true" />}</div>)}</div>
                  </div>
                  <figcaption className={styles.chartCaption}><span>{formatDate(trend[0].date)}</span><span>{formatDate(trend.at(-1)?.date ?? trend[0].date)}</span></figcaption>
                  <p id="meal-score-trend-description" className={styles.srOnly}>{chartDescription}. Les jours absents restent sans barre et ne sont pas comptés comme un score nul.</p>
                </figure>
              ) : <p className={styles.emptyInline}>Aucun historique de score disponible.</p>}
            </section>
          </div>
        </section>
      </div>

    </section>
  );
}

export default MealScoreOverviewPanel;
