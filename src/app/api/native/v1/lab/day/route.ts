import { NextResponse } from "next/server";
import { z } from "zod";

import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { getNativeLabDay } from "@/services/native-lab";

const dateQuerySchema = z.object({ date: z.iso.date() });

export async function GET(request: Request) {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const parsed = dateQuerySchema.safeParse({ date: new URL(request.url).searchParams.get("date") });
  if (!parsed.success) return NextResponse.json({ error: "The journal date is invalid." }, { status: 400 });

  try {
    const day = await getNativeLabDay(user.id, parsed.data.date);
    return NextResponse.json(day, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "The Personal Lab day could not be loaded." }, { status: 500 });
  }
}
