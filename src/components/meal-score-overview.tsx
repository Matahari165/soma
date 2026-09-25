"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";

import {
  MEAL_BALANCE_COMPONENT_ORDER,
  MEAL_BALANCE_COMPONENT_WEIGHTS,
  MEAL_BALANCE_NORMALIZED_COMPONENT_WEIGHTS,
  type MealBalanceComponentKey,
  type MealBalanceScore,
  type MealBalanceSubcomponent,
} from "@/domain/scores/meal-balance";
import type { MetricPoint } from "@/domain/metrics/trends";
import { BarTrendChart } from "@/components/health/health-charts";

import styles from "./meal-score-overview.module.css";

export type MealScoreRolling = {
  days: 14 | 28;
  score: number | null;
  observedDays: number;
  readyDays: number;
  totalDays: number;
};

export type MealScoreTrendPoint = {
  date: string;
  score: number | null;
  rawScore?: number | null;
  status?: "ready" | "limited" | "insufficient" | null;
  confidence?: number | null;
  dimensionScores?: Partial<Record<MealBalanceComponentKey, number | null>>;
  dimensionAdjustedScores?: Partial<Record<MealBalanceComponentKey, number | null>>;
};

export type MealScoreOverviewPanelProps = {
  daily: MealBalanceScore | null;
  rolling: readonly MealScoreRolling[];
  trend: readonly MealScoreTrendPoint[];
  className?: string;
  date?: string;
  today?: string;
  showHistory?: boolean;
};

const DIMENSION_KEYS = MEAL_BALANCE_COMPONENT_ORDER;
const RADAR_RADIUS = 132;
const RADAR_LABEL_RADIUS = 166;
const RADAR_GRID_RATIOS = [0.25, 0.5, 0.75, 1] as const;
const DIMENSION_LABELS: Record<MealBalanceComponentKey, string> = {
  nutritionAdequacy: "Nutritional adequacy",
  foodQuality: "Food quality",
  sugarLoad: "Sugar & concentration",
  nova: "NOVA processing",
  positiveVariety: "Positive variety",
};
const RADAR_LABEL_LINES: Record<MealBalanceComponentKey, readonly string[]> = {
  nutritionAdequacy: ["Nutritional", "adequacy"],
  foodQuality: ["Food", "quality"],
  sugarLoad: ["Sugar &", "concentration"],
  nova: ["NOVA", "processing"],
  positiveVariety: ["Positive", "variety"],
};
const RADAR_DETAIL_ID = "meal-score-dimension-detail";

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(value));
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

function formatContribution(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, signDisplay: "always" }).format(value);
}

function formatDate(date: string, long = false) {
  const parsed = new Date(`${date}T12:00:00`);
  if (!Number.isFinite(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("en-US", long
    ? { weekday: "long", month: "long", day: "numeric" }
    : { month: "short", day: "numeric" }).format(parsed);
}

function scoreDescription(score: number | null) {
  return score === null ? "Score unavailable" : `Score ${formatScore(score)} out of 100`;
}

function componentFor(daily: MealBalanceScore | null, key: MealBalanceComponentKey) {
  return daily?.components.find((component) => component.key === key) ?? null;
}

function scoreBarStyle(score: number | null): CSSProperties | undefined {
  if (score === null || !Number.isFinite(score)) return undefined;
  const scale = score === 0 ? 0.02 : Math.min(Math.max(score, 0), 100) / 100;
  return { "--bar-scale": String(scale) } as CSSProperties;
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
    return { keyName, component, label: component?.label ?? DIMENSION_LABELS[keyName], score: component?.adjustedScore ?? null };
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
  const axisNodes = useRef(new Map<MealBalanceComponentKey, SVGGElement | null>());

  function focusAxis(key: MealBalanceComponentKey) {
    axisNodes.current.get(key)?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<SVGGElement>, key: MealBalanceComponentKey) {
    const index = DIMENSION_KEYS.indexOf(key);
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(key);
      return;
    }
    let next: MealBalanceComponentKey | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = DIMENSION_KEYS[(index + 1) % DIMENSION_KEYS.length];
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = DIMENSION_KEYS[(index - 1 + DIMENSION_KEYS.length) % DIMENSION_KEYS.length];
    else if (event.key === "Home") next = DIMENSION_KEYS[0];
    else if (event.key === "End") next = DIMENSION_KEYS[DIMENSION_KEYS.length - 1];
    if (!next) return;
    event.preventDefault();
    focusAxis(next);
  }

  const measuredPoints = axes.map((axis, index) => axis.score === null || !Number.isFinite(axis.score) ? null : radarPoint(index, RADAR_RADIUS * Math.min(Math.max(axis.score, 0), 100) / 100));
  const radarSegments = measuredPoints.flatMap((point, index) => {
    const next = measuredPoints[(index + 1) % measuredPoints.length];
    return point && next ? [{ from: point, to: next }] : [];
  });

  return <figure className={styles.balanceRadar}>
    <svg viewBox="0 0 420 420" role="group" aria-labelledby="meal-balance-radar-title meal-balance-radar-description">
      <title id="meal-balance-radar-title">Dietary dimensions profile</title>
      <desc id="meal-balance-radar-description">{description}. Missing values remain unavailable and are not represented as zero. Select a label to view its details.</desc>
      {RADAR_GRID_RATIOS.map((ratio) => {
        const radius = RADAR_RADIUS * ratio;
        return <polygon className={styles.radarGrid} key={ratio} points={DIMENSION_KEYS.map((_, index) => radarPoint(index, radius).join(",")).join(" ")} aria-hidden="true" />;
      })}
      {axes.map((axis, index) => {
        const edge = radarPoint(index, RADAR_RADIUS);
        const [labelX, y] = radarPoint(index, RADAR_LABEL_RADIUS);
        const anchor = labelX < 185 ? "end" : labelX > 235 ? "start" : "middle";
        const x = Math.min(Math.max(labelX, 100), 320);
        const lines = RADAR_LABEL_LINES[axis.keyName];
        const firstDy = lines.length > 1 ? -7 : 0;
        const point = axis.score === null || !Number.isFinite(axis.score) ? null : radarPoint(index, RADAR_RADIUS * Math.min(Math.max(axis.score, 0), 100) / 100);
        const selected = selectedKey === axis.keyName;
        const actionLabel = selected ? "Hide dimension details" : "Show dimension details";
        return <g
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
          ref={(node) => { axisNodes.current.set(axis.keyName, node); registerButton(axis.keyName, node); }}
          role="button"
          tabIndex={0}
        >
          <line className={styles.radarAxis} x1="210" y1="210" x2={edge[0]} y2={edge[1]} aria-hidden="true" />
          <line className={styles.radarAxisHit} x1="210" y1="210" x2={edge[0]} y2={edge[1]} aria-hidden="true" />
          {point ? <circle className={styles.radarPoint} data-radar-point="" data-radar-point-index={index} style={{ "--radar-point-index": index } as CSSProperties} cx={point[0]} cy={point[1]} r="5" aria-hidden="true" /> : null}
          <circle className={styles.radarLabelHit} cx={x} cy={y} r="30" aria-hidden="true" />
          <circle className={styles.radarFocusRing} cx={x} cy={y} r="26" aria-hidden="true" />
          <text className={styles.radarLabel} x={x} y={y} textAnchor={anchor} aria-hidden="true">
            {lines.map((line, lineIndex) => <tspan x={x} dy={lineIndex === 0 ? firstDy : 13} key={line}>{line}</tspan>)}
            <tspan className={styles.radarLabelValue} x={x} dy="16">{axis.score === null ? "—" : `${formatScore(axis.score)}%`}</tspan>
          </text>
        </g>;
      })}
      {complete ? <polygon className={styles.radarValue} points={axes.map((axis, index) => radarPoint(index, RADAR_RADIUS * Math.min(Math.max(axis.score ?? 0, 0), 100) / 100).join(",")).join(" ")} aria-hidden="true" /> : null}
      {radarSegments.map(({ from, to }, index) => <line key={`segment-${index}`} className={styles.radarSegment} data-radar-trace="" data-radar-segment-index={index} style={{ "--radar-segment-index": index } as CSSProperties} pathLength="1" x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} aria-hidden="true" />)}
    </svg>
    <figcaption className={styles.srOnly}>Interactive chart. The five axes are keyboard-accessible buttons.</figcaption>
  </figure>;
}

function subcomponentValue(item: MealBalanceSubcomponent) {
  if (item.value === null) return "—";
  return typeof item.value === "number" ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(item.value) : item.value;
}

type DimensionDetailProps = {
  dimension: RadarAxis | null;
  open: boolean;
  trend: readonly MealScoreTrendPoint[];
  headingRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
};

function DimensionDetail({ dimension, open, trend, headingRef, onClose }: DimensionDetailProps) {
  const component = dimension?.component ?? null;
  const score = component?.score ?? null;
  const adjustedScore = component?.adjustedScore ?? null;
  const weight = component?.weight ?? (dimension ? MEAL_BALANCE_COMPONENT_WEIGHTS[dimension.keyName] / 1.1 : null);
  const summary = component?.summary ?? "No usable observation for this dimension.";
  const label = dimension?.label ?? "Dimension details";
  const history = dimension
    ? trend.map((point) => ({ date: point.date, score: point.dimensionAdjustedScores?.[dimension.keyName] ?? point.dimensionScores?.[dimension.keyName] ?? null }))
    : [];
  const observedHistory = history.filter((point) => point.score !== null);
  return <aside aria-hidden={!open} aria-labelledby="meal-score-dimension-detail-title" className={styles.dimensionDetail} data-open={open} id={RADAR_DETAIL_ID}>
    <div className={styles.dimensionDetailHeader}>
      <h3 id="meal-score-dimension-detail-title" ref={headingRef} tabIndex={-1}>{label}</h3>
      {open && <button type="button" className={styles.detailClose} onClick={onClose} aria-label="Close detail panel">Close</button>}
    </div>
    <dl className={styles.dimensionDetailMetrics}>
      <div><dt>Raw score</dt><dd>{formatScore(score)}<span>/100</span></dd></div>
      <div><dt>Confidence-adjusted</dt><dd>{formatScore(adjustedScore)}<span>/100</span></dd></div>
      <div><dt>Global weight</dt><dd>{weight === null ? "—" : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(weight)}%`}</dd></div>
      <div><dt>Contribution</dt><dd>{component ? formatContribution(component.contribution) : "—"}</dd></div>
      <div className={styles.dimensionDetailObservation}><dt>Analysis confidence</dt><dd>{formatPercent(component?.confidence)}</dd></div>
    </dl>
    {component?.subcomponents.length ? <section className={styles.subscoreSection} aria-labelledby="meal-score-subscore-title">
      <h4 id="meal-score-subscore-title">Sub-metrics</h4>
      <ul className={styles.subscoreList}>{component.subcomponents.map((item) => <li className={styles.subscoreItem} key={item.key}>
        <div><strong>{item.label}</strong><span>{formatScore(item.adjustedScore)}<small>/100</small></span></div>
        <div className={styles.subscoreMeta}><span>{subcomponentValue(item)}{item.target ? ` · ${item.target}` : ""}</span><span>{formatPercent(item.confidence)}</span></div>
        <div className={styles.subscoreRail} aria-hidden="true"><span style={{ width: `${Math.min(Math.max(item.adjustedScore ?? 0, 0), 100)}%` }} /></div>
      </li>)}</ul>
    </section> : null}
    <section className={styles.dimensionHistory} aria-labelledby="meal-score-dimension-history-title">
      <h4 id="meal-score-dimension-history-title">28-day trend</h4>
      {observedHistory.length ? <div className={styles.dimensionHistoryBars} role="img" aria-label={`28-day trend for ${label}`}>
        {history.map((point) => <span key={point.date} title={`${formatDate(point.date)}: ${formatScore(point.score)}`} style={scoreBarStyle(point.score)} />)}
      </div> : <p>No historical data.</p>}
    </section>
    <p className={styles.dimensionDetailSummary}>{summary}{component?.target ? ` Target: ${component.target}.` : ""}{component?.period ? ` Period: ${formatDate(component.period.from)} to ${formatDate(component.period.to)}.` : ""}</p>
  </aside>;
}


export function MealScoreHistoryPanel({ trend }: { trend: readonly MealScoreTrendPoint[] }) {
  const observedTrend = trend.filter((point) => point.score !== null && Number.isFinite(point.score));
  const latest = observedTrend.at(-1)?.score ?? null;
  const average = observedTrend.length
    ? observedTrend.reduce((sum, point) => sum + (point.score ?? 0), 0) / observedTrend.length
    : null;
  const chartPoints: MetricPoint[] = trend.map((point) => ({ date: point.date, value: point.score }));
  const firstDate = trend[0]?.date;
  const lastDate = trend.at(-1)?.date ?? firstDate;
  const titleId = "meal-score-trend-title";
  const descriptionId = "meal-score-trend-description";
  const chartDescription = trend.length
    ? trend.map((point) => point.score === null
      ? formatDate(point.date, true) + ": no score, day remains empty in the chart"
      : formatDate(point.date, true) + ": score " + formatScore(point.score) + " out of 100" + (point.status === "limited" ? ", confidence " + formatPercent(point.confidence) : "")).join(". ")
    : "No days available for this trend.";
  return (
    <article className={styles.trendCard} aria-labelledby={titleId} aria-describedby={descriptionId}>
      <header className={styles.trendHeader}>
        <div className={styles.trendHeading}>
          <h3 id={titleId}>Nutrition score trend</h3>
          <strong>{latest === null ? "—" : formatScore(latest)}{latest === null ? null : <small>/100</small>}</strong>
          <p>{average === null ? "No measured average" : "Avg. " + formatScore(average) + "/100"}</p>
        </div>
      </header>
      <div className={styles.trendChartFrame} data-testid="meal-score-bar-chart">
        {observedTrend.length ? <BarTrendChart points={chartPoints} label="Nutrition score trend" unit="pts" valueFormat="number" average={average} domain={{ min: 0, max: 100 }} /> : <p className={styles.emptyInline}>No score history available.</p>}
        <div className={styles.trendAxis} aria-hidden="true"><span>{firstDate ? formatDate(firstDate) : ""}</span><span>{lastDate ? formatDate(lastDate) : ""}</span></div>
        <p id={descriptionId} className={styles.srOnly}>{chartDescription} Missing days stay empty and are not counted as a zero score.</p>
      </div>
    </article>
  );
}

export function MealScoreOverviewPanel({ daily, rolling, trend, className, date, today, showHistory = true }: MealScoreOverviewPanelProps) {
  const dailyScore = daily?.score ?? null;
  const scoreDate = date && today && date !== today ? formatDate(date) : null;
  const rolling14 = rolling.find((item) => item.days === 14);
  const rolling28 = rolling.find((item) => item.days === 28);
  const [selectedKey, setSelectedKey] = useState<MealBalanceComponentKey | null>(null);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [openFact, setOpenFact] = useState<number | null>(null);
  const scoreDetailId = useId();
  const scoreButtonRef = useRef<HTMLButtonElement>(null);
  const radarButtonRefs = useRef<Partial<Record<MealBalanceComponentKey, SVGGElement | null>>>({});
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const selectedDimension = selectedKey ? axisData(daily).find((axis) => axis.keyName === selectedKey) ?? null : null;

  useEffect(() => {
    if (selectedKey) detailHeadingRef.current?.focus({ preventScroll: true });
  }, [selectedKey]);

  const restoreRadarFocus = useCallback((key: MealBalanceComponentKey) => {
    const restore = () => radarButtonRefs.current[key]?.focus();
    if (typeof window === "undefined") restore();
    else window.requestAnimationFrame(restore);
  }, []);

  const closeDimension = useCallback(() => {
    if (!selectedKey) return;
    const key = selectedKey;
    setSelectedKey(null);
    restoreRadarFocus(key);
  }, [restoreRadarFocus, selectedKey]);

  useEffect(() => {
    if (!selectedKey || typeof document === "undefined") return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeDimension();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeDimension, selectedKey]);

  useEffect(() => {
    if (!scoreOpen) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setScoreOpen(false);
      scoreButtonRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [scoreOpen]);

  function toggleDimension(key: MealBalanceComponentKey) {
    setScoreOpen(false);
    if (selectedKey === key) closeDimension();
    else setSelectedKey(key);
  }

  const facts = [
    { label: "14-day average", value: formatScore(rolling14?.score ?? null), suffix: "/100", context: rolling14 ? `${rolling14.observedDays} observed days` : "No observations", explanation: "Average of days with a calculated nutrition score over the last 14 days. Missing days are excluded." },
    { label: "28-day average", value: formatScore(rolling28?.score ?? null), suffix: "/100", context: rolling28 ? `${rolling28.observedDays} observed days` : "No observations", explanation: "Average of days with a calculated nutrition score over the last 28 days. Missing days are excluded." },
    { label: "Confidence", value: formatPercent(daily?.confidence), suffix: "", context: daily ? daily.status === "ready" ? "Complete" : daily.status === "limited" ? "Partial" : "Insufficient" : "Unavailable", explanation: "Soma estimates confidence from the confirmed observations. It can adjust the score slightly." },
    { label: "Dimensions observed", value: daily ? String(daily.observedDimensions) : "—", suffix: "/5", context: "Confirmed meals only", explanation: "The five nutrition dimensions use confirmed meals. Unobserved dimensions remain unavailable." },
  ];

  return <section className={[styles.root, className].filter(Boolean).join(" ")} aria-label="Dietary balance">
    <div className={styles.scoreTop} data-score-part="top">
      <div className={styles.scoreEssentials}>
        <div className={styles.radarStage} data-detail-open={selectedDimension ? "true" : "false"}>
          <MealBalanceRadar daily={daily} onSelect={toggleDimension} registerButton={(key, node) => { radarButtonRefs.current[key] = node; }} selectedKey={selectedKey} />
          <div className={styles.dimensionDetailShell} data-open={selectedDimension !== null}>
            <DimensionDetail dimension={selectedDimension} trend={trend} headingRef={detailHeadingRef} open={selectedDimension !== null} onClose={closeDimension} />
          </div>
        </div>
        <article className={styles.dailyPanel} aria-labelledby="meal-score-daily-title">
          <div className={styles.panelHeading}><h3 id="meal-score-daily-title">Nutrition score</h3></div>
          <button ref={scoreButtonRef} type="button" className={styles.dailyScoreTrigger} aria-label={`${scoreDescription(dailyScore)}. ${scoreOpen ? "Close" : "View"} score calculation.`} aria-controls={scoreDetailId} aria-expanded={scoreOpen} onClick={() => { setSelectedKey(null); setScoreOpen((open) => !open); }}><strong className={styles.dailyScore}>{formatScore(dailyScore)}<span>/100</span></strong></button>
          <p className={styles.scoreAverage}>{scoreDate ? `${scoreDate} · ` : ""}28-day avg · {formatScore(rolling28?.score ?? null)} /100</p>
          <div className={styles.scoreInline} id={scoreDetailId} data-open={scoreOpen} aria-hidden={!scoreOpen} inert={!scoreOpen}>
            <div className={styles.scoreInlineInner}>
              <h4>Nutrition calculation</h4>
              <dl>{DIMENSION_KEYS.map((key) => {
                const component = componentFor(daily, key);
                return <div key={key}><dt>{DIMENSION_LABELS[key]}</dt><dd aria-label={`Adjusted score ${formatScore(component?.adjustedScore)} out of 100; contribution ${formatContribution(component?.contribution)} points; weight ${Math.round(component?.weight ?? MEAL_BALANCE_NORMALIZED_COMPONENT_WEIGHTS[key])} percent`}>{formatScore(component?.adjustedScore)} /100</dd><small>{component ? `${formatContribution(component.contribution)} points · ` : "— · "}{Math.round(component?.weight ?? MEAL_BALANCE_NORMALIZED_COMPONENT_WEIGHTS[key])}%</small></div>;
              })}</dl>
            </div>
          </div>
          <div className={styles.scoreRail} aria-hidden="true">{dailyScore === null ? null : <span style={{ width: `${Math.min(Math.max(dailyScore, 0), 100)}%` }} />}</div>
        </article>
      </div>

      <dl className={styles.summaryFacts} aria-label="Nutrition score context">
        {facts.map((fact, index) => <div key={fact.label}>
          <dt>{fact.label}</dt>
          <dd><button type="button" className={styles.factToggle} aria-expanded={openFact === index} aria-controls={`nutrition-fact-${index}`} onClick={() => setOpenFact((current) => current === index ? null : index)}>{fact.value}<small>{fact.suffix}</small><span className={styles.factChevron} aria-hidden="true">⌄</span></button></dd>
          <p>{fact.context}</p>
          <div className={styles.factExplanation} id={`nutrition-fact-${index}`} hidden={openFact !== index}>{fact.explanation}</div>
        </div>)}
      </dl>

      {showHistory && <MealScoreHistoryPanel trend={trend} />}
    </div>
  </section>;
}

export default MealScoreOverviewPanel;
