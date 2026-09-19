import { createCloudflareAdminClient, cloudflareDb, hasSupabaseRuntime } from "@/lib/cloudflare/db";

export type CredentialsRecord = {
  user_id: string;
  email: string;
  password_hash: string;
  salt: string;
  created_at: string;
  updated_at: string;
};

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH_BYTES = 32;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validatePassword(password: unknown): { valid: boolean; error?: string } {
  if (typeof password !== "string" || password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters long." };
  }
  if (password.length > 128) {
    return { valid: false, error: "Password must be at most 128 characters long." };
  }
  return { valid: true };
}

export function validateEmail(email: string): { valid: boolean; error?: string } {
  const normalized = normalizeEmail(email);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!normalized || !emailRegex.test(normalized) || normalized.length > 254) {
    return { valid: false, error: "Please enter a valid email address." };
  }
  return { valid: true };
}

export function generateSalt(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );

  const saltBytes = new Uint8Array(
    salt.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) ?? [],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    passwordKey,
    KEY_LENGTH_BYTES * 8,
  );

  return Array.from(new Uint8Array(derivedBits), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(password: string, expectedHash: string, salt: string): Promise<boolean> {
  const computedHash = await hashPassword(password, salt);
  if (computedHash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHash.length; i++) {
    diff |= computedHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}

export async function findCredentialsByEmail(rawEmail: string): Promise<CredentialsRecord | null> {
  const email = normalizeEmail(rawEmail);
  if (hasSupabaseRuntime()) {
    const admin = createCloudflareAdminClient();
    const result = await admin.from("soma_credentials").select("*").eq("email", email).maybeSingle();
    if (result.error) {
      // If table does not exist or error, fallback to null
      return null;
    }
    return (result.data as CredentialsRecord) ?? null;
  }

  const db = cloudflareDb();
  try {
    const row = await db.prepare(
      "SELECT user_id, email, password_hash, salt, created_at, updated_at FROM soma_credentials WHERE email = ? LIMIT 1",
    ).bind(email).first<CredentialsRecord>();
    return row ?? null;
  } catch {
    return null;
  }
}

export async function createCredentialsUser(input: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<{ id: string; email: string; displayName: string }> {
  const email = normalizeEmail(input.email);
  const emailCheck = validateEmail(email);
  if (!emailCheck.valid) throw new Error(emailCheck.error);

  const passwordCheck = validatePassword(input.password);
  if (!passwordCheck.valid) throw new Error(passwordCheck.error);

  const existing = await findCredentialsByEmail(email);
  if (existing) {
    throw new Error("An account with this email address already exists.");
  }

  const userId = crypto.randomUUID();
  const salt = generateSalt();
  const passwordHash = await hashPassword(input.password, salt);
  const now = new Date().toISOString();
  const displayName = input.displayName?.trim() || email.split("@")[0] || "Soma user";

  if (hasSupabaseRuntime()) {
    const admin = createCloudflareAdminClient();
    // 1. Insert into soma_users
    const userResult = await admin.from("soma_users").insert({
      id: userId,
      google_subject: `credentials:${userId}`,
      email,
      display_name: displayName,
      created_at: now,
      updated_at: now,
    });
    if (userResult.error) {
      throw new Error(userResult.error.message || "Failed to create user record.");
    }

    // 2. Insert into soma_credentials
    const credResult = await admin.from("soma_credentials").insert({
      user_id: userId,
      email,
      password_hash: passwordHash,
      salt,
      created_at: now,
      updated_at: now,
    });
    if (credResult.error) {
      // Avoid leaving an account that cannot sign in if credential storage fails.
      await admin.from("soma_users").delete().eq("id", userId);
      throw new Error(credResult.error.message || "Failed to store user credentials.");
    }

    return { id: userId, email, displayName };
  }

  const db = cloudflareDb();
  const userStmt = db.prepare(
    "INSERT INTO soma_users (id, google_subject, email, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(userId, `credentials:${userId}`, email, displayName, now, now);

  const credStmt = db.prepare(
    "INSERT INTO soma_credentials (user_id, email, password_hash, salt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(userId, email, passwordHash, salt, now, now);

  const results = (await db.batch([userStmt, credStmt])) as Array<{ success?: boolean; error?: string }>;
  const failed = results.find((r) => !r.success);
  if (failed) {
    throw new Error(failed.error ?? "Failed to create account.");
  }

  return { id: userId, email, displayName };
}

export async function verifyCredentialsLogin(input: {
  email: string;
  password: string;
}): Promise<{ id: string; email: string; displayName: string }> {
  const email = normalizeEmail(input.email);
  const credentials = await findCredentialsByEmail(email);
  if (!credentials) {
    throw new Error("Invalid email or password.");
  }

  const matches = await verifyPassword(input.password, credentials.password_hash, credentials.salt);
  if (!matches) {
    throw new Error("Invalid email or password.");
  }

  // Fetch display name from soma_users
  let displayName = email.split("@")[0] || "Soma user";
  if (hasSupabaseRuntime()) {
    const admin = createCloudflareAdminClient();
    const userResult = await admin.from("soma_users").select("display_name").eq("id", credentials.user_id).maybeSingle();
    if (userResult.data?.display_name) {
      displayName = userResult.data.display_name;
    }
  } else {
    const db = cloudflareDb();
    const row = await db.prepare("SELECT display_name FROM soma_users WHERE id = ? LIMIT 1").bind(credentials.user_id).first<{ display_name: string }>();
    if (row?.display_name) {
      displayName = row.display_name;
    }
  }

  return { id: credentials.user_id, email, displayName };
}
