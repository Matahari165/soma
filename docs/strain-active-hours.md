# Strain quotidien

Le score `effort-v5` combine quatre objectifs indépendants, chacun à 25 % : 10 000 pas, 45 minutes actives en zone, 10 minutes de renforcement enregistré et toutes les heures éveillées écoulées actives. Chaque progression est plafonnée ; un dépassement ne compense aucun autre objectif. 100 exige les quatre objectifs atteints. Une mesure indisponible rend le score partiel, sans fabriquer un zéro.

## Heures actives

- Une heure civile locale est validée avec 100 pas ou 60 secondes cumulées classées `LIGHTLY_ACTIVE`, `MODERATELY_ACTIVE` ou `VERY_ACTIVE` par Google.
- Les intervalles sont découpés aux frontières horaires, dédupliqués et unis. Le sommeil est exclu. Les jours de changement d’heure conservent leurs 23 ou 25 heures réelles.
- Une preuve positive suffit à valider une heure. Pour conclure « objectif non atteint », il faut des observations explicites couvrant au moins 5/6 du temps éveillé de l’heure. Sinon l’heure reste inconnue.
- L’heure courante reste en cours. Les heures futures ne sont pas affichées. Entre deux imports, les nouvelles heures écoulées sont recalculées et restent inconnues sans preuve ; le score ne conserve pas un ancien 100.
- Le radar contient uniquement les quatre composantes du score. Le suivi horaire et sa légende prolongent la synthèse sans carte supplémentaire. La course depuis lundi, la charge et le ratio restent des indicateurs séparés.

## Synchronisation et compatibilité

`/api/cron/active-hours` utilise la même authentification serveur que les autres tâches planifiées. Il collecte uniquement les pas et niveaux d’activité sur une fenêtre récente de 48 heures, toutes les 15 minutes, avec pagination et budgets bornés et verrou indépendant. Le worker d’horloge appelle cette route Vercel ; aucun hébergement de l’application n’est ajouté.

Les pas intrajournaliers portent une provenance distincte : ils servent aux heures actives et ne sont pas ajoutés aux totaux quotidiens déjà agrégés. La matérialisation stocke le résumé, les minutes de renforcement et les entrées du score dans `daily_scores.drivers`. Home et Strain utilisent le même lecteur. Les scores précédents ne sont pas présentés comme des scores issus des nouveaux objectifs. Le calcul historique de charge est conservé séparément pour la charge hebdomadaire et les besoins nutritionnels.

## Validation avec la montre

Les seuils horaires sont expérimentaux. Sur sept jours, comparer quelques marches courtes, séries de pompes, squats, périodes assises et périodes sans montre aux heures observées. Noter les heures attendues dans un support personnel ; ne pas ajouter de données de santé aux journaux techniques. Ajuster les seuils selon les activités manquées et les fausses validations. Le rythme cardiaque seul ne valide aucune heure et aucun flux cardiaque brut supplémentaire n’est importé.

La disponibilité dépend de la synchronisation de la montre avec Google. Cette implémentation ne garantit pas la reconnaissance de séries très courtes et ne mesure pas directement la posture assise.
