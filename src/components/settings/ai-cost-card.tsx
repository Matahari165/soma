"use client";

import { useEffect, useState } from "react";
import { Cpu, Sparkles } from "lucide-react";

import type { AiUsageSummary } from "@/services/ai-cost-tracking";

export function AiCostCard() {
  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/ai-usage")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.summary) setSummary(data.summary);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <article className="settings-card" aria-labelledby="ai-cost-title">
        <header className="settings-card__header">
          <div className="settings-card__icon" aria-hidden="true">
            <Cpu size={20} />
          </div>
          <div>
            <h3 id="ai-cost-title">AI Cost &amp; Model Transparency</h3>
            <p className="settings-card__subtitle">Loading AI analysis usage…</p>
          </div>
        </header>
      </article>
    );
  }

  const totalSpend = summary ? `$${summary.totalEstimatedCostUsd.toFixed(3)}` : "$0.000";
  const avgCost = summary ? `$${summary.averageCostPerMealUsd.toFixed(3)}` : "$0.000";
  const totalCount = summary?.totalAnalyses ?? 0;

  return (
    <article className="settings-card ai-cost-card" aria-labelledby="ai-cost-title">
      <header className="settings-card__header">
        <div className="settings-card__icon" aria-hidden="true">
          <Sparkles size={20} />
        </div>
        <div>
          <h3 id="ai-cost-title">AI Usage &amp; Cost Transparency</h3>
          <p className="settings-card__subtitle">
            Estimated meal-analysis cost by provider. Soma chat and Analyse summaries are not included.
          </p>
        </div>
      </header>

      <div className="ai-cost-metrics-grid">
        <div className="ai-cost-stat">
          <span className="ai-cost-stat__label">Total Meals Analyzed</span>
          <strong className="ai-cost-stat__value font-mono">{totalCount}</strong>
        </div>
        <div className="ai-cost-stat">
          <span className="ai-cost-stat__label">Total Estimated Spend</span>
          <strong className="ai-cost-stat__value font-mono">{totalSpend}</strong>
        </div>
        <div className="ai-cost-stat">
          <span className="ai-cost-stat__label">Average Cost / Meal</span>
          <strong className="ai-cost-stat__value font-mono">{avgCost}</strong>
        </div>
      </div>

      <div className="ai-cost-breakdown">
        <h4>Provider Breakdown</h4>
        <div className="ai-provider-grid">
          <div className="ai-provider-item">
            <div className="ai-provider-info">
              <strong>xAI Grok</strong>
              <small>Earlier meal analyses</small>
            </div>
            <div className="ai-provider-stats font-mono">
              <span>{summary?.byProvider.xai.count ?? 0} runs</span>
              <em>${(summary?.byProvider.xai.estimatedCostUsd ?? 0).toFixed(3)}</em>
            </div>
          </div>
          <div className="ai-provider-item">
            <div className="ai-provider-info">
              <strong>OpenAI</strong>
              <small>GPT-6 Luna and earlier models</small>
            </div>
            <div className="ai-provider-stats font-mono">
              <span>{summary?.byProvider.openai.count ?? 0} runs</span>
              <em>${(summary?.byProvider.openai.estimatedCostUsd ?? 0).toFixed(3)}</em>
            </div>
          </div>
        </div>
      </div>

      {summary && summary.recentAnalyses.length > 0 && (
        <div className="ai-cost-recent">
          <h4>Recent Vision Analyses</h4>
          <div className="ai-recent-table-wrap">
            <table className="ai-recent-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Model</th>
                  <th>Status</th>
                  <th>Est. Cost</th>
                </tr>
              </thead>
              <tbody>
                {summary.recentAnalyses.map((item) => (
                  <tr key={item.id}>
                    <td className="font-mono text-xs">
                      {new Date(item.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td>{item.model}</td>
                    <td>
                      <span className={`status-badge status-${item.status}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="font-mono">${item.estimatedCostUsd.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </article>
  );
}
