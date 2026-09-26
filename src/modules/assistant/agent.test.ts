import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ options: [] as Array<Record<string, unknown>> }));

vi.mock("server-only", () => ({}));
vi.mock("@ai-sdk/openai", () => ({ openai: { responses: (model: string) => model } }));
vi.mock("ai", () => ({
  tool: <T>(options: T) => options,
  isStepCount: (count: number) => count,
  ToolLoopAgent: class {
    constructor(options: Record<string, unknown>) { state.options.push(options); }
  },
}));
vi.mock("./tools/get-user-context", () => ({ createGetUserContextTool: () => ({}) }));
vi.mock("./tools/get-plan-details", () => ({ createGetPlanDetailsTool: () => ({}) }));
vi.mock("./tools/get-strongest-effects", () => ({ createGetStrongestEffectsTool: () => ({}) }));
vi.mock("./tools/get-workout-history", () => ({ createGetWorkoutHistoryTool: () => ({}) }));
vi.mock("./tools/get-latest-run", () => ({ createGetLatestRunTool: () => ({}) }));
vi.mock("./tools/manage-user-context", () => ({ createManageUserContextTool: () => ({}) }));
vi.mock("./tools/manage-meal", () => ({ createManageMealTool: () => ({}) }));
vi.mock("./tools/manage-nutrition-targets", () => ({ createManageNutritionTargetsTool: () => ({}) }));
vi.mock("./tools/query-soma-data", () => ({ createQuerySomaDataTool: () => ({}) }));

import { createSomaAssistantAgent } from "./agent";

describe("Soma assistant model configuration", () => {
  it.each([
    ["fast", "medium", 6, 1_200],
    ["balanced", "high", 10, 2_400],
    ["deep", "xhigh", 14, 4_000],
  ] as const)("uses %s quality with %s reasoning", (quality, effort, steps, tokens) => {
    state.options.length = 0;
    createSomaAssistantAgent({
      userId: "user-1", runId: "run-1", triggeringMessageId: "message-1",
      triggeringUserText: "Question", conversationId: "conversation-1", quality,
    });
    expect(Object.keys(state.options[0].tools as Record<string, unknown>)).toEqual(expect.arrayContaining([
      "getDataCatalog", "queryLabAnalyses", "getActivityTelemetry", "queryRawHealth",
      "summarizeSomaData", "searchConversation", "readConversationMessage", "reopenConversationImage",
    ]));
    expect(state.options[0]).toMatchObject({
      model: "gpt-6-luna", stopWhen: steps, maxOutputTokens: tokens,
      providerOptions: { openai: { reasoningEffort: effort, store: false } },
    });
  });
});
