import { NextResponse } from "next/server";

import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { getNativeEffort } from "@/services/native-effort";

export async function GET() {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    return NextResponse.json(await getNativeEffort(user.id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Effort data could not be loaded." }, { status: 500 });
  }
}
