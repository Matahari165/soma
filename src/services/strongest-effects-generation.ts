import "server-only";

import { createHash } from "node:crypto";

/** Opaque identity for one exact matrix snapshot; never contains health data. */
export function strongestEffectsGeneration(matrix: unknown) {
  return createHash("sha256").update(JSON.stringify(matrix) ?? "").digest("base64url");
}
