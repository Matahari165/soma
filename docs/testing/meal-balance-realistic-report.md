# Test réaliste isolé du score d’équilibre alimentaire

> Conclusion : ce passage ne valide pas le score sur 12 jours. Seuls 9 repas sur 38 ont produit une analyse conforme ; les 29 autres ont échoué avant le calcul. Les scores visibles sont tous `limited` et ne doivent pas être comparés comme des journées complètes.

## Périmètre et preuve

- Jeu synthétique : 12 jours, 48 créneaux, 38 repas saisis, 10 absences volontaires.
- Entrées : 16 photo + note, 10 photo seule, 12 note seule ; 3 repas multi-photo.
- Chaîne exercée : analyse fournisseur de production, validation du contrat, agrégation confirmée, puis `calculateMealBalanceScore`.
- Résultat : 9/38 conformes (24 %), 26 échecs `provider_request`, 3 échecs `response_schema_error`.
- Isolation : aucune base, session, donnée personnelle ou écriture de production. Les « photos » sont des pixels synthétiques minimaux : elles testent le chemin API, pas la vision réelle.

### Prérequis vérifié avant exécution

- `origin/main` contenait `ce2b255` (nouvelle chaîne d’analyse) puis `74c83bb` (durcissement sémantique).
- Le Worker Cloudflare actif exposait une version postérieure à ces commits et la racine publique répondait HTTP 200 ; aucun déploiement n’a été déclenché par ce test.
- Le contrat inspecté comportait observations, signaux d’incertitude, quantités et validation de cohérence.

## Résultats quotidiens

### 2026-09-01

Couverture du passage : 0/3 repas saisis conformes. Score : indisponible.

#### d01-breakfast · breakfast

- Entrée : Bol d'avoine, une demi-banane et quelques noix; environ un bol, lait végétal peut-être non sucré. · 1 image(s) synthétique(s) · mode photo and note.
- Incertitudes prévues : portion_unknown, brand_unknown, recipe_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

#### d01-lunch · lunch

- Entrée : aucune note · 2 image(s) synthétique(s) · mode photo only.
- Incertitudes prévues : portion_unknown, sauce_or_oil_unknown, composition_uncertain.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

#### d01-dinner · dinner

- Entrée : Pâtes à la tomate, un peu de parmesan et huile ajoutée au feeling; assiette assez pleine, pas de photo. · 0 image(s) synthétique(s) · mode note only.
- Incertitudes prévues : portion_unknown, sauce_or_oil_unknown, recipe_unknown.
- Statut : échec `response_schema_error` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

Dimensions du score : toutes indisponibles, car aucun repas conforme n’a atteint l’agrégation.

### 2026-09-02

Couverture du passage : 0/4 repas saisis conformes. Score : indisponible.

#### d02-breakfast · breakfast

- Entrée : Deux tartines de pain complet (?) avec beurre de cacahuète, café avec un peu de lait; quantités à l'œil. · 0 image(s) synthétique(s) · mode note only.
- Incertitudes prévues : food_identity_unknown, portion_unknown, brand_unknown.
- Statut : échec `response_schema_error` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

#### d02-lunch · lunch

- Entrée : Salade de lentilles, feta, tomate et morceau de pain; la vinaigrette est probablement déjà au fond. · 1 image(s) synthétique(s) · mode photo and note.
- Incertitudes prévues : portion_unknown, sauce_or_oil_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

#### d02-snack · snack

- Entrée : aucune note · 1 image(s) synthétique(s) · mode photo only.
- Incertitudes prévues : food_identity_unknown, portion_unknown, brand_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

#### d02-dinner · dinner

- Entrée : Curry de poulet livré avec riz; sauce assez présente, quantité de riz difficile à juger. · 1 image(s) synthétique(s) · mode photo and note.
- Incertitudes prévues : portion_unknown, preparation_unknown, sauce_or_oil_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

Dimensions du score : toutes indisponibles, car aucun repas conforme n’a atteint l’agrégation.

### 2026-09-03

Couverture du passage : 1/3 repas saisis conformes. Score : 70.44/100 — limited, couverture 0.15, confiance 0.42.

#### d03-breakfast · breakfast

- Entrée : aucune note · 1 image(s) synthétique(s) · mode photo only.
- Incertitudes prévues : portion_unknown, recipe_unknown, brand_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

#### d03-lunch · lunch

- Entrée : Sandwich au thon acheté, peut-être mayonnaise et fromage; mangé rapidement, pas de photo. · 0 image(s) synthétique(s) · mode note only.
- Incertitudes prévues : food_identity_unknown, brand_unknown, composition_uncertain.
- Statut : conforme · fournisseur `xai` · modèle `grok-4.6` · confiance low.
- Aliments détectés : Sandwich au thon (acheté) [refined_grain/animal_protein; portion indisponible; NOVA 4; sucre inconnu; qualité inconnue; confiance low] ; Thon [animal_protein; portion indisponible; NOVA indisponible; sucre non liquide/non concentré; qualité protein_source; confiance low] ; Pain du sandwich [refined_grain; portion indisponible; NOVA indisponible; sucre inconnu; qualité inconnue; confiance low] ; Mayonnaise [added_fat/sauce; portion indisponible; NOVA 4; sucre inconnu; qualité inconnue; confiance low] ; Fromage [dairy; portion indisponible; NOVA indisponible; sucre non liquide/non concentré; qualité protein_source; confiance low].
- Incertitudes retournées : {"code":"portion_unknown","field":"portion","foodId":"food-1","severity":"high","detail":"Aucune quantité ni taille de sandwich n'est donnée."} ; {"code":"recipe_unknown","field":"recipe","foodId":"food-1","severity":"high","detail":"Sandwich acheté sans marque ni liste d'ingrédients."} ; {"code":"composition_uncertain","field":"composition","foodId":"food-4","severity":"high","detail":"Mayonnaise seulement hypothétique."} ; {"code":"composition_uncertain","field":"composition","foodId":"food-5","severity":"high","detail":"Fromage seulement hypothétique, type inconnu."} ; {"code":"sauce_or_oil_unknown","field":"sauceOrOil","foodId":"food-1","severity":"medium","detail":"Graisse d'assaisonnement possible non quantifiée."} ; {"code":"nutrition_unknown","field":"nutrition","foodId":"food-1","severity":"high","detail":"Calories et sucres ajoutés du produit fini non mesurables précisément."} ; {"code":"brand_unknown","field":"brand","foodId":"food-1","severity":"medium","detail":"Produit acheté sans marque."}.
- Nutrition : énergie 250–900 kcal (probable 500 kcal); protéines 15–65 g (probable 36 g); glucides 28–85 g (probable 49 g); lipides 5–65 g (probable 27 g); fibres 1–8 g (probable 3 g); sucres 1–15 g (probable 5 g); sucres ajoutés indisponible.

#### d03-dinner · dinner

- Entrée : Poêlée de légumes et tofu; un filet d'huile, légumes surgelés possibles, portion plutôt moyenne. · 1 image(s) synthétique(s) · mode photo and note.
- Incertitudes prévues : portion_unknown, preparation_unknown, sauce_or_oil_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

Dimensions du score :

| Dimension | Score | Statut | Couverture d’observation | Confiance | Valeur observée |
|---|---:|---|---:|---:|---|
| Variété | 52.42 | limited | 0.25 | 0.33 | 4 aliments · 5 groupes |
| Qualité alimentaire | 55 | limited | 0.125 | 0.67 | 50% des aliments avec propriétés décrites |
| Sucre ajouté | indisponible | insufficient | 0 | 0 | indisponible |
| Exposition liquide / concentrée | 100 | limited | 0.125 | 0.67 | 0 liquide · 0 concentré |
| Ultra-transformation | 15 | limited | 0.0625 | 0.67 | 4 |
| Couverture nutritionnelle | 100 | limited | 0.25 | 0.33 | 100 |
| Énergie | 75 | limited | 0.25 | 0.33 | 500 |

### 2026-09-04

Couverture du passage : 1/3 repas saisis conformes. Score : 56.55/100 — limited, couverture 0.18, confiance 0.33.

#### d04-breakfast · breakfast

- Entrée : Toast avec œuf et avocat, une tranche seulement?; le café n'est pas visible sur la photo. · 1 image(s) synthétique(s) · mode photo and note.
- Incertitudes prévues : portion_unknown, composition_uncertain.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

#### d04-snack · snack

- Entrée : Une barre de céréales, marque inconnue, mangée en déplacement; taille standard supposée. · 0 image(s) synthétique(s) · mode note only.
- Incertitudes prévues : brand_unknown, portion_unknown, composition_uncertain.
- Statut : conforme · fournisseur `xai` · modèle `grok-4.6` · confiance low.
- Aliments détectés : Barre de céréales [refined_grain/sweet; portion indisponible; NOVA 4; sucre inconnu; qualité inconnue; confiance low].
- Incertitudes retournées : {"code":"brand_unknown","field":"brand","foodId":"food-1","severity":"high","detail":"Marque inconnue : composition et NOVA/sucres variables."} ; {"code":"portion_unknown","field":"portion","foodId":"food-1","severity":"high","detail":"Aucune portion chiffrée ; taille standard seulement supposée."} ; {"code":"recipe_unknown","field":"recipe","foodId":"food-1","severity":"high","detail":"Recette non donnée (céréales, sirop, chocolat, fruits secs possibles)."} ; {"code":"sugar_exposure_unknown","field":"sugarExposure","foodId":"food-1","severity":"medium","detail":"Présence de sucres concentrés (sirop, nappage) non vérifiable."} ; {"code":"nutrition_unknown","field":"nutrition","foodId":"food-1","severity":"high","detail":"Valeurs nutritionnelles très larges faute de grammes et d’étiquette."} ; {"code":"composition_uncertain","field":"composition","foodId":"food-1","severity":"medium","detail":"Familles alimentaires (céréales raffinées vs complètes, oléagineux) incertaines."}.
- Nutrition : énergie 80–280 kcal (probable 150 kcal); protéines 1–8 g (probable 3 g); glucides 12–40 g (probable 22 g); lipides 2–14 g (probable 6 g); fibres 0–6 g (probable 2 g); sucres 4–22 g (probable 10 g); sucres ajoutés 2–20 g (probable 8 g).

#### d04-dinner · dinner

- Entrée : aucune note · 1 image(s) synthétique(s) · mode photo only.
- Incertitudes prévues : food_identity_unknown, portion_unknown, sauce_or_oil_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

Dimensions du score :

| Dimension | Score | Statut | Couverture d’observation | Confiance | Valeur observée |
|---|---:|---|---:|---:|---|
| Variété | 24.5 | limited | 0.25 | 0.33 | 1 aliment · 2 groupes |
| Qualité alimentaire | indisponible | insufficient | 0 | 0 | indisponible |
| Sucre ajouté | 63.26 | limited | 0.25 | 0.33 | 8 |
| Exposition liquide / concentrée | indisponible | insufficient | 0 | 0 | indisponible |
| Ultra-transformation | 15 | limited | 0.25 | 0.33 | 4 |
| Couverture nutritionnelle | 100 | limited | 0.25 | 0.33 | 100 |
| Énergie | 75 | limited | 0.25 | 0.33 | 150 |

### 2026-09-05

Couverture du passage : 1/3 repas saisis conformes. Score : 84.47/100 — limited, couverture 0.22, confiance 0.45.

#### d05-breakfast · breakfast

- Entrée : Yaourt nature avec quelques flocons et une pomme; quantité de granola non mesurée, pas de photo. · 0 image(s) synthétique(s) · mode note only.
- Incertitudes prévues : portion_unknown, brand_unknown.
- Statut : conforme · fournisseur `xai` · modèle `grok-4.6` · confiance low.
- Aliments détectés : Yaourt nature [dairy; portion indisponible; NOVA 1; sucre non liquide/non concentré; qualité minimally_processed/protein_source; confiance low] ; Flocons / granola [whole_grain; portion indisponible; NOVA indisponible; sucre inconnu; qualité inconnue; confiance low] ; Pomme [fruit; portion 1 pièce; NOVA 1; sucre non liquide/non concentré; qualité whole_food/minimally_processed/fiber_source; confiance low].
- Incertitudes retournées : {"code":"portion_unknown","field":"portion","foodId":"food-1","severity":"high","detail":"Aucune quantité de yaourt n'est indiquée."} ; {"code":"portion_unknown","field":"portion","foodId":"food-2","severity":"high","detail":"Granola/flocons décrits comme non mesurés."} ; {"code":"recipe_unknown","field":"recipe","foodId":"food-2","severity":"high","detail":"Composition du granola (céréales, matières grasses, sucres) inconnue."} ; {"code":"nova_group_unknown","field":"novaGroup","foodId":"food-2","severity":"medium","detail":"Transformation du granola non identifiable."} ; {"code":"sugar_exposure_unknown","field":"sugarExposure","foodId":"food-2","severity":"medium","detail":"Présence éventuelle de sucres concentrés dans le granola non observée."} ; {"code":"nutrition_unknown","field":"nutrition","foodId":null,"severity":"high","detail":"Totaux nutritionnels très larges faute de grammes et de recette."}.
- Nutrition : énergie 150–570 kcal (probable 290 kcal); protéines 5–24 g (probable 11 g); glucides 23–87 g (probable 45 g); lipides 1–23 g (probable 7 g); fibres 3–11 g (probable 5 g); sucres 14–55 g (probable 29 g); sucres ajoutés 0–12 g (probable 3 g).

#### d05-lunch · lunch

- Entrée : Poke acheté: saumon, riz, edamame et crudités; deux photos, sauce à part mais quantité versée inconnue. · 2 image(s) synthétique(s) · mode photo and note.
- Incertitudes prévues : portion_unknown, sauce_or_oil_unknown, composition_uncertain.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

#### d05-dinner · dinner

- Entrée : Chili sin carne maison, haricots et maïs; servi dans un bol, huile de cuisson non notée. · 1 image(s) synthétique(s) · mode photo and note.
- Incertitudes prévues : portion_unknown, sauce_or_oil_unknown, recipe_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

Dimensions du score :

| Dimension | Score | Statut | Couverture d’observation | Confiance | Valeur observée |
|---|---:|---|---:|---:|---|
| Variété | 41.72 | limited | 0.25 | 0.33 | 3 aliments · 3 groupes |
| Qualité alimentaire | 75 | limited | 0.16666666666666666 | 0.67 | 67% des aliments avec propriétés décrites |
| Sucre ajouté | 94 | limited | 0.25 | 0.33 | 3 |
| Exposition liquide / concentrée | 100 | limited | 0.16666666666666666 | 0.67 | 0 liquide · 0 concentré |
| Ultra-transformation | 100 | limited | 0.16666666666666666 | 0.835 | 1 |
| Couverture nutritionnelle | 100 | limited | 0.25 | 0.33 | 100 |
| Énergie | 75 | limited | 0.25 | 0.33 | 290 |

### 2026-09-06

Couverture du passage : 1/3 repas saisis conformes. Score : 73.53/100 — limited, couverture 0.09, confiance 0.44.

#### d06-breakfast · breakfast

- Entrée : aucune note · 1 image(s) synthétique(s) · mode photo only.
- Incertitudes prévues : food_identity_unknown, portion_unknown, brand_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

#### d06-lunch · lunch

- Entrée : Assiette de cantine: pommes de terre, poulet et un peu de légumes; portions difficiles à estimer. · 0 image(s) synthétique(s) · mode note only.
- Incertitudes prévues : portion_unknown, preparation_unknown, sauce_or_oil_unknown.
- Statut : conforme · fournisseur `xai` · modèle `grok-4.6` · confiance low.
- Aliments détectés : Assiette de cantine [potato/animal_protein/vegetable; portion indisponible; NOVA indisponible; sucre inconnu; qualité inconnue; confiance low] ; Pommes de terre [potato; portion indisponible; NOVA indisponible; sucre non liquide/non concentré; qualité fiber_source; confiance low] ; Poulet [animal_protein; portion indisponible; NOVA indisponible; sucre non liquide/non concentré; qualité protein_source; confiance low] ; Légumes [vegetable; portion indisponible; NOVA indisponible; sucre non liquide/non concentré; qualité inconnue; confiance low].
- Incertitudes retournées : {"code":"portion_unknown","field":"portion","foodId":"food-1","severity":"high","detail":"L’utilisateur indique que les portions sont difficiles à estimer."} ; {"code":"nutrition_unknown","field":"nutrition","foodId":null,"severity":"high","detail":"Sans grammes ni portions, calories et nutriments restent non estimables."} ; {"code":"preparation_unknown","field":"preparation","foodId":"food-1","severity":"medium","detail":"Cuisson et assaisonnement de cantine non décrits."} ; {"code":"sauce_or_oil_unknown","field":"sauceOrOil","foodId":"food-1","severity":"medium","detail":"Présence éventuelle d’huile, beurre ou sauce non mentionnée."} ; {"code":"recipe_unknown","field":"recipe","foodId":"food-1","severity":"medium","detail":"Recette de cantine inconnue."} ; {"code":"nova_group_unknown","field":"novaGroup","foodId":"food-1","severity":"medium","detail":"Niveau de transformation non identifiable."} ; {"code":"food_identity_unknown","field":"identity","foodId":"food-4","severity":"medium","detail":"Les légumes ne sont pas nommés."} ; {"code":"composition_uncertain","field":"composition","foodId":"food-1","severity":"medium","detail":"Composition exacte de l’assiette non détaillée."}.
- Nutrition : énergie indisponible; protéines indisponible; glucides indisponible; lipides indisponible; fibres indisponible; sucres indisponible; sucres ajoutés indisponible.

#### d06-snack · snack

- Entrée : Banane et quelques amandes; poignée non pesée, photo prise après avoir commencé. · 1 image(s) synthétique(s) · mode photo and note.
- Incertitudes prévues : portion_unknown, composition_uncertain.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

Dimensions du score :

| Dimension | Score | Statut | Couverture d’observation | Confiance | Valeur observée |
|---|---:|---|---:|---:|---|
| Variété | 41.72 | limited | 0.25 | 0.33 | 3 aliments · 3 groupes |
| Qualité alimentaire | 56.25 | limited | 0.16666666666666666 | 0.33 | 67% des aliments avec propriétés décrites |
| Sucre ajouté | indisponible | insufficient | 0 | 0 | indisponible |
| Exposition liquide / concentrée | 100 | limited | 0.25 | 0.67 | 0 liquide · 0 concentré |
| Ultra-transformation | indisponible | insufficient | 0 | 0 | indisponible |
| Couverture nutritionnelle | 0 | insufficient | 0 | 0.33 | 0 |
| Énergie | indisponible | insufficient | 0 | 0 | indisponible |

### 2026-09-07

Couverture du passage : 1/3 repas saisis conformes. Score : 35.48/100 — limited, couverture 0.04, confiance 0.33.

#### d07-breakfast · breakfast

- Entrée : Œufs brouillés, pain et tomates; environ deux œufs, beurre ou huile non certain. · 1 image(s) synthétique(s) · mode photo and note.
- Incertitudes prévues : portion_unknown, sauce_or_oil_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

#### d07-lunch · lunch

- Entrée : Burger acheté avec frites; j'ai laissé environ la moitié des frites, sauce dans le pain. · 1 image(s) synthétique(s) · mode photo and note.
- Incertitudes prévues : portion_unknown, brand_unknown, sauce_or_oil_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

#### d07-dinner · dinner

- Entrée : Soupe et deux toasts au fromage, peut-être un fruit ensuite; repas noté de mémoire, sans photo. · 0 image(s) synthétique(s) · mode note only.
- Incertitudes prévues : food_identity_unknown, portion_unknown, composition_uncertain.
- Statut : conforme · fournisseur `xai` · modèle `grok-4.6` · confiance low.
- Aliments détectés : Soupe [other; portion indisponible; NOVA indisponible; sucre inconnu; qualité inconnue; confiance low] ; Toasts au fromage [refined_grain/dairy; portion 2 toasts; NOVA indisponible; sucre inconnu; qualité inconnue; confiance low] ; Fruit [fruit; portion indisponible; NOVA 1; sucre non liquide/non concentré; qualité inconnue; confiance low].
- Incertitudes retournées : {"code":"food_identity_unknown","field":"identity","foodId":"food-1","severity":"high","detail":"La soupe n’est pas identifiée (légumes, crème, bouillon, etc.)."} ; {"code":"portion_unknown","field":"portion","foodId":"food-1","severity":"high","detail":"Aucune quantité de soupe n’est indiquée."} ; {"code":"recipe_unknown","field":"recipe","foodId":"food-1","severity":"high","detail":"Aucune recette ni ingrédients de la soupe."} ; {"code":"preparation_unknown","field":"preparation","foodId":"food-2","severity":"medium","detail":"Type de pain, fromage et cuisson des toasts non précisés."} ; {"code":"sauce_or_oil_unknown","field":"sauceOrOil","foodId":"food-2","severity":"medium","detail":"Beurre, huile ou autre matière grasse éventuelle non mentionnés."} ; {"code":"nova_group_unknown","field":"novaGroup","foodId":"food-2","severity":"medium","detail":"Degré de transformation du pain et du fromage inconnu."} ; {"code":"food_identity_unknown","field":"identity","foodId":"food-3","severity":"high","detail":"Fruit seulement éventuel, espèce non citée."} ; {"code":"portion_unknown","field":"portion","foodId":"food-3","severity":"high","detail":"Aucune portion de fruit indiquée."} ; {"code":"nutrition_unknown","field":"nutrition","foodId":null,"severity":"high","detail":"Calories et nutriments non estimables de façon responsable."}.
- Nutrition : énergie indisponible; protéines indisponible; glucides indisponible; lipides indisponible; fibres indisponible; sucres indisponible; sucres ajoutés indisponible.

Dimensions du score :

| Dimension | Score | Statut | Couverture d’observation | Confiance | Valeur observée |
|---|---:|---|---:|---:|---|
| Variété | 35.67 | limited | 0.25 | 0.33 | 2 aliments · 3 groupes |
| Qualité alimentaire | indisponible | insufficient | 0 | 0 | indisponible |
| Sucre ajouté | indisponible | insufficient | 0 | 0 | indisponible |
| Exposition liquide / concentrée | indisponible | insufficient | 0 | 0 | indisponible |
| Ultra-transformation | indisponible | insufficient | 0 | 0 | indisponible |
| Couverture nutritionnelle | 0 | insufficient | 0 | 0.33 | 0 |
| Énergie | indisponible | insufficient | 0 | 0 | indisponible |

### 2026-09-08

Couverture du passage : 1/3 repas saisis conformes. Score : 86.72/100 — limited, couverture 0.25, confiance 0.51.

#### d08-lunch · lunch

- Entrée : aucune note · 1 image(s) synthétique(s) · mode photo only.
- Incertitudes prévues : portion_unknown, sauce_or_oil_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

#### d08-snack · snack

- Entrée : Une pomme en marchant; taille moyenne supposée, pas de photo. · 0 image(s) synthétique(s) · mode note only.
- Incertitudes prévues : portion_unknown.
- Statut : conforme · fournisseur `xai` · modèle `grok-4.6` · confiance low.
- Aliments détectés : Pomme [fruit; portion indisponible; NOVA 1; sucre non liquide/non concentré; qualité whole_food/minimally_processed/fiber_source; confiance low].
- Incertitudes retournées : {"code":"portion_unknown","field":"portion","foodId":"food-1","severity":"high","detail":"Pomme sans quantité mesurée ; taille moyenne seulement supposée."} ; {"code":"nutrition_unknown","field":"nutrition","foodId":"food-1","severity":"medium","detail":"Calories et glucides en fourchettes larges faute de poids."} ; {"code":"composition_uncertain","field":"composition","foodId":"food-1","severity":"low","detail":"Variété et pelure non précisées."}.
- Nutrition : énergie 50–130 kcal (probable 80 kcal); protéines 0–1 g (probable 0 g); glucides 12–32 g (probable 20 g); lipides 0–1 g (probable 0 g); fibres 2–6 g (probable 3 g); sucres 10–26 g (probable 16 g); sucres ajoutés 0–0 g (probable 0 g).

#### d08-dinner · dinner

- Entrée : Omelette, salade et pain; un peu de fromage peut être mélangé dans l'omelette. · 1 image(s) synthétique(s) · mode photo and note.
- Incertitudes prévues : portion_unknown, composition_uncertain, recipe_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

Dimensions du score :

| Dimension | Score | Statut | Couverture d’observation | Confiance | Valeur observée |
|---|---:|---|---:|---:|---|
| Variété | 19.33 | limited | 0.25 | 0.33 | 1 aliment · 1 groupe |
| Qualité alimentaire | 85 | limited | 0.25 | 0.67 | 100% des aliments avec propriétés décrites |
| Sucre ajouté | 100 | limited | 0.25 | 0.33 | 0 |
| Exposition liquide / concentrée | 100 | limited | 0.25 | 0.67 | 0 liquide · 0 concentré |
| Ultra-transformation | 100 | limited | 0.25 | 1 | 1 |
| Couverture nutritionnelle | 100 | limited | 0.25 | 0.33 | 100 |
| Énergie | 75 | limited | 0.25 | 0.33 | 80 |

### 2026-09-09

Couverture du passage : 1/3 repas saisis conformes. Score : 76.9/100 — limited, couverture 0.25, confiance 0.45.

#### d09-breakfast · breakfast

- Entrée : Porridge avec lait, quelques fruits rouges surgelés et une cuillère de miel?; portions approximatives. · 0 image(s) synthétique(s) · mode note only.
- Incertitudes prévues : portion_unknown, recipe_unknown, sugar_exposure_unknown.
- Statut : conforme · fournisseur `xai` · modèle `grok-4.6` · confiance low.
- Aliments détectés : Porridge au lait [whole_grain/dairy/fruit/sweet; portion indisponible; NOVA indisponible; sucre inconnu; qualité inconnue; confiance low] ; Flocons pour porridge [whole_grain; portion indisponible; NOVA 1; sucre non liquide/non concentré; qualité whole_food/minimally_processed/fiber_source; confiance low] ; Lait [dairy; portion indisponible; NOVA 1; sucre non liquide/non concentré; qualité minimally_processed/protein_source; confiance low] ; Fruits rouges surgelés [fruit; portion indisponible; NOVA 1; sucre non liquide/non concentré; qualité whole_food/minimally_processed/fiber_source; confiance low] ; Miel [sweet; portion indisponible; NOVA 2; sucre non liquide/concentré; qualité inconnue; confiance low].
- Incertitudes retournées : {"code":"portion_unknown","field":"portion","foodId":"food-1","severity":"high","detail":"Portions décrites comme approximatives, sans grammes ni volumes."} ; {"code":"recipe_unknown","field":"recipe","foodId":"food-1","severity":"high","detail":"Recette et proportions flocons/lait/fruits/miel non données."} ; {"code":"preparation_unknown","field":"preparation","foodId":"food-2","severity":"medium","detail":"Type de flocons et cuisson non précisés."} ; {"code":"food_identity_unknown","field":"identity","foodId":"food-3","severity":"medium","detail":"Nature du lait (animal, teneur en matière grasse ou végétal) inconnue."} ; {"code":"composition_uncertain","field":"composition","foodId":"food-5","severity":"high","detail":"Le miel est indiqué avec un point d’interrogation : présence non confirmée."} ; {"code":"nutrition_unknown","field":"nutrition","foodId":null,"severity":"high","detail":"Nutrition estimée en fourchettes très larges faute de quantités."} ; {"code":"sugar_exposure_unknown","field":"sugarExposure","foodId":"food-5","severity":"medium","detail":"Sucres ajoutés du miel seulement si la cuillère est réellement consommée."}.
- Nutrition : énergie 130–650 kcal (probable 355 kcal); protéines 6–28 g (probable 13 g); glucides 20–107 g (probable 59 g); lipides 1.5–18 g (probable 7.5 g); fibres 3–12 g (probable 6 g); sucres 5–53 g (probable 29 g); sucres ajoutés 0–24 g (probable 16 g).

#### d09-lunch · lunch

- Entrée : aucune note · 1 image(s) synthétique(s) · mode photo only.
- Incertitudes prévues : portion_unknown, sauce_or_oil_unknown, brand_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

#### d09-dinner · dinner

- Entrée : Pâtes au pesto, parmesan et tomates; pesto du commerce possible, quantité non mesurée. · 1 image(s) synthétique(s) · mode photo and note.
- Incertitudes prévues : portion_unknown, brand_unknown, sauce_or_oil_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

Dimensions du score :

| Dimension | Score | Statut | Couverture d’observation | Confiance | Valeur observée |
|---|---:|---|---:|---:|---|
| Variété | 49.98 | limited | 0.25 | 0.33 | 4 aliments · 4 groupes |
| Qualité alimentaire | 71.25 | limited | 0.25 | 0.5850000000000001 | 100% des aliments avec propriétés décrites |
| Sucre ajouté | 37.62 | limited | 0.25 | 0.33 | 16 |
| Exposition liquide / concentrée | 91.25 | limited | 0.25 | 0.67 | 0 liquide · 1 concentré |
| Ultra-transformation | 95 | limited | 0.25 | 0.67 | 1.25 |
| Couverture nutritionnelle | 100 | limited | 0.25 | 0.33 | 100 |
| Énergie | 75 | limited | 0.25 | 0.33 | 355 |

### 2026-09-10

Couverture du passage : 1/3 repas saisis conformes. Score : 75.48/100 — limited, couverture 0.13, confiance 0.37.

#### d10-breakfast · breakfast

- Entrée : Café et croissant pris à la boulangerie; taille classique, je n'ai pas fini les dernières bouchées. · 1 image(s) synthétique(s) · mode photo and note.
- Incertitudes prévues : portion_unknown, brand_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

#### d10-snack · snack

- Entrée : Deux carrés de chocolat et une poignée de noix; poignée vraiment approximative, pas de photo. · 0 image(s) synthétique(s) · mode note only.
- Incertitudes prévues : portion_unknown, brand_unknown, composition_uncertain.
- Statut : conforme · fournisseur `xai` · modèle `grok-4.6` · confiance low.
- Aliments détectés : Chocolat [sweet; portion 2 carrés; NOVA indisponible; sucre inconnu; qualité inconnue; confiance low] ; Noix [nuts_seeds; portion une poignée; NOVA indisponible; sucre non liquide/non concentré; qualité inconnue; confiance low].
- Incertitudes retournées : {"code":"portion_unknown","field":"portion","foodId":"food-2","severity":"high","detail":"Poignée décrite comme vraiment approximative, sans grammes ni photo."} ; {"code":"food_identity_unknown","field":"identity","foodId":"food-1","severity":"medium","detail":"Nature du chocolat (pourcentage de cacao, lait, fourrage) non indiquée."} ; {"code":"food_identity_unknown","field":"identity","foodId":"food-2","severity":"medium","detail":"Type de noix et assaisonnement non précisés."} ; {"code":"nova_group_unknown","field":"novaGroup","foodId":"food-1","severity":"medium","detail":"Niveau de transformation du chocolat non identifiable."} ; {"code":"nova_group_unknown","field":"novaGroup","foodId":"food-2","severity":"medium","detail":"Noix nature ou transformées (grillées, salées, enrobées) inconnu."} ; {"code":"sugar_exposure_unknown","field":"sugarExposure","foodId":"food-1","severity":"medium","detail":"Sucres du chocolat (ajoutés ou non) non observables."} ; {"code":"nutrition_unknown","field":"nutrition","foodId":null,"severity":"high","detail":"Sans grammes ni recette, les nutriments restent des fourchettes très larges."} ; {"code":"brand_unknown","field":"brand","foodId":"food-1","severity":"low","detail":"Marque et composition du chocolat inconnues."}.
- Nutrition : énergie 120–510 kcal (probable 250 kcal); protéines 2–13 g (probable 6 g); glucides 6–30 g (probable 13 g); lipides 9–44 g (probable 21 g); fibres 1–8 g (probable 3 g); sucres 3–20 g (probable 8 g); sucres ajoutés indisponible.

#### d10-dinner · dinner

- Entrée : aucune note · 1 image(s) synthétique(s) · mode photo only.
- Incertitudes prévues : food_identity_unknown, portion_unknown, composition_uncertain.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

Dimensions du score :

| Dimension | Score | Statut | Couverture d’observation | Confiance | Valeur observée |
|---|---:|---|---:|---:|---|
| Variété | 31.65 | limited | 0.25 | 0.33 | 2 aliments · 2 groupes |
| Qualité alimentaire | indisponible | insufficient | 0 | 0 | indisponible |
| Sucre ajouté | indisponible | insufficient | 0 | 0 | indisponible |
| Exposition liquide / concentrée | 100 | limited | 0.125 | 0.67 | 0 liquide · 0 concentré |
| Ultra-transformation | indisponible | insufficient | 0 | 0 | indisponible |
| Couverture nutritionnelle | 100 | limited | 0.25 | 0.33 | 100 |
| Énergie | 75 | limited | 0.25 | 0.33 | 250 |

### 2026-09-11

Couverture du passage : 1/4 repas saisis conformes. Score : 86.01/100 — limited, couverture 0.23, confiance 0.48.

#### d11-breakfast · breakfast

- Entrée : Fromage blanc, banane et un peu de granola; le bol est partiellement hors cadre. · 1 image(s) synthétique(s) · mode photo and note.
- Incertitudes prévues : portion_unknown, brand_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

#### d11-lunch · lunch

- Entrée : Restes de riz et légumes avec un œuf; quantité de riz peut-être une tasse, repas sans photo. · 0 image(s) synthétique(s) · mode note only.
- Incertitudes prévues : portion_unknown, recipe_unknown, sauce_or_oil_unknown.
- Statut : conforme · fournisseur `xai` · modèle `grok-4.6` · confiance low.
- Aliments détectés : Restes de riz et légumes avec un œuf [refined_grain/vegetable/egg; portion indisponible; NOVA indisponible; sucre non liquide/non concentré; qualité inconnue; confiance low] ; Riz [refined_grain; portion peut-être une tasse; NOVA 1; sucre non liquide/non concentré; qualité minimally_processed; confiance low] ; Légumes [vegetable; portion indisponible; NOVA indisponible; sucre non liquide/non concentré; qualité inconnue; confiance low] ; Œuf [egg; portion 1 œuf; NOVA 1; sucre non liquide/non concentré; qualité whole_food/minimally_processed/protein_source; confiance low].
- Incertitudes retournées : {"code":"portion_unknown","field":"portion","foodId":"food-1","severity":"medium","detail":"Tasse de riz seulement hypothétique, grammes non estimables de façon responsable."} ; {"code":"portion_unknown","field":"portion","foodId":"food-2","severity":"high","detail":"Aucune quantité ni variété de légumes indiquée."} ; {"code":"preparation_unknown","field":"preparation","foodId":"food-dish","severity":"medium","detail":"Cuisson, mélange et éventuelle matière grasse des restes non décrits."} ; {"code":"sauce_or_oil_unknown","field":"sauceOrOil","foodId":"food-dish","severity":"medium","detail":"Présence d’huile ou de sauce possible mais non citée."} ; {"code":"composition_uncertain","field":"composition","foodId":"food-2","severity":"high","detail":"Identité des légumes trop vague pour NOVA et qualités."} ; {"code":"nutrition_unknown","field":"nutrition","foodId":null,"severity":"high","detail":"Fourchettes caloriques très larges faute de portions et de recette."} ; {"code":"nova_group_unknown","field":"novaGroup","foodId":"food-dish","severity":"low","detail":"Niveau de transformation de l’ensemble des restes non identifiable."}.
- Nutrition : énergie 230–900 kcal (probable 450 kcal); protéines 9–25 g (probable 15 g); glucides 34–112 g (probable 58 g); lipides 4–29 g (probable 9 g); fibres 1–13 g (probable 5 g); sucres 1–14 g (probable 4 g); sucres ajoutés 0–2 g (probable 0 g).

#### d11-snack · snack

- Entrée : aucune note · 1 image(s) synthétique(s) · mode photo only.
- Incertitudes prévues : food_identity_unknown, portion_unknown, brand_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

#### d11-dinner · dinner

- Entrée : Deux parts de pizza livrée; une photo de la boîte et une de l'assiette, garniture et huile difficiles à distinguer. · 2 image(s) synthétique(s) · mode photo and note.
- Incertitudes prévues : portion_unknown, sauce_or_oil_unknown, composition_uncertain.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

Dimensions du score :

| Dimension | Score | Statut | Couverture d’observation | Confiance | Valeur observée |
|---|---:|---|---:|---:|---|
| Variété | 41.72 | limited | 0.25 | 0.33 | 3 aliments · 3 groupes |
| Qualité alimentaire | 71.25 | limited | 0.16666666666666666 | 0.67 | 67% des aliments avec propriétés décrites |
| Sucre ajouté | 100 | limited | 0.25 | 0.33 | 0 |
| Exposition liquide / concentrée | 100 | limited | 0.25 | 0.7799999999999999 | 0 liquide · 0 concentré |
| Ultra-transformation | 100 | limited | 0.16666666666666666 | 0.835 | 1 |
| Couverture nutritionnelle | 100 | limited | 0.25 | 0.33 | 100 |
| Énergie | 75 | limited | 0.25 | 0.33 | 450 |

### 2026-09-12

Couverture du passage : 0/3 repas saisis conformes. Score : indisponible.

#### d12-breakfast · breakfast

- Entrée : Yaourt, une pomme et un peu de granola; cuillère non mesurée, pas de photo. · 0 image(s) synthétique(s) · mode note only.
- Incertitudes prévues : portion_unknown, brand_unknown.
- Statut : échec `response_schema_error` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

#### d12-lunch · lunch

- Entrée : Salade de pois chiches, concombre, tomate et pain; huile/citron probablement, proportions floues. · 1 image(s) synthétique(s) · mode photo and note.
- Incertitudes prévues : portion_unknown, sauce_or_oil_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

#### d12-dinner · dinner

- Entrée : aucune note · 1 image(s) synthétique(s) · mode photo only.
- Incertitudes prévues : food_identity_unknown, portion_unknown, sauce_or_oil_unknown.
- Statut : échec `provider_request` ; aliments, portions, catégories, transformation, sucre, qualité, nutrition et confiance indisponibles.

Dimensions du score : toutes indisponibles, car aucun repas conforme n’a atteint l’agrégation.

## Analyse transversale

### Cohérence et explicabilité

- Les neuf sorties conformes traversent bien la validation, l’agrégation et les sept dimensions sans exception locale.
- Tous les scores quotidiens obtenus sont `limited` (couverture 0,13 à 0,23). Leur valeur numérique, parfois élevée, est une renormalisation des seules dimensions observées, pas une note de journée complète.
- Les raisons et `strongestEffects` remontent les dimensions dominantes, mais l’interface doit toujours afficher le statut et la couverture avec la note pour éviter une fausse précision.

### Sensibilité aux repas manquants

- 29/38 repas analysables manquent à cause du fournisseur ou du schéma, auxquels s’ajoutent 10 créneaux volontairement absents dans le scénario.
- Avec un seul repas conforme dans la plupart des journées, retirer ce repas fait disparaître entièrement le score ; ajouter un repas peut donc déplacer brutalement note, couverture et dimensions.
- Aucun classement entre jours n’est défendable dans ce passage. Une journée à 86 avec 23 % de couverture n’est pas démontrée meilleure qu’une journée à 56 avec 18 %.

### Comparabilité entre journées

- Comparabilité insuffisante : les jours ne reposent ni sur le même nombre de repas, ni sur les mêmes modalités de saisie, ni sur une couverture homogène.
- La comparabilité deviendrait acceptable après un passage avec des images réalistes, une disponibilité fournisseur stable et un seuil commun de couverture complète ou quasi complète.

## Problèmes manifestes et recommandations

1. **Disponibilité de la chaîne** — 68 % des cas échouent en `provider_request`. Journaliser la cause technique non sensible (statut HTTP, délai, fournisseur tenté) et retenter avec une politique bornée.
2. **Compatibilité du contrat** — 3 réponses atteignent le fournisseur mais ne satisfont pas le schéma. Conserver en test les catégories exactes de validation et ajouter des fixtures de régression anonymisées.
3. **Note élevée avec faible couverture** — ne jamais montrer la note seule ; rendre `limited` et la couverture aussi saillants que le nombre, voire masquer le classement sous un seuil produit explicite.
4. **Photos non représentatives** — refaire le même protocole avec des images synthétiques réalistes ou libres de droits. Les pixels minimaux n’évaluent pas la reconnaissance visuelle.
5. **Repas absents** — distinguer explicitement « repas sauté », « non saisi » et « analyse en échec » avant d’interpréter une journée.
6. **Algorithme** — aucun changement effectué. La double influence potentielle de `foodListCoverage` et la renormalisation des dimensions partielles demandent un test numérique ciblé avant toute correction.

## Reproduction

Ce document et les résultats versionnés associés sont un instantané historique. Les nouvelles exécutions restent locales afin qu’un test fournisseur ne modifie plus le dépôt.

```bash
pnpm test:live:meal-balance
node scripts/render-meal-balance-realistic-report.mjs
```

Les nouvelles sorties brutes, le bilan machine et le rapport sont créés dans `analysis/private/meal-balance-realistic-live/`, ignoré par Git. Les variables fournisseur proviennent de l’environnement local et ne sont jamais écrites dans ces fichiers.

## Limites

- Un seul passage temporel du fournisseur ; il mesure aussi sa disponibilité à cet instant.
- Seulement neuf réponses conformes, donc aucune conclusion nutritionnelle représentative sur les 12 jours.
- Les notes textuelles sont réalistes mais synthétiques ; les images ne représentent pas les repas.
- Pas de session authentifiée, de base de données, d’interface ou de production modifiée.
