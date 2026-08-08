import type { DashboardSnapshot } from "@/domain/health";
import type { DetailPoint } from "@/services/details";

export const previewUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "preview@soma.local",
  displayName: "Jeremy",
};

const previewDates = Array.from({ length: 7 }, (_, index) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - (6 - index));
  return date.toISOString().slice(0, 10);
});

export const previewDetails: Record<"sleep" | "recovery" | "effort", DetailPoint[]> = {
  sleep: [72, 76, 74, 81, 79, 84, 86].map((score, index) => ({ date: previewDates[index], score, primary: [421, 438, 429, 452, 447, 461, 468][index], secondary: [68, 71, 70, 78, 76, 82, 84][index] })),
  recovery: [64, 68, 61, 73, 76, 78, 82].map((score, index) => ({ date: previewDates[index], score, primary: [43, 46, 41, 49, 52, 54, 57][index], secondary: [62, 61, 64, 60, 59, 58, 57][index] })),
  effort: [42, 68, 35, 72, 54, 81, 63].map((score, index) => ({ date: previewDates[index], score, primary: [6200, 9400, 5100, 10300, 7600, 11800, 8900][index], secondary: [18, 36, 12, 42, 27, 51, 33][index] })),
};

export const previewDashboard: DashboardSnapshot = {
  dateLabel: new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date()),
  greeting: "Good morning",
  greetingName: "Jeremy",
  scores: [
    { kind: "sleep", score: 86, status: "restorative", label: "Sleep", value: "7h 48m", target: "of 8h 10m needed", delta: "84% regularity", detail: "Duration, efficiency, and regularity are combined transparently.", action: "Keep tonight close to your established sleep window.", href: "/sleep", freshness: { measuredAt: "Today, 07:12", syncedAt: "08:04", state: "fresh" }, history: [72, 76, 74, 81, 79, 84, 86] },
    { kind: "recovery", score: 82, status: "restorative", label: "Recovery", value: "Above recent range", target: "HRV 57 ms · RHR 57 bpm", delta: "Uses your own recent range", detail: "HRV, resting heart rate, and sleep support today's score.", action: "Use this signal alongside how you feel today.", href: "/recovery", freshness: { measuredAt: "Today, 07:12", syncedAt: "08:04", state: "fresh" }, history: [64, 68, 61, 73, 76, 78, 82] },
    { kind: "effort", score: 63, status: "steady", label: "Effort", value: "63 of 55–75", target: "Today's target zone", delta: "8,900 steps · 33 zone min", detail: "Completed effort stays separate from the goal-aware target.", action: "You are inside today's recommended range.", href: "/activity", freshness: { measuredAt: "Today, 13:20", syncedAt: "13:28", state: "partial" }, history: [42, 68, 35, 72, 54, 81, 63] },
  ],
  summary: "Sleep and recovery are both above your recent range. Effort is currently inside today's target, so there is no obvious need to add more load yet.",
  insights: [
    { id: "preview-insight-1", category: "positive", title: "Sleep regularity is strengthening", description: "Your last four complete nights stayed closer to your usual window.", evidence: "Demo · 7 complete nights" },
    { id: "preview-insight-2", category: "information", title: "Recovery moved with sleep", description: "Both signals improved across the latest complete days.", evidence: "Demo · association, not causation" },
  ],
  weeklyEffort: { current: 415, targetMin: 360, targetMax: 480, days: [42, 68, 35, 72, 54, 81, 63].map((value, index) => ({ label: ["M", "T", "W", "T", "F", "S", "S"][index], value, today: index === 6 })) },
  recoveryTrend: [64, 68, 61, 73, 76, 78, 82].map((value, index) => ({ label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index], value })),
  sleepRegularity: { bedtime: "10:52 PM", wakeTime: "7:04 AM", consistency: 84 },
};

export const previewCorrelations = [
  { id: "preview-correlation-1", variable_x: "sleep_regularity", variable_y: "recovery_score", coefficient: 0.62, sample_size: 28, quality_status: "moderate_evidence", lag_days: 0, explanation: "More regular sleep has moved with higher recovery in this demo history. This does not prove causation." },
  { id: "preview-correlation-2", variable_x: "zone_minutes", variable_y: "sleep_score", coefficient: -0.31, sample_size: 24, quality_status: "exploratory", lag_days: 1, explanation: "Higher late-day effort has sometimes moved with lower next-night sleep scores in this demo history." },
];

export const previewExercises = [
  { id: "10000000-0000-4000-8000-000000000001", name: "Back squat", muscle_groups: ["Quadriceps", "Glutes"], equipment: ["Barbell"], instructions: ["Brace", "Descend under control", "Drive through the floor"] },
  { id: "10000000-0000-4000-8000-000000000002", name: "Bench press", muscle_groups: ["Chest", "Triceps"], equipment: ["Barbell", "Bench"], instructions: ["Set shoulders", "Lower under control", "Press steadily"] },
  { id: "10000000-0000-4000-8000-000000000003", name: "Romanian deadlift", muscle_groups: ["Hamstrings", "Glutes"], equipment: ["Barbell"], instructions: ["Hinge at the hips", "Keep the bar close", "Stand tall"] },
];

export const previewPrograms = [{ id: "20000000-0000-4000-8000-000000000001", name: "Full Body A", description: "Balanced strength session", exercises: [{ exercise: previewExercises[0], sets: 3, repsMin: 8, repsMax: 10, restSeconds: 90 }] }];

export const previewProfile = { displayName: "Jeremy", dateOfBirth: "1998-06-12", heightCm: 178, weightKg: 74, primaryGoal: "build_muscle", baseSleepTargetMinutes: 480, usualWakeTime: "07:00", importRange: "90_days" as const };
