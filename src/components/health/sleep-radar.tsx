import { useId, useRef, type CSSProperties, type KeyboardEvent } from "react";

import styles from "./sleep-radar.module.css";

const VIEWBOX_WIDTH = 420;
const VIEWBOX_HEIGHT = 420;
const CENTER_X = VIEWBOX_WIDTH / 2;
const CENTER_Y = VIEWBOX_HEIGHT / 2;
const RADIUS = 132;
const GRID_RATIOS = [0.25, 0.5, 0.75, 1] as const;

/**
 * A sleep dimension is already normalized by the caller: 0 is the inner
 * reference, 1 is the outer reference, and null means unavailable or unmeasured.
 * `valueLabel` is intentionally caller-provided so the chart never invents a
 * unit or a domain value from the normalized position.
 */
export type SleepRadarDimension = {
  id: string;
  label: string;
  normalizedValue: number | null;
  valueLabel?: string;
  averageLabel?: string;
  chartRangeLabel?: string;
  definition?: string;
  readingDirection?: string;
  scoreRole?: string;
  scoreWeight?: number;
  scoreFormula?: string;
  scoreNormalization?: string;
  scoreContribution?: number | null;
  comparison?: "up" | "down" | "equal" | null;
  comparisonLabel?: string | null;
  comparisonTone?: "positive" | "negative" | "neutral";
  sourceLabel?: string;
};

export type SleepRadarProps = {
  dimensions: readonly SleepRadarDimension[];
  title?: string;
  summary?: string;
  className?: string;
  detailId?: string;
  interactive?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  registerButton?: (id: string, node: SVGGElement | null) => void;
};

type Point = [number, number];
type MeasuredSleepRadarDimension = SleepRadarDimension & { normalizedValue: number };

function isNormalizedValue(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function hasNormalizedValue(dimension: SleepRadarDimension): dimension is MeasuredSleepRadarDimension {
  return isNormalizedValue(dimension.normalizedValue);
}

function angleFor(index: number, count: number) {
  return -Math.PI / 2 + (index * Math.PI * 2) / count;
}

function pointFor(index: number, count: number, ratio: number): Point {
  const angle = angleFor(index, count);
  return [
    CENTER_X + Math.cos(angle) * RADIUS * ratio,
    CENTER_Y + Math.sin(angle) * RADIUS * ratio,
  ];
}

function pointsAttribute(points: readonly Point[]) {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

function labelPosition(index: number, count: number) {
  const angle = angleFor(index, count);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const labelRadius = RADIUS + 34;
  const textAnchor: "start" | "middle" | "end" = cosine > 0.28 ? "start" : cosine < -0.28 ? "end" : "middle";
  const dy = sine > 0.35 ? "0" : sine < -0.35 ? "0" : "0.35em";
  const valueDy = sine > 0.35 ? "1.55em" : "1.4em";

  return {
    x: CENTER_X + cosine * labelRadius,
    y: CENTER_Y + sine * labelRadius,
    textAnchor,
    dy,
    valueDy,
  };
}

function readableDimension(dimension: SleepRadarDimension) {
  const value = dimension.valueLabel?.trim();
  const description = value
    ? `${dimension.label} : ${value}`
    : dimension.normalizedValue === 0
      ? `${dimension.label} : mesurée à 0`
      : `${dimension.label} : mesure disponible`;
  const comparison = comparisonPresentation(dimension);
  return comparison ? `${description}. ${comparison.label}` : description;
}

function comparisonPresentation(dimension: SleepRadarDimension) {
  if (!hasNormalizedValue(dimension) || !dimension.comparison) return null;
  const className = dimension.comparisonTone === "positive"
    ? styles.comparisonPositive
    : dimension.comparisonTone === "negative"
      ? styles.comparisonNegative
      : styles.comparisonEqual;

  switch (dimension.comparison) {
    case "up":
      return { arrow: "↑", label: dimension.comparisonLabel?.trim() || "Au-dessus de la moyenne", className };
    case "down":
      return { arrow: "↓", label: dimension.comparisonLabel?.trim() || "Sous la moyenne", className };
    case "equal":
      return { arrow: "→", label: dimension.comparisonLabel?.trim() || "Stable", className: styles.comparisonEqual };
  }

  return null;
}

function chartDescription(
  measured: readonly SleepRadarDimension[],
  unavailable: readonly SleepRadarDimension[],
) {
  if (!measured.length) {
    return "Aucune dimension de sommeil n’est disponible pour ce radar.";
  }

  const measuredText = measured.map(readableDimension).join(" ; ");
  const unavailableText = unavailable.length
    ? ` Dimensions indisponibles : ${unavailable.map((dimension) => dimension.label).join(", ")}.`
    : "";
  return `Radar du sommeil avec ${measured.length} dimension${measured.length > 1 ? "s" : ""} mesurée${measured.length > 1 ? "s" : ""} : ${measuredText}.${unavailableText}`;
}

export function SleepRadar({ dimensions, title = "Radar du sommeil", summary, className, detailId, interactive = false, selectedId, onSelect, registerButton }: SleepRadarProps) {
  const titleId = useId();
  const descriptionId = useId();
  const chartTitleId = useId();
  const chartDescriptionId = useId();
  const axisNodes = useRef<Array<SVGGElement | null>>([]);
  const measured = dimensions.filter(hasNormalizedValue);
  const unavailable = dimensions.filter((dimension) => !hasNormalizedValue(dimension));
  const description = chartDescription(measured, unavailable);
  const rootClassName = className ? `${styles.root} ${className}` : styles.root;

  function focusAxis(index: number) {
    axisNodes.current[index]?.focus();
  }

  function handleAxisKeyDown(index: number, id: string, event: KeyboardEvent<SVGGElement>) {
    if (!interactive || !onSelect) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
      return;
    }
    const count = dimensions.length;
    let target: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") target = (index + 1) % count;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") target = (index - 1 + count) % count;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = count - 1;
    if (target !== null && target !== index) {
      event.preventDefault();
      focusAxis(target);
    }
  }
  const unavailableSummary = unavailable.length
    ? `Indisponible : ${unavailable.map((dimension) => dimension.label).join(", ")}.`
    : "Aucune mesure disponible";
  const captionSummary = summary?.trim();

  if (!dimensions.length) {
    return (
      <figure className={rootClassName} aria-labelledby={titleId} aria-describedby={descriptionId}>
        <figcaption className={styles.caption}>
          <span id={titleId} className={styles.srOnly}>{title}</span>
          <span id={descriptionId} className={styles.summary}>{unavailableSummary}</span>
        </figcaption>
        <p className={styles.empty}>Les dimensions de sommeil sont indisponibles.</p>
      </figure>
    );
  }

  const count = dimensions.length;
  const plottedPoints = dimensions.map((dimension, index) => hasNormalizedValue(dimension)
    ? pointFor(index, count, dimension.normalizedValue)
    : null);
  const completePoints = plottedPoints.filter((point): point is Point => point !== null);
  const allPointsMeasured = completePoints.length === plottedPoints.length;
  const valueSegments = plottedPoints.flatMap((point, index) => {
    const next = plottedPoints[(index + 1) % count];
    return point && next ? [{ from: point, to: next }] : [];
  });

  return (
    <figure className={rootClassName} aria-labelledby={titleId} aria-describedby={captionSummary ? descriptionId : undefined}>
      <figcaption className={styles.caption}>
        <span id={titleId} className={styles.srOnly}>{title}</span>
        {captionSummary && <span id={descriptionId} className={styles.summary}>{captionSummary}</span>}
      </figcaption>

      <svg
        className={styles.chart}
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        role={interactive ? "group" : "img"}
        aria-labelledby={chartTitleId}
        aria-describedby={chartDescriptionId}
      >
        <title id={chartTitleId}>{title}</title>
        <desc id={chartDescriptionId}>{description}</desc>

        {count >= 3
          ? GRID_RATIOS.map((ratio) => (
            <polygon
              key={ratio}
              className={`${styles.grid} ${ratio === 1 ? styles.gridOuter : ""}`}
              points={pointsAttribute(dimensions.map((_, index) => pointFor(index, count, ratio)))}
              aria-hidden="true"
            />
          ))
          : GRID_RATIOS.map((ratio) => (
            <circle
              key={ratio}
              className={`${styles.grid} ${ratio === 1 ? styles.gridOuter : ""}`}
              cx={CENTER_X}
              cy={CENTER_Y}
              r={RADIUS * ratio}
              aria-hidden="true"
            />
          ))}

        {dimensions.map((dimension, index) => {
          const [x, y] = pointFor(index, count, 1);
          return <line key={`axis-${dimension.id}-${index}`} className={styles.axis} x1={CENTER_X} y1={CENTER_Y} x2={x} y2={y} aria-hidden="true" />;
        })}

        <g className={styles.dataLayer}>
          {count >= 3 && allPointsMeasured && <polygon className={styles.valueArea} points={pointsAttribute(completePoints)} aria-hidden="true" />}
          {valueSegments.map(({ from, to }, index) => <line key={`segment-${index}`} className={styles.valueLine} data-radar-trace="" data-radar-segment-index={index} style={{ "--radar-segment-index": index } as CSSProperties} pathLength="1" x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} aria-hidden="true" />)}

          {plottedPoints.map((point, index) => point && (
            <circle key={`point-${dimensions[index].id}-${index}`} className={selectedId === dimensions[index].id ? `${styles.point} ${styles.pointActive}` : styles.point} data-radar-point="" data-radar-point-index={index} style={{ "--radar-point-index": index } as CSSProperties} cx={point[0]} cy={point[1]} r={selectedId === dimensions[index].id ? 6 : 5} aria-hidden="true">
              <title>{readableDimension(dimensions[index])}</title>
            </circle>
          ))}
        </g>

        {dimensions.map((dimension, index) => {
          const position = labelPosition(index, count);
          const valueLabel = dimension.valueLabel?.trim();
          const comparison = comparisonPresentation(dimension);
          const displayValue = valueLabel || (!hasNormalizedValue(dimension) ? "—" : null);
          const interactiveAxis = interactive && Boolean(onSelect);
          const selected = selectedId === dimension.id;
          return (
            <g
              aria-controls={interactiveAxis ? detailId : undefined}
              aria-label={interactiveAxis ? `${readableDimension(dimension)}. Afficher les détails de cette dimension.` : undefined}
              aria-expanded={interactiveAxis ? selected : undefined}
              className={interactiveAxis ? styles.axisButton : styles.labelGroup}
              data-selected={selected}
              key={`label-${dimension.id}-${index}`}
              onClick={interactiveAxis ? () => onSelect?.(dimension.id) : undefined}
              onKeyDown={interactiveAxis ? (event) => handleAxisKeyDown(index, dimension.id, event) : undefined}
              ref={interactiveAxis ? (node) => { axisNodes.current[index] = node; registerButton?.(dimension.id, node); } : undefined}
              role={interactiveAxis ? "button" : undefined}
              tabIndex={interactiveAxis ? 0 : undefined}
            >
              {interactiveAxis && <line className={styles.axisHit} x1={CENTER_X} y1={CENTER_Y} x2={position.x} y2={position.y} aria-hidden="true" />}
              {interactiveAxis && <circle className={styles.labelHit} cx={position.x} cy={position.y} r="30" aria-hidden="true" />}
              {interactiveAxis && <circle className={styles.focusRing} cx={position.x} cy={position.y} r="26" aria-hidden="true" />}
              <g className={styles.labelGroup} aria-hidden="true">
                <title>{readableDimension(dimension)}</title>
                <text className={styles.label} x={position.x} y={position.y} dy={position.dy} textAnchor={position.textAnchor}>{dimension.label}{selected ? " ●" : ""}</text>
                {displayValue || comparison ? (
                  <text className={styles.valueLabel} x={position.x} y={position.y} dy={position.valueDy} textAnchor={position.textAnchor}>
                    {displayValue}
                    {comparison && <tspan className={`${styles.comparison} ${comparison.className}`} dx={displayValue ? 5 : 0}>{comparison.arrow}</tspan>}
                  </text>
                ) : null}
              </g>
            </g>
          );
        })}
      </svg>

      {unavailable.length > 0 && (
        <p className={styles.unavailable}>
          Indisponible : {unavailable.map((dimension) => dimension.label).join(", ")}.
        </p>
      )}
    </figure>
  );
}
