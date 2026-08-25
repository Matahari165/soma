import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";

import { exchangeGoogleCalendarCode, GOOGLE_CALENDAR_SCOPE } from "@/integrations/google-calendar/client";
import { syncGoogleCalendar } from "@/integrations/google-calendar/sync";
import { getCurrentUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

function clearCookies(response: NextResponse) {
  response.cookies.delete("soma_calendar_oauth_state");
  response.cookies.delete("soma_calendar_pkce");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", url.origin));
  const cookieStore = await cookies();
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const expectedState = cookieStore.get("soma_calendar_oauth_state")?.value;
  const verifier = cookieStore.get("soma_calendar_pkce")?.value;
  if (url.searchParams.get("error")) return clearCookies(NextResponse.redirect(new URL("/settings?calendar=permission_denied", url.origin)));
  if (!state || !code || !expectedState || !verifier || state !== expectedState) {
    return clearCookies(NextResponse.redirect(new URL("/settings?calendar=invalid_state", url.origin)));
  }
  try {
    const tokens = await exchangeGoogleCalendarCode(code, verifier, url.origin);
    const scopes = tokens.scope?.split(" ").filter(Boolean) ?? [];
    if (!scopes.includes(GOOGLE_CALENDAR_SCOPE)) return clearCookies(NextResponse.redirect(new URL("/settings?calendar=permission_denied", url.origin)));
    const admin = createCloudflareAdminClient();
    const { data: existing } = await admin.from("provider_connections").select("refresh_token_ciphertext").eq("user_id", user.id).eq("provider", "google_calendar").maybeSingle();
    const { error } = await admin.from("provider_connections").upsert({
      user_id: user.id,
      provider: "google_calendar",
      access_token_ciphertext: encryptSecret(tokens.access_token),
      refresh_token_ciphertext: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : existing?.refresh_token_ciphertext,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      scopes,
      status: "connected",
      last_error_code: null,
      metadata: { calendar: "primary", stored_content: false, deep_work_markers: ["DW", "Deep Work"] },
    }, { onConflict: "user_id,provider" });
    if (error) throw new Error("Google Calendar connection could not be stored.");
    after(async () => {
      try {
        await syncGoogleCalendar(user.id);
      } catch (error) {
        console.error("[google-calendar] initial background sync failed", {
          userId: user.id,
          error: error instanceof Error ? error.message : "Unknown error.",
        });
      }
    });
    return clearCookies(NextResponse.redirect(new URL("/?calendar=connected", url.origin)));
  } catch {
    return clearCookies(NextResponse.redirect(new URL("/settings?calendar=connection_failed", url.origin)));
  }
}
