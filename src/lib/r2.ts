import "server-only";

import { cloudflareArchives } from "@/lib/cloudflare/db";
import { getSiteUrl } from "@/lib/env";

export function r2ArchiveBucket() {
  return "soma-health-record-archives";
}
export async function putR2ArchiveObject(key: string, body: Buffer) {
  await cloudflareArchives().put(key, body, {
    httpMetadata: { contentType: "application/gzip" },
    customMetadata: { "soma-archive": "health-records-v1" },
  });
}

export async function getR2ArchiveObject(key: string) {
  const object = await cloudflareArchives().get(key);
  if (!object) throw new Error(`R2 archive is missing: ${key}.`);
  return Buffer.from(await object.arrayBuffer());
}

export async function putR2JsonObject(key: string, value: unknown, cacheType: string) {
  await cloudflareArchives().put(key, JSON.stringify(value), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { "soma-cache": cacheType },
  });
}

export async function getR2JsonObject(key: string) {
  const object = await cloudflareArchives().get(key);
  if (!object) return null;
  return JSON.parse(Buffer.from(await object.arrayBuffer()).toString("utf8")) as unknown;
}

export function createR2ArchiveDownloadUrl(key: string) {
  const url = new URL("/api/account/archive", getSiteUrl());
  url.searchParams.set("key", key);
  return url.toString();
}
