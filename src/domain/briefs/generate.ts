export type BriefInput = {
  sleepScore: number | null;
  recoveryScore: number | null;
  effortScore: number | null;
  bedtime: string | null;
  insightTitles: string[];
};

function scorePhrase(label: string, score: number | null) {
  return score === null ? `${label} has limited data` : `${label} is ${score}/100`;
}

export function generateMorningBrief(input: BriefInput) {
  const facts = [scorePhrase("Sleep", input.sleepScore), scorePhrase("recovery", input.recoveryScore)];
  const recommendation = input.recoveryScore !== null && input.recoveryScore >= 70
    ? "Your current signals support the planned session."
    : "Keep today's effort controlled and reassess as more data arrives.";
  return `${facts.join(" and ")}. ${recommendation}${input.insightTitles[0] ? ` Worth noting: ${input.insightTitles[0].toLowerCase()}.` : ""}`;
}

export function generateEveningBrief(input: BriefInput) {
  const effort = input.effortScore === null
    ? "Today's Strain score is not available yet."
    : `Today's Strain score is ${input.effortScore}/100.`;
  const bedtime = input.bedtime ? `Aim for a ${input.bedtime} bedtime.` : "A bedtime recommendation needs more sleep data.";
  return `${effort} ${bedtime}`;
}
