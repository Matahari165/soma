export const LAB_NARRATIVE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1_000;
export const LAB_NARRATIVE_ITEM_COUNT = 10;

export function isWeeklyNarrativeCurrent(generatedAt: string | null | undefined, now = new Date()) {
  if (!generatedAt) return false;
  const generatedTime = new Date(generatedAt).getTime();
  return Number.isFinite(generatedTime)
    && generatedTime <= now.getTime()
    && now.getTime() - generatedTime < LAB_NARRATIVE_INTERVAL_MS;
}

export function shouldGenerateWeeklyNarrative(input: { isCurrent: boolean; needsRefresh: boolean; candidateCount: number }) {
  return !input.isCurrent && input.needsRefresh && input.candidateCount >= LAB_NARRATIVE_ITEM_COUNT;
}

export function evidenceCandidatesForNarrative(narrative: { evidence_candidates?: unknown; source_facts?: unknown } | null | undefined) {
  if (Array.isArray(narrative?.evidence_candidates)) return narrative.evidence_candidates.slice(0, 20);
  return Array.isArray(narrative?.source_facts) ? narrative.source_facts.slice(0, 20) : [];
}
