import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

export type AiModelUsage = {
  model: string;
  provider: string;
  count: number;
  estimatedCostUsd: number;
};

export type AiUsageSummary = {
  totalAnalyses: number;
  totalEstimatedCostUsd: number;
  averageCostPerMealUsd: number;
  byProvider: {
    xai: { count: number; estimatedCostUsd: number };
    openai: { count: number; estimatedCostUsd: number };
    other: { count: number; estimatedCostUsd: number };
  };
  models: AiModelUsage[];
  recentAnalyses: Array<{
    id: string;
    mealId: string;
    provider: string;
    model: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
    estimatedCostUsd: number;
  }>;
};

// Unit cost estimates based on multi-modal vision payloads + structured JSON outputs
const ESTIMATED_COST_PER_RUN: Record<string, number> = {
  "grok-2-vision-1212": 0.006,
  "grok-2-vision": 0.006,
  "grok-vision": 0.006,
  "gpt-4o": 0.012,
  "gpt-4o-mini": 0.002,
  "gpt-5.6": 0.015,
};

const DEFAULT_XAI_RUN_COST = 0.006;
const DEFAULT_OPENAI_RUN_COST = 0.012;

export async function getAiUsageSummary(userId: string): Promise<AiUsageSummary> {
  const admin = createCloudflareAdminClient();
  const { data, error } = await admin
    .from("meal_analyses")
    .select("id,meal_id,provider,model,status,created_at,completed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return {
      totalAnalyses: 0,
      totalEstimatedCostUsd: 0,
      averageCostPerMealUsd: 0,
      byProvider: {
        xai: { count: 0, estimatedCostUsd: 0 },
        openai: { count: 0, estimatedCostUsd: 0 },
        other: { count: 0, estimatedCostUsd: 0 },
      },
      models: [],
      recentAnalyses: [],
    };
  }

  const rows = data as Array<{
    id: string;
    meal_id: string;
    provider: string;
    model: string;
    status: string;
    created_at: string;
    completed_at?: string | null;
  }>;

  const completedRows = rows.filter((r) => r.status === "completed");

  const byProvider = {
    xai: { count: 0, estimatedCostUsd: 0 },
    openai: { count: 0, estimatedCostUsd: 0 },
    other: { count: 0, estimatedCostUsd: 0 },
  };

  const modelMap = new Map<string, { model: string; provider: string; count: number; cost: number }>();

  let totalCost = 0;

  for (const row of completedRows) {
    const providerKey =
      row.provider === "xai" || row.model?.toLowerCase().includes("grok")
        ? "xai"
        : row.provider === "openai" || row.model?.toLowerCase().includes("gpt")
        ? "openai"
        : "other";

    const cost =
      ESTIMATED_COST_PER_RUN[row.model] ??
      (providerKey === "xai"
        ? DEFAULT_XAI_RUN_COST
        : providerKey === "openai"
        ? DEFAULT_OPENAI_RUN_COST
        : 0.005);

    totalCost += cost;
    byProvider[providerKey].count += 1;
    byProvider[providerKey].estimatedCostUsd += cost;

    const modelKey = row.model || row.provider || "unknown";
    const existingModel = modelMap.get(modelKey) ?? {
      model: modelKey,
      provider: row.provider || providerKey,
      count: 0,
      cost: 0,
    };
    existingModel.count += 1;
    existingModel.cost += cost;
    modelMap.set(modelKey, existingModel);
  }

  const recentAnalyses = rows.slice(0, 10).map((r) => {
    const cost =
      ESTIMATED_COST_PER_RUN[r.model] ??
      (r.provider === "xai" ? DEFAULT_XAI_RUN_COST : DEFAULT_OPENAI_RUN_COST);

    return {
      id: r.id,
      mealId: r.meal_id,
      provider: r.provider || "AI",
      model: r.model || "Vision Model",
      status: r.status,
      createdAt: r.created_at,
      completedAt: r.completed_at ?? null,
      estimatedCostUsd: r.status === "completed" ? cost : 0,
    };
  });

  return {
    totalAnalyses: completedRows.length,
    totalEstimatedCostUsd: Math.round(totalCost * 1000) / 1000,
    averageCostPerMealUsd:
      completedRows.length > 0 ? Math.round((totalCost / completedRows.length) * 1000) / 1000 : 0,
    byProvider: {
      xai: {
        count: byProvider.xai.count,
        estimatedCostUsd: Math.round(byProvider.xai.estimatedCostUsd * 1000) / 1000,
      },
      openai: {
        count: byProvider.openai.count,
        estimatedCostUsd: Math.round(byProvider.openai.estimatedCostUsd * 1000) / 1000,
      },
      other: {
        count: byProvider.other.count,
        estimatedCostUsd: Math.round(byProvider.other.estimatedCostUsd * 1000) / 1000,
      },
    },
    models: [...modelMap.values()].map((m) => ({
      model: m.model,
      provider: m.provider,
      count: m.count,
      estimatedCostUsd: Math.round(m.cost * 1000) / 1000,
    })),
    recentAnalyses,
  };
}
