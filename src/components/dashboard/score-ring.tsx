"use client";

import type { CSSProperties } from "react";

import { AnimatedValueText } from "@/components/health/animated-value";

import type { ScoreKind } from "@/domain/health";

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ScoreRing({
  kind,
  label,
  score,
  size = "large",
  decorative = false,
  animate = false,
}: {
  kind: ScoreKind;
  label: string;
  score: number | null;
  size?: "large" | "compact";
  decorative?: boolean;
  animate?: boolean;
}) {
  const boundedScore = score === null ? null : Math.min(100, Math.max(0, score));
  const style = {
    "--ring-offset": boundedScore === null ? CIRCUMFERENCE : CIRCUMFERENCE * (1 - boundedScore / 100),
  } as CSSProperties;

  return (
    <div
      className={`score-ring score-ring--${kind} score-ring--${size}${animate ? " score-ring--animated" : ""}${boundedScore === null ? " score-ring--empty" : ""}`}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : score === null ? `${label} : score indisponible` : `${label} : score ${Math.round(score)} sur 100`}
      style={style}
    >
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle className="score-ring__track" cx="64" cy="64" r={RADIUS} />
        {boundedScore !== null && (
          <circle
            className="score-ring__progress"
            cx="64"
            cy="64"
            r={RADIUS}
            pathLength={CIRCUMFERENCE}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset="var(--ring-offset)"
          />
        )}
      </svg>
      <span className="score-ring__value">
        <strong>{animate ? <AnimatedValueText value={score} decimals={0} /> : (score === null ? "—" : Math.round(score))}<small aria-hidden="true">/100</small></strong>
        <small>{label}</small>
      </span>
    </div>
  );
}
