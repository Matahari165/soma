import { stableHash } from "@/lib/crypto";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findRecordBody(point: Record<string, unknown>) {
  return Object.entries(point).find(([key, value]) =>
    key !== "name" && key !== "dataSource" && isObject(value),
  )?.[1] as Record<string, unknown> | undefined;
}

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function nestedObject(value: unknown, key: string) {
  return isObject(value) && isObject(value[key]) ? value[key] as Record<string, unknown> : undefined;
}

function civilDateFrom(value: unknown) {
  if (!isObject(value)) return null;
  const year = Number(value.year);
  const month = Number(value.month);
  const day = Number(value.day);
  if (!year || !month || !day) return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function normalizeGoogleHealthPoint(
  userId: string,
  dataType: string,
  point: Record<string, unknown>,
) {
  const body = findRecordBody(point) ?? {};
  const interval = nestedObject(body, "interval");
  const sampleTime = nestedObject(body, "sampleTime");
  const physicalTime = sampleTime ? getString(sampleTime.physicalTime) : null;
  const startTime = interval ? getString(interval.startTime) : null;
  const endTime = interval ? getString(interval.endTime) : null;
  const measuredAt = endTime ?? startTime ?? physicalTime;
  const date = civilDateFrom(body.date)
    ?? getString(body.date)
    ?? civilDateFrom(nestedObject(interval, "civilEndTime")?.date)
    ?? null;
  const dataSource = isObject(point.dataSource) ? point.dataSource : {};
  const device = isObject(dataSource.device) ? dataSource.device : {};
  const sourceRecordId = getString(point.name) ?? stableHash(JSON.stringify(point));

  return {
    user_id: userId,
    provider: "google_health",
    data_type: dataType,
    source_record_id: sourceRecordId,
    start_time: startTime,
    end_time: endTime,
    civil_date: date,
    recording_method: getString(dataSource.recordingMethod),
    source_device: getString(device.displayName),
    payload: point,
    measured_at: measuredAt,
    updated_at: new Date().toISOString(),
  };
}

export function normalizeGoogleHealthDailyRollup(
  userId: string,
  dataType: string,
  point: Record<string, unknown>,
) {
  const civilStartTime = nestedObject(point, "civilStartTime");
  const civilEndTime = nestedObject(point, "civilEndTime");
  const civilDate = civilDateFrom(civilStartTime?.date);
  const sourceRecordId = stableHash(civilDate ? `${dataType}:${civilDate}` : `${dataType}:${JSON.stringify(point)}`);

  return {
    user_id: userId,
    provider: "google_health",
    data_type: dataType,
    source_record_id: sourceRecordId,
    start_time: null,
    end_time: null,
    civil_date: civilDate,
    recording_method: "RECORDING_METHOD_DAILY_ROLLUP",
    source_device: null,
    payload: { dailyRollup: point, civilEndTime },
    measured_at: null,
    updated_at: new Date().toISOString(),
  };
}
