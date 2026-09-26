import { calculateActivitySessionTelemetry } from "./activity-session-telemetry";

/** Synthetic traces used only by the explicitly marked local preview. */
export function activitySessionPreview(recordId: string, now = new Date()) {
  const configs: Record<string, { minutes: number; daysAgo: number; base: number; amplitude: number }> = {
    "preview-run": { minutes: 44, daysAgo: 0, base: 151, amplitude: 18 },
    "preview-boxing": { minutes: 45, daysAgo: 1, base: 145, amplitude: 27 },
    "preview-strength": { minutes: 58, daysAgo: 2, base: 126, amplitude: 31 },
  };
  const config = configs[recordId];
  if (!Object.hasOwn(configs, recordId) || !config) return null;
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - config.daysAgo);
  start.setUTCHours(6, 0, 0, 0);
  const at = (seconds: number) => new Date(start.getTime() + seconds * 1_000).toISOString();
  const date = at(0).slice(0, 10);
  const heartRateRecords = Array.from({ length: config.minutes * 6 + 1 }, (_, index) => ({
    measuredAt: at(index * 10),
    civilDate: date,
    payload: { heartRate: { beatsPerMinute: recordId === "preview-run" && index === 200 ? 178 : Math.round(config.base + Math.sin(index / 21) * config.amplitude) } },
  }));
  return calculateActivitySessionTelemetry({
    startTime: at(0), endTime: at(config.minutes * 60), date, timeZone: "Europe/Paris",
    heartRateRecords,
    dailyZoneRecords: [{ civilDate: date, payload: { dailyHeartRateZones: { heartRateZones: [
      { heartRateZoneType: "LIGHT", minBeatsPerMinute: 30, maxBeatsPerMinute: 110 },
      { heartRateZoneType: "MODERATE", minBeatsPerMinute: 111, maxBeatsPerMinute: 130 },
      { heartRateZoneType: "VIGOROUS", minBeatsPerMinute: 131, maxBeatsPerMinute: 150 },
      { heartRateZoneType: "PEAK", minBeatsPerMinute: 151, maxBeatsPerMinute: 220 },
    ] } } }],
    exercisePayloads: [{ exercise: { exerciseEvents: recordId === "preview-strength" ? [
      { eventTime: at(20 * 60), exerciseEventType: "PAUSE" },
      { eventTime: at(29 * 60), exerciseEventType: "RESUME" },
    ] : [] } }],
  });
}
