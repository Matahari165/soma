# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Soma est pour le moment un outil personnel conçu pour Jérémy. Il l’utilise pour consigner son quotidien et comprendre ses propres relations entre comportements, alimentation et signaux physiologiques. Aucun besoin d’équipe, de partage ou de rôles multiples n’est confirmé.

## Product Purpose

Soma permet chaque jour de renseigner agréablement les repas et les habitudes du journal, puis de rapprocher ces observations des données importées depuis Google Health. L’application analyse le sommeil, la récupération et l’effort, et met en évidence les associations personnelles les plus utiles.

Le cœur du produit est `Strongest Effects` : cette vue rend visibles les relations les plus importantes entre les variables du journal, les repas, les variables mesurées par un bracelet et les résultats physiologiques. Une session réussie permet de saisir rapidement la journée, de voir la qualité et la couverture des données, puis de comprendre quelles variables sont associées aux meilleurs ou moins bons jours.

## Positioning

Soma est un laboratoire personnel vivant, pas un tableau de bord de santé générique. Sa différence est l’analyse intra-individuelle : il compare les habitudes et signaux d’une même personne dans le temps, avec plusieurs décalages temporels et fenêtres d’analyse.

Les calculs statistiques sont déterministes. L’IA peut expliquer des résultats déjà calculés ou analyser un repas dans un cadre structuré, mais elle ne doit ni fabriquer une donnée ni transformer une association en causalité. Soma est un outil de bien-être et d’auto-observation, pas un dispositif médical.

## Operating Context

- Usage personnel quotidien, principalement sur ordinateur avec accès mobile complet.
- Saisie manuelle des habitudes dans un journal autosauvegardé.
- Ajout des repas par photo et/ou note, puis revue et confirmation de l’analyse.
- Import optionnel et révocable de données Google Health.
- Consultation de `Strongest Effects`, des relations détaillées et des vues Sommeil, Récupération et Effort.
- Utilisation du Coach pour interroger les données ; toute action d’écriture proposée par le Coach demande une confirmation explicite.
- Mode local avec données de démonstration clairement signalé.

## Capabilities and Constraints

- Routes principales : Personal Lab (`/`), Repas (`/meals`), Sommeil (`/sleep`), Récupération (`/recovery`), Effort (`/activity`), Coach (`/coach`) et Réglages (`/settings`).
- Le journal accepte des variables booléennes, numériques, temporelles, catégorielles et graduées ; les mesures peuvent être créées, réordonnées ou archivées sans perdre leur historique.
- Seuls les jours validés entrent dans l’analyse des relations. Les jours validés peuvent être corrigés et recalculés.
- Les relations peuvent couvrir 15, 30, 90 jours ou tout l’historique et distinguer le même jour, le lendemain et deux jours plus tard.
- Les résultats peuvent inclure taille d’échantillon, intervalle de confiance, correction des comparaisons multiples, seuil, plateau ou zone favorable/défavorable.
- Les données issues d’une source de santé doivent rester distinguées des métriques calculées par Soma.
- Une absence de donnée reste absente : elle ne devient ni zéro ni « Non ». Un zéro explicite reste une donnée.
- Les agrégations nutritionnelles utilisent uniquement les repas confirmés. Photo et note du jour priment sur les recettes personnelles indicatives.
- Les imports peuvent être partiels, obsolètes ou interrompus ; l’interface doit rendre la couverture et la fraîcheur visibles.
- Google Health et Google Calendar sont optionnels et révocables. La déconnexion ne supprime pas implicitement l’historique déjà importé.
- Les données personnelles et secrets ne doivent jamais apparaître dans le code, Git, les journaux techniques ou les réponses.
- Les APIs de programmes d’entraînement existent, mais leur statut comme fonctionnalité visible reste une décision ouverte.

## Brand Commitments

- Nom : Soma.
- Boussole créative : **Le laboratoire personnel vivant**.
- Ton : calme, précis, personnel, factuel et non culpabilisant.
- L’interface doit rester compacte, dense, lisible et facile à parcourir.
- `Personal Lab / Stitch / FINAL` est l’autorité visuelle globale.
- `Meals / Redesign V1` est la déclinaison validée de ce système pour `/meals`.
- `Strongest Effects` est la partie la plus importante de l’application et doit recevoir la hiérarchie correspondant à ce rôle.
- Éviter les grands titres décoratifs, les cartes répétitives, les dégradés gratuits, les textes évidents et l’esthétique générique des dashboards de santé.

## Evidence on Hand

- `README.md` et `PERSONAL_LAB.md` décrivent le produit et les règles d’analyse.
- `src/app`, `src/components`, `src/domain` et `src/integrations` contiennent les parcours, états, calculs et intégrations actuels.
- Les écrans Figma validés `Personal Lab / Stitch / FINAL` et `Meals / Redesign V1` constituent les références visuelles nommées par l’utilisateur.
- Les données réelles, validations utilisateurs externes, témoignages, benchmarks et résultats médicaux ne sont pas des preuves disponibles et ne doivent pas être inventés.

## Product Principles

1. Faire de la saisie quotidienne une action rapide, claire et agréable.
2. Donner la priorité aux effets personnels les plus forts, puis permettre d’ouvrir leurs preuves et détails.
3. Montrer unités, période, couverture, taille d’échantillon et incertitude sans fabriquer de précision.
4. Préserver la distinction entre absence, zéro explicite, brouillon, jour ignoré et donnée validée.
5. Garder les données personnelles privées et laisser à Jérémy le contrôle de la connexion, de l’export et de la suppression.

## Accessibility & Inclusion

- Cibles de conception et de vérification : MacBook Air `1440 × 900`, iPhone `390 × 844` et largeurs intermédiaires utiles.
- Navigation clavier, focus visible, libellés accessibles, annonces de chargement/erreur et zones tactiles suffisantes sont obligatoires.
- L’information ne doit jamais dépendre uniquement de la couleur.
- Les graphiques doivent avoir une lecture visuelle interprétable et une alternative textuelle accessible.
- L’interface doit adopter une langue visible cohérente ; le mélange français/anglais actuel est une dette à résoudre.
- Aucun audit complet avec lecteur d’écran, zoom 200 % ou appareil physique n’est encore établi comme preuve globale.
