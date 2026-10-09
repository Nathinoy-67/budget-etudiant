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

Barre du bas : **Accueil · Opérations · + · Analyse · Réglages (⚙)**. Tout passe par un seul compte : le compte courant.

| | |
|---|---|
| **Accueil** | Reste à vivre (somme à garder en fin de mois déjà déduite), part du mois engagée, revenus / abonnements et charges fixes / dépenses, échéances à venir, opérations récentes. Bandeau « Données exemple » avec retour aux vraies données. |
| **Opérations** (onglet) | Tous les mouvements regroupés par jour, recherche (commerçant, catégorie, montant), filtres (période, type, catégories, montant) et bouton d'import de relevé. |
| **Ajout (+)** | Dépense ou revenu : pavé numérique intégré, catégorie pré-sélectionnée (la plus fréquente), date, note, option « Répéter ». |
| **Paiements Apple Pay automatiques** | Une automatisation Raccourcis (déclencheur « Wallet ») envoie chaque paiement Apple Pay à un **relais privé** (Cloudflare Worker, dossier `relay/`). Budget l'ajoute à l'ouverture, catégorie devinée d'après le commerçant (corrections retenues), sans doublon. Guide dans **Réglages → Paiements Apple Pay**. |
| **Import de relevé bancaire** | Réglages → **Importer un relevé bancaire** : fichier CSV, OFX ou QIF téléchargé depuis l'espace client (Crédit Agricole et autres banques, encodage UTF-8 ou Windows-1252). Libellés nettoyés (« PAIEMENT PAR CARTE X1234 CARREFOUR… » → « Carrefour… »), catégories devinées, **doublons écartés** (même montant à ± 3 jours : récurrences, Apple Pay, saisies manuelles), choix de la date de départ. |
| **Modifier / supprimer** | Toucher pour modifier, **glisser vers la gauche** pour supprimer (avec annulation). Recherche (commerçant, catégorie, montant) et filtres (période, type, catégories, montant). |
| **Analyse** | Le mois en chiffres (dépenses, comparaison au mois précédent à la même date, revenus, abonnements et charges fixes, solde), **catégories avec leurs budgets** (toucher une catégorie pour fixer un plafond), 6 derniers mois, revenus par source, plus grosses dépenses. |
| **Simulateur « Et si ? »** | Réduire une catégorie (en € ou en %), résilier des abonnements, gagner plus : économies par mois, par an, sur 2 ou 5 ans. Accessible depuis l'Analyse. |
| **Revenus et charges fixes** | Salaire, APL, bourse, parents, loyer, abonnements… Hebdo / mensuel / annuel, pause, **sauter une échéance**, total des abonnements par mois et par an. Ajoutés automatiquement le jour J. |
| **Réglages** | Revenus et charges fixes, somme à garder en fin de mois, catégories (nom, emoji, couleur), Apple Pay, début du mois budgétaire, devise, thème, code PIN + Face ID, rappel quotidien, sauvegarde / import / export CSV, essai des données exemple (vraies données mises de côté puis restaurées), réinitialisation. |
| **Confort iOS** | Feuilles à tirer vers le bas, glisser depuis le bord gauche pour revenir, safe areas, mode sombre, retour haptique (iOS 18+), « Réduire les animations » respecté, cibles tactiles ≥ 44 px. |

## Comment sont faits les calculs

- **Période budgétaire** : du *jour de début* choisi (ex. le 5) à la veille du même jour le mois suivant. Un jour de début à 29/30/31 est borné au dernier jour des mois courts.
- **Reste à vivre** = revenus reçus + revenus récurrents attendus − **tous** les abonnements et charges fixes de la période (payés ou à venir) − dépenses variables − **somme à garder en fin de mois**.
- **Aucune extrapolation** : pas de prévision ni de moyenne par jour, un gros achat ne compte qu'une fois, pour son montant réel.
- **Abonnements** : une opération marquée « C'est un abonnement » devient la 1re échéance ; les suivantes sont déduites dès le début de chaque mois. Un paiement Apple Pay du même montant (à 3 jours près) remplace l'échéance au lieu de s'y ajouter.
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

## Relais Apple Pay (Cloudflare)

Sur iOS, un lien ouvert par Raccourcis s'ouvre dans Safari, dont les données sont séparées de l'appli installée. Les paiements passent donc par un petit relais :

- `relay/worker.js` : Worker + KV. Routes `/claim` (liaison unique par clé secrète générée dans l'appli, seule son empreinte SHA-256 est stockée), `/pay` (appelée par le raccourci), `/pending` et `/ack` (appli). Paiements non récupérés effacés après 60 jours. CORS limité au site.
- Déploiement : `cd relay && npx wrangler login && npx wrangler deploy` (le KV est déjà référencé dans `wrangler.toml`).
- Adresse utilisée par l'appli : `RELAY_URL` dans `src/features/applepay/relay.ts` (surcharge possible avec `VITE_RELAY_URL`).
- Test local : `npx wrangler dev` dans `relay/`, puis `VITE_RELAY_URL=http://127.0.0.1:8787 npm run dev` et `node scripts/relay-check.mjs`.

## Développement

Prérequis : Node.js 20+ (testé avec Node 24).

```bash
npm install
npm run dev          # http://localhost:5173/budget-etudiant/
npm test             # tests unitaires (Vitest)
npm run build        # vérification TypeScript + build de production dans dist/
npm run preview      # sert dist/ sur http://localhost:4173/budget-etudiant/
npm run icons        # régénère les icônes PNG depuis scripts/icon.svg
```

Tests de bout en bout (Playwright, moteur **WebKit** = Safari, émulation iPhone 14) :

```bash
npx playwright install webkit chromium
node scripts/screens.mjs <dossier>   # captures des écrans principaux (serveur dev lancé)
node scripts/flows.mjs        # scénarios avec assertions : saisie, recherche, glisser-supprimer, budgets,
                              # simulateur, sauter une échéance, export/import, code PIN
node scripts/pwa-check.mjs <url> chromium   # manifest, icônes, meta iOS, service worker, hors ligne
node scripts/import-check.mjs               # import d'un relevé (aperçu, doublons, réimport)
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
│   ├── budget.ts          Reste à vivre, budgets par catégorie, soldes
│   ├── goals.ts           Progression, versement conseillé, date estimée
│   ├── stats.ts           Agrégations pour les graphiques
│   ├── simulator.ts       Scénarios « et si ? »
│   ├── statement.ts       Relevés bancaires CSV / OFX / QIF, nettoyage des libellés, doublons
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

- **Notifications programmées** : une PWA ne peut pas planifier une notification à l'avance sans serveur de push. Le rappel du soir part **quand l'appli est ouverte ou revient au premier plan**. Pour un rappel fiable appli fermée, utiliser l'export **Calendrier (.ics)** proposé dans Réglages.
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
