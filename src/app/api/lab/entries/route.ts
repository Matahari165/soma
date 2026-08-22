import { NextResponse } from "next/server";

import { normalizeJournalValue, saveJournalEntriesSchema, type JournalVariable } from "@/domain/lab/journal";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadJournalData } from "@/services/journal";

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = saveJournalEntriesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the journal values." }, { status: 400 });
  if (isLocalPreviewMode()) return NextResponse.json({ ok: true, preview: true });
  const journal = await loadJournalData(user.id);
  const variables = new Map(journal.variables.map((variable) => [variable.id, variable]));
  const normalized = parsed.data.entries.map((entry) => {
    const variable = variables.get(entry.variableId);
    if (!variable || !variable.isActive) return { ...entry, variable: null, value: null };
    const value = normalizeJournalValue(variable, entry.value);
    return { ...entry, variable, value, invalid: entry.value !== null && entry.value !== "" && value === null };
  });
  if (normalized.some((entry) => !entry.variable)) return NextResponse.json({ error: "One journal variable is unavailable." }, { status: 400 });
  if (normalized.some((entry) => "invalid" in entry && entry.invalid)) return NextResponse.json({ error: "One journal value is invalid." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const toDelete = normalized.filter((entry) => entry.value === null).map((entry) => entry.variableId);
  if (toDelete.length) {
    const { error } = await admin.from("journal_entries").delete().eq("user_id", user.id).eq("entry_date", parsed.data.entryDate).in("variable_id", toDelete);
    if (error) return NextResponse.json({ error: "Blank journal values could not be cleared." }, { status: 500 });
  }
  const rows = normalized.filter((entry): entry is typeof entry & { variable: JournalVariable; value: boolean | number | string } => entry.variable !== null && entry.value !== null).map((entry) => ({
    user_id: user.id,
    variable_id: entry.variableId,
    entry_date: parsed.data.entryDate,
    value: entry.value,
  }));
  if (rows.length) {
    const { error } = await admin.from("journal_entries").upsert(rows, { onConflict: "user_id,variable_id,entry_date" });
    if (error) return NextResponse.json({ error: "Your journal could not be saved." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, saved: rows.length, omitted: toDelete.length });
}
