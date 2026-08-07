export type NormalizedHealthRecord = {
  data_type: string;
  civil_date: string | null;
  start_time: string | null;
  end_time: string | null;
  measured_at: string | null;
  payload: unknown;
};

export type AggregatedHealthDay = {
  metric_date: string;
  sleep_minutes: number | null;
  sleep_efficiency: number | null;
  bedtime: string | null;
  wake_time: string | null;
  hrv_ms: number | null;
  resting_heart_rate: number | null;
  respiratory_rate: number | null;
  oxygen_saturation: number | null;
  skin_temperature_delta: number | null;
  steps: number | null;
  active_energy_kcal: number | null;
  zone_minutes: number | null;
  exercise_minutes: number | null;
  data_quality: { presentTypes: string[]; recordCount: number };
  source_freshness: { latestMeasuredAt: string | null };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function findNumber(value: unknown, keys: string[]): number | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNumber(item, keys);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isObject(value)) return null;
  for (const key of keys) {
    const found = toNumber(value[key]);
    if (found !== null) return found;
  }
  for (const child of Object.values(value)) {
    const found = findNumber(child, keys);
    if (found !== null) return found;
  }
  return null;
}

function recordDate(record: NormalizedHealthRecord) {
  return record.civil_date ?? (record.end_time ?? record.start_time ?? record.measured_at)?.slice(0, 10) ?? null;
}

function minutesBetween(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const duration = (Date.parse(end) - Date.parse(start)) / 60000;
  return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function total(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

export function aggregateHealthRecords(records: NormalizedHealthRecord[]): AggregatedHealthDay[] {
  const groups = new Map<string, NormalizedHealthRecord[]>();
  for (const record of records) {
    const date = recordDate(record);
    if (!date) continue;
    groups.set(date, [...(groups.get(date) ?? []), record]);
  }

  return [...groups.entries()].sort(([first], [second]) => first.localeCompare(second)).map(([date, day]) => {
    const byType = (type: string) => day.filter((record) => record.data_type === type);
    const sleep = byType("sleep");
    const sleepMinutes = sleep.map((record) => findNumber(record.payload, ["minutesAsleep"]) ?? minutesBetween(record.start_time, record.end_time)).filter((value): value is number => value !== null);
    const timeInBed = sleep.map((record) => findNumber(record.payload, ["minutesInSleepPeriod", "timeInBedMinutes"])).filter((value): value is number => value !== null);
    const totalSleep = total(sleepMinutes);
    const totalInBed = total(timeInBed);
    const bedtime = sleep.map((record) => record.start_time).filter((value): value is string => Boolean(value)).sort().at(0) ?? null;
    const wakeTime = sleep.map((record) => record.end_time).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
    const values = (type: string, keys: string[]) => byType(type).map((record) => findNumber(record.payload, keys)).filter((value): value is number => value !== null);
    const exerciseMinutes = byType("exercise").map((record) => minutesBetween(record.start_time, record.end_time)).filter((value): value is number => value !== null);
    const latestMeasuredAt = day.map((record) => record.measured_at).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;

    return {
      metric_date: date,
      sleep_minutes: totalSleep === null ? null : Math.round(totalSleep),
      sleep_efficiency: totalSleep !== null && totalInBed ? Math.round((totalSleep / totalInBed) * 1000) / 10 : null,
      bedtime,
      wake_time: wakeTime,
      hrv_ms: average(values("daily-heart-rate-variability", ["averageHeartRateVariabilityMilliseconds"])),
      resting_heart_rate: average(values("daily-resting-heart-rate", ["beatsPerMinute", "restingHeartRate"])),
      respiratory_rate: average(values("daily-respiratory-rate", ["averageBreathsPerMinute", "breathsPerMinute", "respiratoryRate"])),
      oxygen_saturation: average(values("daily-oxygen-saturation", ["averageSaturationPercentage", "percentage", "oxygenSaturation"])),
      skin_temperature_delta: average(values("daily-sleep-temperature-derivations", ["temperatureDeltaCelsius", "deltaCelsius"])),
      steps: total(values("steps", ["count", "steps"])),
      active_energy_kcal: total(values("active-energy-burned", ["kilocalories", "kcal"])),
      zone_minutes: total(values("active-zone-minutes", ["minutes", "activeZoneMinutes"])),
      exercise_minutes: total(exerciseMinutes),
      data_quality: { presentTypes: [...new Set(day.map((record) => record.data_type))].sort(), recordCount: day.length },
      source_freshness: { latestMeasuredAt },
    };
  });
}
