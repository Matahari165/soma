export type StarterSignals = {
  hasGoals: boolean;
  hasRunning: boolean;
  hasEffort: boolean;
  hasSleep: boolean;
  hasRecovery: boolean;
  hasMeals: boolean;
};

export type StarterPrompt = { id: string; text: string };
export type StarterEvidenceDates = Partial<Record<"running" | "effort" | "sleep" | "recovery" | "nutrition", string>>;

function formatEvidenceDate(date: string | undefined) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : new Intl.DateTimeFormat("fr-CH", { day: "numeric", month: "long", timeZone: "UTC" }).format(parsed);
}

const fallback: StarterPrompt[] = [
  { id: "overview", text: "Fais le point sur mes données récentes et dis-moi ce qu’on peut en conclure." },
  { id: "missing", text: "Quelles données me manquent pour mieux suivre mes progrès ?" },
  { id: "next-step", text: "Quelle serait une prochaine étape réaliste pour mes objectifs ?" },
];

/** A small, explainable choice set. No model call and no inferred health conclusion. */
export function selectStarterPrompts(signals: StarterSignals, rotation = 0, dates: StarterEvidenceDates = {}): StarterPrompt[] {
  const candidates: StarterPrompt[] = [];
  if (signals.hasGoals) candidates.push({ id: "goals", text: "Où en suis-je par rapport à mes objectifs actuels, et que devrais-je ajuster ?" });
  if (signals.hasRunning) candidates.push({ id: "running", text: formatEvidenceDate(dates.running)
    ? `Après ma course du ${formatEvidenceDate(dates.running)}, quelle prochaine séance serait cohérente avec mon historique ?`
    : "Que montrent mes courses récentes pour préparer ma prochaine séance ?" });
  if (signals.hasEffort) candidates.push({ id: "effort", text: formatEvidenceDate(dates.effort)
    ? `Depuis mon activité du ${formatEvidenceDate(dates.effort)}, comment ajuster mes prochaines séances ?`
    : "Comment mon effort récent devrait-il guider mes prochaines séances ?" });
  if (signals.hasSleep) candidates.push({ id: "sleep", text: formatEvidenceDate(dates.sleep)
    ? `Que montre mon sommeil enregistré le ${formatEvidenceDate(dates.sleep)} ?`
    : "Que montre mon sommeil récent, et qu’est-ce que je peux améliorer ?" });
  if (signals.hasRecovery) candidates.push({ id: "recovery", text: formatEvidenceDate(dates.recovery)
    ? `Que dit mon suivi de récupération du ${formatEvidenceDate(dates.recovery)} ?`
    : "Comment évolue ma récupération et que faut-il surveiller ?" });
  if (signals.hasMeals) candidates.push({ id: "nutrition", text: "Que montrent mes repas enregistrés pour mes objectifs actuels ?" });

  // Keep the goal as an anchor when available, rotate the other domains each day.
  const anchor = signals.hasGoals ? candidates.shift() : undefined;
  const offset = candidates.length ? Math.abs(Math.trunc(rotation)) % candidates.length : 0;
  const rotated = [...candidates.slice(offset), ...candidates.slice(0, offset)];
  return [...(anchor ? [anchor] : []), ...rotated, ...fallback]
    .filter((prompt, index, all) => all.findIndex((item) => item.id === prompt.id) === index)
    .slice(0, 3);
}
