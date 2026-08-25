import { createHash } from "node:crypto";
import { gunzip, gzip } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const ARCHIVE_FORMAT = "soma-health-record-archive";
const ARCHIVE_VERSION = 1;

export function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function utcDayRange(value: string | Date) {
  const start = new Date(value);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function encodeHealthArchive(input: {
  userId: string;
  provider: string;
  dataType: string;
  rangeStart: string;
  rangeEnd: string;
  rows: Array<Record<string, unknown>>;
}) {
  if (!input.rows.length) throw new Error("Cannot encode an empty health archive.");
  const header = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    userId: input.userId,
    provider: input.provider,
    dataType: input.dataType,
    rangeStart: input.rangeStart,
    rangeEnd: input.rangeEnd,
    rowCount: input.rows.length,
  };
  const content = Buffer.from(`${[JSON.stringify(header), ...input.rows.map((row) => JSON.stringify(row))].join("\n")}\n`);
  const object = await gzipAsync(content, { level: 9 });
  return { header, content, object, contentSha256: sha256(content), objectSha256: sha256(object) };
}

export async function decodeHealthArchive(object: Buffer) {
  const content = await gunzipAsync(object);
  const lines = content.toString("utf8").trimEnd().split("\n");
  const header = JSON.parse(lines.shift() ?? "null") as Record<string, unknown> | null;
  if (header?.format !== ARCHIVE_FORMAT || header.version !== ARCHIVE_VERSION) throw new Error("Unsupported health archive format.");
  const rows = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  if (rows.length !== header.rowCount) throw new Error("Health archive row count mismatch.");
  return { header, rows, content, contentSha256: sha256(content), objectSha256: sha256(object) };
}
