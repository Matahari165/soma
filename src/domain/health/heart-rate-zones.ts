export type MaximumHeartRateSource = "personal" | "age_estimate";

export type MaximumHeartRate = {
  bpm: number;
  source: MaximumHeartRateSource;
};

export const PERCENT_MAX_HEART_RATE_ZONES = [
  { name: "z1", minimumPercent: 50, maximumPercent: 60 },
  { name: "z2", minimumPercent: 60, maximumPercent: 70 },
  { name: "z3", minimumPercent: 70, maximumPercent: 80 },
  { name: "z4", minimumPercent: 80, maximumPercent: 90 },
  { name: "z5", minimumPercent: 90, maximumPercent: 100 },
] as const;

export type HeartRateZoneName = (typeof PERCENT_MAX_HEART_RATE_ZONES)[number]["name"];

type CalendarDate = { year: number; month: number; day: number };

function calendarDate(value: unknown): CalendarDate | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined || year < 1 || month < 1 || month > 12) return null;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (!daysInMonth || day < 1 || day > daysInMonth) return null;
  return { year, month, day };
}

function validPersonalMaximum(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 80 && value <= 250;
}

/** Resolves a configured maximum heart rate or a conservative age-based estimate for the session date. */
export function resolveMaximumHeartRate(input: {
  personalBpm?: unknown;
  dateOfBirth?: string | null;
  date: string;
}): MaximumHeartRate | null {
  if (validPersonalMaximum(input.personalBpm)) {
    return { bpm: input.personalBpm, source: "personal" };
  }

  const birthDate = calendarDate(input.dateOfBirth);
  const sessionDate = calendarDate(input.date);
  if (!birthDate || !sessionDate) return null;

  let age = sessionDate.year - birthDate.year;
  if (sessionDate.month < birthDate.month || (sessionDate.month === birthDate.month && sessionDate.day < birthDate.day)) age -= 1;
  if (age < 18 || age > 100) return null;

  return { bpm: Math.round(208 - 0.7 * age), source: "age_estimate" };
}

export type PercentMaxHeartRateClassification = {
  zone: HeartRateZoneName | null;
  belowZone: boolean;
  aboveMaximum: boolean;
};

/** Classifies a reading against five standard percentage bands of a known HRmax. */
export function classifyPercentMaxHeartRate(
  bpm: number,
  maximumHeartRateBpm: number,
): PercentMaxHeartRateClassification | null {
  if (!Number.isFinite(bpm) || bpm <= 0 || !validPersonalMaximum(maximumHeartRateBpm)) return null;

  const scaledBpm = bpm * 100;
  if (scaledBpm < maximumHeartRateBpm * 50) {
    return { zone: null, belowZone: true, aboveMaximum: false };
  }
  if (scaledBpm > maximumHeartRateBpm * 100) {
    return { zone: null, belowZone: false, aboveMaximum: true };
  }

  const zone = PERCENT_MAX_HEART_RATE_ZONES.find(({ minimumPercent, maximumPercent }) => (
    scaledBpm >= maximumHeartRateBpm * minimumPercent
    && (scaledBpm < maximumHeartRateBpm * maximumPercent
      || (maximumPercent === 100 && scaledBpm === maximumHeartRateBpm * 100))
  ));
  return zone ? { zone: zone.name, belowZone: false, aboveMaximum: false } : null;
}
