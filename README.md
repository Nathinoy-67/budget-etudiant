# 💶 Budget Étudiant

Application de gestion de budget pour étudiant, pensée pour l'iPhone : **PWA installable**, 100 % hors ligne, **aucun compte, aucun serveur**. Toutes les données restent sur le téléphone (IndexedDB).

**URL :** https://nathinoy-67.github.io/budget-etudiant/ (après le premier déploiement, voir plus bas)

---

## Sommaire

- [Installer sur l'iPhone](#installer-sur-liphone)
- [Fonctionnalités](#fonctionnalités)
- [Comment sont faits les calculs](#comment-sont-faits-les-calculs)
- [Vie privée et sauvegardes](#vie-privée-et-sauvegardes)
- [Développement](#développement)
- [Architecture](#architecture)
- [Déploiement](#déploiement)
- [Limites connues et pistes d'amélioration](#limites-connues-et-pistes-damélioration)

---

## Installer sur l'iPhone

1. Ouvre l'URL dans **Safari** (depuis iOS 16.4, Chrome et les autres navigateurs le permettent aussi via leur menu Partager).
2. Touche le bouton **Partager** (carré avec une flèche vers le haut).
3. Choisis **« Sur l'écran d'accueil »**, puis **Ajouter**.
4. Lance l'appli depuis l'icône : elle s'ouvre en plein écran, sans barre Safari, et fonctionne hors ligne.

> Pour les notifications (iOS 16.4+), l'appli **doit** être lancée depuis l'icône de l'écran d'accueil.

## Fonctionnalités

| | |
|---|---|
| **Tableau de bord** | Reste à vivre, budget par jour jusqu'à la fin du mois, jauge des revenus engagés, solde du mois, dépenses du jour, prévision de fin de mois au rythme actuel, échéances à venir, objectifs, dernières opérations. Touche la carte violette pour le détail du calcul. |
| **Saisie express** | Bouton **+** → pavé numérique intégré → catégorie (pré-sélection de ta catégorie la plus fréquente) → **Ajouter**. Date (aujourd'hui / hier / autre), compte, note, et option « Répéter ». |
| **Paiements Apple Pay automatiques** | Avec une automatisation de l'app Raccourcis (déclencheur « Transaction »), chaque paiement Apple Pay ouvre l'appli et enregistre la dépense (montant, commerçant, catégorie devinée). Les corrections de catégorie sont retenues par commerçant, les doublons ignorés. Guide pas à pas dans **Plus → Paiements Apple Pay**. |
| **Ajout en 1 tap** | Raccourcis personnalisables (café, ticket de bus, courses…) sur l'accueil, avec **Annuler** pendant 5 s. |
| **Opérations** | Regroupées par jour avec total quotidien, recherche (note, catégorie ou montant exact), filtres (période, type, catégories, compte, montant min/max). **Glisser vers la gauche** pour supprimer, avec annulation. Toucher pour modifier. |
| **Catégories** | Personnalisables (nom, emoji, couleur, ordre). 10 catégories de dépenses et 5 de revenus par défaut. Une catégorie utilisée est archivée au lieu d'être supprimée. |
| **Budgets** | Plafond mensuel par catégorie, barre de progression, repère du jour du mois, alertes à **80 %** (orange) et **100 %** (rouge), en toast et en notification. |
| **Récurrences** | Loyer, abonnements, APL, bourse, salaire, virement des parents… Hebdo / mensuel / annuel (toutes les N périodes), date de fin, **pause**, **sauter une échéance** (et la rétablir). Générées automatiquement le jour J. |
| **Revenus** | Suivi séparé par source : job/salaire, aides, bourse, famille, autre. |
| **Comptes** | Courant, épargne, Livret A, espèces… Soldes par compte, patrimoine total, **virements entre comptes**, compte par défaut, archivage. |
| **Objectifs d'épargne** | Montant et date cibles, **versement mensuel conseillé**, estimation de la date d'atteinte au rythme des 3 derniers mois, versements et retraits. |
| **Abonnements** | Coût mensuel et annuel total, prochaine échéance, rappel N jours avant, ajout rapide (Netflix, Spotify…), **export des rappels vers le Calendrier iPhone**. |
| **Dépenses partagées** | Groupes (coloc, voyage), dépenses réparties à parts égales au centime près, soldes, **remboursements minimaux** (au plus n − 1 virements), « Ajouter ma part à mes dépenses ». |
| **Statistiques** | Camembert par catégorie, dépenses cumulées comparées au mois précédent **à la même date**, barres revenus/dépenses sur 6 mois, courbe du solde (30 j / 3 mois / 1 an), variations par catégorie, top 5, moyenne par jour, revenus par source. |
| **Simulateur « et si ? »** | Réduire une catégorie (en € ou en %), résilier des abonnements, gagner plus : économies par mois, an et 2 ou 5 ans, et **impact sur tes objectifs** (mois gagnés). |
| **Notifications** | Alertes de budget, renouvellements d'abonnements, rappel quotidien (voir limites). Rappel quotidien **fiable via le Calendrier** (.ics). |
| **Sécurité** | Code PIN à 4 chiffres (haché PBKDF2), **Face ID / Touch ID** via WebAuthn, verrouillage automatique réglable, blocage 30 s après 5 erreurs. |
| **Onboarding** | 3 écrans : revenus (avec le jour de versement), loyer et solde actuel, catégories. Ou **données exemple** en un tap. |
| **Réglages** | Devise, premier jour du mois budgétaire, thème auto/clair/sombre, retour haptique, compte par défaut, export/import, réinitialisation. |
| **Confort iOS** | Tab bar, feuilles modales à tirer vers le bas, glisser depuis le bord gauche pour revenir, grands titres, safe areas (encoche et barre d'accueil), retour haptique (iOS 18+), mode sombre, « Réduire les animations » respecté, cibles tactiles ≥ 44 px. |

## Comment sont faits les calculs

- **Période budgétaire** : du *jour de début* choisi (ex. le 5) à la veille du même jour le mois suivant. Un jour de début à 29/30/31 est borné au dernier jour des mois courts.
- **Reste à vivre** = revenus reçus + revenus récurrents attendus − **toutes** les charges fixes de la période (payées ou à venir) − dépenses variables.
- **Budget par jour** = reste à vivre ÷ jours restants (aujourd'hui inclus), jamais négatif.
- **Prévision de fin de mois** = revenus − charges fixes − (dépenses variables ÷ jours écoulés × jours de la période).
- **Virements entre comptes** : neutres (ni revenu ni dépense).
- **Montants** stockés en **centimes entiers** : aucune erreur d'arrondi (0,1 + 0,2 = 0,30 €).
- **Dates** : chaînes `AAAA-MM-JJ` calculées dans le fuseau **Europe/Paris** (à 0 h 30 on est bien « aujourd'hui », changements d'heure sans décalage).
- **Récurrences** : chaque échéance est calculée depuis la date de départ (un loyer du 31 tombe le 30 avril puis le 31 mai ; un 29 février annuel tombe le 28 les autres années). Une opération générée puis supprimée n'est jamais recréée.

## Vie privée et sauvegardes

- Aucune donnée ne quitte l'appareil : pas de serveur, pas d'analytics, pas de cookies.
- ⚠️ **iOS peut effacer les données d'une appli web** non utilisée pendant plusieurs semaines. L'appli demande un stockage persistant et **te rappelle de sauvegarder** (toutes les 2 semaines par défaut).
- **Réglages → Exporter une sauvegarde (JSON)** : ouvre la feuille de partage, choisis « Enregistrer dans Fichiers » (iCloud Drive conseillé).
- **Restaurer** : Réglages → Restaurer une sauvegarde → choisis le fichier `.json`.
- **Export CSV** des opérations (séparateur `;`, virgule décimale, UTF-8 avec BOM) pour Excel ou Numbers.

## Développement

Prérequis : Node.js 20+ (testé avec Node 24).

```bash
npm install
npm run dev          # http://localhost:5173/budget-etudiant/
npm test             # 141 tests unitaires (Vitest)
npm run build        # vérification TypeScript + build de production dans dist/
npm run preview      # sert dist/ sur http://localhost:4173/budget-etudiant/
npm run icons        # régénère les icônes PNG depuis scripts/icon.svg
```

Tests de bout en bout (Playwright, moteur **WebKit** = Safari, émulation iPhone 14) :

```bash
npx playwright install webkit chromium
node scripts/smoke.mjs        # parcours complet + 30 captures d'écran (serveur dev lancé)
node scripts/flows.mjs        # scénarios avec assertions : édition, glisser-supprimer, filtres,
                              # sauter une échéance, objectif, coloc, export/import, code PIN
node scripts/pwa-check.mjs <url> chromium   # manifest, icônes, meta iOS, service worker, hors ligne
node scripts/applepay-check.mjs             # réception des paiements Apple Pay (appli installée et Safari)
```

Ajouter `?noanim` à l'URL désactive les animations (pratique pour les captures).

## Architecture

```
src/
├── types.ts               Modèle de données (montants en centimes, dates AAAA-MM-JJ)
├── lib/                   Logique pure, testée unitairement
│   ├── money.ts           Saisie « 12,50 » → centimes, formatage fr-FR, partage au centime
│   ├── dates.ts           Fuseau Europe/Paris, mois 28-31 j, périodes budgétaires
│   ├── recurrence.ts      Échéances, sauts, génération, équivalents mensuels/annuels
│   ├── budget.ts          Reste à vivre, prévision, budgets par catégorie, soldes
│   ├── goals.ts           Progression, versement conseillé, date estimée
│   ├── split.ts           Soldes de groupe, remboursements minimaux
│   ├── stats.ts           Agrégations pour les graphiques
│   ├── simulator.ts       Scénarios « et si ? »
│   ├── merchant.ts        Paiements Apple Pay : lecture du lien, commerçant → catégorie
│   ├── csv.ts, backup.ts, ics.ts, files.ts      Export / import / calendrier
│   └── security.ts, notifications.ts, haptics.ts
├── db/                    Dexie (IndexedDB) : schéma, actions, valeurs par défaut, démo
├── hooks/                 useData (toutes les tables en direct), useTheme
├── stores/                Zustand : navigation par onglet, feuille de saisie, toasts, verrou
├── components/            UI réutilisable : Sheet, Screen, TabBar, Keypad, listes, jauges…
├── features/              Un dossier par écran (dashboard, transactions, budgets, stats…)
└── app/                   App (init, verrou, onboarding) et Shell (onglets + piles)
```

- **Stack** : React 19, TypeScript, Vite, Tailwind CSS v4, Dexie 4, Recharts 3 (chargé seulement sur Stats), Motion, Zustand, vite-plugin-pwa (Workbox).
- **Navigation** : une pile d'écrans par onglet (état et défilement conservés), animations de type iOS.
- **Données** : toutes les tables sont chargées en mémoire via `useLiveQuery` (quelques milliers de lignes au plus) ; les calculs dérivés sont mémoïsés.
- **Service worker** : pré-cache de toute l'appli ; une nouvelle version est proposée via un toast « Mettre à jour ».

## Déploiement

Le workflow `.github/workflows/deploy.yml` teste, construit et publie sur **GitHub Pages** à chaque push sur `main`. Le chemin de base (`/budget-etudiant/`) est déduit automatiquement du nom du dépôt.

Première mise en place :

1. Créer le dépôt **public** `budget-etudiant` sur GitHub (sans README).
2. Pousser le code :
   ```bash
   git remote add origin https://github.com/Nathinoy-67/budget-etudiant.git
   git push -u origin main
   ```
3. Sur GitHub : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
4. Onglet **Actions** : relancer le workflow si le premier run a échoué faute de Pages activé.
5. L'appli est en ligne sur **https://nathinoy-67.github.io/budget-etudiant/**.

**Alternative Netlify** : importer le dépôt sur Netlify, `netlify.toml` configure tout (build servi à la racine).

## Limites connues et pistes d'amélioration

**Limites dues à iOS / au « sans serveur »**

- **Notifications programmées** : une PWA ne peut pas planifier une notification à l'avance sans serveur de push. Les alertes (budget, abonnements, rappel du soir) partent **quand l'appli est ouverte ou revient au premier plan**. Pour un rappel fiable appli fermée, utiliser l'export **Calendrier (.ics)** proposé dans Réglages et Abonnements.
- **Face ID / Touch ID** : la vérification WebAuthn est faite localement (pas de serveur pour valider la signature). C'est un verrou de confort contre les regards indiscrets, pas une protection contre un accès technique au téléphone.
- **Retour haptique** : iOS n'expose pas l'API Vibration ; l'appli utilise l'astuce du `<input switch>` qui ne fonctionne qu'à partir d'iOS 18.
- **Stockage** : iOS peut purger les données d'une PWA peu utilisée → sauvegardes régulières indispensables.

**Améliorations possibles**

- Synchronisation optionnelle chiffrée de bout en bout entre appareils (ex. fichier iCloud ou WebDAV).
- Import des relevés bancaires (CSV/OFX) et rapprochement automatique.
- Répartition des dépenses partagées en parts inégales ou en pourcentages ; export du récap du groupe.
- Écrans de démarrage iOS (`apple-touch-startup-image`) pour chaque taille d'iPhone.
- Budgets reportables (le reste d'un mois s'ajoute au suivant) et budget global indépendant des catégories.
- Pièces jointes (photo du ticket) et étiquettes libres.
- Graphiques supplémentaires : calendrier « heatmap » des dépenses, tendance annuelle par catégorie.
- Widgets d'écran d'accueil et raccourcis Siri : impossibles en PWA, nécessiteraient une appli native.
- Localisation complète (anglais…) et autres fuseaux horaires.
- Découpage plus fin du bundle (le JS principal pèse ~190 Ko gzip, Recharts ~120 Ko chargé à la demande).
