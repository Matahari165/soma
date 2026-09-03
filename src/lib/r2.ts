import "server-only";

import { cloudflareArchives } from "@/lib/cloudflare/db";
import { getSiteUrl } from "@/lib/env";

export function r2ArchiveBucket() {
  return "soma-health-record-archives";
}

/**
 * Meal photos share the existing private R2 binding, but use a separate
 * prefix and metadata marker so they can be deleted independently from health
 * archives. The path contains only a user id and random UUIDs; no food or
 * health information is put in the object key.
 */
export function mealPhotoObjectPath(userId: string, mealId: string, photoId: string, mimeType: string) {
  const extension = mimeType === "image/png"
    ? "png"
    : mimeType === "image/webp"
      ? "webp"
      : mimeType === "image/gif"
        ? "gif"
        : mimeType === "image/heic"
          ? "heic"
          : mimeType === "image/heif"
            ? "heif"
            : "jpg";
  return `meal-photos/${encodeURIComponent(userId)}/${encodeURIComponent(mealId)}/${encodeURIComponent(photoId)}.${extension}`;
}

export async function putR2MealPhotoObject(key: string, body: ArrayBuffer, mimeType: string) {
  await cloudflareArchives().put(key, body, {
    httpMetadata: { contentType: mimeType, cacheControl: "private, no-store" },
    customMetadata: { "soma-object": "meal-photo-v1" },
  });
}

export async function getR2MealPhotoObject(key: string) {
  return cloudflareArchives().get(key);
}

export async function deleteR2MealPhotoObject(key: string) {
  await cloudflareArchives().delete(key);
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
