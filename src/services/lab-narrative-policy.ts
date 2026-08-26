export function shouldGenerateDailyNarrative(input: { isCurrent: boolean; needsRefresh: boolean; candidateCount: number }) {
  return !input.isCurrent && input.needsRefresh && input.candidateCount > 0;
}

export function evidenceCandidatesForNarrative(narrative: { evidence_candidates?: unknown; source_facts?: unknown } | null | undefined) {
  if (Array.isArray(narrative?.evidence_candidates)) return narrative.evidence_candidates.slice(0, 12);
  return Array.isArray(narrative?.source_facts) ? narrative.source_facts.slice(0, 12) : [];
}
