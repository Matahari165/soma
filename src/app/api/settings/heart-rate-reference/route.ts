import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { loadHeartRateReferenceForUser, saveHeartRateReferenceForUser } from "@/services/heart-rate-reference";

const noStore = { "Cache-Control": "private, no-store" };
const referenceSchema = z.object({ personalBpm: z.number().int().min(80).max(250).nullable() }).strict();

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  try {
    return NextResponse.json(await loadHeartRateReferenceForUser(user.id), { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Heart-rate reference could not be loaded." }, { status: 500, headers: noStore });
  }
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  const parsed = referenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a whole number between 80 and 250 bpm, or leave it empty." }, { status: 400, headers: noStore });
  try {
    return NextResponse.json(await saveHeartRateReferenceForUser(user.id, parsed.data.personalBpm), { headers: noStore });
  } catch {
    return NextResponse.json({ error: "Heart-rate reference could not be saved." }, { status: 500, headers: noStore });
  }
}
