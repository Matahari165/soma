import type { MealFoodGroup, MealQualityProperty } from "@/domain/meals";

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

/**
 * Familles qui peuvent contribuer à la variété positive d'un repas.
 *
 * Une matière grasse ajoutée peut contribuer comme famille favorable quand
 * elle est identifiée ; son rôle nutritionnel actif reste
 * `unsaturated_fat_source` lorsqu'il est justifié.
 */
export const MEAL_VARIETY_POSITIVE_FOOD_GROUPS = [
  "fruit",
  "vegetable",
  "potato",
  "legume",
  "whole_grain",
  "refined_grain",
  "animal_protein",
  "plant_protein",
  "egg",
  "dairy",
  "nuts_seeds",
  "added_fat",
] as const satisfies readonly MealFoodGroup[];

/** Alias court destiné aux consommateurs de la taxonomie. */
export const MEAL_VARIETY_POSITIVE_GROUPS = MEAL_VARIETY_POSITIVE_FOOD_GROUPS;

/**
 * Familles qui ne doivent jamais être comptées comme variété positive.
 * `added_fat` n'est pas exclu : une huile ou une matière grasse identifiée
 * peut appartenir à la variété favorable, sans être confondue avec une
 * sauce ou un produit sucré.
 */
export const MEAL_VARIETY_EXCLUDED_FOOD_GROUPS = [
  "sweet",
  "beverage",
  "sauce",
  "other",
] as const satisfies readonly MealFoodGroup[];

/** Alias court destiné aux consommateurs de la taxonomie. */
export const MEAL_VARIETY_EXCLUDED_GROUPS = MEAL_VARIETY_EXCLUDED_FOOD_GROUPS;

/** Familles végétales utilisées pour porter le rôle actif `plant`. */
export const MEAL_PLANT_FOOD_GROUPS = [
  "fruit",
  "vegetable",
  "potato",
  "legume",
  "whole_grain",
  "plant_protein",
  "nuts_seeds",
] as const satisfies readonly MealFoodGroup[];

/** Rôles actifs du contrat d'analyse, dont `plant` est porté par foodGroups. */
export const MEAL_ACTIVE_QUALITY_ROLES = [
  "plant",
  "protein",
  "fiber",
  "unsaturated_fat",
] as const;

export type MealActiveQualityRole = (typeof MEAL_ACTIVE_QUALITY_ROLES)[number];

/** Propriétés qualityProperties réellement consommables par le futur moteur. */
export const MEAL_ACTIVE_QUALITY_PROPERTIES = [
  "fiber_source",
  "protein_source",
  "unsaturated_fat_source",
] as const satisfies readonly MealQualityProperty[];

/** Propriétés historiques descriptives, conservées à la lecture mais inactives. */
export const MEAL_IGNORED_QUALITY_PROPERTIES = [
  "whole_food",
  "minimally_processed",
  "fermented",
] as const satisfies readonly MealQualityProperty[];

/**
 * Sous-taxonomie positive : les familles exclues restent dans la taxonomie
 * générale pour décrire un aliment, mais ne sont pas des signaux de variété.
 */
export const MEAL_VARIETY_POSITIVE_TAXONOMY: readonly MealTaxonomyFamily[] = [
  {
    id: "fruit",
    label: "Fruits",
    subgroups: ["whole fruit", "citrus", "berries", "tropical fruit", "dried fruit"],
  },
  {
    id: "vegetable",
    label: "Vegetables",
    subgroups: ["leafy greens", "root vegetables", "fruit vegetables", "cruciferous", "mushrooms"],
  },
  {
    id: "potato",
    label: "Potatoes and starches",
    subgroups: ["potatoes", "sweet potatoes", "other tubers"],
  },
  {
    id: "legume",
    label: "Legumes",
    subgroups: ["lentils", "chickpeas", "beans", "peas and soy"],
  },
  {
    id: "whole_grain",
    label: "Whole grains",
    subgroups: ["oats", "brown rice", "whole wheat", "rye and other grains"],
  },
  {
    id: "refined_grain",
    label: "Refined grains",
    subgroups: ["white rice", "white pasta", "white bread", "flours and grain products"],
  },
  {
    id: "animal_protein",
    label: "Animal protein",
    subgroups: ["fish and seafood", "poultry", "red meat", "processed meat"],
  },
  {
    id: "plant_protein",
    label: "Plant protein",
    subgroups: ["tofu and tempeh", "prepared plant proteins", "other meat substitutes"],
  },
  {
    id: "egg",
    label: "Eggs",
    subgroups: ["whole egg", "egg-based dishes"],
  },
  {
    id: "dairy",
    label: "Dairy",
    subgroups: ["milk", "yogurt", "cheese", "fortified alternatives"],
  },
  {
    id: "nuts_seeds",
    label: "Nuts and seeds",
    subgroups: ["almonds and walnuts", "seeds", "nut butters"],
  },
  {
    id: "added_fat",
    label: "Added fats",
    subgroups: ["oils", "butter and ghee", "margarines"],
  },
];

/** Taxonomie lisible des exclusions explicites du contrat de variété. */
export const MEAL_VARIETY_EXCLUDED_TAXONOMY: readonly MealTaxonomyFamily[] = [
  {
    id: "sweet",
    label: "Excluded sweets",
    subgroups: ["candy", "sweet desserts", "pastries", "chocolate"],
  },
  {
    id: "beverage",
    label: "Excluded beverages",
    subgroups: ["sodas", "juices", "sweetened drinks"],
  },
  {
    id: "sauce",
    label: "Excluded sauces",
    subgroups: ["homemade sauces", "commercial sauces", "condiments"],
  },
  {
    id: "other",
    label: "Excluded unclassified",
    subgroups: ["composite foods", "unclassified foods"],
  },
];

export type MealVarietyFoodLike = {
  name?: string | null;
  varietyKey?: string | null;
  foodGroups?: readonly MealFoodGroup[] | null;
  countedInTotals?: boolean;
  alcoholic?: boolean;
};

const EXCLUDED_VARIETY_NAME_PATTERN =
  /\b(?:bonbons?|confiseries?|desserts?|p[âa]tisseries?|chocolats?|sodas?|jus|nectars?|sauces?|boissons?\s+(?:sucr[ée]es?|gazeuses?)|cand(?:y|ies)|sweets?|pastr(?:y|ies)|chocolates?|juices?|smoothies?)\b/iu;
const positiveVarietyGroups = new Set<MealFoodGroup>(MEAL_VARIETY_POSITIVE_FOOD_GROUPS);
const excludedVarietyGroups = new Set<MealFoodGroup>(MEAL_VARIETY_EXCLUDED_FOOD_GROUPS);
const activeQualityProperties = new Set<MealQualityProperty>(MEAL_ACTIVE_QUALITY_PROPERTIES);

/**
 * Détermine si un aliment peut être retenu par le futur moteur pour la
 * variété positive. L'absence de famille est inconnue, jamais positive.
 */
export function isPositiveMealVarietyFood(food: MealVarietyFoodLike): boolean {
  if (food.countedInTotals === false || food.alcoholic === true) return false;

  const groups = new Set(food.foodGroups ?? []);
  if (groups.size === 0) return false;
  if ([...groups].some((group) => excludedVarietyGroups.has(group))) {
    return false;
  }
  if (![...groups].some((group) => positiveVarietyGroups.has(group))) {
    return false;
  }

  const searchableName = `${food.varietyKey ?? ""} ${food.name ?? ""}`.trim();
  return searchableName.length === 0 || !EXCLUDED_VARIETY_NAME_PATTERN.test(searchableName);
}

/** Retourne la clé stable seulement lorsqu'elle appartient à la variété positive. */
export function mealPositiveVarietyKey(food: MealVarietyFoodLike): string | null {
  if (!isPositiveMealVarietyFood(food)) return null;
  const key = (food.varietyKey ?? food.name ?? "").trim();
  return key.length > 0 ? key.toLowerCase() : null;
}

/**
 * Filtre les propriétés actives sans transformer l'absence de donnée en
 * tableau vide. Les anciennes propriétés restent donc lisibles ailleurs,
 * mais ne peuvent pas devenir un signal actif par accident.
 */
export function activeMealQualityProperties(
  properties: readonly MealQualityProperty[] | undefined,
): readonly MealQualityProperty[] | undefined {
  return properties?.filter((property) => activeQualityProperties.has(property));
}

export const MEAL_FOOD_TAXONOMY: readonly MealTaxonomyFamily[] = [
  { id: "fruit", label: "Fruits", subgroups: ["whole fruit", "citrus", "berries", "tropical fruit", "dried fruit", "juices and compotes"] },
  { id: "vegetable", label: "Vegetables", subgroups: ["leafy greens", "root vegetables", "fruit vegetables", "cruciferous", "mushrooms"] },
  { id: "potato", label: "Potatoes and starches", subgroups: ["potatoes", "sweet potatoes", "other tubers"] },
  { id: "legume", label: "Legumes", subgroups: ["lentils", "chickpeas", "beans", "peas and soy"] },
  { id: "whole_grain", label: "Whole grains", subgroups: ["oats", "brown rice", "whole wheat", "rye and other grains"] },
  { id: "refined_grain", label: "Refined grains", subgroups: ["white rice", "white pasta", "white bread", "flours and grain products"] },
  { id: "animal_protein", label: "Animal protein", subgroups: ["fish and seafood", "poultry", "red meat", "processed meat"] },
  { id: "plant_protein", label: "Plant protein", subgroups: ["tofu and tempeh", "prepared plant proteins", "other meat substitutes"] },
  { id: "egg", label: "Eggs", subgroups: ["whole egg", "egg-based dishes"] },
  { id: "dairy", label: "Dairy", subgroups: ["milk", "yogurt", "cheese", "fortified alternatives"] },
  { id: "nuts_seeds", label: "Nuts and seeds", subgroups: ["almonds and walnuts", "seeds", "nut butters"] },
  { id: "added_fat", label: "Added fats", subgroups: ["oils", "butter and ghee", "margarines"] },
  { id: "sauce", label: "Sauces and condiments", subgroups: ["homemade sauces", "commercial sauces", "herbs and spices"] },
  { id: "sweet", label: "Sweets", subgroups: ["desserts", "candy", "pastries", "chocolate"] },
  { id: "beverage", label: "Beverages", subgroups: ["water", "hot drinks", "sweetened drinks", "juices", "sugar-free drinks"] },
  { id: "other", label: "Other", subgroups: ["composite foods", "unclassified foods"] },
];

export const MEAL_FOOD_GROUP_LABELS: Readonly<Record<MealFoodGroup, string>> = Object.fromEntries(
  MEAL_FOOD_TAXONOMY.map((family) => [family.id, family.label]),
) as Record<MealFoodGroup, string>;

export function mealFoodGroupLabel(group: MealFoodGroup) {
  return MEAL_FOOD_GROUP_LABELS[group] ?? group;
}
