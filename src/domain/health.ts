export type ScoreKind = "sleep" | "recovery" | "effort";

export type ScoreStatus = "restorative" | "steady" | "building" | "limited";

export type SignalFreshness = {
  measuredAt: string | null;
  importedAt: string | null;
  state: "current" | "partial" | "stale" | "missing";
  coverage: number;
};

export type SyncPhase = "queued" | "fetching" | "materializing" | "up_to_date" | "partial" | "retrying" | "needs_reconnect" | "failed";

export type SyncStatus = {
  jobId: string;
  phase: SyncPhase;
  progress: number;
  perType: Record<string, SignalFreshness>;
  lastError: string | null;
  retryable: boolean;
};

export type DailyScore = {
  kind: ScoreKind;
  score: number | null;
  status: ScoreStatus;
  label: string;
  value: string;
  target: string;
  delta: string;
  detail: string;
  action: string;
  href: string;
  freshness: SignalFreshness;
  history: number[];
};

export type Insight = {
  id: string;
  category: "positive" | "attention" | "information";
  title: string;
  description: string;
  evidence: string;
};

export type DashboardSnapshot = {
  dataDate: string | null;
  isCurrentDay: boolean;
  dateLabel: string;
  greeting: string;
  greetingName: string;
  scores: DailyScore[];
  summary: string;
  insights: Insight[];
  weeklyEffort: {
    current: number;
    days: { label: string; value: number | null; today?: boolean }[];
  };
  recoveryTrend: { label: string; value: number | null }[];
  sleepRegularity: {
    bedtime: string;
    wakeTime: string;
    consistency: number | null;
  };
};
