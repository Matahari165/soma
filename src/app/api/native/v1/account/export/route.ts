import { NextResponse } from "next/server";

import { GET as getWebExport } from "@/app/api/account/export/route";
import { getBearerSessionUser } from "@/lib/cloudflare/session";

function nativePath(path: unknown) {
  if (typeof path !== "string") return path;
  if (path.startsWith("/api/account/archive?")) return path.replace("/api/account/archive?", "/api/native/v1/account/archive?");
  if (path.startsWith("/api/meals/")) return path.replace("/api/meals/", "/api/native/v1/meals/");
  return path;
}

export async function GET() {
  if (!await getBearerSessionUser()) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const response = await getWebExport();
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return response;
  const body = await response.json() as {
    archiveDownloads?: Array<Record<string, unknown>>;
    mealPhotoDownloads?: Array<Record<string, unknown>>;
  };
  body.archiveDownloads = body.archiveDownloads?.map((item) => ({ ...item, signedUrl: nativePath(item.signedUrl) }));
  body.mealPhotoDownloads = body.mealPhotoDownloads?.map((item) => ({ ...item, path: nativePath(item.path) }));
  return new NextResponse(JSON.stringify(body, null, 2), {
    status: response.status,
    headers: response.headers,
  });
}
