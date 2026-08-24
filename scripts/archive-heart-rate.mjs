import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzip, gzip } from "node:zlib";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const ARCHIVE_BUCKET = "health-record-archives";
const ARCHIVE_FORMAT = "soma-health-record-archive";
const ARCHIVE_VERSION = 1;
const PAGE_SIZE = 1_000;
const PAGE_CONCURRENCY = 4;
let r2 = null;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function utcDayRange(value) {
  const start = new Date(value);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function encodeArchive({ userId, provider, dataType, rangeStart, rangeEnd, rows }) {
  if (!rows.length) throw new Error("Cannot encode an empty health archive.");
  const header = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    userId,
    provider,
    dataType,
    rangeStart,
    rangeEnd,
    rowCount: rows.length,
  };
  const content = Buffer.from(`${[JSON.stringify(header), ...rows.map((row) => JSON.stringify(row))].join("\n")}\n`);
  const object = await gzipAsync(content, { level: 9, mtime: 0 });
  return {
    header,
    content,
    object,
    contentSha256: sha256(content),
    objectSha256: sha256(object),
  };
}

export async function decodeArchive(object) {
  const content = await gunzipAsync(object);
  const lines = content.toString("utf8").trimEnd().split("\n");
  const header = JSON.parse(lines.shift() ?? "null");
  if (header?.format !== ARCHIVE_FORMAT || header?.version !== ARCHIVE_VERSION) {
    throw new Error("Unsupported health archive format.");
  }
  const rows = lines.map((line) => JSON.parse(line));
  if (rows.length !== header.rowCount) throw new Error("Health archive row count mismatch.");
  return { header, rows, content, contentSha256: sha256(content), objectSha256: sha256(object) };
}

function required(value, name) {
  if (!value) throw new Error(`${name} is required.`);
  return value.replace(/\/$/, "");
}

function apiHeaders(secret, extra = {}) {
  return { apikey: secret, ...extra };
}

function r2Bucket() {
  return process.env.R2_ARCHIVE_BUCKET?.trim() || "soma-health-record-archives";
}

function r2Client() {
  if (r2) return r2;
  const accountId = required(process.env.R2_ACCOUNT_ID, "R2_ACCOUNT_ID");
  r2 = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: required(process.env.R2_ACCESS_KEY_ID, "R2_ACCESS_KEY_ID"),
      secretAccessKey: required(process.env.R2_SECRET_ACCESS_KEY, "R2_SECRET_ACCESS_KEY"),
    },
  });
  return r2;
}

async function getR2Object(objectPath) {
  const response = await r2Client().send(new GetObjectCommand({ Bucket: r2Bucket(), Key: objectPath }));
  if (!response.Body) throw new Error(`R2 archive is empty: ${objectPath}.`);
  return Buffer.from(await response.Body.transformToByteArray());
}

async function putR2Object(objectPath, object) {
  await r2Client().send(new PutObjectCommand({
    Bucket: r2Bucket(),
    Key: objectPath,
    Body: object,
    ContentType: "application/gzip",
    Metadata: { "soma-archive": "health-records-v1" },
  }));
}

async function request(url, options = {}) {
  const retryableStatuses = new Set([429, 500, 502, 503, 504]);
  let lastError = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      const detail = (await response.text()).slice(0, 500);
      if (!retryableStatuses.has(response.status) || attempt === 4) {
        throw new Error(`${options.method ?? "GET"} ${new URL(url).pathname} failed (${response.status}): ${detail}`);
      }
      lastError = new Error(detail || `HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === 4) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
  }
  throw lastError instanceof Error ? lastError : new Error(`Request failed: ${new URL(url).pathname}`);
}

function restUrl(baseUrl, table, query = {}) {
  const url = new URL(`/rest/v1/${table}`, baseUrl);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  return url;
}

async function fetchRows({ baseUrl, secret, table, query, order }) {
  const url = restUrl(baseUrl, table, { ...query, ...(order ? { order } : {}) });
  const pageOptions = (from, count = false) => ({
    headers: apiHeaders(secret, {
      Range: `${from}-${from + PAGE_SIZE - 1}`,
      "Range-Unit": "items",
      ...(count ? { Prefer: "count=exact" } : {}),
    }),
  });
  const pageRequest = (from) => request(url, pageOptions(from));
  let firstResponse;
  try {
    firstResponse = await fetch(url, pageOptions(0, true));
  } catch {
    firstResponse = null;
  }
  if (!firstResponse?.ok) firstResponse = await pageRequest(0);
  const rows = await firstResponse.json();
  if (rows.length < PAGE_SIZE) return rows;
  const total = Number(firstResponse.headers.get("content-range")?.split("/")[1]);
  if (!Number.isFinite(total)) {
    for (let from = PAGE_SIZE; ; from += PAGE_SIZE) {
      const page = await (await pageRequest(from)).json();
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows;
    }
  }
  const offsets = [];
  for (let from = PAGE_SIZE; from < total; from += PAGE_SIZE) offsets.push(from);
  for (let index = 0; index < offsets.length; index += PAGE_CONCURRENCY) {
    const pages = await Promise.all(offsets.slice(index, index + PAGE_CONCURRENCY).map(async (from) => (
      (await pageRequest(from)).json()
    )));
    for (const page of pages) rows.push(...page);
  }
  return rows;
}

async function profile({ baseUrl, secret, userId }) {
  const query = { user_id: `eq.${userId}`, data_type: "eq.heart-rate", select: "measured_at,source_record_id" };
  const [oldest, latest, countResponse] = await Promise.all([
    fetchRows({ baseUrl, secret, table: "health_records", query: { ...query, limit: 1 }, order: "measured_at.asc,source_record_id.asc" }),
    fetchRows({ baseUrl, secret, table: "health_records", query: { ...query, limit: 1 }, order: "measured_at.desc,source_record_id.desc" }),
    request(restUrl(baseUrl, "health_records", query), {
      method: "HEAD",
      headers: apiHeaders(secret, { Prefer: "count=planned" }),
    }),
  ]);
  const estimatedTotal = Number(countResponse.headers.get("content-range")?.split("/")[1] ?? 0);
  return { estimatedTotal, oldest: oldest[0]?.measured_at ?? null, latest: latest[0]?.measured_at ?? null };
}

async function fetchHealthRecordDay({ baseUrl, secret, userId, rangeStart, rangeEnd }) {
  const rows = [];
  let cursor = null;
  for (;;) {
    const query = {
      user_id: `eq.${userId}`,
      provider: "eq.google_health",
      data_type: "eq.heart-rate",
      and: `(measured_at.gte.${rangeStart},measured_at.lt.${rangeEnd})`,
      ...(cursor ? { or: `(measured_at.gt.${cursor.measured_at},and(measured_at.eq.${cursor.measured_at},id.gt.${cursor.id}))` } : {}),
      select: "*",
      limit: PAGE_SIZE,
      order: "measured_at.asc,id.asc",
    };
    const page = await (await request(restUrl(baseUrl, "health_records", query), {
      headers: apiHeaders(secret),
    })).json();
    if (!page.length) return rows;
    const last = page.at(-1);
    if (cursor && last.measured_at === cursor.measured_at && last.id === cursor.id) {
      throw new Error(`Heart-rate archive cursor did not advance for ${rangeStart}.`);
    }
    rows.push(...page);
    cursor = { measured_at: last.measured_at, id: last.id };
    if (page.length < PAGE_SIZE) return rows;
  }
}

function storageObjectUrl(baseUrl, objectPath, authenticated = false) {
  const encoded = objectPath.split("/").map(encodeURIComponent).join("/");
  const access = authenticated ? "authenticated/" : "";
  return new URL(`/storage/v1/object/${access}${ARCHIVE_BUCKET}/${encoded}`, baseUrl);
}

async function uploadAndVerify({ objectPath, archive }) {
  await putR2Object(objectPath, archive.object);
  const downloaded = await getR2Object(objectPath);
  const decoded = await decodeArchive(downloaded);
  if (decoded.objectSha256 !== archive.objectSha256 || decoded.contentSha256 !== archive.contentSha256) {
    throw new Error(`Uploaded archive checksum mismatch for ${objectPath}.`);
  }
  return decoded;
}

async function upsertManifest({ baseUrl, secret, manifest }) {
  const response = await request(restUrl(baseUrl, "health_record_archives", {
    on_conflict: "user_id,provider,data_type,range_start,range_end",
  }), {
    method: "POST",
    headers: apiHeaders(secret, { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify(manifest),
  });
  return (await response.json())[0];
}

function archiveObjectPath(userId, rangeStart) {
  const date = rangeStart.slice(0, 10);
  return `${userId}/heart-rate/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}.jsonl.gz`;
}

async function archiveDay({ baseUrl, secret, userId, rangeStart, rangeEnd }) {
  const rows = await fetchHealthRecordDay({ baseUrl, secret, userId, rangeStart, rangeEnd });
  if (!rows.length) return null;
  const archive = await encodeArchive({ userId, provider: "google_health", dataType: "heart-rate", rangeStart, rangeEnd, rows });
  const objectPath = archiveObjectPath(userId, rangeStart);
  const decoded = await uploadAndVerify({ objectPath, archive });
  const first = rows[0];
  const last = rows.at(-1);
  const manifest = await upsertManifest({
    baseUrl,
    secret,
    manifest: {
      user_id: userId,
      provider: "google_health",
      data_type: "heart-rate",
      range_start: rangeStart,
      range_end: rangeEnd,
      object_path: objectPath,
      storage_backend: "r2",
      storage_bucket: r2Bucket(),
      row_count: rows.length,
      uncompressed_bytes: archive.content.length,
      compressed_bytes: archive.object.length,
      content_sha256: archive.contentSha256,
      object_sha256: archive.objectSha256,
      first_source_record_id: first.source_record_id,
      last_source_record_id: last.source_record_id,
      verified_at: new Date().toISOString(),
    },
  });
  if (decoded.rows.length !== manifest.row_count) throw new Error(`Manifest mismatch for ${objectPath}.`);
  return manifest;
}

async function listManifests({ baseUrl, secret, userId, cutoff }) {
  return fetchRows({
    baseUrl,
    secret,
    table: "health_record_archives",
    query: {
      user_id: `eq.${userId}`,
      data_type: "eq.heart-rate",
      range_end: `lte.${cutoff}`,
      select: "*",
    },
    order: "range_start.asc",
  });
}

async function verifyManifest({ baseUrl, secret, manifest }) {
  const object = manifest.storage_backend === "r2"
    ? await getR2Object(manifest.object_path)
    : Buffer.from(await (await request(storageObjectUrl(baseUrl, manifest.object_path, true), { headers: apiHeaders(secret) })).arrayBuffer());
  const decoded = await decodeArchive(object);
  const matches = decoded.rows.length === manifest.row_count
    && decoded.contentSha256 === manifest.content_sha256
    && decoded.objectSha256 === manifest.object_sha256
    && Date.parse(decoded.header.rangeStart) === Date.parse(manifest.range_start)
    && Date.parse(decoded.header.rangeEnd) === Date.parse(manifest.range_end);
  if (!matches) throw new Error(`Archive verification failed for ${manifest.object_path}.`);
  return decoded.rows.length;
}

async function reclaimManifest({ baseUrl, secret, manifest }) {
  const response = await request(restUrl(baseUrl, "rpc/reclaim_verified_health_archive"), {
    method: "POST",
    headers: apiHeaders(secret, { "Content-Type": "application/json" }),
    body: JSON.stringify({ p_archive_id: manifest.id }),
  });
  return Number(await response.json());
}

function parseArguments(argv) {
  const [command = "profile", ...rest] = argv;
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) values.set(rest[index], rest[index + 1]);
  return { command, keepDays: Number(values.get("--keep-days") ?? 7), userId: values.get("--user-id") ?? null };
}

async function migrateManifestsToR2({ baseUrl, secret, manifests }) {
  let migratedArchives = 0;
  let migratedRows = 0;
  for (const manifest of manifests.filter((item) => item.storage_backend !== "r2")) {
    const source = Buffer.from(await (await request(storageObjectUrl(baseUrl, manifest.object_path, true), { headers: apiHeaders(secret) })).arrayBuffer());
    const decoded = await decodeArchive(source);
    if (decoded.rows.length !== manifest.row_count || decoded.contentSha256 !== manifest.content_sha256 || decoded.objectSha256 !== manifest.object_sha256) {
      throw new Error(`Legacy archive verification failed for ${manifest.object_path}.`);
    }
    await putR2Object(manifest.object_path, source);
    const copied = await decodeArchive(await getR2Object(manifest.object_path));
    if (copied.contentSha256 !== manifest.content_sha256 || copied.objectSha256 !== manifest.object_sha256) {
      throw new Error(`R2 copy verification failed for ${manifest.object_path}.`);
    }
    await request(restUrl(baseUrl, "health_record_archives", { id: `eq.${manifest.id}` }), {
      method: "PATCH",
      headers: apiHeaders(secret, { "Content-Type": "application/json" }),
      body: JSON.stringify({ storage_backend: "r2", storage_bucket: r2Bucket() }),
    });
    migratedArchives += 1;
    migratedRows += manifest.row_count;
    console.log(`migrated ${manifest.object_path}: ${manifest.row_count} rows`);
  }
  return { migratedArchives, migratedRows };
}

async function resolveUserId({ baseUrl, secret, configuredUserId }) {
  if (configuredUserId) return configuredUserId;
  const profiles = await fetchRows({ baseUrl, secret, table: "profiles", query: { select: "user_id", limit: 2 }, order: "user_id.asc" });
  if (profiles.length !== 1) throw new Error("--user-id is required when the project contains zero or multiple profiles.");
  return profiles[0].user_id;
}

async function main() {
  const { command, keepDays, userId: configuredUserId } = parseArguments(process.argv.slice(2));
  const baseUrl = required(process.env.SOMA_SUPABASE_URL, "SOMA_SUPABASE_URL");
  const secretPath = process.env.SOMA_SUPABASE_SECRET_FILE ?? "/tmp/soma-supabase-secret";
  const secret = (await readFile(secretPath, "utf8")).trim();
  const userId = await resolveUserId({ baseUrl, secret, configuredUserId });
  const current = await profile({ baseUrl, secret, userId });
  if (command === "profile") {
    console.log(JSON.stringify({ userId, ...current }, null, 2));
    return;
  }
  if (!current.oldest || !current.latest) throw new Error("No heart-rate records are available.");
  const cutoffDate = new Date(current.latest);
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - keepDays);
  cutoffDate.setUTCHours(0, 0, 0, 0);
  const cutoff = cutoffDate.toISOString();

  if (command === "migrate-r2") {
    const manifests = await listManifests({ baseUrl, secret, userId, cutoff: new Date("9999-12-31T00:00:00.000Z").toISOString() });
    console.log(JSON.stringify(await migrateManifestsToR2({ baseUrl, secret, manifests }), null, 2));
    return;
  }

  if (command === "archive") {
    const existingManifests = await listManifests({ baseUrl, secret, userId, cutoff });
    const existingByStart = new Map(existingManifests.map((manifest) => [Date.parse(manifest.range_start), manifest]));
    let cursor = new Date(current.oldest);
    cursor.setUTCHours(0, 0, 0, 0);
    let archivedRows = 0;
    let archiveCount = 0;
    let createdArchiveCount = 0;
    while (cursor < cutoffDate) {
      const { start, end } = utcDayRange(cursor);
      const existing = existingByStart.get(Date.parse(start));
      const manifest = existing ?? await archiveDay({ baseUrl, secret, userId, rangeStart: start, rangeEnd: end });
      if (manifest) {
        archiveCount += 1;
        archivedRows += manifest.row_count;
        if (!existing) {
          createdArchiveCount += 1;
          console.log(`archived ${start.slice(0, 10)}: ${manifest.row_count} rows, ${manifest.compressed_bytes} bytes`);
        }
      }
      cursor = new Date(end);
    }
    console.log(JSON.stringify({ archiveCount, createdArchiveCount, archivedRows, cutoff }, null, 2));
    return;
  }

  const manifests = await listManifests({ baseUrl, secret, userId, cutoff });
  if (!manifests.length) throw new Error("No archive manifests were found for the reclaimable range.");
  let verifiedRows = 0;
  for (const manifest of manifests) verifiedRows += await verifyManifest({ baseUrl, secret, manifest });
  if (command === "verify") {
    console.log(JSON.stringify({ archiveCount: manifests.length, verifiedRows, cutoff }, null, 2));
    return;
  }
  if (command !== "reclaim") throw new Error(`Unknown command: ${command}`);
  let reclaimedRows = 0;
  for (const manifest of manifests) {
    if (!manifest.reclaimed_at) reclaimedRows += await reclaimManifest({ baseUrl, secret, manifest });
  }
  console.log(JSON.stringify({ archiveCount: manifests.length, verifiedRows, reclaimedRows, cutoff }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
