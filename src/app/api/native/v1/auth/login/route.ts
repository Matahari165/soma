import { NextResponse } from "next/server";
import { z } from "zod";

import { verifyCredentialsLogin } from "@/lib/auth-credentials";
import { createSession, hasCompletedOnboarding } from "@/lib/cloudflare/session";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128),
  platform: z.enum(["ios", "macos"]),
  deviceName: z.string().trim().min(1).max(80),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid login request." }, { status: 400 });

  try {
    const user = await verifyCredentialsLogin(parsed.data);
    const { token, session } = await createSession(user.id, {
      platform: parsed.data.platform,
      deviceName: parsed.data.deviceName,
      setCookie: false,
    });
    return NextResponse.json({
      token,
      tokenType: "Bearer",
      session,
      user: { id: user.id, email: user.email, displayName: user.displayName },
      hasCompletedOnboarding: await hasCompletedOnboarding(user.id),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
}
