import { NextResponse } from "next/server";

import { DELETE as deleteWebPhoto, GET as getWebPhoto, PATCH as patchWebPhoto } from "@/app/api/meals/[id]/photos/[photoId]/route";
import { getBearerSessionUser } from "@/lib/cloudflare/session";

type RouteContext = { params: Promise<{ id: string; photoId: string }> };

async function isAuthenticated() {
  return Boolean(await getBearerSessionUser());
}

export async function GET(request: Request, context: RouteContext) {
  if (!await isAuthenticated()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return getWebPhoto(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!await isAuthenticated()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return patchWebPhoto(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!await isAuthenticated()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return deleteWebPhoto(request, context);
}
