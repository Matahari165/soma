import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBearerSessionUser } from "@/lib/cloudflare/session";
import { DELETE as deleteSupplementEntry, PATCH as patchSupplementEntry } from "./supplements/entries/[id]/route";
import { POST as postSupplementEntry } from "./supplements/entries/route";
import { DELETE as deleteSupplementDefinition, PATCH as patchSupplementDefinition } from "./supplements/[id]/route";
import { GET as getSupplementDefinitions, POST as postSupplementDefinition } from "./supplements/route";
import { DELETE as deleteRecipe, PATCH as patchRecipe } from "./recipes/[id]/route";
import { POST as postRecipe } from "./recipes/route";
import { deleteMealRecipe, MealRecipeServiceError, updateMealRecipe, createMealRecipe } from "@/services/meal-recipes";
import {
  archiveSupplementDefinition,
  createSupplementDefinition,
  deleteSupplementEntry as deleteSupplement,
  findSupplementDefinition,
  listSupplementDefinitions,
  updateSupplementDefinition,
  updateSupplementEntry,
  upsertSupplementEntry,
} from "@/services/supplements";

vi.mock("@/lib/cloudflare/session", () => ({ getBearerSessionUser: vi.fn() }));
vi.mock("@/services/supplements", () => {
  class MockSupplementServiceError extends Error {
    readonly code: "not_found" | "invalid" | "unavailable";

    constructor(code: "not_found" | "invalid" | "unavailable", message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    archiveSupplementDefinition: vi.fn(),
    createSupplementDefinition: vi.fn(),
    deleteSupplementEntry: vi.fn(),
    findSupplementDefinition: vi.fn(),
    listSupplementDefinitions: vi.fn(),
    SupplementServiceError: MockSupplementServiceError,
    updateSupplementDefinition: vi.fn(),
    updateSupplementEntry: vi.fn(),
    upsertSupplementEntry: vi.fn(),
  };
});
vi.mock("@/services/meal-recipes", () => {
  class MockMealRecipeServiceError extends Error {
    readonly code: "not_found" | "invalid" | "unavailable";

    constructor(code: "not_found" | "invalid" | "unavailable", message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    createMealRecipe: vi.fn(),
    deleteMealRecipe: vi.fn(),
    MealRecipeServiceError: MockMealRecipeServiceError,
    updateMealRecipe: vi.fn(),
  };
});

const user = { id: "native-nutrition-user" };
const supplementEntry = {
  id: "entry-1",
  definitionId: "supplement-1",
  entryDate: "2026-09-19",
  planned: { servings: 1, scheduledAt: null },
  actual: { status: "taken" as const, servings: 1, takenAt: null, note: null },
  note: null,
  userId: user.id,
  createdAt: "2026-09-19T07:00:00.000Z",
  updatedAt: "2026-09-19T07:00:00.000Z",
};
const recipe = {
  id: "recipe-1",
  name: "Pâtes test",
  dishType: null,
  description: null,
  ingredients: [],
  aliases: [],
  commonVariations: [],
  isActive: true,
  userId: user.id,
  createdAt: "2026-09-19T07:00:00.000Z",
  updatedAt: "2026-09-19T07:00:00.000Z",
};
const supplementDefinition = {
  id: "supplement-1",
  productName: "Omega 3",
  brand: null,
  category: "other" as const,
  source: "personal_record" as const,
  sourceReference: null,
  serving: { quantity: 1, unit: "capsule" as const, label: "1 capsule" },
  nutrients: [],
  frequency: { kind: "daily" as const, timesPerDay: 1 },
  usageInstruction: null,
  notes: null,
  userId: user.id,
  createdAt: "2026-09-19T07:00:00.000Z",
  updatedAt: "2026-09-19T07:00:00.000Z",
  archivedAt: null,
};

describe("native nutrition mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getBearerSessionUser).mockResolvedValue(user as never);
    vi.mocked(upsertSupplementEntry).mockResolvedValue({ entry: supplementEntry, created: true });
    vi.mocked(updateSupplementEntry).mockResolvedValue(supplementEntry);
    vi.mocked(deleteSupplement).mockResolvedValue(true);
    vi.mocked(createMealRecipe).mockResolvedValue(recipe);
    vi.mocked(updateMealRecipe).mockResolvedValue(recipe);
    vi.mocked(deleteMealRecipe).mockResolvedValue(true);
    vi.mocked(createSupplementDefinition).mockResolvedValue(supplementDefinition);
    vi.mocked(findSupplementDefinition).mockResolvedValue(supplementDefinition);
    vi.mocked(listSupplementDefinitions).mockResolvedValue([supplementDefinition]);
    vi.mocked(updateSupplementDefinition).mockResolvedValue(supplementDefinition);
    vi.mocked(archiveSupplementDefinition).mockResolvedValue({
      ...supplementDefinition,
      archivedAt: "2026-09-20T07:00:00.000Z",
    });
  });

  it("requires bearer auth for supplement writes", async () => {
    vi.mocked(getBearerSessionUser).mockResolvedValue(null);
    const response = await postSupplementEntry(new Request("https://soma.example/api/native/v1/nutrition/supplements/entries", {
      method: "POST",
      headers: { cookie: "soma_session=web" },
      body: JSON.stringify({ definitionId: "supplement-1", entryDate: "2026-09-19", status: "taken" }),
    }));
    expect(response.status).toBe(401);
    expect(upsertSupplementEntry).not.toHaveBeenCalled();
  });

  it("upserts and updates a daily supplement entry", async () => {
    const created = await postSupplementEntry(new Request("https://soma.example/api/native/v1/nutrition/supplements/entries", {
      method: "POST",
      body: JSON.stringify({ definitionId: "supplement-1", entryDate: "2026-09-19", status: "taken" }),
    }));
    expect(created.status).toBe(201);
    expect(upsertSupplementEntry).toHaveBeenCalledWith(user.id, expect.objectContaining({ definitionId: "supplement-1", entryDate: "2026-09-19" }));

    const updated = await patchSupplementEntry(new Request("https://soma.example/api/native/v1/nutrition/supplements/entries/entry-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "skipped" }),
    }), { params: Promise.resolve({ id: "entry-1" }) });
    expect(updated.status).toBe(200);
    expect(updateSupplementEntry).toHaveBeenCalledWith(user.id, "entry-1", {
      actual: { status: "skipped", servings: null, takenAt: null, note: null },
      note: null,
    });

    const deleted = await deleteSupplementEntry(new Request("https://soma.example/api/native/v1/nutrition/supplements/entries/entry-1", { method: "DELETE" }), { params: Promise.resolve({ id: "entry-1" }) });
    expect(deleted.status).toBe(200);
    expect(deleteSupplement).toHaveBeenCalledWith(user.id, "entry-1");
  });

  it("creates, edits, and deletes a personal recipe", async () => {
    const created = await postRecipe(new Request("https://soma.example/api/native/v1/nutrition/recipes", {
      method: "POST",
      body: JSON.stringify({ name: "Pâtes test", ingredients: [] }),
    }));
    expect(created.status).toBe(201);
    expect(createMealRecipe).toHaveBeenCalledWith(user.id, expect.objectContaining({ name: "Pâtes test" }));

    const updated = await patchRecipe(new Request("https://soma.example/api/native/v1/nutrition/recipes/recipe-1", {
      method: "PATCH",
      body: JSON.stringify({ name: "Pâtes au pesto" }),
    }), { params: Promise.resolve({ id: "recipe-1" }) });
    expect(updated.status).toBe(200);
    expect(updateMealRecipe).toHaveBeenCalledWith(user.id, "recipe-1", {
      name: "Pâtes au pesto",
      ingredients: [],
      aliases: [],
      commonVariations: [],
    });

    const deleted = await deleteRecipe(new Request("https://soma.example/api/native/v1/nutrition/recipes/recipe-1", { method: "DELETE" }), { params: Promise.resolve({ id: "recipe-1" }) });
    expect(deleted.status).toBe(200);
    expect(deleteMealRecipe).toHaveBeenCalledWith(user.id, "recipe-1");
  });

  it("creates, lists, edits, and archives a supplement definition", async () => {
    const input = {
      productName: "Omega 3",
      category: "other",
      source: "personal_record",
      serving: { quantity: 1, unit: "capsule", label: "1 capsule" },
      nutrients: [],
      frequency: { kind: "daily", timesPerDay: 1 },
    };
    const created = await postSupplementDefinition(new Request("https://soma.example/api/native/v1/nutrition/supplements", {
      method: "POST",
      body: JSON.stringify(input),
    }));
    expect(created.status).toBe(201);
    expect(createSupplementDefinition).toHaveBeenCalledWith(user.id, expect.objectContaining({ productName: "Omega 3" }));

    const listed = await getSupplementDefinitions();
    expect(listed.status).toBe(200);
    expect(listSupplementDefinitions).toHaveBeenCalledWith(user.id);

    const updated = await patchSupplementDefinition(new Request("https://soma.example/api/native/v1/nutrition/supplements/supplement-1", {
      method: "PATCH",
      body: JSON.stringify({ productName: "Omega 3 concentré" }),
    }), { params: Promise.resolve({ id: "supplement-1" }) });
    expect(updated.status).toBe(200);
    expect(updateSupplementDefinition).toHaveBeenCalledWith(user.id, "supplement-1", expect.objectContaining({ productName: "Omega 3 concentré" }));

    const archived = await deleteSupplementDefinition(new Request("https://soma.example/api/native/v1/nutrition/supplements/supplement-1", { method: "DELETE" }), { params: Promise.resolve({ id: "supplement-1" }) });
    expect(archived.status).toBe(200);
    expect(archiveSupplementDefinition).toHaveBeenCalledWith(user.id, "supplement-1");
  });

  it("maps service not found errors without leaking a user id", async () => {
    vi.mocked(deleteMealRecipe).mockRejectedValue(new MealRecipeServiceError("not_found", "Recette introuvable."));
    const response = await deleteRecipe(new Request("https://soma.example/api/native/v1/nutrition/recipes/missing", { method: "DELETE" }), { params: Promise.resolve({ id: "missing" }) });
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({ error: "Recette introuvable.", code: "not_found" });
    expect(JSON.stringify(body)).not.toContain(user.id);
  });
});
