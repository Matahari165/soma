import { Activity, BedDouble, ChevronRight, HeartPulse } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import { DataFreshnessLabel } from "@/components/signal-ui";
import type { DailyScore } from "@/domain/health";

export function ScoreLink({ metric }: { metric: DailyScore }) {
  const scoreLabel = metric.score === null
    ? `${metric.label} score unavailable`
    : `${metric.label} score ${metric.score} out of 100`;

  const Icon = metric.kind === "sleep" ? BedDouble : metric.kind === "recovery" ? HeartPulse : Activity;
  const scoreStyle = { "--metric-score": metric.score ?? 0 } as CSSProperties;
  const chartPoints = metric.history.map((value, index) => {
    const x = metric.history.length === 1 ? 50 : (index / (metric.history.length - 1)) * 100;
    const y = 38 - (Math.min(100, Math.max(0, value)) / 100) * 32;
    return `${x},${y}`;
  }).join(" ");

  return (
    <Link
      className={`score-link score-link--${metric.kind}`}
      href={metric.href}
      aria-label={`Open ${scoreLabel}`}
    >
      <span className="score-link__identity">
        <span><Icon size={19} strokeWidth={1.7} aria-hidden="true" />{metric.label}</span>
      </span>
      <span className="score-link__reading score-link__gauge" style={scoreStyle}>
        <strong>{metric.score ?? "—"}</strong>
        <small>{metric.score === null ? "Pending" : "/100"}</small>
      </span>
      <span className="score-link__plot">
        <svg className="score-link__trace" viewBox="0 0 100 40" role="img" aria-label={`${metric.label} recent signal`} preserveAspectRatio="none">
          <line x1="0" y1="32" x2="100" y2="32" />
          {chartPoints ? <polyline points={chartPoints} /> : null}
        </svg>
        <small>{metric.history.length > 1 ? `${metric.history.length} readings` : "Baseline forming"}</small>
      </span>
      <span className="score-link__context"><strong>{metric.value}</strong><small>{metric.detail}</small></span>
      <DataFreshnessLabel freshness={metric.freshness} />
      <span className="score-link__action" aria-hidden="true"><ChevronRight size={18} /></span>
    </Link>
  );
}
