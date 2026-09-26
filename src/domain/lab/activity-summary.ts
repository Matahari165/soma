export type PersonalLabActivityRecord = {
  date: string;
  name: string;
  type: string;
  durationMinutes: number | null;
  distanceKm: number | null;
  averagePaceSecondsPerKm: number | null;
  averageHeartRate: number | null;
  maximumHeartRate?: number | null;
  calories: number | null;
};

export type PersonalLabActivitySummary = {
  date: string;
  count: number;
  activity: PersonalLabActivityRecord;
};

export type PersonalLabActivitySummariesResult =
  | { status: "ready"; summaries: readonly PersonalLabActivitySummary[] }
  | { status: "unavailable" };

function rankingValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : -1;
}

function measuredValue(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Pick the longest recorded session for each date while retaining only the fields shown in Activity. */
export function summarizePersonalLabActivities(records: readonly PersonalLabActivityRecord[]): PersonalLabActivitySummary[] {
  const byDate = new Map<string, PersonalLabActivityRecord[]>();

  for (const record of records) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date)) continue;
    const day = byDate.get(record.date) ?? [];
    day.push(record);
    byDate.set(record.date, day);
  }

  return [...byDate.entries()]
    .map(([date, activities]) => {
      const longest = [...activities].sort((left, right) =>
        rankingValue(right.durationMinutes) - rankingValue(left.durationMinutes)
        || rankingValue(right.distanceKm) - rankingValue(left.distanceKm)
        || rankingValue(right.calories) - rankingValue(left.calories),
      )[0];

      return {
        date,
        count: activities.length,
        activity: {
          date: longest.date,
          name: longest.name,
          type: longest.type,
          durationMinutes: measuredValue(longest.durationMinutes),
          distanceKm: measuredValue(longest.distanceKm),
          averagePaceSecondsPerKm: measuredValue(longest.averagePaceSecondsPerKm),
          averageHeartRate: measuredValue(longest.averageHeartRate),
          maximumHeartRate: measuredValue(longest.maximumHeartRate),
          calories: measuredValue(longest.calories),
        },
      };
    })
    .sort((left, right) => right.date.localeCompare(left.date));
}
