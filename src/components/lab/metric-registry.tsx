"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { isResultOnlyMetric, type MetricRole } from "@/domain/lab/metrics";
import type { PersonalLabSnapshot } from "@/services/personal-lab";

import { localizedMetricLabel, localizedMetricUnit } from "./lab-copy";

const roleLabels: Record<MetricRole, string> = {
  influence: "Influence",
  result: "Résultat",
  both: "Les deux",
  disabled: "Désactivée",
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
    if (!response.ok) setError(result.error ?? "La métrique n’a pas pu être mise à jour.");
    else router.refresh();
    setBusy(null);
  }

  return <details className="metric-registry">
    <summary>Métriques <span>{metrics.filter((metric) => metric.received).length} reçues</span></summary>
    <div className="metric-registry__table">
      <div className="metric-registry__head"><span>Métrique</span><span>Couverture</span><span>Rôle</span></div>
      {[...metrics].sort((first, second) => Number(second.received) - Number(first.received) || first.label.localeCompare(second.label)).map((metric) => <div className={metric.received ? "" : "is-unreceived"} key={metric.id}>
        <span><strong>{localizedMetricLabel(metric.id, metric.label)}</strong><small>{metric.sources.length ? metric.sources.map((source) => `${source.source} ${source.days} j`).join(" · ") : metric.source}{metric.unit ? ` · ${localizedMetricUnit(metric.unit)}` : ""}</small></span>
        <span>{metric.recordedDays ? `${metric.recordedDays} j` : "—"}</span>
        <label><span className="sr-only">Rôle de {localizedMetricLabel(metric.id, metric.label)}</span><select aria-label={`Rôle de ${localizedMetricLabel(metric.id, metric.label)}`} value={metric.role} disabled={busy === metric.id || isResultOnlyMetric(metric.id)} onChange={(event) => void update(metric.id, event.target.value as MetricRole)}>{(isResultOnlyMetric(metric.id) ? [["result", roleLabels.result]] : Object.entries(roleLabels)).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>{busy === metric.id && <LoaderCircle className="spin" size={14} aria-hidden="true" />}</label>
      </div>)}
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </details>;
}
