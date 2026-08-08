import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import type { DailyScore } from "@/domain/health";

import { ScoreRing } from "./score-ring";

export function MetricCard({ metric }: { metric: DailyScore }) {
  return (
    <article className={`metric-card metric-card--${metric.kind}`}>
      <div className="metric-card__header">
        <p><span className="metric-dot" aria-hidden="true" />{metric.label}</p>
        <span className={`status-label status-label--${metric.status}`}>{metric.status}</span>
      </div>

      <ScoreRing kind={metric.kind} label={metric.label} score={metric.score} />

      <div className="metric-card__main">
        <strong>{metric.value}</strong>
        <span>{metric.target}</span>
      </div>

      <p className="metric-delta">{metric.delta}</p>
      <p className="metric-action">{metric.action}</p>

      <div className="metric-card__footer">
        <span>Updated {metric.freshness.syncedAt}</span>
        <Link href={metric.href} aria-label={`View ${metric.label} details`}>
          Explore <ArrowUpRight size={15} />
        </Link>
      </div>
    </article>
  );
}
