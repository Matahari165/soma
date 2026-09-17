export type ArrivalMoment = "night" | "wake" | "morning" | "afternoon" | "evening";

export type ArrivalActivity =
  | { kind: "run"; distanceKm: number | null; durationMinutes: number | null }
  | { kind: "intense"; intensityMinutes: number };

export type ArrivalActivitySignals = {
  runningDistanceKm?: number | null;
  runningDurationMinutes?: number | null;
  runningPaceSecondsPerKm?: number | null;
  vigorousZoneMinutes?: number | null;
  peakZoneMinutes?: number | null;
  dataQuality?: { presentTypes?: string[] };
};

export type ArrivalMessage = {
  moment: ArrivalMoment;
  lines: readonly [string, string];
  activityNote: string | null;
};

type Phrase = readonly [string, string];

const RELIABLE_ACTIVITY_DATA_TYPES = new Set([
  "steps",
  "exercise",
  "daily-exercise-summary",
  "distance",
  "active-minutes",
  "active-zone-minutes",
  "time-in-heart-rate-zone",
  "sedentary-period",
]);

const BASE_PHRASES: Record<ArrivalMoment, readonly Phrase[]> = {
  night: [
    ["Good night, {name}.", "The day settles down."],
    ["Good evening, {name}.", "The lab transitions to rest."],
    ["{name},", "time to recover."],
    ["Good night, {name}.", "Signals can wait."],
    ["Good evening, {name}.", "Rest takes over."],
    ["{name},", "the night measures."],
    ["Good night, {name}.", "Closing softly."],
    ["Good evening, {name}.", "Stillness is valuable."],
    ["{name},", "rest begins now."],
    ["Good night, {name}.", "Until tomorrow."],
  ],
  wake: [
    ["Good morning, {name}.", "The day begins."],
    ["Good morning, {name}.", "You are awake."],
    ["Good morning, {name}.", "Listening to the body."],
    ["Good morning, {name}.", "Calm before all else."],
    ["Good morning, {name}.", "First benchmark."],
    ["Good morning, {name}.", "Gentle awakening."],
    ["Good morning, {name}.", "A day to observe."],
    ["Good morning, {name}.", "The signals are here."],
    ["{name},", "how are you feeling?"],
    ["Good morning, {name}.", "Nothing to force."],
  ],
  morning: [
    ["Good morning, {name}.", "The morning unfolds."],
    ["{name},", "your day takes shape."],
    ["Good morning, {name}.", "Benchmarks are set."],
    ["Good morning, {name}.", "The body sets the tone."],
    ["{name},", "your daily energy."],
    ["Good morning, {name}.", "Moving forward."],
    ["Good morning, {name}.", "Follow your momentum."],
    ["{name},", "what is your rhythm?"],
    ["Good morning, {name}.", "The day advances."],
    ["Good morning, {name}.", "Reading the trend."],
  ],
  afternoon: [
    ["Good afternoon, {name}.", "How is your energy?"],
    ["{name},", "patterns emerge."],
    ["Good afternoon, {name}.", "Your rhythm clarifies."],
    ["{name},", "midday reflection."],
    ["Good afternoon, {name}.", "What follows matters."],
    ["{name},", "keep the thread."],
    ["Good afternoon, {name}.", "The afternoon reveals."],
    ["{name},", "signals accumulating."],
    ["Good afternoon, {name}.", "Strain and recovery."],
    ["{name},", "where does this lead?"],
  ],
  evening: [
    ["Good evening, {name}.", "Traces of the day."],
    ["Good evening, {name}.", "Reviewing what remains."],
    ["{name},", "the day settles."],
    ["Good evening, {name}.", "Observe without judgment."],
    ["{name},", "which signal stands out?"],
    ["Good evening, {name}.", "Rhythm winding down."],
    ["Good evening, {name}.", "Final reading."],
    ["{name},", "the body tells its story."],
    ["Good evening, {name}.", "Reading the essentials."],
    ["Good evening, {name}.", "The day comes to a close."],
  ],
};

const RUN_PHRASES: Record<ArrivalMoment, readonly Phrase[]> = {
  night: [
    ["Good night, {name}.", "Recover after your run."],
    ["Good evening, {name}.", "The run is done."],
    ["{name},", "the run leaves its mark."],
    ["Good night, {name}.", "Run logged, now rest."],
  ],
  wake: [
    ["Good morning, {name}.", "Your run sets the tone."],
    ["Good morning, {name}.", "A morning run, already."],
    ["{name},", "the run sets the tone."],
    ["Good morning, {name}.", "A run, then the day."],
  ],
  morning: [
    ["Good morning, {name}.", "Morning run logged."],
    ["{name},", "the run sets the tone."],
    ["Good morning, {name}.", "The run is recorded."],
    ["Good morning, {name}.", "The morning unfolds."],
  ],
  afternoon: [
    ["Good afternoon, {name}.", "Your run sets the tone."],
    ["{name},", "the run is accounted for."],
    ["Good afternoon, {name}.", "The run leaves its mark."],
    ["{name},", "the run anchors your day."],
  ],
  evening: [
    ["Good evening, {name}.", "The run shaped your day."],
    ["{name},", "the run is your key signal."],
    ["Good evening, {name}.", "The run is recorded."],
    ["Good evening, {name}.", "The day ends on a run."],
  ],
};

const INTENSE_PHRASES: Record<ArrivalMoment, readonly Phrase[]> = {
  night: [
    ["Good night, {name}.", "Recover after your strain."],
    ["Good evening, {name}.", "High effort marked the day."],
    ["{name},", "strain leaves its mark."],
    ["Good night, {name}.", "Effort logged, now rest."],
  ],
  wake: [
    ["Good morning, {name}.", "High effort already set."],
    ["Good morning, {name}.", "A strong start to the day."],
    ["{name},", "intense effort logged already."],
    ["Good morning, {name}.", "Sustained strain is here."],
  ],
  morning: [
    ["Good morning, {name}.", "A solid workout sets the tone."],
    ["{name},", "effort anchors your morning."],
    ["Good morning, {name}.", "Intensity is visible."],
    ["Good morning, {name}.", "A strong effort this morning."],
  ],
  afternoon: [
    ["Good afternoon, {name}.", "Today's strain is logged."],
    ["{name},", "intensity sets the tone."],
    ["Good afternoon, {name}.", "Effort leaves its mark."],
    ["{name},", "your day carries this strain."],
  ],
  evening: [
    ["Good evening, {name}.", "Intensity shaped your day."],
    ["{name},", "strain is your key signal."],
    ["Good evening, {name}.", "The effort is recorded."],
    ["Good evening, {name}.", "Finishing the day strong."],
  ],
};

export const ARRIVAL_PHRASE_COUNTS = {
  base: Object.values(BASE_PHRASES).reduce((total, phrases) => total + phrases.length, 0),
  run: Object.values(RUN_PHRASES).reduce((total, phrases) => total + phrases.length, 0),
  intense: Object.values(INTENSE_PHRASES).reduce((total, phrases) => total + phrases.length, 0),
} as const;

function numeric(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value: number | null | undefined) {
  const parsed = numeric(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function hasReliableActivityCoverage(day: ArrivalActivitySignals) {
  const presentTypes = day.dataQuality?.presentTypes;
  return !presentTypes || presentTypes.some((type) => RELIABLE_ACTIVITY_DATA_TYPES.has(type));
}

export function arrivalActivityFor(day: ArrivalActivitySignals | null | undefined): ArrivalActivity | null {
  if (!day || !hasReliableActivityCoverage(day)) return null;

  const runningDistanceKm = positive(day.runningDistanceKm);
  const runningDurationMinutes = positive(day.runningDurationMinutes);
  const runningPaceSecondsPerKm = positive(day.runningPaceSecondsPerKm);
  if (runningDistanceKm !== null && runningDurationMinutes !== null && runningDistanceKm >= 1.5 && runningDurationMinutes >= 10
    && (runningPaceSecondsPerKm === null || (runningPaceSecondsPerKm >= 180 && runningPaceSecondsPerKm <= 720))) {
    return { kind: "run", distanceKm: runningDistanceKm, durationMinutes: runningDurationMinutes };
  }

  const vigorousZoneMinutes = numeric(day.vigorousZoneMinutes);
  const peakZoneMinutes = numeric(day.peakZoneMinutes);
  const intensityMinutes = (vigorousZoneMinutes ?? 0) + (peakZoneMinutes ?? 0);
  if ((vigorousZoneMinutes !== null && vigorousZoneMinutes >= 15)
    || (peakZoneMinutes !== null && peakZoneMinutes >= 10)
    || (vigorousZoneMinutes !== null && peakZoneMinutes !== null && intensityMinutes >= 15)) {
    return { kind: "intense", intensityMinutes: Math.round(intensityMinutes) };
  }
  return null;
}

export function arrivalMomentFor(localMinutes: number): ArrivalMoment {
  if (localMinutes < 6 * 60 + 30) return "night";
  if (localMinutes < 7 * 60 + 30) return "wake";
  if (localMinutes < 12 * 60) return "morning";
  if (localMinutes < 18 * 60) return "afternoon";
  if (localMinutes < 22 * 60 + 30) return "evening";
  return "night";
}

function localDateParts(now: Date, timeZone: string) {
  const format = (zone: string) => new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = format(timeZone).formatToParts(now);
  } catch {
    parts = format("Europe/Paris").formatToParts(now);
  }
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  const hour = value("hour");
  const minute = value("minute");
  return { dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, localMinutes: hour * 60 + minute };
}

function stableIndex(value: string, length: number) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "Friend";
}

function formatActivityNote(activity: ArrivalActivity) {
  if (activity.kind === "intense") return `Intense effort recorded · ${activity.intensityMinutes} min in high zones`;
  const details = [
    activity.distanceKm === null ? null : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(activity.distanceKm)} km`,
    activity.durationMinutes === null ? null : `${Math.round(activity.durationMinutes)} min`,
  ].filter(Boolean);
  return `Run recorded${details.length ? ` · ${details.join(" · ")}` : ""}`;
}

export function arrivalMessageFor({
  name,
  now = new Date(),
  timeZone = "Europe/Paris",
  activity = null,
}: {
  name: string;
  now?: Date;
  timeZone?: string;
  activity?: ArrivalActivity | null;
}): ArrivalMessage {
  const { dateKey, localMinutes } = localDateParts(now, timeZone);
  const moment = arrivalMomentFor(localMinutes);
  const catalog = activity?.kind === "run" ? RUN_PHRASES[moment]
    : activity?.kind === "intense" ? INTENSE_PHRASES[moment]
      : BASE_PHRASES[moment];
  const rotationWindow = Math.floor(localMinutes / 120);
  const phrase = catalog[stableIndex(`${dateKey}:${moment}:${rotationWindow}:${activity?.kind ?? "none"}`, catalog.length)];
  const displayName = firstName(name);
  return {
    moment,
    lines: phrase.map((line) => line.replace("{name}", displayName)) as [string, string],
    activityNote: activity ? formatActivityNote(activity) : null,
  };
}
