export type NormalizedHealthRecord = {
  provider?: string;
  data_type: string;
  civil_date: string | null;
  start_time: string | null;
  end_time: string | null;
  measured_at: string | null;
  source_device?: string | null;
  recording_method?: string | null;
  payload: unknown;
};

export type AggregatedHealthDay = {
  metric_date: string;
  sleep_minutes: number | null;
  sleep_efficiency: number | null;
  sleep_latency_minutes: number | null;
  sleep_awake_minutes: number | null;
  sleep_awake_percent: number | null;
  sleep_awakenings: number | null;
  sleep_fragmentation: number | null;
  sleep_deep_minutes: number | null;
  sleep_deep_percent: number | null;
  sleep_rem_minutes: number | null;
  sleep_rem_percent: number | null;
  sleep_light_minutes: number | null;
  sleep_light_percent: number | null;
  bedtime: string | null;
  wake_time: string | null;
  hrv_ms: number | null;
  resting_heart_rate: number | null;
  respiratory_rate: number | null;
  oxygen_saturation: number | null;
  oxygen_saturation_lower: number | null;
  oxygen_saturation_upper: number | null;
  skin_temperature_delta: number | null;
  nightly_temperature_celsius: number | null;
  baseline_temperature_celsius: number | null;
  steps: number | null;
  active_energy_kcal: number | null;
  total_energy_kcal: number | null;
  zone_minutes: number | null;
  light_zone_minutes: number | null;
  moderate_zone_minutes: number | null;
  vigorous_zone_minutes: number | null;
  peak_zone_minutes: number | null;
  active_minutes: number | null;
  sedentary_minutes: number | null;
  exercise_minutes: number | null;
  distance_km: number | null;
  running_distance_km: number | null;
  running_duration_minutes: number | null;
  running_pace_seconds_per_km: number | null;
  running_average_heart_rate: number | null;
  floors: number | null;
  weight_kg: number | null;
  body_fat_percent: number | null;
  vo2_max: number | null;
  altitude_gain_m: number | null;
  height_cm: number | null;
  core_body_temperature_celsius: number | null;
  blood_glucose_mg_dl: number | null;
  data_quality: { presentTypes: string[]; recordCount: number; sourceDevices: string[]; providers: string[]; primaryWearable: string | null };
  source_freshness: { latestMeasuredAt: string | null; byType: Record<string, string | null> };
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

function findNumbers(value: unknown, keys: string[], output: number[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) findNumbers(item, keys, output);
    return output;
  }
  if (!isObject(value)) return output;
  for (const key of keys) {
    const found = toNumber(value[key]);
    if (found !== null) output.push(found);
  }
  for (const child of Object.values(value)) findNumbers(child, keys, output);
  return output;
}

function civilDateIn(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function healthRecordCivilDate(
  record: Pick<NormalizedHealthRecord, "civil_date" | "start_time" | "end_time" | "measured_at">,
  timeZone: string,
) {
  if (record.civil_date) return record.civil_date;
  const timestamp = record.end_time ?? record.start_time ?? record.measured_at;
  return timestamp ? civilDateIn(timestamp, timeZone) : null;
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

function findStrings(value: unknown, key: string, output: string[] = []) {
  if (Array.isArray(value)) {
    for (const item of value) findStrings(item, key, output);
    return output;
  }
  if (!isObject(value)) return output;
  if (typeof value[key] === "string") output.push(String(value[key]));
  for (const child of Object.values(value)) findStrings(child, key, output);
  return output;
}

function durationMinutes(value: unknown) {
  if (typeof value === "number") return value / 60;
  if (typeof value !== "string") return null;
  const match = value.match(/^(-?\d+(?:\.\d+)?)s$/);
  return match ? Number(match[1]) / 60 : toNumber(value);
}

function findStageSummary(payload: unknown, type: string) {
  const visit = (value: unknown): number[] => {
    if (Array.isArray(value)) return value.flatMap(visit);
    if (!isObject(value)) return [];
    if (String(value.type ?? "").toUpperCase() === type) {
      const minutes = toNumber(value.minutes);
      return minutes === null ? [] : [minutes];
    }
    return Object.values(value).flatMap(visit);
  };
  return total(visit(payload));
}

function findObject(value: unknown, key: string): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) { const found = findObject(item, key); if (found) return found; }
    return null;
  }
  if (!isObject(value)) return null;
  if (isObject(value[key])) return value[key] as Record<string, unknown>;
  for (const child of Object.values(value)) { const found = findObject(child, key); if (found) return found; }
  return null;
}

function directNumber(value: unknown, key: string) {
  return isObject(value) ? toNumber(value[key]) : null;
}

function exerciseMetricNumber(payload: unknown, keys: string | string[]) {
  const candidateKeys = Array.isArray(keys) ? keys : [keys];
  const exercise = findObject(payload, "exercise");
  const metricsSummary = isObject(exercise?.metricsSummary) ? exercise.metricsSummary : null;
  // Google Health returns the session total in exercise.metricsSummary. Check
  // it before the recursive fallback, because splits can contain a smaller
  // per-kilometre distance before the session summary in the payload.
  for (const key of candidateKeys) {
    const direct = directNumber(metricsSummary, key);
    if (direct !== null) return direct;
  }
  return findNumber(payload, candidateKeys);
}

function exerciseDistanceMillimeters(payload: unknown) {
  const exercise = findObject(payload, "exercise");
  const metricsSummary = isObject(exercise?.metricsSummary) ? exercise.metricsSummary : null;
  const sessionDistance = directNumber(metricsSummary, "distanceMillimeters");
  if (sessionDistance !== null) return sessionDistance;
  const splitDistances = total(findNumbers(exercise?.splits, ["distanceMillimeters"]));
  return splitDistances ?? findNumber(payload, ["distanceMillimeters"]);
}

function awakeSegmentCount(payload: unknown) {
  const sleep = findObject(payload, "sleep");
  if (!sleep) return null;
  const stages = Array.isArray(sleep.stages) ? sleep.stages : [];
  const measuredCount = stages.filter((stage) => isObject(stage) && String(stage.type).toUpperCase() === "AWAKE").length;
  if (measuredCount) return measuredCount;
  const summary = isObject(sleep.summary) && Array.isArray(sleep.summary.stagesSummary) ? sleep.summary.stagesSummary : [];
  return summary.reduce((sum, stage) => isObject(stage) && String(stage.type).toUpperCase() === "AWAKE" ? sum + (toNumber(stage.count) ?? 0) : sum, 0) || null;
}

function zoneMinutes(records: NormalizedHealthRecord[], zone: string) {
  const values: number[] = [];
  for (const record of records) {
    const visit = (value: unknown): number[] => {
      if (Array.isArray(value)) return value.flatMap(visit);
      if (!isObject(value)) return [];
      const label = String(value.heartRateZone ?? value.heartRateZoneType ?? "").toUpperCase();
      if (label.includes(zone)) {
        const directMinutes = toNumber(value.activeZoneMinutes) ?? toNumber(value.minutes) ?? toNumber(value.durationMinutes) ?? durationMinutes(value.duration);
        if (directMinutes !== null) return [directMinutes];
      }
      return Object.values(value).flatMap(visit);
    };
    const matchedValues = visit(record.payload);
    if (matchedValues.length) {
      values.push(...matchedValues);
      continue;
    }
    const zones = findStrings(record.payload, "heartRateZone").concat(findStrings(record.payload, "heartRateZoneType"));
    const intervalMinutes = zones.some((value) => value.toUpperCase().includes(zone)) ? minutesBetween(record.start_time, record.end_time) : null;
    if (intervalMinutes !== null) values.push(intervalMinutes);
  }
  return total(values);
}

function summedNumbers(records: NormalizedHealthRecord[], keys: string[]) {
  return total(records.flatMap((record) => findNumbers(record.payload, keys)));
}

export function aggregateHealthRecords(records: NormalizedHealthRecord[], timeZone = "UTC"): AggregatedHealthDay[] {
  const groups = new Map<string, NormalizedHealthRecord[]>();
  for (const record of records) {
    const date = healthRecordCivilDate(record, timeZone);
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
    const sleepAwakeMinutes = total(sleep.map((record) => findNumber(record.payload, ["minutesAwake"])).filter((value): value is number => value !== null));
    const sleepLatencyMinutes = total(sleep.map((record) => findNumber(record.payload, ["minutesToFallAsleep"])).filter((value): value is number => value !== null));
    const stageMinutes = (type: string) => total(sleep.map((record) => findStageSummary(record.payload, type)).filter((value): value is number => value !== null));
    const deepMinutes = stageMinutes("DEEP");
    const remMinutes = stageMinutes("REM");
    const lightMinutes = stageMinutes("LIGHT");
    const awakeMinutes = stageMinutes("AWAKE") ?? sleepAwakeMinutes;
    const awakeSegments = total(sleep.map((record) => awakeSegmentCount(record.payload)).filter((value): value is number => value !== null));
    const stagePercent = (minutes: number | null) => minutes === null || !totalInBed ? null : Math.round((minutes / totalInBed) * 1000) / 10;
    const bedtime = sleep.map((record) => record.start_time).filter((value): value is string => Boolean(value)).sort().at(0) ?? null;
    const wakeTime = sleep.map((record) => record.end_time).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
    const values = (type: string, keys: string[]) => byType(type).map((record) => findNumber(record.payload, keys)).filter((value): value is number => value !== null);
    const exerciseMinutes = byType("exercise").map((record) => minutesBetween(record.start_time, record.end_time)).filter((value): value is number => value !== null);
    const runningExercises = byType("exercise").filter((record) => ["RUNNING", "JOGGING", "TRAIL_RUNNING"].includes(String(findObject(record.payload, "exercise")?.exerciseType ?? "").toUpperCase()));
    const runningDistances = runningExercises.map((record) => {
      const millimeters = exerciseDistanceMillimeters(record.payload);
      return millimeters === null ? null : millimeters / 1_000_000;
    }).filter((value): value is number => value !== null);
    const runningDurations = runningExercises.map((record) => {
      const exercise = findObject(record.payload, "exercise");
      return minutesBetween(record.start_time, record.end_time) ?? durationMinutes(exercise?.duration ?? exercise?.activeDuration);
    }).filter((value): value is number => value !== null);
    const runningPaceObservations = runningExercises.map((record) => {
      const millimeters = exerciseDistanceMillimeters(record.payload);
      const exercise = findObject(record.payload, "exercise");
      const distance = millimeters === null ? null : millimeters / 1_000_000;
      const duration = minutesBetween(record.start_time, record.end_time) ?? durationMinutes(exercise?.duration ?? exercise?.activeDuration);
      return { distance, duration };
    }).filter((observation): observation is { distance: number; duration: number } => observation.distance !== null && observation.distance > 0 && observation.duration !== null && observation.duration > 0);
    const runningHeartRates = runningExercises.map((record) => exerciseMetricNumber(record.payload, ["averageHeartRateBeatsPerMinute", "averageHeartRate"])).filter((value): value is number => value !== null);
    const runningHeartRateObservations = runningExercises.map((record) => ({
      heartRate: exerciseMetricNumber(record.payload, ["averageHeartRateBeatsPerMinute", "averageHeartRate"]),
      duration: minutesBetween(record.start_time, record.end_time) ?? (() => {
        const exercise = findObject(record.payload, "exercise");
        return durationMinutes(exercise?.duration ?? exercise?.activeDuration);
      })(),
    })).filter((observation): observation is { heartRate: number; duration: number } => observation.heartRate !== null && observation.duration !== null && observation.duration > 0);
    const weightedRunningHeartRateDuration = total(runningHeartRateObservations.map((observation) => observation.duration));
    const runningAverageHeartRate = weightedRunningHeartRateDuration !== null && weightedRunningHeartRateDuration > 0
      ? runningHeartRateObservations.reduce((sum, observation) => sum + observation.heartRate * observation.duration, 0) / weightedRunningHeartRateDuration
      : average(runningHeartRates);
    const runningDistance = total(runningDistances);
    const runningDuration = total(runningDurations);
    const runningPaceDistance = total(runningPaceObservations.map((observation) => observation.distance));
    const runningPaceDuration = total(runningPaceObservations.map((observation) => observation.duration));
    const exerciseSummaryMinutes = total(values("daily-exercise-summary", ["minutes"]));
    const sedentaryMinutes = byType("sedentary-period").map((record) => minutesBetween(record.start_time, record.end_time)
      ?? durationMinutes(findStrings(record.payload, "durationSum").at(0))).filter((value): value is number => value !== null);
    const activeMinutes = byType("active-minutes").map((record) => total(findNumbers(record.payload, ["activeMinutes", "activeMinutesSum"]))).filter((value): value is number => value !== null);
    const temperatureNightly = average(values("daily-sleep-temperature-derivations", ["nightlyTemperatureCelsius"]));
    const temperatureBaseline = average(values("daily-sleep-temperature-derivations", ["baselineTemperatureCelsius"]));
    const oxygenAverage = average(values("daily-oxygen-saturation", ["averagePercentage", "averageSaturationPercentage", "percentage"]))
      ?? average(values("oxygen-saturation", ["percentage"]));
    const respiratoryAverage = average(values("daily-respiratory-rate", ["averageBreathsPerMinute", "breathsPerMinute", "respiratoryRate"]))
      ?? average(byType("respiratory-rate-sleep-summary").map((record) => findNumber(findObject(record.payload, "fullSleepStats"), ["breathsPerMinute"])).filter((value): value is number => value !== null));
    const timeInZones = byType("time-in-heart-rate-zone");
    const activeZones = byType("active-zone-minutes");
    const lightZone = zoneMinutes(timeInZones, "LIGHT");
    const moderateZone = zoneMinutes(timeInZones, "MODERATE");
    const vigorousZone = zoneMinutes(timeInZones, "VIGOROUS");
    const peakZone = zoneMinutes(timeInZones, "PEAK");
    const activeZoneMinutes = summedNumbers(activeZones, ["activeZoneMinutes", "sumInFatBurnHeartZone", "sumInCardioHeartZone", "sumInPeakHeartZone"]);
    const measuredAt = (record: NormalizedHealthRecord) => record.measured_at ?? (record.civil_date ? `${record.civil_date}T12:00:00.000Z` : null);
    const latestMeasuredAt = day.map(measuredAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
    const freshnessByType = Object.fromEntries([...new Set(day.map((record) => record.data_type))].map((type) => [type, byType(type).map(measuredAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null]));
    const sourceDevices = [...new Set(day.map((record) => record.source_device?.trim()).filter((value): value is string => Boolean(value)))].sort();
    const providers = [...new Set(day.map((record) => record.provider).filter((value): value is string => Boolean(value)))].sort();
    const primaryWearable = day
      .filter((record) => ["sleep", "daily-heart-rate-variability", "daily-resting-heart-rate"].includes(record.data_type))
      .map((record) => record.source_device?.trim())
      .find((value): value is string => Boolean(value)) ?? null;

    return {
      metric_date: date,
      sleep_minutes: totalSleep === null ? null : Math.round(totalSleep),
      sleep_efficiency: totalSleep !== null && totalInBed ? Math.round((totalSleep / totalInBed) * 1000) / 10 : null,
      sleep_latency_minutes: sleepLatencyMinutes,
      sleep_awake_minutes: awakeMinutes,
      sleep_awake_percent: stagePercent(awakeMinutes),
      sleep_awakenings: awakeSegments,
      sleep_fragmentation: awakeSegments !== null && totalSleep ? Math.round((awakeSegments / (totalSleep / 60)) * 10) / 10 : null,
      sleep_deep_minutes: deepMinutes,
      sleep_deep_percent: stagePercent(deepMinutes),
      sleep_rem_minutes: remMinutes,
      sleep_rem_percent: stagePercent(remMinutes),
      sleep_light_minutes: lightMinutes,
      sleep_light_percent: stagePercent(lightMinutes),
      bedtime,
      wake_time: wakeTime,
      hrv_ms: average(values("daily-heart-rate-variability", ["averageHeartRateVariabilityMilliseconds"])),
      resting_heart_rate: average(values("daily-resting-heart-rate", ["beatsPerMinute", "restingHeartRate"])),
      respiratory_rate: respiratoryAverage,
      oxygen_saturation: oxygenAverage,
      oxygen_saturation_lower: average(values("daily-oxygen-saturation", ["lowerBoundPercentage"])),
      oxygen_saturation_upper: average(values("daily-oxygen-saturation", ["upperBoundPercentage"])),
      skin_temperature_delta: temperatureNightly !== null && temperatureBaseline !== null ? Math.round((temperatureNightly - temperatureBaseline) * 100) / 100 : null,
      nightly_temperature_celsius: temperatureNightly,
      baseline_temperature_celsius: temperatureBaseline,
      steps: summedNumbers(byType("steps"), ["count", "countSum"]),
      active_energy_kcal: total(values("active-energy-burned", ["kilocalories", "kcal", "kcalSum"])),
      total_energy_kcal: total(values("total-calories", ["kcal", "kcalSum", "totalCaloriesKcal"])),
      zone_minutes: activeZoneMinutes,
      light_zone_minutes: lightZone,
      moderate_zone_minutes: moderateZone,
      vigorous_zone_minutes: vigorousZone,
      peak_zone_minutes: peakZone,
      active_minutes: total(activeMinutes),
      sedentary_minutes: total(sedentaryMinutes),
      exercise_minutes: exerciseSummaryMinutes ?? total(exerciseMinutes),
      distance_km: (() => { const millimeters = total(values("distance", ["millimeters", "millimetersSum", "distanceMillimeters"])); return millimeters === null ? null : Math.round((millimeters / 1_000_000) * 100) / 100; })(),
      running_distance_km: runningDistance,
      running_duration_minutes: runningDuration,
      running_pace_seconds_per_km: runningPaceDistance !== null && runningPaceDistance > 0 && runningPaceDuration !== null ? (runningPaceDuration * 60) / runningPaceDistance : null,
      running_average_heart_rate: runningAverageHeartRate,
      floors: total(values("floors", ["count", "countSum"])),
      weight_kg: (() => { const grams = average(values("weight", ["weightGrams", "weightGramsAvg"])); return grams === null ? null : Math.round((grams / 1000) * 100) / 100; })(),
      body_fat_percent: average(values("body-fat", ["percentage", "percentageAvg"])),
      vo2_max: average([
        ...values("daily-vo2-max", ["vo2Max", "runVo2Max"]),
        ...values("vo2-max", ["vo2Max"]),
        ...values("run-vo2-max", ["runVo2Max"]),
      ]),
      altitude_gain_m: (() => { const millimeters = total(values("altitude", ["gainMillimeters", "gainMillimetersSum"])); return millimeters === null ? null : Math.round((millimeters / 1000) * 10) / 10; })(),
      height_cm: (() => { const millimeters = average(values("height", ["heightMillimeters", "heightMillimetersAvg"])); return millimeters === null ? null : Math.round((millimeters / 10) * 10) / 10; })(),
      core_body_temperature_celsius: average(values("core-body-temperature", ["temperatureCelsius", "temperatureCelsiusAvg"])),
      blood_glucose_mg_dl: average(values("blood-glucose", ["bloodGlucoseMilligramsPerDeciliter", "bloodGlucoseMilligramsPerDeciliterAvg"])),
      data_quality: { presentTypes: [...new Set(day.map((record) => record.data_type))].sort(), recordCount: day.length, sourceDevices, providers, primaryWearable },
      source_freshness: { latestMeasuredAt, byType: freshnessByType },
    };
  });
}
