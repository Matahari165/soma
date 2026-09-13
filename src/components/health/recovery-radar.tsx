"use client";

import { useId } from "react";

import styles from "./recovery-radar.module.css";

export type RecoveryRadarDimension = {
  key: string;
  label: string;
  score: number | null;
  weight?: number;
};

export type RecoveryRadarProps = {
  dimensions: readonly RecoveryRadarDimension[];
};

const VIEWBOX_WIDTH = 640;
const VIEWBOX_HEIGHT = 520;
const CENTER_X = VIEWBOX_WIDTH / 2;
const CENTER_Y = 250;
const RADIUS = 154;
const LABEL_RADIUS = RADIUS + 52;
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
  return lines;
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

  const values = dimensions.map((dimension) => {
    const value = isMeasured(dimension.score) ? `${formatNumber(dimension.score)} sur 100` : "indisponible";
    const weight = formatWeight(dimension.weight);
    return `${dimension.label || "Dimension"} : ${value}${weight === null ? "" : `. Pondération ${weight}`}`;
  });
  return `Graphique radar de récupération. ${values.join(". ")}.`;
}

/**
 * A quiet, monochrome radar for recovery dimensions.
 *
 * The component deliberately does not create fallback axes. A complete shape
 * is only drawn when every supplied dimension has a measured score; missing
 * dimensions remain visible as unavailable labels and isolated measured dots.
 */
export function RecoveryRadar({ dimensions }: RecoveryRadarProps) {
  const titleId = useId();
  const descriptionId = useId();
  const description = descriptionFor(dimensions);
  const hasRadarGeometry = dimensions.length >= 3;
  const allMeasured = hasRadarGeometry && dimensions.every((dimension) => isMeasured(dimension.score));
  const hasMeasuredScore = dimensions.some((dimension) => isMeasured(dimension.score));
  const axisPoints = dimensions.map((_, index) => pointFor(index, Math.max(dimensions.length, 1), RADIUS));
  const measuredPoints = dimensions.map((dimension, index) => {
    if (!isMeasured(dimension.score)) return null;
    const ratio = Math.min(1, Math.max(0, dimension.score / 100));
    return pointFor(index, Math.max(dimensions.length, 1), RADIUS * ratio);
  });

  return (
    <figure className={styles.root} data-testid="recovery-radar">
      <figcaption id={titleId} className={styles.srOnly}>Dimensions de récupération</figcaption>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        role="img"
        tabIndex={0}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-label={description}
        data-testid="recovery-radar-chart"
      >
        <title id={`${titleId}-svg`}>Dimensions de récupération</title>
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
                className={styles.valuePoint}
                data-testid="recovery-radar-point"
                cx={point[0]}
                cy={point[1]}
                r="4"
              />
            ))}
          </g>
        )}

        {dimensions.map((dimension, index) => {
          const [labelX, labelY] = pointFor(index, Math.max(dimensions.length, 1), LABEL_RADIUS);
          const lines = wrapLabel(dimension.label);
          const startY = labelY - ((lines.length - 1) * LABEL_LINE_HEIGHT) / 2;
          const valueY = startY + lines.length * LABEL_LINE_HEIGHT + 8;
          const anchor = axisAnchor(index, Math.max(dimensions.length, 1));
          return (
            <g
              key={`${dimension.key}-${index}`}
              className={styles.axisLabel}
              data-testid="recovery-radar-label"
              data-dimension-key={dimension.key}
            >
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
                {formatScore(dimension.score)}
              </text>
            </g>
          );
        })}
      </svg>
      <p id={`${descriptionId}-text`} className={styles.srOnly}>{description}</p>
    </figure>
  );
}
