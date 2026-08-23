export const WHOOP_IMPORT_DATA_TYPES = [
  "daily-exercise-summary",
  "daily-heart-rate-variability",
  "daily-oxygen-saturation",
  "daily-respiratory-rate",
  "daily-resting-heart-rate",
  "daily-sleep-temperature-derivations",
  "exercise",
  "sleep",
  "time-in-heart-rate-zone",
] as const;

type WhoopImportDataType = typeof WHOOP_IMPORT_DATA_TYPES[number];

export type WhoopImportRecord = {
  provider: "whoop_export";
  data_type: WhoopImportDataType;
  source_record_id: string;
  start_time: string | null;
  end_time: string | null;
  civil_date: string;
  recording_method: "DERIVED" | "PASSIVELY_MEASURED";
  source_device: "WHOOP";
  payload: Record<string, unknown>;
  measured_at: string;
};

const allowedTypes = new Set<string>(WHOOP_IMPORT_DATA_TYPES);
const civilDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validOptionalTimestamp(value: unknown): value is string | null {
  return value === null || validTimestamp(value);
}

function validCivilDate(value: unknown): value is string {
  if (typeof value !== "string" || !civilDatePattern.test(value)) return false;
  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
}

export function validateWhoopImportBatch(value: unknown, maximumRecords = 500): WhoopImportRecord[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximumRecords) {
    throw new Error(`WHOOP imports require between 1 and ${maximumRecords} records per batch.`);
  }
  const sourceIds = new Set<string>();
  return value.map((candidate) => {
    if (!isObject(candidate)) throw new Error("Every WHOOP record must be an object.");
    const dataType = candidate.data_type;
    if (typeof dataType !== "string" || !allowedTypes.has(dataType)) throw new Error("A WHOOP record has an unsupported data type.");
    if (candidate.provider !== "whoop_export" || candidate.source_device !== "WHOOP") throw new Error("A WHOOP record has an invalid source.");
    if (candidate.recording_method !== "DERIVED" && candidate.recording_method !== "PASSIVELY_MEASURED") throw new Error("A WHOOP record has an invalid recording method.");
    if (typeof candidate.source_record_id !== "string" || !candidate.source_record_id.startsWith(`whoop-export:v1:${dataType}:`)) {
      throw new Error("A WHOOP record has an invalid source identifier.");
    }
    if (sourceIds.has(candidate.source_record_id)) throw new Error("The WHOOP batch contains a duplicate source identifier.");
    sourceIds.add(candidate.source_record_id);
    if (!validCivilDate(candidate.civil_date) || !validTimestamp(candidate.measured_at)) throw new Error("A WHOOP record has an invalid date.");
    if (!validOptionalTimestamp(candidate.start_time) || !validOptionalTimestamp(candidate.end_time)) throw new Error("A WHOOP record has an invalid time range.");
    if (!isObject(candidate.payload)) throw new Error("A WHOOP record has an invalid payload.");
    if (["exercise", "sleep"].includes(dataType)) {
      if (!candidate.start_time || !candidate.end_time || Date.parse(candidate.end_time) <= Date.parse(candidate.start_time)) {
        throw new Error("WHOOP exercise and sleep records require a positive time range.");
      }
    }
    return {
      provider: "whoop_export",
      data_type: dataType as WhoopImportDataType,
      source_record_id: candidate.source_record_id,
      start_time: candidate.start_time,
      end_time: candidate.end_time,
      civil_date: candidate.civil_date,
      recording_method: candidate.recording_method,
      source_device: "WHOOP",
      payload: candidate.payload,
      measured_at: candidate.measured_at,
    };
  });
}
