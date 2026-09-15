import { describe, expect, it } from "vitest";

import {
  generateSalt,
  hashPassword,
  normalizeEmail,
  validateEmail,
  validatePassword,
  verifyPassword,
} from "./auth-credentials";

describe("auth-credentials", () => {
  it("normalizes emails properly", () => {
    expect(normalizeEmail("  Test.User@Example.COM  ")).toBe("test.user@example.com");
  });

  it("validates email formats", () => {
    expect(validateEmail("hello@soma.fit").valid).toBe(true);
    expect(validateEmail("invalid-email").valid).toBe(false);
    expect(validateEmail("").valid).toBe(false);
  });

  it("validates password length", () => {
    expect(validatePassword("short").valid).toBe(false);
    expect(validatePassword("1234567").valid).toBe(false);
    expect(validatePassword("12345678").valid).toBe(true);
    expect(validatePassword("super-secure-passphrase-123").valid).toBe(true);
  });

  it("hashes and verifies passwords using PBKDF2 WebCrypto", async () => {
    const password = "mySecretPassword2026!";
    const salt = generateSalt();

    expect(salt).toHaveLength(32); // 16 bytes = 32 hex chars

    const hash1 = await hashPassword(password, salt);
    expect(hash1).toHaveLength(64); // 32 bytes = 64 hex chars

    // Verifying same password matches
    const matches = await verifyPassword(password, hash1, salt);
    expect(matches).toBe(true);

    // Verifying wrong password fails
    const wrongMatches = await verifyPassword("wrongPassword", hash1, salt);
    expect(wrongMatches).toBe(false);
  });
});
