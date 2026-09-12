import { afterEach, describe, expect, it, vi } from "vitest";

const d1State = vi.hoisted(() => ({
  inserted: null as { sql: string; bindings: unknown[] } | null,
  rows: [] as Array<{ json_data: string }>,
}));

vi.mock("@/lib/cloudflare/db", () => ({
  stableIdentity: (_table: string, row: { id: string }) => encodeURIComponent(JSON.stringify([["id", row.id]])),
  cloudflareDb: () => ({
    prepare(sql: string) {
      let bindings: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          bindings = values;
          return this;
        },
        async run() {
          if (sql.startsWith("INSERT INTO")) d1State.inserted = { sql, bindings };
          return { success: true, meta: { changes: 1 } };
        },
        async all<T>() {
          return { success: true, results: d1State.rows as T[] };
        },
        async first<T>() {
          return null as T | null;
        },
      };
    },
  }),
}));

import { archiveSupplementDefinition, clearPreviewSupplements, createSupplementDefinition, listSupplementDefinitions, listSupplementEntries, upsertSupplementEntry } from "./supplements";

describe("supplement service preview", () => {
  const userId = "supplement-test-user";

  afterEach(() => {
    delete process.env.SOMA_LOCAL_PREVIEW;
    clearPreviewSupplements(userId);
    d1State.inserted = null;
    d1State.rows = [];
  });

  it("creates one configured product, records daily statuses, and preserves history", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    const definition = await createSupplementDefinition(userId, {
      productName: "Oméga-3 test",
      category: "vitamin_mineral",
      source: "product_label",
      serving: { quantity: 2, unit: "capsule", label: "2 capsules" },
      nutrients: [{ key: "omega_3", label: "Oméga-3", amount: 500, unit: "mg" }],
      frequency: { kind: "daily", timesPerDay: 1 },
      usageInstruction: "Avec un repas contenant du gras",
    });
    expect(definition.usageInstruction).toBe("Avec un repas contenant du gras");
    expect(definition.archivedAt).toBeNull();

    const notRecorded = await upsertSupplementEntry(userId, { definitionId: definition.id, entryDate: "2026-09-12", status: "not_recorded" });
    expect(notRecorded.created).toBe(true);
    expect(notRecorded.entry.actual).toMatchObject({ status: "not_recorded", servings: null });

    const taken = await upsertSupplementEntry(userId, { definitionId: definition.id, entryDate: "2026-09-12", status: "taken" });
    expect(taken.created).toBe(false);
    expect(taken.entry.id).toBe(notRecorded.entry.id);
    expect(taken.entry.actual).toMatchObject({ status: "taken", servings: 1 });

    const skipped = await upsertSupplementEntry(userId, { definitionId: definition.id, entryDate: "2026-09-12", status: "skipped" });
    expect(skipped.entry.id).toBe(taken.entry.id);
    expect(skipped.entry.actual).toMatchObject({ status: "skipped", servings: null });

    const nextDay = await upsertSupplementEntry(userId, { definitionId: definition.id, entryDate: "2026-09-13", status: "taken" });
    expect(nextDay.created).toBe(true);
    expect(nextDay.entry.id).not.toBe(skipped.entry.id);
    expect((await listSupplementEntries(userId, { definitionId: definition.id })).length).toBe(2);

    const archived = await archiveSupplementDefinition(userId, definition.id);
    expect(archived.archivedAt).toEqual(expect.any(String));
    await expect(upsertSupplementEntry(userId, { definitionId: definition.id, entryDate: "2026-09-14", status: "taken" })).rejects.toMatchObject({ code: "invalid" });
    expect((await listSupplementDefinitions(userId)).find((item) => item.id === definition.id)?.archivedAt).toEqual(archived.archivedAt);
    expect((await listSupplementEntries(userId, { definitionId: definition.id })).map((entry) => entry.entryDate)).toEqual(["2026-09-13", "2026-09-12"]);

    const replacement = await createSupplementDefinition(userId, {
      productName: "Oméga-3 replacement",
      category: "other",
      source: "personal_record",
      serving: { quantity: 1, unit: "capsule", label: "1 capsule" },
      nutrients: [],
      frequency: { kind: "daily", timesPerDay: 1 },
    });
    expect(replacement.id).not.toBe(definition.id);
    expect((await listSupplementEntries(userId, { definitionId: definition.id })).length).toBe(2);
  });

  it("serializes and deserializes nested JSON rows through soma_rows", async () => {
    delete process.env.SOMA_LOCAL_PREVIEW;
    const definition = await createSupplementDefinition("d1-user", {
      productName: "Magnésium D1",
      category: "vitamin_mineral",
      source: "product_label",
      serving: { quantity: 2, unit: "capsule", label: "2 gélules" },
      nutrients: [{ key: "magnesium", label: "Magnésium", amount: 200, unit: "mg" }],
      frequency: { kind: "daily", timesPerDay: 1 },
    });
    expect(d1State.inserted?.sql).toContain("INSERT INTO soma_rows");
    expect(d1State.inserted?.bindings[0]).toBe("supplement_definitions");
    expect(d1State.inserted?.bindings[2]).toBe("d1-user");
    const stored = JSON.parse(String(d1State.inserted?.bindings[3])) as Record<string, unknown>;
    expect(stored).toMatchObject({ user_id: "d1-user", product_name: "Magnésium D1", nutrients: [{ key: "magnesium", amount: 200, unit: "mg" }] });
    expect(stored.userId).toBeUndefined();

    d1State.rows = [{ json_data: JSON.stringify(stored) }];
    const loaded = await listSupplementDefinitions("d1-user");
    expect(loaded[0]).toMatchObject({ id: definition.id, userId: "d1-user", nutrients: [{ label: "Magnésium", amount: 200 }] });
  });
});
