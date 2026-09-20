import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteAccountData } from "@/services/account-deletion";

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await request.json().catch(() => null) as { confirmation?: unknown } | null;
  const result = await deleteAccountData(user.id, body?.confirmation);
  return NextResponse.json(result.ok ? result : { error: result.error }, { status: result.ok ? 200 : result.status });
}
