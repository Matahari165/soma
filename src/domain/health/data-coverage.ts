import { healthRecordCivilDate } from "./aggregate";

export type ImportedHealthDate = {
  data_type: string;
  civil_date: string | null;
  start_time: string | null;
  end_time: string | null;
  measured_at: string | null;
};

export type UsedHealthDate = {
  metric_date: string;
  sleep_minutes: number | null;
};

export type HealthDataCoverage = {
  status: "complete" | "incomplete" | "empty" | "limited";
  importedDays: number;
  usedDays: number;
  importedNights: number;
  usedNights: number;
  missingDays: number;
  missingNights: number;
  startDate: string | null;
  endDate: string | null;
};

export function calculateHealthDataCoverage(input: {
  imported: ImportedHealthDate[];
  used: UsedHealthDate[];
  timeZone: string;
  limited?: boolean;
}): HealthDataCoverage {
  const importedDays = new Set<string>();
  const importedNights = new Set<string>();
  for (const record of input.imported) {
    const date = healthRecordCivilDate(record, input.timeZone);
    if (!date) continue;
    importedDays.add(date);
    if (record.data_type === "sleep") importedNights.add(date);
  }

  const metricDays = new Set(input.used.map((row) => row.metric_date));
  const sleepDays = new Set(input.used.filter((row) => row.sleep_minutes !== null).map((row) => row.metric_date));
  const usedDays = [...importedDays].filter((date) => metricDays.has(date)).length;
  const usedNights = [...importedNights].filter((date) => sleepDays.has(date)).length;
  const dates = [...importedDays].sort();
  const missingDays = importedDays.size - usedDays;
  const missingNights = importedNights.size - usedNights;
  const status: HealthDataCoverage["status"] = input.limited
    ? "limited"
    : importedDays.size === 0
      ? "empty"
      : missingDays > 0 || missingNights > 0
        ? "incomplete"
        : "complete";

  return {
    status,
    importedDays: importedDays.size,
    usedDays,
    importedNights: importedNights.size,
    usedNights,
    missingDays,
    missingNights,
    startDate: dates[0] ?? null,
    endDate: dates.at(-1) ?? null,
  };
}
