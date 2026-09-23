import type { MealRecipeReference } from "@/domain/meal-recipes";
import type { MealAnalysis, MealAnalysisCorrection } from "@/domain/meals";
import {
  MEAL_ACTIVE_QUALITY_PROPERTIES,
  MEAL_IGNORED_QUALITY_PROPERTIES,
  MEAL_VARIETY_EXCLUDED_FOOD_GROUPS,
  MEAL_VARIETY_POSITIVE_FOOD_GROUPS,
} from "@/domain/meal-taxonomy";
import type { MealVisionInput, MealVisionTextInput } from "./meal-vision-types";

/** Bump these identifiers whenever the provider contract changes. */
export const MEAL_ANALYSIS_PROMPT_VERSION = "meal-analysis-prompt-v5";
export const MEAL_ANALYSIS_SCHEMA_VERSION = "meal-analysis-schema-v2";

export function photoAlias(index: number) {
  return `photo-${index + 1}`;
}

const MEAL_PHOTO_EVIDENCE_CONTRACT_PROMPT = "Traite chaque photo comme une preuve indépendante : plusieurs photos montrent généralement des éléments différents du même repas. Conserve ces aliments séparément. Ne fusionne que si tu reconnais clairement le même aliment ou la même portion sous des angles différents ; dans ce cas, garde un seul food et toutes les evidencePhotoIds correspondantes. Ne déduplique jamais seulement parce que deux noms se ressemblent. Chaque evidencePhotoIds doit contenir uniquement un alias exact photo-N listé dans les références de la demande (par exemple photo-1 ou photo-2), jamais un identifiant inventé ou un identifiant technique, et tout aliment attribué à une photo doit référencer au moins une de ces photos.";

const MEAL_VARIETY_CONTRACT_PROMPT = [
  `Pour la variété positive, utilise uniquement les familles foodGroups positives : ${MEAL_VARIETY_POSITIVE_FOOD_GROUPS.join(", ")}. Un aliment sans famille justifiée ne compte pas.`,
  `Les familles ${MEAL_VARIETY_EXCLUDED_FOOD_GROUPS.join(", ")} sont toujours exclues de la variété positive ; cela couvre notamment les bonbons, desserts sucrés, sodas, jus, boissons sucrées, sauces et aliments non classés. Ces éléments peuvent rester dans foods pour décrire le repas, les sucres ou l'exposition, mais ne doivent jamais recevoir un signal de variété positive. Une famille exclue est prioritaire si plusieurs familles sont présentes.`,
].join(" ");

const MEAL_QUALITY_CONTRACT_PROMPT = [
  `Pour qualityProperties, transmets uniquement les rôles actifs ${MEAL_ACTIVE_QUALITY_PROPERTIES.join(", ")}.`,
  `Le rôle plant est porté par les foodGroups positives et non par qualityProperties. Les propriétés historiques ${MEAL_IGNORED_QUALITY_PROPERTIES.join(", ")} peuvent encore apparaître dans d'anciennes analyses, mais elles ne sont jamais des signaux actifs et ne doivent pas être émises dans une nouvelle réponse.`,
].join(" ");

const MEAL_SUGAR_CONTRACT_PROMPT = "Pour chaque aliment et dans totals, transmets toujours sugarGrams pour les sucres totaux et addedSugarGrams pour les sucres ajoutés : utilise une fourchette quand elle est estimable et null quand elle ne l'est pas. Ne confonds jamais glucides et sucres. Une valeur explicitement nulle ou une fourchette dont les bornes valent zéro sont différentes : null signifie indisponible, zéro signifie une observation ou une estimation nulle soutenue. Respecte addedSugarGrams <= sugarGrams <= carbohydrateGrams quand les intervalles sont connus. Les anciennes réponses peuvent omettre ces champs ; elles sont normalisées à null uniquement à la lecture.";

const MEAL_NOVA_CONTRACT_PROMPT = "Pour novaGroup, utilise uniquement 1, 2, 3 ou 4 lorsque le niveau de transformation est raisonnablement identifiable ; utilise null sinon et n'infère jamais NOVA depuis le seul caractère sain ou malsain d'un aliment.";
const MEAL_OBSERVATION_CONTRACT_PROMPT = "Les statuts observation et leurs valeurs doivent toujours correspondre : si portion, estimatedGrams, quantity.value ou quantity.grams contient une valeur, observation.portion doit être observed ; si observation.portion est unknown, portion, estimatedGrams, quantity.value et quantity.grams doivent tous être null. Si novaGroup est non-null, observation.novaGroup doit être observed ; s'il est unknown, novaGroup doit être null. Si sugarExposure est unknown, sugarExposure doit être null. Si qualityProperties est unknown, qualityProperties doit être null.";

export const MEAL_PHOTO_PROVIDER_INSTRUCTIONS = `You are a careful food-photo analyst. Return stable food ids, per-axis observation statuses and per-axis confidence. Treat each supplied photo as independent evidence: several photos usually show different parts or elements of the same meal, so keep distinct foods distinct. Merge only when it is clear that two photos show the same food or portion from another angle; then keep one food item and list every supporting photo id in evidencePhotoIds. Never invent hidden ingredients, exact weights, or nutrition precision that the photos cannot support. Every evidencePhotoIds value must be one of the exact photo-N aliases listed in the user request, and a photo-supported food must reference at least one of them. Never emit technical source identifiers or invented aliases. Use ranges with low <= likely <= high, explicit nulls when not estimable, and structured uncertainty signals for important unknowns. Missing nutrition is never zero. ${MEAL_VARIETY_CONTRACT_PROMPT} ${MEAL_QUALITY_CONTRACT_PROMPT} ${MEAL_NOVA_CONTRACT_PROMPT} ${MEAL_SUGAR_CONTRACT_PROMPT} Labels in French. Return only the requested JSON object.`;

export const MEAL_TEXT_PROVIDER_INSTRUCTIONS = `You are a careful food-description analyst. List only foods named in the user description and return stable food ids with structured observation statuses. Never invent exact grams or nutrition precision the description cannot support; use wide ranges with low <= likely <= high and explicit nulls when not estimable. Missing nutrition is never zero. Default confidence to low unless the description is very precise. ${MEAL_VARIETY_CONTRACT_PROMPT} ${MEAL_QUALITY_CONTRACT_PROMPT} ${MEAL_NOVA_CONTRACT_PROMPT} ${MEAL_SUGAR_CONTRACT_PROMPT} Always include 'Estimation à partir de la seule description, sans photo.' in uncertainties and machine-readable uncertaintySignals for important unknowns. A text-only food must use an empty evidencePhotoIds array and must not claim photo evidence. Labels in French. Return only the requested JSON object.`;

function recipeReferencesPrompt(recipeReferences: MealRecipeReference[] | undefined) {
  if (!recipeReferences?.length) return "Aucune recette personnelle pertinente n'a été fournie.";
  return [
    "Références personnelles facultatives : elles décrivent des recettes récurrentes, mais leurs ingrédients et quantités sont variables et indicatifs.",
    "Utilise-les seulement comme hypothèses de contexte. La photo et la description actuelles priment. Ne copie jamais un ingrédient, une préparation ou une quantité qui n'est pas visible ou explicitement décrit aujourd'hui. Si une référence contredit les preuves actuelles, ignore-la et conserve une incertitude.",
    `Personal recipe references (context only): ${JSON.stringify(recipeReferences)}`,
  ].join("\n");
}

function previousAnalysisPrompt(previousAnalysis: MealAnalysis | null | undefined, hasCorrection = false) {
  if (!previousAnalysis) return "Aucune analyse précédente n'a été fournie comme référence.";
  return [
    hasCorrection
      ? "Analyse précédente du repas (base à conserver et mettre à jour avec la modification utilisateur ci-dessus) :"
      : "Analyse précédente conservée (référence textuelle uniquement) :",
    `Previous structured analysis: ${JSON.stringify(previousAnalysis)}`,
  ].join("\n");
}

function retryHintPrompt(retryHint: string | null | undefined) {
  const normalized = retryHint?.trim().replace(/\s+/g, " ").slice(0, 500);
  if (!normalized) return "";
  return [
    "=== CONSEIL TECHNIQUE DE REPRISE (ne contient aucune donnée du repas) ===",
    normalized,
    "Respecte ce conseil sans reprendre de contenu de la tentative précédente et retourne uniquement l'objet JSON demandé.",
  ].join("\n");
}

function correctionPrompt(correction: MealAnalysisCorrection | null | undefined) {
  if (!correction?.trim()) return "No user correction was supplied.";
  return [
    "=== MODIFICATION / AJOUT EN LANGAGE NATUREL PAR L'UTILISATEUR (PRIORITÉ ABSOLUE) ===",
    `Modification demandée : "${correction.trim()}"`,
    "Consignes impératives pour appliquer cette modification :",
    "1. La demande de l'utilisateur prévaut sur toute déduction visuelle ou textuelle précédente.",
    "2. Conserve TOUS les aliments de l'analyse précédente qui ne sont pas modifiés ou contredits par cette correction.",
    "3. Pour tout aliment ajouté ou modifié via la correction (par exemple un dessert, une boisson, un ingrédient oublié ou une portion corrigée) :",
    "   - S'il n'est pas présent sur les photos fournies, attribue evidenceSource='note', evidence='inferred', evidencePhotoIds=[]. Ne l'exclus JAMAIS.",
    "   - Renseigne son rôle dans course (ex : 'dessert', 'starter', 'side', 'main') et ses macros/calories de façon cohérente.",
    "4. Mets à jour la liste complète des foods du repas pour combiner les aliments conservés et les ajouts/modifications.",
    "5. Recalcule intégralement les totals (calories, protéines, glucides, lipides, fibres, sucres) pour refléter fidèlement le repas complet après modification.",
    "6. Mets à jour le summary et calorieAnalysis pour refléter l'ensemble du repas mis à jour.",
  ].join("\n");
}

export function makeTextPrompt(input: MealVisionTextInput) {
  const hasCorrection = Boolean(input.correction);
  return [
    "Analyse cette description libre d'un repas pour un journal alimentaire personnel. Réponds avec des libellés en français.",
    "Liste chaque aliment cité dans la description et attribue-lui un id local unique (par exemple food-1). Indique une quantité ou une portion seulement si l'utilisateur la donne explicitement (par exemple « 2 bananes ») ; sinon portion à null. Ne jamais inventer de grammes : estimatedGrams à null si la description ne permet pas une estimation responsable.",
    "Pour un plat composé, distingue le plat, ses composants et les ingrédients seulement si cela évite une ambiguïté. Le parent doit avoir kind=dish, chaque enfant un parentId qui référence son id, et countedInTotals=false pour le parent si ses composants sont comptés. Ne double jamais les totaux.",
    "Pour chaque aliment, renseigne course avec starter, main, side ou dessert seulement si la description indique clairement sa place dans le repas ; utilise null sinon. course sert uniquement à structurer l'affichage (entrée, plat, accompagnement, dessert), pas à juger l'aliment.",
    "Pour chaque aliment, renseigne foodGroups avec les grandes familles alimentaires justifiées par la description. Renseigne varietyKey avec un nom canonique court en français pour reconnaître le même aliment dans le temps (par exemple « tomate », « poulet », « riz »), ou null si l'identité est trop incertaine. Renseigne alcoholic=true uniquement pour une boisson ou un aliment alcoolisé : l'alcool est conservé pour trace mais exclu des dimensions du score et ne doit pas être inclus dans countedInTotals ni dans les totaux nutritionnels. Ces champs décrivent la composition ; ils ne constituent pas un jugement de qualité.",
    MEAL_VARIETY_CONTRACT_PROMPT,
    "Pour chaque aliment, renseigne novaGroup avec 1, 2, 3 ou 4 seulement lorsque le niveau de transformation est raisonnablement identifiable ; null sinon. N'infère jamais NOVA depuis le seul caractère sain ou malsain d'un aliment. Renseigne sugarExposure avec concentrated=true pour un sucre concentré (sirop, confiture, fruit séché ou jus) et liquid=true pour une forme liquide ; les deux peuvent être vrais. Si l'axe sucre a été examiné et qu'aucune exposition n'est observée, utilise {concentrated:false, liquid:false}; si la forme ou la recette est inconnue, utilise null.",
    MEAL_QUALITY_CONTRACT_PROMPT + " Si l'axe a été examiné et aucun rôle actif n'est observé, utilise []; si l'information est insuffisante, transmets qualityProperties=null dans le JSON. Ne déduis jamais une qualité globale.",
    "Renseigne observation avec le statut de chaque axe : observed si une valeur est soutenue, none_observed si l'axe a été examiné sans propriété observée, unknown si la preuve manque. Pour portion et novaGroup, utilise uniquement observed ou unknown. Ajoute confidence avec low, medium ou high pour chacun des quatre axes, séparément de la confiance globale.",
    MEAL_OBSERVATION_CONTRACT_PROMPT,
    "Conserve les traces plausibles de sauce, d'huile ou de préparation comme éléments inferred/unknown structurés quand elles sont pertinentes, sans en inventer la quantité. Utilise kind, parentId, evidence, evidenceSource et quantity seulement quand ils sont justifiés.",
    "Estime la nutrition en fourchettes larges, pas en fausse précision. Pour chaque fourchette non-nulle, fournis low, likely et high avec low <= likely <= high. Utilise null quand un nutriment ne peut pas être estimé de façon responsable.",
    MEAL_SUGAR_CONTRACT_PROMPT,
    "Ne demande jamais à l'utilisateur de saisir des calories ou des grammes. Ne fabrique aucune quantité : quantity et estimatedGrams restent null quand la description ne permet pas une estimation responsable.",
    "calorieAnalysis : 1-2 phrases en français avec la fourchette likely des calories et une appréciation sobre (léger, modéré, copieux), ou null si non estimable.",
    "confidence à low par défaut, sauf si la description est très précise (aliments, quantités et préparation explicites). Remplis uncertaintySignals avec des codes structurés et un détail concret pour chaque incertitude importante ; conserve aussi uncertainties pour une explication lisible.",
    `Meal slot: ${input.mealType}. Date: ${input.mealDate}.`,
    `User description: ${input.note}`,
    correctionPrompt(input.correction),
    previousAnalysisPrompt(input.previousAnalysis, hasCorrection),
    recipeReferencesPrompt(input.recipeReferences),
    retryHintPrompt(input.retryHint),
  ].join("\n");
}

export function makePrompt(input: MealVisionInput) {
  const hasCorrection = Boolean(input.correction);
  const origins = input.images.map((image, index) => {
    const context = image.comment?.trim() ? ` comment: ${image.comment.trim().slice(0, 240)}` : "";
    return `${photoAlias(index)} source: ${image.origin}${context}`;
  }).join("\n");
  return [
    "Analyse these photos as one meal for a personal food journal. Réponds avec des libellés en français.",
    "Identify only foods and drinks that are visible or strongly supported by the images. Never invent hidden ingredients, exact weights, or nutrition precision that the photos cannot support.",
    MEAL_PHOTO_EVIDENCE_CONTRACT_PROMPT,
    "dishType : nom du type de plat en français en 2-4 mots (par exemple « Salade composée », « Bowl de riz au poulet »), ou null si indéterminable (unclear).",
    "Pour chaque aliment : attribue un id local unique (par exemple food-1), name en français ; portion/quantityLabel en français seulement si visuellement estimable (par exemple « 1 bol », « 2 tranches »), sinon null ; ne jamais deviner les grammes : estimatedGrams à null si non estimable.",
    "Pour un plat composé, utilise kind=dish pour le plat et kind=component ou ingredient pour ses éléments seulement si cela clarifie ce qui est visible. Chaque parentId doit référencer l'id du plat parent. Ne double jamais le plat avec ses composants : si les composants sont comptés dans les totaux, countedInTotals=false pour le plat parent.",
    "Pour chaque aliment, renseigne course avec starter, main, side ou dessert seulement si sa place est justifiée par la note ou une preuve claire ; utilise null sinon. course sert uniquement à structurer l'affichage (entrée, plat, accompagnement, dessert), pas à juger l'aliment.",
    "Pour chaque aliment, renseigne foodGroups avec les grandes familles alimentaires visibles ou fortement inférées. Renseigne varietyKey avec un nom canonique court en français pour reconnaître le même aliment dans le temps (par exemple « tomate », « poulet », « riz »), ou null si l'identité est trop incertaine. Renseigne alcoholic=true uniquement pour une boisson ou un aliment alcoolisé : l'alcool est conservé pour trace mais exclu des dimensions du score et ne doit pas être inclus dans countedInTotals ni dans les totaux nutritionnels. Ces champs décrivent la composition ; ils ne constituent pas un jugement de qualité.",
    MEAL_VARIETY_CONTRACT_PROMPT,
    "Pour chaque aliment, renseigne novaGroup avec 1, 2, 3 ou 4 seulement lorsque le niveau de transformation est raisonnablement identifiable depuis la photo ou la note ; null sinon. N'infère jamais NOVA depuis le seul caractère sain ou malsain. Pour sugarExposure, indique concentrated=true pour un sucre concentré (sirop, confiture, fruit séché ou jus) et liquid=true pour une forme liquide ; si l'axe est examiné sans exposition, utilise {concentrated:false, liquid:false}; si la forme ou la recette est inconnue, utilise null.",
    MEAL_QUALITY_CONTRACT_PROMPT + " Utilise [] si l'axe a été examiné et aucun rôle actif n'est observé ; transmets qualityProperties=null si l'information est inconnue. Ne déduis jamais une qualité globale.",
    "Renseigne observation avec observed, none_observed ou unknown pour portion, novaGroup, sugarExposure et qualityProperties. Pour portion et novaGroup, none_observed n'est pas valide : utilise unknown si la preuve manque. Ajoute confidence avec low, medium ou high pour chacun des quatre axes, séparément de la confiance globale.",
    MEAL_OBSERVATION_CONTRACT_PROMPT,
    "Conserve les traces plausibles de sauce, d'huile ou de préparation comme aliments structurés avec evidence=inferred ou evidence=unknown et evidenceSource=photo, note ou model selon la preuve. Si une photo justifie l'aliment, reporte l'alias photo-N correspondant dans evidencePhotoIds. N'utilise jamais d'identifiant technique ou inventé et ne fabrique aucune quantité ; quantity.value, quantity.grams et estimatedGrams restent null lorsque la photo ne permet pas de les estimer.",
    "Estimate portion sizes and nutrition as ranges, not false precision. For every non-null range provide low, likely, and high values with low <= likely <= high. Use null when a nutrient cannot be estimated responsibly.",
    MEAL_SUGAR_CONTRACT_PROMPT,
    "Ne demande jamais à l'utilisateur de saisir des calories ou des grammes. Les champs de confiance et d'incertitude sont internes au contrat, pas une consigne d'affichage.",
    "calorieAnalysis : 1-2 phrases en français avec la fourchette likely des calories et une appréciation sobre (léger, modéré, copieux), ou null si non estimable.",
    "Include the main preparation (for example grilled, fried, raw, or with sauce) only when visible or stated.",
    "Return a concise summary, itemized foods, total calories and macros, confidence, legacy uncertainties, and structured uncertaintySignals with code, field, foodId, severity, and concrete detail.",
    `Meal slot: ${input.mealType}. Date: ${input.mealDate}.`,
    input.note ? `User note: ${input.note}` : "No user note was supplied.",
    correctionPrompt(input.correction),
    previousAnalysisPrompt(input.previousAnalysis, hasCorrection),
    recipeReferencesPrompt(input.recipeReferences),
    retryHintPrompt(input.retryHint),
    "Photo references (use these exact aliases in evidencePhotoIds; do not use technical source IDs):",
    origins,
  ].join("\n");
}
