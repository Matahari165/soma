import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { getDataMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (getDataMode() === "demo") return NextResponse.json({ mode: "demo", status: "not_connected" });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("provider_connections")
    .select("provider,status,scopes,last_synced_at,last_error_code,metadata,created_at")
    .eq("user_id", user.id).eq("provider", "google_health").maybeSingle();
  if (error) return NextResponse.json({ error: "Connection status could not be loaded." }, { status: 500 });
  return NextResponse.json({ mode: "live", connection: data });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (getDataMode() === "demo") return NextResponse.json({ ok: true, mode: "demo" });
  const admin = createSupabaseAdminClient();
  const { data: connection } = await admin.from("provider_connections").select("access_token_ciphertext").eq("user_id", user.id).eq("provider", "google_health").maybeSingle();
  if (connection?.access_token_ciphertext) {
    await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: decryptSecret(connection.access_token_ciphertext) }), signal: AbortSignal.timeout(5000) }).catch(() => undefined);
  }
  const { error } = await admin.from("provider_connections").delete().eq("user_id", user.id).eq("provider", "google_health");
  if (error) return NextResponse.json({ error: "Google Health could not be disconnected." }, { status: 500 });
  await admin.from("audit_events").insert({ user_id: user.id, event_type: "google_health_disconnected", resource_type: "provider_connection" });
  return NextResponse.json({ ok: true });
}
