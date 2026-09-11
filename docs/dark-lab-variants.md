# Cinq mondes sombres du Personal Lab

Cette exploration est locale et comparative. Elle conserve les composants, les données et les interactions du Personal Lab ; elle ne choisit pas un thème produit et ne remplace pas `DESIGN.md`.

## Preview local

Depuis la racine de Soma :

```bash
SOMA_LOCAL_PREVIEW=true node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3000
```

Ouvrir [http://127.0.0.1:3000/](http://127.0.0.1:3000/). Le preview est autorisé hors production par `isLocalPreviewMode()` ; il utilise l’utilisateur et les données de démonstration prévues pour cet environnement.

`DarkThemeSwitcher` modifie `document.documentElement.dataset.labTheme`. Le changement de monde se fait sans remonter le workspace et ne constitue pas un réglage persistant.

## Architecture commune

`LabWorldPreview` attend les snapshots `overview` et `journal`, puis passe trois slots `ReactNode` à `LabWorldWorkspace` : `metrics`, `effects` et `capture`. Le workspace rend quatre enfants directs dans `.lab-world` :

| Slot | Contenu conservé |
| --- | --- |
| `.lab-world__header` | Personal Lab, date, raccourcis Effets/Journal/Repas et onglets de vue |
| `.lab-world__metrics` | `PersonalLabMetrics` : Sommeil, Récupération, Effort, Énergie |
| `.lab-world__effects` | `StrongestEffectsPanel`, périodes, groupes et détail sélectionné |
| `.lab-world__capture` | `PersonalLabJournalWorkspace`, navigation de date, journal et repas |

Les composants restent montés lorsque Focus masque une zone avec `data-workspace-view`. L’état de sélection de vue, du journal, des repas et des effets n’est donc pas recréé lors du changement d’onglet ou de monde.

## Mondes

| ID | Composition réelle | Voix visuelle |
| --- | --- | --- |
| `observatory` | Grille desktop en trois zones : rail métrique vertical à gauche, lecture centrale des effets, capture étroite à droite avec journal puis repas. | Graphite précis, dense et borderless ; les raccourcis de repas restent accessibles dans l’en-tête. |
| `strata` | Bandes horizontales empilées : métriques en rangée, groupes `.strongest-effects__group` en grille, capture pleine largeur avec journal et repas côte à côte. | Ardoise minérale, séparateurs fins et lecture en strates. |
| `index` | Ledger analytique en une colonne : métriques alignées, effets en lignes structurées, puis workbench de capture partagé. | Index sombre, typographique et mesuré. |
| `atelier` | Desktop en split : contenu éditorial à gauche, rail métrique à droite, effets dans une surface mate, capture pleine largeur en dessous. | Studio mat, plus tactile, avec surfaces 4 px. |
| `focus` | Canvas unique sans sidebar ; les onglets Effets, Journal et Repas contrôlent la zone visible tout en conservant les composants montés. | Focus calme, navigation fonctionnelle et densité de travail. |

Les compositions `observatory` et `strata` sont dans `src/app/lab-worlds-observatory-strata.css`. `index`, `atelier` et `focus` sont répartis entre `src/app/lab-worlds-index-atelier.css` et `src/app/dark-lab-preview.css`. Les feuilles sont importées après les styles communs dans `src/app/layout.tsx`.

## Données et états

Chaque métrique reçoit exactement les cinq observations récentes de `PersonalLabOverview.today.history`. Les valeurs `null` interrompent le tracé SVG `MetricHistoryTrace` au lieu de devenir zéro. Strata et Atelier affichent ce tracé sur toute la largeur de leur métrique et masquent les anciennes barres ; les autres mondes gardent les barres existantes.

Les états de chargement, vide, erreur, sélection de période et détail viennent des composants existants. Le journal conserve ses brouillons et validations ; les repas conservent capture, historique, nutrition et états de chargement/erreur. Cette note décrit le branchement local et ne constitue pas une vérification finale, une preuve de build, de déploiement ou d’appareil physique.

## Fichiers de référence

- `src/components/lab/lab-world-workspace.tsx` : wrapper et état des onglets.
- `src/components/lab/lab-world-preview.tsx` : composition des slots avec les composants réels.
- `src/components/lab/dark-theme-switcher.tsx` : IDs et bascule locale des cinq mondes.
- `src/components/lab/today-signals.tsx` et `src/components/lab/metric-history-trace.tsx` : métriques et historique SVG.
- `src/services/personal-lab.ts` : snapshots, historique de cinq jours et sémantique `null`.
