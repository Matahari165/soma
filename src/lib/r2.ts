import "server-only";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { requireServerEnv } from "@/lib/env";

let client: S3Client | null = null;

export function r2ArchiveBucket() {
  return process.env.R2_ARCHIVE_BUCKET?.trim() || "soma-health-record-archives";
}

function r2Client() {
  if (client) return client;
  const accountId = requireServerEnv("R2_ACCOUNT_ID");
  client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: requireServerEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireServerEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
  return client;
}

export async function putR2ArchiveObject(key: string, body: Buffer) {
  await r2Client().send(new PutObjectCommand({
    Bucket: r2ArchiveBucket(),
    Key: key,
    Body: body,
    ContentType: "application/gzip",
    Metadata: { "soma-archive": "health-records-v1" },
  }));
}

export async function getR2ArchiveObject(key: string) {
  const response = await r2Client().send(new GetObjectCommand({ Bucket: r2ArchiveBucket(), Key: key }));
  if (!response.Body) throw new Error(`R2 archive is empty: ${key}.`);
  return Buffer.from(await response.Body.transformToByteArray());
}

export function createR2ArchiveDownloadUrl(key: string, expiresIn = 60 * 60) {
  return getSignedUrl(r2Client(), new GetObjectCommand({ Bucket: r2ArchiveBucket(), Key: key }), { expiresIn });
}
