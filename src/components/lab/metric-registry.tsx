"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { MetricRole } from "@/domain/lab/metrics";
import type { PersonalLabSnapshot } from "@/services/personal-lab";

const roleLabels: Record<MetricRole, string> = {
  influence: "Influence",
  result: "Result",
  both: "Both",
  disabled: "Disabled",
};

export function MetricRegistry({ metrics }: { metrics: PersonalLabSnapshot["metricRegistry"] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function update(metricId: string, role: MetricRole) {
    setBusy(metricId);
    setError(null);
    const response = await fetch("/api/lab/metrics", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metricId, role }) });
    const result = await response.json();
    if (!response.ok) setError(result.error ?? "Metric could not be updated.");
    else router.refresh();
    setBusy(null);
  }

  return <details className="metric-registry">
    <summary>Metrics <span>{metrics.filter((metric) => metric.received).length} received</span></summary>
    <div className="metric-registry__table">
      <div className="metric-registry__head"><span>Metric</span><span>Coverage</span><span>Role</span></div>
      {[...metrics].sort((first, second) => Number(second.received) - Number(first.received) || first.label.localeCompare(second.label)).map((metric) => <div className={metric.received ? "" : "is-unreceived"} key={metric.id}>
        <span><strong>{metric.label}</strong><small>{metric.source} · {metric.unit}</small></span>
        <span>{metric.recordedDays ? `${metric.recordedDays}d` : "—"}</span>
        <label><span className="sr-only">{metric.label} role</span><select value={metric.role} disabled={busy === metric.id} onChange={(event) => void update(metric.id, event.target.value as MetricRole)}>{Object.entries(roleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>{busy === metric.id && <LoaderCircle className="spin" size={14} aria-hidden="true" />}</label>
      </div>)}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </details>;
}
