import { CircleSlash, Clock3, Radio, TriangleAlert } from "lucide-react";

import type { DataFreshness, ScoreStatus } from "@/domain/health";

const statusLabels: Record<ScoreStatus, string> = {
  restorative: "Restorative",
  steady: "Steady",
  building: "Building",
  limited: "Limited data",
};

export function MetricStatus({ status }: { status: ScoreStatus }) {
  const Icon = status === "limited" ? CircleSlash : status === "building" ? TriangleAlert : Radio;
  return <span className={`metric-status metric-status--${status}`}><Icon size={14} aria-hidden="true" />{statusLabels[status]}</span>;
}

function measuredLabel(value: string) {
  if (value === "unknown") return "no measurement";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "measured recently";
  return `measured ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export function DataFreshnessLabel({ freshness }: { freshness: DataFreshness }) {
  const label = freshness.state === "fresh"
    ? "Current signal"
    : freshness.state === "stale"
      ? "Stale signal"
      : freshness.state === "partial"
        ? "Partial signal"
        : "Signal unavailable";
  const measured = measuredLabel(freshness.measuredAt);
  return <span className={`data-freshness data-freshness--${freshness.state}`}><Clock3 size={13} aria-hidden="true" />{label} · {measured} · processed {freshness.syncedAt}</span>;
}
