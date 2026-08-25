import { NextResponse } from "next/server";

import { cloudflareArchives } from "@/lib/cloudflare/db";
import { getCurrentUser } from "@/lib/auth";
import { createCloudflareAdminClient } from "@/lib/cloudflare/db";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return NextResponse.json({ error: "Archive path is required." }, { status: 400 });
  const admin = createCloudflareAdminClient();
  const { data: manifest } = await admin.from("health_record_archives").select("id").eq("user_id", user.id).eq("object_path", key).maybeSingle();
  if (!manifest) return NextResponse.json({ error: "Archive not found." }, { status: 404 });
  const object = await cloudflareArchives().get(key);
  if (!object?.body) return NextResponse.json({ error: "Archive not found." }, { status: 404 });
  const contentType = key.endsWith(".tar.zst") || key.endsWith(".zst")
    ? "application/zstd"
    : key.endsWith(".json") ? "application/json" : "application/gzip";
  return new Response(object.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${key.split("/").at(-1) ?? "soma-archive"}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
