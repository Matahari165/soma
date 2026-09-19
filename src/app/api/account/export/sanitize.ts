export function sanitizeExportRows(table: string, rows: unknown[]): unknown[] {
  if (table !== "profiles") return rows;
  return rows.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return row;
    const profile = { ...row } as Record<string, unknown>;
    delete profile.apple_health_sync_token;
    return profile;
  });
}
