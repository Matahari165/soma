import { NextResponse } from "next/server";

import { getBearerSessionUser, listDeviceSessions } from "@/lib/cloudflare/session";

export async function GET() {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return NextResponse.json({ sessions: await listDeviceSessions(user.id) }, { headers: { "Cache-Control": "private, no-store" } });
}
