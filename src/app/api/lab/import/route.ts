import { NextResponse } from "next/server";

import { journalImportRequestSchema, type JournalImportResolutionMap } from "@/domain/lab/journal-import";
import { getCurrentUser } from "@/lib/auth";
import { isLocalPreviewMode } from "@/lib/env";
import { commitJournalImport, JournalImportConflictError, journalImportResponse, previewJournalImport } from "@/services/journal-import";

function resolutionMap(resolutions: Array<{ key: string; action: "keep_soma" | "use_sheet" }>): JournalImportResolutionMap {
  return Object.fromEntries(resolutions.map((resolution) => [resolution.key, resolution.action]));
}
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const parsed = journalImportRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Vérifie le JSON de l’onglet Goose et conserve uniquement la deuxième feuille." }, { status: 400 });
  if (isLocalPreviewMode()) return NextResponse.json({ ok: true, preview: true, mode: parsed.data.mode });

  const resolutions = resolutionMap(parsed.data.resolutions);
  try {
    if (parsed.data.mode === "preview") {
      const result = await previewJournalImport(user.id, parsed.data.source, resolutions);
      return NextResponse.json({ ok: true, mode: "preview", ...journalImportResponse(result) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const result = await commitJournalImport(user.id, parsed.data.source, resolutions);
    return NextResponse.json({ ok: true, mode: "commit", ...journalImportResponse(result) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof JournalImportConflictError) {
      return NextResponse.json({ ok: false, mode: parsed.data.mode, error: "Choisis une source pour chaque conflit avant l’import.", ...journalImportResponse({ plan: error.plan, dateRange: { from: parsed.data.source.rows.at(0)?.date ?? null, to: parsed.data.source.rows.at(-1)?.date ?? null } }) }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "L’import du journal a échoué." }, { status: 500 });
  }
}
