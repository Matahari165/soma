import "server-only";

import { abortable } from "@/lib/abortable";
import { z } from "zod";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { getActivitySessionTelemetry, type SessionTelemetryOptions } from "@/services/activity-session-telemetry";

export class AssistantActivityTelemetryUnavailableError extends Error {}

export const assistantActivityTelemetrySchema = z.object({
  activityId: z.string().trim().min(1).max(500),
  includeSamples: z.boolean().default(false),
  sampleOffset: z.number().int().min(0).max(10_000).default(0),
  sampleLimit: z.number().int().min(1).max(200).default(100),
}).strict();

export async function loadAssistantActivityTelemetry(userId: string, input: unknown, dependencies = {
  admin: createCloudflareAdminClient,
  telemetry: getActivitySessionTelemetry,
}, options: SessionTelemetryOptions = {}) {
  options.signal?.throwIfAborted();
  if (!userId) throw new Error("Authenticated user is required.");
  const query = assistantActivityTelemetrySchema.parse(input);
  const result = await abortable(dependencies.admin().from("health_records")
    .select("source_record_id,start_time,end_time,civil_date,payload")
    .eq("user_id", userId).eq("provider", "google_health").eq("data_type", "exercise")
    .eq("source_record_id", query.activityId).maybeSingle(), options.signal);
  if (result.error) throw new Error("Activity could not be loaded.");
  if (!result.data) throw new AssistantActivityTelemetryUnavailableError("Activity not found for this user.");
  const { start_time: startTime, end_time: endTime, civil_date: date } = result.data;
  if (typeof startTime !== "string" || typeof endTime !== "string") throw new AssistantActivityTelemetryUnavailableError("Activity timestamps are unavailable.");
  const telemetry = await abortable(dependencies.telemetry(userId, { startTime, endTime, date }, options), options.signal);
  const { heartRateSamples, ...summary } = telemetry;
  const samples = query.includeSamples ? heartRateSamples.slice(query.sampleOffset, query.sampleOffset + query.sampleLimit) : [];
  return {
    activityId: query.activityId,
    period: { from: startTime, to: endTime },
    ...summary,
    // Zones were calculated on the complete available trace, before graph downsampling.
    heartRateSamples: samples,
    sampleManifest: {
      returnedItems: samples.length,
      availableGraphSamples: heartRateSamples.length,
      nextOffset: query.includeSamples && query.sampleOffset + samples.length < heartRateSamples.length ? query.sampleOffset + samples.length : null,
      downsampled: telemetry.heartRateSamplesDownsampled,
      exactRawSamples: !telemetry.heartRateSamplesDownsampled,
    },
    provenance: {
      calculatedZones: "soma_calculation",
      method: "percent_max_heart_rate",
      sourceSamples: telemetry.heartRateSampleSource,
      missingSamplesFetched: telemetry.heartRateFetchStatus === "fetched",
    },
    note: "Les zones Z1–Z5 sont calculées par Soma sur les mesures disponibles, avec pauses et lacunes. Elles diffèrent des catégories du fournisseur. Ne recalcule pas les zones à partir d'une courbe réduite. Les mesures manquantes peuvent être récupérées et enregistrées depuis Google Health ; un échec ou une couverture partielle reste explicite.",
  };
}
