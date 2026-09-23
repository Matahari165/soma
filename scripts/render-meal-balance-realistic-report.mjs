import { readFile, readdir, writeFile } from "node:fs/promises";

const root = process.cwd();
const resultsRoot = process.env.MEAL_BALANCE_REALISTIC_RESULTS_DIR
  ?? `${root}/analysis/private/meal-balance-realistic-live`;
const dataset = JSON.parse(await readFile(`${root}/tests/fixtures/meal-balance-realistic/dataset.json`, "utf8"));
const summary = JSON.parse(await readFile(`${resultsRoot}/run-summary.json`, "utf8"));
const rawDir = `${resultsRoot}/raw`;
const raw = new Map();
for (const file of await readdir(rawDir)) {
  const value = JSON.parse(await readFile(`${rawDir}/${file}`, "utf8"));
  raw.set(value.caseId, value);
}

const fr = (value) => value == null ? "indisponible" : String(value);
const range = (value, unit = "") => value ? `${value.low}–${value.high}${unit} (probable ${value.likely}${unit})` : "indisponible";
const scores = new Map(summary.scores.map((item) => [item.date, item.score]));
const cases = new Map(summary.cases.map((item) => [item.caseId, item]));
const dates = Array.from({ length: dataset.dateRange.days }, (_, index) => {
  const date = new Date(`${dataset.dateRange.start}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
});
const entriesByDate = new Map(dates.map((date) => [date, dataset.entries.filter((entry) => entry.input.mealDate === date)]));
const completed = summary.cases.filter((item) => item.status === "completed").length;
const failures = summary.cases.filter((item) => item.status === "failed");
const providerFailures = failures.filter((item) => item.errorCode === "provider_request").length;
const schemaFailures = failures.filter((item) => item.errorCode === "response_schema_error").length;
const lines = [];

lines.push("# Test réaliste isolé du score d’équilibre alimentaire", "");
lines.push("> Conclusion : ce passage ne valide pas le score sur 12 jours. Seuls 9 repas sur 38 ont produit une analyse conforme ; les 29 autres ont échoué avant le calcul. Les scores visibles sont tous `limited` et ne doivent pas être comparés comme des journées complètes.", "");
lines.push("## Périmètre et preuve", "", `- Jeu synthétique : 12 jours, 48 créneaux, 38 repas saisis, 10 absences volontaires.`, `- Entrées : 16 photo + note, 10 photo seule, 12 note seule ; 3 repas multi-photo.`, `- Chaîne exercée : analyse fournisseur de production, validation du contrat, agrégation confirmée, puis \`calculateMealBalanceScore\`.`, `- Résultat : ${completed}/38 conformes (${Math.round(completed / 38 * 100)} %), ${providerFailures} échecs \`provider_request\`, ${schemaFailures} échecs \`response_schema_error\`.`, `- Isolation : aucune base, session, donnée personnelle ou écriture de production. Les « photos » sont des pixels synthétiques minimaux : elles testent le chemin API, pas la vision réelle.`, "");
lines.push("### Prérequis vérifié avant exécution", "", "- `origin/main` contenait `ce2b255` (nouvelle chaîne d’analyse) puis `74c83bb` (durcissement sémantique).", "- Le Worker Cloudflare actif exposait une version postérieure à ces commits et la racine publique répondait HTTP 200 ; aucun déploiement n’a été déclenché par ce test.", "- Le contrat inspecté comportait observations, signaux d’incertitude, quantités et validation de cohérence.", "");
lines.push("## Résultats quotidiens", "");

for (const date of dates) {
  const entries = entriesByDate.get(date);
  const score = scores.get(date);
  const successCount = entries.filter((entry) => cases.get(entry.entryId)?.status === "completed").length;
  lines.push(`### ${date}`, "", `Couverture du passage : ${successCount}/${entries.length} repas saisis conformes. Score : ${score ? `${score.score}/100 — ${score.status}, couverture ${score.coverage}, confiance ${score.confidence}` : "indisponible"}.`, "");
  for (const entry of entries) {
    const result = cases.get(entry.entryId);
    const stored = raw.get(entry.entryId);
    const mode = entry.captureMetadata.mode.replaceAll("_", " ");
    lines.push(`#### ${entry.entryId} · ${entry.input.mealType}`, "", `- Entrée : ${entry.input.note ?? "aucune note"} · ${entry.input.images.length} image(s) synthétique(s) · mode ${mode}.`, `- Incertitudes prévues : ${entry.captureMetadata.uncertaintyTags.join(", ") || "aucune"}.`);
    if (!stored) {
      lines.push(`- Statut : échec \`${result?.errorCode ?? "inconnu"}\` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.`, "");
      continue;
    }
    const a = stored.analysis;
    lines.push(`- Statut : conforme · fournisseur \`${stored.provider}\` · modèle \`${stored.model}\` · confiance ${fr(a.confidence)}.`);
    lines.push(`- Aliments détectés : ${a.foods.map((food) => `${food.name} [${food.foodGroups.join("/") || "sans catégorie"}; portion ${fr(food.portion ?? food.estimatedGrams)}; NOVA ${fr(food.novaGroup)}; sucre ${food.sugarExposure ? `${food.sugarExposure.liquid ? "liquide" : "non liquide"}/${food.sugarExposure.concentrated ? "concentré" : "non concentré"}` : "inconnu"}; qualité ${(food.qualityProperties ?? []).join("/") || "inconnue"}; confiance ${food.confidence}]`).join(" ; ")}.`);
    lines.push(`- Incertitudes retournées : ${(a.uncertaintySignals ?? []).map((u) => typeof u === "string" ? u : JSON.stringify(u)).join(" ; ") || "aucune explicite"}.`);
    lines.push(`- Nutrition : énergie ${range(a.totals?.calories, " kcal")}; protéines ${range(a.totals?.proteinGrams, " g")}; glucides ${range(a.totals?.carbohydrateGrams, " g")}; lipides ${range(a.totals?.fatGrams, " g")}; fibres ${range(a.totals?.fiberGrams, " g")}; sucres ${range(a.totals?.sugarGrams, " g")}; sucres ajoutés ${range(a.totals?.addedSugarGrams, " g")}.`, "");
  }
  if (score) {
    lines.push("Dimensions du score :", "", "| Dimension | Score | Statut | Couverture d’observation | Confiance | Valeur observée |", "|---|---:|---|---:|---:|---|");
    for (const c of score.components) lines.push(`| ${c.label} | ${fr(c.score)} | ${c.status} | ${c.observationCoverage} | ${c.confidence} | ${fr(c.observedValue)} |`);
    lines.push("");
  } else {
    lines.push("Dimensions du score : toutes indisponibles, car aucun repas conforme n’a atteint l’agrégation.", "");
  }
}

lines.push("## Analyse transversale", "", "### Cohérence et explicabilité", "", "- Les neuf sorties conformes traversent bien la validation, l’agrégation et les sept dimensions sans exception locale.", "- Tous les scores quotidiens obtenus sont `limited` (couverture 0,13 à 0,23). Leur valeur numérique, parfois élevée, est une renormalisation des seules dimensions observées, pas une note de journée complète.", "- Les raisons et `strongestEffects` remontent les dimensions dominantes, mais l’interface doit toujours afficher le statut et la couverture avec la note pour éviter une fausse précision.", "", "### Sensibilité aux repas manquants", "", "- 29/38 repas analysables manquent à cause du fournisseur ou du schéma, auxquels s’ajoutent 10 créneaux volontairement absents dans le scénario.", "- Avec un seul repas conforme dans la plupart des journées, retirer ce repas fait disparaître entièrement le score ; ajouter un repas peut donc déplacer brutalement note, couverture et dimensions.", "- Aucun classement entre jours n’est défendable dans ce passage. Une journée à 86 avec 23 % de couverture n’est pas démontrée meilleure qu’une journée à 56 avec 18 %.", "", "### Comparabilité entre journées", "", "- Comparabilité insuffisante : les jours ne reposent ni sur le même nombre de repas, ni sur les mêmes modalités de saisie, ni sur une couverture homogène.", "- La comparabilité deviendrait acceptable après un passage avec des images réalistes, une disponibilité fournisseur stable et un seuil commun de couverture complète ou quasi complète.", "", "## Problèmes manifestes et recommandations", "", "1. **Disponibilité de la chaîne** — 68 % des cas échouent en `provider_request`. Journaliser la cause technique non sensible (statut HTTP, délai, fournisseur tenté) et retenter avec une politique bornée.", "2. **Compatibilité du contrat** — 3 réponses atteignent le fournisseur mais ne satisfont pas le schéma. Conserver en test les catégories exactes de validation et ajouter des fixtures de régression anonymisées.", "3. **Note élevée avec faible couverture** — ne jamais montrer la note seule ; rendre `limited` et la couverture aussi saillants que le nombre, voire masquer le classement sous un seuil produit explicite.", "4. **Photos non représentatives** — refaire le même protocole avec des images synthétiques réalistes ou libres de droits. Les pixels minimaux n’évaluent pas la reconnaissance visuelle.", "5. **Repas absents** — distinguer explicitement « repas sauté », « non saisi » et « analyse en échec » avant d’interpréter une journée.", "6. **Algorithme** — aucun changement effectué. La double influence potentielle de `foodListCoverage` et la renormalisation des dimensions partielles demandent un test numérique ciblé avant toute correction.", "", "## Reproduction", "", "```bash", "pnpm test:live:meal-balance", "node scripts/render-meal-balance-realistic-report.mjs", "```", "", "Les sorties brutes, le bilan machine et ce rapport sont générés dans `analysis/private/meal-balance-realistic-live/`, un répertoire local ignoré par Git. Les variables fournisseur proviennent de l’environnement local et ne sont jamais écrites dans ces fichiers.", "", "## Limites", "", "- Un seul passage temporel du fournisseur ; il mesure aussi sa disponibilité à cet instant.", "- Seulement neuf réponses conformes, donc aucune conclusion nutritionnelle représentative sur les 12 jours.", "- Les notes textuelles sont réalistes mais synthétiques ; les images ne représentent pas les repas.", "- Pas de session authentifiée, de base de données, d’interface ou de production modifiée.", "");

await writeFile(`${resultsRoot}/report.md`, `${lines.join("\n").trimEnd()}\n`, "utf8");
