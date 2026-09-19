import { NextResponse } from "next/server";
import { z } from "zod";

import { getBearerDeviceSession, getBearerSessionUser, revokeDeviceSession } from "@/lib/cloudflare/session";

const sessionIdSchema = z.uuid();

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const [user, currentSession] = await Promise.all([getBearerSessionUser(), getBearerDeviceSession()]);
  if (!user || !currentSession) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = sessionIdSchema.safeParse((await context.params).id);
  if (!parsed.success) return NextResponse.json({ error: "Invalid session." }, { status: 400 });
  if (parsed.data === currentSession.id) return NextResponse.json({ error: "Current session must be signed out locally." }, { status: 409 });
  const revoked = await revokeDeviceSession(user.id, parsed.data);
  if (!revoked) return NextResponse.json({ error: "Session not found." }, { status: 404 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
