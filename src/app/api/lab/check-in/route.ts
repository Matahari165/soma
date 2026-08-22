import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const rating = z.number().int().min(1).max(5).nullable();
const checkinSchema = z.object({
  checkinDate: z.iso.date(),
  energy: rating,
  focus: rating,
  stress: rating,
  mood: rating,
  soreness: rating,
  caffeineServings: z.number().min(0).max(20).nullable(),
  alcoholServings: z.number().min(0).max(20).nullable(),
  lateMeal: z.boolean().nullable(),
  illness: z.boolean().nullable(),
  deepWorkMinutesOverride: z.number().int().min(0).max(1440).nullable(),
});

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = checkinSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check every daily entry." }, { status: 400 });
  if (isLocalPreviewMode()) return NextResponse.json({ ok: true, preview: true, checkin: parsed.data });
  const input = parsed.data;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("daily_checkins").upsert({
    user_id: user.id,
    checkin_date: input.checkinDate,
    energy: input.energy,
    focus: input.focus,
    stress: input.stress,
    mood: input.mood,
    soreness: input.soreness,
    caffeine_servings: input.caffeineServings,
    alcohol_servings: input.alcoholServings,
    late_meal: input.lateMeal,
    illness: input.illness,
    deep_work_minutes_override: input.deepWorkMinutesOverride,
  }, { onConflict: "user_id,checkin_date" }).select("checkin_date,energy,focus,stress,mood,soreness,caffeine_servings,alcohol_servings,late_meal,illness,deep_work_minutes_override").single();
  if (error) return NextResponse.json({ error: "Your check-in could not be saved." }, { status: 500 });
  return NextResponse.json({ ok: true, checkin: data });
}
