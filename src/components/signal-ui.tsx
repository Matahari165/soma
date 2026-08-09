import { Clock3 } from "lucide-react";

import type { DataFreshness } from "@/domain/health";

function measuredLabel(value: string) {
  if (value === "unknown") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function DataFreshnessLabel({ freshness }: { freshness: DataFreshness }) {
  const label = freshness.state === "fresh"
    ? "Current"
    : freshness.state === "stale"
      ? "Needs sync"
      : freshness.state === "partial"
        ? "Partial"
        : "Awaiting data";
  const measured = measuredLabel(freshness.measuredAt);
  const details = `${label}${measured ? ` · ${measured}` : ""} · processed ${freshness.syncedAt}`;
  return <span className={`data-freshness data-freshness--${freshness.state}`} aria-label={details} title={details}><Clock3 size={13} aria-hidden="true" />{label}{measured ? ` · ${measured}` : ""}</span>;
}
