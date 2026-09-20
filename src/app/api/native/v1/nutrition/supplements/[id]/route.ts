import { NextResponse } from "next/server";

import { supplementDefinitionToView, supplementDefinitionUpdateSchema } from "@/domain/supplements";
import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { archiveSupplementDefinition, findSupplementDefinition, SupplementServiceError, updateSupplementDefinition } from "@/services/supplements";

const noStore = { "Cache-Control": "private, no-store" };

function serviceError(error: unknown) {
  if (!(error instanceof SupplementServiceError)) {
    return NextResponse.json({ error: "La définition du complément est momentanément indisponible." }, { status: 500, headers: noStore });
  }
  const status = error.code === "invalid" ? 400 : error.code === "not_found" ? 404 : 503;
  return NextResponse.json({ error: error.message, code: error.code }, { status, headers: noStore });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  try {
    const definition = await findSupplementDefinition(user.id, (await context.params).id);
    return definition
      ? NextResponse.json({ definition: supplementDefinitionToView(definition) }, { headers: noStore })
      : NextResponse.json({ error: "Définition de complément introuvable.", code: "not_found" }, { status: 404, headers: noStore });
  } catch (error) {
    return serviceError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const parsed = supplementDefinitionUpdateSchema.safeParse(body?.definition ?? body);
  if (!parsed.success) return NextResponse.json({ error: "La modification du complément est invalide." }, { status: 400, headers: noStore });
  try {
    const definition = await updateSupplementDefinition(user.id, (await context.params).id, parsed.data);
    return NextResponse.json({ definition: supplementDefinitionToView(definition) }, { headers: noStore });
  } catch (error) {
    return serviceError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getBearerSessionUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: noStore });
  try {
    const definition = await archiveSupplementDefinition(user.id, (await context.params).id);
    return NextResponse.json({ definition: supplementDefinitionToView(definition) }, { headers: noStore });
  } catch (error) {
    return serviceError(error);
  }
}
