import "server-only";

import {
  supplementDefinitionInputSchema,
  supplementDefinitionRecordSchema,
  supplementDefinitionUpdateSchema,
  supplementEntryInputSchema,
  supplementEntryRecordSchema,
  supplementEntryUpdateSchema,
  type SupplementDefinition,
  type SupplementDefinitionInput,
  type SupplementDefinitionUpdate,
  type SupplementEntry,
  type SupplementEntryInput,
  type SupplementEntryUpdate,
} from "@/domain/supplements";
import { cloudflareDb, createCloudflareAdminClient, stableIdentity } from "@/lib/cloudflare/db";
import { isLocalPreviewMode } from "@/lib/env";

const DEFINITION_TABLE = "supplement_definitions" as const;
const ENTRY_TABLE = "supplement_entries" as const;
type SupplementTable = typeof DEFINITION_TABLE | typeof ENTRY_TABLE;
export class SupplementServiceError extends Error {
  constructor(readonly code: "not_found" | "invalid" | "unavailable", message: string) {
    super(message);
    this.name = "SupplementServiceError";
  }
}

const definitionPreviewStore = new Map<string, Map<string, SupplementDefinition>>();
const entryPreviewStore = new Map<string, Map<string, SupplementEntry>>();

function userStore<T>(store: Map<string, Map<string, T>>, userId: string) {
  let values = store.get(userId);
  if (!values) {
    values = new Map();
    store.set(userId, values);
  }
  return values;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function invalidInput(message = "Le complément n’est pas valide.") {
  return new SupplementServiceError("invalid", message);
}

function parseDefinition(input: unknown): SupplementDefinitionInput {
  const parsed = supplementDefinitionInputSchema.safeParse(input);
  if (!parsed.success) throw invalidInput("La définition du complément est invalide.");
  return { ...parsed.data, usageInstruction: parsed.data.usageInstruction ?? null };
}

function parseDefinitionUpdate(input: unknown): SupplementDefinitionUpdate {
  const parsed = supplementDefinitionUpdateSchema.safeParse(input);
  if (!parsed.success) throw invalidInput("La modification du complément est invalide.");
  return parsed.data;
}

function parseEntry(input: unknown): SupplementEntryInput {
  const parsed = supplementEntryInputSchema.safeParse(input);
  if (!parsed.success) throw invalidInput("La prise du complément est invalide.");
  return parsed.data;
}

function parseEntryUpdate(input: unknown): SupplementEntryUpdate {
  const parsed = supplementEntryUpdateSchema.safeParse(input);
  if (!parsed.success) throw invalidInput("La modification de la prise est invalide.");
  return parsed.data;
}

function definitionFromRow(row: unknown) {
  const value = row && typeof row === "object" ? row as Record<string, unknown> : {};
  const parsed = supplementDefinitionRecordSchema.safeParse({
    id: value.id,
    productName: value.productName ?? value.product_name,
    brand: value.brand,
    category: value.category,
    source: value.source,
    sourceReference: value.sourceReference ?? value.source_reference,
    serving: value.serving,
    nutrients: value.nutrients,
    frequency: value.frequency,
    usageInstruction: value.usageInstruction ?? value.usage_instruction ?? null,
    notes: value.notes,
    archivedAt: value.archivedAt ?? value.archived_at ?? null,
    userId: value.userId ?? value.user_id,
    createdAt: value.createdAt ?? value.created_at,
    updatedAt: value.updatedAt ?? value.updated_at,
  });
  if (!parsed.success) throw new Error("Stored supplement definition is invalid.");
  return parsed.data;
}

function entryFromRow(row: unknown) {
  const value = row && typeof row === "object" ? row as Record<string, unknown> : {};
  const parsed = supplementEntryRecordSchema.safeParse({
    id: value.id,
    definitionId: value.definitionId ?? value.definition_id,
    entryDate: value.entryDate ?? value.entry_date,
    planned: value.planned,
    actual: value.actual,
    note: value.note,
    userId: value.userId ?? value.user_id,
    createdAt: value.createdAt ?? value.created_at,
    updatedAt: value.updatedAt ?? value.updated_at,
  });
  if (!parsed.success) throw new Error("Stored supplement entry is invalid.");
  return parsed.data;
}

function decodeStoredJson(jsonData: unknown) {
  if (typeof jsonData !== "string") return jsonData;
  try { return JSON.parse(jsonData) as unknown; }
  catch { throw new Error("Stored supplement JSON is invalid."); }
}

function supabaseRuntimeEnabled() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function payloadFromStoredRow(row: unknown) {
  if (row && typeof row === "object" && "json_data" in row) return decodeStoredJson((row as { json_data: unknown }).json_data);
  return decodeStoredJson(row);
}

function rowKey(table: SupplementTable, id: string) {
  return stableIdentity(table, { id }, "id");
}

function storedJson(record: SupplementDefinition | SupplementEntry) {
  if ("definitionId" in record) {
    return {
      id: record.id,
      user_id: record.userId,
      definition_id: record.definitionId,
      entry_date: record.entryDate,
      planned: record.planned,
      actual: record.actual,
      note: record.note,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    };
  }
  return {
    id: record.id,
    user_id: record.userId,
    product_name: record.productName,
    brand: record.brand,
    category: record.category,
    source: record.source,
    source_reference: record.sourceReference,
    serving: record.serving,
    nutrients: record.nutrients,
    frequency: record.frequency,
    usage_instruction: record.usageInstruction ?? null,
    notes: record.notes,
    archived_at: record.archivedAt ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

function unavailable(message: string) {
  return new SupplementServiceError("unavailable", message);
}

async function readRows(table: SupplementTable, userId: string, options: { from?: string; to?: string; definitionId?: string } = {}) {
  if (!supabaseRuntimeEnabled()) {
    const predicates = ["table_name = ?", "user_id = ?"];
    const bindings: unknown[] = [table, userId];
    if (options.from) { predicates.push("json_extract(json_data, '$.entry_date') >= ?"); bindings.push(options.from); }
    if (options.to) { predicates.push("json_extract(json_data, '$.entry_date') <= ?"); bindings.push(options.to); }
    if (options.definitionId) { predicates.push("json_extract(json_data, '$.definition_id') = ?"); bindings.push(options.definitionId); }
    const result = await cloudflareDb().prepare(`SELECT json_data FROM soma_rows WHERE ${predicates.join(" AND ")} ORDER BY updated_at DESC`).bind(...bindings).all<{ json_data: string }>();
    if (!result.success) throw new Error(result.error ?? "Supplement rows could not be loaded.");
    return result.results ?? [];
  }
  let query = createCloudflareAdminClient().from(table).select("*").eq("user_id", userId).order("updated_at", { ascending: false });
  if (options.from) query = query.gte("entry_date", options.from);
  if (options.to) query = query.lte("entry_date", options.to);
  if (options.definitionId) query = query.eq("definition_id", options.definitionId);
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

async function findEntryForDate(userId: string, definitionId: string, entryDate: string) {
  const entries = await listSupplementEntries(userId, { from: entryDate, to: entryDate, definitionId });
  return entries.find((entry) => entry.definitionId === definitionId && entry.entryDate === entryDate) ?? null;
}

async function readRow(table: SupplementTable, userId: string, id: string) {
  if (!supabaseRuntimeEnabled()) {
    const result = await cloudflareDb().prepare("SELECT json_data FROM soma_rows WHERE table_name = ? AND row_key = ? AND user_id = ? LIMIT 1").bind(table, rowKey(table, id), userId).first<{ json_data: string }>();
    return result ? decodeStoredJson(result.json_data) : null;
  }
  const result = await createCloudflareAdminClient().from(table).select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data ? decodeStoredJson(result.data) : null;
}

async function insertRow(table: SupplementTable, userId: string, record: SupplementDefinition | SupplementEntry) {
  if (!supabaseRuntimeEnabled()) {
    const result = await cloudflareDb().prepare("INSERT INTO soma_rows (table_name, row_key, user_id, json_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(table, rowKey(table, record.id), userId, JSON.stringify(storedJson(record)), record.createdAt, record.updatedAt).run();
    if (!result.success) throw new Error(result.error ?? "Supplement row could not be inserted.");
    return;
  }
  const result = await createCloudflareAdminClient().from(table).insert(storedJson({ ...record, userId }));
  if (result.error) throw new Error(result.error.message);
}

async function updateRow(table: SupplementTable, userId: string, id: string, record: SupplementDefinition | SupplementEntry) {
  if (!supabaseRuntimeEnabled()) {
    const result = await cloudflareDb().prepare("UPDATE soma_rows SET json_data = ?, updated_at = ? WHERE table_name = ? AND row_key = ? AND user_id = ?")
      .bind(JSON.stringify(storedJson(record)), record.updatedAt, table, rowKey(table, id), userId).run();
    if (!result.success) throw new Error(result.error ?? "Supplement row could not be updated.");
    return Number(result.meta?.changes ?? 0) > 0;
  }
  const result = await createCloudflareAdminClient().from(table).update(storedJson({ ...record, userId })).eq("user_id", userId).eq("id", id).select("id").maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return Boolean(result.data);
}

async function deleteRow(table: SupplementTable, userId: string, id: string) {
  if (!supabaseRuntimeEnabled()) {
    const result = await cloudflareDb().prepare("DELETE FROM soma_rows WHERE table_name = ? AND row_key = ? AND user_id = ?")
      .bind(table, rowKey(table, id), userId).run();
    if (!result.success) throw new Error(result.error ?? "Supplement row could not be deleted.");
    return Number(result.meta?.changes ?? 0) > 0;
  }
  const result = await createCloudflareAdminClient().from(table).delete().eq("user_id", userId).eq("id", id).select("id").maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return Boolean(result.data);
}

export async function listSupplementDefinitions(userId: string) {
  if (isLocalPreviewMode()) return [...userStore(definitionPreviewStore, userId).values()].map(clone).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  try {
    return (await readRows(DEFINITION_TABLE, userId)).map((row) => definitionFromRow(payloadFromStoredRow(row)));
  } catch {
    throw unavailable("Les définitions de compléments sont momentanément indisponibles.");
  }
}

export async function findSupplementDefinition(userId: string, definitionId: string) {
  if (isLocalPreviewMode()) return clone(userStore(definitionPreviewStore, userId).get(definitionId) ?? null);
  try {
    const row = await readRow(DEFINITION_TABLE, userId, definitionId);
    return row ? definitionFromRow(row) : null;
  } catch {
    throw unavailable("La définition du complément est momentanément indisponible.");
  }
}

export async function createSupplementDefinition(userId: string, input: unknown) {
  const parsed = parseDefinition(input);
  const now = new Date().toISOString();
  const definition = supplementDefinitionRecordSchema.parse({ ...parsed, usageInstruction: parsed.usageInstruction ?? null, archivedAt: null, id: crypto.randomUUID(), userId, createdAt: now, updatedAt: now });
  if (isLocalPreviewMode()) {
    userStore(definitionPreviewStore, userId).set(definition.id, definition);
    return clone(definition);
  }
  try {
    await insertRow(DEFINITION_TABLE, userId, definition);
    return definition;
  } catch {
    throw unavailable("La définition du complément n’a pas pu être enregistrée.");
  }
}

export async function updateSupplementDefinition(userId: string, definitionId: string, input: unknown) {
  const parsed = parseDefinitionUpdate(input);
  const existing = await findSupplementDefinition(userId, definitionId);
  if (!existing) throw new SupplementServiceError("not_found", "Définition de complément introuvable.");
  const updated = supplementDefinitionRecordSchema.parse({ ...existing, ...parsed, updatedAt: new Date().toISOString() });
  if (isLocalPreviewMode()) {
    userStore(definitionPreviewStore, userId).set(definitionId, updated);
    return clone(updated);
  }
  try {
    if (!await updateRow(DEFINITION_TABLE, userId, definitionId, updated)) throw new SupplementServiceError("not_found", "Définition de complément introuvable.");
    return updated;
  } catch (error) {
    if (error instanceof SupplementServiceError) throw error;
    throw unavailable("La définition du complément n’a pas pu être modifiée.");
  }
}

export async function archiveSupplementDefinition(userId: string, definitionId: string, archivedAt = new Date().toISOString()) {
  const existing = await findSupplementDefinition(userId, definitionId);
  if (!existing) throw new SupplementServiceError("not_found", "Définition de complément introuvable.");
  const updated = supplementDefinitionRecordSchema.parse({ ...existing, archivedAt, updatedAt: new Date().toISOString() });
  if (isLocalPreviewMode()) {
    userStore(definitionPreviewStore, userId).set(definitionId, updated);
    return clone(updated);
  }
  try {
    if (!await updateRow(DEFINITION_TABLE, userId, definitionId, updated)) throw new SupplementServiceError("not_found", "Définition de complément introuvable.");
    return updated;
  } catch (error) {
    if (error instanceof SupplementServiceError) throw error;
    throw unavailable("Le complément n’a pas pu être archivé.");
  }
}

/**
 * Kept as a compatibility alias for older callers. New flows must archive so
 * that the definition and all intake history remain available.
 */
export async function deleteSupplementDefinition(userId: string, definitionId: string) {
  await archiveSupplementDefinition(userId, definitionId);
  return true;
}

export async function listSupplementEntries(userId: string, options: { from?: string; to?: string; definitionId?: string } = {}) {
  if (isLocalPreviewMode()) {
    return [...userStore(entryPreviewStore, userId).values()]
      .filter((entry) => (!options.from || entry.entryDate >= options.from) && (!options.to || entry.entryDate <= options.to) && (!options.definitionId || entry.definitionId === options.definitionId))
      .map(clone)
      .sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.updatedAt.localeCompare(a.updatedAt));
  }
  try {
    return (await readRows(ENTRY_TABLE, userId, options)).map((row) => entryFromRow(payloadFromStoredRow(row)));
  } catch {
    throw unavailable("Les prises de compléments sont momentanément indisponibles.");
  }
}

export async function findSupplementEntry(userId: string, entryId: string) {
  if (isLocalPreviewMode()) return clone(userStore(entryPreviewStore, userId).get(entryId) ?? null);
  try {
    const row = await readRow(ENTRY_TABLE, userId, entryId);
    return row ? entryFromRow(row) : null;
  } catch {
    throw unavailable("La prise de complément est momentanément indisponible.");
  }
}

async function ensureDefinition(userId: string, definitionId: string, options: { allowArchived?: boolean } = {}) {
  const definition = await findSupplementDefinition(userId, definitionId);
  if (!definition) throw new SupplementServiceError("invalid", "La définition du complément est introuvable.");
  if (definition.archivedAt && !options.allowArchived) throw new SupplementServiceError("invalid", "Ce complément est archivé.");
  return definition;
}

function dailyEntryId(definitionId: string, entryDate: string) {
  // Keep a deterministic id for the new daily flow. The FNV hash keeps
  // the record under the domain's 120-character limit even for legacy ids.
  let hash = 2166136261;
  for (const character of `${definitionId}:${entryDate}`) {
    hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 16777619) >>> 0;
  }
  return `daily_${hash.toString(16).padStart(8, "0")}_${entryDate}`;
}

function normalizedEntryInput(parsed: SupplementEntryInput, definition: SupplementDefinition): SupplementEntryInput {
  const planned = parsed.planned ?? { servings: 1, scheduledAt: null };
  const actual = parsed.actual ?? { status: "not_recorded" as const, servings: null, takenAt: null, note: null };
  return {
    ...parsed,
    planned,
    actual: actual.status === "taken" && actual.servings === null
      ? { ...actual, servings: planned.servings }
      : actual,
    // Reading the definition here makes the default explicit in the service
    // contract while keeping the configured quantity in `serving`.
    note: parsed.note ?? null,
    definitionId: definition.id,
  };
}

type SupplementEntryUpsertResult = { entry: SupplementEntry; created: boolean };

async function upsertSupplementEntryResult(userId: string, input: unknown): Promise<SupplementEntryUpsertResult> {
  const parsed = parseEntry(input);
  const definition = await ensureDefinition(userId, parsed.definitionId);
  const normalized = normalizedEntryInput(parsed, definition);
  const existing = await findEntryForDate(userId, normalized.definitionId, normalized.entryDate);
  const now = new Date().toISOString();
  if (existing) {
    const updated = supplementEntryRecordSchema.parse({ ...existing, ...normalized, id: existing.id, userId, createdAt: existing.createdAt, updatedAt: now });
    if (isLocalPreviewMode()) {
      userStore(entryPreviewStore, userId).set(existing.id, updated);
      return { entry: clone(updated), created: false };
    }
    try {
      if (!await updateRow(ENTRY_TABLE, userId, existing.id, updated)) throw new SupplementServiceError("not_found", "Prise de complément introuvable.");
      return { entry: updated, created: false };
    } catch (error) {
      if (error instanceof SupplementServiceError) throw error;
      throw unavailable("La prise de complément n’a pas pu être actualisée.");
    }
  }

  const entry = supplementEntryRecordSchema.parse({ ...normalized, id: dailyEntryId(normalized.definitionId, normalized.entryDate), userId, createdAt: now, updatedAt: now });
  if (isLocalPreviewMode()) {
    userStore(entryPreviewStore, userId).set(entry.id, entry);
    return { entry: clone(entry), created: true };
  }
  try {
    await insertRow(ENTRY_TABLE, userId, entry);
    return { entry, created: true };
  } catch {
    // A concurrent retry can race the read above. Deterministic identity
    // makes the second request converge without creating another daily row.
    const concurrent = await findEntryForDate(userId, normalized.definitionId, normalized.entryDate);
    if (concurrent) {
      const updated = supplementEntryRecordSchema.parse({ ...concurrent, ...normalized, id: concurrent.id, userId, createdAt: concurrent.createdAt, updatedAt: new Date().toISOString() });
      if (!await updateRow(ENTRY_TABLE, userId, concurrent.id, updated)) throw unavailable("La prise de complément n’a pas pu être actualisée.");
      return { entry: updated, created: false };
    }
    throw unavailable("La prise de complément n’a pas pu être enregistrée.");
  }
}

export async function upsertSupplementEntry(userId: string, input: unknown) {
  return upsertSupplementEntryResult(userId, input);
}

/** Compatibility name: creation now converges on the daily product/date row. */
export async function createSupplementEntry(userId: string, input: unknown) {
  return (await upsertSupplementEntryResult(userId, input)).entry;
}

export async function updateSupplementEntry(userId: string, entryId: string, input: unknown) {
  const parsed = parseEntryUpdate(input);
  const existing = await findSupplementEntry(userId, entryId);
  if (!existing) throw new SupplementServiceError("not_found", "Prise de complément introuvable.");
  const definitionId = parsed.definitionId ?? existing.definitionId;
  const entryDate = parsed.entryDate ?? existing.entryDate;
  const definition = await ensureDefinition(userId, definitionId, { allowArchived: true });
  const conflicting = await findEntryForDate(userId, definitionId, entryDate);
  if (conflicting && conflicting.id !== entryId) throw invalidInput("Une seule prise par complément et par jour est autorisée.");
  const mergedInput = {
    definitionId,
    entryDate,
    planned: parsed.planned ?? existing.planned,
    actual: parsed.actual ?? existing.actual,
    note: parsed.note ?? existing.note,
  } satisfies SupplementEntryInput;
  const normalized = normalizedEntryInput(mergedInput, definition);
  const updated = supplementEntryRecordSchema.parse({ ...existing, ...normalized, id: existing.id, userId, createdAt: existing.createdAt, updatedAt: new Date().toISOString() });
  if (isLocalPreviewMode()) {
    userStore(entryPreviewStore, userId).set(entryId, updated);
    return clone(updated);
  }
  try {
    if (!await updateRow(ENTRY_TABLE, userId, entryId, updated)) throw new SupplementServiceError("not_found", "Prise de complément introuvable.");
    return updated;
  } catch (error) {
    if (error instanceof SupplementServiceError) throw error;
    throw unavailable("La prise de complément n’a pas pu être modifiée.");
  }
}

export async function deleteSupplementEntry(userId: string, entryId: string) {
  const existing = await findSupplementEntry(userId, entryId);
  if (!existing) throw new SupplementServiceError("not_found", "Prise de complément introuvable.");
  if (isLocalPreviewMode()) {
    userStore(entryPreviewStore, userId).delete(entryId);
    return true;
  }
  try {
    if (!await deleteRow(ENTRY_TABLE, userId, entryId)) throw new SupplementServiceError("not_found", "Prise de complément introuvable.");
    return true;
  } catch (error) {
    if (error instanceof SupplementServiceError) throw error;
    throw unavailable("La prise de complément n’a pas pu être supprimée.");
  }
}

export function clearPreviewSupplements(userId: string) {
  definitionPreviewStore.delete(userId);
  entryPreviewStore.delete(userId);
}
