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

export function DataFreshnessLabel({ freshness }: { freshness: DataFreshness }) {
  const label = freshness.state === "fresh"
    ? "Current signal"
    : freshness.state === "stale"
      ? "Stale signal"
      : freshness.state === "partial"
        ? "Partial signal"
        : "Signal unavailable";
  return <span className={`data-freshness data-freshness--${freshness.state}`}><Clock3 size={13} aria-hidden="true" />{label} · synced {freshness.syncedAt}</span>;
}
