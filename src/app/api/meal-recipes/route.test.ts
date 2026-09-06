import { afterEach, describe, expect, it } from "vitest";

import { DELETE, GET as getRecipe, PATCH } from "./[id]/route";
import { GET, POST } from "./route";

describe("meal recipes API local preview flow", () => {
  afterEach(() => {
    delete process.env.SOMA_LOCAL_PREVIEW;
  });

  it("creates, reads, updates, and deletes a personal recipe", async () => {
    process.env.SOMA_LOCAL_PREVIEW = "true";
    const created = await POST(new Request("https://soma.example/api/meal-recipes", {
      method: "POST",
      body: JSON.stringify({ recipe: { name: `Pâtes test ${crypto.randomUUID()}`, ingredients: [{ name: "Pâtes", usualAmount: "variable" }] } }),
      headers: { "content-type": "application/json" },
    }));
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    const recipe = createdBody.recipe as { id: string; name: string };
    expect(createdBody.recipe).not.toHaveProperty("userId");

    expect((await GET()).status).toBe(200);
    const loaded = await getRecipe(new Request(`https://soma.example/api/meal-recipes/${recipe.id}`), { params: Promise.resolve({ id: recipe.id }) });
    expect(loaded.status).toBe(200);
    const loadedBody = await loaded.json();
    expect(loadedBody.recipe.name).toBe(recipe.name);
    expect(loadedBody.recipe).not.toHaveProperty("userId");

    const updated = await PATCH(new Request(`https://soma.example/api/meal-recipes/${recipe.id}`, {
      method: "PATCH",
      body: JSON.stringify({ description: "Repère variable" }),
      headers: { "content-type": "application/json" },
    }), { params: Promise.resolve({ id: recipe.id }) });
    expect(updated.status).toBe(200);
    expect((await updated.json()).recipe.description).toBe("Repère variable");

    const deleted = await DELETE(new Request(`https://soma.example/api/meal-recipes/${recipe.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: recipe.id }) });
    expect(deleted.status).toBe(200);
    expect((await getRecipe(new Request("https://soma.example/api/meal-recipes/missing"), { params: Promise.resolve({ id: "missing" }) })).status).toBe(404);
  });
});
