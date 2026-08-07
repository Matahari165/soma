export type BriefInput = {
  sleepScore: number | null;
  recoveryScore: number | null;
  effortScore: number | null;
  effortTarget: [number, number] | null;
  bedtime: string | null;
  insightTitles: string[];
};

export type WeeklyBriefInput = {
  averageSleepScore: number | null;
  averageRecoveryScore: number | null;
  weeklyEffort: number | null;
  weeklyEffortTarget: [number, number] | null;
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
  const effort = input.effortScore === null || !input.effortTarget
    ? "Today's effort target is not available yet."
    : input.effortScore < input.effortTarget[0]
      ? `Today's effort is ${input.effortScore}/100, below the target zone.`
      : input.effortScore > input.effortTarget[1]
        ? `Today's effort is ${input.effortScore}/100, above the target zone.`
        : `Today's effort is within the target zone at ${input.effortScore}/100.`;
  const bedtime = input.bedtime ? `Aim to start winding down for a ${input.bedtime} bedtime.` : "A bedtime recommendation needs more sleep data.";
  return `${effort} ${bedtime}`;
}

export function generateWeeklyBrief(input: WeeklyBriefInput) {
  const scores = [scorePhrase("Average sleep", input.averageSleepScore), scorePhrase("average recovery", input.averageRecoveryScore)].join(" and ");
  const effort = input.weeklyEffort === null || !input.weeklyEffortTarget
    ? "Weekly effort is still being calculated."
    : input.weeklyEffort < input.weeklyEffortTarget[0]
      ? `Weekly effort is ${input.weeklyEffort}, below the ${input.weeklyEffortTarget[0]}–${input.weeklyEffortTarget[1]} target.`
      : input.weeklyEffort > input.weeklyEffortTarget[1]
        ? `Weekly effort is ${input.weeklyEffort}, above the ${input.weeklyEffortTarget[0]}–${input.weeklyEffortTarget[1]} target.`
        : `Weekly effort is within the ${input.weeklyEffortTarget[0]}–${input.weeklyEffortTarget[1]} target at ${input.weeklyEffort}.`;
  const pattern = input.insightTitles[0] ? ` Main pattern: ${input.insightTitles[0].toLowerCase()}.` : "";
  return `${scores}. ${effort}${pattern}`;
}
