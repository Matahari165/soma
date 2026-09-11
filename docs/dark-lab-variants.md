# Personal Lab — Observatoire local

Aperçu : `SOMA_LOCAL_PREVIEW=true node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000`.

Deux bandeaux sont proposés : Orbites (géométrie animée) et Radar (sommeil, récupération, effort et calories). Le radar compare les mesures à des repères de démonstration explicitement affichés, pas aux objectifs personnels enregistrés. Une mesure absente reste absente et empêche de fermer le polygone.

Le parcours reste continu : accueil, mesures, Journal et Repas, puis Strongest Effects. La navigation persistante donne accès aux autres pages. Les saisies ne sont pas démontées au changement de bandeau.

Les surfaces et contrôles Observatoire sont noirs et sans contours. Chaque repas vide propose une note et un bouton Photo ouvrant le choix appareil photo / bibliothèque. Le déjeuner de démonstration est confirmé, sans photo inventée, et présente 823 kcal ainsi que les macronutriments. Le détail des ingrédients et de l’analyse reste dépliable. Cet exemple est réservé à l’utilisateur local de démonstration.

Les composants de géométrie et de radar sont distincts ; les formulaires et graphiques existants sont réutilisés. `observatory-deep.css` porte les règles finales. Les animations utilisent CSS et IntersectionObserver, avec défilement natif et respect de `prefers-reduced-motion`. Aucun déploiement.

## Affinement du radar

Radar est désormais le bandeau par défaut. Une seule navigation précède le titre et sa date ; les métriques répétées et les pourcentages séparés ont été retirés. Les flèches comparent chaque valeur à sa moyenne sur 30 jours (égalité : ↔, moyenne absente : aucune flèche). Les objectifs de démonstration sont accessibles dans les libellés du graphique. Le radar conserve la proportion visuelle de réalisation.

La palette et les contrôles sont monochromes. Les effets conservent leurs couleurs sémantiques sur une piste blanche couvrant leur axe. Le titre se dévoile ligne par ligne et se retire au défilement ; la réduction des animations reste respectée.
