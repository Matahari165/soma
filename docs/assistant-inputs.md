# Accès aux données de l’assistant

L’assistant utilise les mêmes outils depuis le chat et les délégations vocales. Une demande sans temporalité utilise **90 jours**, indépendamment du filtre affiché. Une période explicitement demandée reste prioritaire. « Depuis un mois » désigne 30 jours glissants ; « le mois dernier » le mois civil précédent, dans le fuseau du profil.

## Outils de lecture

- `getDataCatalog` : catalogue de métriques typées et types d’activités ; aucune valeur personnelle n’est chargée. Ce catalogue est une liste de capacités, pas une garantie de données reçues.
- `querySomaData` : détails ciblés par période, métriques et types d’activités. Les filtres et projections sont appliqués avant pagination.
- `summarizeSomaData` : agrégation des pages côté serveur, avec checkpoints persistés dans les lignes logiques `assistant_data_jobs`. Les requêtes et leurs reprises sont liées au propriétaire et à leur empreinte. Une reprise concurrente utilise une comparaison de version ; elle ne peut pas enregistrer deux fois une page. `includeHeartRateZones` active les zones calculées des séances sélectionnées.
- `queryLabAnalyses` : analyses sur 15, 30, 90 jours et tout l’historique, filtrées par variable d’influence ou de résultat. Le défaut est `[90]`. Les associations exploratoires sont accessibles explicitement. Les fenêtres sont calculées séparément avec le moteur statistique canonique. La pagination des détails est explicite.
- `getActivityTelemetry` : détail d’une séance appartenant au compte, avec zones Soma Z1–Z5, FC maximale et origine du seuil, pauses, lacunes et couverture. Les échantillons manquants peuvent être récupérés et stockés par le service Google Health existant.
- `queryRawHealth` : données Google Health sources d’un type et d’une plage horaire. Lecture par partitions UTC quotidiennes, avec archives R2 vérifiées et déduplication. Les curseurs sont signés et liés au compte et à la requête. Un champ volumineux omis est signalé par `payloadComplete=false`.
- `searchConversation` : recherche dans les messages d’origine de la conversation courante et récupération de références aux pièces jointes.
- `readConversationMessage` : lecture du texte original par référence, avec pages bornées et positions explicites, uniquement dans la conversation et le compte courants.
- `reopenConversationImage` : réouverture ciblée d’une ancienne image de la conversation, avec vérification d’appartenance, statut et intégrité. L’image est transmise via la sortie multimodale SDK ; ses octets ne figurent pas dans le résultat d’outil sauvegardé.

## Mémoire et limites

La mémoire de conversation est distincte des souvenirs personnels confirmés. La synthèse structurée locale sert d’index ; les messages d’origine et les corrections restent consultables. Elle n’autorise aucune action et ne transforme pas une suggestion de l’assistant en déclaration utilisateur.

Les synthèses d’historique ont un délai global de 20 secondes, dès la recherche du checkpoint, propagé aux lectures Google et aux attentes de stockage. Chaque page cardiaque est enregistrée avant sa continuation persistée. Une interruption conserve la séance non comptée et reprend sa prochaine page ; une panne de source, même sur la première page, reste explicitement en attente. `status=running` et `manifest.complete=false` désignent un résultat partiel. Le même `jobId` et la même requête permettent de reprendre après interruption ; le résultat final n’est annoncé exhaustif qu’après la dernière page. Aucun worker de traitement n’est lancé sans requête.

Les zones sont calculées sur toutes les mesures disponibles, avant réduction de la courbe envoyée au modèle. Les quatre catégories du fournisseur sont distinctes des cinq zones Soma. Une couverture absente ou partielle ne devient jamais zéro. Un changement de FC maximale entre séances figure parmi les références utilisées dans l’agrégation.

Les statistiques de synthèse sont descriptives. Les sommes ne sont pas des scores physiologiques ; les moyennes portent sur les valeurs observées, pas sur les jours absents. L’état terminé concerne le parcours de la requête, pas la complétude de la source de santé.

L’historique daté des snapshots d’analyses demeure limité à la fenêtre de 90 jours. Il ne faut pas le confondre avec la comparaison actuelle des quatre fenêtres analytiques.

La pagination brute complète les groupes de timestamps à la frontière avant de comparer les identifiants localement. Un groupe de plus de 2 000 enregistrements produit une erreur explicite, jamais une fin de parcours artificielle.
