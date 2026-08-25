import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  exchangeGoogleHealthCode,
  getGrantedGoogleHealthDataTypes,
  getGoogleHealthIdentity,
  GOOGLE_HEALTH_SCOPES,
} from "@/integrations/google-health/client";
import { getCurrentUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { createCloudflareServerClient } from "@/lib/cloudflare/server";

function daysAgo(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function clearOAuthCookies(response: NextResponse) {
  response.cookies.delete("soma_health_oauth_state");
  response.cookies.delete("soma_health_pkce");
  response.cookies.delete("soma_health_return");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", url.origin));

  const providerError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const stateCookie = cookieStore.get("soma_health_oauth_state")?.value;
  const verifier = cookieStore.get("soma_health_pkce")?.value;
  const returnTarget = cookieStore.get("soma_health_return")?.value;

  if (providerError) {
    const status = providerError === "access_denied" ? "permission_denied" : "connection_failed";
    return clearOAuthCookies(NextResponse.redirect(new URL(`/settings?health=${status}`, url.origin)));
  }

  if (!code || !state || !stateCookie || !verifier || state !== stateCookie) {
    return clearOAuthCookies(NextResponse.redirect(new URL("/settings?health=invalid_state", url.origin)));
  }

  try {
    const tokens = await exchangeGoogleHealthCode(code, verifier);
    const identity = await getGoogleHealthIdentity(tokens.access_token);
    const grantedScopes = tokens.scope?.split(" ").filter(Boolean) ?? [];
    const grantedDataTypes = getGrantedGoogleHealthDataTypes(grantedScopes);
    if (!grantedDataTypes.length) {
      return clearOAuthCookies(NextResponse.redirect(new URL("/settings?health=permission_denied", url.origin)));
    }
    const consentComplete = GOOGLE_HEALTH_SCOPES.every((scope) => grantedScopes.includes(scope));
    const admin = createCloudflareAdminClient();
    const { data: existing, error: existingError } = await admin.from("provider_connections").select("refresh_token_ciphertext").eq("user_id", user.id).eq("provider", "google_health").maybeSingle();
    if (existingError) throw new Error("Existing Google Health connection could not be loaded.");
    const { data: connection, error } = await admin.from("provider_connections").upsert({
      user_id: user.id,
      provider: "google_health",
      external_user_id: identity.healthUserId,
      legacy_user_id: identity.legacyUserId ?? null,
      access_token_ciphertext: encryptSecret(tokens.access_token),
      refresh_token_ciphertext: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : existing?.refresh_token_ciphertext,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scopes: grantedScopes,
      status: "connected",
      last_error_code: null,
      metadata: { consent_complete: consentComplete, granted_data_type_count: grantedDataTypes.length },
    }, { onConflict: "user_id,provider" }).select("id").single();
    if (error || !connection) throw new Error("Google Health connection could not be stored.");

    const supabase = await createCloudflareServerClient();
    const { data: profile, error: profileError } = await supabase.from("profiles").select("import_range").eq("user_id", user.id).single();
    if (profileError) throw new Error("Import preferences could not be loaded.");
    const now = new Date();
    const recentStart = daysAgo(90);
    const jobs = [{
      user_id: user.id,
      connection_id: connection.id,
      import_range: "90_days",
      data_types: [...grantedDataTypes],
      range_start: recentStart.toISOString(),
      range_end: now.toISOString(),
      status: "queued",
      sync_trigger: "initial",
    }];
    if (profile?.import_range === "all_history") {
      jobs.push({
        user_id: user.id,
        connection_id: connection.id,
        import_range: "all_history",
        data_types: [...grantedDataTypes],
        range_start: new Date("2009-01-01T00:00:00.000Z").toISOString(),
        range_end: recentStart.toISOString(),
        status: "queued",
        sync_trigger: "initial",
      });
    }
    const { error: jobError } = await admin.from("sync_jobs").insert(jobs);
    if (jobError) throw new Error("Initial Google Health import could not be queued.");

    const connectionStatus = consentComplete ? "connected" : "connected_partial";
    return clearOAuthCookies(NextResponse.redirect(new URL(returnTarget === "dashboard" ? `/?health=${connectionStatus}` : `/settings?health=${connectionStatus}`, url.origin)));
  } catch {
    return clearOAuthCookies(NextResponse.redirect(new URL("/settings?health=connection_failed", url.origin)));
  }
}
