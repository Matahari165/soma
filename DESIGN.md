---
name: Soma — Observatoire
status: canonical
scope: visual-language
referenceRoute: "/"
lastReviewed: "2026-09-12"
---

# Soma — système visuel de l’Observatoire

## 1. Autorité

Ce fichier est la référence visuelle canonique de Soma. Il formalise le langage de la page principale authentifiée, l’**Observatoire**, afin que toute nouvelle page appartienne clairement au même produit.

Avant de créer, modifier ou évaluer une interface : lire ce fichier en entier, inspecter la page `/` réellement rendue, réutiliser les tokens et composants existants, puis vérifier à `1440 × 900` et `390 × 844`.

Ordre d’autorité en cas de désaccord :

1. la page `/` authentifiée actuellement validée ;
2. les règles obligatoires de ce document ;
3. les tokens `--lab-*` de `src/app/globals.css` ;
4. les anciennes pages et documentations.

`design/PHYSIOLOGICAL_ATLAS.md` est historique. Son thème clair, ses couleurs chaudes et ses rayons de 10 px ne doivent pas être réintroduits.

## 2. Principe fondamental

**Toutes les pages partagent le même langage visuel ; leur composition peut varier.**

Sont communs et non négociables : typographie, palette, formes, densité, composants, états, interactions, qualité du mouvement et voix éditoriale.

Peuvent varier : ordre de lecture, grille, position des blocs, type de graphique, relation synthèse/détail et degré de comparaison ou d’exploration. Une page peut présenter les données d’une manière entièrement différente sans jamais ressembler à un autre produit.

## 3. Intention artistique

**Étoile polaire : un observatoire personnel, nocturne et silencieux, dans lequel les traces du corps deviennent lisibles.**

Soma n’est ni un dashboard SaaS, ni une interface médicale froide, ni une application de bien-être colorée. C’est un instrument personnel : précis, calme, discret et éditorial.

Adjectifs directeurs : calme, minimal, nocturne, mat, précis, contemplatif, éditorial, scientifique sans être clinique, dense sans être encombré, humain sans être décoratif, assuré sans être spectaculaire.

L’utilisateur doit percevoir une continuité d’informations, pas une collection de cartes. L’espace, l’alignement, la taille des caractères et le contraste créent la hiérarchie. Le cadre visuel s’efface pour laisser parler les données.

## 4. Règles immuables

1. Fond général noir, mat et continu.
2. Widgets **borderless** par défaut.
3. Aucun fond, bordure, ombre ou arrondi automatique autour d’un widget.
4. Hiérarchie créée d’abord par typographie, espace, alignement et contraste.
5. Palette presque entièrement noire, blanche et grise.
6. Couleur rare, sémantique et jamais décorative.
7. Données, dates, unités et périodes en monospace.
8. Chaque texte visible aide à comprendre, décider, agir, attendre ou corriger.
9. Aucun titre décoratif, sous-titre évident ou texte d’ambiance.
10. Animations courtes, utiles et désactivables ; aucune animation perpétuelle.
11. Rayon courant maximal de 4 px pour les éléments rectangulaires.
12. Une absence de donnée n’est jamais présentée comme zéro.

## 5. Palette

| Rôle | Token | Valeur | Usage |
|---|---|---:|---|
| Toile | `--lab-canvas` | `#050505` | Fond global continu |
| Surface | `--lab-surface` | `#080808` | Rare séparation tonale |
| Surface subtile | `--lab-surface-subtle` | `#0c0c0c` | Contrôle ou regroupement discret |
| Sélection | `--lab-surface-selected` | `#222222` | État actif |
| Piste | `--lab-control-track` | `#0b0b0b` | Fond compact d’un contrôle |
| Texte principal | `--lab-text-primary` | `#f1f1f1` | Titres, valeurs et contenu prioritaire |
| Texte secondaire | `--lab-text-secondary` | `#aaaaaa` | Métadonnées et contexte |
| Marque | `--lab-brand` | `#eeeeee` | Action ou sélection forte |
| Règle | `--lab-border` | `#292929` | Séparateur exceptionnel |
| Règle forte | `--lab-border-strong` | `#3a3a3a` | Limite fonctionnelle importante |

Les noirs légèrement bleutés de certaines scènes immersives de `/` sont une nuance locale de profondeur, pas une seconde palette.

Couleurs sémantiques, toujours rares et accompagnées d’un texte, symbole, motif ou placement :

- `--lab-signal: #d5e5da` : évolution favorable ou signal confirmé ;
- `--lab-error: #e2b2aa` : erreur, danger ou évolution défavorable ;
- `--lab-warning: #d5c397` : prudence ou donnée à vérifier ;
- `--lab-info: #adc5df` : information ou source distincte nécessaire.

Interdits : dégradés décoratifs, glow, néon, glassmorphism, grandes surfaces colorées, palette propre à une page, violet technologique, vert « santé » systématique, blanc pur étendu et palette arc-en-ciel générique.

Un graphique multisérie doit privilégier gris, styles de trait, symboles, motifs et libellés directs. Une couleur de domaine n’est admise que si elle améliore réellement la compréhension.

## 6. Typographie

Soma possède trois voix. Aucune quatrième sans décision explicite.

- **Schibsted Grotesk**, token `--font-soma-ui` : corps, navigation, boutons, libellés, titres fonctionnels et contrôles.
- **Georgia**, pile `Georgia, "Times New Roman", serif` : grand titre de l’Observatoire et titres majeurs ouvrant une nouvelle lecture. Ne pas l’employer dans tableaux ou contrôles.
- **Azeret Mono**, tokens `--font-soma-mono` et `--lab-data-font` : valeurs, unités, dates, heures, périodes, axes, indices et métadonnées de preuve. Utiliser les chiffres tabulaires pour les valeurs alignées.

| Niveau | Police | Taille | Graisse | Interligne |
|---|---|---:|---:|---:|
| Titre immersif de `/` | Georgia | `clamp(44px, 5vw, 72px)` | 400 | 1–1.08 |
| Titre de page secondaire | Georgia | `clamp(30px, 3vw, 40px)` | 400 | 1.2 |
| Titre de section majeur | Georgia ou Schibsted | 20–26 px | 400–500 | 1.2–1.3 |
| Titre de groupe | Schibsted | 16–20 px | 400–560 | 1.25–1.4 |
| Corps | Schibsted | 16 px | 400 | 1.55 |
| Interface | Schibsted | 13–14 px | 400–500 | 1.35–1.5 |
| Donnée | Azeret Mono | 12–26 px | 400–500 | 1–1.4 |
| Micro-label | Azeret Mono | 11–12 px | 400–500 | 1.35–1.4 |

Préférer la graisse 400 ; réserver 500–560 à une différence réelle. Éviter le gras massif. Espacement négatif léger uniquement sur les grands titres. Limiter le corps à environ 65 caractères par ligne. Aucun texte fonctionnel sous 12 px ; 11 px seulement pour une annotation non interactive. Capitales courtes possibles pour un repère instrumental. Jamais de monospace pour un paragraphe. Ne pas mélanger français et anglais sur une même surface.

## 7. Hiérarchie de l’information

Ordre généralement attendu : contexte/période → résultat principal → facteurs explicatifs → tendance → détail/provenance/incertitude → action éventuelle.

Un seul élément domine chaque zone. Les autres restent présents mais plus calmes, plus petits ou plus éloignés.

- préférer une composition continue à une mosaïque de cartes ;
- regrouper par proximité et alignement avant d’ajouter un conteneur ;
- employer l’asymétrie si elle clarifie la priorité ;
- adapter la largeur au contenu ;
- éviter hauteurs artificielles et vide décoratif ;
- montrer l’essentiel sans défilement inutile ;
- conserver la preuve près du résultat qu’elle qualifie ;
- placer couverture, période, source et incertitude au niveau utile.

## 8. Espacement et grille

Échelle : `4 / 8 / 16 / 24 / 32 px`.

- 4 px : relation interne serrée ; 8 px : même contrôle ; 16 px : séparation interne ; 24 px : groupe compact ; 32 px : séparation structurelle ; 48–88 px : respiration entre grandes zones.
- Le desktop s’aligne sur un rail de 64 px.
- Une page secondaire utilise typiquement `32px 5vw 64px`.
- Une grande composition peut limiter sa largeur, mais ne doit pas être enfermée automatiquement dans une carte centrée.
- Titres, valeurs, axes et séparateurs doivent s’aligner exactement.

## 9. Surfaces et profondeur

Un widget est une **zone d’information**, pas une carte. Par défaut : fond transparent, aucune bordure, aucune ombre, rayon nul, espacement assuré par la grille.

Une surface `#080808` ou `#0c0c0c` est admise pour un contrôle, une interaction, une sélection ou un regroupement autrement ambigu. Une ligne de 1 px peut séparer une série ou matérialiser un axe ; elle n’entoure pas chaque bloc.

Rayons : 2 px pour un détail, 4 px pour le contrôle courant, 8 px exceptionnellement pour un grand conteneur distinct, cercle uniquement pour une forme intrinsèquement circulaire. Les pills sont réservées aux statuts ou filtres courts.

Aucune ombre au repos. Une ombre imperceptible est tolérée pour une superposition temporaire.

## 10. Composants

### Boutons

- une action principale maximum par zone ;
- 36–40 px sur desktop dense, au moins 44 × 44 px sur mobile ;
- rayon 4 px, graisse 400–500 ;
- primaire : fond `#eeeeee`, texte sombre ;
- secondaire : transparent ou `#1c1c1c`, texte clair ;
- action textuelle sans fond si l’affordance reste claire ;
- danger sémantique avec libellé explicite.

Hover et active changent légèrement contraste ou fond. Aucun gonflement, déplacement spectaculaire ou glow.

### Sélecteurs

- compacts, directs et intégrés à la composition ;
- aucun grand conteneur décoratif ;
- inactif gris, actif blanc ou gris profond ;
- sélection indiquée aussi par position, trait, forme, `aria-pressed` ou `aria-current` ;
- libellés courts et navigation temporelle cohérente ;
- sur mobile : empilement ou défilement explicite sans écraser les libellés.

### Champs

- libellé visible et proche ;
- fond `#101010` ou transparent ;
- bordure absente si surface et libellé suffisent, sinon règle de 1 px ;
- hauteur 40–44 px, rayon 2–4 px ;
- valeurs numériques en Azeret Mono ;
- erreur annoncée par texte et sémantique, jamais par couleur seule.

### Graphiques

- choisir le type selon la question, jamais pour son apparence ;
- rendre axes, unités, période et couverture lisibles ;
- libeller directement les valeurs importantes si possible ;
- employer noir, blanc et gris par défaut ; couleur sémantique rare ;
- garder la grille plus calme que les données ;
- aucun donut ou radar ajouté simplement pour « faire visuel » ;
- aucune courbe lissée si elle déforme le phénomène ;
- aucune fausse précision ;
- montrer les données absentes ou incomplètes sans inventer de valeur.

### Icônes et navigation

Icônes linéaires, simples et cohérentes. Elles complètent un libellé et ne le remplacent que pour une action universelle et accessible. Aucun emoji ou pictogramme décoratif répété.

Le rail desktop reste silencieux et compact. La destination active possède `aria-current`. Sur mobile, les destinations essentielles restent accessibles sans hover ni tooltip.

## 11. Microcopy

Voix brève, factuelle, calme et non culpabilisante. Chaque texte répond à une question utile : quoi, quand, quelle source, quelle signification, quelle action, pourquoi une absence ou que corriger ?

Supprimer slogans d’écran de travail, sous-titres répétant le titre, introductions évidentes, confirmations bavardes, labels répétés et phrases génériques comme « Voici vos données ».

Conserver erreurs, chargements, absences, provenance, incertitude, confirmations utiles et instructions nécessaires.

## 12. Mouvement

- interaction simple : 150–180 ms ;
- transition de composition : jusqu’à 240 ms ;
- révélation exceptionnelle de scène : 650–950 ms maximum ;
- easing : `cubic-bezier(.2, .8, .2, 1)` ou `cubic-bezier(.16, 1, .3, 1)` ;
- faible amplitude pour les contrôles ;
- graphique animé une seule fois ;
- aucun pulse, balayage ou rotation sans fin ;
- aucune parallaxe indispensable à la compréhension ;
- sous `prefers-reduced-motion: reduce`, supprimer toute animation non essentielle.

## 13. États et données

Prévoir : normal, hover, focus visible, active/selected, disabled, loading, empty, partial/unavailable, error et stale.

Le focus utilise un contour de 2 px avec offset visible. Le chargement conserve la géométrie générale ; éviter le spinner isolé au centre d’une grande surface. L’état vide explique l’absence et ne propose une action que si elle est utile.

`null` signifie « indisponible ou non mesuré ». `0` signifie une mesure explicite égale à zéro. Cette distinction vaut dans le texte, les graphiques et l’accessibilité. Une association n’est jamais formulée comme une causalité.

## 14. Responsive

### Desktop — `1440 × 900`

- fonction et résultats prioritaires dans le premier écran ;
- colonnes utilisées pour comparer ou relier ;
- lignes de lecture nettes ;
- pas de petit conteneur arbitrairement centré ;
- pas de cartes ajoutées pour remplir l’espace.

### Mobile — `390 × 844`

- une colonne lorsque la comparaison horizontale devient illisible ;
- ordre sémantique préservé ;
- zones tactiles de 44 px ;
- corps jamais sous 16 px ;
- aucune donnée masquée uniquement pour faire tenir la page ;
- reformuler avant de tronquer ;
- pas de défilement horizontal sauf bande temporelle ou tableau conçu pour cela ;
- zones sûres et navigation préservées.

Vérifier les ruptures naturelles autour de 700, 900 et 1100 px sans créer de media queries inutiles.

## 15. Accessibilité

- viser WCAG 2.2 AA ;
- maintenir contraste et lisibilité ;
- donner un nom accessible à chaque contrôle ;
- utiliser les éléments HTML natifs avant ARIA ;
- conserver ordre de tabulation logique et focus visible ;
- ne jamais dépendre de la couleur seule ;
- annoncer erreurs, chargements et confirmations importantes ;
- respecter zoom, agrandissement du texte et réduction du mouvement ;
- fournir une description textuelle lorsque le sens d’un graphique n’est pas disponible à proximité.

## 16. Critères de conformité

Une page conforme prolonge naturellement l’Observatoire, reste calme avec beaucoup de données, possède une hiérarchie immédiate, adapte sa composition à sa question, ne ressemble pas à une grille de cartes générique, reste lisible sans couleur, ne contient aucun texte superflu, donne accès à la preuve sans surcharger la synthèse, conserve ses fonctions essentielles sur mobile et traite correctement les états incomplets.

Refuser : thème propre à une page, cartes arrondies répétées, fond derrière chaque widget, bordure autour de chaque groupe, grand hero générique repoussant la fonction, palette multicolore, gradient gratuit, glassmorphism, glow, néon, ombres de dashboard, microcopy redondante, graphique choisi pour son apparence, animation perpétuelle, valeur inventée ou copie visuelle d’un produit tiers.

## 17. Liberté de composition

La conformité ne signifie pas reproduire `/` bloc par bloc. Une page peut utiliser colonnes, progression verticale, index dense, chronologie, composition asymétrique, table, matrice ou graphique principal entouré de preuves.

La liberté porte sur la **manière d’expliquer les données**. Elle ne porte pas sur l’identité du produit.

## 18. Procédure obligatoire pour les agents

Avant toute modification visuelle :

1. identifier la question principale de la page ;
2. lister les informations indispensables et leurs états ;
3. choisir une composition adaptée sans recopier mécaniquement `/` ;
4. mapper chaque couleur, police, taille, rayon, contrôle et mouvement vers ce document ou un token existant ;
5. justifier toute exception avant de l’implémenter ;
6. vérifier le rendu réel, pas seulement le code ;
7. comparer côte à côte avec `/` à `1440 × 900` et `390 × 844` ;
8. vérifier clavier, focus, contraste, mouvement réduit, chargement, vide, erreur et données partielles ;
9. relire le diff pour détecter les styles isolés ;
10. mettre à jour ce document seulement après validation explicite d’une nouvelle décision globale.

Questions finales :

- Les pages semblent-elles appartenir exactement à la même application ?
- Leur différence vient-elle de la composition plutôt que d’un nouveau thème ?
- Peut-on retirer un fond, une bordure, un arrondi ou un texte sans perdre de compréhension ?
- L’élément essentiel est-il évident sans couleur vive ni grande carte ?
- Le mobile conserve-t-il toutes les fonctions et données essentielles ?
- Chaque exception stylistique possède-t-elle une raison fonctionnelle ?

Si une réponse est non, la page n’est pas terminée.

## 19. Contrat commun des quatre pages secondaires — référence production

### 19.1 Autorité et périmètre

Cette section définit le contrat commun des quatre pages secondaires :

- `/meals` — **Alimentation** ;
- `/sleep` — **Sommeil** ;
- `/recovery` — **Récupération** ;
- `/activity` — **Effort**.

La référence visuelle prioritaire est la version en production de Soma, vérifiée le **13 septembre 2026** sur [soma-neon-phi.vercel.app](https://soma-neon-phi.vercel.app). La production fait foi pour la langue visible, l’identité, la densité, les formes, le rythme et les interactions réellement attendues. Le code local sert à comprendre les données et les composants existants ; il ne remplace pas la référence production.

La production actuelle présente encore des différences de composition. Ce document ne prétend donc pas qu’elle est déjà parfaitement uniforme : il en extrait la direction visuelle et fixe la normalisation à appliquer. Les quatre pages doivent appartenir au même système. Leur différence doit venir des données et des preuves propres au domaine, jamais d’un thème, d’une typographie ou d’une géométrie différente.

Règle fondamentale : **même squelette, mêmes tokens, mêmes contrats d’interaction et d’accessibilité ; contenu métier différent uniquement lorsque la donnée l’exige**.

### 19.2 Audit de la production et décision de normalisation

| Page | Score principal | Radar de production | Indicateurs récents ou équivalent | Graphiques et preuves |
|---|---|---|---|---|
| Alimentation | Score du jour avec couverture et confiance | 7 dimensions nutritionnelles | Journal des repas et état de couverture | Historique du score, familles alimentaires, nutrition |
| Sommeil | Score Sommeil, parfois indisponible | Durée, efficacité, régularité, latence, dette | Horaires, besoin estimé, temps éveillé | Phases, tendances sur 30 jours |
| Récupération | Score de récupération avec référence personnelle | VFC quotidienne, FC au repos, sommeil | VFC, FC au repos, fréquence respiratoire | Tendances, zones cardiaques |
| Effort | Score d’effort avec couverture | 4 composantes du score + charge hebdomadaire contextuelle | Charge, ratio, régularité, jours actifs | Tendances, zones, séances récentes |

La production a été vérifiée sur les quatre routes, avec ouverture des détails de score et de plusieurs axes des radars. Elle montre notamment que l’ordre actuel varie : Alimentation place l’historique et le journal avant certaines preuves, Sommeil mélange timing et radar, Récupération place le radar avant le résumé du score, et Effort place le résumé avant le radar. **L’ordre canonique ci-dessous remplace ces variations.**

### 19.3 Structure verticale canonique

Toutes les pages suivent le même ordre de haut en bas. Une section sans donnée reste à sa place et affiche son état ; elle ne provoque pas de réorganisation imprévisible.

1. **Navigation globale** — identique à `/`, sans variante de page secondaire.
2. **En-tête de page** — titre `h1`, période ou date explicite, puis aucune phrase décorative. Une description accessible peut exister si elle apporte un contexte utile.
3. **Bloc de score principal** — radar à gauche et résumé du score à droite sur desktop ; radar puis résumé sur mobile.
4. **Indicateurs récents** — faits les plus récents et leur comparaison de référence. Pour Alimentation, le `Journal des repas` occupe cet emplacement fonctionnel.
5. **Tendances** — même titre, même période par défaut, même composant de graphique et même traitement des trous de données.
6. **Preuves propres au domaine** — phases du sommeil, familles alimentaires, zones cardiaques, séances, compléments ou recettes selon le cas.
7. **Provenance et qualité des données** — dernière section commune aux quatre pages.

L’alignement horizontal du titre, des titres de sections et des contenus est toujours le même. Aucun widget ne doit être remonté simplement parce qu’une autre page possède moins de données.

### 19.4 Grille, positions et espacements

Tokens de structure à utiliser sur les quatre routes :

| Élément | Desktop | Mobile |
|---|---:|---:|
| Largeur maximale du contenu | `1180px` | `100%` |
| Marge horizontale | `5vw`, avec un minimum de `32px` | `16px` |
| Espace après la navigation | `32px` | `24px` |
| Titre de page → bloc de score | `24px` | `20px` |
| Espace entre le radar et le résumé | `48px` | `24px` |
| Score → indicateurs récents | `32px` | `32px` |
| Indicateurs → tendances | `48px` | `40px` |
| Tendances → preuves métier | `48px` | `40px` |
| Titre de section → contenu | `16px` | `12px` |
| Écart entre éléments d’un même groupe | `8px` ou `16px` | `8px` ou `16px` |
| Séparation majeure | `1px` et `32px` de respiration | `1px` et `24px` de respiration |

La grille du bloc principal est `minmax(0, 420px) minmax(300px, 1fr)` avec un écart de `48px`. Elle passe en une colonne lorsque la largeur ne permet plus de conserver le radar lisible et le résumé à côté. Le radar est alors toujours avant le score dans l’ordre visuel et dans l’ordre du DOM.

Les valeurs `4 / 8 / 16 / 24 / 32 / 48` sont les seuls pas d’espacement autorisés, sauf contrainte documentée d’un graphique. Il est interdit d’introduire un `margin-top` ou un `gap` spécifique à une route pour corriger une composition locale.

### 19.5 Typographie commune

| Rôle | Police | Taille / interligne | Règle |
|---|---|---:|---|
| Titre de page `h1` | Georgia | `40px / 48px` desktop ; `30px / 36px` mobile | Poids normal, une seule ligne si possible |
| Titre de section `h2` | Georgia | `22px / 28px` | Même taille sur les quatre pages |
| Titre de groupe `h3` | Schibsted Grotesk | `16px / 24px` | Poids `500` au maximum |
| Corps et description | Schibsted Grotesk | `16px / 24px` | Texte court, jamais décoratif |
| Interface, période, statut | Schibsted Grotesk | `12–14px / 18–20px` | Labels et actions cohérents partout |
| Valeur principale d’un score | Azeret Mono | `clamp(64px, 7vw, 96px) / 1` desktop ; `64px / 64px` mobile | Même traitement pour les quatre scores |
| Valeur de métrique | Azeret Mono | `16–20px / 24px` | Chiffre, unité et état restent lisibles séparément |
| Donnée de graphique, date, axe | Azeret Mono | `11–13px / 16px` | Jamais une police proportionnelle pour une valeur mesurée |

Les titres majeurs utilisent Georgia comme dans l’Observatoire. Schibsted Grotesk sert à l’interface et à la lecture. Azeret Mono sert exclusivement aux données, unités, dates, périodes, pourcentages et valeurs de graphiques. Les quatre pages restent en français ; aucun mélange anglais/français n’est visible dans un état normal, vide, de chargement ou d’erreur.

### 19.6 Couleurs, surfaces et effets

Les quatre routes utilisent exactement les tokens `--lab-*` existants :

- fond continu `--lab-canvas` ;
- texte principal `--lab-text-primary` ;
- texte secondaire `--lab-text-secondary` ;
- bordure discrète `--lab-border` ;
- signal positif `--lab-signal` ;
- erreur `--lab-error` ;
- avertissement `--lab-warning` ;
- information `--lab-info`.

Le domaine ne possède pas de palette propre : le sommeil n’est pas bleu, l’effort n’est pas orange, et l’alimentation n’est pas verte par défaut. Les couleurs sémantiques sont rares, servent à comprendre un état et ne sont jamais le seul moyen de transmettre une information.

Par défaut : fond noir mat continu, surfaces transparentes ou très légèrement contrastées, aucune carte blanche, aucun dégradé décoratif, aucune lueur, aucun effet glassmorphism et aucune ombre automatique. Les séparateurs sont d’un pixel. Le rayon maximal est `4px`, réservé aux contrôles qui en ont besoin ; les grandes surfaces et les graphiques restent à rayon nul. Une bordure, un fond ou un arrondi doit avoir une fonction explicite.

### 19.7 Contrat visuel et technique du radar

Les quatre pages utilisent le même composant de radar et la même géométrie, quel que soit le nombre d’axes.

- Cadre carré de référence : `420 × 420px` desktop, `320 × 320px` maximum sur mobile ; ratio `1 / 1`.
- `viewBox` stable et centre géométrique stable ; aucune route ne redéfinit le centre ou le rayon.
- Quatre anneaux de référence à `25 / 50 / 75 / 100` ; le dernier représente la cible, pas une valeur mesurée.
- Départ en haut, axes dans le sens horaire, labels à distance constante du polygone.
- Rayon utile identique ; labels longs sur deux lignes maximum, sans collision avec les autres axes.
- Grille gris discret, donnée mesurée en `--lab-text-primary`, donnée de référence en gris secondaire, point actif avec le signal sémantique du système.
- Ligne du polygone de `1.5–2px`, points de `4–6px`, aucune surface opaque ajoutée derrière le radar.
- Pas de lissage qui invente une tendance. Une donnée absente reste absente.

Un radar présentant un score doit être exploratoire sur les quatre pages. Chaque axe est un vrai contrôle accessible et fournit : label, valeur actuelle, unité, référence éventuelle et état de mesure. Les axes de Récupération, qui sont actuellement visuels mais non interactifs en production, doivent suivre le même contrat que ceux d’Alimentation et d’Effort.

États du polygone :

- toutes les dimensions nécessaires mesurées : polygone affiché ;
- dimension partielle ou indisponible : valeurs `—`, axes visibles, couverture affichée, mais aucun segment ne doit suggérer une mesure inexistante ;
- score non calculable : radar de référence conservé si les axes sont utiles, score `— /100`, explication lisible ;
- mesure égale à zéro : `0`, jamais remplacée par `—` ;
- absence (`null`) : `—`, jamais remplacée par `0`.

### 19.8 Interaction avec un axe du radar

Cliquer ou toucher un axe sélectionne cet axe. Le même résultat doit être obtenu avec `Enter` ou `Espace`. Le contrôle actif reçoit un état visuel non dépendant de la couleur seule : contraste, contour ou changement de taille du point. `Tab` permet d’entrer dans les axes ; les flèches, `Home` et `End` permettent de les parcourir sans quitter le radar.

Le détail s’ouvre dans un panneau adjacent sur desktop et inline sous le radar sur mobile. Son titre reçoit le focus. Le panneau possède un bouton `Fermer`, accepte `Échap`, restaure le focus sur l’axe d’origine et n’expose aucun contenu fermé aux technologies d’assistance. Il ne doit pas naviguer vers une autre page pour une simple explication.

Le panneau d’un axe affiche toujours, dans cet ordre lorsque l’information existe :

1. nom de l’axe ;
2. valeur actuelle et unité ;
3. moyenne sur 30 jours ou référence personnelle ;
4. sens de lecture — plus haut, plus bas ou plus proche de la cible ;
5. rôle dans le score et poids ;
6. formule, normalisation ou règle de calcul en langage simple ;
7. contribution au score, avec `Indisponible` si elle ne peut pas être confirmée ;
8. observation, couverture et confiance lorsque le domaine les fournit ;
9. contexte et source de la donnée.

Le clic sur le score principal ouvre le même type de détail partagé. Il affiche les composantes, leurs poids, les valeurs mesurées, la référence, la contribution, la couverture et les raisons d’une indisponibilité. Aucune ventilation n’est inventée pour remplir un panneau.

Contrats métier observés en production :

- **Alimentation** : Variété, Qualité alimentaire, Sucre ajouté, Exposition liquide/concentrée, Ultra-transformation, Couverture nutritionnelle et Énergie. Les poids effectifs peuvent dépendre de l’observation et de la confiance ; ils doivent être affichés tels que calculés, pas remplacés par des poids fixes fictifs.
- **Sommeil** : Durée `70 %`, Efficacité `10 %`, Régularité `20 %`. Latence et dette peuvent être des axes explicatifs ; leur rôle doit être explicite s’ils ne composent pas le score.
- **Récupération** : VFC quotidienne `40 %`, FC au repos `30 %`, Score sommeil `30 %`, comparés à la référence personnelle.
- **Effort** : Minutes en zone `50 %`, Durée d’exercice `25 %`, Calories actives `15 %`, Pas `10 %`. La charge hebdomadaire est un repère contextuel et ne doit pas être présentée comme une composante supplémentaire sans décision produit.

### 19.9 Résumé du score principal

Le résumé utilise la même structure sur les quatre routes : label de période, nom du score, valeur, unité, rail ou indicateur de progression, couverture, moyenne de référence et action d’explication.

- Période actuelle : `Aujourd’hui` seulement pour la journée courante ; sinon date ou période réelle.
- Valeur : `— /100` lorsque le score est indisponible ; ne jamais animer `0` vers une valeur réelle lorsque la donnée de départ est inconnue.
- Valeur numérique en Azeret Mono, même taille, même alignement et même contraste sur les quatre pages.
- Couverture, confiance et moyenne sont des métadonnées secondaires, jamais masquées dans un tooltip uniquement.
- Le bouton d’explication fait au moins `44 × 44px`, possède un nom accessible complet et expose `aria-expanded` et `aria-controls`.
- Le score ne doit pas être résumé par une couleur seule : le chiffre, le statut et la couverture restent textuels.

### 19.10 Indicateurs récents

La section conserve la même géométrie, même si son contenu métier change. Elle comporte un titre `h2`, la période de référence, puis trois ou quatre indicateurs sur desktop, deux sur une largeur intermédiaire et une colonne sur mobile. Chaque indicateur expose label, valeur actuelle, unité, moyenne ou référence et date de mesure.

| Page | Contenu de la section récente |
|---|---|
| Alimentation | Journal des repas, couverture du jour, statut de complétude et, si utile, confiance de l’observation |
| Sommeil | Heure de coucher, heure de réveil, sommeil visé, temps éveillé et moyenne de référence |
| Récupération | VFC quotidienne, FC au repos, fréquence respiratoire et date de mesure |
| Effort | Charge hebdomadaire, ratio récent/habituel, régularité sur 28 jours et jours actifs |

Les cartes d’indicateurs ne sont pas des blocs décoratifs. Elles restent sans fond et sans ombre par défaut ; la hiérarchie vient de l’alignement, de la typographie et de l’espace. Un indicateur absent affiche `—` et son état ; un indicateur mesuré à zéro affiche `0`.

### 19.11 Section Tendances et graphiques

Le titre est toujours `Tendances`, avec `30 jours` par défaut. Les contrôles de période ont la même position, le même style et les mêmes états sur les quatre routes. Les graphiques sont organisés en deux colonnes sur desktop et une colonne sur mobile, sans carte visuellement plus importante uniquement parce qu’elle appartient à une route donnée.

Le composant de tendance partagé doit conserver :

- en-tête : nom de la métrique, valeur récente, unité et moyenne ;
- zone de tracé d’environ `112–128px` de haut sur desktop et `112px` minimum sur mobile ;
- ligne principale `1.5–2px`, point final de `4px`, moyenne en tirets discrets, cible en pointillés si nécessaire ;
- axes et unités visibles lorsque leur absence empêcherait la lecture ;
- trous `null` non reliés et clairement décrits comme absences de mesure ;
- période, nombre de jours mesurés et couverture accessibles ;
- résumé textuel ou tableau accessible équivalent au dessin ;
- navigation clavier `←/→`, `Home`, `End`, interaction au survol et au toucher, sans dépendre du survol pour une information essentielle ;
- tooltip court, non coupé sur mobile, avec label, date, valeur et référence.

Familles de graphiques autorisées :

- **Alimentation** : évolution du score, familles alimentaires et évolution nutritionnelle ; barres uniquement lorsque la comparaison de quantités ou d’occurrences le justifie.
- **Sommeil** : durée, efficacité, régularité, fragmentation, sommeil profond/paradoxal et horaire du coucher ; phases détaillées dans une visualisation dédiée.
- **Récupération** : VFC quotidienne, FC au repos, fréquence respiratoire et zones cardiaques ; barres pour une distribution de temps, lignes pour une tendance.
- **Effort** : minutes en zone, durée d’exercice, calories actives, pas, charge hebdomadaire et régularité ; zones en barres, métriques temporelles en lignes.

Un radar ne remplace pas une tendance. Une barre ne remplace pas une comparaison temporelle. Le choix du graphique doit suivre la question, l’unité et la qualité de la donnée, tout en utilisant le composant visuel partagé.

### 19.12 Preuves métier et ordre des sections

Après les tendances, chaque page affiche ses preuves propres avec les mêmes titres, largeurs, espacements et règles d’état :

- **Alimentation** : familles alimentaires, nutrition détaillée, puis compléments et recettes habituelles ; le journal reste avant les tendances car il explique le score du jour.
- **Sommeil** : dernière nuit et répartition des phases ; la légende donne les pourcentages et distingue toujours les phases mesurées.
- **Récupération** : zones cardiaques hebdomadaires, avec moyenne quotidienne et jours mesurés uniquement.
- **Effort** : zones cardiaques, puis séances récentes ; l’état vide explique clairement qu’aucune séance mesurée n’est disponible.

Une preuve secondaire peut être repliable si elle est longue, mais le contrôle natif conserve son affordance, son focus et son état ouvert. Une section vide reste visible si elle est attendue dans le modèle mental de la page ; elle ne doit pas être remplacée par un grand espace vide sans explication.

### 19.13 États, qualité et provenance

Chaque section graphique et chaque score possèdent les états `loading`, `empty`, `partial`, `ready`, `stale` et `error`. Ces états conservent la même géométrie afin d’éviter les sauts de page et les interprétations erronées.

- **Chargement** : squelette proche de la géométrie finale ; pas de grand panneau générique sans libellé.
- **Vide** : raison compréhensible et prochaine action seulement si elle est réellement utile.
- **Partiel** : données disponibles visibles, couverture et limites explicites.
- **Indisponible** : `—`, cause courte et aucune valeur de remplacement.
- **Obsolète** : date ou fraîcheur visible, sans faire passer l’ancienne mesure pour une nouvelle.
- **Erreur** : message localisé près de la section concernée, action de reprise claire si elle existe.

La provenance finale est commune aux quatre pages, y compris Alimentation. Elle distingue les données importées d’une source de santé des métriques calculées par Soma, indique la dernière mise à jour et expose la couverture utile. Une absence de repas, de sommeil ou de mesure santé ne devient jamais un mauvais résultat, et jamais un zéro implicite.

### 19.14 Responsive, accessibilité et mouvement

La cible de vérification est `1440 × 900` sur MacBook Air et `390 × 844` sur iPhone. Vérifier aussi les largeurs intermédiaires `1100`, `900`, `700` et `640px` lorsque la grille change. Le contenu ne doit pas nécessiter de défilement horizontal ; les labels longs doivent se replier, les graphiques se réduire et aucune donnée essentielle ne doit disparaître.

Tous les contrôles tactiles font au moins `44 × 44px`. Le clavier doit atteindre le titre, le score, chaque axe interactif, les périodes, les points ou équivalents accessibles, les détails et la fermeture. Le focus est visible, le contraste vise WCAG AA, et aucune distinction importante ne repose sur la couleur seule.

Animation commune :

- apparition ou sélection : `150–180ms` ;
- radar et transition de données : une fois, environ `220ms` ;
- composition d’une section : `240ms` maximum ;
- aucune animation perpétuelle, aucun compteur qui recommence à zéro pour dramatiser la valeur ;
- `prefers-reduced-motion` supprime les déplacements et transitions non essentiels tout en conservant le changement d’état et le focus.

### 19.15 Gouvernance d’implémentation

Les quatre pages doivent consommer les mêmes primitives et le même contrat : `SecondaryHealthPageShell`, `ScoreRadar`, `ScoreSummary`, `RecentSignals`, `TrendSection`, `DomainEvidence` ou leurs équivalents déjà présents. Les noms sont indicatifs ; l’invariant est le partage du comportement et des tokens, pas le nom exact du fichier.

Les variations de route sont déclarées dans les données et la configuration : labels, unités, axes, formules, poids, états et preuves. Elles ne sont pas codées par des sélecteurs CSS de route qui réécrivent la taille du titre, la largeur du radar, les espacements ou la palette. Tout nouveau token doit être ajouté ici avant son usage. Toute exception doit indiquer la question métier à laquelle elle répond et son impact responsive/accessibilité.

### 19.16 Checklist de conformité

Avant de considérer l’uniformisation terminée, vérifier les quatre routes ensemble :

- même navigation, même titre, même alignement et même espace titre → radar ;
- même géométrie de radar, même nombre d’anneaux, mêmes contrôles d’axes et même panneau de détail ;
- même résumé de score, tailles, rail, couverture et comportement `— /100` ;
- même structure et même densité pour les indicateurs récents ;
- même section `Tendances`, période, cartes et états des trous de données ;
- mêmes couleurs, polices, rayons, bordures, effets et règles de mouvement ;
- même comportement clavier, focus, toucher, fermeture et reduced-motion ;
- même traitement de `null`, zéro, partiel, obsolète, vide et erreur ;
- même provenance finale, avec distinction source de santé / calcul Soma ;
- vérification réelle de la production puis QA locale à `1440 × 900`, `390 × 844` et aux largeurs intermédiaires ;
- comparaison finale côte à côte des quatre pages, sans accepter une exception simplement parce qu’elle existait déjà.

### 19.17 Mouvement détaillé : animations, transitions et effets

Le mouvement des quatre pages doit expliquer une relation ou confirmer une action. Il ne sert jamais à rendre une donnée plus importante qu’elle ne l’est. La thèse de mouvement de Soma est : **les traces se mettent en place calmement, une mesure change sans dramatisation, et le détail reste spatialement relié à la synthèse**.

#### Tokens de mouvement

Utiliser les mêmes valeurs sur les quatre pages :

| Token conceptuel | Durée | Usage |
|---|---:|---|
| Instantané | `100–120ms` | Pression, changement de contraste, tooltip |
| Rapide | `150–180ms` | Hover, focus, sélection, état d’un contrôle |
| Standard | `220ms` | Radar, rail de score, valeur connue → valeur connue |
| Composition | `280–320ms` | Panneau inline, reflow court, ouverture d’un détail |
| Entrée exceptionnelle | `500–800ms` | Une seule scène d’arrivée réellement signifiante, jamais chaque section |

Easing par défaut : `cubic-bezier(.16, 1, .3, 1)` pour une arrivée et `cubic-bezier(.2, .8, .2, 1)` pour un changement de donnée. Une sortie est plus rapide que son entrée. Aucun rebond, effet élastique, tremblement, flash ou accélération spectaculaire.

#### Matrice des animations

| Surface | État initial | Transition autorisée | Effet interdit |
|---|---|---|---|
| Navigation | Destination stable | Contraste, trait ou surface sélectionnée en `150ms` | Déplacement de toute la navigation ou changement de largeur des labels |
| Titre de page | Visible immédiatement | Aucune animation nécessaire | Fade-in retardant la lecture ou titre qui glisse depuis le bord |
| Score | `— /100` ou valeur connue | Valeur connue → valeur connue en `180–220ms`; rail synchronisé | `0 → valeur` lorsque la valeur initiale est inconnue, compteur spectaculaire |
| Radar | Grille statique | Première apparition : opacité et échelle `0.98 → 1` en `220ms`; mise à jour connue → connue par interpolation | Tracer un polygone depuis zéro, faire tourner le radar, animer les anneaux |
| Axe sélectionné | Point et label calmes | Contour, contraste, point `4 → 6px` et détail en `150–180ms` | Agrandir tout le graphique ou déplacer le label |
| Panneau de score | Fermé | Opacité + translation de `4px` maximum en `220–320ms`; sortie `120–180ms` | Faire attendre le focus, fermer avec un saut, bloquer le contenu pendant l’animation |
| Indicateur récent | Valeur stable | Variation de valeur ou d’état signalée en `150–180ms` | Clignotement, changement de couleur seul, déplacement de la grille |
| Courbe ou barre | Données chargées | Opacité douce ou évolution connue en `220ms`, une seule fois par jeu de données | Rejouer l’animation à chaque scroll, relier les trous `null`, lisser les variations |
| Tooltip | Non affiché | Opacité + translation de `2–4px` en `100–150ms` | Suivre le pointeur avec retard, sortir de l’écran mobile |
| Chargement | Squelette stable | Opacité très faible éventuellement, cycle lent borné | Shimmer permanent, spinner central sans contexte, géométrie qui saute |
| Erreur ou vide | Section conservée | Apparition simple en `150ms` si elle arrive après une requête | Shake d’erreur, alerte rouge pulsante, disparition de la section |

Les transitions portent en priorité sur `transform`, `opacity`, `color`, `background-color` et `border-color`. Ne pas animer directement `width`, `height`, `top`, `left`, les marges ou le layout lorsqu’un `transform`, une grille ou un reflow naturel suffit. `will-change` est temporaire et réservé à une animation connue. Les filtres, flous, ombres, canvas et effets coûteux restent absents du chemin courant.

#### Continuité, interruption et reduced-motion

- Une navigation ne montre pas une page noire entre deux routes : conserver le contexte jusqu’à ce que la destination soit prête, puis déplacer le focus sur le titre de la nouvelle page.
- Une nouvelle réponse réseau annule l’animation précédente et affiche le dernier état valide ; aucune animation ne doit révéler une réponse obsolète.
- Une animation ne se rejoue pas à chaque rendu React, scroll, resize ou retour arrière ; elle est liée à une entrée de données ou à une action utilisateur identifiable.
- Si l’utilisateur ferme rapidement un panneau, la sortie prend le dessus sans attendre l’entrée ; le focus reste toujours utilisable.
- `prefers-reduced-motion: reduce` supprime translation, zoom, morphing, parallaxe, révélation séquencée et boucle. Conserver uniquement un changement instantané de contraste, de bordure, d’opacité ou de texte qui confirme l’action.
- La réduction du mouvement ne doit pas supprimer l’information : la valeur finale, le focus, le statut et l’erreur restent immédiatement visibles.
- Les animations sont testées à vitesse normale, avec motion réduit et avec une connexion lente. Elles ne doivent pas modifier la valeur, la période, l’ordre de lecture ou la signification d’une mesure.

### 19.18 Responsive approfondi : du Mac à l’iPhone

Le responsive est une adaptation de la tâche, pas une réduction proportionnelle du desktop. L’information architecturelle, les libellés, les états et les actions restent les mêmes ; seule la composition change pour le contexte tactile et la largeur disponible.

#### Régions de composition

Les points de contrôle sont guidés par le contenu :

| Largeur | Composition cible | Priorité de vérification |
|---|---|---|
| `≥ 1100px` | Desktop : radar et résumé côte à côte, tendances en deux colonnes | `1440 × 900`, premier écran, alignements et densité |
| `900–1099px` | Petit desktop/tablette paysage : colonnes réduites, radar plafonné, textes toujours complets | aucun chevauchement, aucun score repoussé hors contexte |
| `700–899px` | Intermédiaire : radar et score peuvent s’empiler ; tendances en une ou deux colonnes selon leur largeur minimale | clavier, reflow et lisibilité des axes |
| `< 700px` | Mobile : une colonne, radar puis score, indicateurs puis tendances | `390 × 844`, tactile, safe area, défilement vertical |

Ces seuils sont des repères et non des obligations mécaniques. Une grille doit changer au moment où son contenu cesse d’être lisible. Préférer `minmax(0, 1fr)`, `clamp()`, container queries lorsque disponibles et propriétés logiques à une série de corrections par route.

- Chaque route secondaire possède un seul cadre de page partagé (`secondary-page`). Le wrapper technique de la route ne doit ajouter ni second gutter, ni second fond, ni second rythme vertical (`secondary-page-frame`) ; les tokens de domaine restent hérités à l’intérieur de ce cadre.

#### Règles mobile obligatoires

- Le radar conserve un cadre carré lisible, réduit à `288–320px` selon la largeur utile ; les labels s’enroulent avant d’être tronqués.
- Le résumé du score occupe toute la largeur sous le radar ; le bouton de détail reste atteignable sans zoom ni précision de souris.
- Les indicateurs passent de quatre colonnes à deux, puis à une colonne lorsque leur label ou leur valeur ne tient plus sans collision.
- Les tendances passent à une colonne ; aucune carte ne devient si étroite que son axe, son unité ou sa période disparaît.
- Un panneau de détail s’ouvre inline sous le radar ou le score ; il ne dépasse jamais la largeur du viewport et son bouton de fermeture reste dans la zone visible.
- Un tooltip de graphique se repositionne dans la fenêtre ou devient une ligne de détail sous le graphique ; il ne dépend jamais du hover.
- Le rail de dates de l’Alimentation peut défiler horizontalement parce qu’il s’agit d’une bande temporelle intentionnelle ; le reste de la page ne doit pas créer de débordement horizontal.
- Les tableaux ou listes longues peuvent devenir empilés, repliables ou défiler dans un conteneur identifié ; les en-têtes utiles restent compréhensibles.
- Le corps reste à `16px` minimum ; les unités, dates et métadonnées ne sont réduites que si leur contraste et leur rôle restent suffisants.
- Les contrôles sont espacés pour le pouce et possèdent un retour actif immédiat, sans attendre une animation ou une réponse réseau.

#### Entrées, orientation et zones sûres

- Ne jamais dépendre de `:hover` pour révéler une valeur, une action ou une explication. Le tactile utilise tap, focus et état actif.
- Les médias `pointer: coarse` et `hover: none` augmentent l’espace et suppriment les affordances réservées au pointeur fin ; `pointer: fine` peut ajouter un hover discret.
- Portrait et paysage sont testés sur iPhone : `390 × 844` et `844 × 390`. Le contenu ne doit pas être verrouillé en portrait.
- Respecter `env(safe-area-inset-top)`, `env(safe-area-inset-bottom)`, `env(safe-area-inset-inline-start)` et `env(safe-area-inset-inline-end)` lorsqu’une navigation ou une barre reste proche du bord.
- Ne pas empiler plusieurs éléments sticky qui masquent le titre, le focus ou le panneau ouvert. Une seule barre persistante doit avoir une priorité claire.
- Le retour arrière, l’actualisation et un lien profond conservent ou restaurent la date, la période et le point de lecture de façon prévisible.
- À `200 %` de zoom et avec une taille de texte augmentée, le contenu se recompose ; aucun texte essentiel n’est caché, coupé ou rendu inaccessible par une hauteur fixe.

### 19.19 Contrats transversaux à ne pas oublier

#### Temps, période et fraîcheur

Chaque donnée temporelle indique le bon jour, la bonne période et le bon fuseau local. Le mot `Aujourd’hui` est réservé à la date locale réellement courante ; une date passée sélectionnée affiche sa date. Les heures de sommeil peuvent traverser minuit sans inverser la chronologie. Les graphiques indiquent leur fenêtre, les points mesurés et la fraîcheur de la source.

Un changement de période doit mettre à jour ensemble titre, score, radar, indicateurs, graphiques, provenance, URL éventuelle et état accessible. Une réponse lente d’une ancienne période ne doit jamais remplacer silencieusement la période sélectionnée.

#### Données, calculs et sources

- Distinguer partout donnée importée, donnée saisie, donnée dérivée par Soma et donnée explicative générée par l’IA.
- Afficher l’unité à proximité de chaque valeur : `min`, `h`, `kcal`, `ms`, `bpm`, `%`, pas ou unité métier appropriée.
- Localiser nombres, décimales, dates, heures et pluriels en français ; ne jamais concaténer manuellement une unité ou un pluriel fragile.
- Conserver `null`, absence de mesure, mesure `0`, score non calculable, données partielles et donnée obsolète comme des états distincts dans le texte, le dessin et les attributs accessibles.
- Une moyenne sur 30 jours indique son nombre de jours mesurés ; elle ne laisse pas croire que les jours absents valent zéro.
- Une composante sans référence personnelle ne doit pas inventer de cible ; écrire `Indisponible` et expliquer ce qui manque.
- Les formules et poids affichés viennent du moteur réellement utilisé. L’interface ne recalcule pas une approximation uniquement pour remplir un panneau.

#### Navigation et URL

La navigation active, le titre de document, le focus, la date et la période sont cohérents. Les changements de filtre ou de date respectent le bouton précédent/suivant lorsque l’URL les représente. Aucun identifiant, détail de santé ou donnée personnelle inutile n’est ajouté à l’URL, aux logs ou aux attributs de debug.

Une route directement ouverte, rechargée, non authentifiée ou expirée possède un état compréhensible. Le rendu ne dépend pas d’un passage préalable par `/`. Les quatre pages ne créent pas de deuxième élément `<main>` à l’intérieur du shell principal.

#### Sémantique et technologies d’assistance

- Utiliser les éléments natifs : `button` pour une action, lien pour une navigation, `time` pour une date, `dl` pour une explication de score et `details/summary` pour une preuve repliable.
- Chaque graphique expose un seul nom accessible, un résumé structuré et, si nécessaire, une table ou liste de valeurs ; ne pas empiler `figure`, `svg`, texte caché et rôle `img` redondants.
- Les axes interactifs du radar et les points explorables du graphique possèdent un nom, une valeur, une unité et un état de sélection annoncés.
- Les annonces de chargement, erreur, mise à jour et ouverture d’un panneau sont courtes et placées dans une région adaptée ; ne pas annoncer chaque point d’un graphique comme une conversation continue.
- Après une action, le focus reste sur l’action ou se déplace vers le contenu nouvellement ouvert selon la relation spatiale ; après fermeture, il revient à l’origine.
- Aucun focusable caché derrière un panneau fermé, un tooltip ou un état de chargement.

#### Contenu réel et internationalisation

Les labels doivent survivre aux noms longs, accents, nombres élevés, valeurs négatives lorsqu’elles sont métier, unités composées et absence de données. Prévoir au moins `30 %` d’espace supplémentaire pour une traduction plus longue avant toute troncature. Utiliser les propriétés logiques `margin-inline`, `padding-inline` et `border-inline` afin de ne pas figer la gauche et la droite.

Même si l’interface visible de Soma est française, vérifier les chaînes longues, les caractères accentués, les noms de repas, les libellés à deux lignes et les formats de date avant de considérer un composant uniforme. L’arabe, l’hébreu, le CJK et l’emoji sont des contrôles de robustesse si une autre langue devient possible ; ils ne justifient pas une nouvelle palette ou une nouvelle hiérarchie.

### 19.20 Performance et dégradation élégante

- Charger le score principal et son état avant les graphiques secondaires ; réserver la hauteur de chaque zone pour éviter le déplacement de la page.
- Ne pas rendre inutilement 91 jours lorsque la vue affiche 30 jours ; limiter les points, labels et calculs à la période réellement demandée.
- Charger ou calculer les graphiques sous la ligne de flottaison progressivement, sans retarder le titre, le score et les indicateurs récents.
- Débrancher les observateurs et animations lorsque la section est masquée ; ne pas laisser un graphique écouter le pointeur ou le resize après son démontage.
- Coalescer les recalculs de dimensions dans `requestAnimationFrame` ou équivalent ; le resize ne doit pas redessiner quatre radars et toutes les courbes à chaque pixel.
- Prévoir une hauteur et une alternative textuelle pour un SVG lent, un navigateur ancien, un bloqueur ou un échec de JavaScript.
- Tester Safari macOS, Safari iOS et Chromium ; ne pas déduire la réussite tactile d’une simple capture redimensionnée.
- Aucun effet visuel ne doit exposer de données de santé dans la console, une URL, une télémétrie non prévue ou un état de debug.

Le produit reste lisible sans animation et compréhensible avec un réseau lent. Un chargement partiel est préférable à une page vide ; une erreur locale ne doit pas effacer les sections déjà disponibles.

### 19.21 Matrice de QA finale

Une uniformisation n’est terminée qu’après un passage commun aux quatre pages, dans cet ordre :

1. **Rendu** : production de référence, puis local, à `1440 × 900`, `390 × 844`, intermédiaire et paysage mobile.
2. **Densité** : premier écran, alignement du titre, radar, score et premiers indicateurs ; aucun saut de layout au chargement.
3. **Données** : prêt, chargement, vide, partiel, obsolète, erreur, score indisponible, zéro explicite, historique et période changée.
4. **Interactions** : clic, tap, hover si disponible, focus, `Enter`, `Espace`, flèches, fermeture, `Échap`, retour arrière et ouverture d’un détail.
5. **Accessibilité** : clavier complet, focus visible, nom unique des graphiques, ordre DOM, contraste, zoom `200 %`, lecteur d’écran ou arbre d’accessibilité disponible.
6. **Mouvement** : arrivée, mise à jour, interruption, répétition, connexion lente et `prefers-reduced-motion`.
7. **Robustesse** : labels longs, grandes valeurs, fuseau autour de minuit, orientation, safe area, tactile sans hover et Safari iOS.
8. **Qualité** : pas de données personnelles dans les logs, pas de console error, pas de débordement horizontal, pas de style de route isolé et aucune dépendance ajoutée sans bénéfice.

La preuve doit préciser le moteur utilisé, la taille réellement capturée, l’état testé et ce qui reste non vérifié. Une capture vérifie la composition ; elle ne prouve ni le geste tactile, ni le clavier, ni le lecteur d’écran. Toute limite de matériel, de navigateur ou d’authentification reste documentée plutôt que masquée.

### 19.22 Limites de produit à préserver

Ce contrat ne crée pas de fonctionnalité de partage, export, impression, notifications ou suivi analytique. Si l’une de ces fonctions est ajoutée, elle devra recevoir un contrat propre sans modifier silencieusement la structure commune des quatre pages. En particulier, aucune télémétrie de santé, aucun partage public et aucune nouvelle source de données ne doit être déduit d’une règle visuelle.
