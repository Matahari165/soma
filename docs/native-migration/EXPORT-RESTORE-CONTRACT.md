# Contrat de restauration native future

Le lot d’export natif est volontairement en lecture seule côté serveur. Il télécharge le JSON renvoyé par `GET /api/native/v1/account/export` et les archives référencées par `GET /api/native/v1/account/archive`.

Une restauration future devra être un lot séparé et ne devra jamais réutiliser directement ces routes `GET` comme mutation. Avant toute écriture, elle devra :

1. vérifier la version et l’intégrité du manifeste sans journaliser son contenu ;
2. afficher un aperçu des ajouts, conflits, données absentes et données ignorées ;
3. distinguer explicitement fusion et remplacement ;
4. demander une confirmation finale et créer une sauvegarde récupérable ;
5. utiliser une route versionnée, idempotente et transactionnelle avec journal d’audit sans données de santé ;
6. permettre une simulation sans écriture puis un retour arrière testé.

Le client actuel n’expose donc aucune action de restauration, suppression, fusion ou remplacement.
