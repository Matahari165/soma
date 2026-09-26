import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { allImportedExercises } from "@/services/health-analytics";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  const span = (Date.parse(to) - Date.parse(from)) / 86_400_000;
  if (!validDate(from) || !validDate(to) || span < 0 || span > 179) return NextResponse.json({ error: "Choose a period of up to 180 days." }, { status: 400 });
  try {
    return NextResponse.json({ exercises: await allImportedExercises(user.id, { from, to }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Exercise history could not be loaded." }, { status: 503 });
  }
}
