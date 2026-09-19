import { NextResponse } from "next/server";

import { DELETE as deleteWebMeal, GET as getWebMeal, PATCH as patchWebMeal } from "@/app/api/meals/[id]/route";
import { getBearerSessionUser } from "@/lib/cloudflare/session";

type RouteContext = { params: Promise<{ id: string }> };

async function isAuthenticated() {
  return Boolean(await getBearerSessionUser());
}

export async function GET(request: Request, context: RouteContext) {
  if (!await isAuthenticated()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return getWebMeal(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!await isAuthenticated()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return patchWebMeal(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!await isAuthenticated()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return deleteWebMeal(request, context);
}
