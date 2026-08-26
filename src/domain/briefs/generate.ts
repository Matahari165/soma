export type BriefInput = {
  sleepScore: number | null;
  recoveryScore: number | null;
  effortScore: number | null;
  bedtime: string | null;
  insightTitles: string[];
};

export type WeeklyBriefInput = {
  averageSleepScore: number | null;
  averageRecoveryScore: number | null;
  weeklyEffort: number | null;
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
    ? "Today's accomplished load is not available yet."
    : `Today's accomplished load is ${input.effortScore}/100.`;
  const bedtime = input.bedtime ? `Aim to start winding down for a ${input.bedtime} bedtime.` : "A bedtime recommendation needs more sleep data.";
  return `${effort} ${bedtime}`;
}

export function generateWeeklyBrief(input: WeeklyBriefInput) {
  const scores = [scorePhrase("Average sleep", input.averageSleepScore), scorePhrase("average recovery", input.averageRecoveryScore)].join(" and ");
  const effort = input.weeklyEffort === null
    ? "Weekly accumulated load is still being calculated."
    : `Weekly accumulated load is ${input.weeklyEffort}.`;
  const pattern = input.insightTitles[0] ? ` Main pattern: ${input.insightTitles[0].toLowerCase()}.` : "";
  return `${scores}. ${effort}${pattern}`;
}
