import { NextResponse } from "next/server";
import { z } from "zod";

import { createSession, hasCompletedOnboarding, sessionUserById } from "@/lib/cloudflare/session";
import { resolveSomaUserForGoogleIdentity, verifySupabaseGoogleAccessToken } from "@/lib/native-supabase-auth";

const requestSchema = z.object({
  platform: z.enum(["ios", "macos"]),
  deviceName: z.string().trim().min(1).max(80),
});

function accessToken(request: Request) {
  const match = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9._~-]+)$/);
  return match?.[1] ?? null;
}

export async function POST(request: Request) {
  const token = accessToken(request);
  if (!token) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 2_048) return NextResponse.json({ error: "Invalid authentication request." }, { status: 413 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid authentication request." }, { status: 400 });

  try {
    const identity = await verifySupabaseGoogleAccessToken(token);
    if (!identity) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const userId = await resolveSomaUserForGoogleIdentity(identity);
    const user = await sessionUserById(userId);
    if (!user) throw new Error("Linked Soma user is unavailable.");
    const { token: somaToken, session } = await createSession(user.id, {
      platform: parsed.data.platform,
      deviceName: parsed.data.deviceName,
      setCookie: false,
    });
    return NextResponse.json({
      token: somaToken,
      tokenType: "Bearer",
      session,
      user,
      hasCompletedOnboarding: await hasCompletedOnboarding(user.id),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[native-auth-bridge] exchange failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Google authentication could not be completed." }, { status: 503 });
  }
}
