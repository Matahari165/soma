import { NextResponse } from "next/server";

import { supplementEntryToView, supplementEntryUpdateSchema } from "@/domain/supplements";
import { getCurrentUser } from "@/lib/auth";
import { deleteSupplementEntry, findSupplementEntry, SupplementServiceError, updateSupplementEntry } from "@/services/supplements";

const noStore = { "Cache-Control": "private, no-store" };

function serviceError(error: unknown) {
  if (!(error instanceof SupplementServiceError)) return NextResponse.json({ error: "La prise de complément est momentanément indisponible." }, { status: 500, headers: noStore });
  return NextResponse.json({ error: error.message, code: error.code }, { status: error.code === "invalid" ? 400 : error.code === "not_found" ? 404 : 503, headers: noStore });
}
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  try {
    const entry = await findSupplementEntry(user.id, (await context.params).id);
    return entry ? NextResponse.json({ entry: supplementEntryToView(entry) }, { headers: noStore }) : NextResponse.json({ error: "Prise de complément introuvable.", code: "not_found" }, { status: 404, headers: noStore });
  } catch (error) {
    return serviceError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = supplementEntryUpdateSchema.safeParse(body?.entry ?? body);
  if (!parsed.success) return NextResponse.json({ error: "La modification de la prise est invalide." }, { status: 400, headers: noStore });
  try {
    const entry = await updateSupplementEntry(user.id, (await context.params).id, parsed.data);
    return NextResponse.json({ entry: supplementEntryToView(entry) }, { headers: noStore });
  } catch (error) {
    return serviceError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  try {
    await deleteSupplementEntry(user.id, (await context.params).id);
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return serviceError(error);
  }
}
