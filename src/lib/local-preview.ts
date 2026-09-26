import { previewActiveHours } from "./preview-active-hours";
import { calculateDailyStrain } from "@/domain/scores/effort";
import type { DashboardSnapshot } from "@/domain/health";
import { SOMA_LOCALE } from "@/lib/locale";

export const previewUser = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "preview@soma.local",
  displayName: "Jérémy",
};

// Synthetic v3 load retained for nutrition, independently of goal completion.
export const previewActivityLoadHistory = [23, 22, 22, 22, 22, 23, 29];

const demoNow = new Date();
const demoCurrentStrain = calculateDailyStrain({ steps: 8_900, zoneMinutes: 33, strengthMinutes: 10, activeHoursProgress: previewActiveHours(demoNow.toISOString().slice(0, 10), "Europe/Paris", demoNow).progress }).score;

export const previewScoreHistory = {
  sleep: [72, 76, 74, 81, 79, 84, 93],
  recovery: [64, 68, 61, 73, 76, 78, 82],
  // Daily Strain preview uses the same movement intervals as the detail page.
  effort: [78, 77, 77, 77, 78, 78, ...(demoCurrentStrain === null ? [] : [demoCurrentStrain])],
} satisfies Record<"sleep" | "recovery" | "effort", number[]>;

export const previewDashboard: DashboardSnapshot = {
  dataDate: new Date().toISOString().slice(0, 10),
  isCurrentDay: true,
  dateLabel: new Intl.DateTimeFormat(SOMA_LOCALE, { weekday: "long", month: "long", day: "numeric" }).format(new Date()),
  greeting: "Bonjour",
  greetingName: "Jérémy",
  scores: [
    { kind: "sleep", score: previewScoreHistory.sleep.at(-1) ?? null, status: "restorative", label: "Sommeil", value: "7 h 48", target: "sur 8 h 10 nécessaires", delta: "84 % de régularité", detail: "Durée, efficacité et régularité sont combinées de manière transparente.", action: "Garde ce soir une heure de sommeil proche de ton rythme établi.", href: "/sleep", freshness: { measuredAt: new Date().toISOString(), importedAt: new Date().toISOString(), state: "current", coverage: 1 }, history: previewScoreHistory.sleep },
    { kind: "recovery", score: previewScoreHistory.recovery.at(-1) ?? null, status: "restorative", label: "Récupération", value: "Au-dessus de ta plage récente", target: "VFC 57 ms · FC repos 57 bpm", delta: "Utilise ta propre plage récente", detail: "La VFC, la fréquence cardiaque au repos et le sommeil contribuent au score du jour.", action: "Lis ce signal avec ton ressenti du jour.", href: "/recovery", freshness: { measuredAt: new Date().toISOString(), importedAt: new Date().toISOString(), state: "current", coverage: 1 }, history: previewScoreHistory.recovery },
    { kind: "effort", score: demoCurrentStrain, status: "steady", label: "Strain", value: demoCurrentStrain === null ? "Données incomplètes" : `${demoCurrentStrain}/100 accomplis`, target: "Objectifs quotidiens", delta: "8 900 pas · 33 min en zone", detail: "100 correspond aux quatre objectifs quotidiens atteints.", action: "Interprète ce score avec ton niveau de récupération.", href: "/strain", freshness: { measuredAt: new Date().toISOString(), importedAt: new Date().toISOString(), state: "current", coverage: 1 }, history: previewScoreHistory.effort },
  ],
  summary: "Le sommeil et la récupération sont au-dessus de ta plage récente. Le score Strain dépend des quatre objectifs quotidiens.",
  insights: [
    { id: "preview-insight-1", category: "positive", title: "La régularité du sommeil se renforce", description: "Tes quatre dernières nuits complètes sont restées plus proches de ton rythme habituel.", evidence: "Démo · 7 nuits complètes" },
    { id: "preview-insight-2", category: "information", title: "La récupération évolue avec le sommeil", description: "Les deux signaux se sont améliorés sur les derniers jours complets.", evidence: "Démo · 7 nuits complètes" },
  ],
  weeklyEffort: { current: 277, days: previewScoreHistory.effort.map((value, index) => ({ label: ["M", "T", "W", "T", "F", "S", "S"][index], value, today: index === 6 })) },
  recoveryTrend: [64, 68, 61, 73, 76, 78, 82].map((value, index) => ({ label: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"][index], value })),
  sleepRegularity: { bedtime: "22:52", wakeTime: "07:04", consistency: 84 },
};

export const previewExercises = [
  { id: "10000000-0000-4000-8000-000000000001", name: "Squat barre", muscle_groups: ["Quadriceps", "Fessiers"], equipment: ["Barre"], instructions: ["Gaine le corps", "Descends sous contrôle", "Pousse dans le sol"] },
  { id: "10000000-0000-4000-8000-000000000002", name: "Développé couché", muscle_groups: ["Pectoraux", "Triceps"], equipment: ["Barre", "Banc"], instructions: ["Place tes épaules", "Descends sous contrôle", "Pousse régulièrement"] },
  { id: "10000000-0000-4000-8000-000000000003", name: "Soulevé de terre roumain", muscle_groups: ["Ischio-jambiers", "Fessiers"], equipment: ["Barre"], instructions: ["Bascule les hanches", "Garde la barre près du corps", "Redresse-toi"] },
];

export const previewPrograms = [{ id: "20000000-0000-4000-8000-000000000001", name: "Corps entier A", description: "Séance de renforcement équilibrée", exercises: [{ exercise: previewExercises[0], sets: 3, repsMin: 8, repsMax: 10, restSeconds: 90 }] }];

export const previewProfile = { displayName: "Jérémy", dateOfBirth: "1998-06-12", heightCm: 178, weightKg: 74, primaryGoal: "build_muscle", baseSleepTargetMinutes: 510, usualWakeTime: "07:00", importRange: "all_history" as const };
