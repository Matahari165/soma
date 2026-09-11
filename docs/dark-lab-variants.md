# Variantes sombres de Personal Lab

Cette note documente une exploration locale de cinq variantes sombres pour la page Personal Lab. Elle décrit le branchement prévu et les points d’intégration observés dans le projet ; elle ne constitue pas une validation d’une nouvelle direction globale et ne remplace pas `DESIGN.md`.

## Aperçu local

Depuis la racine de Soma, lancer le serveur de comparaison avec :

```bash
SOMA_LOCAL_PREVIEW=true node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000
```

Ouvrir ensuite [http://127.0.0.1:3000/](http://127.0.0.1:3000/). Le mode `SOMA_LOCAL_PREVIEW` est accepté uniquement hors production (`NODE_ENV !== "production"`). Il utilise l’utilisateur et les données d’exemple du preview local ; les routes et les interactions de l’application restent celles du code existant.

Le garde-fou de production est porté par `isLocalPreviewMode()` dans `src/lib/env.ts`. Le switcher et l’attribut `data-lab-theme` ne sont rendus par le layout que lorsque ce mode est actif. Les variantes ne sont donc pas un réglage persistant du produit et ne doivent pas être interprétées comme une préférence utilisateur.

## Variantes

| ID | Nom affiché | Palette effective (`canvas` / `surface` / `primary` / `accent`) | Densité effective |
| --- | --- | --- | --- |
| `graphite` | Graphite | `#141619` / `#1c1f23` / `#eceeef` / `#c3d0dc` | Cartes 18 px, écart principal 20 px, page 24 px, titre 580 |
| `obsidian` | Obsidienne | `#090a0b` / `#131516` / `#f0f1ef` / `#e4e6e3` | Page 32 px, colonne Effets plus large (`1.25fr`), titre 500 |
| `slate` | Ardoise | `#141b25` / `#1c2633` / `#e7eef7` / `#b0c9eb` | Cartes 16 px, page 20 px, titre 650, valeurs métriques 22 px |
| `mineral` | Minéral | `#212724` / `#2a322d` / `#e8ede5` / `#c2d1b9` | Cartes 22 px, page 28 px, panneau Effets 16 px, titre 500 |
| `ink` | Encre | `#1b1918` / `#262321` / `#f0e8df` / `#d7c5ab` | Page 24 px, titre 520 ; titre Effets 26 px et métriques en sans |

Toutes les variantes utilisent le même ensemble de rôles secondaires et sémantiques défini dans `src/app/dark-lab-preview.css` : surfaces intermédiaires, bordures, texte secondaire, signal, erreur, avertissement et information. Les valeurs de ces rôles changent selon la palette. Les différences de densité servent la comparaison de lecture et d’espace, pas une nouvelle architecture de page.

Les noms et IDs sont définis par `src/components/lab/dark-theme-switcher.tsx`. Le bouton actif expose son état avec `aria-pressed`; le changement modifie `document.documentElement.dataset.labTheme` sans remonter le workspace.

## Correspondance avec la page existante

La page d’accueil authentifiée est `src/app/page.tsx`. Les variantes s’appliquent à la composition existante :

| Zone | Composant ou sélecteur existant | Rôle conservé |
| --- | --- | --- |
| En-tête | `PersonalLabOverviewSection`, `.lab-header`, `.lab-header__row` | Titre Personal Lab et contexte du jour |
| Bloc métrique | `PersonalLabMetrics`, `.personal-lab-metrics`, `.personal-lab-metric` | Sommeil, récupération, effort et énergie avec historique court |
| Effets | `StrongestEffectsPanel`, `.strongest-effects-panel`, `.strongest-effects` | Associations fiables, période sélectionnée et ouverture d’un détail |
| Sélecteur de date partagé | `PersonalLabDateStrip`, `.personal-lab-day-strip` | Même date pour le journal et les repas |
| Saisie du journal | `DailyJournal`, `.journal-card--personal-lab`, `.journal-field`, `.journal-choice`, `.journal-number` | Brouillon, validation, choix, échelles et valeurs numériques |
| Repas | `MealJournal` en variante `lab`, `.personal-lab-meal-column`, `.meal-journal-lab` | Capture et historique des repas, nutrition et états de chargement/erreur |
| Switcher local | `DarkThemeSwitcher`, `.dark-theme-switcher`, `[data-theme-option]` | Comparaison manuelle des cinq palettes |

La structure de données reste dans `createPersonalLabStream()` et, en preview, dans `previewData()` de `src/services/personal-lab.ts`. `StrongestEffectsPanel` charge ses périodes via `/api/lab/matrix?period=15|30|90|all`; le thème ne doit pas changer ce flux.

## Points de lecture CSS

Les tokens partagés commencent dans `src/app/globals.css` avec `--lab-canvas`, `--lab-surface`, `--lab-border`, `--lab-text-primary`, `--lab-text-secondary`, `--lab-brand`, `--lab-signal` et les couleurs sémantiques. Les alias historiques (`--canvas`, `--paper`, `--ink`, `--line`, `--moss`, etc.) sont dérivés de ces tokens afin que les composants existants suivent la palette.

La composition Personal Lab est principalement resserrée par `src/app/personal-lab.css`. Les règles de `Strongest Effects` sont dans `src/app/components.css`, autour de `.strongest-effects-panel` et `.strongest-effects`. Les variantes conservent les rayons de surface de 4 px, les contrôles existants, les états sélectionnés, les valeurs absentes, les erreurs et le focus clavier.

À partir de 1200 px, la page devient une grille : `Strongest Effects` occupe la colonne gauche et le workspace journal/repas la colonne droite. Le panneau Effets est borné à 660 px de haut avec défilement vertical interne ; son en-tête reste visible pendant ce défilement. Dans le workspace, le journal et les repas restent côte à côte (`1.1fr` / `.9fr`). Sous 1200 px, la page repasse en colonne ; à 600 px, le panneau Effets est borné à 420 px et le journal devient une seule colonne. Les règles responsive de `src/app/responsive.css` restent actives pour `1440 × 900`, `390 × 844` et les largeurs intermédiaires.

La feuille locale des variantes est importée en dernier depuis `src/app/layout.tsx` afin que ses valeurs de tokens et ses exceptions de surface puissent surcharger les valeurs claires existantes. Les couleurs en dur présentes dans les styles Personal Lab sont traitées par les exceptions de cette feuille lorsqu’elles ne suivent pas les tokens.

## Vérifications connues

Les vérifications déjà rapportées pour cette exploration sont : types et lint passés ; saisie WHM avec `+1` conservée ; note conservée ; changement vers la période de 30 jours fonctionnel ; aucun débordement horizontal observé sur desktop.

La preuve disponible ne comprend pas de build de production ni de vérification sur iPhone physique. Le comportement des données, les flux d’API et les interactions restent ceux du preview local ; cette note ne constitue pas une preuve de déploiement.

## Limites de l’exploration

Le sélecteur est prévu pour la comparaison du Personal Lab en preview local. Un changement de route côté client conserve l’état du layout ; un rechargement complet revient à `graphite`. Cette note ne valide aucune publication, déploiement, modification de données ou adoption d’une variante comme thème produit.
