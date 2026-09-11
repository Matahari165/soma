---
name: Soma
description: Un laboratoire personnel vivant pour saisir le quotidien et révéler les effets les plus importants.
colors:
  canvas: "#f4f6f2"
  surface: "#ffffff"
  surface-subtle: "#f2f5f0"
  surface-selected: "#e8f0e6"
  border: "#e0e8de"
  text-primary: "#1c2520"
  text-secondary: "#59665e"
  brand: "#264d38"
  signal: "#2e7a4f"
  error: "#c45442"
  sidebar: "#ebf0ea"
typography:
  display:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "clamp(2.35rem, 5vw, 5rem)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "clamp(1.6rem, 3vw, 2.5rem)"
    fontWeight: 560
    lineHeight: 1.1
  body:
    fontFamily: "Schibsted Grotesk, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  data:
    fontFamily: "Azeret Mono, monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  xs: "2px"
  sm: "4px"
  md: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
    rounded: "{rounded.sm}"
    height: "44px"
    padding: "10px 16px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    height: "44px"
    padding: "10px 16px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface-subtle}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xs}"
    height: "44px"
    padding: "10px 12px"
---

# Design System: Soma

## Overview

**Creative North Star: "Le laboratoire personnel vivant"**

Soma ressemble à un instrument personnel utilisé chaque jour, pas à un logiciel hospitalier ni à un dashboard SaaS. Sa précision vient de l’alignement, des unités, des repères temporels et de la hiérarchie des preuves. Sa chaleur vient de surfaces claires légèrement minérales, d’un vert profond et d’un langage direct adressé à une seule personne.

Le système global est celui de `Personal Lab / Stitch / FINAL`. `Meals / Redesign V1` en est la déclinaison pour `/meals`. Les styles antérieurs de l’Atlas physiologique sont un héritage à migrer, jamais une seconde direction valide.

La hiérarchie produit culmine dans `Strongest Effects`. Le journal et les repas rendent la donnée possible ; Sommeil, Récupération et Effort donnent le contexte ; les effets les plus forts livrent la compréhension recherchée.

**Key Characteristics:**

- Dense, calme et immédiatement scannable.
- Grille nette, surfaces plates et variations tonales légères.
- Couleur réservée à un rôle, une source ou un signal.
- Nombres, périodes et unités traités comme des annotations de laboratoire.
- Détails et preuves ouverts depuis une synthèse courte.

## Colors

La palette est froide, végétale et minérale : blanc doux, gris-vert clair et vert forêt. Les accents restent rares afin que les variations et alertes conservent leur poids.

### Primary

- **Vert laboratoire** (`#264d38`) : marque, action principale et sélection forte.
- **Vert signal** (`#2e7a4f`) : évolution favorable ou signal positif, jamais seul pour transmettre le sens.

### Neutral

- **Toile minérale** (`#f4f6f2`) : fond global.
- **Surface claire** (`#ffffff`) : panneaux et données prioritaires.
- **Surface subtile** (`#f2f5f0`) : regroupements secondaires et contrôles.
- **Surface sélectionnée** (`#e8f0e6`) : date ou option active.
- **Encre végétale** (`#1c2520`) : texte principal.
- **Encre secondaire** (`#59665e`) : métadonnées, avec contraste suffisant.
- **Bordure minérale** (`#e0e8de`) : séparation courante.

### Tertiary

- **Rouge alerte** (`#c45442`) : erreur ou évolution défavorable, toujours accompagné d’un texte ou symbole.

### Named Rules

**The Evidence Color Rule.** Une couleur porte une source, un état ou une direction ; elle ne remplit jamais une surface sans fonction.

**The Latest Layer Rule.** Les tokens `--lab-*` et les frames Stitch validées sont l’autorité. Les anciens tokens chauds sont des compatibilités temporaires, pas une palette à étendre.

## Typography

**Display Font:** Schibsted Grotesk (system-ui en repli)  
**Body Font:** Schibsted Grotesk (system-ui en repli)  
**Data Font:** Azeret Mono (monospace en repli)

Schibsted donne une voix contemporaine, sobre et humaine. Azeret Mono distingue les données, dates, unités et preuves sans transformer toute l’interface en terminal. Newsreader et Geist ne font pas partie du système tant qu’ils ne sont pas réellement chargés et validés.

### Hierarchy

- **Display** (`500`, jusqu’à `5rem`) : rares titres de contexte, jamais au détriment du contenu utile dans le premier écran.
- **Headline** (`560`, `1.6–2.5rem`) : titres de page et de section principale.
- **Title** (`560–650`, `16–20px`) : cartes, relations et groupes de journal.
- **Body** (`400`, `16px`, hauteur `1.55`) : explications et contenu de travail.
- **Data** (`500–650`, minimum fonctionnel `12px`) : unités, périodes, valeurs et petites actions. Les micro-labels non interactifs peuvent descendre à `11px` si leur contraste est suffisant.

**The Readable Instrument Rule.** Une apparence technique ne justifie jamais un texte fonctionnel de 10 px ou moins.

## Layout

La grille dense s’aligne sur un rail desktop de `64px`. Les sections principales suivent un rythme de `24px`, avec `32px` entre colonnes. Les panneaux utilisent généralement `24px` de padding et partagent des frontières nettes.

Le premier écran montre la saisie quotidienne et la compréhension la plus importante sans défilement inutile. `Strongest Effects` reçoit plus d’espace et de contraste hiérarchique que les résumés secondaires. Repas et journal présentent une action principale avant les contrôles détaillés.

Sous `1100px`, les grandes zones peuvent s’empiler et la navigation devient compacte. Sous `700px`, la composition passe en une colonne, les bandes temporelles restent parcourables et les métriques secondaires utilisent la divulgation progressive. La cible mobile est `390 × 844`.

Les hauteurs artificielles destinées seulement à égaliser des colonnes sont interdites lorsqu’elles créent du vide.

## Elevation & Depth

Soma est plat par défaut. La profondeur vient des bordures, des différences tonales et de la superposition. Une ombre de `0 1px 2px rgba(28, 37, 32, .04)` peut détacher un panneau interactif ; les grandes ombres décoratives sont exclues.

**The Flat Evidence Rule.** Une donnée gagne en importance par sa place, sa taille et son libellé, pas par une ombre spectaculaire.

## Shapes

La géométrie est compacte et presque rectangulaire. Les rayons sont `2px`, `4px` et `8px`. Contrôles et cartes utilisent prioritairement `4px`; `8px` est réservé aux grands conteneurs. Les cercles sont réservés aux avatars, anneaux de score et actions explicitement rondes.

Les bordures de `1px` structurent les données. Éviter les séries de cartes identiques : regrouper ou utiliser une séparation de grille quand plusieurs éléments servent la même lecture.

## Components

### Buttons

- **Shape:** rectangle compact, rayon `4px`, cible tactile `44px`.
- **Primary:** vert laboratoire sur surface claire ; une seule action dominante par zone.
- **Hover / Focus:** contraste renforcé et contour visible de `2px` avec offset `3px`.
- **Secondary:** surface claire ou transparente, bordure minérale et texte principal.
- **Danger:** rouge alerte, libellé explicite et confirmation proportionnée.

### Cards / Containers

- **Corner Style:** `4px` par défaut, `8px` pour un grand panneau.
- **Background:** blanc ou surface subtile.
- **Shadow Strategy:** aucune au repos, sauf séparation structurelle légère.
- **Border:** `1px solid #e0e8de`.
- **Internal Padding:** `16px` pour un petit groupe, `24px` pour un panneau principal.

### Inputs / Fields

- **Style:** fond subtil, rayon `2–4px`, libellé toujours visible.
- **Focus:** contour vert foncé visible ; ne jamais dépendre d’une couleur seule.
- **Error / Disabled:** message adjacent, état annoncé et action désactivée perceptible.

### Navigation

Le rail desktop est compact et iconographique, mais chaque destination conserve un nom accessible et un tooltip lorsque replié. L’état actif combine traitement visuel et `aria-current`. Sur mobile, les destinations essentielles restent directement accessibles.

### Strongest Effects

Composant signature et sommet de la hiérarchie. Il montre d’abord les associations corrigées et suffisamment étayées, dans une formulation concrète, puis ouvre période, échantillon, incertitude, chronologie, forme, provenance et méthode. Il ne présente jamais une association comme une causalité.

### Daily Journal and Meals

La saisie quotidienne est rapide, autosauvegardée et non culpabilisante. Un état vide invite à agir sans répéter les boutons. Brouillon, validé, ignoré, absent et zéro explicite restent visuellement et sémantiquement distincts.

## Do's and Don'ts

### Do:

- **Do** donner à `Strongest Effects` la hiérarchie principale de Personal Lab.
- **Do** montrer unité, période, couverture et incertitude près du résultat concerné.
- **Do** appliquer la même grille, les mêmes rayons et la même palette sur toute l’app.
- **Do** préserver les états normal, chargement, vide, erreur, partiel et obsolète.
- **Do** vérifier chaque changement à `1440 × 900` et `390 × 844`.

### Don't:

- **Don't** réintroduire l’ancienne palette chaude ou les rayons `10px` comme une seconde direction.
- **Don't** afficher de grands titres décoratifs, des sous-titres évidents ou des cartes répétitives.
- **Don't** descendre les actions, valeurs ou libellés fonctionnels sous `12px`.
- **Don't** utiliser la couleur seule pour distinguer une évolution, une source ou un statut.
- **Don't** transformer une absence en zéro ou une corrélation en causalité.
- **Don't** mélanger français et anglais sur une même surface.
