import { useId } from "react";

import styles from "./sleep-radar.module.css";

const VIEWBOX_WIDTH = 420;
const VIEWBOX_HEIGHT = 340;
const CENTER_X = VIEWBOX_WIDTH / 2;
const CENTER_Y = 170;
const RADIUS = 108;
const GRID_RATIOS = [0.25, 0.5, 0.75, 1] as const;

/**
 * A sleep dimension is already normalized by the caller: 0 is a measured
 * zero, 1 is the outer reference, and null means unavailable or unmeasured.
 * `valueLabel` is intentionally caller-provided so the chart never invents a
 * unit or a domain value from the normalized position.
 */
export type SleepRadarDimension = {
  id: string;
  label: string;
  normalizedValue: number | null;
  valueLabel?: string;
};

export type SleepRadarProps = {
  dimensions: readonly SleepRadarDimension[];
  title?: string;
  summary?: string;
  className?: string;
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
  const labelRadius = RADIUS + 25;
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
  if (value) return `${dimension.label} : ${value}`;
  if (dimension.normalizedValue === 0) return `${dimension.label} : mesurée à 0`;
  return `${dimension.label} : mesure disponible`;
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

export function SleepRadar({ dimensions, title = "Profil de sommeil", summary, className }: SleepRadarProps) {
  const titleId = useId();
  const descriptionId = useId();
  const chartTitleId = useId();
  const chartDescriptionId = useId();
  const measured = dimensions.filter(hasNormalizedValue);
  const unavailable = dimensions.filter((dimension) => !hasNormalizedValue(dimension));
  const description = chartDescription(measured, unavailable);
  const rootClassName = className ? `${styles.root} ${className}` : styles.root;
  const unavailableSummary = unavailable.length
    ? `Indisponible : ${unavailable.map((dimension) => dimension.label).join(", ")}.`
    : "Aucune mesure disponible";

  if (!measured.length) {
    return (
      <figure className={rootClassName} aria-labelledby={titleId} aria-describedby={descriptionId}>
        <figcaption className={styles.caption}>
          <span id={titleId} className={styles.title}>{title}</span>
          <span id={descriptionId} className={styles.summary}>{unavailableSummary}</span>
        </figcaption>
        <p className={styles.empty}>Les dimensions de sommeil sont indisponibles.</p>
      </figure>
    );
  }

  const count = measured.length;
  const measuredPoints = measured.map((dimension, index) => pointFor(index, count, dimension.normalizedValue));

  return (
    <figure className={rootClassName} aria-labelledby={titleId} aria-describedby={descriptionId}>
      <figcaption className={styles.caption}>
        <span id={titleId} className={styles.title}>{title}</span>
        <span id={descriptionId} className={styles.summary}>
          {summary ?? `${measured.length} dimension${measured.length > 1 ? "s" : ""} mesurée${measured.length > 1 ? "s" : ""}`}
        </span>
      </figcaption>

      <svg
        className={styles.chart}
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        role="img"
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
              points={pointsAttribute(measured.map((_, index) => pointFor(index, count, ratio)))}
            />
          ))
          : GRID_RATIOS.map((ratio) => (
            <circle
              key={ratio}
              className={`${styles.grid} ${ratio === 1 ? styles.gridOuter : ""}`}
              cx={CENTER_X}
              cy={CENTER_Y}
              r={RADIUS * ratio}
            />
          ))}

        {measured.map((dimension, index) => {
          const [x, y] = pointFor(index, count, 1);
          return <line key={`axis-${dimension.id}-${index}`} className={styles.axis} x1={CENTER_X} y1={CENTER_Y} x2={x} y2={y} />;
        })}

        {count >= 3 && <polygon className={styles.valueArea} points={pointsAttribute(measuredPoints)} />}
        {count === 2 && <line className={styles.valueLine} x1={measuredPoints[0][0]} y1={measuredPoints[0][1]} x2={measuredPoints[1][0]} y2={measuredPoints[1][1]} />}

        {measuredPoints.map(([x, y], index) => (
          <circle key={`point-${measured[index].id}-${index}`} className={styles.point} cx={x} cy={y} r="3.5">
            <title>{readableDimension(measured[index])}</title>
          </circle>
        ))}

        {measured.map((dimension, index) => {
          const position = labelPosition(index, count);
          const valueLabel = dimension.valueLabel?.trim();
          return (
            <g key={`label-${dimension.id}-${index}`} className={styles.labelGroup}>
              <text className={styles.label} x={position.x} y={position.y} dy={position.dy} textAnchor={position.textAnchor}>{dimension.label}</text>
              {valueLabel && <text className={styles.valueLabel} x={position.x} y={position.y} dy={position.valueDy} textAnchor={position.textAnchor}>{valueLabel}</text>}
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
