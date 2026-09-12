import type { MealFoodGroup } from "@/domain/meals";

/**
 * Canonical display nomenclature for the food journal.
 *
 * `foodGroups` stays deliberately broad in stored analyses so old analyses
 * remain valid. These subgroups provide the stable vocabulary used by the
 * charts and future corrections; `varietyKey` is the canonical item inside a
 * subgroup (for example `courgette` inside vegetables).
 */
export type MealTaxonomyFamily = {
  id: MealFoodGroup;
  label: string;
  subgroups: readonly string[];
};

export const MEAL_FOOD_TAXONOMY: readonly MealTaxonomyFamily[] = [
  { id: "fruit", label: "Fruits", subgroups: ["fruits entiers", "agrumes", "fruits rouges", "fruits exotiques", "fruits séchés", "jus et compotes"] },
  { id: "vegetable", label: "Légumes", subgroups: ["légumes verts", "légumes racines", "légumes fruits", "crucifères", "champignons"] },
  { id: "potato", label: "Pommes de terre et féculents", subgroups: ["pommes de terre", "patate douce", "autres tubercules"] },
  { id: "legume", label: "Légumineuses", subgroups: ["lentilles", "pois chiches", "haricots", "pois et soja"] },
  { id: "whole_grain", label: "Céréales complètes", subgroups: ["avoine", "riz complet", "blé complet", "seigle et autres céréales"] },
  { id: "refined_grain", label: "Céréales raffinées", subgroups: ["riz blanc", "pâtes blanches", "pain blanc", "farines et produits céréaliers"] },
  { id: "animal_protein", label: "Protéines animales", subgroups: ["poissons et fruits de mer", "volaille", "viande rouge", "viande transformée"] },
  { id: "plant_protein", label: "Protéines végétales", subgroups: ["tofu et tempeh", "protéines végétales préparées", "autres substituts"] },
  { id: "egg", label: "Œufs", subgroups: ["œuf entier", "préparations à base d’œuf"] },
  { id: "dairy", label: "Produits laitiers", subgroups: ["lait", "yaourts", "fromages", "alternatives enrichies"] },
  { id: "nuts_seeds", label: "Fruits à coque et graines", subgroups: ["amandes et noix", "graines", "purées d’oléagineux"] },
  { id: "added_fat", label: "Matières grasses ajoutées", subgroups: ["huiles", "beurre et ghee", "margarines"] },
  { id: "sauce", label: "Sauces et condiments", subgroups: ["sauces maison", "sauces du commerce", "herbes et épices"] },
  { id: "sweet", label: "Produits sucrés", subgroups: ["desserts", "confiseries", "pâtisseries", "chocolat"] },
  { id: "beverage", label: "Boissons", subgroups: ["eau", "boissons chaudes", "boissons sucrées", "jus", "boissons sans sucre"] },
  { id: "other", label: "Autres", subgroups: ["produits composés", "aliments non classés"] },
];

export const MEAL_FOOD_GROUP_LABELS: Readonly<Record<MealFoodGroup, string>> = Object.fromEntries(
  MEAL_FOOD_TAXONOMY.map((family) => [family.id, family.label]),
) as Record<MealFoodGroup, string>;

export function mealFoodGroupLabel(group: MealFoodGroup) {
  return MEAL_FOOD_GROUP_LABELS[group] ?? group;
}
