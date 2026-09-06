"use client";

import { BookOpen, LoaderCircle, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useState } from "react";

import type { MealRecipeInput, MealRecipeView } from "@/domain/meal-recipes";

import styles from "./meal-recipe-library.module.css";

type DraftIngredient = {
  id: string;
  name: string;
  varietyKey: string;
  usualAmount: string;
  alternatives: string;
};

type Draft = {
  name: string;
  dishType: string;
  description: string;
  ingredients: DraftIngredient[];
  aliases: string;
  commonVariations: string;
};

type MealRecipeLibraryProps = {
  initialRecipes: MealRecipeView[];
  initialError?: string;
};

type RecipeResponse = { recipe: MealRecipeView };

const emptyIngredient = (id = "ingredient-0"): DraftIngredient => ({ id, name: "", varietyKey: "", usualAmount: "", alternatives: "" });

const emptyDraft = (): Draft => ({
  name: "",
  dishType: "",
  description: "",
  ingredients: [emptyIngredient()],
  aliases: "",
  commonVariations: "",
});

function recipeToDraft(recipe: MealRecipeView): Draft {
  return {
    name: recipe.name,
    dishType: recipe.dishType ?? "",
    description: recipe.description ?? "",
    ingredients: recipe.ingredients.length > 0
      ? recipe.ingredients.map((ingredient, index) => ({
          id: `ingredient-${index}`,
          name: ingredient.name,
          varietyKey: ingredient.varietyKey ?? "",
          usualAmount: ingredient.usualAmount ?? "",
          alternatives: ingredient.alternatives.join(", "),
        }))
      : [emptyIngredient()],
    aliases: recipe.aliases.join("\n"),
    commonVariations: recipe.commonVariations.join("\n"),
  };
}

function lines(value: string) {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}

function draftToInput(draft: Draft): MealRecipeInput {
  return {
    name: draft.name.trim(),
    dishType: draft.dishType.trim() || null,
    description: draft.description.trim() || null,
    ingredients: draft.ingredients
      .filter((ingredient) => ingredient.name.trim())
      .map((ingredient) => ({
        name: ingredient.name.trim(),
        varietyKey: ingredient.varietyKey.trim() || null,
        usualAmount: ingredient.usualAmount.trim() || null,
        preparation: null,
        alternatives: lines(ingredient.alternatives),
      })),
    aliases: lines(draft.aliases),
    commonVariations: lines(draft.commonVariations),
  };
}

async function readResponse<T>(response: Response) {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "La demande n’a pas pu aboutir.");
  return body;
}

export function MealRecipeLibrary({ initialRecipes, initialError }: MealRecipeLibraryProps) {
  const [recipes, setRecipes] = useState(initialRecipes);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [error, setError] = useState(initialError ?? "");
  const [status, setStatus] = useState("");

  function openCreate() {
    setEditingId(null);
    setDraft(emptyDraft());
    setFormOpen(true);
    setError("");
    setStatus("");
  }

  function openEdit(recipe: MealRecipeView) {
    setEditingId(recipe.id);
    setDraft(recipeToDraft(recipe));
    setFormOpen(true);
    setError("");
    setStatus("");
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setDraft(emptyDraft());
    setError("");
  }

  function updateDraft<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateIngredient(id: string, field: keyof DraftIngredient, value: string) {
    setDraft((current) => ({
      ...current,
      ingredients: current.ingredients.map((ingredient) => ingredient.id === id ? { ...ingredient, [field]: value } : ingredient),
    }));
  }

  function addIngredient() {
    if (draft.ingredients.length >= 30) return;
    setDraft((current) => ({ ...current, ingredients: [...current.ingredients, emptyIngredient(`ingredient-${Date.now()}`)] }));
  }

  function removeIngredient(id: string) {
    setDraft((current) => {
      const ingredients = current.ingredients.filter((ingredient) => ingredient.id !== id);
      return { ...current, ingredients: ingredients.length > 0 ? ingredients : [emptyIngredient()] };
    });
  }

  async function saveRecipe() {
    setError("");
    setStatus("");
    const filledIngredients = draft.ingredients.filter((ingredient) => ingredient.name.trim() || ingredient.varietyKey.trim() || ingredient.usualAmount.trim() || ingredient.alternatives.trim());
    if (!draft.name.trim()) {
      setError("Donne un nom à cette recette.");
      return;
    }
    if (filledIngredients.some((ingredient) => !ingredient.name.trim())) {
      setError("Chaque ligne d’ingrédient doit avoir un nom, ou être laissée vide.");
      return;
    }

    setBusy(true);
    try {
      const input = draftToInput(draft);
      const response = await fetch(editingId ? `/api/meal-recipes/${editingId}` : "/api/meal-recipes", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await readResponse<RecipeResponse>(response);
      setRecipes((current) => editingId ? current.map((recipe) => recipe.id === editingId ? body.recipe : recipe) : [body.recipe, ...current]);
      setStatus(editingId ? "Recette modifiée." : "Recette enregistrée.");
      closeForm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La recette n’a pas pu être enregistrée.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRecipe(recipe: MealRecipeView) {
    setPendingDelete(recipe.id);
    setError("");
    try {
      await readResponse<{ ok: true }>(await fetch(`/api/meal-recipes/${recipe.id}`, { method: "DELETE" }));
      setRecipes((current) => current.filter((item) => item.id !== recipe.id));
      setStatus("Recette supprimée.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "La recette n’a pas pu être supprimée.");
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className="eyebrow">Repères personnels</span>
          <h1>Recettes habituelles</h1>
          <p>Une base variable pour reconnaître tes plats récurrents — jamais une mesure du repas du jour.</p>
        </div>
        {!formOpen && <button className="primary-button" type="button" onClick={openCreate}><Plus size={17} aria-hidden="true" />Nouvelle recette</button>}
      </header>

      <p className={styles.notice} role={error ? "alert" : "status"} aria-live="polite">{error || status}</p>

      <div className={styles.content}>
        {formOpen && (
          <section className={styles.formPanel} aria-labelledby="recipe-form-title">
            <div className={styles.sectionHeading}>
              <div><span className="eyebrow">{editingId ? "Modifier" : "Nouveau repère"}</span><h2 id="recipe-form-title">{editingId ? "Modifier la recette" : "Décrire un plat récurrent"}</h2></div>
              <button className="icon-button" type="button" onClick={closeForm} aria-label="Fermer le formulaire"><X size={18} aria-hidden="true" /></button>
            </div>
            <p className={styles.explainer}>Les quantités restent indicatives. Lors d’une analyse, la photo et ta note du jour passent toujours avant cette fiche.</p>
            <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void saveRecipe(); }}>
              <div className={styles.formGrid}>
                <label className="field"><span>Nom de la recette <b aria-hidden="true">*</b></span><input required value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="Ex. pâtes au pesto" /></label>
                <label className="field"><span>Type de plat</span><input value={draft.dishType} onChange={(event) => updateDraft("dishType", event.target.value)} placeholder="Ex. dîner, salade, tarte" /></label>
                <label className="field field--wide"><span>Description courte</span><textarea rows={2} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} placeholder="Ce qui caractérise généralement ce plat" /></label>
              </div>

              <fieldset className={styles.ingredients}>
                <legend>Ingrédients habituels <small>facultatifs et variables</small></legend>
                <div className={styles.ingredientList}>
                  {draft.ingredients.map((ingredient, index) => (
                    <div className={styles.ingredientRow} key={ingredient.id}>
                      <label className="field"><span>Ingrédient {index + 1}</span><input value={ingredient.name} onChange={(event) => updateIngredient(ingredient.id, "name", event.target.value)} placeholder="Ex. pâtes" /></label>
                      <label className="field"><span>Variété</span><input value={ingredient.varietyKey} onChange={(event) => updateIngredient(ingredient.id, "varietyKey", event.target.value)} placeholder="Ex. complètes" /></label>
                      <label className="field"><span>Quantité habituelle <small>(indicative)</small></span><input value={ingredient.usualAmount} onChange={(event) => updateIngredient(ingredient.id, "usualAmount", event.target.value)} placeholder="Ex. une portion" /></label>
                      <label className="field"><span>Alternatives</span><input value={ingredient.alternatives} onChange={(event) => updateIngredient(ingredient.id, "alternatives", event.target.value)} placeholder="Ex. riz, semoule" /></label>
                      <button className={styles.removeIngredient} type="button" onClick={() => removeIngredient(ingredient.id)} aria-label={`Retirer l’ingrédient ${index + 1}`}><Trash2 size={16} aria-hidden="true" /></button>
                    </div>
                  ))}
                </div>
                <button className={styles.addIngredient} type="button" onClick={addIngredient} disabled={draft.ingredients.length >= 30}><Plus size={15} aria-hidden="true" />Ajouter une ligne</button>
              </fieldset>

              <div className={styles.formGrid}>
                <label className="field"><span>Autres noms</span><textarea rows={3} value={draft.aliases} onChange={(event) => updateDraft("aliases", event.target.value)} placeholder="Un nom par ligne ou séparé par des virgules" /></label>
                <label className="field"><span>Variations fréquentes</span><textarea rows={3} value={draft.commonVariations} onChange={(event) => updateDraft("commonVariations", event.target.value)} placeholder="Ex. avec poulet, sans fromage" /></label>
              </div>
              <div className={styles.formActions}>
                <button className="secondary-button" type="button" onClick={closeForm}>Annuler</button>
                <button className="primary-button" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}{busy ? "Enregistrement…" : "Enregistrer"}</button>
              </div>
            </form>
          </section>
        )}

        <section className={styles.listPanel} aria-labelledby="recipe-list-title">
          <div className={styles.sectionHeading}>
            <div><span className="eyebrow">Bibliothèque</span><h2 id="recipe-list-title">Tes repères</h2></div>
            <span className={styles.count}>{recipes.length} {recipes.length === 1 ? "recette" : "recettes"}</span>
          </div>

          {recipes.length === 0 ? (
            <div className={styles.empty}>
              <BookOpen size={22} aria-hidden="true" />
              <h3>Aucune recette enregistrée</h3>
              <p>Ajoute un plat que tu manges souvent. Soma s’en servira comme indice, sans remplacer ce que tu décris aujourd’hui.</p>
              {!formOpen && <button className="secondary-button" type="button" onClick={openCreate}><Plus size={16} aria-hidden="true" />Ajouter le premier repère</button>}
            </div>
          ) : (
            <ul className={styles.recipeList}>
              {recipes.map((recipe) => (
                <li key={recipe.id}>
                  <article className={styles.recipe}>
                    <div className={styles.recipeBody}>
                      <div className={styles.recipeTitle}><h3>{recipe.name}</h3>{recipe.dishType && <span>{recipe.dishType}</span>}</div>
                      {recipe.description && <p>{recipe.description}</p>}
                      <ul className={styles.ingredientSummary} aria-label={`Ingrédients habituels de ${recipe.name}`}>
                        {recipe.ingredients.slice(0, 6).map((ingredient) => <li key={`${recipe.id}-${ingredient.name}`}>{ingredient.name}{ingredient.usualAmount ? ` · ${ingredient.usualAmount}` : ""}</li>)}
                        {recipe.ingredients.length > 6 && <li>+ {recipe.ingredients.length - 6} autres</li>}
                      </ul>
                      {(recipe.aliases.length > 0 || recipe.commonVariations.length > 0) && <p className={styles.recipeMeta}>{[...recipe.aliases, ...recipe.commonVariations].slice(0, 3).join(" · ")}</p>}
                    </div>
                    <div className={styles.recipeActions}>
                      <button className="icon-button" type="button" onClick={() => openEdit(recipe)} aria-label={`Modifier ${recipe.name}`}><Pencil size={16} aria-hidden="true" /></button>
                      {pendingDelete === recipe.id ? <div className={styles.deleteConfirmation} role="group" aria-label={`Confirmer la suppression de ${recipe.name}`}><span>Supprimer ?</span><button className={styles.confirmDelete} type="button" onClick={() => void deleteRecipe(recipe)} disabled={busy}>Oui</button><button className={styles.cancelDelete} type="button" onClick={() => setPendingDelete(null)}>Non</button></div> : <button className="icon-button" type="button" onClick={() => setPendingDelete(recipe.id)} aria-label={`Supprimer ${recipe.name}`}><Trash2 size={16} aria-hidden="true" /></button>}
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
