import { ArrowUpRight, Clock3, MoonStar, PersonStanding, ShieldPlus } from "lucide-react";
import Link from "next/link";

import type { DailyScore } from "@/domain/health";

import { Sparkline } from "./sparkline";

const iconByKind = {
  sleep: MoonStar,
  recovery: ShieldPlus,
  effort: PersonStanding,
};

export function MetricCard({ metric }: { metric: DailyScore }) {
  const Icon = iconByKind[metric.kind];

  return (
    <article className={`metric-card metric-card--${metric.kind}`}>
      <div className="metric-card__header">
        <div className="metric-heading">
          <span className="metric-icon"><Icon size={20} strokeWidth={1.8} /></span>
          <div>
            <p>{metric.label}</p>
            <span className={`status-label status-label--${metric.status}`}>{metric.status}</span>
          </div>
        </div>
        <span className="score-number" aria-label={metric.score === null ? `${metric.label} score unavailable` : `${metric.label} score ${metric.score} out of 100`}>
          {metric.score ?? "—"}<small>/100</small>
        </span>
      </div>

      <div className="metric-card__main">
        <div>
          <strong>{metric.value}</strong>
          <span>{metric.target}</span>
        </div>
        <Sparkline values={metric.history} label={`${metric.label} score over the last seven days`} />
      </div>

      <p className="metric-delta">{metric.delta}</p>
      <p className="metric-detail">{metric.detail}</p>

      <div className="metric-action">
        <span>{metric.action}</span>
      </div>

      <div className="metric-card__footer">
        <span><Clock3 size={14} /> Synced {metric.freshness.syncedAt}</span>
        <Link href={metric.href} aria-label={`View ${metric.label} details`}>
          Details <ArrowUpRight size={15} />
        </Link>
      </div>
    </article>
  );
}
