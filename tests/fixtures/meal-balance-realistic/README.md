# Fixture synthétique `meal-balance-realistic-12d`

Ce fixture décrit 12 journées fictives de saisie de repas pour tester le
chemin réel d'analyse alimentaire de Soma. Il ne contient aucune donnée
personnelle, aucune réponse de fournisseur et aucun résultat nutritionnel
attendu.

## Fichier et contrat

[`dataset.json`](./dataset.json) contient deux niveaux :

- `entries[].input` reprend le contrat de `MealVisionInput` : `mealType`,
  `mealDate`, `note` et `images`;
- `dailyCoverage` et `coverageExpectation` décrivent les créneaux planifiés,
  les absences et la qualité de la capture. Ce sont des assertions de
  couverture de la source, pas des scores ni des prédictions du modèle.

`entryId` et `captureMetadata` servent uniquement au harnais de test. Dans une
entrée `input.images`, `dataRef` remplace volontairement le binaire : le test
doit le convertir en `ArrayBuffer` déterministe au bord du fournisseur, par
exemple avec quelques octets synthétiques. Cela permet de tester la construction
de la requête sans stocker d'image ni appeler un fournisseur externe. Les id,
types MIME et origines des images restent ceux que le chemin réel transmet.

Le fixture est donc une source d'entrées brutes. Pour tester
`aggregateConfirmedMeals` ou `calculateMealBalanceScore`, le harnais doit
explicitement fournir ses propres sorties d'analyse simulées; il ne doit pas
les ajouter à ce fichier.

## Couverture intentionnelle

- 12 dates consécutives, avec petit-déjeuner, déjeuner, collation facultative
  et dîner planifiés chaque jour;
- 38 créneaux enregistrés et 10 absents (dont plusieurs déjeuners/dîners,
  pas seulement des collations);
- 26 repas avec photo et 12 sans photo; 28 avec note et 10 sans note;
- 16 photo + note, 10 photo seule, 12 note seule;
- 3 entrées multi-photos pour vérifier qu'elles restent un seul repas;
- notes volontairement courtes et imparfaites : « environ », portions à l'œil,
  sauce cachée, marque inconnue, photo sombre ou composition incertaine;
- plusieurs origines réellement préparées/achetées et mixtes, sans les
  requalifier en fait-maison.

Les valeurs de `coverageExpectation` sont vérifiables en recomptant le JSON;
elles ne décrivent pas la qualité d'une future analyse.
