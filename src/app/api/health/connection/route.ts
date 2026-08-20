import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { decryptSecret } from "@/lib/crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  if (isLocalPreviewMode()) return NextResponse.json({ connection: { provider: "google_health", status: "connected", scopes: ["activity.readonly", "health.readonly", "sleep.readonly"], last_synced_at: new Date().toISOString(), metadata: { preview: true, consent_complete: true } } });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("provider_connections")
    .select("provider,status,scopes,last_synced_at,last_error_code,metadata,created_at")
    .eq("user_id", user.id).eq("provider", "google_health").maybeSingle();
  if (error) return NextResponse.json({ error: "Connection status could not be loaded." }, { status: 500 });
  return NextResponse.json({ connection: data });
}

export async function DELETE() {
  if (isLocalPreviewMode()) return NextResponse.json({ ok: true, preview: true });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const { data: connection, error: connectionError } = await admin.from("provider_connections").select("access_token_ciphertext").eq("user_id", user.id).eq("provider", "google_health").maybeSingle();
  if (connectionError) return NextResponse.json({ error: "Google Health connection could not be loaded." }, { status: 500 });
  if (connection?.access_token_ciphertext) {
    await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: decryptSecret(connection.access_token_ciphertext) }), signal: AbortSignal.timeout(5000) }).catch(() => undefined);
  }
  const { error } = await admin.from("provider_connections").delete().eq("user_id", user.id).eq("provider", "google_health");
  if (error) return NextResponse.json({ error: "Google Health could not be disconnected." }, { status: 500 });
  const { error: auditError } = await admin.from("audit_events").insert({ user_id: user.id, event_type: "google_health_disconnected", resource_type: "provider_connection" });
  if (auditError) console.error("[api/health/connection] disconnect audit could not be stored", { userId: user.id });
  return NextResponse.json({ ok: true });
}
