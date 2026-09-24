# Pages secondaires — cartographie et règles communes

## Statut et autorité

Ce document sert de base de travail pour `/activity`, `/meals`, `/sleep` et `/recovery`. Il décrit d'abord la page Activity locale approuvée par l'utilisateur, puis définit ce qui doit être partagé par les autres pages. La référence cartographiée est la branche `codex/activity-annotations-20260924`, commit `644449f` du 24 septembre 2026. Les quatre pages sont réunies sur la branche locale `codex/secondary-page-unification-20260924` ; vérifier son intégration avant de comparer `main`.

`DESIGN.md` reste l'autorité pour l'identité globale de Soma et la page `/`. Ce document précise le contrat des pages secondaires lorsque la composition de l'ancien contrat de `DESIGN.md` diffère de l'Activity validée. Nutrition, Sommeil et Récupération l'appliquent sur la branche locale d'uniformisation, avec leurs données et preuves propres.

**Nature des preuves.** Les valeurs ci-dessous proviennent des règles CSS, du JSX et des captures de l'Activity locale fournies dans la conversation. Les dimensions du navigateur sont indicatives lorsque les captures ne donnent pas de mesure DOM. Les valeurs CSS sont exactes ; les positions finales varient avec la largeur, les polices chargées, la présence de données et les panneaux ouverts. Aucune mesure personnelle issue des captures n'est reprise ici.

## Lecture de haut en bas de la page Activity

### 1. Cadre, navigation et titre unique

| Élément | Cartographie de l'Activity validée | Règle à partager |
|---|---|---|
| Navigation | Navigation globale de Soma, hors contenu spécifique de la page. | Reprendre la navigation de `/`, destination active annoncée ; aucune seconde navigation de domaine. |
| Toile | Fond mat continu `--lab-canvas` : token de base `#050505`, valeur du thème `observatory` actif `#050607`, sans carte autour de la page. | Même toile active, sans palette propre à chaque domaine. |
| Cadre | `width: 100%`, `min-height: 100vh`, `padding: 32px 5vw 64px` sur desktop ; `24px 16px 48px` à `720px` et moins. Le contenu est limité à `min(100%, 1180px)` et centré. | Même largeur utile, mêmes marges et même alignement de base. |
| Titre | Un seul `h1` visible, « Activity ». Georgia, graisse `400`, `clamp(30px, 3vw, 40px)`, interligne `1.2`, approche `-.025em`, couleur principale `--lab-text-primary` (`#f1f1f1`). Le `h1` n'a pas de marge propre ; son en-tête a une hauteur minimale de `56px`. | Remplacer seulement le nom du domaine. Ne pas ajouter de sous-titre visible répétitif. |
| Titre → score/radar | Le cadre de la page utilise `gap: 32px` entre l'en-tête et le contenu ; `24px` à `720px` et moins. L'espace apparent dépend aussi de la hauteur minimale de l'en-tête et de la géométrie du radar. | Conserver un départ commun du premier bloc, mesurer le rendu réel après chargement des polices. |

La description du domaine et le résumé vocal du score restent accessibles aux lecteurs d'écran, sans former une deuxième ligne décorative. Aucun autre titre de section visible ne sépare ensuite les indicateurs, l'historique propre à l'effort et les graphiques. Chaque section garde néanmoins un nom accessible.

**Résolution du thème actif.** `src/app/observatory-deep.css` remplace `--lab-canvas` par `#050607`, `--lab-surface-selected` par `#202b30`, `--lab-brand` par `#bddde3`, et les deux tokens de bordure `--lab-border` / `--lab-border-strong` par `transparent`. Le texte principal reste `#f1f1f1`, le secondaire `#aaaaaa`. Les règles de bordure déclarées par Activity peuvent donc ne pas produire de trait visible ; l'espacement porte alors la séparation. La piste du score est explicitement `#686868` afin de rester visible malgré ces overrides. Cette distinction entre valeur par défaut et valeur du thème actif doit être vérifiée sur les autres routes avant de recopier un style.

**Repères de position calculés depuis le CSS, non mesurés dans le navigateur.** À `1440px` de large, le padding latéral de page vaut `72px` : le `h1` débute à cette abscisse, tandis qu'un contenu centré de `1180px` débute vers `130px`. À `390px`, le padding latéral vaut `16px` et le contenu utile `358px`. Le haut du `h1` est à `32px` du début de la page desktop, ou `24px` sur mobile ; il faut encore ajouter le décalage de la navigation globale pour obtenir une coordonnée d'écran. L'en-tête global a une hauteur minimale de `52px` sur desktop dans le thème actuel ; le bandeau d'aperçu local peut modifier le padding du contenu principal. Un radar occupant sa largeur maximale de `420px` avec son ratio SVG `500:420` mesure théoriquement `420 × 353px` ; à `358px` de largeur, environ `358 × 301px`. Ces calculs ne remplacent pas une mesure DOM du rendu.

### 2. Composition principale : radar à gauche, score à droite

- La zone est une grille de deux colonnes `minmax(0, 420px) minmax(300px, 1fr)`, avec `64px` entre elles et `32px` de retrait interne à gauche. À `1000px` et moins, l'écart passe à `36px`. À `720px` et moins, la zone devient une colonne, sans retrait, avec `32px` d'écart : le radar vient avant le score dans le DOM comme à l'écran.
- Sur desktop, le CSS réserve une règle verticale de `1px` et un retrait de `clamp(24px, 4vw, 48px)` entre radar et résumé. Sur mobile, la règle est placée en bas avec `24px` de padding inférieur. Dans le thème actif, la couleur de bordure vaut `transparent` : la distance et l'alignement assurent la séparation visible, sans carte.
- La largeur du radar est bornée à `420px`. Son SVG est fluide (`width: 100%`, `height: auto`) et utilise un `viewBox` de `500 × 420` : sa géométrie est donc rectangulaire, même si son tracé est centré. Centre `(250, 210)`, rayon utile `132` unités, labels à `166` unités du centre. Le nombre d'axes dépend du domaine ; Activity en affiche cinq dont quatre composantes du score et une charge hebdomadaire contextuelle.
- Les quatre polygones de grille marquent `25 / 50 / 75 / 100 %`, avec traits de `1px` gris discret et anneau extérieur plus visible. Le polygone mesuré utilise un remplissage blanc à `10 %` de mélange, une ligne blanche de `1.75px` et des points blancs de rayon `5` unités avec contour sombre. Les segments ne sont dessinés qu'entre deux mesures disponibles ; une absence ne devient pas un zéro. La forme pleine n'est dessinée que si tous les axes sont mesurés.
- Les axes partent du haut et tournent dans le sens horaire. Chaque étiquette présente le nom en Schibsted Grotesk `13px`, puis la valeur et l'unité en Azeret Mono `12px`, gris secondaire. Les textes SVG ne se replient pas automatiquement : vérifier les noms longs et ajuster leur placement pour chaque domaine. Une flèche de comparaison `↑`, `↓` ou `→` apparaît près de la valeur si une référence existe ; son texte accessible explique la comparaison. Les signaux favorables et défavorables ont des couleurs sémantiques, jamais comme seule information.

**Ouverture d'un axe.** La zone cliquable inclut l'étiquette, un disque transparent de rayon `30` unités et un trait transparent de `18px` le long de l'axe. Clic/tap, `Entrée` et `Espace` ouvrent le détail ; les flèches du clavier parcourent les axes, `Home` et `End` vont aux extrémités. Le contrôle annonce son nom, sa valeur, sa comparaison et son état `aria-expanded`. Le focus affiche un anneau blanc en tirets. Cliquer une seconde fois ou presser `Échap` ferme le panneau et rend le focus à l'axe.

**Détail d'un axe.** Sur desktop, il s'ouvre à côté du radar, à l'intérieur de la première colonne du hero ; le radar se resserre pour lui faire place. La grille passe de `1fr / 0fr` à `1fr / minmax(280px, .9fr)` avec `24px` d'écart. Le mouvement de grille et l'entrée du panneau durent `220ms` avec l'easing `cubic-bezier(.16, 1, .3, 1)`. Le panneau reçoit une fine règle à gauche, un titre et un bouton Fermer d'au moins `44 × 44px`. Son titre reçoit le focus. Sur les petits écrans (`560px` et moins), il s'ouvre sous le radar. Le panneau fermé est `inert` et caché aux technologies d'assistance. Il montre, selon disponibilité : valeur actuelle, moyenne sur 30 jours, sens de lecture, rôle dans le score, source, formule ou normalisation, contribution et définition. L'axe de charge hebdomadaire est explicitement « contexte, exclu du score ».

**Animation du radar.** Une apparition unique révèle le remplissage (`900ms`, délai `120ms`), trace les segments (`760ms`, délai initial `150ms`, décalage de `90ms` par segment), puis les points (`300ms`, délai initial `700ms`, décalage de `90ms`). Le mouvement réduit supprime ces animations et montre immédiatement le dessin final. L'animation n'est ni un compteur ni une donnée supplémentaire.

### 3. Résumé du score, détail et rail

- La zone de droite commence par le libellé fonctionnel « Activity score » : Schibsted Grotesk `13px/18px`, gris secondaire. Toute la zone libellé/chiffre/moyenne est un bouton de fond transparent, aligné à gauche, sans bordure ; il débute avec `18px` de marge haute (`12px` à `720px` et moins).
- La valeur principale est en Azeret Mono, graisse `400`, `clamp(64px, 7vw, 96px)`, interligne `1`, chiffres tabulaires, approche `-.03em`, couleur principale. Le `/100` est aligné sur la ligne de base, avec `8px` d'écart, en `14px` gris. Sur mobile, la valeur est fixée à `64px`.
- La moyenne de 30 jours est située `12px` sous la valeur, en Azeret Mono `12px/16px`, gris secondaire. Elle est présentée comme une moyenne mesurée ; une absence affiche `—`, jamais `0` par défaut.
- Au survol, au focus et lorsque le détail est ouvert, le chiffre grossit légèrement (`scale(1.035)`, transition `420ms`). Le focus du bouton a un contour visible de `2px`, décalé de `6px`. En mouvement réduit, ce grossissement est supprimé.
- Le clic sur le bouton ouvre **sous** le résumé un panneau inline, sans navigation. Le chiffre reste la valeur mesurée ; l'effet perçu vient du léger grossissement du chiffre et de l'expansion verticale du détail. Le panneau déploie une ligne de grille de `0fr` à `1fr` en `360ms`, avec opacité, légère translation verticale et visibilité synchronisées ; `Échap` ou un second clic le referme et restaure le focus. Le panneau fermé est `inert` et `aria-hidden`.
- Chaque composante du détail conserve son nom puis affiche sur une ligne quand l'espace le permet : `<mesure> / <repère> <unité>`, `<contribution> points`, `<pondération> %`. Les valeurs et poids viennent du calcul réel ; les libellés « mesuré/repère », « contribution » et « pondération » restent disponibles aux lecteurs d'écran. En cas de donnée absente, la mesure et la contribution restent indisponibles. Le panneau explique les composantes manquantes, la couverture partielle et tout écart entre score enregistré et score recalculé.
- Le rail vient `24px` sous le bouton ou le détail ouvert. Il mesure `4px` de haut : piste grise explicite `#686868`, remplissage blanc `--lab-text-primary`. Le remplissage occupe `score/100` de la largeur, borné à `[0, 100]`, et passe par une transformation `scaleX` ancrée à gauche en `220ms`. Le score numérique voisin donne le sens du rail ; le rail est décoratif pour le lecteur d'écran. La piste doit rester visible lorsque le thème remplace `--lab-border-strong` par `transparent`.

### 4. Quatre indicateurs récents

- Immédiatement après le bloc principal viennent les quatre indicateurs, sans titre « Benchmarks ». Le groupe est un `<dl>` à quatre colonnes égales (`repeat(4, minmax(0, 1fr))`), écart de `24px`, texte centré. À `720px` et moins, il passe à deux colonnes (`20px` vertical, `16px` horizontal). Chaque cellule centre ses éléments sur son propre axe ; les colonnes occupent proportionnellement toute la largeur disponible.
- La section commence après une respiration de `24px` depuis le bloc précédent, puis un padding vertical de `32px` ; le CSS déclare une règle supérieure de `1px`, transparente dans le thème actif. Sur mobile, respiration de `16px` et padding de `24px`. La séparation doit rester lisible par l'espace.
- Les intitulés et références sont en Schibsted Grotesk `12px/16px`, gris secondaire. La valeur est en Azeret Mono `20px/26px`, blanc principal, chiffres tabulaires, avec `5px` de marge haute. Le contrôle intérieur mesure au moins `76px` de haut, a `4px 8px 8px` de padding, et aligne valeur, contexte et chevron au centre. Le chevron mesure `15px` et apparaît `3px` sous le texte.
- Cliquer le chevron/la valeur ouvre l'explication sous l'indicateur ; un second clic la ferme. Un seul indicateur est développé à la fois. Le chevron tourne de `180°` en `320ms`, l'explication passe de `0fr` à `1fr` en `320ms` et son opacité change en `240ms`. L'explication est alignée à gauche pour la lecture (`12px/18px`). `aria-expanded` et `aria-controls` indiquent l'état, un contour de `2px` marque le focus. Le mouvement réduit supprime la transition sans cacher le contenu ouvert.
- Les quatre faits actuels sont : charge hebdomadaire, ratio charge aiguë/chronique, régularité sur 28 jours et jours actifs sur 28 jours. Les intitulés, périodes, références, formules et conditions de disponibilité appartiennent au domaine Activity ; la géométrie et l'interaction sont réutilisables.

### 5. Preuve propre à Activity : séances

L'historique des séances suit les quatre indicateurs. Il n'a pas de titre visible « Workout history », mais sa section porte ce nom accessible. Filtres d'activité à gauche et sélecteur de période à droite sur desktop, empilés à `720px` et moins. Les contrôles ont une cible minimale de `44px`, affichent sélection, hover et focus ; le sélecteur de période tourne son chevron et déroule une liste. La rangée moyenne utilise `--lab-surface-selected` (`#202b30` dans le thème actif) et précède les séances ; chaque séance aligne identité/date et mesures, puis recompose ses colonnes sur petit écran. Cette preuve **ne constitue pas** un bloc obligatoire pour Nutrition, Sommeil ou Récupération : chaque domaine place ici le journal ou la preuve qui explique son score, si elle apporte de l'information.

Entre deux sections ordinaires, la règle CSS compose `32px` de padding bas, `24px` de marge entre sections et `32px` de padding haut, soit `88px` de respiration théorique entre les contenus hors hauteur de bordure, explication ouverte et contenu de la section. Après le hero, la première section a `24 + 32 = 56px` avant ses indicateurs. À `720px` et moins, les valeurs deviennent respectivement `24 + 16 + 24 = 64px` et `16 + 24 = 40px`. Ce rythme, plutôt qu'un `h2` répété, sépare les groupes.

### 6. Tendances et graphiques

- Les graphiques suivent la preuve métier, directement, sans titre visible « Graphiques », sans en-tête « 30 days » et sans carte. La section garde un nom accessible. La grille a deux colonnes égales et `32px` d'écart ; à `560px` et moins, une colonne et `24px` d'écart. La respiration de section joue le rôle de regroupement ; son trait CSS reste transparent dans le thème actif.
- Chaque graphique commence par son nom centré en Schibsted Grotesk `12px` gris secondaire. Son en-tête occupe au moins `64px`, puis le cadre de tracé prend toute la largeur et commence `16px` plus bas. Le cadre hérité fait `116px` de haut sur desktop. Les dates d'axe sont en monospace discret `11px`. Les graphiques restent transparents, sans bordure ni rayon.
- Dans l'état Activity observé, six séries sont affichées : minutes en zone, durée d'exercice, calories actives, pas, charge hebdomadaire agrégée par semaine et régularité d'activité. Elles utilisent le composant compact de tendance avec des **barres** ; les cinq premières séries quotidiennes gardent les jours du calendrier, la charge utilise des groupes hebdomadaires. La famille de graphe doit toujours suivre la donnée et la question métier sur les autres pages.
- Le tracé en barres utilise un SVG de référence `300 × 104`, une ligne de base, des barres blanches/grises d'opacité `.7`, une moyenne en tirets (`4 5`, `1.5px`, couleur `--lab-info`) et une échelle de valeurs à droite réservant `88px`. Le libellé de moyenne est aligné sur son trait et précédé d'un petit tiret. Les dates extrêmes sont placées sous le graphe. Une mesure `null` ne crée aucune barre ; moins de deux mesures donnent un message « mesures insuffisantes » plutôt qu'un faux graphique.
- Les barres répondent au pointeur/clic par une infobulle courte avec date et valeur. Le SVG peut recevoir le focus ; `←/→`, `Home` et `End` parcourent les valeurs mesurées. Le résumé accessible indique nombre de périodes mesurées, moyenne et absence des trous. Le survol ne doit jamais être l'unique accès aux valeurs. Pour une courbe utilisée par un autre domaine, le trait se révèle en `820ms` et le mouvement réduit montre directement l'état final ; les barres Activity ne reçoivent pas cette animation de trait.

### 7. Bas de page et états

Le pied du shell annonce la dernière synchronisation ; ce texte est une information de provenance, pas un titre de section. En l'absence de journée mesurée récente, le radar, les indicateurs et les tendances sont remplacés par un état vide explicite ; les séances plus anciennes restent accessibles si elles existent. Les données absentes et les zéros explicites demeurent distincts. Une moyenne ne transforme jamais un jour non mesuré en zéro. Chargement, erreur, obsolescence et couverture partielle doivent garder des zones stables et des messages compréhensibles.

## Contrat à appliquer à Nutrition, Sommeil et Récupération

| Invariant commun | Adaptation autorisée |
|---|---|
| Un seul titre de page visible, même alignement, Georgia et contraste. | Nom de domaine, période utile en contrôle si le domaine l'exige. |
| Composition principale radar/explication à gauche, score à droite sur desktop ; ordre vertical radar puis score sur mobile. | Nombre d'axes, géométrie nécessaire à des labels longs, sens favorable des mesures, référence personnelle ou cible. Un radar n'est utilisé que s'il aide réellement à comprendre le score. |
| Valeur `/100`, moyenne ou référence directement dessous, rail à piste visible et remplissage blanc, détail accessible au clic. | Score indisponible, cible sans maximum naturel ou score qui n'est pas sur 100 : conserver la hiérarchie sans fabriquer une progression. Afficher confiance/couverture au niveau utile, y compris dans le détail. |
| Indicateurs centrés, répartis en colonnes égales, labels gris, valeurs blanches, explication dépliable si nécessaire. | Trois ou quatre faits selon le domaine ; journal de repas ou détail d'une nuit si la donnée doit être lue autrement. Ne pas forcer quatre faux indicateurs. |
| Pas de titre de section visible entre le titre de page, les indicateurs et les graphiques si les données et l'espace suffisent à orienter la lecture. | Un titre fonctionnel est permis quand il évite une ambiguïté réelle ou nomme une action. Les sections gardent toujours un nom accessible. |
| Graphiques sans cartes, titre de métrique centré, axes/moyenne/période lisibles, deux colonnes desktop et une colonne mobile. | Barres, lignes, répartition de phases ou autres tracés selon unités et phénomènes ; fenêtre temporelle réelle et couverture explicites. |
| Même palette noire/blanche/grise, Schibsted pour les labels, Azeret Mono pour les mesures, Georgia pour le titre, focus visible et mouvement réduit. | Couleur sémantique ponctuelle avec texte ou symbole, jamais une palette de domaine. |

### Données à substituer par domaine

| Page | Synthèse et axes réels | Faits et preuve métier | Tendances à adapter |
|---|---|---|---|
| Nutrition | Score nutritionnel fondé sur les repas confirmés dans Soma ; dimensions et confiance variables selon les observations. Le composant actuel expose cinq dimensions : ne pas recopier les poids fixes d'Activity. | Journal des repas, couverture et complétude, puis familles alimentaires, compléments et recettes selon leur utilité. Un repas absent ne devient jamais un repas de valeur nulle. | Historique du score et mesures nutritionnelles ; barres seulement si l'unité ou la comparaison les justifie. |
| Sommeil | Score reposant sur durée, efficacité et régularité ; dette de sommeil comme contexte explicatif, pas composante forcée. | Dernière nuit, horaires, besoin estimé, éveils et répartition des phases. | Durée, efficacité, régularité, fragmentation et sommeil profond/paradoxal ; fenêtres et nuits mesurées explicites. |
| Récupération | Score expliqué par HRV, fréquence cardiaque au repos et sommeil, comparés aux références personnelles. | Signaux récents et zones cardiaques ; afficher la source de santé et la référence personnelle lorsqu'elle existe. | HRV, fréquence cardiaque au repos, fréquence respiratoire ; type de tracé selon le sens de lecture et les jours mesurés. |

Ces lignes décrivent les données et composants présents dans le dépôt au moment de la cartographie, pas un ordre uniforme déjà livré. Nutrition utilise actuellement son propre shell ; Sommeil et Récupération utilisent `HealthPageShell`. L'uniformisation doit rapprocher le cadre et les comportements tout en préservant les calculs et preuves de chaque domaine.

### Ordre de décision pour chaque page

1. Nommer la question principale et les données sources ; distinguer les mesures de santé des calculs Soma.
2. Choisir les axes et le score réellement calculables. Ne pas inventer de cible, de valeur ou de composante pour imiter Activity.
3. Placer les faits les plus utiles juste après la synthèse ; conserver l'alignement et la densité commune même si le nombre varie.
4. Insérer une preuve métier seulement si elle aide à interpréter le score ; son type et son ordre précis suivent la réalité du domaine.
5. Choisir les séries temporelles et leurs graphes selon la donnée, avec même gabarit visuel et accès clavier.
6. Vérifier sur `/`, puis sur chaque page secondaire à `1440 × 900`, `390 × 844` et aux ruptures `1000`, `720`, `560px` ; contrôler focus, clavier, ouverture/fermeture, trous de données, chargement, vide, erreur et `prefers-reduced-motion: reduce`.

**Limite actuelle.** L'implémentation des trois pages se trouve sur une branche locale, pas sur `main`. Les captures locales permettent de vérifier la composition, mais pas une session authentifiée en production ni la lecture d'écran réelle.

## Sources de la cartographie

- `src/components/health/activity-details.tsx` : ordre DOM, données et séries.
- `src/components/health/activity-redesign.module.css` : grille, typographie, couleurs, espacements et responsive.
- `src/components/health/activity-radar.tsx` et `activity-radar.module.css` : géométrie, labels, zones de clic, clavier et dessin.
- `src/components/health/activity-score-overview.tsx` : score, panneau, focus et rail.
- `src/components/health/activity-benchmarks.tsx` et `activity-history.tsx` : indicateurs et preuve métier.
- `src/components/health/metric-trend-card.tsx`, `health-charts.tsx`, `health-charts.module.css`, `health-observatory.module.css` : tendances, moyenne, axes, infobulles et animation.
- `src/app/motion-system.css`, `src/app/observatory-deep.css`, `src/app/globals.css` : tokens et comportements de thème.
