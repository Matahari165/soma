import { analyzePersonalLab, type LabObservation, type LabDiscovery } from "@/domain/lab/insights";
import type { SomaUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
};

type ScoreDay = { score_date: string; kind: "sleep" | "recovery" | "effort"; score: number | null };

export type PersonalLabSnapshot = {
  todayDate: string;
  dateLabel: string;
  greetingName: string;
  checkin: DailyCheckin | null;
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
  coverage: {
    healthDays: number;
    calendarDays: number;
    checkinDays: number;
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
  for (let index = 0; index < 84; index += 1) {
    const date = new Date(today);
    date.setDate(date.getDate() - (83 - index));
    const dateString = date.toISOString().slice(0, 10);
    const rhythm = Math.sin(index * 1.73) * 24 + Math.cos(index / 7) * 11;
    const sleep = Math.round(470 + rhythm);
    const longSleep = sleep >= 480;
    const deepWork = Math.max(25, Math.round((longSleep ? 236 : 104) + Math.sin(index / 2) * 28 + (index % 5) * 4));
    health.push({ metric_date: dateString, sleep_minutes: sleep, sleep_efficiency: 89 + Math.sin(index / 4) * 4, sleep_regularity: 78 + Math.cos(index / 6) * 9, cumulative_sleep_debt_minutes: Math.max(0, 500 - sleep), hrv_ms: 48 + Math.sin(index / 5) * 7, resting_heart_rate: 60 - Math.sin(index / 5) * 3, steps: 7_200 + (index % 6) * 720, zone_minutes: 18 + (index % 5) * 8 });
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
  return { health, scores, calendars, checkins };
}

function buildSnapshot(input: {
  user: SomaUser;
  timeZone: string;
  health: HealthDay[];
  scores: ScoreDay[];
  calendars: CalendarDay[];
  checkins: DailyCheckin[];
  connections: Array<{ provider: string; status: string; last_synced_at: string | null }>;
}) {
  const observations = joinObservations(input.health, input.scores, input.calendars, input.checkins);
  const analysis = analyzePersonalLab(observations);
  const todayDate = dateInTimezone(input.timeZone);
  const todayObservation = observations.find((day) => day.date === todayDate);
  const todayCalendar = input.calendars.find((day) => day.metric_date === todayDate);
  const checkin = input.checkins.find((day) => day.checkin_date === todayDate) ?? null;
  const connection = (provider: string) => input.connections.find((item) => item.provider === provider);
  const healthConnection = connection("google_health");
  const calendarConnection = connection("google_calendar");
  return {
    todayDate,
    dateLabel: new Intl.DateTimeFormat("en-US", { timeZone: input.timeZone, weekday: "long", month: "long", day: "numeric" }).format(new Date()),
    greetingName: input.user.displayName,
    checkin,
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
    coverage: {
      healthDays: input.health.length,
      calendarDays: input.calendars.filter((day) => day.deep_work_minutes > 0).length,
      checkinDays: input.checkins.length,
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
    return buildSnapshot({ user, timeZone: "Europe/Paris", ...preview, connections: [
      { provider: "google_health", status: "connected", last_synced_at: new Date().toISOString() },
      { provider: "google_calendar", status: "connected", last_synced_at: new Date().toISOString() },
    ] });
  }
  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle();
  if (profileError) throw new Error("Your Personal Lab profile could not be loaded.");
  const [healthResult, scoresResult, calendarResult, checkinResult, connectionResult] = await Promise.all([
    admin.from("daily_health_metrics").select("metric_date,sleep_minutes,sleep_efficiency,sleep_regularity,cumulative_sleep_debt_minutes,hrv_ms,resting_heart_rate,steps,zone_minutes").eq("user_id", user.id).order("metric_date", { ascending: false }).limit(120),
    admin.from("daily_scores").select("score_date,kind,score").eq("user_id", user.id).order("score_date", { ascending: false }).limit(360),
    admin.from("daily_calendar_metrics").select("metric_date,deep_work_minutes,deep_work_event_count,total_scheduled_minutes,synced_at").eq("user_id", user.id).order("metric_date", { ascending: false }).limit(120),
    admin.from("daily_checkins").select("checkin_date,energy,focus,stress,mood,soreness,caffeine_servings,alcohol_servings,late_meal,illness,deep_work_minutes_override").eq("user_id", user.id).order("checkin_date", { ascending: false }).limit(120),
    admin.from("provider_connections").select("provider,status,last_synced_at").eq("user_id", user.id).in("provider", ["google_health", "google_calendar"]),
  ]);
  const failed = [healthResult, scoresResult, calendarResult, checkinResult, connectionResult].find((result) => result.error);
  if (failed?.error) throw new Error("Your Personal Lab is temporarily unavailable.");
  return buildSnapshot({
    user,
    timeZone: profile?.timezone ?? "Europe/Paris",
    health: (healthResult.data ?? []) as HealthDay[],
    scores: (scoresResult.data ?? []) as ScoreDay[],
    calendars: (calendarResult.data ?? []) as CalendarDay[],
    checkins: (checkinResult.data ?? []).map((row) => ({ ...row, caffeine_servings: toNumber(row.caffeine_servings), alcohol_servings: toNumber(row.alcohol_servings) })) as DailyCheckin[],
    connections: connectionResult.data ?? [],
  });
}
