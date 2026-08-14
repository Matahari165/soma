import { Activity, BedDouble, Check, ChevronRight, CircleSlash, HeartPulse, Minus, TrendingUp } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";

import type { DailyScore } from "@/domain/health";

export function ScoreLink({ metric }: { metric: DailyScore }) {
  const scoreLabel = metric.score === null
    ? `${metric.label} score unavailable`
    : `${metric.label} score ${metric.score} out of 100`;

  const Icon = metric.kind === "sleep" ? BedDouble : metric.kind === "recovery" ? HeartPulse : Activity;
  const StatusIcon = metric.status === "restorative" ? Check : metric.status === "steady" ? Minus : metric.status === "building" ? TrendingUp : CircleSlash;
  const statusLabel = metric.status === "restorative" ? "Restorative" : metric.status === "steady" ? "Steady" : metric.status === "building" ? "Building" : "Limited data";
  const freshnessLabel = metric.freshness.state === "fresh" ? "Fresh data" : metric.freshness.state === "partial" ? "Partial data" : metric.freshness.state === "stale" ? "Stale data" : "Missing data";
  const scoreStyle = { "--metric-score": metric.score ?? 0 } as CSSProperties;
  const chartPoints = metric.history.map((value, index) => {
    const x = metric.history.length === 1 ? 50 : (index / (metric.history.length - 1)) * 100;
    const y = 38 - (Math.min(100, Math.max(0, value)) / 100) * 32;
    return `${x},${y}`;
  }).join(" ");
  const latestPoint = metric.history.length ? {
    x: metric.history.length === 1 ? 50 : 100,
    y: 38 - (Math.min(100, Math.max(0, metric.history.at(-1) ?? 0)) / 100) * 32,
  } : null;
  const areaPoints = chartPoints ? `0,38 ${chartPoints} 100,38` : "";

  return (
    <Link
      className={`score-link score-link--${metric.kind} score-link--status-${metric.status} score-link--freshness-${metric.freshness.state}`}
      href={metric.href}
      aria-label={`Open ${scoreLabel}. ${statusLabel}. ${freshnessLabel}.`}
    >
      <span className="score-link__identity">
        <span><Icon size={19} strokeWidth={1.7} aria-hidden="true" />{metric.label}</span>
      </span>
      <span className="score-link__reading score-link__gauge" style={scoreStyle}>
        <strong>{metric.score ?? "—"}</strong>
        <small>{metric.score === null ? "Pending" : "/100"}</small>
      </span>
      <span className="score-link__status" aria-label={`${statusLabel}, ${freshnessLabel}`}>
        <StatusIcon size={15} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="score-link__plot">
        <svg className="score-link__trace" viewBox="0 0 100 40" role="img" aria-label={`${metric.label} recent signal`} preserveAspectRatio="none">
          <line x1="0" y1="32" x2="100" y2="32" />
          {areaPoints ? <polygon points={areaPoints} /> : null}
          {chartPoints ? <polyline points={chartPoints} /> : null}
          {latestPoint ? <ellipse cx={latestPoint.x} cy={latestPoint.y} rx="1" ry="2.2" /> : null}
        </svg>
      </span>
      <span className="score-link__context"><strong>{metric.value}</strong></span>
      <span className="score-link__action" aria-hidden="true"><ChevronRight size={18} /></span>
    </Link>
  );
}
