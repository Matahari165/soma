# Personal Lab — Observatoire local

Aperçu : `SOMA_LOCAL_PREVIEW=true node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000`.

Deux bandeaux sont proposés : Orbites (géométrie animée) et Radar (sommeil, récupération, effort et calories). Le radar compare les mesures à des repères de démonstration explicitement affichés, pas aux objectifs personnels enregistrés. Une mesure absente reste absente et empêche de fermer le polygone.

Le parcours reste continu : accueil, mesures, Journal et Repas, puis Strongest Effects. La navigation persistante donne accès aux autres pages. Les saisies ne sont pas démontées au changement de bandeau.

Les surfaces et contrôles Observatoire sont noirs et sans contours. Chaque repas vide propose une note et un bouton Photo ouvrant le choix appareil photo / bibliothèque. Le déjeuner de démonstration est confirmé, sans photo inventée, et présente 823 kcal ainsi que les macronutriments. Le détail des ingrédients et de l’analyse reste dépliable. Cet exemple est réservé à l’utilisateur local de démonstration.

Les composants de géométrie et de radar sont distincts ; les formulaires et graphiques existants sont réutilisés. `observatory-deep.css` porte les règles finales. Les animations utilisent CSS et IntersectionObserver, avec défilement natif et respect de `prefers-reduced-motion`. Aucun déploiement.
