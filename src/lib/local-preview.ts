import type { DashboardSnapshot } from "@/domain/health";

export const previewUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "preview@soma.local",
  displayName: "Jérémy",
};

export const previewScoreHistory = {
  sleep: [72, 76, 74, 81, 79, 84, 86],
  recovery: [64, 68, 61, 73, 76, 78, 82],
  effort: [42, 68, 35, 72, 54, 81, 63],
} satisfies Record<"sleep" | "recovery" | "effort", number[]>;

export const previewDashboard: DashboardSnapshot = {
  dataDate: new Date().toISOString().slice(0, 10),
  isCurrentDay: true,
  dateLabel: new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date()),
  greeting: "Good morning",
  greetingName: "Jérémy",
  scores: [
    { kind: "sleep", score: previewScoreHistory.sleep.at(-1) ?? null, status: "restorative", label: "Sleep", value: "7h 48m", target: "of 8h 10m needed", delta: "84% regularity", detail: "Duration, efficiency, and regularity are combined transparently.", action: "Keep tonight close to your established sleep window.", href: "/sleep", freshness: { measuredAt: new Date().toISOString(), importedAt: new Date().toISOString(), state: "current", coverage: 1 }, history: previewScoreHistory.sleep },
    { kind: "recovery", score: previewScoreHistory.recovery.at(-1) ?? null, status: "restorative", label: "Recovery", value: "Above recent range", target: "HRV 57 ms · RHR 57 bpm", delta: "Uses your own recent range", detail: "HRV, resting heart rate, and sleep support today's score.", action: "Use this signal alongside how you feel today.", href: "/recovery", freshness: { measuredAt: new Date().toISOString(), importedAt: new Date().toISOString(), state: "current", coverage: 1 }, history: previewScoreHistory.recovery },
    { kind: "effort", score: previewScoreHistory.effort.at(-1) ?? null, status: "steady", label: "Effort", value: "63/100 accomplished", target: "Today's accumulated load", delta: "8,900 steps · 33 zone min", detail: "Every additional activity adds load, with progressively smaller gains.", action: "Interpret this accomplished load alongside your recovery.", href: "/activity", freshness: { measuredAt: new Date().toISOString(), importedAt: new Date().toISOString(), state: "current", coverage: 1 }, history: previewScoreHistory.effort },
  ],
  summary: "Sleep and recovery are both above your recent range. Today's activity has accumulated 63 load points so far.",
  insights: [
    { id: "preview-insight-1", category: "positive", title: "Sleep regularity is strengthening", description: "Your last four complete nights stayed closer to your usual window.", evidence: "Demo · 7 complete nights" },
    { id: "preview-insight-2", category: "information", title: "Recovery moved with sleep", description: "Both signals improved across the latest complete days.", evidence: "Demo · 7 complete nights" },
  ],
  weeklyEffort: { current: 415, days: [42, 68, 35, 72, 54, 81, 63].map((value, index) => ({ label: ["M", "T", "W", "T", "F", "S", "S"][index], value, today: index === 6 })) },
  recoveryTrend: [64, 68, 61, 73, 76, 78, 82].map((value, index) => ({ label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][index], value })),
  sleepRegularity: { bedtime: "10:52 PM", wakeTime: "7:04 AM", consistency: 84 },
};

export const previewExercises = [
  { id: "10000000-0000-4000-8000-000000000001", name: "Back squat", muscle_groups: ["Quadriceps", "Glutes"], equipment: ["Barbell"], instructions: ["Brace", "Descend under control", "Drive through the floor"] },
  { id: "10000000-0000-4000-8000-000000000002", name: "Bench press", muscle_groups: ["Chest", "Triceps"], equipment: ["Barbell", "Bench"], instructions: ["Set shoulders", "Lower under control", "Press steadily"] },
  { id: "10000000-0000-4000-8000-000000000003", name: "Romanian deadlift", muscle_groups: ["Hamstrings", "Glutes"], equipment: ["Barbell"], instructions: ["Hinge at the hips", "Keep the bar close", "Stand tall"] },
];

export const previewPrograms = [{ id: "20000000-0000-4000-8000-000000000001", name: "Full Body A", description: "Balanced strength session", exercises: [{ exercise: previewExercises[0], sets: 3, repsMin: 8, repsMax: 10, restSeconds: 90 }] }];

export const previewProfile = { displayName: "Jérémy", dateOfBirth: "1998-06-12", heightCm: 178, weightKg: 74, primaryGoal: "build_muscle", baseSleepTargetMinutes: 510, usualWakeTime: "07:00", importRange: "all_history" as const };
