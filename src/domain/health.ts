export type ScoreKind = "sleep" | "recovery" | "effort";

export type ScoreStatus = "restorative" | "steady" | "building" | "limited";

export type DataFreshness = {
  measuredAt: string;
  syncedAt: string;
  state: "fresh" | "stale" | "partial" | "missing";
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
  freshness: DataFreshness;
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
  dateLabel: string;
  greeting: string;
  greetingName: string;
  scores: DailyScore[];
  summary: string;
  insights: Insight[];
  weeklyEffort: {
    current: number;
    targetMin: number;
    targetMax: number;
    days: { label: string; value: number; today?: boolean }[];
  };
  recoveryTrend: { label: string; value: number }[];
  sleepRegularity: {
    bedtime: string;
    wakeTime: string;
    consistency: number;
  };
};
