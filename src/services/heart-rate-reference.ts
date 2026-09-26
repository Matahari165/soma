import "server-only";

import { resolveMaximumHeartRate } from "@/domain/health/heart-rate-zones";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { isLocalPreviewMode } from "@/lib/env";
import { previewProfile } from "@/lib/local-preview";

const previewReferences = new Map<string, number | null>();
const today = () => new Date().toISOString().slice(0, 10);

export async function loadHeartRateReferenceForUser(userId: string, date = today()) {
  if (isLocalPreviewMode()) {
    const personalBpm = previewReferences.get(userId) ?? null;
    return { personalBpm, maximumHeartRate: resolveMaximumHeartRate({ personalBpm, dateOfBirth: previewProfile.dateOfBirth, date }) };
  }
  const result = await createCloudflareAdminClient().from("profiles")
    .select("date_of_birth,maximum_heart_rate_bpm").eq("user_id", userId).maybeSingle();
  if (result.error) throw new Error("Heart-rate reference could not be loaded.");
  const personalBpm = typeof result.data?.maximum_heart_rate_bpm === "number" ? result.data.maximum_heart_rate_bpm : null;
  const dateOfBirth = typeof result.data?.date_of_birth === "string" ? result.data.date_of_birth : null;
  return { personalBpm, maximumHeartRate: resolveMaximumHeartRate({ personalBpm, dateOfBirth, date }) };
}

export async function saveHeartRateReferenceForUser(userId: string, personalBpm: number | null) {
  if (personalBpm !== null && (!Number.isInteger(personalBpm) || personalBpm < 80 || personalBpm > 250)) {
    throw new Error("Invalid maximum heart rate.");
  }
  if (isLocalPreviewMode()) {
    previewReferences.set(userId, personalBpm);
    return loadHeartRateReferenceForUser(userId);
  }
  const result = await createCloudflareAdminClient().from("profiles")
    .update({ maximum_heart_rate_bpm: personalBpm })
    .eq("user_id", userId).select("user_id").single();
  if (result.error || !result.data) throw new Error("Heart-rate reference could not be saved.");
  return loadHeartRateReferenceForUser(userId);
}
