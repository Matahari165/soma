import type { ArrivalActivity } from "@/domain/lab/arrival-message";
import type { JournalDay, JournalEntry, JournalVariable } from "@/domain/lab/journal";
import type { AnalysisPeriod, MatrixRelation } from "@/domain/lab/matrix";
import type { LabMetricDefinition, MetricRole } from "@/domain/lab/metrics";
import type { supplementDefinitionToView, supplementEntryToView } from "@/domain/supplements";
import type { SomaUser } from "@/lib/auth";
import type { CalendarDay, DailyCheckin, HealthDay, PersonalLabHistoryPoint, ScoreDay } from "./personal-lab-today";

export type LabMatrixRow = {
  id: string;
  label: string;
  emoji: string | null;
  grain: "day";
  timeScale: "acute";
  period: AnalysisPeriod;
  lagLabel: string;
  relations: MatrixRelation[];
};

export type LabMetricCoverage = {
  id: string;
  label: string;
  recordedDays: number;
  requiredDays: number;
  sources: Array<{ source: string; days: number }>;
};

export type PersonalLabSnapshot = {
  todayDate: string;
  overnightFingerprint: string | null;
  dateLabel: string;
  greetingName: string;
  checkin: DailyCheckin | null;
  journal: {
    variables: JournalVariable[];
    entries: JournalEntry[];
    days: JournalDay[];
    achievements: import("@/domain/lab/journal-achievement").JournalAchievement[];
  };
  today: {
    sleepMinutes: number | null;
    sleepRegularity: number | null;
    recoveryScore: number | null;
    effortScore: number | null;
    effortCoverage?: number | null;
    caloriesKcal: number | null;
    calorieTarget?: number | null;
    averageSleepMinutes: number | null;
    averageSleepRegularity: number | null;
    averageRecoveryScore: number | null;
    averageEffortScore: number | null;
    averageCaloriesKcal: number | null;
    history: PersonalLabHistoryPoint[];
    deepWorkMinutes: number | null;
    calendarDeepWorkMinutes: number | null;
    deepWorkSource: "calendar" | "corrected" | "missing";
    focus: number | null;
    energy: number | null;
    activity: ArrivalActivity | null;
  };
  metricRegistry: Array<LabMetricDefinition & { role: MetricRole; recordedDays: number; received: boolean; sources: Array<{ source: string; days: number }> }>;
  matrix: {
    analysisEndDate: string;
    outcomes: Array<{ id: string; label: string; unit: string; direction: "higher" | "lower" | "target" }>;
    rows: LabMatrixRow[];
    periods: AnalysisPeriod[];
    meaningfulRelations: MatrixRelation[];
    topRelations: MatrixRelation[];
    acuteHighlights: MatrixRelation[];
    chronicHighlights: MatrixRelation[];
    coverageByMetric: LabMetricCoverage[];
    collectionProgress: LabMetricCoverage[];
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

export type PersonalLabSupplements = {
  definitions: Array<ReturnType<typeof supplementDefinitionToView>>;
  entries: Array<ReturnType<typeof supplementEntryToView>>;
  error: string | null;
};

export type PersonalLabToday = Pick<PersonalLabSnapshot["today"], "sleepMinutes" | "sleepRegularity" | "recoveryScore" | "effortScore" | "effortCoverage" | "calorieTarget" | "averageSleepMinutes" | "averageSleepRegularity" | "averageRecoveryScore" | "averageEffortScore"> & { overnightFingerprint: string | null };

export type PersonalLabOverview = Pick<PersonalLabSnapshot, "todayDate" | "overnightFingerprint" | "today"> & {
  greetingName: string;
  timeZone: string;
};

export type PersonalLabJournal = Pick<PersonalLabSnapshot, "todayDate" | "journal"> & { supplements: PersonalLabSupplements };

export type PersonalLabStream = {
  overview: Promise<PersonalLabOverview>;
  journal: Promise<PersonalLabJournal>;
  analysis: Promise<PersonalLabSnapshot> | null;
};

export type PersonalLabJournalData = {
  variables: JournalVariable[];
  entries: JournalEntry[];
  days: JournalDay[];
};

export type PersonalLabConnection = {
  provider: string;
  status: string;
  last_synced_at: string | null;
};

export type PersonalLabCoreData = {
  timeZone: string;
  health: HealthDay[];
  scores: ScoreDay[];
  calendars: CalendarDay[];
  checkins: DailyCheckin[];
  connections: PersonalLabConnection[];
};

export type PersonalLabSnapshotInput = {
  user: SomaUser;
  timeZone: string;
  health: HealthDay[];
  scores: ScoreDay[];
  calendars: CalendarDay[];
  checkins: DailyCheckin[];
  journal: PersonalLabJournalData;
  connections: PersonalLabConnection[];
};
