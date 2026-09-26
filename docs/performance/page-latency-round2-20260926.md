# Latence des pages — seconde passe du 26 septembre 2026

> Correction demandée après cet audit : les titres participent désormais à un fondu commun de 420 ms à l’ouverture des pages. Les chiffres d’animation de ce rapport décrivent le build mesuré avant cette correction. Les optimisations des lectures et réponses restent conservées.

## Périmètre autorisé

Priorité à l’accueil, Nutrition, Activité, Sommeil et Récupération. Les points 2 à 6 de l’audit sont retenus. Analyse conserve son rôle de laboratoire : réponse initiale allégée, preuves détaillées disponibles à la demande. Aucun calcul d’Analyse n’est préparé à la synchronisation.

Les changements sont développés dans des branches locales isolées. Cette passe ne publie pas l’application et ne modifie pas les données personnelles.

## Référence mesurée avant cette passe

Mesures sur un build Next optimisé local, données de démonstration, six ouvertures par page (trois par format). Elles ne représentent pas la latence de Supabase/Vercel pour un compte réel.

| Observation | Mesure de référence |
| --- | --- |
| Accueil après le rendu serveur | GET `/api/meals` et GET `/api/nutrition-targets` à chaque ouverture |
| Nutrition après le rendu serveur | GET `/api/nutrition-targets` malgré la lecture serveur |
| Analyse, réponse JSON brute | 3 554 291 octets |
| Analyse, même JSON compressé en gzip hors réseau | 75 435 octets |
| Analyse, requête locale de matrice | 1,47 à 2,11 secondes |
| Nutrition, titre présent mais encore en fondu | 505 à 833 ms sur les trois essais d’animation |

La matrice de référence contient 138 lignes pour la période de 90 jours, 15 résultats et 2 070 relations. Les quatre choix de période ne signifient pas que quatre matrices sont calculées à l’ouverture. Le serveur de mesure local n’envoyait pas cette réponse compressée ; la compression Vercel reste à vérifier après publication.

Un second essai contrôlé utilise 84 repas synthétiques sur 28 jours, trois analyses terminées par repas et 150 ms de délai artificiel par appel. L’ancien lecteur effectue quatre appels répartis en deux étapes, pour une médiane de 357 ms et 804 276 octets reçus. Cet essai isole le coût des allers-retours et des analyses historiques ; il ne permet pas de promettre le même gain en production.

Après intégration du nouveau lecteur, une comparaison des deux chemins dans le même processus (cinq essais par chemin, mêmes repas) donne :

| Repas, essai contrôlé | Ancien lecteur | Lecture groupée |
| --- | ---: | ---: |
| Appels par lecture | 4 | 1 |
| Durée médiane, délai artificiel de 150 ms par appel | 404 ms | 162 ms |
| Octets reçus, JSON non compressé | 804 276 | 298 005 |

La réduction des octets est de 63 %. Les 84 objets de repas retournés sont identiques dans cet essai, notamment les photos, les ressentis et les analyses. Le temps SQL réel et le réseau Vercel/Supabase ne sont pas reproduits par le délai artificiel.

Sur le build optimisé servi localement, la projection compacte d’Analyse a également été comparée à la réponse riche produite par le même calcul de démonstration, sans changer les 138 lignes et 2 070 relations :

| Analyse, même matrice synthétique | Réponse riche | Réponse compacte |
| --- | ---: | ---: |
| JSON brut | 3 554 291 octets | 1 308 542 octets |
| Gzip calculé hors réseau | 75 435 octets | 36 255 octets |

Cela représente −63,2 % en JSON brut et −51,9 % en gzip. Les preuves complètes sont obtenues à l’ouverture d’une relation. Cette mesure isole la taille de réponse ; elle ne démontre pas une réduction équivalente du temps de calcul.

## Changements et comportements à conserver

- Accueil : l’activité complémentaire doit pouvoir arriver après le titre et les scores. La connexion aux fournisseurs ne doit pas retenir ces informations lorsqu’elle ne sert pas à les construire.
- Journal : réutiliser les repas et cibles déjà chargés sur le serveur pour le jour initial. Les autres jours, les brouillons, les photos, les analyses en cours et l’actualisation des cibles doivent rester fonctionnels. Une erreur serveur doit conserver la récupération côté navigateur.
- Nutrition : commencer la lecture de l’objectif pendant la lecture du profil et transmettre les cibles ajustées déjà calculées au journal.
- Repas : une lecture bornée réunit les repas et leurs enfants ; seules les analyses nécessaires à l’affichage et à la dernière analyse réussie sont transférées. Une fonction SQL absente autorise l’ancien lecteur, une erreur de permission ou d’exécution doit rester une erreur.
- Analyse : conserver les mêmes calculs, critères d’affichage et classements. Les preuves ouvertes doivent correspondre à la génération de la liste affichée et au compte connecté.
- Animation : titre et valeurs essentiels lisibles dès leur arrivée ; garder les mouvements secondaires et le respect du mouvement réduit.

## Effet concret dans l’application

1. **Analyse** : la liste conserve ses relations, effets, filtres et classement. Ouvrir une relation déclenche une lecture supplémentaire pour ses preuves complètes, avec chargement, erreur et nouvelle tentative. Si les données ont changé depuis la liste, l’application demande de recharger cette période avant d’ouvrir le détail. Aucun calcul n’est déclenché par la synchronisation.
2. **Repas** : l’historique borné utilise une seule lecture groupée. Il conserve l’analyse en cours ou en erreur la plus récente ainsi que la dernière analyse réussie utile aux totaux. Les anciennes analyses inutiles à cet affichage ne transitent plus à chaque lecture.
3. **Accueil** : titre et scores n’attendent plus le résumé des activités récentes. Cette zone garde une place pendant le chargement ; une erreur de ce résumé ne transforme pas les activités en zéro et ne bloque pas le reste. Les connexions aux fournisseurs ne sont plus lues pour construire cet écran.
4. **Journal et Nutrition** : les repas du jour et les cibles fraîches déjà calculés côté serveur sont réutilisés. Chaque changement de jour relit les repas correspondants, y compris le retour à aujourd’hui ; une réponse tardive du jour précédent ne remplace pas le jour affiché. Les cibles restent actualisées toutes les 60 secondes ; les modifications locales, notes et photos restent conservées au retour sur le même repas. Un échec de lecture des cibles côté serveur conserve la récupération côté navigateur.
5. **Ouverture des pages** : un fondu commun de 420 ms révèle doucement le contenu, titres compris, sans décalage ni découpage des mots. Les graphiques gardent leurs animations de données ; le réglage de mouvement réduit supprime le fondu.

## Migration précédente

La migration des premiers agrégats et son prérequis de révision atomique ont été appliqués à la base le 26 septembre, sous le nom `backend_read_aggregates_with_atomic_matrix_revision` (version `20260926143037`). Les index, droits des fonctions et déclencheur ont ensuite été contrôlés. Aucun jeu de repas synthétiques n’a été inséré dans cette base.

Le rapport de la première passe décrit l’état antérieur à cette application. L’application avec ces optimisations reste locale tant que la branche n’est pas publiée puis fusionnée.

## Migration de cette passe

`20260926151553_meal_list_read_aggregate.sql` a été appliquée sous le nom `meal_list_read_aggregate`, version distante `20260926160112`. Elle ajoute une fonction de lecture et ses droits ; elle ne modifie pas les repas existants. Contrôles distants séparés : résultat JSON scalaire, sécurité invoker, chemin de recherche vide, exécution réservée à `service_role`, aucun droit `anon`/`authenticated` et réponse vide pour un identifiant fictif inexistant.

Les fixtures transactionnelles ont été exécutées seulement en local dans PGlite : 1 004 repas, isolation des propriétaires, sélection des deux analyses utiles, absence de doublon quand l’analyse la plus récente est réussie, photos et ressentis, champs manquants et droits. La requête D1 exacte a également été exécutée dans SQLite en mémoire sur 1 004 lignes. Le tableau JSON scalaire évite de tronquer la réponse à 1 000 lignes au niveau REST.

## Limites des gains démontrés

- Les gains les plus solides sont structurels : deux appels initiaux supprimés sur l’accueil, un sur Nutrition, quatre lectures de repas réunies en une, et moins d’octets pour Analyse. Ils ne dépendent pas d’un chronométrage isolé du navigateur.
- Les calculs statistiques d’Analyse restent complets. Une ouverture sans cache peut encore prendre du temps ; cette passe ne promet pas de réduire ce calcul de 63 %.
- Les essais de navigation utilisent des données synthétiques et un serveur Next optimisé local. Ils excluent l’authentification d’un compte réel, le réseau vers Supabase, les démarrages Vercel à froid et le temps d’une analyse de photo.
- Le mode de démonstration interdit les écritures distantes. La génération du conseil de l’accueil reçoit ainsi un refus attendu ; son message de repli peut déplacer le contenu. Ce cas ne mesure pas le service de conseil en production.

## Vérification finale

Le contrôle intégré final `CI=true pnpm verify` passe : lint sans avertissement, TypeScript, **203 fichiers / 1 244 tests**, puis build Next optimisé. Les tests du journal reproduisent les lectures et mutations tardives après changement de jour, la récupération de notes/photos après un échec et la confirmation serveur qui remplace un ancien brouillon.

Sur le build final, les interactions en navigateur ont également passé :

- accueil : aucun GET repas/cibles supplémentaire à l’ouverture ; note et photo locale conservées après actualisation et changement de jour ; erreur de lecture puis nouvelle tentative ; retour au jour initial sans chargement bloqué ;
- Nutrition : aucune seconde lecture initiale des cibles ;
- Analyse : une lecture compacte initiale, détails ouverts au clavier et focus rendu à la fermeture, erreur puis nouvelle tentative, génération périmée signalée, réponse tardive sans réouverture d’un détail fermé et réutilisation de la période déjà chargée.

Les captures finales obligatoires à 1 440 × 900 et 390 × 844 ont été inspectées : titre, activité et valeurs des anneaux lisibles ; aucun débordement horizontal observé. Sur mobile, la partie basse de la composition se parcourt en défilant avec la navigation fixe. Les captures finales mobiles de Nutrition, Activité, Sommeil et Récupération ont aussi été inspectées : titres, radars et scores lisibles. La largeur intermédiaire de 720 px avait été inspectée pendant l’intégration. Le seul refus réseau des contrôles visuels finaux est le conseil de l’accueil interdit par le mode de démonstration ; aucun avertissement d’hydratation observé.

Une première capture mobile de Récupération omettait la barre de navigation malgré sa présence dans le DOM. Le contrôle ciblé suivant a montré la barre visible et fonctionnelle, avec ouverture de « Plus » puis navigation vers Sommeil ; aucune panne de navigation n’a été reproduite. Une disparition observée sur un appareil réel reste à investiguer, l’incohérence des captures seule ne permettant pas d’en attribuer la cause à l’application.

### Mesures finales d’ouverture

[Les 36 mesures brutes, sans données personnelles](page-latency-round2-20260926-measures.json) sont conservées avec ce rapport.

36 ouvertures séquentielles : trois par page et par format, contexte navigateur neuf à chaque ouverture, sans limitation artificielle du réseau ou du processeur. Aucun autre test de cette tâche ne tournait en parallèle. Le serveur local était déjà démarré : ces mesures ne reproduisent pas un démarrage Vercel à froid.

Valeurs en millisecondes : médiane, puis minimum–maximum entre parenthèses. « Premier octet » mesure le début de réponse HTML ; « élément principal » correspond au LCP du navigateur. Le LCP ne garantit pas que tous les calculs ou toutes les sections sont terminés.

| Page | Premier octet, ordinateur | Élément principal, ordinateur | Premier octet, mobile | Élément principal, mobile |
| --- | ---: | ---: | ---: | ---: |
| Accueil | 96 (95–96) | 744 (744–764) | 86 (84–108) | 672 (592–672) |
| Nutrition | 72 (69–95) | 568 (300–576) | 67 (60–79) | 208 (192–252) |
| Activité | 47 (45–84) | 540 (224–632) | 44 (43–50) | 204 (148–264) |
| Sommeil | 63 (40–76) | 252 (224–496) | 45 (39–56) | 188 (156–220) |
| Récupération | 61 (51–81) | 232 (212–576) | 54 (51–60) | 168 (160–240) |
| Analyse | 23 (16–25) | 1940 (1924–1972) | 19 (14–30) | 2164 (2068–2196) |

Sur les 36 ouvertures : réponses HTML 200, aucune exception JavaScript de page, aucun débordement horizontal. L’attente mesurée entre présence du titre et opacité complète est de **0 à 38 ms** ; les essais de référence Nutrition montraient 505 à 833 ms.

L’accueil et Nutrition ne déclenchent aucun GET `/api/meals` ou `/api/nutrition-targets` au chargement initial dans les six essais de chaque page. Analyse déclenche un seul GET de matrice compacte et aucun détail avant ouverture d’une relation. Sa lecture de matrice prend 1,58 à 1,67 seconde sur ces données synthétiques : le calcul reste le principal coût visible de cette page.

Le déplacement de mise en page observé (CLS) atteint 0,040 sur l’accueil mobile dans le mode de conseil indisponible, contre moins de 0,002 sur les autres pages. Trois essais par format suffisent ici à vérifier les appels et animations ; ils ne constituent pas un p95 de production.

Les navigateurs et serveurs locaux lancés pour cette tâche ont été arrêtés. Les changements applicatifs sont sauvegardés dans la branche locale `codex/page-latency-round2-20260926`. Aucun push, fusion ou déploiement de l’application n’a été effectué.
