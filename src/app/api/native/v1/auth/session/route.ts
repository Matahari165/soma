import { NextResponse } from "next/server";

import { deleteCurrentSession, getBearerDeviceSession, getBearerSessionUser, hasCompletedOnboarding } from "@/lib/cloudflare/session";

export async function GET() {
  const [user, session] = await Promise.all([getBearerSessionUser(), getBearerDeviceSession()]);
  if (!user || !session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return NextResponse.json({ user, session, hasCompletedOnboarding: await hasCompletedOnboarding(user.id) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE() {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  await deleteCurrentSession();
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
