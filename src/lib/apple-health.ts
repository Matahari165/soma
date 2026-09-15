import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

export function generateAppleSyncToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return `soma_ah_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function getOrCreateAppleSyncToken(userId: string): Promise<string> {
  const admin = createCloudflareAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("apple_health_sync_token")
    .eq("user_id", userId)
    .maybeSingle();

  if (profile?.apple_health_sync_token && typeof profile.apple_health_sync_token === "string") {
    return profile.apple_health_sync_token;
  }

  const newToken = generateAppleSyncToken();
  await admin
    .from("profiles")
    .update({ apple_health_sync_token: newToken, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  return newToken;
}

export async function findUserByAppleSyncToken(token: string): Promise<string | null> {
  if (!token || !token.startsWith("soma_ah_")) return null;
  const admin = createCloudflareAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("user_id")
    .eq("apple_health_sync_token", token.trim())
    .maybeSingle();

  return profile?.user_id ?? null;
}
