# Soma natif — lot 3 : première tranche iPhone et Mac

**Statut : socle local implémenté et vérifié sur simulateur iPhone et build Mac ; preuve authentifiée en production en attente.**

## Objectif

Prouver sur iPhone, Mac et Web qu'une seule date pilote le journal et les repas, que `absent`, `0` et `skipped` restent distincts, et que Strongest Effects vient du même calcul serveur.

## Périmètre livré

- projet SwiftUI partagé, généré par `Native/project.yml` ;
- cœur Swift testable sans interface : dates civiles, modèles JSON, client HTTP et Keychain ;
- connexion au contrat Bearer du lot 2 ;
- restauration automatique d'une session conservée dans le trousseau système ;
- vues Jour et Strongest Effects adaptées à iPhone et Mac ;
- données synthétiques de démonstration activables avec `--preview-data` ;
- aucun accès direct à Supabase et aucun calcul statistique local.

## Génération et vérification

```bash
cd Native
xcodegen generate
swift test --package-path SomaCore
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project SomaNative.xcodeproj -scheme Soma-macOS -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO build
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project SomaNative.xcodeproj -scheme Soma-iOS -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 13' CODE_SIGNING_ALLOWED=NO build
```

Preuves locales obtenues :

- six tests Swift valident la date civile, `absent`/`0`/`false`, `absent`/`skipped`, le décodage du contrat serveur, la sauvegarde et l'identité des effets ;
- les deux cibles iPhone et Mac compilent sans signature ;
- la vue synthétique a été contrôlée sur un simulateur iPhone à `390 × 844`.

La preuve finale exige encore le déploiement des lots 2 et 3, un compte synthétique authentifié, le contrôle de la fenêtre Mac à `1440 × 900`, puis la comparaison exacte avec le Web.
