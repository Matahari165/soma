#!/usr/bin/env node

/**
 * One-time, resumable-ish copy of Soma's D1 runtime tables into the clean
 * Supabase project. R2 is deliberately not copied: it remains the file store.
 *
 * Required environment variables:
 *   CLOUDFLARE_API_TOKEN       read-only D1 API token
 *   CLOUDFLARE_ACCOUNT_ID
 *   D1_DATABASE_ID
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  server-only write key
 *
 * The script prints counts and byte totals only. It never prints row values,
 * health payloads, OAuth data, or credentials.
 */

const BATCH_SIZE = 500;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const cloudflareToken = required("CLOUDFLARE_API_TOKEN");
const accountId = required("CLOUDFLARE_ACCOUNT_ID");
const databaseId = required("D1_DATABASE_ID");
const supabaseUrl = required("SUPABASE_URL").replace(/\/$/, "");
const supabaseKey = required("SUPABASE_SERVICE_ROLE_KEY");

async function cloudflareQuery(sql, params = []) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${cloudflareToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });
  const body = await response.json();
  if (!response.ok || body.success !== true) throw new Error(`Cloudflare D1 query failed (${response.status}).`);
  return body.result?.[0]?.results ?? [];
}

async function supabaseRequest(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("apikey", supabaseKey);
  headers.set("authorization", `Bearer ${supabaseKey}`);
  headers.set("content-type", "application/json");
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}).`);
  const responseText = await response.text();
  if (!responseText.trim()) return null;
  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error(`Supabase returned invalid JSON for ${path} (${response.status}).`);
  }
}

async function supabaseCount(table) {
  const headers = new Headers({ apikey: supabaseKey, authorization: `Bearer ${supabaseKey}`, prefer: "count=exact" });
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=table_name&limit=1`, { headers });
  if (!response.ok) throw new Error(`Supabase count failed (${response.status}).`);
  const range = response.headers.get("content-range") ?? "*/0";
  return Number(range.split("/").at(-1) ?? 0);
}

async function copyPhysicalTable(table, columns, orderBy, onConflict) {
  let offset = 0;
  let copied = 0;
  while (true) {
    const rows = await cloudflareQuery(`SELECT ${columns} FROM ${table} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [BATCH_SIZE, offset]);
    if (!rows.length) break;
    await supabaseRequest(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });
    copied += rows.length;
    offset += rows.length;
    process.stdout.write(`Copied ${table}: ${copied}\n`);
  }
  return copied;
}

async function copyRuntimeRows() {
  let offset = 0;
  let copied = 0;
  let jsonBytes = 0;
  while (true) {
    const rows = await cloudflareQuery(
      "SELECT table_name, row_key, user_id, json_data, created_at, updated_at FROM soma_rows ORDER BY table_name, row_key LIMIT ? OFFSET ?",
      [BATCH_SIZE, offset],
    );
    if (!rows.length) break;
    const payload = rows.map((row) => ({
      table_name: row.table_name,
      row_key: row.row_key,
      user_id: row.user_id ?? null,
      json_data: typeof row.json_data === "string" ? JSON.parse(row.json_data) : row.json_data,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
    }));
    jsonBytes += payload.reduce((total, row) => total + JSON.stringify(row.json_data).length, 0);
    await supabaseRequest("soma_rows?on_conflict=table_name%2Crow_key", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(payload),
    });
    copied += rows.length;
    offset += rows.length;
    process.stdout.write(`Copied soma_rows: ${copied}\n`);
  }
  return { copied, jsonBytes };
}

async function main() {
  const users = await copyPhysicalTable("soma_users", "id, google_subject, email, display_name, avatar_url, created_at, updated_at", "id", "google_subject");
  const rows = await copyRuntimeRows();
  const sessions = await copyPhysicalTable("soma_sessions", "token_hash, session_id, user_id, platform, device_name, expires_at, created_at", "token_hash", "token_hash");
  const [sourceCount] = await cloudflareQuery("SELECT COUNT(*) AS count, SUM(length(json_data)) AS json_bytes FROM soma_rows");
  const targetSomaRows = await supabaseCount("soma_rows");
  console.log(JSON.stringify({
    users,
    somaRowsCopied: rows.copied,
    somaRowsJsonBytesCopied: rows.jsonBytes,
    sessions,
    sourceSomaRows: Number(sourceCount?.count ?? 0),
    sourceJsonBytes: Number(sourceCount?.json_bytes ?? 0),
    targetSomaRows,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Migration failed.");
  process.exitCode = 1;
});
