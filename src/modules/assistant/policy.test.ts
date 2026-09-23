import { afterEach, describe, expect, it } from "vitest";
import { assistantPolicyFor, classifyAssistantQuality } from "./policy";

describe("assistant quality policy", () => {
  afterEach(() => {
    delete process.env.SOMA_ASSISTANT_MODEL_FAST;
    delete process.env.SOMA_ASSISTANT_MODEL_BALANCED;
    delete process.env.SOMA_ASSISTANT_MODEL_DEEP;
  });

  it("keeps simple conversational turns fast", () => expect(classifyAssistantQuality({ text: "Oui, garde ce plan." })).toBe("fast"));
  it("routes images and comparisons to balanced quality", () => {
    expect(classifyAssistantQuality({ text: "Que vois-tu ?", attachmentCount: 1 })).toBe("balanced");
    expect(classifyAssistantQuality({ text: "Compare mes deux dernières semaines." })).toBe("balanced");
  });
  it("routes plans and explicit deep analysis to deep quality", () => {
    expect(classifyAssistantQuality({ text: "Fais-moi un plan pour courir 30 kilomètres." })).toBe("deep");
    expect(classifyAssistantQuality({ text: "Analyse en profondeur mon historique des six derniers mois." })).toBe("deep");
  });
  it("uses configured model ids and bounded budgets", () => {
    process.env.SOMA_ASSISTANT_MODEL_FAST = "provider/fast";
    process.env.SOMA_ASSISTANT_MODEL_BALANCED = "provider/balanced";
    process.env.SOMA_ASSISTANT_MODEL_DEEP = "provider/deep";
    expect(assistantPolicyFor({ text: "Construis un plan complet." })).toMatchObject({ quality: "deep", model: "provider/deep", maxSteps: 14, maxOutputTokens: 4_000, allowWebSearch: false });
    expect(assistantPolicyFor({ text: "Oui, je confirme." })).toMatchObject({ quality: "fast", maxSteps: 6 });
  });
  it("fails closed when a selected model is not configured", () => expect(() => assistantPolicyFor({ text: "Bonjour" })).toThrow(/SOMA_ASSISTANT_MODEL_FAST/));
});
