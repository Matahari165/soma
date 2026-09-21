"use client";

import { useId, type CSSProperties, type KeyboardEvent } from "react";

import styles from "./activity-radar.module.css";

export type ActivityRadarDimension = {
  id: string;
  label: string;
  normalizedValue: number | null;
  valueLabel?: string;
  averageLabel?: string;
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

type Point = [number, number];

export type ActivityRadarProps = {
  dimensions: readonly ActivityRadarDimension[];
  title?: string;
  className?: string;
  detailId?: string;
  interactive?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  registerButton?: (id: string, node: SVGGElement | null) => void;
};

const VIEWBOX_WIDTH = 500;
const VIEWBOX_HEIGHT = 420;
const CENTER_X = 250;
const CENTER_Y = 210;
const RADIUS = 132;
const LABEL_RADIUS = RADIUS + 34;
const GRID_RATIOS = [0.25, 0.5, 0.75, 1] as const;

function measured(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function angleFor(index: number, count: number) {
  return -Math.PI / 2 + (index * Math.PI * 2) / count;
}

function pointFor(index: number, count: number, distance: number): Point {
  const angle = angleFor(index, count);
  return [CENTER_X + Math.cos(angle) * distance, CENTER_Y + Math.sin(angle) * distance];
}

function pointString(points: readonly Point[]) {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

function labelAnchor(index: number, count: number): "start" | "middle" | "end" {
  const [x] = pointFor(index, count, 1);
  if (x > CENTER_X + 0.25) return "start";
  if (x < CENTER_X - 0.25) return "end";
  return "middle";
}

function labelPosition(index: number, count: number) {
  const angle = angleFor(index, count);
  const x = CENTER_X + Math.cos(angle) * LABEL_RADIUS;
  const y = CENTER_Y + Math.sin(angle) * LABEL_RADIUS;
  const anchor = labelAnchor(index, count);
  const valueDy = Math.sin(angle) > 0.25 ? 20 : 18;
  return { x, y, anchor, valueDy };
}

function comparisonFor(dimension: ActivityRadarDimension) {
  if (!dimension.comparison) return null;
  const className = dimension.comparisonTone === "positive"
    ? styles.comparisonPositive
    : dimension.comparisonTone === "negative"
      ? styles.comparisonNegative
      : styles.comparisonEqual;
  const arrow = dimension.comparison === "up" ? "↑" : dimension.comparison === "down" ? "↓" : "→";
  const label = dimension.comparisonLabel?.trim()
    || (dimension.comparison === "up" ? "Au-dessus de la moyenne" : dimension.comparison === "down" ? "Sous la moyenne" : "Stable");
  return { arrow, label, className };
}

function readableDimension(dimension: ActivityRadarDimension) {
  const value = dimension.valueLabel?.trim() || (measured(dimension.normalizedValue) ? "mesuré" : "indisponible");
  const comparison = comparisonFor(dimension);
  return `${dimension.label} : ${value}${comparison ? `. ${comparison.label}` : ""}${dimension.scoreRole ? `. ${dimension.scoreRole}` : ""}`;
}

function descriptionFor(dimensions: readonly ActivityRadarDimension[]) {
  if (!dimensions.length) return "Radar de l’effort indisponible : aucune dimension n’est fournie.";
  return `Radar de l’effort avec ${dimensions.length} composantes : ${dimensions.map(readableDimension).join(" ; ")}.`;
}

export function ActivityRadar({ dimensions, title = "Radar de l’effort", className, detailId, interactive = false, selectedId, onSelect, registerButton }: ActivityRadarProps) {
  const titleId = useId();
  const descriptionId = useId();
  const count = dimensions.length;
  const measuredPoints = dimensions.map((dimension, index) => measured(dimension.normalizedValue)
    ? pointFor(index, Math.max(count, 1), RADIUS * dimension.normalizedValue)
    : null);
  const availablePoints = measuredPoints.filter((point): point is Point => point !== null);
  const hasValueShape = count >= 3 && availablePoints.length === count;
  const valueSegments = measuredPoints.flatMap((point, index) => {
    const next = measuredPoints[(index + 1) % count];
    return point && next ? [{ from: point, to: next }] : [];
  });
  const hasMeasuredPoint = measuredPoints.some((point) => point !== null);
  const description = descriptionFor(dimensions);
  const rootClassName = className ? `${styles.root} ${className}` : styles.root;

  if (!count) {
    return <figure className={rootClassName} aria-labelledby={titleId}><figcaption id={titleId} className={styles.srOnly}>{title}</figcaption><p className={styles.empty}>Les composantes de l’effort sont indisponibles.</p></figure>;
  }

  return <figure className={rootClassName} aria-labelledby={titleId}>
    <figcaption id={titleId} className={styles.srOnly}>{title}</figcaption>
    <svg className={styles.chart} viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} role={interactive ? "group" : "img"} aria-labelledby={titleId} aria-describedby={descriptionId}>
      <title>{title}</title>
      <desc id={descriptionId}>{description}</desc>

      {count >= 3 && GRID_RATIOS.map((ratio) => <polygon key={ratio} className={`${styles.grid} ${ratio === 1 ? styles.gridOuter : ""}`} points={pointString(dimensions.map((_, index) => pointFor(index, count, RADIUS * ratio)))} aria-hidden="true" />)}
      {count >= 3 && dimensions.map((dimension, index) => {
        const [x, y] = pointFor(index, count, RADIUS);
        return <line key={`axis-${dimension.id}`} className={styles.axis} x1={CENTER_X} y1={CENTER_Y} x2={x} y2={y} aria-hidden="true" />;
      })}

      {hasMeasuredPoint && <g className={styles.dataLayer} aria-hidden="true">
        {hasValueShape && <polygon className={styles.valueArea} points={pointString(availablePoints)} />}
        {valueSegments.map(({ from, to }, index) => <line key={`segment-${index}`} className={styles.valueSegment} data-radar-trace="" data-radar-segment-index={index} style={{ "--radar-segment-index": index } as CSSProperties} pathLength="1" x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} />)}
        {measuredPoints.map((point, index) => point && <circle key={`point-${dimensions[index].id}`} className={styles.point} data-radar-point="" data-radar-point-index={index} style={{ "--radar-point-index": index } as CSSProperties} cx={point[0]} cy={point[1]} r="5" />)}
      </g>}

      {dimensions.map((dimension, index) => {
        const position = labelPosition(index, count);
        const interactiveAxis = interactive && Boolean(onSelect);
        const selected = selectedId === dimension.id;
        const comparison = comparisonFor(dimension);
        function handleKeyDown(event: KeyboardEvent<SVGGElement>) {
          if (!interactiveAxis) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect?.(dimension.id);
            return;
          }
          const svg = event.currentTarget.closest("svg");
          const buttons = svg ? Array.from(svg.querySelectorAll<SVGGElement>('[role="button"]')) : [];
          if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            buttons[(index + 1) % count]?.focus();
          } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            buttons[(index - 1 + count) % count]?.focus();
          } else if (event.key === "Home") {
            event.preventDefault();
            buttons[0]?.focus();
          } else if (event.key === "End") {
            event.preventDefault();
            buttons[count - 1]?.focus();
          }
        }
        return <g
          key={`label-${dimension.id}`}
          className={interactiveAxis ? styles.axisButton : styles.labelGroup}
          data-selected={selected}
          role={interactiveAxis ? "button" : undefined}
          tabIndex={interactiveAxis ? 0 : undefined}
          aria-controls={interactiveAxis ? detailId : undefined}
          aria-expanded={interactiveAxis ? selected : undefined}
          aria-label={interactiveAxis ? `${readableDimension(dimension)}. Afficher les détails de cette dimension.` : undefined}
          onClick={interactiveAxis ? () => onSelect?.(dimension.id) : undefined}
          onKeyDown={interactiveAxis ? handleKeyDown : undefined}
          ref={interactiveAxis ? (node) => registerButton?.(dimension.id, node) : undefined}
        >
          {interactiveAxis && <><line className={styles.axisHit} x1={CENTER_X} y1={CENTER_Y} x2={position.x} y2={position.y} aria-hidden="true" /><circle className={styles.labelHit} cx={position.x} cy={position.y} r="30" aria-hidden="true" /><circle className={styles.focusRing} cx={position.x} cy={position.y} r="26" aria-hidden="true" /></>}
          <g className={styles.labelGroup} aria-hidden="true">
            <text className={styles.label} x={position.x} y={position.y} textAnchor={position.anchor}>{dimension.label}{selected ? " ●" : ""}</text>
            <text className={styles.valueLabel} x={position.x} y={position.y} dy={position.valueDy} textAnchor={position.anchor}>
              {dimension.valueLabel?.trim() || (!measured(dimension.normalizedValue) ? "—" : "mesuré")}
              {comparison && <tspan className={`${styles.comparison} ${comparison.className}`} dx="6">{comparison.arrow}</tspan>}
            </text>
          </g>
        </g>;
      })}
    </svg>
  </figure>;
}
