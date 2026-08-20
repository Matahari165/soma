import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyGoogleHealthWebhookWithKeyset } from "./webhook-signature";

function bytesField(field: number, value: Buffer) {
  return Buffer.concat([Buffer.from([(field << 3) | 2, value.length]), value]);
}

describe("Google Health webhook signatures", () => {
  it("verifies the Tink prefix and P-256 signature against the raw payload", () => {
    const keyId = 257403691;
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const jwk = publicKey.export({ format: "jwk" });
    const x = Buffer.concat([Buffer.from([0]), Buffer.from(jwk.x as string, "base64url")]);
    const y = Buffer.concat([Buffer.from([0]), Buffer.from(jwk.y as string, "base64url")]);
    const serializedKey = Buffer.concat([bytesField(3, x), bytesField(4, y)]);
    const body = '{"data":{"operation":"UPSERT"}}';
    const prefix = Buffer.alloc(5);
    prefix[0] = 1;
    prefix.writeUInt32BE(keyId, 1);
    const signature = Buffer.concat([prefix, sign("sha256", Buffer.from(body), privateKey)]).toString("base64");
    const keyset = { key: [{ keyId, status: "ENABLED", outputPrefixType: "TINK", keyData: { typeUrl: "type.googleapis.com/google.crypto.tink.EcdsaPublicKey", value: serializedKey.toString("base64"), keyMaterialType: "ASYMMETRIC_PUBLIC" } }] };

    expect(verifyGoogleHealthWebhookWithKeyset(body, signature, keyset)).toBe(true);
    expect(verifyGoogleHealthWebhookWithKeyset(`${body} `, signature, keyset)).toBe(false);
  });
});
