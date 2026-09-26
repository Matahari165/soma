import type { AssistantQuality } from "./contracts";

export type AssistantPolicy = { quality: AssistantQuality; model: string; maxSteps: number; maxOutputTokens: number; allowWebSearch: boolean };
type PolicyInput = { text: string; attachmentCount?: number; explicitlyRequestsWeb?: boolean };

const deepSignals = [
  /analyse (?:en profondeur|compl[eè]te)/iu,
  /(?:cr[ée]e|fais|construis|adapte|pr[ée]pare).{0,40}(?:plan|programme|marathon|semi-marathon|course|comp[ée]tition)/iu,
  /(?:plan|programme).{0,40}(?:course|musculation|entra[iî]nement|nutrition)/iu,
  /(?:derniers?|historique).{0,20}(?:mois|ann[ée]es?)/iu,
  /(?:croise|corr[ée]lation|relation entre)/iu,
];
const balancedSignals = [
  /(?:compare|progression|tendance|pourquoi|avis|objectif|performance|analyse|[ée]value|bilan)/iu,
  /(?:combien|quel(?:le)? (?:allure|vitesse|charge|poids|zone|fr[ée]quence|cible)|battements par minute|\bbpm\b)/iu,
  /(?:donn[ée]es|s[ée]ances?|activit[ée]s?|course|courir|running).{0,60}(?:derni[eè]res?|pass[ée]es?)\s+(?:(?:\d+|deux|trois|quatre|six|huit)\s+)?semaines?/iu,
  /(?:derni[eè]res?|pass[ée]es?)\s+(?:(?:\d+|deux|trois|quatre|six|huit)\s+)?semaines?.{0,60}(?:donn[ée]es|s[ée]ances?|activit[ée]s?|course|courir|running)/iu,
  /(?:sommeil|r[ée]cup[ée]ration).{0,30}(?:effort|course|musculation|alimentation)/iu,
];

export function classifyAssistantQuality(input: PolicyInput): AssistantQuality {
  const text = input.text.trim();
  if (deepSignals.some((pattern) => pattern.test(text))) return "deep";
  if ((input.attachmentCount ?? 0) > 0) return "balanced";
  if (balancedSignals.some((pattern) => pattern.test(text))) return "balanced";
  return "fast";
}

function configuredModel(quality: AssistantQuality) {
  const key = quality === "fast" ? "SOMA_ASSISTANT_MODEL_FAST" : quality === "balanced" ? "SOMA_ASSISTANT_MODEL_BALANCED" : "SOMA_ASSISTANT_MODEL_DEEP";
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Assistant model configuration is missing: ${key}.`);
  return value;
}

export function assistantPolicyFor(input: PolicyInput): AssistantPolicy {
  const quality = classifyAssistantQuality(input);
  return {
    quality,
    model: configuredModel(quality),
    maxSteps: quality === "fast" ? 6 : quality === "balanced" ? 10 : 14,
    maxOutputTokens: quality === "fast" ? 1_200 : quality === "balanced" ? 2_400 : 4_000,
    allowWebSearch: Boolean(input.explicitlyRequestsWeb),
  };
}
