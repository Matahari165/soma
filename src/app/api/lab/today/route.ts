import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getPersonalLabToday } from "@/services/personal-lab";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return NextResponse.json(await getPersonalLabToday(user), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
