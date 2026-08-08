import Link from "next/link";

import type { DailyScore } from "@/domain/health";

import { ScoreRing } from "./score-ring";

export function ScoreLink({ metric }: { metric: DailyScore }) {
  const scoreLabel = metric.score === null
    ? `${metric.label} score unavailable`
    : `${metric.label} score ${metric.score} out of 100`;

  return (
    <Link
      className={`score-link score-link--${metric.kind}`}
      href={metric.href}
      aria-label={`Open ${scoreLabel}`}
    >
      <ScoreRing decorative kind={metric.kind} label={metric.label} score={metric.score} />
    </Link>
  );
}
