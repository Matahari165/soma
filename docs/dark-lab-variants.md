# Personal Lab — trois propositions locales

Aperçu : `SOMA_LOCAL_PREVIEW=true node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000`.

Le mode est limité au développement local et emploie les données de démonstration existantes. Aucun changement de la page authentifiée de production.

## Parcours continu

L’accueil, les mesures du jour, le Journal, les Repas et Strongest Effects restent tous montés dans une même page. Le défilement natif est la navigation principale ; les ancres permettent de rejoindre directement une section. Aucun second écran ni clic obligatoire pour révéler les formulaires.

- Observatoire : introduction et mesures réparties en colonnes, saisies côte à côte.
- Index : entrée compacte et registre dense, saisies en proportions différentes.
- Focus : Journal et Repas dans un rail horizontal natif, accessible par glissement ou par les ancres.

Les corrélations terminent chaque parcours. Les dates et les valeurs saisies sont partagées et conservées au changement de thème.

## Composants

`LabWorldWorkspace` orchestre `LabArrival`, les métriques existantes, `PersonalLabJournalWorkspace` et `StrongestEffectsPanel`. La hiérarchie des actions photo est définie dans `meal-journal.module.css`, exclusivement pour le mode local sombre.

Les cinq valeurs historiques des graphiques proviennent du même jeu de données que les barres. Les valeurs manquantes interrompent le tracé ; elles ne sont pas remplacées par zéro.

`lab-continuous.css` contient les règles communes et les animations liées au défilement. `lab-continuous-worlds.css` contient les compositions propres aux trois variantes. Les SVG sont déterministes, sans bibliothèque ajoutée. Les animations de défilement sont une amélioration progressive ; sans support, le contenu reste intégralement accessible. `prefers-reduced-motion` désactive les mouvements.

Les polices système Iowan Old Style, Georgia, Helvetica Neue et SFMono constituent des essais locaux intentionnels. Le design system de production reste inchangé.

## Sélection affinée

Observatoire, Index et Focus sont les trois choix actifs. `lab-final-*.css` différencie leurs palettes, métriques, dates, boutons, saisies et graphiques. Les anciennes variantes ne sont plus proposées.

`LabGlobalNavigation` reste disponible sur toutes les pages de l’aperçu. `useLabTheme` synchronise la sélection et la page, y compris après un aller-retour vers Sommeil. Focus fournit des boutons de déplacement en plus du glissement natif.

Les apparitions au chargement et au défilement utilisent opacity/transform via CSS et IntersectionObserver : montée Observatoire, translation Index, fondu avec échelle Focus. Les tracés s’animent à leur entrée. Les formulaires ne sont jamais masqués en attente d’une animation. Le réglage de réduction des animations est respecté.
