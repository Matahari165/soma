import type { CSSProperties } from "react";

import type { ScoreKind } from "@/domain/health";

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ScoreRing({
  kind,
  label,
  score,
  size = "large",
  decorative = false,
}: {
  kind: ScoreKind;
  label: string;
  score: number | null;
  size?: "large" | "compact";
  decorative?: boolean;
}) {
  const boundedScore = score === null ? 0 : Math.min(100, Math.max(0, score));
  const style = {
    "--ring-offset": CIRCUMFERENCE * (1 - boundedScore / 100),
  } as CSSProperties;

  return (
    <div
      className={`score-ring score-ring--${kind} score-ring--${size}`}
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
        <strong>{score ?? "—"}</strong>
        <small>{label}</small>
      </span>
    </div>
  );
}
