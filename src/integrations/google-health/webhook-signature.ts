import { createPublicKey, verify } from "node:crypto";

const GOOGLE_KEYSET_URL = "https://www.gstatic.com/googlehealthapi/webhooks/webhooks_public_keyset.json";
const KEYSET_TTL_MS = 6 * 60 * 60 * 1000;

type TinkKeyset = {
  key: Array<{
    keyId: number;
    status: string;
    outputPrefixType: string;
    keyData: { typeUrl: string; value: string; keyMaterialType: string };
  }>;
};

let cachedKeyset: { value: TinkKeyset; expiresAt: number } | null = null;
let pendingKeyset: Promise<TinkKeyset> | null = null;

function readVarint(buffer: Buffer, offset: number) {
  let value = 0;
  let shift = 0;
  let cursor = offset;
  while (cursor < buffer.length && shift <= 28) {
    const byte = buffer[cursor];
    value |= (byte & 0x7f) << shift;
    cursor += 1;
    if ((byte & 0x80) === 0) return { value: value >>> 0, offset: cursor };
    shift += 7;
  }
  throw new Error("Invalid Google Health public key encoding.");
}

function protobufBytes(buffer: Buffer, targetField: number) {
  let offset = 0;
  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset);
    offset = tag.offset;
    const field = tag.value >>> 3;
    const wireType = tag.value & 7;
    if (wireType === 0) {
      offset = readVarint(buffer, offset).offset;
      continue;
    }
    if (wireType !== 2) throw new Error("Unsupported Google Health public key encoding.");
    const length = readVarint(buffer, offset);
    offset = length.offset;
    const end = offset + length.value;
    if (end > buffer.length) throw new Error("Invalid Google Health public key length.");
    if (field === targetField) return buffer.subarray(offset, end);
    offset = end;
  }
  throw new Error(`Google Health public key field ${targetField} is missing.`);
}

function p256Coordinate(value: Buffer) {
  const normalized = value.length === 33 && value[0] === 0 ? value.subarray(1) : value;
  if (normalized.length !== 32) throw new Error("Google Health public key is not P-256.");
  return normalized.toString("base64url");
}

function validateKeyset(value: unknown): TinkKeyset {
  if (!value || typeof value !== "object" || !("key" in value) || !Array.isArray(value.key)) {
    throw new Error("Google Health public keyset is invalid.");
  }
  return value as TinkKeyset;
}

async function fetchGoogleHealthKeyset(forceRefresh = false) {
  if (!forceRefresh && cachedKeyset && cachedKeyset.expiresAt > Date.now()) return cachedKeyset.value;
  if (!pendingKeyset) {
    pendingKeyset = fetch(GOOGLE_KEYSET_URL, { cache: "no-store", signal: AbortSignal.timeout(5_000) })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Google Health public keyset returned ${response.status}.`);
        const value = validateKeyset(await response.json());
        cachedKeyset = { value, expiresAt: Date.now() + KEYSET_TTL_MS };
        return value;
      })
      .finally(() => { pendingKeyset = null; });
  }
  return pendingKeyset;
}

export function verifyGoogleHealthWebhookWithKeyset(rawBody: string, encodedSignature: string, keyset: TinkKeyset) {
  let signed: Buffer;
  try { signed = Buffer.from(encodedSignature, "base64"); } catch { return false; }
  if (signed.length <= 5 || signed[0] !== 1) return false;
  const keyId = signed.readUInt32BE(1);
  const key = keyset.key.find((candidate) => candidate?.keyId === keyId && candidate.status === "ENABLED" && candidate.outputPrefixType === "TINK");
  if (!key?.keyData || key.keyData.typeUrl !== "type.googleapis.com/google.crypto.tink.EcdsaPublicKey" || key.keyData.keyMaterialType !== "ASYMMETRIC_PUBLIC") return false;

  try {
    const serialized = Buffer.from(key.keyData.value, "base64");
    const publicKey = createPublicKey({
      key: { kty: "EC", crv: "P-256", x: p256Coordinate(protobufBytes(serialized, 3)), y: p256Coordinate(protobufBytes(serialized, 4)) },
      format: "jwk",
    });
    return verify("sha256", Buffer.from(rawBody), publicKey, signed.subarray(5));
  } catch {
    return false;
  }
}

export async function verifyGoogleHealthWebhookSignature(rawBody: string, encodedSignature: string | null) {
  if (!encodedSignature) return false;
  const keyset = await fetchGoogleHealthKeyset();
  if (verifyGoogleHealthWebhookWithKeyset(rawBody, encodedSignature, keyset)) return true;
  const signed = Buffer.from(encodedSignature, "base64");
  if (signed.length <= 5 || signed[0] !== 1) return false;
  const keyId = signed.readUInt32BE(1);
  if (keyset.key.some((candidate) => candidate?.keyId === keyId)) return false;
  return verifyGoogleHealthWebhookWithKeyset(rawBody, encodedSignature, await fetchGoogleHealthKeyset(true));
}
