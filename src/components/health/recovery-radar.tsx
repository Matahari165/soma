"use client";

import { useId, useRef, type KeyboardEvent } from "react";

import styles from "./recovery-radar.module.css";

export type RecoveryRadarDimension = {
  key: string;
  label: string;
  score: number | null;
  weight?: number;
  valueLabel?: string;
  averageLabel?: string;
  definition?: string;
  readingDirection?: string;
  scoreRole?: string;
  scoreFormula?: string;
  scoreNormalization?: string;
  scoreContribution?: number | null;
  comparison?: "up" | "down" | "equal" | null;
  comparisonLabel?: string | null;
  comparisonTone?: "positive" | "negative" | "neutral";
  sourceLabel?: string;
};

export type RecoveryRadarProps = {
  dimensions: readonly RecoveryRadarDimension[];
  title?: string;
  className?: string;
  detailId?: string;
  interactive?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  registerButton?: (id: string, node: SVGGElement | null) => void;
};

const VIEWBOX_WIDTH = 420;
const VIEWBOX_HEIGHT = 420;
const CENTER_X = VIEWBOX_WIDTH / 2;
const CENTER_Y = VIEWBOX_HEIGHT / 2;
const RADIUS = 150;
const LABEL_RADIUS = RADIUS + 38;
const GRID_RATIOS = [0.25, 0.5, 0.75, 1] as const;
const LABEL_LINE_HEIGHT = 16;

function isMeasured(score: number | null): score is number {
  return typeof score === "number" && Number.isFinite(score);
}

function formatNumber(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

function formatScore(score: number | null) {
  return isMeasured(score) ? formatNumber(score) : "—";
}

function formatWeight(weight: number | undefined) {
  return typeof weight === "number" && Number.isFinite(weight) ? formatNumber(weight) : null;
}

function wrapLabel(label: string, maxCharacters = 20) {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return ["Dimension"];

  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > maxCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

function readableDimension(dimension: RecoveryRadarDimension) {
  const value = dimension.valueLabel?.trim() ?? (isMeasured(dimension.score) ? `${formatNumber(dimension.score)} sur 100` : "indisponible");
  const weight = formatWeight(dimension.weight);
  const source = dimension.sourceLabel?.trim() ? ` Source : ${dimension.sourceLabel.trim()}` : "";
  return `${dimension.label || "Dimension"} : ${value}${weight === null ? "" : `. Pondération ${weight}`}${source}`;
}

function pointFor(index: number, count: number, distance: number): [number, number] {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / count;
  return [CENTER_X + Math.cos(angle) * distance, CENTER_Y + Math.sin(angle) * distance];
}

function pointString(points: Array<[number, number]>) {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

function axisAnchor(index: number, count: number): "start" | "middle" | "end" {
  const [x] = pointFor(index, count, 1);
  if (x > CENTER_X + 0.25) return "start";
  if (x < CENTER_X - 0.25) return "end";
  return "middle";
}

function descriptionFor(dimensions: readonly RecoveryRadarDimension[]) {
  if (!dimensions.length) return "Graphique radar de récupération indisponible : aucune dimension n’est fournie.";

  const values = dimensions.map(readableDimension);
  return `Graphique radar de récupération. ${values.join(". ")}.`;
}

/**
 * A quiet, monochrome radar for recovery dimensions.
 *
 * The component deliberately does not create fallback axes. A complete shape
 * is only drawn when every supplied dimension has a measured score; missing
 * dimensions remain visible as unavailable labels and isolated measured dots.
 */
export function RecoveryRadar({ dimensions, title = "Dimensions de récupération", className, detailId, interactive = false, selectedId, onSelect, registerButton }: RecoveryRadarProps) {
  const titleId = useId();
  const descriptionId = useId();
  const axisNodes = useRef<Array<SVGGElement | null>>([]);
  const description = descriptionFor(dimensions);
  const rootClassName = className ? `${styles.root} ${className}` : styles.root;
  const hasRadarGeometry = dimensions.length >= 3;
  const allMeasured = hasRadarGeometry && dimensions.every((dimension) => isMeasured(dimension.score));
  const hasMeasuredScore = dimensions.some((dimension) => isMeasured(dimension.score));
  const unavailable = dimensions.filter((dimension) => !isMeasured(dimension.score));
  const axisPoints = dimensions.map((_, index) => pointFor(index, Math.max(dimensions.length, 1), RADIUS));
  const measuredPoints = dimensions.map((dimension, index) => {
    if (!isMeasured(dimension.score)) return null;
    const ratio = Math.min(1, Math.max(0, dimension.score / 100));
    return pointFor(index, Math.max(dimensions.length, 1), RADIUS * ratio);
  });

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

  return (
    <figure className={rootClassName} data-testid="recovery-radar">
      <figcaption id={titleId} className={styles.srOnly}>{title}</figcaption>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        role={interactive ? "group" : "img"}
        tabIndex={interactive ? undefined : 0}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-label={description}
        data-testid="recovery-radar-chart"
      >
        <title id={`${titleId}-svg`}>{title}</title>
        <desc id={descriptionId}>{description}</desc>

        {hasRadarGeometry && GRID_RATIOS.map((ratio) => (
          <polygon
            key={ratio}
            className={`${styles.grid} ${ratio === 1 ? styles.gridOuter : ""}`}
            data-testid="recovery-radar-grid"
            data-radar-reference={ratio === 1 ? "100" : undefined}
            data-grid-ratio={ratio}
            points={pointString(dimensions.map((_, index) => pointFor(index, dimensions.length, RADIUS * ratio)))}
          />
        ))}

        {hasRadarGeometry && axisPoints.map(([x, y], index) => (
          <line
            key={dimensions[index]?.key ?? index}
            className={styles.axis}
            data-testid="recovery-radar-axis"
            x1={CENTER_X}
            y1={CENTER_Y}
            x2={x}
            y2={y}
          />
        ))}

        {hasMeasuredScore && (
          <g className={styles.dataLayer} data-testid="recovery-radar-data">
            {allMeasured && (
              <polygon
                className={styles.valueShape}
                data-testid="recovery-radar-value"
                points={pointString(measuredPoints.filter((point): point is [number, number] => point !== null))}
              />
            )}
            {measuredPoints.map((point, index) => point && (
              <circle
                key={dimensions[index]?.key ?? index}
                className={selectedId === dimensions[index]?.key ? `${styles.valuePoint} ${styles.valuePointActive}` : styles.valuePoint}
                data-testid="recovery-radar-point"
                cx={point[0]}
                cy={point[1]}
                r={selectedId === dimensions[index]?.key ? 6 : 5}
              />
            ))}
          </g>
        )}

        {dimensions.map((dimension, index) => {
          const [labelX, labelY] = pointFor(index, Math.max(dimensions.length, 1), LABEL_RADIUS);
          const lines = wrapLabel(dimension.label);
          const startY = labelY - ((lines.length - 1) * LABEL_LINE_HEIGHT) / 2;
          const valueY = startY + lines.length * LABEL_LINE_HEIGHT + 8;
          const sourceY = valueY + LABEL_LINE_HEIGHT;
          const anchor = axisAnchor(index, Math.max(dimensions.length, 1));
          const interactiveAxis = interactive && Boolean(onSelect);
          const selected = selectedId === dimension.key;
          const sourceLabel = dimension.sourceLabel?.trim() || null;
          const displayValue = dimension.valueLabel?.trim() ?? formatScore(dimension.score);
          return (
            <g
              key={`${dimension.key}-${index}`}
              className={interactiveAxis ? styles.axisButton : styles.axisLabel}
              data-testid="recovery-radar-label"
              data-dimension-key={dimension.key}
              data-selected={interactiveAxis ? selected : undefined}
              role={interactiveAxis ? "button" : undefined}
              tabIndex={interactiveAxis ? 0 : undefined}
              aria-controls={interactiveAxis ? detailId : undefined}
              aria-expanded={interactiveAxis ? selected : undefined}
              aria-label={interactiveAxis ? `${readableDimension(dimension)}. Afficher les détails de cette dimension.` : undefined}
              onClick={interactiveAxis ? () => onSelect?.(dimension.key) : undefined}
              onKeyDown={interactiveAxis ? (event) => handleAxisKeyDown(index, dimension.key, event) : undefined}
              ref={interactiveAxis ? (node) => { axisNodes.current[index] = node; registerButton?.(dimension.key, node); } : undefined}
            >
              {interactiveAxis && <circle className={styles.labelHit} cx={labelX} cy={labelY} r="30" aria-hidden="true" />}
              {interactiveAxis && <circle className={styles.focusRing} cx={labelX} cy={labelY} r="26" aria-hidden="true" />}
              <g className={styles.axisLabelInner} aria-hidden={interactiveAxis ? true : undefined}>
                {lines.map((line, lineIndex) => (
                  <text
                    key={`${line}-${lineIndex}`}
                    className={styles.axisName}
                    data-dimension-label={dimension.key}
                    x={labelX}
                    y={startY + lineIndex * LABEL_LINE_HEIGHT}
                    textAnchor={anchor}
                  >
                    {line}
                  </text>
                ))}
                <text
                  className={styles.axisValue}
                  data-dimension-value={dimension.key}
                  x={labelX}
                  y={valueY}
                  textAnchor={anchor}
                >
                  {displayValue}
                </text>
              </g>
              {sourceLabel ? (
                <text className={styles.axisName} x={labelX} y={sourceY} textAnchor={anchor} fontSize={11}>
                  {sourceLabel}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <p id={`${descriptionId}-text`} className={styles.srOnly}>{description}</p>
      {unavailable.length > 0 && (
        <p className={styles.unavailable}>
          Indisponible : {unavailable.map((dimension) => dimension.label).join(", ")}.
        </p>
      )}
    </figure>
  );
}
