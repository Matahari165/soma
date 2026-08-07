import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  exchangeGoogleHealthCode,
  getGoogleHealthIdentity,
  GOOGLE_HEALTH_DATA_TYPES,
  GOOGLE_HEALTH_SCOPES,
} from "@/integrations/google-health/client";
import { getCurrentUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  if (!user || user.isDemo) return NextResponse.redirect(new URL("/login", url.origin));

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const stateCookie = cookieStore.get("soma_health_oauth_state")?.value;
  const verifier = cookieStore.get("soma_health_pkce")?.value;
  const returnTarget = cookieStore.get("soma_health_return")?.value;

  if (!code || !state || !stateCookie || !verifier || state !== stateCookie) {
    return clearOAuthCookies(NextResponse.redirect(new URL("/settings?health=invalid_state", url.origin)));
  }

  try {
    const tokens = await exchangeGoogleHealthCode(code, verifier);
    const identity = await getGoogleHealthIdentity(tokens.access_token);
    const admin = createSupabaseAdminClient();
    const { data: existing } = await admin.from("provider_connections").select("refresh_token_ciphertext").eq("user_id", user.id).eq("provider", "google_health").maybeSingle();
    const { data: connection, error } = await admin.from("provider_connections").upsert({
      user_id: user.id,
      provider: "google_health",
      external_user_id: identity.healthUserId,
      legacy_user_id: identity.legacyUserId ?? null,
      access_token_ciphertext: encryptSecret(tokens.access_token),
      refresh_token_ciphertext: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : existing?.refresh_token_ciphertext,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scopes: tokens.scope?.split(" ") ?? [...GOOGLE_HEALTH_SCOPES],
      status: "connected",
      last_error_code: null,
    }, { onConflict: "user_id,provider" }).select("id").single();
    if (error || !connection) throw new Error("Google Health connection could not be stored.");

    const supabase = await createSupabaseServerClient();
    const { data: profile } = await supabase.from("profiles").select("import_range").eq("user_id", user.id).single();
    const now = new Date();
    const recentStart = daysAgo(90);
    const jobs = [{
      user_id: user.id,
      connection_id: connection.id,
      import_range: "90_days",
      data_types: [...GOOGLE_HEALTH_DATA_TYPES],
      range_start: recentStart.toISOString(),
      range_end: now.toISOString(),
      status: "queued",
    }];
    if (profile?.import_range === "all_history") {
      jobs.push({
        user_id: user.id,
        connection_id: connection.id,
        import_range: "all_history",
        data_types: [...GOOGLE_HEALTH_DATA_TYPES],
        range_start: new Date("2009-01-01T00:00:00.000Z").toISOString(),
        range_end: recentStart.toISOString(),
        status: "queued",
      });
    }
    const { error: jobError } = await admin.from("sync_jobs").insert(jobs);
    if (jobError) throw new Error("Initial Google Health import could not be queued.");

    return clearOAuthCookies(NextResponse.redirect(new URL(returnTarget === "dashboard" ? "/?health=connected" : "/settings?health=connected", url.origin)));
  } catch {
    return clearOAuthCookies(NextResponse.redirect(new URL("/settings?health=connection_failed", url.origin)));
  }
}
