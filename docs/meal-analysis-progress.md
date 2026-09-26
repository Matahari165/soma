# Parcours d’analyse d’un repas

## Diagnostic vérifié

Après « Analyze meal », `MealJournal` passe le repas en `accepted` et affiche la connexion. Le transport crée le repas si nécessaire, met à jour sa note et les commentaires, envoie les nouvelles photos, puis demande une analyse durable avec une clé d’idempotence. Le serveur répond `202` et lance le travail en arrière-plan. Le transport interroge ensuite le statut de cette demande jusqu’au résultat.

Un second mécanisme interroge les analyses déjà actives pour reprendre une session interrompue. Il démarrait également pendant la création d’une nouvelle analyse. Dès que le repas recevait son identifiant serveur, ce mécanisme pouvait récupérer son état `draft`, avant l’envoi des photos ou l’acceptation de l’analyse, et le réinjecter dans l’interface. L’écran de saisie remplaçait alors la progression, tandis que la première demande continuait. Le résultat finissait par arriver normalement.

La remise à jour de `initialData` pouvait aussi remplacer un repas en cours par un instantané antérieur.

## Comportement corrigé

- Une demande locale possède son suivi ; le mécanisme de reprise ne lit ni n’applique de réponse concurrente pour ce repas.
- Un rechargement conserve les repas en cours, tout en actualisant les autres repas.
- La progression reste affichée tant que la demande locale est active, même si un ancien statut de brouillon apparaît.
- Trois repères restent au même endroit : **Connexion**, **Analyse**, **Résultats**. La préparation des photos appartient à la connexion et l’attente du serveur à l’analyse.
- Chaque étape terminée porte une coche. Le changement d’étape anime brièvement le repère actif ; le mouvement réduit supprime ce déplacement.
- Le temps écoulé indique que l’attente continue sans annoncer de pourcentage ni de durée restante inventée.
- Sur Personal Lab, la dernière étape couvre la confirmation automatique existante : le résultat reste sur l’écran de progression pendant son enregistrement, puis apparaît une seule fois.
- Changer de jour ou quitter le journal invalide les réponses locales du jour précédent ; le travail serveur reste durable. Une relance qui rejoint un travail existant suit son identifiant de requête original.
- Les requêtes de confirmation ont un délai maximal de 15 secondes pour éviter un écran d’enregistrement bloqué indéfiniment.
- Une erreur d’enregistrement conserve l’analyse pour permettre une nouvelle confirmation. L’annulation reste possible avant l’enregistrement ; une ancienne réponse ne peut plus modifier une nouvelle tentative.

## Limites connues

En production, le travail durable expose `queued`, `running`, `completed` et `failed`. Les sous-étapes internes du modèle et de validation ne sont pas transmises au navigateur. L’interface reste donc sur **Analyse** pendant le travail du modèle. **Résultats** signifie ici l’enregistrement du résultat reçu, pas un flux de texte du modèle.

Le transport utilise toujours le suivi JSON (`stream: false`) et conserve sa limite d’attente existante. Le chemin SSE n’a pas été activé ni modifié. L’annulation quitte l’attente locale ; elle n’interrompt pas le travail déjà accepté par le serveur.

## Vérifications

- Tests unitaires de `LabMealCard` et du journal : conservation de la progression malgré un statut `draft`, étapes, sémantique accessible, annulation indisponible pendant l’enregistrement et contrats de transport existants.
- Navigateur partagé à 1440 × 900, 390 × 844 et 768 × 844 : connexion lente, attente, analyse, enregistrement lent, résultat ; absence de retour au formulaire et de débordement horizontal.
- Erreurs d’analyse et d’enregistrement, conservation du résultat non enregistré, annulation et changement de jour suivis d’une réponse tardive ; mouvement réduit à 768 px.
- Ces scénarios utilisent un serveur local de démonstration et des réponses API simulées. Ils ne constituent pas une preuve du comportement authentifié en production.

Pour reproduire sur le VPS, démarrer temporairement Soma avec `SOMA_LOCAL_PREVIEW=true` sur `127.0.0.1:3107`, puis lancer `node scripts/check-meal-analysis-progress.mjs`. `SOMA_QA_URL` permet de changer le port local et `SOMA_BROWSER_RUNTIME` de choisir le module du navigateur partagé. Le script refuse un hôte distant et vérifie le mode de démonstration. Arrêter le serveur après la vérification.
