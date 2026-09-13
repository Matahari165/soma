import "server-only";

import { cloudflareArchives } from "@/lib/cloudflare/db";
import { getSiteUrl } from "@/lib/env";

type S3ClientInstance = import("@aws-sdk/client-s3").S3Client;

type R2ObjectLike = {
  body: ReadableStream<Uint8Array> | null;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

let s3ClientPromise: Promise<S3ClientInstance> | null = null;

function hasS3Config() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY,
  );
}

function r2BucketName() {
  return process.env.R2_BUCKET_NAME || process.env.R2_ARCHIVE_BUCKET || "soma-health-record-archives";
}

async function getS3Client() {
  if (!hasS3Config()) throw new Error("R2 S3 credentials are not configured.");
  if (!s3ClientPromise) {
    s3ClientPromise = import("@aws-sdk/client-s3").then(({ S3Client }) => new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
      },
    }));
  }
  return s3ClientPromise;
}

async function getS3Object(key: string): Promise<R2ObjectLike | null> {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const response = await (await getS3Client()).send(new GetObjectCommand({ Bucket: r2BucketName(), Key: key }));
  if (!response.Body) return null;
  const bytes = await response.Body.transformToByteArray();
  const buffer = Buffer.from(bytes);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  return { body: new Response(buffer).body, arrayBuffer: async () => arrayBuffer };
}

async function getStorageObject(key: string) {
  if (hasS3Config()) return getS3Object(key);
  return cloudflareArchives().get(key) as Promise<R2ObjectLike | null>;
}

async function putStorageObject(key: string, body: ArrayBuffer | Buffer | string, options: { contentType: string; cacheControl?: string; metadata?: Record<string, string> }) {
  if (!hasS3Config()) {
    await cloudflareArchives().put(key, body, {
      httpMetadata: { contentType: options.contentType, cacheControl: options.cacheControl },
      customMetadata: options.metadata,
    });
    return;
  }
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const payload = body instanceof ArrayBuffer ? new Uint8Array(body) : body;
  await (await getS3Client()).send(new PutObjectCommand({
    Bucket: r2BucketName(),
    Key: key,
    Body: payload,
    ContentType: options.contentType,
    CacheControl: options.cacheControl,
    Metadata: options.metadata,
  }));
}

export async function deleteR2Object(key: string) {
  if (!hasS3Config()) {
    await cloudflareArchives().delete(key);
    return;
  }
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  await (await getS3Client()).send(new DeleteObjectCommand({ Bucket: r2BucketName(), Key: key }));
}

export function r2ArchiveBucket() {
  return r2BucketName();
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
  await putStorageObject(key, body, {
    contentType: mimeType,
    cacheControl: "private, no-store",
    metadata: { "soma-object": "meal-photo-v1" },
  });
}

export async function getR2MealPhotoObject(key: string) {
  return getStorageObject(key);
}

export async function deleteR2MealPhotoObject(key: string) {
  await deleteR2Object(key);
}
export async function putR2ArchiveObject(key: string, body: Buffer) {
  await putStorageObject(key, body, {
    contentType: "application/gzip",
    metadata: { "soma-archive": "health-records-v1" },
  });
}

export async function getR2ArchiveObject(key: string) {
  const object = await getStorageObject(key);
  if (!object) throw new Error(`R2 archive is missing: ${key}.`);
  return Buffer.from(await object.arrayBuffer());
}

export async function putR2JsonObject(key: string, value: unknown, cacheType: string) {
  await putStorageObject(key, JSON.stringify(value), {
    contentType: "application/json",
    metadata: { "soma-cache": cacheType },
  });
}

export async function getR2JsonObject(key: string) {
  const object = await getStorageObject(key);
  if (!object) return null;
  return JSON.parse(Buffer.from(await object.arrayBuffer()).toString("utf8")) as unknown;
}

export function createR2ArchiveDownloadUrl(key: string) {
  const url = new URL("/api/account/archive", getSiteUrl());
  url.searchParams.set("key", key);
  return url.toString();
}
