import { healthRecordCivilDate } from "./aggregate";

const wearableAnchorTypes = new Set([
  "sleep",
  "daily-heart-rate-variability",
  "daily-resting-heart-rate",
]);

const whoopComparableTypes = new Set([
  "sleep",
  "daily-heart-rate-variability",
  "daily-resting-heart-rate",
  "daily-respiratory-rate",
  "daily-oxygen-saturation",
  "daily-sleep-temperature-derivations",
]);

export type WearableDatedRecord = {
  provider?: string;
  data_type: string;
  civil_date: string | null;
  start_time: string | null;
  end_time: string | null;
  measured_at: string | null;
  source_device?: string | null;
  payload?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function whoopPackage(payload: unknown) {
  if (!isObject(payload) || !isObject(payload.dataSource) || !isObject(payload.dataSource.application)) return null;
  const packageName = payload.dataSource.application.packageName;
  return typeof packageName === "string" ? packageName.toLowerCase() : null;
}

function isWhoopExport(record: WearableDatedRecord) {
  return record.provider === "whoop_export" || record.source_device?.trim().toLowerCase() === "whoop";
}

function isWhoopMirror(record: WearableDatedRecord) {
  return whoopPackage(record.payload)?.includes("whoop") ?? false;
}

function isWhoop(record: WearableDatedRecord) {
  return isWhoopExport(record) || isWhoopMirror(record);
}

function isOtherAttributedWearable(record: WearableDatedRecord) {
  return wearableAnchorTypes.has(record.data_type) && Boolean(record.source_device?.trim()) && !isWhoop(record);
}

function earliestDate(records: WearableDatedRecord[], timeZone: string) {
  return records.flatMap((record) => {
    const date = healthRecordCivilDate(record, timeZone);
    return date ? [date] : [];
  }).sort()[0] ?? null;
}

export function findWearableWindowStart(records: WearableDatedRecord[], timeZone: string) {
  return earliestDate(records.filter((record) => wearableAnchorTypes.has(record.data_type) && (isWhoop(record) || isOtherAttributedWearable(record))), timeZone);
}

export function recordsInsideWearableWindow<T extends WearableDatedRecord>(records: T[], timeZone: string) {
  const startDate = findWearableWindowStart(records, timeZone);
  if (!startDate) return { records, startDate: null };
  const whoopRecords = records.filter((record) => wearableAnchorTypes.has(record.data_type) && isWhoop(record));
  const whoopStart = earliestDate(whoopRecords, timeZone);
  const nextWearableStart = earliestDate(records.filter((record) => {
    if (!isOtherAttributedWearable(record)) return false;
    const date = healthRecordCivilDate(record, timeZone);
    return Boolean(date && (!whoopStart || date > whoopStart));
  }), timeZone);
  const whoopExportKeys = new Set(records.filter(isWhoopExport).flatMap((record) => {
    const date = healthRecordCivilDate(record, timeZone);
    return date ? [`${date}:${record.data_type}`] : [];
  }));

  return {
    records: records.filter((record) => {
      const date = healthRecordCivilDate(record, timeZone);
      if (!date || date < startDate) return false;

      if (nextWearableStart && date >= nextWearableStart) return !isWhoop(record);
      if (whoopStart && date >= whoopStart) {
        if (!whoopComparableTypes.has(record.data_type) || !isWhoop(record)) return false;
        if (isWhoopMirror(record) && whoopExportKeys.has(`${date}:${record.data_type}`)) return false;
      }
      return true;
    }),
    startDate,
  };
}
