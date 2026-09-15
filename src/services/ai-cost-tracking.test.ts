import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

import { getAiUsageSummary } from "./ai-cost-tracking";

vi.mock("@/lib/cloudflare/db", () => ({
  createCloudflareAdminClient: vi.fn(),
}));

describe("AI Cost Tracking service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates AI usage and estimates costs correctly across providers", async () => {
    const mockRows = [
      {
        id: "analysis-1",
        meal_id: "meal-1",
        provider: "xai",
        model: "grok-2-vision-1212",
        status: "completed",
        created_at: "2026-09-15T12:00:00Z",
        completed_at: "2026-09-15T12:00:03Z",
      },
      {
        id: "analysis-2",
        meal_id: "meal-2",
        provider: "xai",
        model: "grok-2-vision-1212",
        status: "completed",
        created_at: "2026-09-15T13:00:00Z",
        completed_at: "2026-09-15T13:00:04Z",
      },
      {
        id: "analysis-3",
        meal_id: "meal-3",
        provider: "openai",
        model: "gpt-4o",
        status: "completed",
        created_at: "2026-09-15T14:00:00Z",
        completed_at: "2026-09-15T14:00:05Z",
      },
      {
        id: "analysis-4",
        meal_id: "meal-4",
        provider: "xai",
        model: "grok-2-vision-1212",
        status: "failed",
        created_at: "2026-09-15T15:00:00Z",
        completed_at: null,
      },
    ];

    vi.mocked(createCloudflareAdminClient).mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
          })),
        })),
      })),
    } as never);

    const summary = await getAiUsageSummary("user-test");

    expect(summary.totalAnalyses).toBe(3); // only completed ones count towards spend
    expect(summary.byProvider.xai.count).toBe(2);
    expect(summary.byProvider.openai.count).toBe(1);
    // 2 * 0.006 + 1 * 0.012 = 0.024
    expect(summary.totalEstimatedCostUsd).toBe(0.024);
    expect(summary.averageCostPerMealUsd).toBe(0.008);
    expect(summary.recentAnalyses).toHaveLength(4);
  });
});
