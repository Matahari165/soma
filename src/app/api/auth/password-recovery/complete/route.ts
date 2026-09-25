import { NextResponse } from "next/server";

import { completePasswordRecovery, verifiedRecoveryIdentity } from "@/lib/auth-recovery";
import { validatePassword } from "@/lib/auth-credentials";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const password = body && typeof body === "object" && "password" in body ? (body as { password: unknown }).password : null;
  const check = validatePassword(password);
  if (!check.valid) return NextResponse.json({ error: check.error }, { status: 400 });

  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken || accessToken.length > 4096) {
    return NextResponse.json({ error: "This recovery link is invalid or expired." }, { status: 401 });
  }

  try {
    const authUserId = await verifiedRecoveryIdentity(accessToken);
    if (!authUserId) return NextResponse.json({ error: "This recovery link is invalid or expired." }, { status: 401 });
    const completed = await completePasswordRecovery(authUserId, accessToken, password as string);
    if (!completed) return NextResponse.json({ error: "This recovery link has already been used or cannot reset this account." }, { status: 401 });
    return NextResponse.json({ ok: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("[auth/recovery] completion failed");
    return NextResponse.json({ error: "Password recovery is temporarily unavailable. Please try again later." }, { status: 503 });
  }
}
