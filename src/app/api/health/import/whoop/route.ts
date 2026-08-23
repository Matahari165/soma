import { NextResponse } from "next/server";

import { validateWhoopImportBatch } from "@/domain/health/whoop-import";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recomputeUserHealth } from "@/services/analysis";

export const maxDuration = 60;

type ImportRequest = {
  records?: unknown;
  finalize?: unknown;
  expectedTotal?: unknown;
};

export async function POST(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin && origin !== requestOrigin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let input: ImportRequest;
  try {
    input = await request.json() as ImportRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let records;
  try {
    records = validateWhoopImportBatch(input.records);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid WHOOP records." }, { status: 400 });
  }
  if (input.finalize !== undefined && typeof input.finalize !== "boolean") {
    return NextResponse.json({ error: "finalize must be a boolean." }, { status: 400 });
  }
  if (input.expectedTotal !== undefined && (!Number.isInteger(input.expectedTotal) || Number(input.expectedTotal) < 1)) {
    return NextResponse.json({ error: "expectedTotal must be a positive integer." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error: importError } = await admin.from("health_records").upsert(
    records.map((record) => ({ ...record, user_id: user.id })),
    { onConflict: "user_id,provider,data_type,source_record_id" },
  );
  if (importError) return NextResponse.json({ error: "WHOOP records could not be stored." }, { status: 500 });

  if (!input.finalize) return NextResponse.json({ imported: records.length, finalized: false });

  const { count, error: countError } = await admin.from("health_records")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("provider", "whoop_export");
  if (countError) return NextResponse.json({ error: "WHOOP records could not be verified." }, { status: 500 });
  if (typeof input.expectedTotal === "number" && count !== input.expectedTotal) {
    return NextResponse.json({ error: `WHOOP import is incomplete: ${count ?? 0}/${input.expectedTotal} records.`, imported: records.length }, { status: 409 });
  }

  try {
    const analysis = await recomputeUserHealth(user.id);
    return NextResponse.json({ imported: records.length, finalized: true, total: count ?? 0, analysis });
  } catch (error) {
    console.error("[api/health/import/whoop] analysis failed", { error: error instanceof Error ? error.message : "Unknown error." });
    return NextResponse.json({ error: "WHOOP records were stored, but health analysis could not be refreshed.", imported: records.length, total: count ?? 0 }, { status: 500 });
  }
}
