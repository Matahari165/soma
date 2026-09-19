import { NextResponse } from "next/server";
import { z } from "zod";

import { pkceChallenge, stableHash } from "@/lib/crypto";
import { consumeNativeAuthCode } from "@/lib/cloudflare/db";
import { createSession, hasCompletedOnboarding, sessionUserById } from "@/lib/cloudflare/session";

const exchangeSchema = z.object({
  code: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  codeVerifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
  deviceName: z.string().trim().min(1).max(80),
});

export async function POST(request: Request) {
  const parsed = exchangeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid authentication exchange." }, { status: 400 });

  const record = await consumeNativeAuthCode(stableHash(parsed.data.code), pkceChallenge(parsed.data.codeVerifier));
  if (!record) {
    return NextResponse.json({ error: "Authentication exchange expired or invalid." }, { status: 401 });
  }

  const user = await sessionUserById(record.user_id);
  if (!user) return NextResponse.json({ error: "Authentication exchange expired or invalid." }, { status: 401 });
  const { token, session } = await createSession(user.id, {
    platform: record.platform,
    deviceName: parsed.data.deviceName,
    setCookie: false,
  });
  return NextResponse.json({
    token,
    tokenType: "Bearer",
    session,
    user,
    hasCompletedOnboarding: await hasCompletedOnboarding(user.id),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
