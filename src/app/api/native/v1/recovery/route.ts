import { NextResponse } from "next/server";

import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { getNativeRecovery } from "@/services/native-recovery";

export async function GET() {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    const recovery = await getNativeRecovery(user.id);
    return NextResponse.json(recovery, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Recovery data could not be loaded." }, { status: 500 });
  }
}
