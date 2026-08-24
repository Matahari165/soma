import { NextResponse } from "next/server";

import { createJournalVariableSchema, updateJournalVariableSchema } from "@/domain/lab/journal";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = createJournalVariableSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check this variable." }, { status: 400 });
  if (isLocalPreviewMode()) return NextResponse.json({ ok: true, preview: true });
  const admin = createSupabaseAdminClient();
  const { data: existing, error: countError } = await admin.from("journal_variables").select("position").eq("user_id", user.id);
  if (countError) return NextResponse.json({ error: "Your journal could not be checked." }, { status: 500 });
  if ((existing?.length ?? 0) >= 50) return NextResponse.json({ error: "Your journal already has 50 variables." }, { status: 409 });
  const input = parsed.data;
  const { data, error } = await admin.from("journal_variables").insert({
    user_id: user.id,
    name: input.name,
    variable_type: input.variableType,
    unit: input.unit || null,
    options: input.options,
    emoji: input.emoji,
    default_value: input.defaultValue ?? null,
    day_period: input.dayPeriod,
    position: Math.max(190, ...(existing ?? []).map((variable) => Number(variable.position) || 0)) + 10,
  }).select("id").single();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "A variable with this name already exists." : "This variable could not be created." }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = updateJournalVariableSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check this variable." }, { status: 400 });
  if (isLocalPreviewMode()) return NextResponse.json({ ok: true, preview: true });
  const { id, name, variableType, unit, options, position, isActive, emoji, defaultValue, dayPeriod } = parsed.data;
  const admin = createSupabaseAdminClient();
  if (variableType !== undefined) {
    const { count, error: countError } = await admin.from("journal_entries").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("variable_id", id);
    if (countError) return NextResponse.json({ error: "This measure could not be checked." }, { status: 500 });
    if ((count ?? 0) > 0) return NextResponse.json({ error: "A measure type cannot change after data is recorded. Archive it and create a new measure." }, { status: 409 });
  }
  const updates = {
    ...(name !== undefined ? { name } : {}),
    ...(variableType !== undefined ? { variable_type: variableType } : {}),
    ...(unit !== undefined ? { unit: unit || null } : {}),
    ...(options !== undefined ? { options } : {}),
    ...(position !== undefined ? { position } : {}),
    ...(isActive !== undefined ? { is_active: isActive } : {}),
    ...(emoji !== undefined ? { emoji } : {}),
    ...(defaultValue !== undefined ? { default_value: defaultValue } : {}),
    ...(dayPeriod !== undefined ? { day_period: dayPeriod } : {}),
  };
  const { data, error } = await admin.from("journal_variables").update(updates).eq("id", id).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.code === "23505" ? "A variable with this name already exists." : "This variable could not be updated." }, { status: error.code === "23505" ? 409 : 500 });
  if (!data) return NextResponse.json({ error: "Variable not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = updateJournalVariableSchema.pick({ id: true }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid variable." }, { status: 400 });
  if (isLocalPreviewMode()) return NextResponse.json({ ok: true, preview: true });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("journal_variables").update({ is_active: false }).eq("id", parsed.data.id).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "This variable could not be archived." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Variable not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
