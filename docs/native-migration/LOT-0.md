# Soma natif — lot 0 : cadrage et état de référence

**Statut : lot 0 clos le 19 septembre 2026.** Le cadrage initial repose sur le dépôt au commit `0b99912` et sur les contrôles de production décrits ci-dessous. Les limites d'archives, de restauration et de synchronisation sont des portes explicites des lots concernés, pas des preuves acquises.

Ce document fixe le périmètre de départ du chantier iPhone et Mac. Il ne décrit pas une migration déjà réalisée. Aucune donnée de santé réelle, aucun identifiant et aucun secret ne doivent être copiés dans ce dossier ou dans Git.

## 1. Objectif et preuve de fin

La première tranche native doit permettre de saisir ou corriger une journée sur iPhone, de la retrouver sur Mac et sur le Web, et d'obtenir les mêmes résultats analytiques pour la même période. Le site Web reste disponible pendant la transition. Le serveur Soma reste d'abord la source des calculs et des données synchronisées.

Le lot 0 est clos lorsque les décisions produit ci-dessous sont confirmées, que l'inventaire de production de la section 5 est renseigné **sans contenu personnel**, et que les parcours de la section 6 ont des exemples synthétiques de référence. Tant que l'inventaire de production manque, les lots qui modifient l'identité, le stockage ou l'ingestion de santé restent bloqués.

## 2. Décisions de départ

Ces décisions reprennent le plan de migration validé le 19 septembre 2026. Elles sont le cadre de travail des lots suivants ; les précisions marquées « à confirmer » restent des décisions explicites.

| Sujet | Décision de départ | À confirmer avant |
| --- | --- | --- |
| Transition | Web, iPhone et Mac coexistent jusqu'à preuve de parité. Aucun retrait du Web n'est inclus dans la première sortie. | Retrait éventuel du Web |
| Calculs | Scores, agrégats et Strongest Effects restent calculés côté serveur pour la V1. | Portage d'un calcul en Swift |
| Mac | Saisie et correction essentielles, avec davantage d'espace pour l'analyse. | Maquettes détaillées |
| iPhone | Saisie quotidienne, repas et photos, lecture des analyses ; HealthKit après la première tranche complète. | Permissions HealthKit |
| Hors ligne | Brouillons de journal et repas récupérables, photos en attente, résultats récents consultables. L'analyse peut attendre le réseau. | Contrat de synchronisation |
| Identité | Conserver les comptes existants ; ne jamais relier deux comptes sur la seule égalité d'une adresse email. | Authentification native |
| Données santé | Conserver source, unité, période et qualité ; une donnée manquante ne devient jamais zéro. | Ingestion Apple |

**Hors première tranche :** synchronisation complète de tout l'historique hors ligne, portage des calculs statistiques en Swift, notifications avancées, Apple Watch autonome, fonctions d'entraînement non confirmées comme parcours visible. Ces sujets restent dans le chantier global et devront être priorisés après la preuve iPhone ↔ Mac.

Références produit : [PRODUCT.md](../../PRODUCT.md), [DESIGN.md](../../DESIGN.md) et [PERSONAL_LAB.md](../../PERSONAL_LAB.md). `Strongest Effects` reste la priorité analytique ; l'identité native reprend l'Observatoire sans copier littéralement chaque grille Web.

## 3. Inventaire des surfaces et périmètre V1

| Parcours | iPhone V1 | Mac V1 | Suite du chantier | Référence actuelle |
| --- | --- | --- | --- | --- |
| Connexion, profil, déconnexion | Oui | Oui | Gestion détaillée des sessions | `src/app/login`, `src/app/settings`, `src/lib/cloudflare/session.ts` |
| Date active, vue du jour, journal, validation/correction | Oui | Oui | Édition avancée des variables | `src/app/page.tsx`, `src/app/api/lab/*` |
| Repas : note, état ignoré/enregistré, confirmation | Oui | Oui | Bibliothèque complète de recettes | `src/app/meals`, `src/app/api/meals/*` |
| Photos et analyse asynchrone d'un repas | Oui, caméra et photothèque | Oui, import de fichier | Optimisations d'envoi hors ligne | `src/services/meals.ts`, `src/app/api/cron/meal-analysis` |
| Strongest Effects : synthèse et preuve | Synthèse lisible et détail accessible | Vue complète, filtres et comparaison | Exploration supplémentaire | `src/app/analysis`, `src/app/api/lab/matrix` |
| Sommeil, récupération, effort | Résultat et tendance essentiels | Vues détaillées | Fonctions secondaires | `src/app/sleep`, `recovery`, `activity` |
| Connexions santé, fraîcheur et provenance | Statut et permissions utiles | Statut et sources | HealthKit après la première tranche | `src/app/api/health/*` |
| Export, suppression, confidentialité | Oui avant bêta externe | Oui avant bêta externe | — | `src/app/api/account/*` |

Pour chaque parcours livré, vérifier les états normal, chargement, vide, partiel/périmé, erreur, hors ligne et reprise. La date sélectionnée doit être commune au journal et aux repas. Un repas `skipped`, un repas absent, un brouillon et un repas confirmé ne sont pas interchangeables.

## 4. Carte des données et règles de provenance

Cette carte décrit le **code actuel**, puis la règle cible à spécifier dans les contrats API. « Cible » n'affirme pas que le comportement existe déjà.

| Domaine | Origine et stockage observés | Usage | Règle cible de conflit ou de provenance | État |
| --- | --- | --- | --- | --- |
| Compte, profil, préférences | `soma_users`, sessions, `profiles`, objectifs et préférences | Identité, date/fuseau, réglages | Identifiant serveur stable ; changement de profil versionné ; pas de fusion automatique par email | Identité réelle à inventorier |
| Journal, jours validés et variables | Saisie utilisateur ; `journal_entries`, `journal_days`, `journal_variables` | Saisie et corrélations | Fusion par date civile et variable ; validation explicite ; une correction recalcule les résultats | Fenêtre d'édition à décider |
| Imports du journal et check-ins | Import de feuille et saisie utilisateur ; `journal_imports`, `daily_checkins` | Historique et contexte d'analyse | Prévisualiser les imports et résoudre leurs conflits ; préserver `null` dans les check-ins | Hors première tranche |
| Repas, notes et ressentis | Saisie utilisateur ; `meals`, `meal_feelings`, recettes | Nutrition et journal | Conflit visible sur même date/créneau ; `skipped`, absent, brouillon et confirmé distincts ; mutation idempotente | Contrat à formaliser |
| Photos et analyses de repas | Photo privée R2, analyse IA côté serveur, purge prévue ; `meal_photos`, `meal_analyses` | Estimation puis confirmation humaine | Une analyse garde l'empreinte de sa note et de ses photos ; une ancienne réponse ne remplace pas une nouvelle saisie | Vérifier stockage réel |
| Google Health | OAuth et import serveur ; `health_records`, `daily_health_metrics`, archives | Mesures et scores | Conserver fournisseur, identifiant source, horodatage, unité et qualité ; dédupliquer avant agrégation | Activité réelle à vérifier |
| Apple Health actuel | Raccourci et route `/api/health/apple-sync`, résumés quotidiens | Mesures quotidiennes | **Ne pas réutiliser tel quel comme contrat natif** ; définir ingestion par échantillon, corrections, suppressions et priorité par mesure | Schéma/production à vérifier |
| Google Calendar | Connexion optionnelle, agrégats journaliers | Contexte d'analyse | Conserver provenance et fraîcheur ; déconnexion sans suppression implicite de l'historique | Activité réelle à vérifier |
| Scores, corrélations, briefs | Calculs serveur déterministes ; `daily_scores`, `correlation_results`, `briefs` | Strongest Effects et vues santé | Résultat serveur canonique, avec période, couverture, échantillon et incertitude | Parité à mesurer |
| Compléments et entraînements | Saisie/programmation ; routes `/api/supplements` et `/api/workouts` | Journal et activité | Conserver historique ; visibilité V1 des entraînements à confirmer | Hors première tranche |
| Archives, export, suppression | Archives R2, `/api/account/export`, `/api/account` | Portabilité et contrôle des données | Export complet vérifié ; suppression testée sur compte de test ; aucun secret dans l'export | État réel à vérifier |

L'adaptateur actuel place les tables métier dans `soma_rows` ; les anciens schémas SQL typés coexistent dans les migrations, mais la production utilise bien ce runtime JSON. Les applications natives ne doivent dépendre ni de `soma_rows` ni d'une table SQL directe : elles utiliseront une API versionnée. Sources : `supabase/migrations/20260913140000_soma_runtime_compatibility.sql`, `src/lib/cloudflare/db.ts`, `src/app/api/account/export/route.ts`.

**États non substituables dans tous les contrats :** champ absent ou `null` = non renseigné/indisponible selon le domaine ; `0` = mesure explicite ; repas `skipped` = omission déclarée et réversible ; repas `draft` = saisie non confirmée ; jour validé = admissible à l'analyse ; source périmée = valeur présente mais fraîcheur insuffisante. Les seuls repas confirmés et non ignorés contribuent aux totaux nutritionnels. Une analyse de repas doit rester récupérable après fermeture de l'app. Une relation statistique ne devient jamais une affirmation causale.

**Priorité entre sources de santé : non décidée.** Le code Apple actuel peut écrire directement des métriques quotidiennes (`src/app/api/health/apple-sync/route.ts`). Avant toute nouvelle ingestion, définir pour chaque type de mesure : source préférée, déduplication, correction, suppression, date civile et manière d'afficher une divergence. L'hypothèse « Apple gagne toujours » serait dangereuse et n'est pas retenue.

**Écarts de code à traiter avant les lots concernés :**

- Le sélecteur partagé présente sept jours, alors que l'écriture du journal est limitée à aujourd'hui et aux quatre jours précédents (`src/components/lab/personal-lab-journal-workspace.tsx`, `src/app/api/lab/entries/route.ts`). Le lot 1 devra fixer la fenêtre autorisée et le cas d'une journée déjà validée ; la recommandation produit est d'autoriser la correction explicite plutôt que de promettre une édition impossible.
- L'import Apple écrit `active_energy` alors que les calculs lisent `active_energy_kcal`, et la route ne déclenche pas de recalcul analytique (`src/app/api/health/apple-sync/route.ts`, `src/services/analysis.ts`). Ces écarts sont des risques observés dans le code, pas une panne confirmée en production.
- L'export JSON liste de nombreuses tables mais omet notamment `meal_recipe_templates`, `supplement_definitions`, `supplement_entries`, `lab_metric_preferences` et `lab_narrative_history` (`src/app/api/account/export/route.ts`). Sa couverture devra être vérifiée sur un compte de test avant de devenir le contrat d'export natif. `provider_connections` est aussi absent : ne jamais ajouter ses jetons à un export en clair.

## 5. Vérification de production et limites pour les lots suivants

Le dépôt et les données de démonstration ne prouvent pas l'état de la production. La configuration locale de ce checkout est en mode aperçu ; la vérification a été faite séparément dans les tableaux de bord Supabase et Cloudflare, en lecture seule. Aucune ligne individuelle, valeur de mesure, adresse personnelle ou clé n'a été copiée dans ce dossier.

**Déploiement vérifié le 19 septembre 2026 :** la liste Vercel indique un déploiement de production `READY` créé à 06:23 UTC pour le commit `0b999126d99360b937954b1b3ad7755af24e892e`. Cela établit la version déployée, pas le fonctionnement authentifié, les données ni l'exécution des tâches planifiées.

**Accès et routes vérifiés :** Wrangler n'est pas authentifié localement, mais le tableau de bord Cloudflare connecté est accessible en lecture seule. Une vérification HTTP sans contenu personnel a obtenu `200` pour `/`, une redirection vers l'authentification pour `/api/health/apple-sync` et `/api/account/export`, et `401` pour `/api/cron/sync` sans secret. Ces réponses prouvent seulement que les routes existent et protègent ces accès ; elles ne prouvent aucun import ni traitement effectif.

**Constats Supabase du 19 septembre 2026 :** le compte et les sessions ont été comptés sans lire d'identifiant ; les volumes par table logique, la fraîcheur des données dérivées, les fournisseurs et les états des traitements ont été inspectés sous forme agrégée. Le runtime contient physiquement `soma_users`, `soma_sessions` et `soma_rows` ; les anciennes tables métier typées vérifiées ne sont pas présentes. Les enregistrements de santé ont plusieurs provenances, dont une historique : la migration native doit préserver l'identité de chaque source. Un champ de synchronisation Apple existe dans le profil logique, mais les contrôles n'ont montré ni connexion Apple enregistrée ni valeur écrite sous l'ancien champ `active_energy`. Un manifeste d'archive R2 existe et les photos répertoriées sont marquées purgées ; l'existence des objets R2 eux-mêmes n'a pas été testée. Les volumes détaillés et les dates des mesures restent hors Git.

`pg_cron` et `pg_net` sont installés. Une tâche `soma-sync-worker` est active toutes les cinq minutes ; ses cinq derniers lancements sont marqués réussis par PostgreSQL. Ce statut ne certifie pas la réponse HTTP de Vercel. Aucune tâche Supabase d'analyse des repas n'a été trouvée sous le préfixe `soma`.

**Constats Cloudflare du 19 septembre 2026 :** le compartiment `soma-health-record-archives` existe et contient des objets ; ni leurs noms ni leurs contenus n'ont été ouverts. Le Worker `soma` est déployé, cible l'application Vercel et possède un déclencheur chaque minute. L'historique récent des déclenchements indique `Success`. Le code actuel de ce Worker appelle notamment `/api/cron/sync` à chaque déclenchement ; le planificateur Supabase appelle aussi cette route toutes les cinq minutes. **Deux sources de déclenchement coexistent donc en production et peuvent produire des appels redondants.** Le statut Cloudflare ne prouve pas à lui seul le contenu ni la déduplication de chaque synchronisation ; confronter les journaux HTTP avant toute modification du planificateur.

| Contrôle en lecture seule | Résultat attendu dans ce dossier | Statut |
| --- | --- | --- |
| Identité et sessions | Nombre de comptes et sessions actives **agrégé**, sans email ni identifiant | Vérifié dans Supabase ; chiffres hors Git |
| Stockage métier | Nombre de lignes par `table_name` dans `soma_rows`, dates min/max et variantes de schéma pertinentes | Tables et volumes vérifiés ; variantes historiques encore à caractériser avant le contrat API |
| Sources santé | Fournisseurs réellement présents, types de mesures, couverture et dernières synchronisations **agrégés** | Vérifié dans Supabase ; détails personnels hors Git |
| Apple actuel | Existence effective du champ de jeton, du fournisseur et des données importées ; compatibilité de colonnes | Champs et connexion vérifiés ; ingestion native toujours à concevoir |
| Photos et archives | Volumes et statuts R2, manifestes orphelins, possibilité d'export restaurable | 1 manifeste R2 et 33 photos toutes purgées dans l'inventaire agrégé ; correspondance des objets et restauration non vérifiées |
| Traitements planifiés | Vérifier lequel du Worker Cloudflare et de `pg_cron` appelle effectivement les routes Vercel ; éviter les doubles exécutions | Les deux planificateurs sont actifs ; vérifier les appels HTTP et la déduplication avant changement |
| Export | Export d'un **compte de test**, contrôle des tables et des fichiers référencés, sans versionner son contenu | Export authentifié vérifié : 1 profil, 1 entrée de journal, 1 jour de journal et 1 repas ignoré ; fichiers d'archive et photos absents de ce compte |

Le code prévoit un Worker Cloudflare qui réveille les routes Vercel (`cloudflare/worker.ts`, `cloudflare/cron-pipeline.ts`) ; `supabase/setup/schedule_sync.sql` contient aussi une configuration `pg_cron`. La production confirme la présence simultanée des deux planificateurs. Les tables typées historiques absentes ne sont pas le contrat du runtime actuel : toute correction de la route Apple devra viser le stockage réellement utilisé.

**Preuve synthétique locale du 19 septembre 2026 :** le test ciblé `src/app/api/account/route.test.ts` passe pour un repas exporté en mode aperçu ; les deux tests de `src/domain/health/archive-script.test.ts` passent pour l'encodage, le décodage et les empreintes d'une archive inventée. Ce mode aperçu n'exerce ni l'export authentifié de production ni la correspondance entre manifeste SQL et objet R2. Le code expose le téléchargement d'une archive autorisée, mais aucun parcours de réimport d'un export complet n'a été trouvé ; `/api/lab/import` importe seulement un journal depuis une feuille.

**Mise à jour du 19 septembre 2026 :** un compte de test distinct a été créé et sa session Web fonctionne. Google Health et Google Calendar sont indiqués comme non connectés ; aucune connexion externe n'est nécessaire pour contrôler l'export de base. Un export authentifié de production a téléchargé un JSON valide avec profil et journal. Une entrée de journal inventée persistait après rechargement et figurait dans l'export. Les catégories de santé, archives et photos étaient vides, comme attendu sans source connectée ni fichier ajouté.

Ce contrôle a découvert que l'export incluait une clé privée de synchronisation Apple générée pour le profil. La correction a été fusionnée par la PR #20, CI et aperçu Vercel verts, puis déployée sur le commit `bba38e0072e7672d9ab86720ae44d010e1d6d316`. Un nouvel export du même compte confirme l'absence du champ de clé. Les fichiers JSON téléchargés pour ces contrôles ont été supprimés localement après lecture de leur structure et des nombres de lignes ; aucun contenu ni identifiant n'a été ajouté au dépôt.

**Contrôle complémentaire de production :** la base contient un repas marqué `skipped` créé pendant l'essai de Nutrition Log, avec un propriétaire renseigné et cohérent avec le journal et le profil du compte de test. Un nouvel export authentifié de ce compte contient un profil, une entrée et un jour de journal, ainsi que ce repas `skipped`. Le champ de clé Apple en est absent. L'écart observé dans l'export précédent ne se reproduit pas ; sa cause n'est pas établie et aucune correction du stockage n'a été faite sur cette seule observation. Le nouvel export JSON a été supprimé après vérification de sa structure et de ces nombres, sans copie de données individuelles dans Git.

L'inventaire agrégé actuel compte 27 catégories logiques. Il confirme un manifeste d'archive R2 et 33 photos toutes marquées purgées. Le compte de test ne contient ni archive ni photo : la correspondance entre manifeste et objet R2, l'accès à un fichier et la restauration sont hors du périmètre de clôture du lot 0. Ces preuves seront exigées avant de promettre une portabilité complète dans l'application native.

**Méthode de preuve :** lecture de métadonnées et de comptes agrégés avec les requêtes [PRODUCTION-READONLY.sql](PRODUCTION-READONLY.sql) ; aucun nom, email, jeton, échantillon de santé ou photo dans les captures et les commits. Utiliser un compte de test pour les parcours et conserver les exports hors Git. Inscrire date, environnement et méthode de chaque contrôle lorsque l'accès sera disponible.

## 6. Parcours et exemples synthétiques de référence

Les cas ci-dessous sont inventés pour tester les règles, sans donnée personnelle réelle. Ils seront traduits en fixtures de contrat au lot 1, lorsque les formes de l'API seront définies.

| Cas | État de départ | Action | Résultat attendu |
| --- | --- | --- | --- |
| A — date commune | Jour J ouvert sur iPhone | Passer à J−1, saisir une habitude puis ouvrir Repas | Journal et repas montrent J−1 ; aucune donnée de J n'est modifiée |
| B — absence, zéro, repas ignoré | Une habitude non renseignée, une mesure explicite `0`, déjeuner `skipped` | Synchroniser puis lire sur Mac | Trois états distincts ; aucun n'est transformé en valeur par défaut ; déjeuner absent des calories confirmées |
| C — interruption | Repas brouillon avec note et photo, réseau coupé | Fermer l'app, la rouvrir, rétablir le réseau | Brouillon récupéré, un seul envoi, statut d'analyse suivi jusqu'au résultat ou à l'erreur |
| D — conflit | Même variable du jour modifiée sur Mac pendant que l'iPhone est hors ligne | Reconnecter l'iPhone | Conflit explicite ou fusion déterministe documentée ; aucune écriture silencieusement perdue |
| E — santé multi-source | Deux fournisseurs donnent une mesure pour le même jour | Réimporter puis corriger une source | Provenance visible, aucune duplication, règle de priorité stable, score recalculé |
| F — analyse | Même compte, période et jeux de données sur Web, Mac et iPhone | Ouvrir Strongest Effects | Même résultat, même taille d'échantillon et même incertitude ; présentation adaptée à l'écran |
| G — portabilité | Compte de test avec journal, repas et archive | Exporter puis contrôler l'archive | Toutes les catégories attendues sont présentes et les liens/fichiers accessibles selon leur politique de conservation |

## 7. Portes d'entrée des lots suivants

1. **Lot 1 — API et modèles :** réaliser B, D et F avec des exemples synthétiques ; documenter dates, unités, valeurs inconnues et erreurs.
2. **Lot 2 — connexion :** prouver qu'un compte existant reste unique et qu'une session d'appareil peut être révoquée.
3. **Première tranche native :** prouver A, B et F sur iPhone, Mac et Web avec un compte de test.
4. **Repas et photos :** prouver C et G, y compris interruption et purge selon la politique existante.
5. **HealthKit :** n'ouvrir E qu'après inventaire de production, règle de priorité par mesure et essai sur vrai iPhone.

Les validations visuelles suivront `DESIGN.md` à 390 × 844 sur iPhone et 1440 × 900 sur Mac, puis VoiceOver, clavier/focus, texte agrandi, réduction du mouvement, états partiels et erreurs. Les vérifications Git, API, appareils et production seront rapportées séparément.
