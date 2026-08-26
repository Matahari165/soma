"use client";

import type { CSSProperties } from "react";

import { AnimatedValueText, useAnimatedNumber } from "@/components/health/animated-value";

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
  const animatedScore = useAnimatedNumber(score, animate);
  const boundedScore = animatedScore === null ? 0 : Math.min(100, Math.max(0, animatedScore));
  const style = {
    "--ring-offset": CIRCUMFERENCE * (1 - boundedScore / 100),
  } as CSSProperties;

  return (
    <div
      className={`score-ring score-ring--${kind} score-ring--${size}${animate ? " score-ring--animated" : ""}`}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : score === null ? `${label} score unavailable` : `${label} score ${score} out of 100`}
      style={style}
    >
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle className="score-ring__track" cx="64" cy="64" r={RADIUS} />
        <circle
          className="score-ring__progress"
          cx="64"
          cy="64"
          r={RADIUS}
          pathLength={CIRCUMFERENCE}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset="var(--ring-offset)"
        />
      </svg>
      <span className="score-ring__value">
        <strong>{animate ? <AnimatedValueText value={score} decimals={0} /> : score ?? "—"}</strong>
        <small>{label}</small>
      </span>
    </div>
  );
}
