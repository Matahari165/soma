# Test réaliste du score alimentaire — rapport final `meal-balance-v2`

## Conclusion

Le résultat final documenté est un **replay local de 38 résultats canoniques issus de runs live antérieurs** sur les 38 repas synthétiques des 12 journées : 12 entrées texte, 10 photo et 16 combinées. Ce replay a revalidé les résultats stockés puis recalculé les 12 scores avec `aggregateConfirmedMeals` et `calculateMealBalanceScore` en `algorithmVersion: meal-balance-v2`, sans nouvel appel réseau. La recalibration sort les journées de l'ancien couloir 75–90 : les scores v2 vont de 32,48 à 63,97, avec 5 journées à 45 ou moins. Tous restent `limited` car aucune journée n'atteint simultanément les 75 % de couverture et de confiance nécessaires à `ready`. Le score numérique est donc un signal exploratoire, jamais une validation médicale ou une comparaison fiable sans sa couverture.

Le corpus confirme que Soma conserve les inconnues au lieu de les convertir en zéro, déduplique les repas multi-photos et garde les repas absents dans la couverture. V2 utilise six dimensions comportementales avec des poids fixes (variété 10, qualité 20, sucre ajouté 20, exposition 15, NOVA 20, énergie 15) ; la qualité de preuve (dont `nutritionCoverage`) reste visible mais ne contribue pas au score. La formule publiée est `baseScore = 50 + somme des ajustements composant.contribution`, puis `score = clamp(baseScore - adversePenalty)` ; chaque ajustement est donc reconstructible, y compris les valeurs négatives et les dimensions inconnues neutres. Les courbes sucre/NOVA sont monotones, l'énergie n'a plus de plancher artificiel à 75 et une pénalité adverse interne bornée à 25 points tient compte du pire repas sans tripler NOVA4/exposition/sucre. L'alcool est observé séparément avant le filtre des dimensions alimentaires, mais aucune pénalité adverse n'est déduite si aucun comportement n'est observé. Les repas absents réduisent toujours la couverture, mais le produit ne distingue pas encore un repas volontairement sauté d'un oubli de saisie.

## Preuve d'exécution et provenance

- Artefact final versionné `tests/fixtures/meal-balance-realistic/results/run-result.json` : mode `replay`, 38/38 résultats canoniques revalidés, zéro appel provider pendant ce replay et chemins relatifs reproductibles sur un checkout propre.
- Version du moteur dans les 12 scores : `meal-balance-v2`. Les 38 empreintes de résultats ont été recalculées hors réseau après le changement du moteur, puis le replay a réécrit uniquement l'artefact dérivé.
- Origine des résultats : appels live xAI antérieurs, modèle `grok-4.6`. Le nombre exact de tentatives HTTP ayant produit les 38 résultats n'était pas comptabilisé par l'ancien runner et reste donc **inconnu** ; 38 résultats ne signifie pas nécessairement 38 tentatives, car les retries existent.
- Validateur secondaire : non configuré. Fallback : non configuré. Vérification demandée, mais aucun validateur disponible.
- Base du pipeline : `74c83bb`; identité : `meal-analysis-74c83bb-contract-v1`.
- Contrat et prompts : mêmes fonctions de production que l'API; pas de D1/R2, de compte utilisateur, de recette personnelle ni de donnée privée.
- Empreinte par cas : le `inputFingerprint` SHA-256 couvre l’entrée, les octets image, l’identité du pipeline, les sources du contrat/prompt/adapters/agrégation/calcul, toute la configuration influente observable sans secret (endpoints, modèles et efforts), les cibles nutritionnelles, leur source et le mode d'objectif. Tout changement invalide un cache v2 ; seule une attestation explicite peut migrer un vrai cache v1.
- Hashs enregistrés dans l'artefact rejoué : prompt/normalisation `sha256:c9e840bd9446eb463dccac373c921b3952aba1bc4fc212349e0988effefa2e5d`; adaptateur OpenAI `sha256:2f90813f10ca71d1db83df07a1f13763cecf97243faa94018449cb44765361dc`; provider chain `sha256:48fde3069b8291761638e4c4505478dd2bf4ac479c48d47e0bfcff48723b94c3`; contrat `sha256:9f91631f8bee08af9cd22e877c53a6b10c7ee0a95ebcd71ac1f3d60be8f2b102`; moteur de score v2 `sha256:de981f5b3eccc39329302ba7e35b8a62e7fe05ebd8f19598c7517c05bdfdc1de`; agrégation `sha256:e8f01738eff4e5134acfc64992c85a637f8756980e281e6adcc1abfa26dcfa91`.
- Images : 29 JPEG synthétiques uniques de 640 px, sans EXIF GPS/auteur/appareil/logiciel.

## Vue d'ensemble des journées — score v2

| Date | Repas enregistrés | Score | Couverture | Confiance | Qualité des données |
|---|---:|---:|---:|---:|---|
| 2026-09-01 | 3 | 62.44 | 58 % | 66 % | limited |
| 2026-09-02 | 4 | 32.48 | 76 % | 60 % | limited |
| 2026-09-03 | 3 | 46.54 | 60 % | 68 % | limited |
| 2026-09-04 | 3 | 59.03 | 54 % | 69 % | limited |
| 2026-09-05 | 3 | 60.72 | 50 % | 65 % | limited |
| 2026-09-06 | 3 | 38.03 | 38 % | 67 % | limited |
| 2026-09-07 | 3 | 40.74 | 41 % | 63 % | limited |
| 2026-09-08 | 3 | 63.97 | 71 % | 71 % | limited |
| 2026-09-09 | 3 | 42.62 | 52 % | 54 % | limited |
| 2026-09-10 | 3 | 50.85 | 51 % | 54 % | limited |
| 2026-09-11 | 4 | 42.15 | 79 % | 50 % | limited |
| 2026-09-12 | 3 | 60.69 | 48 % | 69 % | limited |

### Pénalité adverse explicable

La pénalité reste une déduction distincte du score `/100` des six dimensions ; elle est plafonnée à 25 points. Le replay conserve pour chaque journée le repas le plus défavorable, son créneau, les signaux retenus, leur confiance et le statut d'observation.

| Date | Repas | Pénalité | Signaux | Confiance | Observation |
|---|---|---:|---|---:|---|
| 2026-09-01 | d01-dinner · dinner | −1.75 point | Sucre ajouté, NOVA défavorable | 50 % | limited |
| 2026-09-02 | d02-snack · snack | −23.60 points | Sucre ajouté, Exposition sucrée, NOVA défavorable | 67 % | limited |
| 2026-09-03 | d03-lunch · lunch | −16.97 points | Sucre ajouté, NOVA défavorable | 50 % | limited |
| 2026-09-04 | d04-breakfast · breakfast | −3.49 points | NOVA défavorable | 84 % | ready |
| 2026-09-05 | d05-lunch · lunch | −0.74 point | Sucre ajouté | 33 % | limited |
| 2026-09-06 | d06-breakfast · breakfast | −16.75 points | NOVA défavorable | 67 % | limited |
| 2026-09-07 | d07-lunch · lunch | −14.87 points | Sucre ajouté, NOVA défavorable | 54 % | limited |
| 2026-09-08 | d08-dinner · dinner | −4.22 points | NOVA défavorable | 78 % | ready |
| 2026-09-09 | d09-lunch · lunch | −10.89 points | NOVA défavorable | 67 % | limited |
| 2026-09-10 | d10-breakfast · breakfast | −4.37 points | Sucre ajouté, NOVA défavorable | 67 % | limited |
| 2026-09-11 | d11-snack · snack | −16.75 points | NOVA défavorable | 67 % | limited |
| 2026-09-12 | d12-lunch · lunch | −1.30 point | NOVA défavorable | 87 % | ready |

### Comparaison v1 / v2

Les mêmes 38 analyses, cibles et dates sont rejouées ; seul le moteur de score et ses empreintes dérivées changent. Les différences ci-dessous sont donc une comparaison de calibration, pas une nouvelle analyse provider.

| Date | v1 | v2 | Écart v2−v1 |
|---|---:|---:|---:|
| 2026-09-01 | 89.22 | 62.44 | −26.78 |
| 2026-09-02 | 76.53 | 32.48 | −44.05 |
| 2026-09-03 | 85.84 | 46.54 | −39.30 |
| 2026-09-04 | 84.42 | 59.03 | −25.39 |
| 2026-09-05 | 83.99 | 60.72 | −23.27 |
| 2026-09-06 | 77.28 | 38.03 | −39.25 |
| 2026-09-07 | 76.52 | 40.74 | −35.78 |
| 2026-09-08 | 87.34 | 63.97 | −23.37 |
| 2026-09-09 | 77.03 | 42.62 | −34.41 |
| 2026-09-10 | 75.43 | 50.85 | −24.58 |
| 2026-09-11 | 77.58 | 42.15 | −35.43 |
| 2026-09-12 | 86.37 | 60.69 | −25.68 |

| Indicateur | v1 | v2 |
|---|---:|---:|
| Minimum | 75.43 | 32.48 |
| Maximum | 89.22 | 63.97 |
| Moyenne | 81.46 | 50.02 |
| Médiane | 80.79 | 48.70 |
| Écart-type population | 4.92 | 10.51 |
| Jours ≤ 45 | 0/12 | 5/12 |
| Jours 46–60 | 0/12 | 3/12 |
| Jours > 60 | 12/12 | 4/12 |

La distribution v2 est donc plus discriminante : elle rend visibles les journées les plus défavorables sans produire de zéro artificiel. Elle ne doit toutefois pas être lue comme une note clinique ; les couvertures restent hétérogènes et tous les jours sont `limited`.

## Annexe — détails historiques v1 (non utilisés pour le score v2)

Les fiches détaillées ci-dessous ont été produites lors du rapport v1. Elles sont conservées pour la traçabilité des analyses et des preuves par repas ; leurs scores, couvertures et dimensions ne constituent pas les résultats v2. Le tableau v2 et la comparaison ci-dessus, ainsi que `run-result.json`, font foi pour la calibration actuelle.

### 2026-09-01 — 89.22/100 · limited

Couverture 67 %, confiance 62 %, 3 repas. Total disponible : kcal 1740; P 86 g; G 198 g; L 64 g; fibres 19.5 g; sucres 28 g; ajoutés 1 g. Les créneaux absents restent des absences de trace, pas des apports nuls.

| Dimension | Score | Couverture | Confiance | Statut | Observation |
|---|---:|---:|---:|---|---|
| Variété | 85.12 | 75 % | 50 % | limited | 12 aliments · 11 groupes |
| Qualité alimentaire | 71.6 | 50 % | 79 % | limited | 67% des aliments avec propriétés décrites |
| Sucre ajouté | 98 | 75 % | 56 % | limited | 1 |
| Exposition liquide / concentrée | 100 | 56 % | 74 % | limited | 0 liquide · 0 concentré |
| Ultra-transformation | 99.96 | 56 % | 78 % | limited | 1 |
| Couverture nutritionnelle | 100 | 75 % | 56 % | limited | 100 |
| Énergie | 71.75 | 75 % | 56 % | limited | 1740 |

#### Petit-déjeuner — d01-breakfast · photo + texte

- Preuve : photo + texte. Origine alimentaire : homemade. Entrée synthétique : Bol d'avoine, une demi-banane et quelques noix; environ un bol, lait végétal peut-être non sucré..
- Résumé détecté : Petit-déjeuner maison : bol d’avoine dans un liquide (lait végétal probable), garni de banane en rondelles et de noix concassées. Volume d’un bol ; sucres ajoutés non visibles.. Type de plat : Bol d'avoine. Confiance globale : medium.
- Totaux : kcal 255–550 (prob. 365); P 6–18 (prob. 10) g; G 31–70 (prob. 45) g; L 10–25 (prob. 17) g; fibres 5–12.5 (prob. 7.5) g; sucres 6–22 (prob. 11) g; ajoutés 0–6 (prob. 0) g.
- Incertitudes : Quantités d’avoine sèche et de liquide non mesurables sur la photo. · Type et sucrage du lait végétal non identifiés (note : éventuellement non sucré). · Poids exact des noix et de la banane estimé visuellement seulement.. Signaux : portion_unknown/portion/medium, brand_unknown/brand/high, sugar_exposure_unknown/sugarExposure/medium, nova_group_unknown/novaGroup/medium, recipe_unknown/recipe/low.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Bol d'avoine | dish; Avoine hydratée au lait, garnie de fruits et noix; preuve visible/photo | 1 bol; 1 bol; statut observed; kcal — | whole_grain, fruit, nuts_seeds, beverage | NOVA 1 (observed) | liquide false; concentré false; sucres —; ajoutés — | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Flocons d'avoine | component; Hydratés / trempés dans un liquide; preuve visible/photo | inconnue; statut unknown; kcal 120–220 (prob. 160) | whole_grain | NOVA 1 (observed) | liquide false; concentré false; sucres 0–2 (prob. 1); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"low","novaGroup":"high","sugarExposure":"medium","qualityProperties":"high"} | kcal 120–220 (prob. 160); P 4–9 (prob. 6) g; G 20–38 (prob. 28) g; L 2–5 (prob. 3.5) g; fibres 3–7 (prob. 4.5) g; sucres 0–2 (prob. 1) g; ajoutés 0–0 (prob. 0) g |
| Banane | component; Crue, en rondelles; preuve visible/photo | environ une demi-banane; statut observed; kcal 40–80 (prob. 55) | fruit | NOVA 1 (observed) | liquide false; concentré false; sucres 6–13 (prob. 9); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"medium","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 40–80 (prob. 55); P 0–1 (prob. 0) g; G 10–20 (prob. 14) g; L 0–0 (prob. 0) g; fibres 1–2.5 (prob. 1.5) g; sucres 6–13 (prob. 9) g; ajoutés 0–0 (prob. 0) g |
| Noix | component; Crues, concassées; preuve visible/photo | quelques cerneaux; statut observed; kcal 80–170 (prob. 120) | nuts_seeds | NOVA 1 (observed) | liquide false; concentré false; sucres 0–1 (prob. 1); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, unsaturated_fat_source, protein_source, fiber_source | medium; axes {"portion":"medium","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 80–170 (prob. 120); P 2–4 (prob. 3) g; G 1–4 (prob. 2) g; L 8–16 (prob. 12) g; fibres 1–2 (prob. 1.5) g; sucres 0–1 (prob. 1) g; ajoutés 0–0 (prob. 0) g |
| Lait végétal | component; Liquide versé sur l’avoine; preuve inferred/note | inconnue; statut unknown; kcal 15–80 (prob. 30) | beverage, plant_protein | NOVA inconnu (unknown) | exposition inconnue; sucres 0–6 (prob. 0); ajoutés 0–6 (prob. 0) | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 15–80 (prob. 30); P 0–4 (prob. 1) g; G 0–8 (prob. 1) g; L 0–4 (prob. 1.5) g; fibres 0–1 (prob. 0) g; sucres 0–6 (prob. 0) g; ajoutés 0–6 (prob. 0) g |

#### Déjeuner — d01-lunch · photo

- Preuve : photo. Origine alimentaire : prepared. Entrée synthétique : aucune note; preuve photo uniquement.
- Résumé détecté : Assiette de déjeuner : blanc de poulet grillé tranché, couscous, légumes rôtis (courgette, poivron, oignon, aubergine) et sauce blanche herbes. Deux photos du même type de plat, sans double comptage.. Type de plat : Poulet couscous légumes. Confiance globale : medium.
- Totaux : kcal 490–940 (prob. 660); P 43–70 (prob. 54) g; G 39–75 (prob. 53) g; L 13–50 (prob. 25) g; fibres 4–11 (prob. 6) g; sucres 4–16 (prob. 8) g; ajoutés — g.
- Incertitudes : Grammages visuels approximatifs seulement. · Huile de rôtissage non mesurable. · Composition exacte de la sauce (yaourt, crème, mayo) inconnue. · Couscous éventuellement enrichi en matière grasse. · Sucres ajoutés de la sauce non estimables.. Signaux : portion_unknown/portion/medium, sauce_or_oil_unknown/sauceOrOil/medium, recipe_unknown/recipe/high, nova_group_unknown/novaGroup/medium, sugar_exposure_unknown/sugarExposure/medium, nutrition_unknown/nutrition/high.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Assiette poulet couscous légumes | dish; Grillade et légumes rôtis, sauce à part; preuve visible/photo | 1 assiette; 1 assiette; statut observed; kcal — | animal_protein, refined_grain, vegetable, sauce | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | medium; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Blanc de poulet grillé | component; Grillé, herbes, marqué; preuve visible/photo | plusieurs tranches; 170 g; statut observed; kcal 220–360 (prob. 280) | animal_protein | NOVA 1 (observed) | liquide false; concentré false; sucres 0–1 (prob. 0); ajoutés 0–0 (prob. 0) | protein_source, minimally_processed | medium; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 220–360 (prob. 280); P 35–52 (prob. 42) g; G 0–3 (prob. 1) g; L 6–16 (prob. 10) g; fibres 0–0 (prob. 0) g; sucres 0–1 (prob. 0) g; ajoutés 0–0 (prob. 0) g |
| Couscous | component; Cuit, herbes visibles; preuve visible/photo | 1 tas; 160 g; statut observed; kcal 160–260 (prob. 200) | refined_grain | NOVA 1 (observed) | liquide false; concentré false; sucres 0–2 (prob. 1); ajoutés 0–0 (prob. 0) | minimally_processed | medium; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 160–260 (prob. 200); P 5–9 (prob. 7) g; G 30–50 (prob. 38) g; L 1–8 (prob. 3) g; fibres 1–4 (prob. 2) g; sucres 0–2 (prob. 1) g; ajoutés 0–0 (prob. 0) g |
| Légumes rôtis | component; Rôtis à l’huile, grillés; preuve visible/photo | 1 portion; 160 g; statut observed; kcal 70–180 (prob. 110) | vegetable, added_fat | NOVA 1 (observed) | liquide false; concentré false; sucres 4–10 (prob. 6); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source, unsaturated_fat_source | medium; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 70–180 (prob. 110); P 2–5 (prob. 3) g; G 8–18 (prob. 12) g; L 3–12 (prob. 6) g; fibres 3–6 (prob. 4) g; sucres 4–10 (prob. 6) g; ajoutés 0–0 (prob. 0) g |
| Sauce blanche aux herbes | component; Froide, type yaourt ou mayonnaise légère; preuve visible/photo | 1 cuillerée généreuse; 45 g; statut observed; kcal 40–140 (prob. 70) | sauce, dairy | NOVA inconnu (unknown) | exposition inconnue; sucres 0–3 (prob. 1); ajoutés — | inconnues | low; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 40–140 (prob. 70); P 1–4 (prob. 2) g; G 1–4 (prob. 2) g; L 3–14 (prob. 6) g; fibres 0–1 (prob. 0) g; sucres 0–3 (prob. 1) g; ajoutés — g |

#### Dîner — d01-dinner · texte

- Preuve : texte. Origine alimentaire : unknown. Entrée synthétique : Pâtes à la tomate, un peu de parmesan et huile ajoutée au feeling; assiette assez pleine, pas de photo..
- Résumé détecté : Dîner décrit comme des pâtes à la tomate, un peu de parmesan et de l’huile ajoutée au feeling, assiette assez pleine, sans photo ni quantités précises.. Type de plat : Pâtes à la tomate. Confiance globale : low.
- Totaux : kcal 370–1320 (prob. 715); P 13–41 (prob. 22) g; G 59–173 (prob. 100) g; L 6–53 (prob. 22) g; fibres 3–13 (prob. 6) g; sucres 4–22 (prob. 9) g; ajoutés 0–8 (prob. 1) g.
- Incertitudes : Estimation à partir de la seule description, sans photo. · Portions non chiffrées (assiette assez pleine, un peu de parmesan, huile au feeling). · Recette et type de sauce tomate inconnus (maison ou industrielle). · Type d’huile et quantité d’huile inconnus. · Type de pâtes (blanches, complètes, fraîches) non précisé.. Signaux : portion_unknown/portion/high, recipe_unknown/recipe/high, sauce_or_oil_unknown/sauceOrOil/high, nova_group_unknown/novaGroup/medium, sugar_exposure_unknown/sugarExposure/medium, nutrition_unknown/nutrition/high, preparation_unknown/preparation/low.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Pâtes à la tomate | dish; Sauce tomate, parmesan et huile ajoutée au feeling; preuve inferred/note | assiette assez pleine; statut observed; kcal — | refined_grain, vegetable, dairy, added_fat | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Pâtes | component; préparation inconnue; preuve inferred/note | inconnue; statut unknown; kcal 280–800 (prob. 480) | refined_grain | NOVA 1 (observed) | liquide false; concentré false; sucres 1–5 (prob. 2); ajoutés 0–0 (prob. 0) | minimally_processed | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 280–800 (prob. 480); P 10–28 (prob. 16) g; G 55–150 (prob. 90) g; L 1–8 (prob. 3) g; fibres 2–8 (prob. 4) g; sucres 1–5 (prob. 2) g; ajoutés 0–0 (prob. 0) g |
| Sauce tomate | component; préparation inconnue; preuve inferred/note | inconnue; statut unknown; kcal 30–160 (prob. 70) | vegetable, sauce | NOVA inconnu (unknown) | exposition inconnue; sucres 3–16 (prob. 7); ajoutés 0–8 (prob. 1) | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 30–160 (prob. 70); P 1–5 (prob. 2) g; G 4–22 (prob. 10) g; L 0–8 (prob. 2) g; fibres 1–5 (prob. 2) g; sucres 3–16 (prob. 7) g; ajoutés 0–8 (prob. 1) g |
| Parmesan | component; préparation inconnue; preuve inferred/note | un peu; statut observed; kcal 20–90 (prob. 45) | dairy | NOVA 1 (observed) | liquide false; concentré false; sucres 0–1 (prob. 0); ajoutés 0–0 (prob. 0) | protein_source, minimally_processed | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 20–90 (prob. 45); P 2–8 (prob. 4) g; G 0–1 (prob. 0) g; L 1–7 (prob. 3) g; fibres 0–0 (prob. 0) g; sucres 0–1 (prob. 0) g; ajoutés 0–0 (prob. 0) g |
| Huile ajoutée | ingredient; ajoutée au feeling; preuve inferred/note | inconnue; statut unknown; kcal 40–270 (prob. 120) | added_fat | NOVA 2 (observed) | liquide false; concentré false; sucres 0–0 (prob. 0); ajoutés 0–0 (prob. 0) | inconnues | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"low"} | kcal 40–270 (prob. 120); P 0–0 (prob. 0) g; G 0–0 (prob. 0) g; L 4–30 (prob. 14) g; fibres 0–0 (prob. 0) g; sucres 0–0 (prob. 0) g; ajoutés 0–0 (prob. 0) g |

### 2026-09-02 — 76.53/100 · limited

Couverture 90 %, confiance 56 %, 4 repas. Total disponible : kcal 1920; P 86 g; G 211 g; L 80 g; fibres 22 g; sucres 36 g; ajoutés 17 g. Les créneaux absents restent des absences de trace, pas des apports nuls.

| Dimension | Score | Couverture | Confiance | Statut | Observation |
|---|---:|---:|---:|---|---|
| Variété | 88.25 | 100 % | 46 % | limited | 13 aliments · 12 groupes |
| Qualité alimentaire | 61.75 | 77 % | 63 % | limited | 77% des aliments avec propriétés décrites |
| Sucre ajouté | 35.94 | 100 % | 50 % | limited | 17 |
| Exposition liquide / concentrée | 93 | 77 % | 70 % | limited | 1 liquide · 1 concentré |
| Ultra-transformation | 83.33 | 69 % | 78 % | limited | 1.67 |
| Couverture nutritionnelle | 100 | 100 % | 50 % | limited | 100 |
| Énergie | 76.49 | 100 % | 50 % | limited | 1920 |

#### Petit-déjeuner — d02-breakfast · texte

- Preuve : texte. Origine alimentaire : unknown. Entrée synthétique : Deux tartines de pain complet (?) avec beurre de cacahuète, café avec un peu de lait; quantités à l'œil..
- Résumé détecté : Petit-déjeuner décrit : deux tartines de pain possiblement complet avec beurre de cacahuète, et un café avec un peu de lait. Les quantités hors « deux tartines » restent à l’œil ; la taille des tartines, la quantité de beurre et le type de pain/lait ne sont pas précisés.. Type de plat : petit-déjeuner. Confiance globale : low.
- Totaux : kcal 180–700 (prob. 350); P 6–32 (prob. 15) g; G 22–80 (prob. 42) g; L 5–38 (prob. 16) g; fibres 2–15 (prob. 7) g; sucres 1–20 (prob. 6) g; ajoutés 0–10 (prob. 1) g.
- Incertitudes : Estimation à partir de la seule description, sans photo. · Taille des tartines et grammage du pain inconnus. · Quantité de beurre de cacahuète non précisée (principal levier calorique). · Pain « complet (?) » : farine, recette et transformation inconnues. · Marque et recette du beurre de cacahuète (sucres ajoutés, huiles) inconnues. · Volume de café et quantité/type de lait (entier, demi-écrémé, végétal) inconnus.. Signaux : portion_unknown/portion/high, portion_unknown/portion/high, food_identity_unknown/identity/medium, brand_unknown/brand/medium, nova_group_unknown/novaGroup/medium, nova_group_unknown/novaGroup/medium, sugar_exposure_unknown/sugarExposure/medium, recipe_unknown/recipe/medium, portion_unknown/portion/medium, nutrition_unknown/nutrition/high.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Pain complet (tartines) | ingredient; en tartines, type complet incertain; preuve inferred/note | 2 tartines; 2 tartines; statut observed; kcal 120–360 (prob. 200) | whole_grain | NOVA inconnu (unknown) | liquide false; concentré false; sucres 1–8 (prob. 3); ajoutés 0–4 (prob. 0) | fiber_source | low; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 120–360 (prob. 200); P 4–16 (prob. 8) g; G 20–64 (prob. 36) g; L 1–8 (prob. 3) g; fibres 2–10 (prob. 5) g; sucres 1–8 (prob. 3) g; ajoutés 0–4 (prob. 0) g |
| Beurre de cacahuète | ingredient; préparation inconnue; preuve inferred/note | inconnue; statut unknown; kcal 50–320 (prob. 140) | nuts_seeds, plant_protein, added_fat | NOVA inconnu (unknown) | exposition inconnue; sucres 0–8 (prob. 2); ajoutés 0–6 (prob. 1) | protein_source, unsaturated_fat_source | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 50–320 (prob. 140); P 2–14 (prob. 6) g; G 2–14 (prob. 5) g; L 4–28 (prob. 12) g; fibres 0–5 (prob. 2) g; sucres 0–8 (prob. 2) g; ajoutés 0–6 (prob. 1) g |
| Café | ingredient; avec un peu de lait; preuve inferred/note | inconnue; statut unknown; kcal 0–10 (prob. 2) | beverage | NOVA 1 (observed) | liquide false; concentré false; sucres 0–0 (prob. 0); ajoutés 0–0 (prob. 0) | aucune observée | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 0–10 (prob. 2); P 0–1 (prob. 0) g; G 0–1 (prob. 0) g; L 0–0 (prob. 0) g; fibres 0–0 (prob. 0) g; sucres 0–0 (prob. 0) g; ajoutés 0–0 (prob. 0) g |
| Lait | ingredient; ajouté au café, un peu; preuve inferred/note | inconnue; statut unknown; kcal 5–50 (prob. 15) | dairy, beverage | NOVA 1 (observed) | liquide true; concentré false; sucres 0–4 (prob. 1); ajoutés 0–0 (prob. 0) | protein_source | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"low"} | kcal 5–50 (prob. 15); P 0–3 (prob. 1) g; G 0–4 (prob. 1) g; L 0–3 (prob. 1) g; fibres 0–0 (prob. 0) g; sucres 0–4 (prob. 1) g; ajoutés 0–0 (prob. 0) g |

#### Déjeuner — d02-lunch · photo + texte

- Preuve : photo + texte. Origine alimentaire : homemade. Entrée synthétique : Salade de lentilles, feta, tomate et morceau de pain; la vinaigrette est probablement déjà au fond..
- Résumé détecté : Bol de salade de lentilles avec tomates, feta, herbes et une vinaigrette huileuse visible au fond, accompagné d’un morceau de pain. Les quantités exactes et la recette de la vinaigrette ne sont pas mesurables sur la photo.. Type de plat : Salade de lentilles. Confiance globale : medium.
- Totaux : kcal 362–865 (prob. 560); P 16–41 (prob. 26) g; G 39–92 (prob. 60) g; L 12–42 (prob. 23) g; fibres 6–20 (prob. 12) g; sucres 3–14 (prob. 7) g; ajoutés — g.
- Incertitudes : Grammages non mesurables : fourchettes nutritionnelles larges. · Quantité d’huile / vinaigrette au fond du bol incertaine. · Type exact de pain et éventuel sucre ajouté inconnus. · Composition précise de la vinaigrette (sucre, moutarde) non visible.. Signaux : portion_unknown/portion/high, portion_unknown/portion/medium, sauce_or_oil_unknown/sauceOrOil/high, nova_group_unknown/novaGroup/medium, sugar_exposure_unknown/sugarExposure/medium, nutrition_unknown/nutrition/medium, recipe_unknown/recipe/low.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Salade de lentilles | dish; Salade composée, lentilles cuites, vinaigrette au fond; preuve visible/photo | 1 bol; 1 bol; statut observed; kcal — | legume, vegetable, dairy, added_fat | NOVA inconnu (unknown) | liquide false; concentré false; sucres —; ajoutés — | fiber_source, protein_source | medium; axes {"portion":"medium","novaGroup":"low","sugarExposure":"medium","qualityProperties":"medium"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Lentilles | component; Cuites, en salade; preuve visible/photo | inconnue; statut unknown; kcal 140–280 (prob. 200) | legume | NOVA 1 (observed) | liquide false; concentré false; sucres 1–4 (prob. 2); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source, protein_source | medium; axes {"portion":"low","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 140–280 (prob. 200); P 10–22 (prob. 15) g; G 22–45 (prob. 32) g; L 0–3 (prob. 1) g; fibres 6–15 (prob. 10) g; sucres 1–4 (prob. 2) g; ajoutés 0–0 (prob. 0) g |
| Tomates | component; Crues, en morceaux; preuve visible/photo | inconnue; statut unknown; kcal 12–35 (prob. 20) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 2–5 (prob. 3); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"low","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 12–35 (prob. 20); P 0–2 (prob. 1) g; G 2–7 (prob. 4) g; L 0–0 (prob. 0) g; fibres 0–2 (prob. 1) g; sucres 2–5 (prob. 3) g; ajoutés 0–0 (prob. 0) g |
| Feta | component; Émiettée; preuve visible/photo | inconnue; statut unknown; kcal 70–170 (prob. 110) | dairy | NOVA 3 (observed) | liquide false; concentré false; sucres 0–2 (prob. 1); ajoutés 0–0 (prob. 0) | protein_source | medium; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 70–170 (prob. 110); P 4–10 (prob. 6) g; G 0–3 (prob. 1) g; L 5–14 (prob. 9) g; fibres 0–0 (prob. 0) g; sucres 0–2 (prob. 1) g; ajoutés 0–0 (prob. 0) g |
| Vinaigrette à l’huile | ingredient; Huile visible au fond du bol, vinaigrette probable selon la note; preuve inferred/note | inconnue; statut unknown; kcal 60–200 (prob. 110) | added_fat, sauce | NOVA 2 (observed) | exposition inconnue; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"low","qualityProperties":"low"} | kcal 60–200 (prob. 110); P 0–0 (prob. 0) g; G 0–2 (prob. 0) g; L 7–22 (prob. 12) g; fibres 0–0 (prob. 0) g; sucres — g; ajoutés — g |
| Pain | component; Morceau de pain, mie aérée, croûte dorée; preuve visible/photo | 1 morceau; 1 morceau; statut observed; kcal 80–180 (prob. 120) | refined_grain | NOVA inconnu (unknown) | liquide false; concentré false; sucres 0–3 (prob. 1); ajoutés — | inconnues | medium; axes {"portion":"medium","novaGroup":"low","sugarExposure":"medium","qualityProperties":"low"} | kcal 80–180 (prob. 120); P 2–7 (prob. 4) g; G 15–35 (prob. 23) g; L 0–3 (prob. 1) g; fibres 0–3 (prob. 1) g; sucres 0–3 (prob. 1) g; ajoutés — g |

#### Collation — d02-snack · photo

- Preuve : photo. Origine alimentaire : prepared. Entrée synthétique : aucune note; preuve photo uniquement.
- Résumé détecté : En-cas : une barre de chocolat au riz soufflé, encore dans son papier aluminium. Marque et poids exacts non lisibles ; estimation nutritionnelle large d’après l’apparence d’une barre individuelle.. Type de plat : Barre chocolat croustillant. Confiance globale : medium.
- Totaux : kcal 150–280 (prob. 210); P 2–5 (prob. 3) g; G 18–35 (prob. 25) g; L 8–18 (prob. 12) g; fibres 0–3 (prob. 1) g; sucres 12–26 (prob. 18) g; ajoutés 10–24 (prob. 16) g.
- Incertitudes : Marque et grammage de la barre non identifiables · Teneur exacte en sucre ajouté et en matière grasse selon la recette inconnue · Le fond blanc à gauche n’est pas un aliment clairement identifiable. Signaux : brand_unknown/brand/medium, portion_unknown/portion/medium, recipe_unknown/recipe/medium, nutrition_unknown/nutrition/medium.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Barre de chocolat au riz soufflé | dish; Chocolat avec céréales soufflées, emballage aluminium; preuve visible/photo | 1 barre; 1 barre; statut observed; kcal 150–280 (prob. 210) | sweet, refined_grain | NOVA 4 (observed) | liquide false; concentré true; sucres 12–26 (prob. 18); ajoutés 10–24 (prob. 16) | aucune observée | medium; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 150–280 (prob. 210); P 2–5 (prob. 3) g; G 18–35 (prob. 25) g; L 8–18 (prob. 12) g; fibres 0–3 (prob. 1) g; sucres 12–26 (prob. 18) g; ajoutés 10–24 (prob. 16) g |

#### Dîner — d02-dinner · photo + texte

- Preuve : photo + texte. Origine alimentaire : prepared. Entrée synthétique : Curry de poulet livré avec riz; sauce assez présente, quantité de riz difficile à juger..
- Résumé détecté : Barquette de curry de poulet livré, avec riz blanc d’un côté et une sauce orange assez abondante recouvrant des morceaux de poulet. Une seule photo, pas de boisson visible. Les quantités (surtout le riz et l’épaisseur de sauce) restent approximatives.. Type de plat : Curry de poulet au riz. Confiance globale : low.
- Totaux : kcal 550–1160 (prob. 800); P 28–62 (prob. 42) g; G 54–126 (prob. 84) g; L 16–51 (prob. 29) g; fibres 0–5 (prob. 2) g; sucres 2–14 (prob. 5) g; ajoutés — g.
- Incertitudes : Quantité de riz difficile à juger sur une seule photo. · Recette et matières grasses de la sauce inconnues (crème, huile, beurre, sucres possibles). · Poids du poulet non mesurable. · Sucres ajoutés de la sauce non estimables de façon responsable.. Signaux : portion_unknown/portion/high, recipe_unknown/recipe/high, sauce_or_oil_unknown/sauceOrOil/high, nova_group_unknown/novaGroup/medium, sugar_exposure_unknown/sugarExposure/medium, nutrition_unknown/nutrition/medium.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Curry de poulet au riz | dish; Plat livré, sauce mijotée abondante; preuve visible/photo | 1 barquette; 1 barquette; statut observed; kcal — | animal_protein, refined_grain, sauce | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | medium; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Riz blanc | component; Cuit, nature; preuve visible/photo | moitié de barquette, volume difficile à juger; statut observed; kcal 220–450 (prob. 320) | refined_grain | NOVA 1 (observed) | liquide false; concentré false; sucres 0–1 (prob. 0); ajoutés 0–0 (prob. 0) | minimally_processed | low; axes {"portion":"low","novaGroup":"high","sugarExposure":"medium","qualityProperties":"medium"} | kcal 220–450 (prob. 320); P 4–9 (prob. 6) g; G 48–98 (prob. 70) g; L 0–3 (prob. 1) g; fibres 0–2 (prob. 1) g; sucres 0–1 (prob. 0) g; ajoutés 0–0 (prob. 0) g |
| Morceaux de poulet | component; Mijotés dans la sauce; preuve visible/photo | plusieurs morceaux dans la sauce; statut observed; kcal 180–360 (prob. 260) | animal_protein | NOVA 1 (observed) | liquide false; concentré false; sucres 0–1 (prob. 0); ajoutés 0–0 (prob. 0) | protein_source | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 180–360 (prob. 260); P 22–45 (prob. 32) g; G 0–6 (prob. 2) g; L 6–20 (prob. 12) g; fibres 0–0 (prob. 0) g; sucres 0–1 (prob. 0) g; ajoutés 0–0 (prob. 0) g |
| Sauce curry | component; Sauce onctueuse, assez présente; preuve visible/photo | couche généreuse sur le poulet; statut observed; kcal 150–350 (prob. 220) | sauce, added_fat | NOVA inconnu (unknown) | exposition inconnue; sucres 2–12 (prob. 5); ajoutés — | inconnues | low; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 150–350 (prob. 220); P 2–8 (prob. 4) g; G 6–22 (prob. 12) g; L 10–28 (prob. 16) g; fibres 0–3 (prob. 1) g; sucres 2–12 (prob. 5) g; ajoutés — g |

### 2026-09-03 — 85.84/100 · limited

Couverture 67 %, confiance 60 %, 3 repas. Total disponible : kcal 1240; P 64 g; G 114 g; L 53 g; fibres 17 g; sucres 44 g; ajoutés 3 g. Les créneaux absents restent des absences de trace, pas des apports nuls.

| Dimension | Score | Couverture | Confiance | Statut | Observation |
|---|---:|---:|---:|---|---|
| Variété | 84.58 | 75 % | 56 % | limited | 12 aliments · 10 groupes |
| Qualité alimentaire | 77.19 | 50 % | 96 % | limited | 67% des aliments avec propriétés décrites |
| Sucre ajouté | 94 | 75 % | 44 % | limited | 3 |
| Exposition liquide / concentrée | 100 | 56 % | 78 % | limited | 0 liquide · 0 concentré |
| Ultra-transformation | 89.5 | 63 % | 87 % | limited | 1.4 |
| Couverture nutritionnelle | 100 | 75 % | 44 % | limited | 100 |
| Énergie | 57.57 | 75 % | 44 % | limited | 1240 |

#### Petit-déjeuner — d03-breakfast · photo

- Preuve : photo. Origine alimentaire : prepared. Entrée synthétique : aucune note; preuve photo uniquement.
- Résumé détecté : Petit-déjeuner : bol de yaourt nature apparent avec granola, fraises et banane, accompagné d’un café noir. Un carton de lait est visible en arrière-plan mais n’est pas versé dans une tasse.. Type de plat : Bol yaourt granola. Confiance globale : low.
- Totaux : kcal 205–600 (prob. 360); P 8–26 (prob. 15) g; G 24–84 (prob. 47) g; L 5–24 (prob. 11) g; fibres 1–8 (prob. 4) g; sucres 15–54 (prob. 28) g; ajoutés — g.
- Incertitudes : Quantités de yaourt et de granola non mesurables sans référence d’échelle. · Type de yaourt (nature, sucré, gras) non identifiable. · Recette et sucres ajoutés du granola inconnus. · Le carton de lait n’indique pas qu’il a été consommé. · Sucre éventuellement ajouté au café non visible.. Signaux : portion_unknown/portion/high, portion_unknown/portion/high, recipe_unknown/recipe/high, recipe_unknown/recipe/high, nova_group_unknown/novaGroup/medium, nova_group_unknown/novaGroup/medium, sugar_exposure_unknown/sugarExposure/medium, sauce_or_oil_unknown/sauceOrOil/low, nutrition_unknown/nutrition/medium.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Bol yaourt, granola et fruits | dish; Servi froid, non cuit; preuve visible/photo | 1 bol; 1 bol; statut observed; kcal — | dairy, fruit, refined_grain, sweet | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | medium; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Yaourt | component; Nature apparent, non cuit; preuve visible/photo | base du bol; statut observed; kcal 90–220 (prob. 140) | dairy | NOVA inconnu (unknown) | exposition inconnue; sucres 6–20 (prob. 11); ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 90–220 (prob. 140); P 6–16 (prob. 10) g; G 6–22 (prob. 12) g; L 2–12 (prob. 5) g; fibres 0–0 (prob. 0) g; sucres 6–20 (prob. 11) g; ajoutés — g |
| Granola | component; Céréales croustillantes, probablement toastées; preuve visible/photo | une poignée éparpillée; statut observed; kcal 80–250 (prob. 150) | refined_grain, nuts_seeds, sweet | NOVA inconnu (unknown) | exposition inconnue; sucres 3–14 (prob. 7); ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 80–250 (prob. 150); P 2–7 (prob. 4) g; G 10–32 (prob. 20) g; L 3–12 (prob. 6) g; fibres 1–4 (prob. 2) g; sucres 3–14 (prob. 7) g; ajoutés — g |
| Fraises | component; Crues, coupées; preuve visible/photo | quelques morceaux; statut observed; kcal 10–35 (prob. 20) | fruit | NOVA 1 (observed) | liquide false; concentré false; sucres 2–6 (prob. 3); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"medium","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 10–35 (prob. 20); P 0–1 (prob. 0) g; G 2–8 (prob. 4) g; L 0–0 (prob. 0) g; fibres 0–2 (prob. 1) g; sucres 2–6 (prob. 3) g; ajoutés 0–0 (prob. 0) g |
| Banane | component; Crue, en rondelles; preuve visible/photo | quelques rondelles; statut observed; kcal 25–80 (prob. 45) | fruit | NOVA 1 (observed) | liquide false; concentré false; sucres 4–12 (prob. 7); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"medium","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 25–80 (prob. 45); P 0–1 (prob. 1) g; G 6–20 (prob. 11) g; L 0–0 (prob. 0) g; fibres 0–2 (prob. 1) g; sucres 4–12 (prob. 7) g; ajoutés 0–0 (prob. 0) g |
| Café noir | dish; Infusion, sans lait visible dans la tasse; preuve visible/photo | 1 tasse; 1 tasse; statut observed; kcal 0–15 (prob. 5) | beverage | NOVA 1 (observed) | liquide false; concentré false; sucres 0–2 (prob. 0); ajoutés 0–2 (prob. 0) | aucune observée | medium; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 0–15 (prob. 5); P 0–1 (prob. 0) g; G 0–2 (prob. 0) g; L 0–0 (prob. 0) g; fibres 0–0 (prob. 0) g; sucres 0–2 (prob. 0) g; ajoutés 0–2 (prob. 0) g |

#### Déjeuner — d03-lunch · texte

- Preuve : texte. Origine alimentaire : unknown. Entrée synthétique : Sandwich au thon acheté, peut-être mayonnaise et fromage; mangé rapidement, pas de photo..
- Résumé détecté : Repas du midi constitué d’un sandwich au thon acheté, éventuellement avec mayonnaise et fromage. Aucune photo ni quantité n’est indiquée ; l’estimation reste donc très incertaine.. Type de plat : Sandwich. Confiance globale : low.
- Totaux : kcal 300–850 (prob. 500); P 15–40 (prob. 25) g; G 28–75 (prob. 45) g; L 10–45 (prob. 22) g; fibres 1–8 (prob. 4) g; sucres 2–15 (prob. 6) g; ajoutés 0–12 (prob. 3) g.
- Incertitudes : Estimation à partir de la seule description, sans photo. · Taille et poids du sandwich non indiqués. · Présence de mayonnaise et de fromage seulement possible, non confirmée. · Type de pain, recette, huile et quantités de garniture inconnus.. Signaux : portion_unknown/portion/high, recipe_unknown/recipe/high, sauce_or_oil_unknown/sauceOrOil/medium, composition_uncertain/composition/medium, nutrition_unknown/nutrition/high, brand_unknown/brand/medium, sugar_exposure_unknown/sugarExposure/low.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Sandwich au thon | dish; Acheté, composition incomplète; preuve inferred/note | inconnue; statut unknown; kcal 300–850 (prob. 500) | refined_grain, animal_protein | NOVA 4 (observed) | exposition inconnue; sucres 2–15 (prob. 6); ajoutés 0–12 (prob. 3) | inconnues | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"low","qualityProperties":"low"} | kcal 300–850 (prob. 500); P 15–40 (prob. 25) g; G 28–75 (prob. 45) g; L 10–45 (prob. 22) g; fibres 1–8 (prob. 4) g; sucres 2–15 (prob. 6) g; ajoutés 0–12 (prob. 3) g |
| Mayonnaise | ingredient; préparation inconnue; preuve inferred/note | inconnue; statut unknown; kcal — | added_fat, sauce | NOVA 4 (observed) | liquide false; concentré false; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Fromage | ingredient; préparation inconnue; preuve inferred/note | inconnue; statut unknown; kcal — | dairy | NOVA inconnu (unknown) | liquide false; concentré false; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |

#### Dîner — d03-dinner · photo + texte

- Preuve : photo + texte. Origine alimentaire : homemade. Entrée synthétique : Poêlée de légumes et tofu; un filet d'huile, légumes surgelés possibles, portion plutôt moyenne..
- Résumé détecté : Poêlée maison de tofu doré et légumes (brocoli, carotte, poivron, oignon) dans un bol, avec un filet d’huile visible. Portion d’aspect moyen, sans féculent ni sauce évidente au-delà du gras de cuisson.. Type de plat : Poêlée tofu légumes. Confiance globale : medium.
- Totaux : kcal 250–520 (prob. 380); P 16–34 (prob. 24) g; G 14–32 (prob. 22) g; L 12–32 (prob. 20) g; fibres 6–13 (prob. 9) g; sucres 6–15 (prob. 10) g; ajoutés 0–2 (prob. 0) g.
- Incertitudes : Grammes non mesurables sur la photo ; portion seulement visuelle. · Quantité et type d’huile imprécis (filet indiqué, brillance visible). · Mélange surgelé possible : composition exacte non confirmée. · Assaisonnement ou sauce sucrée non visible, non compté au-delà d’une petite marge.. Signaux : portion_unknown/portion/high, sauce_or_oil_unknown/sauceOrOil/medium, recipe_unknown/recipe/medium, nova_group_unknown/novaGroup/low, nutrition_unknown/nutrition/medium.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Poêlée de légumes et tofu | dish; Poêlée, légèrement dorée; preuve visible/photo | 1 bol, portion moyenne; 1 bol; statut observed; kcal 250–520 (prob. 380) | vegetable, plant_protein, added_fat | NOVA inconnu (unknown) | liquide false; concentré false; sucres 6–15 (prob. 10); ajoutés 0–2 (prob. 0) | protein_source, fiber_source | medium; axes {"portion":"medium","novaGroup":"low","sugarExposure":"medium","qualityProperties":"medium"} | kcal 250–520 (prob. 380); P 16–34 (prob. 24) g; G 14–32 (prob. 22) g; L 12–32 (prob. 20) g; fibres 6–13 (prob. 9) g; sucres 6–15 (prob. 10) g; ajoutés 0–2 (prob. 0) g |
| Tofu ferme | component; Poêlé, cubes dorés; preuve visible/photo | plusieurs cubes; statut observed; kcal 140–280 (prob. 200) | plant_protein | NOVA 1 (observed) | liquide false; concentré false; sucres 0–2 (prob. 1); ajoutés 0–0 (prob. 0) | protein_source, minimally_processed | medium; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"high"} | kcal 140–280 (prob. 200); P 14–28 (prob. 20) g; G 2–8 (prob. 4) g; L 7–18 (prob. 11) g; fibres 1–4 (prob. 2) g; sucres 0–2 (prob. 1) g; ajoutés 0–0 (prob. 0) g |
| Brocoli | component; Poêlé; preuve visible/photo | inconnue; statut unknown; kcal 25–60 (prob. 40) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 1–4 (prob. 2); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"medium","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 25–60 (prob. 40); P 2–5 (prob. 3) g; G 4–11 (prob. 7) g; L 0–1 (prob. 0) g; fibres 2–5 (prob. 3) g; sucres 1–4 (prob. 2) g; ajoutés 0–0 (prob. 0) g |
| Carotte | component; Poêlée, en tranches; preuve visible/photo | inconnue; statut unknown; kcal 15–40 (prob. 25) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 2–5 (prob. 3); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"medium","novaGroup":"high","sugarExposure":"medium","qualityProperties":"high"} | kcal 15–40 (prob. 25); P 0–1 (prob. 1) g; G 3–9 (prob. 6) g; L 0–0 (prob. 0) g; fibres 1–3 (prob. 2) g; sucres 2–5 (prob. 3) g; ajoutés 0–0 (prob. 0) g |
| Poivron | component; Poêlé, en lamelles; preuve visible/photo | inconnue; statut unknown; kcal 10–30 (prob. 18) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 1–4 (prob. 2); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"medium","novaGroup":"high","sugarExposure":"medium","qualityProperties":"high"} | kcal 10–30 (prob. 18); P 0–1 (prob. 1) g; G 2–7 (prob. 4) g; L 0–0 (prob. 0) g; fibres 1–2 (prob. 1) g; sucres 1–4 (prob. 2) g; ajoutés 0–0 (prob. 0) g |
| Oignon | component; Poêlé, en lamelles; preuve visible/photo | inconnue; statut unknown; kcal 10–30 (prob. 18) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 1–4 (prob. 2); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed | medium; axes {"portion":"medium","novaGroup":"high","sugarExposure":"medium","qualityProperties":"high"} | kcal 10–30 (prob. 18); P 0–1 (prob. 1) g; G 2–7 (prob. 4) g; L 0–0 (prob. 0) g; fibres 0–2 (prob. 1) g; sucres 1–4 (prob. 2) g; ajoutés 0–0 (prob. 0) g |
| Huile de cuisson | ingredient; Filet, poêlée; preuve inferred/note | un filet; statut observed; kcal 40–135 (prob. 80) | added_fat | NOVA 2 (observed) | liquide false; concentré false; sucres 0–0 (prob. 0); ajoutés 0–0 (prob. 0) | inconnues | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"low"} | kcal 40–135 (prob. 80); P 0–0 (prob. 0) g; G 0–0 (prob. 0) g; L 4–15 (prob. 9) g; fibres 0–0 (prob. 0) g; sucres 0–0 (prob. 0) g; ajoutés 0–0 (prob. 0) g |

### 2026-09-04 — 84.42/100 · limited

Couverture 63 %, confiance 61 %, 3 repas. Total disponible : kcal 958; P 51.5 g; G 111 g; L 36 g; fibres 12.5 g; sucres 13.5 g; ajoutés 3 g. Les créneaux absents restent des absences de trace, pas des apports nuls.

| Dimension | Score | Couverture | Confiance | Statut | Observation |
|---|---:|---:|---:|---|---|
| Variété | 82.98 | 75 % | 56 % | limited | 12 aliments · 8 groupes |
| Qualité alimentaire | 79.13 | 50 % | 88 % | limited | 67% des aliments avec propriétés décrites |
| Sucre ajouté | 94 | 67 % | 44 % | limited | 3 |
| Exposition liquide / concentrée | 100 | 63 % | 84 % | limited | 0 liquide · 0 concentré |
| Ultra-transformation | 88.75 | 50 % | 88 % | limited | 1.5 |
| Couverture nutritionnelle | 66.67 | 67 % | 44 % | limited | 66.67 |
| Énergie | 75 | 67 % | 44 % | limited | 958 |

#### Petit-déjeuner — d04-breakfast · photo + texte

- Preuve : photo + texte. Origine alimentaire : homemade. Entrée synthétique : Toast avec œuf et avocat, une tranche seulement?; le café n'est pas visible sur la photo..
- Résumé détecté : Petit-déjeuner visible : une tranche de pain grillé garnie d’avocat et d’un œuf au plat, poivre et flocons de piment. Le café mentionné n’apparaît pas sur la photo.. Type de plat : Toast avocat-œuf. Confiance globale : medium.
- Totaux : kcal 200–433 (prob. 286); P 8.5–15 (prob. 11.5) g; G 14–32 (prob. 21) g; L 10–31 (prob. 18) g; fibres 3–9.5 (prob. 5.5) g; sucres 0–4 (prob. 1.5) g; ajoutés 0–1 (prob. 0) g.
- Incertitudes : Type exact du pain (complet vs raffiné) et poids de la tranche incertains. · Quantité d’avocat approximative. · Graisse de cuisson de l’œuf non visible. · Café indiqué par la note mais absent de la photo, non compté.. Signaux : portion_unknown/portion/medium, composition_uncertain/composition/medium, portion_unknown/portion/medium, sauce_or_oil_unknown/sauceOrOil/high, nova_group_unknown/novaGroup/low, nutrition_unknown/nutrition/medium.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Toast avocat et œuf | dish; Pain grillé, avocat écrasé/tranché, œuf au plat; preuve visible/photo | 1 tranche garnie; 1 tranche; statut observed; kcal — | refined_grain, vegetable, egg, added_fat | NOVA inconnu (unknown) | liquide false; concentré false; sucres —; ajoutés — | protein_source, fiber_source, unsaturated_fat_source | medium; axes {"portion":"high","novaGroup":"low","sugarExposure":"medium","qualityProperties":"medium"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Pain grillé | component; Tranche grillée, mie plutôt claire, croûte brune; preuve visible/photo | 1 tranche; 35 g; 1 tranche; statut observed; kcal 70–130 (prob. 95) | refined_grain | NOVA 3 (observed) | liquide false; concentré false; sucres 0–3 (prob. 1.5); ajoutés 0–1 (prob. 0) | minimally_processed | medium; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 70–130 (prob. 95); P 2.5–5 (prob. 3.5) g; G 12–24 (prob. 17) g; L 0–3 (prob. 1.5) g; fibres 1–3.5 (prob. 2) g; sucres 0–3 (prob. 1.5) g; ajoutés 0–1 (prob. 0) g |
| Avocat | component; Tranché et légèrement écrasé sur le pain; preuve visible/photo | environ un quart à un demi-fruit; 50 g; statut observed; kcal 60–130 (prob. 80) | vegetable, added_fat | NOVA 1 (observed) | liquide false; concentré false; sucres 0–1 (prob. 0); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source, unsaturated_fat_source | medium; axes {"portion":"medium","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 60–130 (prob. 80); P 0–2 (prob. 1) g; G 2–7 (prob. 4) g; L 5–12 (prob. 7.5) g; fibres 2–6 (prob. 3.5) g; sucres 0–1 (prob. 0) g; ajoutés 0–0 (prob. 0) g |
| Œuf au plat | component; Au plat, jaune encore entier, blanc cuit; preuve visible/photo | 1 œuf; 50 g; 1 œuf; statut observed; kcal 70–120 (prob. 90) | egg, animal_protein | NOVA 1 (observed) | liquide false; concentré false; sucres 0–0 (prob. 0); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, protein_source | high; axes {"portion":"high","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 70–120 (prob. 90); P 6–8 (prob. 7) g; G 0–1 (prob. 0) g; L 5–10 (prob. 7) g; fibres 0–0 (prob. 0) g; sucres 0–0 (prob. 0) g; ajoutés 0–0 (prob. 0) g |
| Poivre et piment | ingredient; Saupoudrés sur l’œuf; preuve visible/photo | inconnue; statut unknown; kcal 0–3 (prob. 1) | other | NOVA 1 (observed) | liquide false; concentré false; sucres 0–0 (prob. 0); ajoutés 0–0 (prob. 0) | aucune observée | medium; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 0–3 (prob. 1); P 0–0 (prob. 0) g; G 0–0 (prob. 0) g; L 0–0 (prob. 0) g; fibres 0–0 (prob. 0) g; sucres 0–0 (prob. 0) g; ajoutés 0–0 (prob. 0) g |
| Matière grasse de cuisson | ingredient; Possible graisse dans la poêle pour l’œuf, non mesurable; preuve inferred/model | inconnue; statut unknown; kcal 0–50 (prob. 20) | added_fat | NOVA inconnu (unknown) | liquide false; concentré false; sucres 0–0 (prob. 0); ajoutés 0–0 (prob. 0) | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"medium","qualityProperties":"low"} | kcal 0–50 (prob. 20); P 0–0 (prob. 0) g; G 0–0 (prob. 0) g; L 0–6 (prob. 2) g; fibres 0–0 (prob. 0) g; sucres 0–0 (prob. 0) g; ajoutés 0–0 (prob. 0) g |

#### Collation — d04-snack · texte

- Preuve : texte. Origine alimentaire : unknown. Entrée synthétique : Une barre de céréales, marque inconnue, mangée en déplacement; taille standard supposée..
- Résumé détecté : Collation en déplacement : une barre de céréales de marque inconnue, sans quantité mesurée ni recette.. Type de plat : barre de céréales. Confiance globale : low.
- Totaux : kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g.
- Incertitudes : Estimation à partir de la seule description, sans photo. · Marque, recette, taille réelle et préparation inconnues ; aucune estimation nutritionnelle responsable.. Signaux : brand_unknown/brand/high, portion_unknown/portion/high, recipe_unknown/recipe/high, nova_group_unknown/novaGroup/medium, sugar_exposure_unknown/sugarExposure/medium, nutrition_unknown/nutrition/high, quality_properties_unknown/qualityProperties/low.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Barre de céréales | dish; préparation inconnue; preuve inferred/note | inconnue; statut unknown; kcal — | refined_grain, sweet | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |

#### Dîner — d04-dinner · photo

- Preuve : photo. Origine alimentaire : prepared. Entrée synthétique : aucune note; preuve photo uniquement.
- Résumé détecté : Bol de nouilles épaisses sautées (type udon/lo mein) avec morceaux de poulet, brocoli, carottes et poivron, nappées d’une sauce brune brillante. Une seule photo, sans note : portions et recette de sauce très incertaines.. Type de plat : Nouilles sautées au poulet. Confiance globale : low.
- Totaux : kcal 400–1060 (prob. 672); P 23–65 (prob. 40) g; G 52–144 (prob. 90) g; L 7–40 (prob. 18) g; fibres 3–15 (prob. 7) g; sucres 4–27 (prob. 12) g; ajoutés 0–10 (prob. 3) g.
- Incertitudes : Grammages non mesurables depuis une seule photo. · Type exact de nouilles et composition de la sauce inconnus. · Huile de cuisson et sucres ajoutés de la sauce non quantifiables. · Morceaux de poulet partiellement recouverts : quantité incertaine.. Signaux : portion_unknown/portion/high, sauce_or_oil_unknown/sauceOrOil/high, recipe_unknown/recipe/medium, nova_group_unknown/novaGroup/medium, nutrition_unknown/nutrition/high.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Nouilles sautées poulet-légumes | dish; Sautées, sauce brune brillante; preuve visible/photo | 1 barquette; 1 barquette; statut observed; kcal — | refined_grain, animal_protein, vegetable, sauce | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | medium; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Nouilles épaisses | component; Sautées; preuve visible/photo | inconnue; statut unknown; kcal 250–550 (prob. 380) | refined_grain | NOVA inconnu (unknown) | liquide false; concentré false; sucres 1–6 (prob. 3); ajoutés 0–2 (prob. 0) | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"medium","qualityProperties":"low"} | kcal 250–550 (prob. 380); P 8–18 (prob. 12) g; G 45–100 (prob. 70) g; L 2–12 (prob. 6) g; fibres 1–5 (prob. 3) g; sucres 1–6 (prob. 3) g; ajoutés 0–2 (prob. 0) g |
| Poulet | component; Sauté, en morceaux; preuve visible/photo | inconnue; statut unknown; kcal 80–220 (prob. 140) | animal_protein | NOVA 1 (observed) | liquide false; concentré false; sucres 0–1 (prob. 0); ajoutés 0–0 (prob. 0) | protein_source | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 80–220 (prob. 140); P 14–36 (prob. 24) g; G 0–4 (prob. 1) g; L 2–12 (prob. 5) g; fibres 0–0 (prob. 0) g; sucres 0–1 (prob. 0) g; ajoutés 0–0 (prob. 0) g |
| Brocoli | component; Sauté; preuve visible/photo | inconnue; statut unknown; kcal 15–50 (prob. 30) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 1–3 (prob. 2); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"low","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 15–50 (prob. 30); P 1–4 (prob. 2) g; G 2–9 (prob. 5) g; L 0–1 (prob. 0) g; fibres 1–4 (prob. 2) g; sucres 1–3 (prob. 2) g; ajoutés 0–0 (prob. 0) g |
| Carotte | component; Sautée, en lamelles; preuve visible/photo | inconnue; statut unknown; kcal 10–35 (prob. 20) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 1–4 (prob. 2); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"low","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 10–35 (prob. 20); P 0–1 (prob. 0) g; G 2–8 (prob. 4) g; L 0–1 (prob. 0) g; fibres 1–3 (prob. 1) g; sucres 1–4 (prob. 2) g; ajoutés 0–0 (prob. 0) g |
| Poivron | component; Sauté; preuve visible/photo | inconnue; statut unknown; kcal 5–25 (prob. 12) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 1–3 (prob. 1); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed | medium; axes {"portion":"low","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 5–25 (prob. 12); P 0–1 (prob. 0) g; G 1–5 (prob. 2) g; L 0–0 (prob. 0) g; fibres 0–2 (prob. 1) g; sucres 1–3 (prob. 1) g; ajoutés 0–0 (prob. 0) g |
| Sauce de cuisson | ingredient; Sauce brune brillante (huile et/ou sauce soja possible); preuve inferred/photo | inconnue; statut unknown; kcal 40–180 (prob. 90) | sauce, added_fat | NOVA inconnu (unknown) | exposition inconnue; sucres 1–10 (prob. 4); ajoutés 0–8 (prob. 3) | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 40–180 (prob. 90); P 0–5 (prob. 2) g; G 2–18 (prob. 8) g; L 3–14 (prob. 7) g; fibres 0–1 (prob. 0) g; sucres 1–10 (prob. 4) g; ajoutés 0–8 (prob. 3) g |

### 2026-09-05 — 83.99/100 · limited

Couverture 63 %, confiance 56 %, 3 repas. Total disponible : kcal 1095; P 63 g; G 128 g; L 34 g; fibres 23 g; sucres 22 g; ajoutés 3 g. Les créneaux absents restent des absences de trace, pas des apports nuls.

| Dimension | Score | Couverture | Confiance | Statut | Observation |
|---|---:|---:|---:|---|---|
| Variété | 81.63 | 75 % | 43 % | limited | 10 aliments · 10 groupes |
| Qualité alimentaire | 72.54 | 60 % | 79 % | limited | 80% des aliments avec propriétés décrites |
| Sucre ajouté | 94 | 67 % | 44 % | limited | 3 |
| Exposition liquide / concentrée | 100 | 52 % | 72 % | limited | 0 liquide · 0 concentré |
| Ultra-transformation | 100 | 52 % | 86 % | limited | 1 |
| Couverture nutritionnelle | 66.67 | 67 % | 44 % | limited | 66.67 |
| Énergie | 75 | 67 % | 44 % | limited | 1095 |

#### Petit-déjeuner — d05-breakfast · texte

- Preuve : texte. Origine alimentaire : unknown. Entrée synthétique : Yaourt nature avec quelques flocons et une pomme; quantité de granola non mesurée, pas de photo..
- Résumé détecté : Petit-déjeuner décrit : yaourt nature, quelques flocons/granola (quantité non mesurée) et une pomme, sans photo ni recettes.. Type de plat : petit-déjeuner. Confiance globale : low.
- Totaux : kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g.
- Incertitudes : Estimation à partir de la seule description, sans photo. · Quantités de yaourt et de granola non mesurées ; grammes non estimés. · Type exact des flocons/granola (sucres ajoutés, huiles, NOVA) inconnu. · Taille et variété de la pomme non précisées.. Signaux : portion_unknown/portion/high, portion_unknown/portion/high, composition_uncertain/composition/high, nova_group_unknown/novaGroup/medium, sugar_exposure_unknown/sugarExposure/medium, nutrition_unknown/nutrition/high, preparation_unknown/preparation/low.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Yaourt nature | ingredient; préparation inconnue; preuve inferred/note | inconnue; statut unknown; kcal — | dairy | NOVA 1 (observed) | liquide false; concentré false; sucres —; ajoutés — | minimally_processed, fermented, protein_source | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Flocons / granola | ingredient; préparation inconnue; preuve inferred/note | inconnue; statut unknown; kcal — | whole_grain | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Pomme | ingredient; préparation inconnue; preuve inferred/note | 1 pomme; 1 pièce; statut observed; kcal — | fruit | NOVA 1 (observed) | liquide false; concentré false; sucres —; ajoutés — | whole_food, minimally_processed, fiber_source | low; axes {"portion":"medium","novaGroup":"high","sugarExposure":"medium","qualityProperties":"high"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |

#### Déjeuner — d05-lunch · photo + texte

- Preuve : photo + texte. Origine alimentaire : mixed. Entrée synthétique : Poke acheté: saumon, riz, edamame et crudités; deux photos, sauce à part mais quantité versée inconnue..
- Résumé détecté : Poké bowl acheté avec riz, dés de saumon, edamame et crudités (concombre, carotte, radis, chou rouge, quelques feuilles), graines de sésame, sauce sombre à part dont la quantité réellement versée n’est pas connue.. Type de plat : Poké au saumon. Confiance globale : low.
- Totaux : kcal 450–1010 (prob. 675); P 26–61 (prob. 41) g; G 47–122 (prob. 76) g; L 13–38 (prob. 22) g; fibres 4–13 (prob. 7) g; sucres 3–26 (prob. 10) g; ajoutés 0–14 (prob. 3) g.
- Incertitudes : Grammages non mesurables sans référence d’échelle. · Quantité de sauce réellement versée inconnue. · Recette et sucres ajoutés de la sauce non identifiables. · Type exact de riz (blanc vs légèrement assaisonné) non certain.. Signaux : portion_unknown/portion/high, portion_unknown/portion/high, sauce_or_oil_unknown/sauceOrOil/high, nova_group_unknown/novaGroup/medium, sugar_exposure_unknown/sugarExposure/high, recipe_unknown/recipe/medium, nutrition_unknown/nutrition/medium.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Poké bowl saumon | dish; Bol composé, saumon cru assaisonné, riz cuit, crudités crues, sauce à part; preuve visible/photo | 1 bol; 1 bol; statut observed; kcal — | animal_protein, refined_grain, vegetable, legume | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | medium; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Riz blanc cuit | component; cuit; preuve visible/photo | base du bol; statut observed; kcal 180–340 (prob. 250) | refined_grain | NOVA 1 (observed) | liquide false; concentré false; sucres 0–1 (prob. 0); ajoutés 0–0 (prob. 0) | minimally_processed | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 180–340 (prob. 250); P 3–7 (prob. 5) g; G 38–74 (prob. 54) g; L 0–2 (prob. 1) g; fibres 0–2 (prob. 1) g; sucres 0–1 (prob. 0) g; ajoutés 0–0 (prob. 0) g |
| Saumon cru en dés | component; cru, légèrement assaisonné, graines de sésame; preuve visible/photo | portion centrale du bol; statut observed; kcal 180–340 (prob. 250) | animal_protein | NOVA 1 (observed) | liquide false; concentré false; sucres 0–2 (prob. 0); ajoutés 0–2 (prob. 0) | whole_food, protein_source, unsaturated_fat_source | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"low","qualityProperties":"medium"} | kcal 180–340 (prob. 250); P 18–34 (prob. 25) g; G 0–4 (prob. 1) g; L 10–24 (prob. 16) g; fibres 0–0 (prob. 0) g; sucres 0–2 (prob. 0) g; ajoutés 0–2 (prob. 0) g |
| Edamame | component; cuit, décortiqué; preuve visible/photo | tas sur le côté; statut observed; kcal 50–120 (prob. 80) | legume, plant_protein | NOVA 1 (observed) | liquide false; concentré false; sucres 1–3 (prob. 2); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source, protein_source | medium; axes {"portion":"low","novaGroup":"high","sugarExposure":"medium","qualityProperties":"high"} | kcal 50–120 (prob. 80); P 4–11 (prob. 7) g; G 4–11 (prob. 7) g; L 2–6 (prob. 3) g; fibres 2–5 (prob. 3) g; sucres 1–3 (prob. 2) g; ajoutés 0–0 (prob. 0) g |
| Crudités du bol | component; crues : concombre, carotte râpée, radis, chou rouge, quelques feuilles; preuve visible/photo | garniture du bol; statut observed; kcal 20–55 (prob. 35) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 2–6 (prob. 4); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"low","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 20–55 (prob. 35); P 1–3 (prob. 2) g; G 4–11 (prob. 7) g; L 0–1 (prob. 0) g; fibres 2–5 (prob. 3) g; sucres 2–6 (prob. 4) g; ajoutés 0–0 (prob. 0) g |
| Graines de sésame | ingredient; saupoudrées; preuve visible/photo | pincée; statut observed; kcal 10–35 (prob. 20) | nuts_seeds | NOVA 1 (observed) | liquide false; concentré false; sucres 0–0 (prob. 0); ajoutés 0–0 (prob. 0) | unsaturated_fat_source | low; axes {"portion":"low","novaGroup":"high","sugarExposure":"high","qualityProperties":"medium"} | kcal 10–35 (prob. 20); P 0–2 (prob. 1) g; G 0–2 (prob. 1) g; L 1–3 (prob. 2) g; fibres 0–1 (prob. 0) g; sucres 0–0 (prob. 0) g; ajoutés 0–0 (prob. 0) g |
| Sauce sombre à part | component; sauce liquide type soja/teriyaki, quantité versée inconnue; preuve visible/photo | godet à part; statut observed; kcal 10–120 (prob. 40) | sauce | NOVA inconnu (unknown) | exposition inconnue; sucres 0–14 (prob. 4); ajoutés 0–12 (prob. 3) | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 10–120 (prob. 40); P 0–4 (prob. 1) g; G 1–20 (prob. 6) g; L 0–2 (prob. 0) g; fibres 0–0 (prob. 0) g; sucres 0–14 (prob. 4) g; ajoutés 0–12 (prob. 3) g |

#### Dîner — d05-dinner · photo + texte

- Preuve : photo + texte. Origine alimentaire : homemade. Entrée synthétique : Chili sin carne maison, haricots et maïs; servi dans un bol, huile de cuisson non notée..
- Résumé détecté : Bol de chili sin carne maison : sauce tomate, haricots (rouges et noirs), maïs et morceaux de légumes. Huile de cuisson non visible. Un bol bien rempli, dîner copieux mais sans viande.. Type de plat : Chili sin carne. Confiance globale : medium.
- Totaux : kcal 280–580 (prob. 420); P 14–32 (prob. 22) g; G 35–72 (prob. 52) g; L 6–22 (prob. 12) g; fibres 10–24 (prob. 16) g; sucres 6–20 (prob. 12) g; ajoutés — g.
- Incertitudes : Poids du bol estimé visuellement, sans balance. · Huile de cuisson non notée ni mesurable. · Recette (conserve vs frais, sucre dans la sauce, protéines végétales hachées) non fournie. · Sucres ajoutés non estimables.. Signaux : portion_unknown/portion/medium, sauce_or_oil_unknown/sauceOrOil/high, recipe_unknown/recipe/medium, nova_group_unknown/novaGroup/medium, sugar_exposure_unknown/sugarExposure/medium, nutrition_unknown/nutrition/medium.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Chili sin carne | dish; Mijoté maison, sauce tomate; preuve visible/photo | 1 bol; 400 g; 1 bol; statut observed; kcal 280–580 (prob. 420) | legume, vegetable, plant_protein | NOVA inconnu (unknown) | exposition inconnue; sucres 6–20 (prob. 12); ajoutés — | fiber_source, protein_source, minimally_processed | medium; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"medium"} | kcal 280–580 (prob. 420); P 14–32 (prob. 22) g; G 35–72 (prob. 52) g; L 6–22 (prob. 12) g; fibres 10–24 (prob. 16) g; sucres 6–20 (prob. 12) g; ajoutés — g |
| Haricots | component; Mijotés dans la sauce; preuve visible/photo | inconnue; statut unknown; kcal — | legume, plant_protein | NOVA inconnu (unknown) | liquide false; concentré false; sucres —; ajoutés — | whole_food, fiber_source, protein_source | high; axes {"portion":"low","novaGroup":"low","sugarExposure":"medium","qualityProperties":"high"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Maïs | component; En grains dans le chili; preuve visible/photo | inconnue; statut unknown; kcal — | vegetable | NOVA inconnu (unknown) | liquide false; concentré false; sucres —; ajoutés — | whole_food, fiber_source | high; axes {"portion":"low","novaGroup":"low","sugarExposure":"medium","qualityProperties":"high"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Sauce tomate et légumes | component; Sauce rouge mijotée, tomates et légumes en morceaux; preuve visible/photo | inconnue; statut unknown; kcal — | vegetable, sauce | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | minimally_processed | medium; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"medium"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Huile de cuisson | ingredient; Possible graisse de cuisson non notée; preuve inferred/note | inconnue; statut unknown; kcal — | added_fat | NOVA 2 (observed) | liquide false; concentré false; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"high","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |

### 2026-09-06 — 77.28/100 · limited

Couverture 54 %, confiance 61 %, 3 repas. Total disponible : kcal 825; P 19 g; G 98 g; L 41 g; fibres 6.5 g; sucres 43 g; ajoutés 0 g. Les créneaux absents restent des absences de trace, pas des apports nuls.

| Dimension | Score | Couverture | Confiance | Statut | Observation |
|---|---:|---:|---:|---|---|
| Variété | 77.52 | 75 % | 50 % | limited | 8 aliments · 10 groupes |
| Qualité alimentaire | 70 | 38 % | 84 % | limited | 50% des aliments avec propriétés décrites |
| Sucre ajouté | 100 | 67 % | 56 % | limited | 0 |
| Exposition liquide / concentrée | 100 | 19 % | 100 % | limited | 0 liquide · 0 concentré |
| Ultra-transformation | 57.5 | 38 % | 75 % | limited | 2.5 |
| Couverture nutritionnelle | 66.67 | 67 % | 56 % | limited | 66.67 |
| Énergie | 75 | 67 % | 56 % | limited | 825 |

#### Petit-déjeuner — d06-breakfast · photo

- Preuve : photo. Origine alimentaire : prepared. Entrée synthétique : aucune note; preuve photo uniquement.
- Résumé détecté : Petit-déjeuner composé d’un croissant, d’un pain aux raisins (ou escargot aux raisins) dans une assiette, et d’une tasse de café au lait. Un sachet de viennoiseries est visible en arrière-plan mais n’est pas compté comme consommé.. Type de plat : Viennoiseries et café. Confiance globale : medium.
- Totaux : kcal 500–940 (prob. 680); P 9–25 (prob. 16) g; G 52–104 (prob. 74) g; L 25–55 (prob. 36) g; fibres 2–7 (prob. 3.5) g; sucres 13–42 (prob. 24) g; ajoutés — g.
- Incertitudes : Grammages non mesurables : portions estimées visuellement seulement. · Recette et beurre/sucre des viennoiseries inconnus (boulangerie vs industriel). · Volume et type de lait (et sucre éventuel) dans le café non identifiables. · Sachet de viennoiseries en arrière-plan non compté comme consommé. · Sucres ajoutés non séparables des sucres des raisins.. Signaux : portion_unknown/portion/medium, recipe_unknown/recipe/medium, portion_unknown/portion/medium, sugar_exposure_unknown/sugarExposure/medium, sauce_or_oil_unknown/sauceOrOil/low, portion_unknown/portion/high, brand_unknown/brand/low, nova_group_unknown/novaGroup/medium, nutrition_unknown/nutrition/medium.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Croissant | dish; Viennoiserie feuilletée, aspect doré au four; preuve visible/photo | 1 croissant; 1 pièce; statut observed; kcal 220–360 (prob. 280) | refined_grain, added_fat | NOVA 4 (observed) | exposition inconnue; sucres 3–8 (prob. 5); ajoutés — | aucune observée | medium; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"low","qualityProperties":"medium"} | kcal 220–360 (prob. 280); P 4–8 (prob. 6) g; G 22–40 (prob. 30) g; L 12–22 (prob. 16) g; fibres 1–3 (prob. 1.5) g; sucres 3–8 (prob. 5) g; ajoutés — g |
| Pain aux raisins | dish; Pâte feuilletée enroulée, raisins secs visibles, surface brillante; preuve visible/photo | 1 pièce; 1 pièce; statut observed; kcal 250–420 (prob. 320) | refined_grain, added_fat, fruit, sweet | NOVA 4 (observed) | exposition inconnue; sucres 8–22 (prob. 14); ajoutés — | aucune observée | medium; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"low","qualityProperties":"medium"} | kcal 250–420 (prob. 320); P 4–9 (prob. 6) g; G 28–50 (prob. 38) g; L 12–24 (prob. 16) g; fibres 1–4 (prob. 2) g; sucres 8–22 (prob. 14) g; ajoutés — g |
| Café au lait | dish; Boisson chaude, aspect laiteux dans une tasse; preuve visible/photo | 1 tasse; 1 tasse; statut observed; kcal 30–160 (prob. 80) | beverage, dairy | NOVA inconnu (unknown) | exposition inconnue; sucres 2–12 (prob. 5); ajoutés — | inconnues | low; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 30–160 (prob. 80); P 1–8 (prob. 4) g; G 2–14 (prob. 6) g; L 1–9 (prob. 4) g; fibres 0–0 (prob. 0) g; sucres 2–12 (prob. 5) g; ajoutés — g |

#### Déjeuner — d06-lunch · texte

- Preuve : texte. Origine alimentaire : unknown. Entrée synthétique : Assiette de cantine: pommes de terre, poulet et un peu de légumes; portions difficiles à estimer..
- Résumé détecté : Assiette de cantine composée de pommes de terre, de poulet et d’un peu de légumes, sans quantités ni mode de cuisson précisés.. Type de plat : Assiette de cantine. Confiance globale : low.
- Totaux : kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g.
- Incertitudes : Estimation à partir de la seule description, sans photo. · Portions non chiffrées et décrites comme difficiles à estimer. · Préparation, sauce ou matière grasse de cantine non précisées. · Nature exacte des légumes et du poulet (morceau, panure, peau) inconnue. · Nutrition non estimable de façon responsable sans grammes.. Signaux : portion_unknown/portion/high, preparation_unknown/preparation/high, preparation_unknown/preparation/high, sauce_or_oil_unknown/sauceOrOil/medium, food_identity_unknown/identity/medium, recipe_unknown/recipe/high, nova_group_unknown/novaGroup/medium, sugar_exposure_unknown/sugarExposure/medium, nutrition_unknown/nutrition/high, composition_uncertain/composition/medium.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Assiette de cantine | dish; préparation inconnue; preuve inferred/note | inconnue; statut unknown; kcal — | potato, animal_protein, vegetable | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Pommes de terre | component; préparation inconnue; preuve visible/note | inconnue; statut unknown; kcal — | potato | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Poulet | component; préparation inconnue; preuve visible/note | inconnue; statut unknown; kcal — | animal_protein | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Légumes | component; préparation inconnue; preuve visible/note | inconnue; statut unknown; kcal — | vegetable | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |

#### Collation — d06-snack · photo + texte

- Preuve : photo + texte. Origine alimentaire : homemade. Entrée synthétique : Banane et quelques amandes; poignée non pesée, photo prise après avoir commencé..
- Résumé détecté : Collation visible : une banane déjà entamée (un morceau mordu) et une petite poignée d’amandes entières (environ 8 restant sur la table). Photo prise après le début ; la quantité déjà consommée n’est pas visible.. Type de plat : En-cas banane-amandes. Confiance globale : medium.
- Totaux : kcal 110–200 (prob. 145); P 1–6 (prob. 3) g; G 17–34 (prob. 24) g; L 3–8 (prob. 5) g; fibres 2–6 (prob. 3) g; sucres 12–26 (prob. 19) g; ajoutés 0–0 (prob. 0) g.
- Incertitudes : Photo prise après le début : la part déjà consommée n’apparaît pas. · Poignée d’amandes non pesée ; seules les amandes restantes sont visibles. · Poids exact de la banane restante non mesurable sans référence d’échelle.. Signaux : portion_unknown/portion/medium, portion_unknown/portion/medium, brand_unknown/brand/low.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Banane | ingredient; Crue, pelée en partie, déjà entamée; preuve visible/photo | 1 banane restante (bouchée visible); statut observed; kcal 70–120 (prob. 90) | fruit | NOVA 1 (observed) | liquide false; concentré false; sucres 12–24 (prob. 18); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"medium","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 70–120 (prob. 90); P 0–2 (prob. 1) g; G 16–30 (prob. 22) g; L 0–1 (prob. 0) g; fibres 1–4 (prob. 2) g; sucres 12–24 (prob. 18) g; ajoutés 0–0 (prob. 0) g |
| Amandes | ingredient; Entières, non salées apparentes; preuve visible/photo | environ 8 amandes visibles; 8 pièces; statut observed; kcal 40–80 (prob. 55) | nuts_seeds | NOVA 1 (observed) | liquide false; concentré false; sucres 0–2 (prob. 1); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, protein_source, unsaturated_fat_source, fiber_source | medium; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"high","qualityProperties":"high"} | kcal 40–80 (prob. 55); P 1–4 (prob. 2) g; G 1–4 (prob. 2) g; L 3–7 (prob. 5) g; fibres 1–2 (prob. 1) g; sucres 0–2 (prob. 1) g; ajoutés 0–0 (prob. 0) g |

### 2026-09-07 — 76.52/100 · limited

Couverture 56 %, confiance 54 %, 3 repas. Total disponible : kcal 1135; P 50 g; G 110 g; L 58 g; fibres 8.5 g; sucres 19 g; ajoutés 6 g. Les créneaux absents restent des absences de trace, pas des apports nuls.

| Dimension | Score | Couverture | Confiance | Statut | Observation |
|---|---:|---:|---:|---|---|
| Variété | 82.53 | 75 % | 45 % | limited | 11 aliments · 9 groupes |
| Qualité alimentaire | 76.88 | 27 % | 84 % | limited | 36% des aliments avec propriétés décrites |
| Sucre ajouté | 78.5 | 67 % | 44 % | limited | 6 |
| Exposition liquide / concentrée | 100 | 41 % | 78 % | limited | 0 liquide · 0 concentré |
| Ultra-transformation | 60.71 | 48 % | 81 % | limited | 2.43 |
| Couverture nutritionnelle | 66.67 | 67 % | 44 % | limited | 66.67 |
| Énergie | 75 | 67 % | 44 % | limited | 1135 |

#### Petit-déjeuner — d07-breakfast · photo + texte

- Preuve : photo + texte. Origine alimentaire : homemade. Entrée synthétique : Œufs brouillés, pain et tomates; environ deux œufs, beurre ou huile non certain..
- Résumé détecté : Petit-déjeuner maison : œufs brouillés poivrés, deux tranches de pain et quartiers de tomate crue. Graisse de cuisson (beurre ou huile) possible mais non visible.. Type de plat : Œufs brouillés et pain. Confiance globale : medium.
- Totaux : kcal 295–630 (prob. 440); P 16–30 (prob. 21) g; G 30–61 (prob. 43) g; L 11–36 (prob. 21) g; fibres 2–8 (prob. 3.5) g; sucres 3–14 (prob. 8) g; ajoutés — g.
- Incertitudes : Grammes non mesurables sur la photo. · Type exact et composition du pain inconnus. · Beurre ou huile de cuisson non visible ; quantité inconnue. · Sucres ajoutés du pain non déterminables.. Signaux : portion_unknown/portion/medium, portion_unknown/portion/medium, brand_unknown/brand/medium, nova_group_unknown/novaGroup/medium, sugar_exposure_unknown/sugarExposure/medium, sauce_or_oil_unknown/sauceOrOil/high, preparation_unknown/preparation/medium, nutrition_unknown/nutrition/medium.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Assiette petit-déjeuner | dish; préparation inconnue; preuve visible/photo | 1 assiette; 1 assiette; statut observed; kcal — | egg, refined_grain, vegetable | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | medium; axes {"portion":"high","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Œufs brouillés | component; Brouillés, poivre visible; preuve visible/photo | environ 2 œufs; 2 œufs; statut observed; kcal 140–240 (prob. 180) | egg | NOVA 1 (observed) | liquide false; concentré false; sucres 0–2 (prob. 1); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, protein_source | medium; axes {"portion":"medium","novaGroup":"high","sugarExposure":"medium","qualityProperties":"medium"} | kcal 140–240 (prob. 180); P 11–17 (prob. 13) g; G 1–3 (prob. 2) g; L 10–18 (prob. 13) g; fibres 0–0 (prob. 0) g; sucres 0–2 (prob. 1) g; ajoutés 0–0 (prob. 0) g |
| Pain en tranches | component; préparation inconnue; preuve visible/photo | 2 tranches; 2 tranches; statut observed; kcal 140–260 (prob. 190) | refined_grain | NOVA inconnu (unknown) | exposition inconnue; sucres 1–6 (prob. 3); ajoutés — | inconnues | low; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 140–260 (prob. 190); P 5–11 (prob. 7) g; G 26–50 (prob. 36) g; L 1–7 (prob. 3) g; fibres 1–5 (prob. 2) g; sucres 1–6 (prob. 3) g; ajoutés — g |
| Tomates | component; Crues, en quartiers; preuve visible/photo | plusieurs quartiers; statut observed; kcal 15–40 (prob. 25) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 2–6 (prob. 4); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"medium","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 15–40 (prob. 25); P 0–2 (prob. 1) g; G 3–8 (prob. 5) g; L 0–1 (prob. 0) g; fibres 1–3 (prob. 1.5) g; sucres 2–6 (prob. 4) g; ajoutés 0–0 (prob. 0) g |
| Beurre ou huile de cuisson | ingredient; Possible pour les œufs; preuve inferred/note | inconnue; statut unknown; kcal 0–90 (prob. 45) | added_fat | NOVA 2 (observed) | liquide false; concentré false; sucres 0–0 (prob. 0); ajoutés 0–0 (prob. 0) | inconnues | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"low"} | kcal 0–90 (prob. 45); P 0–0 (prob. 0) g; G 0–0 (prob. 0) g; L 0–10 (prob. 5) g; fibres 0–0 (prob. 0) g; sucres 0–0 (prob. 0) g; ajoutés 0–0 (prob. 0) g |

#### Déjeuner — d07-lunch · photo + texte

- Preuve : photo + texte. Origine alimentaire : prepared. Entrée synthétique : Burger acheté avec frites; j'ai laissé environ la moitié des frites, sauce dans le pain..
- Résumé détecté : Repas du midi : burger au pain brioché avec steak haché, salade et sauce, accompagné de frites. Une bouchée du burger est visible ; d’après la note, environ la moitié des frites n’a pas été mangée. Portions et recettes (huile, sauce) restent très incertaines.. Type de plat : Burger et frites. Confiance globale : low.
- Totaux : kcal 452–1072 (prob. 695); P 19–45 (prob. 29) g; G 44–104 (prob. 67) g; L 20–64 (prob. 37) g; fibres 2–9 (prob. 5) g; sucres 4–23 (prob. 11) g; ajoutés 0–14 (prob. 6) g.
- Incertitudes : Grammages non mesurables sur la photo. · Quantité de frites réellement mangée (moitié laissée) très approximative. · Composition exacte de la sauce et éventuel fromage non confirmés. · Huile d’absorption des frites et taille du steak inconnues. · Sucres ajoutés du pain et de la sauce non identifiables.. Signaux : portion_unknown/portion/high, portion_unknown/portion/medium, sauce_or_oil_unknown/sauceOrOil/high, sauce_or_oil_unknown/sauceOrOil/medium, recipe_unknown/recipe/medium, sugar_exposure_unknown/sugarExposure/medium, nova_group_unknown/novaGroup/low, nutrition_unknown/nutrition/high.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Burger | dish; Pain brioché, steak grillé, salade, sauce dans le pain; preuve visible/photo | 1 burger (entamé); 1 burger; statut observed; kcal — | refined_grain, animal_protein, vegetable, sauce | NOVA 4 (observed) | exposition inconnue; sucres —; ajoutés — | protein_source | medium; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"low","qualityProperties":"medium"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Pain à burger | component; Pain type brioché, légèrement brillant; preuve visible/photo | 1 pain; 1 pain; statut observed; kcal 180–320 (prob. 240) | refined_grain | NOVA 4 (observed) | exposition inconnue; sucres 3–10 (prob. 6); ajoutés 0–8 (prob. 4) | inconnues | medium; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"low","qualityProperties":"low"} | kcal 180–320 (prob. 240); P 6–12 (prob. 8) g; G 30–52 (prob. 40) g; L 3–10 (prob. 6) g; fibres 1–3 (prob. 2) g; sucres 3–10 (prob. 6) g; ajoutés 0–8 (prob. 4) g |
| Steak haché | component; Grillée / saisie, visible dans le burger; preuve visible/photo | 1 galette; 1 galette; statut observed; kcal 150–320 (prob. 220) | animal_protein | NOVA inconnu (unknown) | liquide false; concentré false; sucres 0–1 (prob. 0); ajoutés 0–0 (prob. 0) | protein_source | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"medium","qualityProperties":"medium"} | kcal 150–320 (prob. 220); P 12–26 (prob. 18) g; G 0–3 (prob. 1) g; L 10–24 (prob. 16) g; fibres 0–0 (prob. 0) g; sucres 0–1 (prob. 0) g; ajoutés 0–0 (prob. 0) g |
| Salade iceberg | component; Crue, feuilles dans le burger; preuve visible/photo | inconnue; statut unknown; kcal 2–12 (prob. 5) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 0–2 (prob. 1); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"low","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 2–12 (prob. 5); P 0–1 (prob. 0) g; G 0–2 (prob. 1) g; L 0–0 (prob. 0) g; fibres 0–2 (prob. 1) g; sucres 0–2 (prob. 1) g; ajoutés 0–0 (prob. 0) g |
| Sauce du burger | ingredient; Sauce claire/rosée dans le pain (note); preuve inferred/note | inconnue; statut unknown; kcal 40–140 (prob. 80) | sauce, added_fat | NOVA 4 (observed) | exposition inconnue; sucres 1–8 (prob. 3); ajoutés 0–6 (prob. 2) | inconnues | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"low","qualityProperties":"low"} | kcal 40–140 (prob. 80); P 0–2 (prob. 1) g; G 2–12 (prob. 5) g; L 3–14 (prob. 7) g; fibres 0–0 (prob. 0) g; sucres 1–8 (prob. 3) g; ajoutés 0–6 (prob. 2) g |
| Frites | dish; Frites de pomme de terre, frites à l’huile; preuve visible/photo | environ la moitié d’une barquette (mangée); statut observed; kcal 80–280 (prob. 150) | potato, added_fat | NOVA 4 (observed) | liquide false; concentré false; sucres 0–2 (prob. 1); ajoutés 0–0 (prob. 0) | inconnues | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"low"} | kcal 80–280 (prob. 150); P 1–4 (prob. 2) g; G 12–35 (prob. 20) g; L 4–16 (prob. 8) g; fibres 1–4 (prob. 2) g; sucres 0–2 (prob. 1) g; ajoutés 0–0 (prob. 0) g |

#### Dîner — d07-dinner · texte

- Preuve : texte. Origine alimentaire : unknown. Entrée synthétique : Soupe et deux toasts au fromage, peut-être un fruit ensuite; repas noté de mémoire, sans photo..
- Résumé détecté : Dîner noté de mémoire : une soupe non précisée, deux toasts au fromage, et éventuellement un fruit ensuite. Aucune photo ni recette ; composition, portions en grammes et préparation restent largement inconnues.. Type de plat : soupe et toasts au fromage. Confiance globale : low.
- Totaux : kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g.
- Incertitudes : Estimation à partir de la seule description, sans photo. · Type, recette et quantité de la soupe inconnus. · Pain, fromage, matière grasse et cuisson des toasts non précisés. · Le fruit n'est mentionné que comme possibilité, sans variété ni portion. · Repas noté de mémoire : oubli ou approximation possible.. Signaux : food_identity_unknown/identity/high, portion_unknown/portion/high, recipe_unknown/recipe/high, preparation_unknown/preparation/medium, sauce_or_oil_unknown/sauceOrOil/medium, nova_group_unknown/novaGroup/medium, food_identity_unknown/identity/high, nutrition_unknown/nutrition/high.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Soupe | dish; préparation inconnue; preuve unknown/note | inconnue; statut unknown; kcal — | other | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Toasts au fromage | dish; préparation inconnue; preuve inferred/note | 2 toasts; 2 pièces; statut observed; kcal 180–900 (prob. 420) | refined_grain, dairy | NOVA inconnu (unknown) | exposition inconnue; sucres 1–12 (prob. 4); ajoutés — | inconnues | low; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 180–900 (prob. 420); P 8–36 (prob. 18) g; G 20–80 (prob. 40) g; L 8–48 (prob. 20) g; fibres 1–8 (prob. 3) g; sucres 1–12 (prob. 4) g; ajoutés — g |
| Fruit | ingredient; préparation inconnue; preuve unknown/note | inconnue; statut unknown; kcal — | fruit | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |

### 2026-09-08 — 87.34/100 · limited

Couverture 72 %, confiance 67 %, 3 repas. Total disponible : kcal 1311; P 54 g; G 142 g; L 58 g; fibres 25 g; sucres 32 g; ajoutés 0 g. Les créneaux absents restent des absences de trace, pas des apports nuls.

| Dimension | Score | Couverture | Confiance | Statut | Observation |
|---|---:|---:|---:|---|---|
| Variété | 79.75 | 75 % | 60 % | limited | 9 aliments · 10 groupes |
| Qualité alimentaire | 78.33 | 68 % | 82 % | limited | 90% des aliments avec propriétés décrites |
| Sucre ajouté | 100 | 75 % | 56 % | limited | 0 |
| Exposition liquide / concentrée | 100 | 68 % | 78 % | limited | 0 liquide · 0 concentré |
| Ultra-transformation | 95 | 68 % | 89 % | limited | 1.22 |
| Couverture nutritionnelle | 100 | 75 % | 56 % | limited | 100 |
| Énergie | 59.69 | 75 % | 56 % | limited | 1311 |

#### Déjeuner — d08-lunch · photo

- Preuve : photo. Origine alimentaire : homemade. Entrée synthétique : aucune note; preuve photo uniquement.
- Résumé détecté : Bol maison avec quinoa, pois chiches rôtis aux épices, laitue mélangée nappée d’une sauce claire, tomates et concombre en dés. Déjeuner visuellement complet, sans boisson ni autre plat visible.. Type de plat : Bowl quinoa pois chiches. Confiance globale : medium.
- Totaux : kcal 431–972 (prob. 671); P 14–39 (prob. 26) g; G 54–117 (prob. 81) g; L 14–46 (prob. 27) g; fibres 10–28 (prob. 18) g; sucres 4–19 (prob. 10) g; ajoutés 0–2 (prob. 0) g.
- Incertitudes : Grammages non mesurables sans référence d’échelle. · Huile de rôtissage des pois chiches non quantifiable. · Composition exacte de la sauce (huile, tahini, sucres) inconnue. · NOVA de la sauce et d’éventuels assaisonnements industriels non identifiable.. Signaux : portion_unknown/portion/medium, portion_unknown/portion/medium, sauce_or_oil_unknown/sauceOrOil/medium, recipe_unknown/recipe/high, nova_group_unknown/novaGroup/medium, sugar_exposure_unknown/sugarExposure/medium, nutrition_unknown/nutrition/high.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Bowl quinoa-pois chiches-légumes | dish; Composé, légumes crus, pois chiches rôtis, quinoa cuit; preuve visible/photo | 1 grand bol; 1 bol; statut observed; kcal — | whole_grain, legume, vegetable | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | medium; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Quinoa cuit | component; Cuit, grains clairs et rougeâtres; preuve visible/photo | environ un quart à un tiers du bol; statut observed; kcal 160–290 (prob. 220) | whole_grain | NOVA 1 (observed) | liquide false; concentré false; sucres 0–2 (prob. 1); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"medium","novaGroup":"high","sugarExposure":"medium","qualityProperties":"high"} | kcal 160–290 (prob. 220); P 5–11 (prob. 8) g; G 28–50 (prob. 38) g; L 2–6 (prob. 4) g; fibres 3–7 (prob. 5) g; sucres 0–2 (prob. 1) g; ajoutés 0–0 (prob. 0) g |
| Pois chiches rôtis | component; Rôtis, assaisonnés, surface dorée; preuve visible/photo | gros tas sur un quart du bol; statut observed; kcal 180–360 (prob. 260) | legume, plant_protein | NOVA 1 (observed) | liquide false; concentré false; sucres 1–6 (prob. 3); ajoutés 0–2 (prob. 0) | whole_food, fiber_source, protein_source | medium; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 180–360 (prob. 260); P 8–17 (prob. 12) g; G 20–42 (prob. 30) g; L 6–16 (prob. 10) g; fibres 5–12 (prob. 8) g; sucres 1–6 (prob. 3) g; ajoutés 0–2 (prob. 0) g |
| Salade verte mélangée | component; Crue, feuilles de laitue et feuilles rouges; preuve visible/photo | un quart du bol; statut observed; kcal 8–25 (prob. 15) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 0–2 (prob. 1); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"medium","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 8–25 (prob. 15); P 0–2 (prob. 1) g; G 1–4 (prob. 2) g; L 0–1 (prob. 0) g; fibres 1–3 (prob. 2) g; sucres 0–2 (prob. 1) g; ajoutés 0–0 (prob. 0) g |
| Tomates en morceaux | component; Crues, coupées; preuve visible/photo | tas de dés au centre-bas; statut observed; kcal 15–35 (prob. 22) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 2–6 (prob. 3); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"medium","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 15–35 (prob. 22); P 0–2 (prob. 1) g; G 3–8 (prob. 5) g; L 0–1 (prob. 0) g; fibres 1–2 (prob. 1) g; sucres 2–6 (prob. 3) g; ajoutés 0–0 (prob. 0) g |
| Concombre en dés | component; Cru, coupé en cubes; preuve visible/photo | tas à droite; statut observed; kcal 8–22 (prob. 14) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 1–3 (prob. 2); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"medium","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 8–22 (prob. 14); P 0–1 (prob. 1) g; G 1–5 (prob. 3) g; L 0–0 (prob. 0) g; fibres 0–2 (prob. 1) g; sucres 1–3 (prob. 2) g; ajoutés 0–0 (prob. 0) g |
| Sauce crémeuse sur salade | ingredient; Nappée, aspect tahini ou vinaigrette épaisse; preuve inferred/photo | inconnue; statut unknown; kcal 60–240 (prob. 140) | sauce, added_fat | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 60–240 (prob. 140); P 1–6 (prob. 3) g; G 1–8 (prob. 3) g; L 6–22 (prob. 13) g; fibres 0–2 (prob. 1) g; sucres — g; ajoutés — g |

#### Collation — d08-snack · texte

- Preuve : texte. Origine alimentaire : unknown. Entrée synthétique : Une pomme en marchant; taille moyenne supposée, pas de photo..
- Résumé détecté : Collation en marchant : une pomme, taille moyenne seulement supposée, sans photo ni préparation indiquée.. Type de plat : collation. Confiance globale : low.
- Totaux : kcal 50–130 (prob. 80); P 0–1 (prob. 0) g; G 12–32 (prob. 20) g; L 0–1 (prob. 0) g; fibres 2–5 (prob. 3) g; sucres 10–26 (prob. 16) g; ajoutés 0–0 (prob. 0) g.
- Incertitudes : Estimation à partir de la seule description, sans photo. · Taille moyenne seulement supposée : pas de grammes ni de calibre mesuré. · Variété de pomme et pelure non précisées.. Signaux : portion_unknown/portion/high, nutrition_unknown/nutrition/medium, composition_uncertain/composition/low.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Pomme | dish; préparation inconnue; preuve inferred/note | inconnue; statut unknown; kcal 50–130 (prob. 80) | fruit | NOVA 1 (observed) | liquide false; concentré false; sucres 10–26 (prob. 16); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | low; axes {"portion":"low","novaGroup":"high","sugarExposure":"medium","qualityProperties":"medium"} | kcal 50–130 (prob. 80); P 0–1 (prob. 0) g; G 12–32 (prob. 20) g; L 0–1 (prob. 0) g; fibres 2–5 (prob. 3) g; sucres 10–26 (prob. 16) g; ajoutés 0–0 (prob. 0) g |

#### Dîner — d08-dinner · photo + texte

- Preuve : photo + texte. Origine alimentaire : mixed. Entrée synthétique : Omelette, salade et pain; un peu de fromage peut être mélangé dans l'omelette..
- Résumé détecté : Assiette dînatoire : omelette dorée (herbes visibles, fromage possible selon la note), salade verte avec tomates cerises et concombre, et deux tranches de pain rustique. Vinaigrette et matière grasse de cuisson possibles mais non mesurables.. Type de plat : Omelette salade pain. Confiance globale : medium.
- Totaux : kcal 365–830 (prob. 560); P 19–40 (prob. 28) g; G 26–60 (prob. 41) g; L 18–52 (prob. 31) g; fibres 2–8 (prob. 4) g; sucres 2–10 (prob. 6) g; ajoutés 0–3 (prob. 0) g.
- Incertitudes : Poids exacts non mesurables sur la photo. · Présence et quantité de fromage dans l’omelette incertaines. · Huile ou beurre de cuisson et vinaigrette non quantifiés. · Type exact de pain et recette inconnus.. Signaux : portion_unknown/portion/medium, recipe_unknown/recipe/high, sauce_or_oil_unknown/sauceOrOil/medium, preparation_unknown/preparation/medium, brand_unknown/brand/low, nutrition_unknown/nutrition/medium.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Omelette | dish; Cuite à la poêle, herbes visibles ; fromage éventuellement mélangé; preuve visible/photo | 1 omelette pliée; statut observed; kcal 220–450 (prob. 320) | egg, animal_protein | NOVA 1 (observed) | liquide false; concentré false; sucres 0–2 (prob. 1); ajoutés 0–0 (prob. 0) | protein_source, minimally_processed | medium; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 220–450 (prob. 320); P 14–28 (prob. 20) g; G 1–6 (prob. 3) g; L 16–36 (prob. 24) g; fibres 0–1 (prob. 0) g; sucres 0–2 (prob. 1) g; ajoutés 0–0 (prob. 0) g |
| Fromage dans l'omelette | ingredient; Éventuellement fondu dans l'omelette; preuve inferred/note | inconnue; statut unknown; kcal — | dairy | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Salade verte | dish; Crue, éventuellement assaisonnée; preuve visible/photo | petite portion d’assiette; statut observed; kcal 25–140 (prob. 70) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 1–5 (prob. 3); ajoutés 0–2 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"medium","novaGroup":"high","sugarExposure":"medium","qualityProperties":"medium"} | kcal 25–140 (prob. 70); P 1–3 (prob. 2) g; G 3–10 (prob. 6) g; L 1–12 (prob. 5) g; fibres 1–4 (prob. 2) g; sucres 1–5 (prob. 3) g; ajoutés 0–2 (prob. 0) g |
| Pain rustique | component; Tranché, aspect mie alvéolée; preuve visible/photo | 2 tranches; statut observed; kcal 120–240 (prob. 170) | refined_grain | NOVA 3 (observed) | liquide false; concentré false; sucres 1–3 (prob. 2); ajoutés 0–1 (prob. 0) | aucune observée | medium; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 120–240 (prob. 170); P 4–9 (prob. 6) g; G 22–44 (prob. 32) g; L 1–4 (prob. 2) g; fibres 1–3 (prob. 2) g; sucres 1–3 (prob. 2) g; ajoutés 0–1 (prob. 0) g |

### 2026-09-09 — 77.03/100 · limited

Couverture 65 %, confiance 46 %, 3 repas. Total disponible : kcal 1760; P 75 g; G 241 g; L 58.5 g; fibres 17 g; sucres 34 g; ajoutés 12 g. Les créneaux absents restent des absences de trace, pas des apports nuls.

| Dimension | Score | Couverture | Confiance | Statut | Observation |
|---|---:|---:|---:|---|---|
| Variété | 85.02 | 75 % | 43 % | limited | 13 aliments · 9 groupes |
| Qualité alimentaire | 63.96 | 69 % | 67 % | limited | 92% des aliments avec propriétés décrites |
| Sucre ajouté | 46.67 | 75 % | 33 % | limited | 12 |
| Exposition liquide / concentrée | 90 | 40 % | 72 % | limited | 1 liquide · 1 concentré |
| Ultra-transformation | 90.71 | 40 % | 72 % | limited | 1.43 |
| Couverture nutritionnelle | 100 | 75 % | 33 % | limited | 100 |
| Énergie | 72.28 | 75 % | 33 % | limited | 1760 |

#### Petit-déjeuner — d09-breakfast · texte

- Preuve : texte. Origine alimentaire : unknown. Entrée synthétique : Porridge avec lait, quelques fruits rouges surgelés et une cuillère de miel?; portions approximatives..
- Résumé détecté : Petit-déjeuner décrit comme un porridge au lait, avec quelques fruits rouges surgelés et éventuellement une cuillère de miel. Portions et recette non précises ; aucune photo.. Type de plat : Porridge. Confiance globale : low.
- Totaux : kcal 200–650 (prob. 380); P 8–30 (prob. 15) g; G 35–105 (prob. 60) g; L 4–25 (prob. 10) g; fibres 2–12 (prob. 5) g; sucres 12–55 (prob. 28) g; ajoutés 0–30 (prob. 12) g.
- Incertitudes : Estimation à partir de la seule description, sans photo. · Portions approximatives : aucune masse ni volume fiable pour le porridge, le lait ou les fruits. · Présence et taille de la cuillère de miel incertaines (« miel? »). · Type de lait, type de céréales du porridge et éventuel ajout de matière grasse inconnus.. Signaux : portion_unknown/portion/high, recipe_unknown/recipe/high, preparation_unknown/preparation/medium, portion_unknown/portion/high, portion_unknown/portion/high, portion_unknown/portion/medium, nutrition_unknown/nutrition/high, sugar_exposure_unknown/sugarExposure/medium.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Porridge | dish; Avec lait ; fruits et miel ajoutés selon la description; preuve inferred/note | inconnue; statut unknown; kcal — | whole_grain, dairy | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Lait | ingredient; préparation inconnue; preuve inferred/note | inconnue; statut unknown; kcal — | dairy | NOVA 1 (observed) | liquide false; concentré false; sucres —; ajoutés — | protein_source | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Fruits rouges surgelés | component; Surgelés, ajoutés au porridge; preuve inferred/note | inconnue; statut unknown; kcal — | fruit | NOVA 1 (observed) | liquide false; concentré false; sucres —; ajoutés — | whole_food, minimally_processed, fiber_source | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Miel | ingredient; préparation inconnue; preuve inferred/note | 1 cuillère (mention incertaine); statut observed; kcal — | sweet | NOVA 2 (observed) | liquide false; concentré true; sucres —; ajoutés — | aucune observée | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |

#### Déjeuner — d09-lunch · photo

- Preuve : photo. Origine alimentaire : prepared. Entrée synthétique : aucune note; preuve photo uniquement.
- Résumé détecté : Assortiment de sushis (nigiris saumon, crevette et thon, makis au sésame, avocat et poisson) avec un bol de salade verte et une coupelle de sauce soja. Portions et recettes (riz vinaigré, garnitures, vinaigrette) peu précises sur une seule photo.. Type de plat : Assortiment de sushis. Confiance globale : low.
- Totaux : kcal 420–1065 (prob. 680); P 23–59 (prob. 37) g; G 57–137 (prob. 90) g; L 9.5–45 (prob. 22.5) g; fibres 3–11 (prob. 6) g; sucres — g; ajoutés — g.
- Incertitudes : Nombre exact de makis et grammes non mesurables. · Composition des garnitures (surimi, mayonnaise, sucre du riz) non confirmée. · Quantité de sauce soja réellement consommée inconnue. · Vinaigrette de la salade non identifiée.. Signaux : portion_unknown/portion/high, recipe_unknown/recipe/medium, sauce_or_oil_unknown/sauceOrOil/medium, portion_unknown/portion/medium, nutrition_unknown/nutrition/medium.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Assortiment de sushis | dish; Riz vinaigré, poisson cru, makis roulés; preuve visible/photo | 1 plateau; 1 plateau; statut observed; kcal — | refined_grain, animal_protein | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | medium; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Nigiri au saumon | component; Poisson cru sur riz; preuve visible/photo | 1 pièce; 1 pièce; statut observed; kcal 50–95 (prob. 70) | animal_protein, refined_grain | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | protein_source | medium; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"medium"} | kcal 50–95 (prob. 70); P 4–9 (prob. 6) g; G 6–13 (prob. 9) g; L 1.5–4 (prob. 2.5) g; fibres 0–0 (prob. 0) g; sucres — g; ajoutés — g |
| Nigiri à la crevette | component; Crevette cuite sur riz; preuve visible/photo | 1 pièce; 1 pièce; statut observed; kcal 35–70 (prob. 50) | animal_protein, refined_grain | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | protein_source | medium; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"medium"} | kcal 35–70 (prob. 50); P 3–7 (prob. 5) g; G 6–13 (prob. 9) g; L 0–1 (prob. 0) g; fibres 0–0 (prob. 0) g; sucres — g; ajoutés — g |
| Nigiri au thon | component; Poisson cru sur riz; preuve visible/photo | 1 pièce; 1 pièce; statut observed; kcal 40–80 (prob. 55) | animal_protein, refined_grain | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | protein_source | medium; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"medium"} | kcal 40–80 (prob. 55); P 5–10 (prob. 7) g; G 6–13 (prob. 9) g; L 0–2 (prob. 1) g; fibres 0–0 (prob. 0) g; sucres — g; ajoutés — g |
| Makis assortis | component; Riz, nori, avocat, poisson, sésame; preuve visible/photo | plusieurs pièces; statut observed; kcal 250–600 (prob. 400) | refined_grain, vegetable, animal_protein | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | protein_source, unsaturated_fat_source, fiber_source | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"medium"} | kcal 250–600 (prob. 400); P 10–26 (prob. 16) g; G 35–80 (prob. 55) g; L 6–22 (prob. 12) g; fibres 2–7 (prob. 4) g; sucres — g; ajoutés — g |
| Salade verte | dish; Crue, vinaigrette visible; preuve visible/photo | 1 bol; 1 bol; statut observed; kcal 40–180 (prob. 90) | vegetable, sauce | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | whole_food, minimally_processed, fiber_source | low; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"medium"} | kcal 40–180 (prob. 90); P 1–4 (prob. 2) g; G 3–12 (prob. 6) g; L 2–16 (prob. 7) g; fibres 1–4 (prob. 2) g; sucres — g; ajoutés — g |
| Sauce soja | ingredient; préparation inconnue; preuve visible/photo | 1 coupelle; 1 coupelle; statut observed; kcal 5–40 (prob. 15) | sauce | NOVA 3 (observed) | liquide true; concentré false; sucres 0–3 (prob. 1); ajoutés — | aucune observée | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 5–40 (prob. 15); P 0–3 (prob. 1) g; G 1–6 (prob. 2) g; L 0–0 (prob. 0) g; fibres 0–0 (prob. 0) g; sucres 0–3 (prob. 1) g; ajoutés — g |

#### Dîner — d09-dinner · photo + texte

- Preuve : photo + texte. Origine alimentaire : homemade. Entrée synthétique : Pâtes au pesto, parmesan et tomates; pesto du commerce possible, quantité non mesurée..
- Résumé détecté : Bol de penne nappées de pesto vert, tomates cerises coupées et parmesan râpé. Quantité non mesurée ; pesto éventuellement du commerce. Plat unique du dîner.. Type de plat : Pâtes au pesto. Confiance globale : low.
- Totaux : kcal 495–1000 (prob. 700); P 15–34 (prob. 23) g; G 67–127 (prob. 91) g; L 16–42 (prob. 26) g; fibres 3–10 (prob. 6) g; sucres 3–12 (prob. 6) g; ajoutés — g.
- Incertitudes : Quantité de pâtes et de pesto non mesurée · Pesto du commerce possible : recette, huile et sel inconnus · Sucres ajoutés du pesto non vérifiables · Poids du parmesan râpé imprécis. Signaux : portion_unknown/portion/high, recipe_unknown/recipe/high, sauce_or_oil_unknown/sauceOrOil/high, nova_group_unknown/novaGroup/medium, sugar_exposure_unknown/sugarExposure/medium, nutrition_unknown/nutrition/high.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Pâtes au pesto | dish; Pâtes cuites mélangées au pesto, garnies de tomates et de fromage râpé; preuve visible/photo | 1 bol; 1 bol; statut observed; kcal — | refined_grain, vegetable, dairy, added_fat | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | medium; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Penne | component; Cuites, enrobées de pesto; preuve visible/photo | inconnue; statut unknown; kcal 320–560 (prob. 420) | refined_grain | NOVA 1 (observed) | liquide false; concentré false; sucres 1–4 (prob. 2); ajoutés 0–0 (prob. 0) | minimally_processed | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 320–560 (prob. 420); P 11–20 (prob. 15) g; G 62–110 (prob. 82) g; L 1–4 (prob. 2) g; fibres 2–6 (prob. 4) g; sucres 1–4 (prob. 2) g; ajoutés 0–0 (prob. 0) g |
| Pesto | component; Sauce verte mixée, éventuellement du commerce; preuve visible/photo | inconnue; statut unknown; kcal 140–340 (prob. 220) | added_fat, sauce, nuts_seeds | NOVA inconnu (unknown) | exposition inconnue; sucres 0–3 (prob. 1); ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 140–340 (prob. 220); P 2–7 (prob. 4) g; G 2–8 (prob. 4) g; L 14–34 (prob. 22) g; fibres 0–2 (prob. 1) g; sucres 0–3 (prob. 1) g; ajoutés — g |
| Tomates cerises | component; Crues, coupées en deux; preuve visible/photo | inconnue; statut unknown; kcal 15–40 (prob. 25) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 2–5 (prob. 3); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"low","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 15–40 (prob. 25); P 0–2 (prob. 1) g; G 3–8 (prob. 5) g; L 0–0 (prob. 0) g; fibres 1–2 (prob. 1) g; sucres 2–5 (prob. 3) g; ajoutés 0–0 (prob. 0) g |
| Parmesan râpé | component; Râpé sur le plat; preuve visible/photo | inconnue; statut unknown; kcal 20–60 (prob. 35) | dairy | NOVA 1 (observed) | liquide false; concentré false; sucres 0–0 (prob. 0); ajoutés 0–0 (prob. 0) | protein_source, minimally_processed | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 20–60 (prob. 35); P 2–5 (prob. 3) g; G 0–1 (prob. 0) g; L 1–4 (prob. 2) g; fibres 0–0 (prob. 0) g; sucres 0–0 (prob. 0) g; ajoutés 0–0 (prob. 0) g |

### 2026-09-10 — 75.43/100 · limited

Couverture 61 %, confiance 51 %, 3 repas. Total disponible : kcal 1124; P 41 g; G 122 g; L 49 g; fibres 9 g; sucres 23 g; ajoutés 8 g. Les créneaux absents restent des absences de trace, pas des apports nuls.

| Dimension | Score | Couverture | Confiance | Statut | Observation |
|---|---:|---:|---:|---|---|
| Variété | 75.92 | 75 % | 46 % | limited | 8 aliments · 8 groupes |
| Qualité alimentaire | 57.78 | 38 % | 67 % | limited | 50% des aliments avec propriétés décrites |
| Sucre ajouté | 63.26 | 75 % | 44 % | limited | 8 |
| Exposition liquide / concentrée | 100 | 47 % | 67 % | limited | 0 liquide · 0 concentré |
| Ultra-transformation | 80.27 | 38 % | 67 % | limited | 1.7 |
| Couverture nutritionnelle | 100 | 75 % | 44 % | limited | 100 |
| Énergie | 54.01 | 75 % | 44 % | limited | 1124 |

#### Petit-déjeuner — d10-breakfast · photo + texte

- Preuve : photo + texte. Origine alimentaire : prepared. Entrée synthétique : Café et croissant pris à la boulangerie; taille classique, je n'ai pas fini les dernières bouchées..
- Résumé détecté : Petit-déjeuner boulangerie : croissant au beurre partiellement consommé (miettes et dernières bouchées non finies) et tasse de café noir, sans lait ni sucre visibles.. Type de plat : Croissant et café. Confiance globale : medium.
- Totaux : kcal 170–310 (prob. 234); P 3–8 (prob. 5) g; G 20–37 (prob. 26) g; L 8–18 (prob. 12) g; fibres 0–2 (prob. 1) g; sucres 3–8 (prob. 5) g; ajoutés 1–6 (prob. 3) g.
- Incertitudes : Poids exact du croissant non mesuré ; dernière bouchées non finies. · Recette et marque de boulangerie inconnues (beurre, sucre ajouté). · Volume exact du café et éventuel sucre/lait non visibles dans la tasse.. Signaux : portion_unknown/portion/medium, recipe_unknown/recipe/medium, portion_unknown/portion/low, brand_unknown/brand/low.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Croissant au beurre | dish; Viennoiserie feuilletée, cuite au four; preuve visible/photo | 1 croissant classique, presque terminé; 55 g; 1 pièce; statut observed; kcal 170–300 (prob. 230) | refined_grain, added_fat | NOVA 4 (observed) | liquide false; concentré false; sucres 3–8 (prob. 5); ajoutés 1–6 (prob. 3) | aucune observée | medium; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 170–300 (prob. 230); P 3–7 (prob. 5) g; G 20–35 (prob. 26) g; L 8–18 (prob. 12) g; fibres 0–2 (prob. 1) g; sucres 3–8 (prob. 5) g; ajoutés 1–6 (prob. 3) g |
| Café noir | dish; Infusé, sans lait ni sucre visibles; preuve visible/photo | 1 tasse; 180 g; 1 tasse; statut observed; kcal 0–10 (prob. 4) | beverage | NOVA 1 (observed) | liquide false; concentré false; sucres 0–0 (prob. 0); ajoutés 0–0 (prob. 0) | minimally_processed | medium; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 0–10 (prob. 4); P 0–1 (prob. 0) g; G 0–2 (prob. 0) g; L 0–0 (prob. 0) g; fibres 0–0 (prob. 0) g; sucres 0–0 (prob. 0) g; ajoutés 0–0 (prob. 0) g |

#### Collation — d10-snack · texte

- Preuve : texte. Origine alimentaire : unknown. Entrée synthétique : Deux carrés de chocolat et une poignée de noix; poignée vraiment approximative, pas de photo..
- Résumé détecté : Collation : deux carrés de chocolat et une poignée de noix, sans photo ni précision de type (chocolat noir/lait, noix nature ou salées).. Type de plat : collation. Confiance globale : low.
- Totaux : kcal 120–440 (prob. 240); P 3–14 (prob. 6) g; G 6–30 (prob. 14) g; L 9–38 (prob. 19) g; fibres 1–8 (prob. 3) g; sucres 2–20 (prob. 8) g; ajoutés — g.
- Incertitudes : Estimation à partir de la seule description, sans photo. · Type de chocolat (noir, au lait, fourré) et taille réelle des carrés inconnus. · Poignée de noix très approximative : variété, nature/salées/grillées et huile éventuelle inconnues. · Sucres ajoutés du chocolat non estimables de façon responsable.. Signaux : portion_unknown/portion/high, portion_unknown/portion/high, food_identity_unknown/identity/medium, preparation_unknown/preparation/medium, nova_group_unknown/novaGroup/medium, nova_group_unknown/novaGroup/medium, sugar_exposure_unknown/sugarExposure/high, nutrition_unknown/nutrition/high.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Chocolat | ingredient; préparation inconnue; preuve inferred/note | 2 carrés; statut observed; kcal 40–160 (prob. 80) | sweet | NOVA inconnu (unknown) | exposition inconnue; sucres 2–16 (prob. 7); ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 40–160 (prob. 80); P 0–4 (prob. 1) g; G 4–20 (prob. 9) g; L 2–12 (prob. 5) g; fibres 0–3 (prob. 1) g; sucres 2–16 (prob. 7) g; ajoutés — g |
| Noix | ingredient; préparation inconnue; preuve inferred/note | une poignée; statut observed; kcal 80–280 (prob. 160) | nuts_seeds | NOVA inconnu (unknown) | exposition inconnue; sucres 0–4 (prob. 1); ajoutés 0–2 (prob. 0) | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 80–280 (prob. 160); P 3–10 (prob. 5) g; G 2–10 (prob. 5) g; L 7–26 (prob. 14) g; fibres 1–5 (prob. 2) g; sucres 0–4 (prob. 1) g; ajoutés 0–2 (prob. 0) g |

#### Dîner — d10-dinner · photo

- Preuve : photo. Origine alimentaire : homemade. Entrée synthétique : aucune note; preuve photo uniquement.
- Résumé détecté : Barquette de riz sauté aux légumes (brocoli, carotte, chou) avec morceaux de protéine et sauce brune brillante, type plat asiatique à emporter. Photo unique, portions et nature exacte de la protéine peu nettes.. Type de plat : Riz sauté aux légumes. Confiance globale : low.
- Totaux : kcal 450–900 (prob. 650); P 18–48 (prob. 30) g; G 50–125 (prob. 82) g; L 8–40 (prob. 18) g; fibres 2–11 (prob. 5) g; sucres 4–24 (prob. 10) g; ajoutés 1–13 (prob. 5) g.
- Incertitudes : Grammages non mesurables (barquette sans référence fiable). · Identité de la protéine incertaine (poulet, tofu ou autre). · Composition et sucres de la sauce inconnus. · Huile de cuisson non quantifiable. · NOVA et transformation de la sauce/protéine non identifiables.. Signaux : portion_unknown/portion/high, food_identity_unknown/identity/high, sauce_or_oil_unknown/sauceOrOil/high, recipe_unknown/recipe/medium, nova_group_unknown/novaGroup/medium, sugar_exposure_unknown/sugarExposure/medium, nutrition_unknown/nutrition/medium.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Riz sauté aux légumes | dish; Sauté, sauce brune; preuve visible/photo | 1 barquette; 1 barquette; statut observed; kcal — | refined_grain, vegetable, animal_protein, sauce | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | medium; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Riz cuit | component; Mélangé, sauté; preuve visible/photo | inconnue; statut unknown; kcal 180–400 (prob. 280) | refined_grain | NOVA 1 (observed) | liquide false; concentré false; sucres 0–1 (prob. 0); ajoutés 0–0 (prob. 0) | minimally_processed | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 180–400 (prob. 280); P 4–9 (prob. 6) g; G 38–82 (prob. 58) g; L 1–10 (prob. 4) g; fibres 0–3 (prob. 1) g; sucres 0–1 (prob. 0) g; ajoutés 0–0 (prob. 0) g |
| Légumes sautés | component; Sautés (brocoli, carotte, chou); preuve visible/photo | inconnue; statut unknown; kcal 40–120 (prob. 70) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 2–8 (prob. 4); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 40–120 (prob. 70); P 2–7 (prob. 4) g; G 6–20 (prob. 12) g; L 0–6 (prob. 2) g; fibres 2–7 (prob. 4) g; sucres 2–8 (prob. 4) g; ajoutés 0–0 (prob. 0) g |
| Morceaux de protéine | component; Sautés en dés; preuve inferred/photo | inconnue; statut unknown; kcal 80–250 (prob. 150) | animal_protein | NOVA inconnu (unknown) | liquide false; concentré false; sucres 0–2 (prob. 0); ajoutés 0–1 (prob. 0) | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"medium","qualityProperties":"low"} | kcal 80–250 (prob. 150); P 10–30 (prob. 18) g; G 0–8 (prob. 2) g; L 3–15 (prob. 7) g; fibres 0–1 (prob. 0) g; sucres 0–2 (prob. 0) g; ajoutés 0–1 (prob. 0) g |
| Sauce brune | ingredient; Nappage brillant, type sauce soja/sucrée; preuve inferred/photo | inconnue; statut unknown; kcal 40–180 (prob. 90) | sauce | NOVA inconnu (unknown) | exposition inconnue; sucres 2–14 (prob. 6); ajoutés 1–12 (prob. 5) | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 40–180 (prob. 90); P 1–5 (prob. 2) g; G 4–22 (prob. 10) g; L 2–12 (prob. 5) g; fibres 0–1 (prob. 0) g; sucres 2–14 (prob. 6) g; ajoutés 1–12 (prob. 5) g |

### 2026-09-11 — 77.58/100 · limited

Couverture 79 %, confiance 46 %, 4 repas. Total disponible : kcal 1560; P 67 g; G 174 g; L 61 g; fibres 12 g; sucres 39 g; ajoutés 6 g. Les créneaux absents restent des absences de trace, pas des apports nuls.

| Dimension | Score | Couverture | Confiance | Statut | Observation |
|---|---:|---:|---:|---|---|
| Variété | 86.14 | 100 % | 36 % | limited | 12 aliments · 10 groupes |
| Qualité alimentaire | 70.71 | 58 % | 62 % | limited | 58% des aliments avec propriétés décrites |
| Sucre ajouté | 78.5 | 75 % | 33 % | limited | 6 |
| Exposition liquide / concentrée | 96.5 | 83 % | 70 % | limited | 0 liquide · 1 concentré |
| Ultra-transformation | 64.55 | 92 % | 61 % | limited | 2.36 |
| Couverture nutritionnelle | 75 | 75 % | 33 % | limited | 75 |
| Énergie | 66.83 | 75 % | 33 % | limited | 1560 |

#### Petit-déjeuner — d11-breakfast · photo + texte

- Preuve : photo + texte. Origine alimentaire : homemade. Entrée synthétique : Fromage blanc, banane et un peu de granola; le bol est partiellement hors cadre..
- Résumé détecté : Petit-déjeuner dans un bol : fromage blanc, rondelles de banane et granola (flocons et grappes). Le bol est partiellement hors cadre, donc les portions et les macros restent approximatives.. Type de plat : Bol fromage blanc. Confiance globale : low.
- Totaux : kcal 200–550 (prob. 350); P 9–30 (prob. 18) g; G 26–74 (prob. 46) g; L 2–23 (prob. 9) g; fibres 2–8 (prob. 4) g; sucres 14–42 (prob. 25) g; ajoutés 1–10 (prob. 4) g.
- Incertitudes : Bol partiellement hors cadre : volume total du fromage blanc et du granola non mesurable. · Type de fromage blanc (0 %, 20 %, 40 %) non identifiable. · Recette du granola (sucres ajoutés, huile, fruits secs) non connue. · Grammes non estimables de façon responsable.. Signaux : portion_unknown/portion/high, portion_unknown/portion/high, recipe_unknown/recipe/medium, composition_uncertain/composition/medium, nutrition_unknown/nutrition/high.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Bol fromage blanc banane granola | dish; Assemblé froid, non cuit; preuve visible/photo | 1 bol (partiellement hors cadre); statut observed; kcal — | dairy, fruit, refined_grain | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Fromage blanc | component; Nature, non cuit; preuve visible/photo | inconnue; statut unknown; kcal 80–220 (prob. 140) | dairy | NOVA 1 (observed) | liquide false; concentré false; sucres 4–14 (prob. 8); ajoutés 0–2 (prob. 0) | minimally_processed, protein_source | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 80–220 (prob. 140); P 8–22 (prob. 14) g; G 4–14 (prob. 8) g; L 0–12 (prob. 4) g; fibres 0–0 (prob. 0) g; sucres 4–14 (prob. 8) g; ajoutés 0–2 (prob. 0) g |
| Banane | component; Crue, en rondelles; preuve visible/photo | plusieurs rondelles; statut observed; kcal 60–130 (prob. 90) | fruit | NOVA 1 (observed) | liquide false; concentré false; sucres 8–18 (prob. 12); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"low","novaGroup":"high","sugarExposure":"medium","qualityProperties":"high"} | kcal 60–130 (prob. 90); P 0–2 (prob. 1) g; G 14–32 (prob. 22) g; L 0–1 (prob. 0) g; fibres 1–4 (prob. 2) g; sucres 8–18 (prob. 12) g; ajoutés 0–0 (prob. 0) g |
| Granola | component; Grappes de céréales, aspect grillé; preuve visible/photo | une poignée visible; statut observed; kcal 60–200 (prob. 120) | refined_grain, nuts_seeds, sweet | NOVA 3 (observed) | liquide false; concentré true; sucres 2–10 (prob. 5); ajoutés 1–8 (prob. 4) | fiber_source, unsaturated_fat_source | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 60–200 (prob. 120); P 1–6 (prob. 3) g; G 8–28 (prob. 16) g; L 2–10 (prob. 5) g; fibres 1–4 (prob. 2) g; sucres 2–10 (prob. 5) g; ajoutés 1–8 (prob. 4) g |

#### Déjeuner — d11-lunch · texte

- Preuve : texte. Origine alimentaire : unknown. Entrée synthétique : Restes de riz et légumes avec un œuf; quantité de riz peut-être une tasse, repas sans photo..
- Résumé détecté : Repas de restes : riz, légumes et un œuf. La quantité de riz est indiquée comme « peut-être une tasse » ; les légumes, la cuisson, l’huile et les assaisonnements ne sont pas précisés.. Type de plat : Restes riz, légumes et œuf. Confiance globale : low.
- Totaux : kcal 230–750 (prob. 390); P 9–27 (prob. 14) g; G 34–112 (prob. 61) g; L 4–37 (prob. 10) g; fibres 1–12 (prob. 4) g; sucres 1–15 (prob. 4) g; ajoutés 0–0 (prob. 0) g.
- Incertitudes : Estimation à partir de la seule description, sans photo. · Quantité de riz seulement approximative (« peut-être une tasse »), sans grammes fiables. · Types de légumes, huile, sauce et mode de cuisson inconnus. · Riz blanc ou complet non précisé.. Signaux : portion_unknown/portion/high, portion_unknown/portion/high, sauce_or_oil_unknown/sauceOrOil/high, preparation_unknown/preparation/medium, recipe_unknown/recipe/medium, nutrition_unknown/nutrition/high, nova_group_unknown/novaGroup/low.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Restes de riz et légumes avec un œuf | dish; Restes, préparation non précisée; preuve inferred/note | inconnue; statut unknown; kcal — | refined_grain, vegetable, egg | NOVA inconnu (unknown) | liquide false; concentré false; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"medium","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Riz | component; Restes, cuisson et type de riz non précisés; preuve inferred/note | peut-être une tasse; 1 tasse; statut observed; kcal 150–450 (prob. 250) | refined_grain | NOVA 1 (observed) | liquide false; concentré false; sucres 0–2 (prob. 0); ajoutés 0–0 (prob. 0) | minimally_processed | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"medium","qualityProperties":"low"} | kcal 150–450 (prob. 250); P 3–10 (prob. 5) g; G 30–85 (prob. 50) g; L 0–12 (prob. 2) g; fibres 0–4 (prob. 1) g; sucres 0–2 (prob. 0) g; ajoutés 0–0 (prob. 0) g |
| Légumes | component; Restes, types et cuisson non précisés; preuve inferred/note | inconnue; statut unknown; kcal 20–180 (prob. 60) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 1–12 (prob. 4); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"medium","qualityProperties":"low"} | kcal 20–180 (prob. 60); P 1–8 (prob. 2) g; G 4–25 (prob. 10) g; L 0–15 (prob. 2) g; fibres 1–8 (prob. 3) g; sucres 1–12 (prob. 4) g; ajoutés 0–0 (prob. 0) g |
| Œuf | component; Non précisée (cuit avec les restes); preuve inferred/note | 1 œuf; 1 œuf; statut observed; kcal 60–120 (prob. 80) | egg | NOVA 1 (observed) | liquide false; concentré false; sucres 0–1 (prob. 0); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, protein_source | low; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"high","qualityProperties":"medium"} | kcal 60–120 (prob. 80); P 5–9 (prob. 7) g; G 0–2 (prob. 1) g; L 4–10 (prob. 6) g; fibres 0–0 (prob. 0) g; sucres 0–1 (prob. 0) g; ajoutés 0–0 (prob. 0) g |

#### Collation — d11-snack · photo

- Preuve : photo. Origine alimentaire : prepared. Entrée synthétique : aucune note; preuve photo uniquement.
- Résumé détecté : Sachet ouvert de chips triangulaires type tortilla/nachos, assaisonnées, encore dans l’emballage. Quantité consommée et marque non déterminables ; collations visibles uniquement.. Type de plat : Chips de maïs. Confiance globale : low.
- Totaux : kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g.
- Incertitudes : Portion consommée inconnue (reste dans le sachet, pas d’assiette ni d’échelle). · Marque et recette d’assaisonnement non lisibles. · Huile, sel et sucres ajoutés non quantifiables. · Calories et macros non estimables de façon responsable.. Signaux : portion_unknown/portion/high, brand_unknown/brand/medium, recipe_unknown/recipe/medium, sauce_or_oil_unknown/sauceOrOil/medium, sugar_exposure_unknown/sugarExposure/medium, nutrition_unknown/nutrition/high, quality_properties_unknown/qualityProperties/low.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Chips de maïs (tortilla) | dish; Frites, assaisonnées; preuve visible/photo | inconnue; statut unknown; kcal — | refined_grain, added_fat | NOVA 4 (observed) | exposition inconnue; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |

#### Dîner — d11-dinner · photo + texte

- Preuve : photo + texte. Origine alimentaire : prepared. Entrée synthétique : Deux parts de pizza livrée; une photo de la boîte et une de l'assiette, garniture et huile difficiles à distinguer..
- Résumé détecté : Deux parts de pizza livrée (même repas, assiette et boîte). Pâte cuite au four, fromage fondu, sauce tomate ; garniture de type charcuterie/viande et éventuellement champignons, huile et détails de recette peu lisibles.. Type de plat : Pizza livrée. Confiance globale : low.
- Totaux : kcal 520–1250 (prob. 820); P 20–54 (prob. 35) g; G 46–97 (prob. 67) g; L 22–76 (prob. 42) g; fibres 2–8 (prob. 4) g; sucres 4–20 (prob. 10) g; ajoutés 0–9 (prob. 2) g.
- Incertitudes : Garniture (viande, pepperoni, champignons) difficile à identifier de façon certaine. · Quantité d’huile ou de graisse non mesurable. · Poids des parts et recette (sucre dans la sauce, type de fromage) inconnus. · Les deux photos montrent les mêmes parts sous des angles différents.. Signaux : composition_uncertain/composition/high, sauce_or_oil_unknown/sauceOrOil/high, portion_unknown/portion/medium, recipe_unknown/recipe/medium, nova_group_unknown/novaGroup/low, nutrition_unknown/nutrition/medium.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Pizza livrée (2 parts) | dish; Cuite au four, livrée; preuve visible/photo | 2 parts; 2 parts; statut observed; kcal — | refined_grain, dairy, animal_protein | NOVA 4 (observed) | exposition inconnue; sucres —; ajoutés — | inconnues | medium; axes {"portion":"high","novaGroup":"medium","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Pâte à pizza | component; Cuite, croûte dorée; preuve visible/photo | inconnue; statut unknown; kcal 280–500 (prob. 380) | refined_grain | NOVA 4 (observed) | liquide false; concentré false; sucres 2–8 (prob. 4); ajoutés 0–4 (prob. 1) | inconnues | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"low"} | kcal 280–500 (prob. 380); P 8–18 (prob. 12) g; G 40–75 (prob. 55) g; L 6–16 (prob. 10) g; fibres 2–5 (prob. 3) g; sucres 2–8 (prob. 4) g; ajoutés 0–4 (prob. 1) g |
| Fromage fondu | component; Fondu à la cuisson; preuve visible/photo | inconnue; statut unknown; kcal 140–320 (prob. 220) | dairy | NOVA 3 (observed) | liquide false; concentré false; sucres 0–2 (prob. 1); ajoutés 0–0 (prob. 0) | protein_source | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 140–320 (prob. 220); P 8–20 (prob. 14) g; G 1–4 (prob. 2) g; L 10–24 (prob. 16) g; fibres 0–0 (prob. 0) g; sucres 0–2 (prob. 1) g; ajoutés 0–0 (prob. 0) g |
| Sauce tomate | component; préparation inconnue; preuve visible/photo | inconnue; statut unknown; kcal 20–70 (prob. 40) | vegetable, sauce | NOVA 3 (observed) | exposition inconnue; sucres 2–8 (prob. 4); ajoutés 0–4 (prob. 1) | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 20–70 (prob. 40); P 0–2 (prob. 1) g; G 4–12 (prob. 7) g; L 0–3 (prob. 1) g; fibres 0–2 (prob. 1) g; sucres 2–8 (prob. 4) g; ajoutés 0–4 (prob. 1) g |
| Garniture (charcuterie/viande, éventuellement champignons) | component; Cuite sur la pizza; preuve inferred/photo | inconnue; statut unknown; kcal 80–240 (prob. 140) | animal_protein | NOVA 4 (observed) | liquide false; concentré false; sucres 0–2 (prob. 1); ajoutés 0–1 (prob. 0) | inconnues | low; axes {"portion":"low","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"low"} | kcal 80–240 (prob. 140); P 4–14 (prob. 8) g; G 1–6 (prob. 3) g; L 6–20 (prob. 11) g; fibres 0–1 (prob. 0) g; sucres 0–2 (prob. 1) g; ajoutés 0–1 (prob. 0) g |
| Huile ou graisse de surface | ingredient; préparation inconnue; preuve unknown/note | inconnue; statut unknown; kcal 0–120 (prob. 40) | added_fat | NOVA inconnu (unknown) | liquide false; concentré false; sucres 0–0 (prob. 0); ajoutés 0–0 (prob. 0) | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"medium","qualityProperties":"low"} | kcal 0–120 (prob. 40); P 0–0 (prob. 0) g; G 0–0 (prob. 0) g; L 0–13 (prob. 4) g; fibres 0–0 (prob. 0) g; sucres 0–0 (prob. 0) g; ajoutés 0–0 (prob. 0) g |

### 2026-09-12 — 86.37/100 · limited

Couverture 61 %, confiance 59 %, 3 repas. Total disponible : kcal 980; P 39 g; G 108 g; L 44 g; fibres 19 g; sucres 20 g; ajoutés 0 g. Les créneaux absents restent des absences de trace, pas des apports nuls.

| Dimension | Score | Couverture | Confiance | Statut | Observation |
|---|---:|---:|---:|---|---|
| Variété | 84.58 | 75 % | 56 % | limited | 12 aliments · 10 groupes |
| Qualité alimentaire | 79.06 | 50 % | 79 % | limited | 67% des aliments avec propriétés décrites |
| Sucre ajouté | 100 | 67 % | 44 % | limited | 0 |
| Exposition liquide / concentrée | 100 | 50 % | 83 % | limited | 0 liquide · 0 concentré |
| Ultra-transformation | 97.5 | 50 % | 88 % | limited | 1.13 |
| Couverture nutritionnelle | 66.67 | 67 % | 44 % | limited | 66.67 |
| Énergie | 75 | 67 % | 44 % | limited | 980 |

#### Petit-déjeuner — d12-breakfast · texte

- Preuve : texte. Origine alimentaire : unknown. Entrée synthétique : Yaourt, une pomme et un peu de granola; cuillère non mesurée, pas de photo..
- Résumé détecté : Petit-déjeuner décrit sans photo : yaourt (quantité non précisée), une pomme et un peu de granola (cuillère non mesurée). Trois aliments distincts, sans recette ni marque.. Type de plat : petit-déjeuner. Confiance globale : low.
- Totaux : kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g.
- Incertitudes : Estimation à partir de la seule description, sans photo. · Quantité de yaourt non indiquée. · Granola : « un peu », cuillère non mesurée, composition et marque inconnues. · Type de yaourt (nature, sucré, végétal) non précisé. · Pas de grammes mesurés ; nutrition globale non estimable de façon responsable.. Signaux : portion_unknown/portion/high, nova_group_unknown/novaGroup/medium, sugar_exposure_unknown/sugarExposure/medium, nutrition_unknown/nutrition/high, portion_unknown/portion/high, recipe_unknown/recipe/high, brand_unknown/brand/medium, nova_group_unknown/novaGroup/medium, sugar_exposure_unknown/sugarExposure/medium, nutrition_unknown/nutrition/high.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Yaourt | ingredient; préparation inconnue; preuve inferred/note | inconnue; statut unknown; kcal — | dairy | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Pomme | ingredient; préparation inconnue; preuve inferred/note | une pomme; 1 pièce; statut observed; kcal 50–130 (prob. 80) | fruit | NOVA 1 (observed) | liquide false; concentré false; sucres 10–25 (prob. 16); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | low; axes {"portion":"medium","novaGroup":"high","sugarExposure":"medium","qualityProperties":"medium"} | kcal 50–130 (prob. 80); P 0–1 (prob. 0) g; G 12–30 (prob. 20) g; L 0–1 (prob. 0) g; fibres 2–5 (prob. 3) g; sucres 10–25 (prob. 16) g; ajoutés 0–0 (prob. 0) g |
| Granola | ingredient; préparation inconnue; preuve inferred/note | inconnue; statut unknown; kcal — | refined_grain, sweet | NOVA inconnu (unknown) | exposition inconnue; sucres —; ajoutés — | inconnues | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |

#### Déjeuner — d12-lunch · photo + texte

- Preuve : photo + texte. Origine alimentaire : homemade. Entrée synthétique : Salade de pois chiches, concombre, tomate et pain; huile/citron probablement, proportions floues..
- Résumé détecté : Salade maison de pois chiches, tomates et concombre aux herbes, avec une tranche de pain grillé. Une huile (et probablement du citron) est visible en brillance ; les proportions restent floues.. Type de plat : Salade de pois chiches. Confiance globale : medium.
- Totaux : kcal 279–630 (prob. 425); P 9–23 (prob. 15) g; G 35–82 (prob. 55) g; L 11–27 (prob. 17) g; fibres 7–18 (prob. 12) g; sucres 6–18 (prob. 11) g; ajoutés 0–0 (prob. 0) g.
- Incertitudes : Quantités de pois chiches, légumes et huile non mesurables précisément. · Type exact de pain et éventuel sucre ajouté inconnus. · Présence de citron et composition exacte de l’assaisonnement non confirmées visuellement.. Signaux : portion_unknown/portion/medium, sauce_or_oil_unknown/sauceOrOil/high, nova_group_unknown/novaGroup/medium, sugar_exposure_unknown/sugarExposure/low, recipe_unknown/recipe/medium.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Salade de pois chiches | dish; Crue, assaisonnée d’huile; preuve visible/photo | 1 bol; 1 bol; statut observed; kcal — | legume, vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres —; ajoutés — | whole_food, minimally_processed, fiber_source, protein_source | medium; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal —; P — g; G — g; L — g; fibres — g; sucres — g; ajoutés — g |
| Pois chiches | component; Cuits, en salade; preuve visible/photo | inconnue; statut unknown; kcal 110–230 (prob. 165) | legume, plant_protein | NOVA 1 (observed) | liquide false; concentré false; sucres 2–6 (prob. 4); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source, protein_source | medium; axes {"portion":"low","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 110–230 (prob. 165); P 6–13 (prob. 9) g; G 18–38 (prob. 27) g; L 2–4 (prob. 3) g; fibres 5–11 (prob. 8) g; sucres 2–6 (prob. 4) g; ajoutés 0–0 (prob. 0) g |
| Tomate | component; Crue, en dés; preuve visible/photo | inconnue; statut unknown; kcal 12–32 (prob. 20) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 2–5 (prob. 3); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"low","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 12–32 (prob. 20); P 0–2 (prob. 1) g; G 2–7 (prob. 4) g; L 0–0 (prob. 0) g; fibres 1–2 (prob. 1) g; sucres 2–5 (prob. 3) g; ajoutés 0–0 (prob. 0) g |
| Concombre | component; Cru, en dés; preuve visible/photo | inconnue; statut unknown; kcal 6–20 (prob. 12) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 1–3 (prob. 2); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed | medium; axes {"portion":"low","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 6–20 (prob. 12); P 0–1 (prob. 1) g; G 1–4 (prob. 2) g; L 0–0 (prob. 0) g; fibres 0–1 (prob. 1) g; sucres 1–3 (prob. 2) g; ajoutés 0–0 (prob. 0) g |
| Herbes fraîches | ingredient; Ciselées; preuve visible/photo | inconnue; statut unknown; kcal 1–8 (prob. 3) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 0–0 (prob. 0); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed | medium; axes {"portion":"low","novaGroup":"high","sugarExposure":"high","qualityProperties":"medium"} | kcal 1–8 (prob. 3); P 0–1 (prob. 0) g; G 0–1 (prob. 0) g; L 0–0 (prob. 0) g; fibres 0–1 (prob. 0) g; sucres 0–0 (prob. 0) g; ajoutés 0–0 (prob. 0) g |
| Assaisonnement huile et citron | ingredient; Huile visible ; citron probable selon la note; preuve inferred/note | inconnue; statut unknown; kcal 70–180 (prob. 110) | added_fat, sauce | NOVA 2 (observed) | liquide false; concentré false; sucres 0–1 (prob. 0); ajoutés 0–0 (prob. 0) | unsaturated_fat_source | low; axes {"portion":"low","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 70–180 (prob. 110); P 0–0 (prob. 0) g; G 0–2 (prob. 1) g; L 8–20 (prob. 12) g; fibres 0–0 (prob. 0) g; sucres 0–1 (prob. 0) g; ajoutés 0–0 (prob. 0) g |
| Pain | component; Tranche grillée; preuve visible/photo | 1 tranche; 1 tranche; statut observed; kcal 80–160 (prob. 115) | refined_grain | NOVA inconnu (unknown) | exposition inconnue; sucres 1–3 (prob. 2); ajoutés — | inconnues | medium; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 80–160 (prob. 115); P 3–6 (prob. 4) g; G 14–30 (prob. 21) g; L 1–3 (prob. 2) g; fibres 1–3 (prob. 2) g; sucres 1–3 (prob. 2) g; ajoutés — g |

#### Dîner — d12-dinner · photo

- Preuve : photo. Origine alimentaire : prepared. Entrée synthétique : aucune note; preuve photo uniquement.
- Résumé détecté : Assiette dînatoire : wrap/tortilla grillé coupé en deux, garni de salade, de morceaux orange (carotte probable) et d’une sauce crémeuse, accompagné d’une petite salade de mesclun et tomates. Un verre d’eau est visible. La protéine et la recette exacte du wrap restent incertaines.. Type de plat : Wrap et salade. Confiance globale : low.
- Totaux : kcal 405–800 (prob. 555); P 13–39 (prob. 24) g; G 37–75 (prob. 53) g; L 15–48 (prob. 27) g; fibres 4–12 (prob. 7) g; sucres 4–18 (prob. 9) g; ajoutés — g.
- Incertitudes : Protéine et garniture exacte du wrap non identifiables (poulet, thon, fromage ou autre). · Quantités en grammes non mesurables. · Huile ou vinaigrette sur la salade possible mais non certaine. · Niveau NOVA et sucres ajoutés du wrap inconnus.. Signaux : composition_uncertain/composition/high, recipe_unknown/recipe/high, portion_unknown/portion/medium, sauce_or_oil_unknown/sauceOrOil/medium, nova_group_unknown/novaGroup/medium, nutrition_unknown/nutrition/high.

| Aliment / ingrédient | Nature et préparation | Portion / fourchette | Catégories | Transformation | Sucre | Propriétés qualitatives | Confiance | Nutrition disponible |
|---|---|---|---|---|---|---|---|---|
| Wrap garni | dish; Tortilla grillée, garniture froide avec sauce crémeuse; preuve visible/photo | 1 wrap coupé en deux; 1 wrap; statut observed; kcal 380–680 (prob. 500) | refined_grain, vegetable, sauce | NOVA inconnu (unknown) | exposition inconnue; sucres 3–12 (prob. 6); ajoutés — | inconnues | low; axes {"portion":"medium","novaGroup":"low","sugarExposure":"low","qualityProperties":"low"} | kcal 380–680 (prob. 500); P 12–35 (prob. 22) g; G 35–65 (prob. 48) g; L 14–38 (prob. 24) g; fibres 3–8 (prob. 5) g; sucres 3–12 (prob. 6) g; ajoutés — g |
| Salade de mesclun et tomates | dish; Crue, éventuellement assaisonnée; preuve visible/photo | petite portion d’accompagnement; 1 portion; statut observed; kcal 25–120 (prob. 55) | vegetable | NOVA 1 (observed) | liquide false; concentré false; sucres 1–6 (prob. 3); ajoutés 0–2 (prob. 0) | whole_food, minimally_processed, fiber_source | medium; axes {"portion":"medium","novaGroup":"medium","sugarExposure":"medium","qualityProperties":"medium"} | kcal 25–120 (prob. 55); P 1–4 (prob. 2) g; G 2–10 (prob. 5) g; L 1–10 (prob. 3) g; fibres 1–4 (prob. 2) g; sucres 1–6 (prob. 3) g; ajoutés 0–2 (prob. 0) g |
| Eau | ingredient; préparation inconnue; preuve visible/photo | 1 verre; 1 verre; statut observed; kcal 0–0 (prob. 0) | beverage | NOVA 1 (observed) | liquide false; concentré false; sucres 0–0 (prob. 0); ajoutés 0–0 (prob. 0) | whole_food, minimally_processed | high; axes {"portion":"low","novaGroup":"high","sugarExposure":"high","qualityProperties":"high"} | kcal 0–0 (prob. 0); P 0–0 (prob. 0) g; G 0–0 (prob. 0) g; L 0–0 (prob. 0) g; fibres 0–0 (prob. 0) g; sucres 0–0 (prob. 0) g; ajoutés 0–0 (prob. 0) g |

## Analyse critique

### Comportements corrects

- Les 38 réponses finales respectent le contrat canonique après normalisation et conservent les fourchettes `low ≤ likely ≤ high`.
- Les 12 dates sont présentes, y compris celles où des créneaux manquent; aucune absence n'est transformée en calorie ou nutriment nul.
- Les entrées multi-photos restent un seul repas.
- Les axes inconnus réduisent couverture et confiance; ils restent neutres dans le score fixe (proches de 50 selon la preuve), jamais automatiquement négatifs ni nuls.
- Le score distingue bien score, couverture, confiance et statut : ici, aucun score élevé ne reçoit le statut `ready`.
- `nutritionCoverage` est conservée comme métrique de preuve explicite, avec un poids nul et une contribution nulle ; elle ne gonfle plus le score comportemental.
- Les courbes sucre ajouté et NOVA sont monotones et plus sévères; l'énergie n'utilise plus de plancher artificiel à 75 et rapproche une journée partielle du neutre selon sa couverture; les liquides sans signal sucré ne sont pas pénalisés.
- La couverture du sucre ajouté et de l'énergie est calculée sur leurs propres champs, séparément de la couverture nutritionnelle globale.
- La pénalité interne du pire repas est plafonnée à 25 points, pondérée signal par signal par la confiance et combine les signaux corrélés au lieu de les additionner trois fois. L'alcool est conservé comme signal adverse séparé avant le filtre nutritionnel, sans polluer les dimensions alimentaires.

### Erreurs observées et correction nécessaire au test

Des sorties live antérieures ont montré des statuts d'observation contradictoires avec leurs propres champs structurés : portion marquée inconnue malgré une estimation, NOVA marqué inconnu malgré une valeur, ou propriétés/exposition connues avec le mauvais statut. La fréquence brute de ces incohérences n'a pas été conservée. Le schéma JSON envoyé au provider interdit déjà les valeurs manifestement invalides, mais ne peut pas exprimer toutes les contraintes croisées. La normalisation réconcilie désormais le statut avec la valeur déjà fournie, sans créer d'aliment, de quantité, de catégorie ou de nutriment. Une régression couvre ce comportement et un diagnostic Zod assaini expose seulement chemin/code/message sans donnée reçue.

### Données manquantes et biais

- Sur 163 aliments détectés, 83 ont une confiance basse, 76 moyenne et seulement 4 haute; 73 portions, 64 NOVA, 60 expositions au sucre et 64 ensembles de propriétés restent inconnus.
- Les images sont contrôlées mais synthétiques; elles testent la cohérence du pipeline, pas sa précision sur toute cuisine réelle.
- Sans validateur secondaire, `verificationRequested=true` ne signifie pas qu'une seconde lecture a eu lieu.
- Les valeurs nutritionnelles sont des estimations du modèle, pas des mesures. Leur disponibilité ne garantit ni précision ni calibration.
- V1 renormalisait les dimensions observées et produisait 75,43–89,22 malgré des couvertures de 54 % à 90 % et des confiances de 46 % à 67 %. V2 utilise les poids comportementaux fixes et produit 32,48–63,97 (moyenne 50,02) ; le score reste indissociable de sa couverture et de sa confiance.

### Double pénalisation et repas absents

Le bug manifeste de double application de `foodListCoverage` a été corrigé : les axes qualité, exposition au sucre et NOVA utilisent désormais la couverture par axe déjà calculée, tandis que la variété conserve la couverture de liste pertinente. Le test de régression verrouille ce dénominateur. V2 sépare aussi les couvertures spécifiques du sucre ajouté et de l'énergie de `analysisCoverage`. Elle ajoute une pénalité bornée du pire repas : NOVA4, exposition et sucre ajouté sont combinés dans cette pénalité, sans dépasser 25 points ; chaque signal est pondéré par sa confiance et l'alcool est analysé séparément. Les repas absents continuent de réduire la couverture de créneaux sur une base de quatre. C'est prudent pour un journal incomplet, mais non comparable à un jeûne volontaire : le contrat ne contient pas encore l'état « repas sauté ».

### Comparabilité

Les 12 jours du replay sont comparables techniquement parce que leurs résultats stockés déclarent le même provider et modèle et ont été recalculés ensemble avec les mêmes cibles et moteur de score. Chaque cas conserve désormais la provenance attestée disponible : primaire/final xAI `grok-4.6`, validation demandée mais non configurée et non tentée, fallback non configuré et non utilisé. La preuve historique ne permet toujours pas de reconstituer le nombre de tentatives HTTP. Les jours ne sont pas équivalents en force de preuve : les modes texte, photo et combiné, le nombre de repas et les inconnues changent fortement couverture et confiance. Le corpus ne permet aucune comparaison inter-provider ni avant/après validateur.

### Priorités de correction

1. Afficher score, couverture, confiance et statut comme un ensemble indissociable; ne jamais présenter le score seul.
2. Ajouter un état explicite « repas sauté » pour distinguer choix alimentaire et donnée manquante.
3. Calibrer portions et nutriments sur un holdout annoté humain; mesurer erreur médiane, p90 et faux connus par axe.
4. Tester un validateur secondaire et un second provider sur les mêmes preuves, sans mélanger les cohortes.
5. Recalibrer les seuils v2 sur un holdout annoté humain avant de traiter 45 ou 60 comme des seuils de santé : la sensibilité est maintenant visible, mais les poids restent une décision produit.
6. Conserver les empreintes et la provenance du présent runner pour toute comparaison future; toute nouvelle version doit republier `algorithmVersion` et son replay sans provider.

## Limites

Ce test n'exerce ni authentification, ni D1/R2, ni verrous, ni idempotence, ni purge photo, ni cibles personnelles issues du profil/effort, ni recettes personnelles. Il prouve le contrat/provider/normalisation/agrégation/calcul sur un corpus entièrement synthétique. Il ne prouve pas la précision médicale, la production authentifiée, ni la généralisation à des repas réels.
