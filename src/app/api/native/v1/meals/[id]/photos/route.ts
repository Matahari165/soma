import { NextResponse } from "next/server";

import { GET as getWebPhotos, POST as postWebPhotos } from "@/app/api/meals/[id]/photos/route";
import { getBearerSessionUser } from "@/lib/cloudflare/session";

type RouteContext = { params: Promise<{ id: string }> };

async function isAuthenticated() {
  return Boolean(await getBearerSessionUser());
}

export async function GET(request: Request, context: RouteContext) {
  if (!await isAuthenticated()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return getWebPhotos(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  if (!await isAuthenticated()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return postWebPhotos(request, context);
}
