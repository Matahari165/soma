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
