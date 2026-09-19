# Soma natif — lot 3 : contrat Personal Lab

**Statut : contrat serveur localisé sous `/api/native/v1/lab`.**

Ce lot expose les données du Personal Lab aux applications iPhone et Mac. Toutes les routes exigent un jeton de session dans `Authorization: Bearer ...`. Un cookie Web ne suffit pas. Le serveur conserve l'autorité sur les données et les calculs.

## Routes

### `GET /api/native/v1/lab/day?date=YYYY-MM-DD`

Retourne une journée civile dans le fuseau du profil :

```json
{
  "date": "2026-09-18",
  "timezone": "Europe/Zurich",
  "journal": {
    "variables": [],
    "entries": [],
    "day": null
  },
  "meals": {
    "breakfast": null,
    "lunch": null,
    "dinner": null,
    "snack": null
  }
}
```

`journal.entries` contient seulement les observations de cette date. Une absence reste absente ; une valeur `0` ou `false` reste une observation explicite. `journal.day` reste `null` lorsqu'aucun état de journée n'existe. Le client ne doit pas transformer `defaultValue` d'une variable en observation.

Chaque créneau repas absent vaut `null`. Un repas présent transporte `entryState` (`recorded` ou `skipped`) et `status` (`draft` ou `confirmed`). Un repas `skipped` reste visible mais ne contribue pas aux agrégats nutritionnels.

### `PUT /api/native/v1/lab/journal`

Le corps réutilise le contrat serveur du journal Web :

```json
{
  "entryDate": "2026-09-18",
  "mode": "draft",
  "entries": [
    { "variableId": "uuid", "value": 0 },
    { "variableId": "uuid", "value": false },
    { "variableId": "uuid", "value": null }
  ]
}
```

`null` retire l'observation et devient une omission explicite lorsqu'elle est validée. Une journée déjà validée reste validée lorsqu'elle est corrigée. La fenêtre d'écriture actuelle est aujourd'hui et les quatre jours précédents, selon le fuseau du profil.

La réponse contient `ok`, `status`, les compteurs `saved`/`omitted` et le jour canonique relu par le serveur.

### `GET /api/native/v1/lab/matrix?period=15|30|90|all`

Cette route appelle `getPersonalLabSnapshot`, le même service que `/api/lab/matrix`. Elle retourne exactement `{ rows, outcomes, periods }`. Les jours non validés restent exclus du journal analytique ; les zéros explicites restent inclus ; les repas `skipped` restent exclus des séries nutritionnelles.

## Erreurs

- `401` : Bearer absent, expiré, invalide ou révoqué.
- `400` : date, période ou corps de journal invalide.
- `500` : service Personal Lab indisponible ; les détails internes ne sont pas exposés.

## Preuves locales

`src/app/api/native/v1/lab/lab-api.test.ts` vérifie :

- Bearer obligatoire sur les trois routes ;
- date commune et fuseau retournés ;
- conservation de `0`, `false`, omission et `skipped` ;
- écriture journal puis relecture canonique ;
- même payload matrix et même appel `getPersonalLabSnapshot` que le Web ;
- rejets des dates, périodes et corps invalides.
