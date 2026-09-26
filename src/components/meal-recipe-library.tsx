"use client";

import { AlertCircle, BookOpen, LoaderCircle, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { MealRecipeInput, MealRecipeView } from "@/domain/meal-recipes";

import styles from "./meal-recipe-library.module.css";

type DraftIngredient = {
  id: string;
  name: string;
  usualAmount: string;
  information: string;
  legacyVarietyKey: string | null;
  legacyAlternatives: string[];
};

type Draft = {
  name: string;
  description: string;
  ingredients: DraftIngredient[];
  commonVariations: string;
  legacyDishType: string | null;
  legacyAliases: string[];
};

type MealRecipeLibraryProps = {
  initialRecipes: MealRecipeView[];
  initialError?: string;
  embedded?: boolean;
  className?: string;
};

type RecipeResponse = { recipe: MealRecipeView };

export const RECIPE_TO_DAY_NOTE_EVENT = "soma:recipe-to-day-note";

function recipeToDayNote(recipe: MealRecipeView) {
  const items = recipe.ingredients
    .map((ingredient) => `${ingredient.name}${ingredient.usualAmount ? ` (${ingredient.usualAmount})` : ""}`.trim())
    .filter(Boolean);
  return `${recipe.name}${items.length > 0 ? ` : ${items.join(", ")}` : ""}`;
}

const emptyIngredient = (id = "ingredient-0"): DraftIngredient => ({
  id,
  name: "",
  usualAmount: "",
  information: "",
  legacyVarietyKey: null,
  legacyAlternatives: [],
});

const emptyDraft = (): Draft => ({
  name: "",
  description: "",
  ingredients: [emptyIngredient()],
  commonVariations: "",
  legacyDishType: null,
  legacyAliases: [],
});

function recipeToDraft(recipe: MealRecipeView): Draft {
  return {
    name: recipe.name,
    description: recipe.description ?? "",
    ingredients: recipe.ingredients.length > 0
      ? recipe.ingredients.map((ingredient, index) => ({
          id: `ingredient-${index}`,
          name: ingredient.name,
          usualAmount: ingredient.usualAmount ?? "",
          information: ingredient.preparation ?? "",
          legacyVarietyKey: ingredient.varietyKey ?? null,
          legacyAlternatives: [...ingredient.alternatives],
        }))
      : [emptyIngredient()],
    commonVariations: recipe.commonVariations.join("\n"),
    legacyDishType: recipe.dishType ?? null,
    legacyAliases: [...recipe.aliases],
  };
}

function lines(value: string) {
  return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}

function draftToInput(draft: Draft): MealRecipeInput {
  return {
    name: draft.name.trim(),
    dishType: draft.legacyDishType,
    description: draft.description.trim() || null,
    ingredients: draft.ingredients
      .filter((ingredient) => ingredient.name.trim())
      .map((ingredient) => ({
        name: ingredient.name.trim(),
        varietyKey: ingredient.legacyVarietyKey,
        usualAmount: ingredient.usualAmount.trim() || null,
        preparation: ingredient.information.trim() || null,
        alternatives: ingredient.legacyAlternatives,
      })),
    aliases: draft.legacyAliases,
    commonVariations: lines(draft.commonVariations),
  };
}

async function readResponse<T>(response: Response) {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "La demande n’a pas pu aboutir.");
  return body;
}

export function MealRecipeLibrary({ initialRecipes, initialError, embedded = false, className }: MealRecipeLibraryProps) {
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    // The parent reveal observer can see streamed HTML before this component
    // hydrates. Register only after hydration so it cannot change SSR attrs.
    if (sectionRef.current) sectionRef.current.dataset.revealReady = "true";
  }, []);
  const Heading = embedded ? "h2" : "h1";
  const [recipes, setRecipes] = useState(initialRecipes);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [error, setError] = useState(initialError ?? "");
  const loadError = initialError ?? "";
  const [retrying, setRetrying] = useState(false);
  const [status, setStatus] = useState("");

  function retryLoad() {
    if (retrying) return;
    setRetrying(true);
    window.location.reload();
  }

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
    const filledIngredients = draft.ingredients.filter((ingredient) => ingredient.name.trim() || ingredient.usualAmount.trim() || ingredient.information.trim());
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

  function copyRecipeToJournal(recipe: MealRecipeView) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(RECIPE_TO_DAY_NOTE_EVENT, {
      detail: { text: recipeToDayNote(recipe), recipeId: recipe.id, recipeName: recipe.name },
    }));
    setError("");
    setStatus(`« ${recipe.name} » copié dans le journal. La photo et ta note du jour priment.`);
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
    <section ref={sectionRef} data-reveal-ready="false" className={[styles.page, embedded ? styles.embedded : "", className].filter(Boolean).join(" ")} aria-labelledby="recipe-library-title" aria-busy={retrying} data-scroll-reveal="recipes">
      <header className={styles.header}>
        <div className={styles.heading}>
          {!embedded && <span className="eyebrow">Repères personnels</span>}
          <Heading id="recipe-library-title">Recettes habituelles</Heading>
          <p className={embedded ? styles.embeddedExplainer : undefined}>{embedded ? "Repères indicatifs : la photo et la note du jour priment." : "Une base variable pour reconnaître tes plats récurrents — jamais une mesure du repas du jour."}</p>
        </div>
        {!formOpen && !loadError && <button className="primary-button" type="button" onClick={openCreate}><Plus size={17} aria-hidden="true" />Nouvelle recette</button>}
      </header>

      {loadError ? <div className={styles.loadError} role="alert" aria-live="assertive">
        <AlertCircle size={18} aria-hidden="true" />
        <div><strong>Recettes indisponibles</strong><span>{retrying ? "Nouvel essai de chargement…" : loadError}</span></div>
        <button className={styles.retryButton} type="button" onClick={retryLoad} disabled={retrying}>
          {retrying ? "Chargement…" : "Réessayer"}
        </button>
      </div> : <p className={styles.notice} role={error ? "alert" : "status"} aria-live={error ? "assertive" : "polite"}>{error || status}</p>}

      {!loadError && <div className={styles.content}>
        {formOpen && (
          <section className={styles.formPanel} aria-labelledby="recipe-form-title">
            <div className={styles.sectionHeading}>
              <div><span className="eyebrow">{editingId ? "Modifier" : "Nouveau repère"}</span><h2 id="recipe-form-title">{editingId ? "Modifier la recette" : "Décrire un plat récurrent"}</h2></div>
              <button className="icon-button" type="button" onClick={closeForm} aria-label="Fermer le formulaire"><X size={18} aria-hidden="true" /></button>
            </div>
            <p id="recipe-form-explainer" className={styles.explainer}>Les quantités restent indicatives. La photo et ta note du jour passent toujours avant cette fiche.</p>
            <form className={styles.form} aria-describedby="recipe-form-explainer" onSubmit={(event) => { event.preventDefault(); void saveRecipe(); }}>
              <div className={styles.formGrid}>
                <label className="field"><span>Nom de la recette <b aria-hidden="true">*</b></span><input required value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="Ex. pâtes au pesto" /></label>
                <label className="field field--wide"><span>Description courte <small>(facultative)</small></span><textarea rows={2} value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} placeholder="Ce qui caractérise généralement ce plat" /></label>
              </div>

              <fieldset className={styles.ingredients}>
                <legend>Ingrédients habituels <small>facultatifs et variables</small></legend>
                <div className={styles.ingredientList}>
                  {draft.ingredients.map((ingredient, index) => (
                    <div className={styles.ingredientRow} key={ingredient.id}>
                      <label className="field"><span>Ingrédient {index + 1}</span><input value={ingredient.name} onChange={(event) => updateIngredient(ingredient.id, "name", event.target.value)} placeholder="Ex. pâtes" /></label>
                      <label className="field"><span>Quantité habituelle <small>(indicative)</small></span><input value={ingredient.usualAmount} onChange={(event) => updateIngredient(ingredient.id, "usualAmount", event.target.value)} placeholder="Ex. une portion" /></label>
                      <label className="field"><span>Informations</span><input value={ingredient.information} onChange={(event) => updateIngredient(ingredient.id, "information", event.target.value)} placeholder="Ex. précuites, selon les courses" /></label>
                      <button className={styles.removeIngredient} type="button" onClick={() => removeIngredient(ingredient.id)} aria-label={`Retirer l’ingrédient ${index + 1}`}><Trash2 size={16} aria-hidden="true" /></button>
                    </div>
                  ))}
                </div>
                <button className={styles.addIngredient} type="button" onClick={addIngredient} disabled={draft.ingredients.length >= 30}><Plus size={15} aria-hidden="true" />Ajouter une ligne</button>
              </fieldset>

              <label className="field"><span>Variations fréquentes <small>(facultatives)</small></span><textarea rows={3} value={draft.commonVariations} onChange={(event) => updateDraft("commonVariations", event.target.value)} placeholder="Ex. avec poulet, sans fromage" /></label>
              <div className={styles.formActions}>
                <button className="secondary-button" type="button" onClick={closeForm}>Annuler</button>
                <button className="primary-button" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : <Save size={17} aria-hidden="true" />}{busy ? "Enregistrement…" : "Enregistrer"}</button>
              </div>
            </form>
          </section>
        )}

        <section className={styles.listPanel} aria-labelledby="recipe-list-title">
          <div className={embedded ? styles.visuallyHidden : styles.sectionHeading}>
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
                      <div className={styles.recipeTitle}><h3>{recipe.name}</h3></div>
                      {recipe.description && <p>{recipe.description}</p>}
                      <ul className={styles.ingredientSummary} aria-label={`Ingrédients habituels de ${recipe.name}`}>
                        {recipe.ingredients.slice(0, 6).map((ingredient) => <li key={`${recipe.id}-${ingredient.name}`}>{ingredient.name}{ingredient.usualAmount ? ` · ${ingredient.usualAmount}` : ""}</li>)}
                        {recipe.ingredients.length > 6 && <li>+ {recipe.ingredients.length - 6} autres</li>}
                      </ul>
                      {embedded ? <p className={styles.recipeReference}>Repère personnel</p> : recipe.commonVariations.length > 0 && <p className={styles.recipeMeta}>Variations : {recipe.commonVariations.slice(0, 3).join(" · ")}</p>}
                    </div>
                    <div className={styles.recipeActions}>
                      {embedded && <button className={styles.recipeTextAction} type="button" onClick={() => copyRecipeToJournal(recipe)} aria-label={`Utiliser ${recipe.name} dans le journal`}><BookOpen size={16} aria-hidden="true" /><span>Utiliser</span></button>}
                      <button className={embedded ? styles.recipeTextAction : "icon-button"} type="button" onClick={() => openEdit(recipe)} aria-label={`Modifier ${recipe.name}`}><Pencil size={16} aria-hidden="true" />{embedded && <span>Modifier</span>}</button>
                      {pendingDelete === recipe.id ? <div className={styles.deleteConfirmation} role="group" aria-label={`Confirmer la suppression de ${recipe.name}`}><span>Supprimer ?</span><button className={styles.confirmDelete} type="button" onClick={() => void deleteRecipe(recipe)} disabled={busy}>Oui</button><button className={styles.cancelDelete} type="button" onClick={() => setPendingDelete(null)}>Non</button></div> : <button className={embedded ? styles.recipeTextAction : "icon-button"} type="button" onClick={() => setPendingDelete(recipe.id)} aria-label={`Supprimer ${recipe.name}`}><Trash2 size={16} aria-hidden="true" />{embedded && <span>Supprimer</span>}</button>}
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>}
    </section>
  );
}
