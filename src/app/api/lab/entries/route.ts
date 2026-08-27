import { NextResponse } from "next/server";

import { normalizeJournalValue, saveJournalEntriesSchema } from "@/domain/lab/journal";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";
import { loadJournalData } from "@/services/journal";

function dateInTimezone(timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = saveJournalEntriesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the journal values." }, { status: 400 });
  if (isLocalPreviewMode()) return NextResponse.json({ ok: true, preview: true });
  const admin = createCloudflareAdminClient();
  const { data: profile } = await admin.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle();
  const today = dateInTimezone(profile?.timezone ?? "Europe/Paris");
  if (parsed.data.entryDate > today || parsed.data.entryDate < addDays(today, -4)) {
    return NextResponse.json({ error: "Journal drafts are available for today and the previous four days." }, { status: 400 });
  }
  const { data: day, error: dayError } = await admin.from("journal_days").select("status").eq("user_id", user.id).eq("entry_date", parsed.data.entryDate).maybeSingle();
  if (dayError) return NextResponse.json({ error: "This journal day could not be checked." }, { status: 500 });
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

  // Editing a validated day keeps it validated. This makes the updated values
  // immediately eligible for the Personal Lab matrix and preserves the cache
  // invalidation signal carried by journal_days.updated_at.
  const validating = parsed.data.mode === "validate" || day?.status === "validated";
  const payload = normalized.map((entry) => ({ variable_id: entry.variableId, value: entry.value }));
  const { error: saveError } = await admin.rpc("save_personal_lab_journal_day", {
    p_user_id: user.id,
    p_entry_date: parsed.data.entryDate,
    p_entries: payload,
    p_validate: validating,
    p_replace_omissions: parsed.data.mode === "validate",
  });
  if (saveError) {
    return NextResponse.json({ error: validating ? "This day could not be validated." : "This draft could not be saved." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, status: validating ? "validated" : "draft", saved: payload.filter((entry) => entry.value !== null).length, omitted: payload.filter((entry) => entry.value === null).length });
}
