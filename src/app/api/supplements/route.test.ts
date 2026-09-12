import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = { user: { id: "api-supplement-user", email: null, displayName: "Test" } as { id: string; email: string | null; displayName: string } | null };

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => authState.user) }));

import { DELETE as deleteDefinition, GET as getDefinition, PATCH as patchDefinition } from "./[id]/route";
import { GET as listDefinitions, POST as createDefinition } from "./route";
import { DELETE as deleteEntry, PATCH as patchEntry } from "./entries/[id]/route";
import { GET as listEntries, POST as createEntry } from "./entries/route";
import { clearPreviewSupplements } from "@/services/supplements";

const definitionPayload = {
  definition: {
    productName: "Créatine monohydrate",
    category: "creatine",
    source: "manufacturer",
    serving: { quantity: 5, unit: "g", label: "1 dose" },
    nutrients: [],
    frequency: { kind: "daily", timesPerDay: 1 },
  },
};

describe("supplements API", () => {
  beforeEach(() => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    authState.user = { id: "api-supplement-user", email: null, displayName: "Test" };
  });

  afterEach(() => {
    delete process.env.SOMA_LOCAL_PREVIEW;
    clearPreviewSupplements("api-supplement-user");
  });

  it("requires authentication", async () => {
    authState.user = null;
    expect((await listDefinitions()).status).toBe(401);
    expect((await createDefinition(new Request("https://soma.example/api/supplements", { method: "POST", body: JSON.stringify(definitionPayload) })) ).status).toBe(401);
  });

  it("supports definition and entry CRUD with a real intake separate from the plan", async () => {
    const created = await createDefinition(new Request("https://soma.example/api/supplements", { method: "POST", body: JSON.stringify(definitionPayload), headers: { "content-type": "application/json" } }));
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.definition).not.toHaveProperty("userId");
    const definition = createdBody.definition as { id: string; contributionScope: string };
    expect(definition.contributionScope).toBe("separate");
    expect((await listDefinitions()).status).toBe(200);

    const invalid = await createEntry(new Request("https://soma.example/api/supplements/entries", { method: "POST", body: JSON.stringify({ entry: { definitionId: definition.id, entryDate: "2026-09-12", planned: { servings: 1 }, actual: { status: "taken" } } }), headers: { "content-type": "application/json" } }));
    expect(invalid.status).toBe(400);
    const createdEntry = await createEntry(new Request("https://soma.example/api/supplements/entries", { method: "POST", body: JSON.stringify({ entry: { definitionId: definition.id, entryDate: "2026-09-12", planned: { servings: 1 } } }), headers: { "content-type": "application/json" } }));
    expect(createdEntry.status).toBe(201);
    const createdEntryBody = await createdEntry.json();
    expect(createdEntryBody.entry).not.toHaveProperty("userId");
    const entry = createdEntryBody.entry as { id: string; actual: { status: string; servings: number | null } };
    expect(entry.actual).toMatchObject({ status: "not_recorded", servings: null });
    const taken = await patchEntry(new Request("https://soma.example/api/supplements/entries/id", { method: "PATCH", body: JSON.stringify({ actual: { status: "taken", servings: 0.75, takenAt: "2026-09-12T09:00:00+02:00" } }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: entry.id }) });
    expect(taken.status).toBe(200);
    expect((await taken.json()).entry.actual).toMatchObject({ status: "taken", servings: 0.75 });
    expect((await listEntries(new Request("https://soma.example/api/supplements/entries?from=2026-09-12&to=2026-09-12"))).status).toBe(200);

    expect((await patchDefinition(new Request("https://soma.example/api/supplements/id", { method: "PATCH", body: JSON.stringify({ notes: "Usage séparé des repas" }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ id: definition.id }) })).status).toBe(200);
    expect((await getDefinition(new Request("https://soma.example/api/supplements/id"), { params: Promise.resolve({ id: definition.id }) })).status).toBe(200);
    expect((await deleteEntry(new Request("https://soma.example/api/supplements/entries/id", { method: "DELETE" }), { params: Promise.resolve({ id: entry.id }) })).status).toBe(200);
    expect((await deleteDefinition(new Request("https://soma.example/api/supplements/id", { method: "DELETE" }), { params: Promise.resolve({ id: definition.id }) })).status).toBe(200);
  });
});
