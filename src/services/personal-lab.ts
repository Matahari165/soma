import { analyzePersonalLab, type LabObservation, type LabDiscovery } from "@/domain/lab/insights";
import { defaultJournalVariables, journalValueAsNumber, type JournalEntry, type JournalVariable } from "@/domain/lab/journal";
import { adjustMatrixRelations, calculateMatrixRelation, type MatrixRelation, type MatrixSeries } from "@/domain/lab/matrix";
import type { SomaUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadJournalData } from "@/services/journal";

export type DailyCheckin = {
  checkin_date: string;
  energy: number | null;
  focus: number | null;
  stress: number | null;
  mood: number | null;
  soreness: number | null;
  caffeine_servings: number | null;
  alcohol_servings: number | null;
  late_meal: boolean | null;
  illness: boolean | null;
  deep_work_minutes_override: number | null;
};

type CalendarDay = {
  metric_date: string;
  deep_work_minutes: number;
  deep_work_event_count: number;
  total_scheduled_minutes: number;
  synced_at: string;
};

type HealthDay = {
  metric_date: string;
  sleep_minutes: number | null;
  sleep_efficiency: number | null;
  sleep_regularity: number | null;
  cumulative_sleep_debt_minutes: number | null;
  hrv_ms: number | null;
  resting_heart_rate: number | null;
  steps: number | null;
  zone_minutes: number | null;
  bedtime: string | null;
  sleep_deep_minutes: number | null;
  sleep_rem_minutes: number | null;
  respiratory_rate: number | null;
  oxygen_saturation: number | null;
  skin_temperature_delta: number | null;
  vigorous_zone_minutes: number | null;
  active_minutes: number | null;
  exercise_minutes: number | null;
  data_quality?: { primaryWearable?: string | null };
};

type ScoreDay = { score_date: string; kind: "sleep" | "recovery" | "effort"; score: number | null };
type ExerciseRecord = { civil_date: string | null; payload: unknown };
export type LabMatrixRow = { id: string; label: string; grain: "day" | "week"; lagLabel: string; relations: MatrixRelation[] };

export type PersonalLabSnapshot = {
  todayDate: string;
  dateLabel: string;
  greetingName: string;
  checkin: DailyCheckin | null;
  journal: {
    entryDate: string;
    variables: JournalVariable[];
    entries: JournalEntry[];
  };
  today: {
    sleepMinutes: number | null;
    recoveryScore: number | null;
    deepWorkMinutes: number | null;
    calendarDeepWorkMinutes: number | null;
    deepWorkSource: "calendar" | "corrected" | "missing";
    focus: number | null;
    energy: number | null;
  };
  featured: LabDiscovery | null;
  discoveries: LabDiscovery[];
  testedCount: number;
  eligibleCount: number;
  aiNarrative: { headline: string; summary: string; highlights: string[]; model: string; generatedAt: string } | null;
  needsNarrativeRefresh: boolean;
  matrix: {
    outcomes: Array<{ id: string; label: string; unit: string }>;
    rows: LabMatrixRow[];
    topRelations: MatrixRelation[];
  };
  coverage: {
    healthDays: number;
    calendarDays: number;
    checkinDays: number;
    journalDays: number;
    pairedDeepWorkDays: number;
    rangeDays: number;
  };
  connections: {
    health: { connected: boolean; lastSyncedAt: string | null };
    calendar: { connected: boolean; lastSyncedAt: string | null };
  };
};

function dateInTimezone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function toNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function minutesInTimezone(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const hours = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minutes = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const result = hours * 60 + minutes;
  return result < 12 * 60 ? result + 24 * 60 : result;
}

function weekStart(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}

function aggregateWeekly(points: MatrixSeries["points"], mode: "sum" | "mean", allowedWeeks: Set<string>, minimumDays: number) {
  const grouped = new Map<string, MatrixSeries["points"]>();
  for (const point of points) grouped.set(weekStart(point.date), [...(grouped.get(weekStart(point.date)) ?? []), point]);
  return [...grouped]
    .filter(([date, values]) => allowedWeeks.has(date) && values.length >= minimumDays && new Set(values.map((point) => point.segment).filter(Boolean)).size <= 1)
    .map(([date, values]) => ({ date, value: mode === "sum" ? values.reduce((sum, point) => sum + point.value, 0) : values.reduce((sum, point) => sum + point.value, 0) / values.length, segment: values.find((point) => point.segment)?.segment }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function healthSeries(health: HealthDay[], id: string, label: string, unit: string, key: keyof HealthDay): MatrixSeries {
  return {
    id,
    label,
    unit,
    kind: "numeric",
    points: health.flatMap((day) => {
      const value = toNumber(day[key]);
      return value === null ? [] : [{ date: day.metric_date, value, segment: day.data_quality?.primaryWearable ?? undefined }];
    }),
  };
}

function exerciseType(payload: unknown): string | null {
  if (Array.isArray(payload)) {
    for (const item of payload) { const found = exerciseType(item); if (found) return found; }
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const object = payload as Record<string, unknown>;
  if (typeof object.exerciseType === "string") return object.exerciseType;
  for (const value of Object.values(object)) { const found = exerciseType(value); if (found) return found; }
  return null;
}

function buildCorrelationMatrix(input: {
  health: HealthDay[];
  observations: LabObservation[];
  variables: JournalVariable[];
  entries: JournalEntry[];
  exercises: ExerciseRecord[];
  timeZone: string;
}) {
  const health = [...input.health].sort((a, b) => a.metric_date.localeCompare(b.metric_date));
  const dailyOutcomes = [
    healthSeries(health, "sleep_minutes", "Sleep", "min", "sleep_minutes"),
    healthSeries(health, "sleep_efficiency", "Efficiency", "%", "sleep_efficiency"),
    healthSeries(health, "deep_sleep", "Deep sleep", "min", "sleep_deep_minutes"),
    healthSeries(health, "rem_sleep", "REM sleep", "min", "sleep_rem_minutes"),
    healthSeries(health, "hrv", "HRV", "ms", "hrv_ms"),
    healthSeries(health, "rhr", "Resting HR", "bpm", "resting_heart_rate"),
    healthSeries(health, "respiratory", "Breathing rate", "/min", "respiratory_rate"),
    healthSeries(health, "spo2", "SpO₂", "%", "oxygen_saturation"),
    healthSeries(health, "temperature", "Temperature", "°C", "skin_temperature_delta"),
  ];
  const deepWorkSeries: MatrixSeries = { id: "calendar_deep_work", label: "Deep Work (Calendar)", unit: "min", kind: "numeric", points: input.observations.flatMap((day) => day.deepWorkMinutes === null ? [] : [{ date: day.date, value: day.deepWorkMinutes }]) };
  const automaticRows: Array<{ series: MatrixSeries; lagDays: number; label: string }> = [
    {
      series: { id: "bedtime", label: "Bedtime", unit: "h", kind: "numeric", points: health.flatMap((day) => day.bedtime ? [{ date: day.metric_date, value: minutesInTimezone(day.bedtime, input.timeZone), segment: day.data_quality?.primaryWearable ?? undefined }] : []) },
      lagDays: 0,
      label: "same night",
    },
    { series: healthSeries(health, "sleep_duration_driver", "Sleep duration", "min", "sleep_minutes"), lagDays: 0, label: "same day" },
    { series: healthSeries(health, "sleep_debt", "Sleep debt", "min", "cumulative_sleep_debt_minutes"), lagDays: 0, label: "same day" },
    { series: healthSeries(health, "steps", "Steps", "steps", "steps"), lagDays: 1, label: "next day" },
    { series: healthSeries(health, "zone_minutes", "Zone minutes", "min", "zone_minutes"), lagDays: 1, label: "next day" },
    { series: healthSeries(health, "vigorous_minutes", "Vigorous effort", "min", "vigorous_zone_minutes"), lagDays: 1, label: "next day" },
    { series: healthSeries(health, "active_minutes", "Active time", "min", "active_minutes"), lagDays: 1, label: "next day" },
    { series: healthSeries(health, "exercise_minutes", "Exercise time", "min", "exercise_minutes"), lagDays: 1, label: "next day" },
    { series: deepWorkSeries, lagDays: 1, label: "next day" },
  ];

  const entriesByVariable = new Map<string, JournalEntry[]>();
  for (const entry of input.entries) entriesByVariable.set(entry.variableId, [...(entriesByVariable.get(entry.variableId) ?? []), entry]);
  const journalRows = input.variables.filter((variable) => variable.isActive).flatMap((variable) => {
    const recorded = new Map((entriesByVariable.get(variable.id) ?? []).map((entry) => [entry.entryDate, entry.value]));
    if (variable.variableType === "category") return variable.options.map((option) => ({
      series: { id: `journal:${variable.id}:${option}`, label: `${variable.name} · ${option}`, unit: "", kind: "binary" as const, points: [...recorded].flatMap(([date, value]) => typeof value === "string" ? [{ date, value: value === option ? 1 : 0 }] : []) },
      lagDays: 1,
      label: "next day",
    }));
    const kind = variable.variableType === "boolean" ? "binary" as const : "numeric" as const;
    return [{
      series: { id: `journal:${variable.id}`, label: variable.name, unit: variable.unit ?? "", kind, points: [...recorded].flatMap(([date, value]) => {
        const number = journalValueAsNumber(variable, value);
        return number === null ? [] : [{ date, value: number }];
      }) },
      lagDays: 1,
      label: "next day",
    }];
  });

  const redundant = (predictorId: string, outcomeId: string) => (
    predictorId === "sleep_duration_driver" && ["sleep_minutes", "deep_sleep", "rem_sleep"].includes(outcomeId)
  ) || (
    predictorId === "sleep_debt" && ["sleep_minutes", "deep_sleep", "rem_sleep"].includes(outcomeId)
  );
  const minimumVisibleEffect: Record<string, number> = {
    sleep_minutes: 10,
    sleep_efficiency: 1,
    deep_sleep: 5,
    rem_sleep: 5,
    hrv: 1,
    rhr: .5,
    respiratory: .1,
    spo2: .2,
    temperature: .1,
  };
  const removeNegligibleEffect = (relation: MatrixRelation) => relation.effect !== null
    && Math.abs(relation.effect) < (minimumVisibleEffect[relation.outcomeId] ?? 0)
    ? { ...relation, strength: "hidden" as const, stable: false }
    : relation;
  const deprioritizeObviousRelation = (relation: MatrixRelation) => relation.predictorId === "bedtime" && relation.outcomeId === "sleep_minutes"
    ? { ...relation, relevance: 0 }
    : relation;
  const dailyRows: LabMatrixRow[] = [...journalRows, ...automaticRows].map((row) => ({
    id: row.series.id,
    label: row.series.label,
    grain: "day",
    lagLabel: row.label,
    relations: dailyOutcomes.map((outcome) => {
      const relation = calculateMatrixRelation(row.series, outcome, row.lagDays);
      return redundant(row.series.id, outcome.id) ? { ...relation, coefficient: null, effect: null, strength: "hidden" as const, stable: false, excluded: true } : removeNegligibleEffect(relation);
    }),
  }));

  const datesByWeek = new Map<string, Set<string>>();
  for (const day of health) {
    const week = weekStart(day.metric_date);
    datesByWeek.set(week, new Set([...(datesByWeek.get(week) ?? []), day.metric_date]));
  }
  const healthWeeks = [...datesByWeek].filter(([, dates]) => dates.size === 7).map(([week]) => week).sort();
  const completeHealthWeeks = new Set(healthWeeks);
  const weeklyOutcomes = dailyOutcomes.map((series) => ({ ...series, points: aggregateWeekly(series.points, "mean", completeHealthWeeks, 4) }));
  const runsByWeek = new Map<string, number>();
  for (const exercise of input.exercises) {
    if (!exercise.civil_date || !exerciseType(exercise.payload)?.toUpperCase().includes("RUN")) continue;
    const week = weekStart(exercise.civil_date);
    runsByWeek.set(week, (runsByWeek.get(week) ?? 0) + 1);
  }
  const weeklyPredictors: MatrixSeries[] = [
    { id: "runs_week", label: "Runs per week", unit: "runs", kind: "numeric", points: healthWeeks.map((date) => ({ date, value: runsByWeek.get(date) ?? 0 })) },
    ...[
      healthSeries(health, "vigorous_week", "Vigorous effort per week", "min", "vigorous_zone_minutes"),
      healthSeries(health, "active_week", "Active time per week", "min", "active_minutes"),
      healthSeries(health, "exercise_week", "Exercise per week", "min", "exercise_minutes"),
      healthSeries(health, "zone_week", "Cardio zones per week", "min", "zone_minutes"),
    ].map((series) => ({ ...series, points: aggregateWeekly(series.points, "sum", completeHealthWeeks, 7) })),
  ];
  const weeklyRows: LabMatrixRow[] = weeklyPredictors.map((series) => ({
    id: series.id,
    label: series.label,
    grain: "week",
    lagLabel: "same week",
    relations: weeklyOutcomes.map((outcome) => removeNegligibleEffect(calculateMatrixRelation(series, outcome))),
  }));
  const rows = [...dailyRows, ...weeklyRows];
  const adjustedRelations = adjustMatrixRelations(rows.flatMap((row) => row.relations));
  let relationIndex = 0;
  const adjustedRows = rows.map((row) => ({
    ...row,
    relations: row.relations.map(() => deprioritizeObviousRelation(removeNegligibleEffect(adjustedRelations[relationIndex++]))),
  }));
  const topRelations = adjustedRows.flatMap((row) => row.relations).filter((relation) => !relation.excluded && relation.coefficient !== null && relation.strength !== "hidden")
    .sort((a, b) => b.relevance - a.relevance || Math.abs(b.coefficient ?? 0) - Math.abs(a.coefficient ?? 0) || b.effectiveSampleSize - a.effectiveSampleSize)
    .slice(0, 8);
  return {
    outcomes: dailyOutcomes.map(({ id, label, unit }) => ({ id, label, unit })),
    rows: adjustedRows,
    topRelations,
  };
}

function joinObservations(health: HealthDay[], scores: ScoreDay[], calendars: CalendarDay[], checkins: DailyCheckin[]) {
  const healthByDate = new Map(health.map((row) => [row.metric_date, row]));
  const calendarByDate = new Map(calendars.map((row) => [row.metric_date, row]));
  const checkinByDate = new Map(checkins.map((row) => [row.checkin_date, row]));
  const scoresByDate = new Map<string, Partial<Record<ScoreDay["kind"], number | null>>>();
  for (const score of scores) scoresByDate.set(score.score_date, { ...(scoresByDate.get(score.score_date) ?? {}), [score.kind]: toNumber(score.score) });
  const dates = [...new Set([...healthByDate.keys(), ...calendarByDate.keys(), ...checkinByDate.keys()])].sort();
  return dates.map((date): LabObservation => {
    const day = healthByDate.get(date);
    const calendar = calendarByDate.get(date);
    const checkin = checkinByDate.get(date);
    const dayScores = scoresByDate.get(date);
    return {
      date,
      sleepMinutes: toNumber(day?.sleep_minutes),
      sleepEfficiency: toNumber(day?.sleep_efficiency),
      sleepRegularity: toNumber(day?.sleep_regularity),
      sleepDebtMinutes: toNumber(day?.cumulative_sleep_debt_minutes),
      hrv: toNumber(day?.hrv_ms),
      restingHeartRate: toNumber(day?.resting_heart_rate),
      recoveryScore: toNumber(dayScores?.recovery),
      effortScore: toNumber(dayScores?.effort),
      steps: toNumber(day?.steps),
      zoneMinutes: toNumber(day?.zone_minutes),
      deepWorkMinutes: toNumber(checkin?.deep_work_minutes_override ?? calendar?.deep_work_minutes),
      energy: toNumber(checkin?.energy),
      focus: toNumber(checkin?.focus),
      stress: toNumber(checkin?.stress),
      mood: toNumber(checkin?.mood),
      soreness: toNumber(checkin?.soreness),
      caffeine: toNumber(checkin?.caffeine_servings),
      alcohol: toNumber(checkin?.alcohol_servings),
      lateMeal: checkin?.late_meal ?? null,
      illness: checkin?.illness ?? null,
    };
  });
}

function previewData() {
  const today = new Date();
  const health: HealthDay[] = [];
  const scores: ScoreDay[] = [];
  const calendars: CalendarDay[] = [];
  const checkins: DailyCheckin[] = [];
  const exercises: ExerciseRecord[] = [];
  for (let index = 0; index < 210; index += 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - (209 - index));
    const dateString = date.toISOString().slice(0, 10);
    const rhythm = Math.sin(index * 1.73) * 24 + Math.cos(index / 7) * 11;
    const sleep = Math.round(470 + rhythm);
    const longSleep = sleep >= 480;
    const deepWork = Math.max(25, Math.round((longSleep ? 236 : 104) + Math.sin(index / 2) * 28 + (index % 5) * 4));
    const active = 42 + (index % 5) * 9;
    const vigorous = 4 + (index % 4) * 5;
    const previousVigorous = 4 + ((index + 3) % 4) * 5;
    const previewWeek = Math.floor(index / 7) % 3;
    health.push({ metric_date: dateString, sleep_minutes: sleep, sleep_efficiency: 89 + Math.sin(index / 4) * 4, sleep_regularity: 78 + Math.cos(index / 6) * 9, cumulative_sleep_debt_minutes: Math.max(0, 500 - sleep), hrv_ms: 44 + previousVigorous * .32 + previewWeek * .6 + Math.sin(index / 5), resting_heart_rate: 64 - previousVigorous * .16 - previewWeek * .8 + Math.sin(index / 5) * .5, steps: 7_200 + (index % 6) * 720, zone_minutes: 18 + (index % 5) * 8, bedtime: new Date(`${dateString}T22:${String(5 + index % 45).padStart(2, "0")}:00+02:00`).toISOString(), sleep_deep_minutes: sleep * .19, sleep_rem_minutes: sleep * .23, respiratory_rate: 14.2 + Math.sin(index / 9) * .6, oxygen_saturation: 96.4 + Math.cos(index / 8) * .7, skin_temperature_delta: Math.sin(index / 11) * .25, vigorous_zone_minutes: vigorous, active_minutes: active, exercise_minutes: index % 3 === 0 ? 42 : 0 });
    if (index % 7 === 1 || (previewWeek > 0 && index % 7 === 5) || (previewWeek === 2 && index % 7 === 3)) exercises.push({ civil_date: dateString, payload: { exercise: { exerciseType: "RUNNING" } } });
    scores.push(
      { score_date: dateString, kind: "sleep", score: Math.round(72 + (sleep - 450) / 5) },
      { score_date: dateString, kind: "recovery", score: Math.round(66 + (sleep - 450) / 4 + Math.sin(index / 5) * 5) },
      { score_date: dateString, kind: "effort", score: 50 + (index % 5) * 6 },
    );
    calendars.push({ metric_date: dateString, deep_work_minutes: deepWork, deep_work_event_count: deepWork ? 2 : 0, total_scheduled_minutes: deepWork + 210, synced_at: new Date().toISOString() });
    const rating = (value: number) => Math.max(1, Math.min(5, Math.round(value)));
    checkins.push({
      checkin_date: dateString,
      energy: rating(3.2 + (sleep - 470) / 48 + Math.cos(index * .73) * .7),
      focus: rating(3.3 + (sleep - 470) / 42 + Math.sin(index * .81) * .8),
      stress: index % 8 === 0 ? 4 : rating(2.3 + Math.cos(index * .57) * .7),
      mood: rating(3.4 + (sleep - 470) / 60 + Math.sin(index * .49) * .6),
      soreness: 2,
      caffeine_servings: index % 4 === 0 ? 2 : index % 3 === 0 ? 1 : 0,
      alcohol_servings: 0,
      late_meal: index % 9 === 0,
      illness: false,
      deep_work_minutes_override: null,
    });
  }
  const variables = defaultJournalVariables.map((variable, index): JournalVariable => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name: variable.name, variableType: variable.variableType, unit: variable.unit, options: [...variable.options], position: index, isActive: true }));
  const yesterday = addDays(dateInTimezone("Europe/Paris"), -1);
  const entry = (name: string, value: JournalEntry["value"]): JournalEntry => ({ variableId: variables.find((variable) => variable.name === name)?.id as string, entryDate: yesterday, value });
  const journal = { variables, entries: [entry("Alcohol", 0), entry("Deep Work", 165), entry("Bedtime", "22:35")] };
  return { health, scores, calendars, checkins, exercises, journal };
}

function buildSnapshot(input: {
  user: SomaUser;
  timeZone: string;
  health: HealthDay[];
  scores: ScoreDay[];
  calendars: CalendarDay[];
  checkins: DailyCheckin[];
  exercises: ExerciseRecord[];
  journal: { variables: JournalVariable[]; entries: JournalEntry[] };
  narrative: { headline: string; summary: string; highlights: unknown; source_facts: unknown; model: string; generated_at: string } | null;
  allowNarrativeRefresh?: boolean;
  connections: Array<{ provider: string; status: string; last_synced_at: string | null }>;
}) {
  const observations = joinObservations(input.health, input.scores, input.calendars, input.checkins);
  const analysis = analyzePersonalLab(observations);
  const todayDate = dateInTimezone(input.timeZone);
  const entryDate = addDays(todayDate, -1);
  const todayObservation = observations.find((day) => day.date === todayDate);
  const todayCalendar = input.calendars.find((day) => day.metric_date === todayDate);
  const checkin = input.checkins.find((day) => day.checkin_date === entryDate) ?? null;
  const matrix = buildCorrelationMatrix({ health: input.health, observations, variables: input.journal.variables, entries: input.journal.entries, exercises: input.exercises, timeZone: input.timeZone });
  const highlights = Array.isArray(input.narrative?.highlights) ? input.narrative.highlights.filter((value): value is string => typeof value === "string") : [];
  const lead = matrix.topRelations[0];
  const sourceLead = Array.isArray(input.narrative?.source_facts) && typeof input.narrative.source_facts[0] === "object" && input.narrative.source_facts[0] !== null
    ? input.narrative.source_facts[0] as Record<string, unknown>
    : null;
  const narrativeMatchesLead = Boolean(lead && sourceLead
    && sourceLead.predictor === lead.predictorLabel
    && sourceLead.outcome === lead.outcomeLabel
    && sourceLead.effect === lead.effect);
  const aiNarrative = input.narrative && narrativeMatchesLead ? { headline: input.narrative.headline, summary: input.narrative.summary, highlights, model: input.narrative.model, generatedAt: input.narrative.generated_at } : null;
  const connection = (provider: string) => input.connections.find((item) => item.provider === provider);
  const healthConnection = connection("google_health");
  const calendarConnection = connection("google_calendar");
  return {
    todayDate,
    dateLabel: new Intl.DateTimeFormat("en-US", { timeZone: input.timeZone, weekday: "long", month: "long", day: "numeric" }).format(new Date()),
    greetingName: input.user.displayName,
    checkin,
    journal: { entryDate, variables: input.journal.variables, entries: input.journal.entries.filter((entry) => entry.entryDate === entryDate) },
    today: {
      sleepMinutes: todayObservation?.sleepMinutes ?? null,
      recoveryScore: todayObservation?.recoveryScore ?? null,
      deepWorkMinutes: todayObservation?.deepWorkMinutes ?? null,
      calendarDeepWorkMinutes: todayCalendar?.deep_work_minutes ?? null,
      deepWorkSource: checkin?.deep_work_minutes_override !== null && checkin?.deep_work_minutes_override !== undefined ? "corrected" as const : todayCalendar ? "calendar" as const : "missing" as const,
      focus: todayObservation?.focus ?? null,
      energy: todayObservation?.energy ?? null,
    },
    featured: analysis.discoveries[0] ?? null,
    discoveries: analysis.discoveries,
    testedCount: analysis.testedCount,
    eligibleCount: analysis.eligibleCount,
    aiNarrative,
    needsNarrativeRefresh: Boolean(input.allowNarrativeRefresh !== false && matrix.topRelations.length && (!aiNarrative || Date.now() - new Date(aiNarrative.generatedAt).getTime() > 24 * 60 * 60_000)),
    matrix,
    coverage: {
      healthDays: input.health.length,
      calendarDays: input.calendars.filter((day) => day.deep_work_minutes > 0).length,
      checkinDays: input.checkins.length,
      journalDays: new Set(input.journal.entries.map((entry) => entry.entryDate)).size,
      pairedDeepWorkDays: observations.filter((day) => day.sleepMinutes !== null && day.deepWorkMinutes !== null).length,
      rangeDays: observations.length,
    },
    connections: {
      health: { connected: healthConnection?.status === "connected", lastSyncedAt: healthConnection?.last_synced_at ?? null },
      calendar: { connected: calendarConnection?.status === "connected", lastSyncedAt: calendarConnection?.last_synced_at ?? null },
    },
  } satisfies PersonalLabSnapshot;
}

export async function getPersonalLabSnapshot(user: SomaUser): Promise<PersonalLabSnapshot> {
  if (isLocalPreviewMode()) {
    const preview = previewData();
    return buildSnapshot({ user, timeZone: "Europe/Paris", ...preview, narrative: null, allowNarrativeRefresh: false, connections: [
      { provider: "google_health", status: "connected", last_synced_at: new Date().toISOString() },
      { provider: "google_calendar", status: "connected", last_synced_at: new Date().toISOString() },
    ] });
  }
  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle();
  if (profileError) throw new Error("Your Personal Lab profile could not be loaded.");
  const analysisStart = new Date(Date.now() - 730 * 86_400_000).toISOString().slice(0, 10);
  const [healthResult, scoresResult, calendarResult, checkinResult, connectionResult, exerciseResult, narrativeResult, journal] = await Promise.all([
    admin.from("daily_health_metrics").select("metric_date,sleep_minutes,sleep_efficiency,sleep_regularity,cumulative_sleep_debt_minutes,hrv_ms,resting_heart_rate,steps,zone_minutes,bedtime,sleep_deep_minutes,sleep_rem_minutes,respiratory_rate,oxygen_saturation,skin_temperature_delta,vigorous_zone_minutes,active_minutes,exercise_minutes,data_quality").eq("user_id", user.id).gte("metric_date", analysisStart).order("metric_date", { ascending: false }).limit(730),
    admin.from("daily_scores").select("score_date,kind,score").eq("user_id", user.id).gte("score_date", analysisStart).order("score_date", { ascending: false }).limit(2190),
    admin.from("daily_calendar_metrics").select("metric_date,deep_work_minutes,deep_work_event_count,total_scheduled_minutes,synced_at").eq("user_id", user.id).gte("metric_date", analysisStart).order("metric_date", { ascending: false }).limit(730),
    admin.from("daily_checkins").select("checkin_date,energy,focus,stress,mood,soreness,caffeine_servings,alcohol_servings,late_meal,illness,deep_work_minutes_override").eq("user_id", user.id).gte("checkin_date", analysisStart).order("checkin_date", { ascending: false }).limit(730),
    admin.from("provider_connections").select("provider,status,last_synced_at").eq("user_id", user.id).in("provider", ["google_health", "google_calendar"]),
    admin.from("health_records").select("civil_date,payload").eq("user_id", user.id).eq("data_type", "exercise").gte("civil_date", analysisStart).order("civil_date", { ascending: false }).limit(1000),
    admin.from("lab_narratives").select("headline,summary,highlights,source_facts,model,generated_at").eq("user_id", user.id).maybeSingle(),
    loadJournalData(user.id, { from: analysisStart }),
  ]);
  const failed = [healthResult, scoresResult, calendarResult, checkinResult, connectionResult, exerciseResult, narrativeResult].find((result) => result.error);
  if (failed?.error) throw new Error("Your Personal Lab is temporarily unavailable.");
  return buildSnapshot({
    user,
    timeZone: profile?.timezone ?? "Europe/Paris",
    health: (healthResult.data ?? []) as HealthDay[],
    scores: (scoresResult.data ?? []) as ScoreDay[],
    calendars: (calendarResult.data ?? []) as CalendarDay[],
    checkins: (checkinResult.data ?? []).map((row) => ({ ...row, caffeine_servings: toNumber(row.caffeine_servings), alcohol_servings: toNumber(row.alcohol_servings) })) as DailyCheckin[],
    exercises: (exerciseResult.data ?? []) as ExerciseRecord[],
    journal,
    narrative: narrativeResult.data,
    connections: connectionResult.data ?? [],
  });
}
