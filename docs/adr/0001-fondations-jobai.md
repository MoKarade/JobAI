# ADR-0001 — Fondations de JobAI

- **Statut** : Accepté (décisions prises par Marc le 2026-07-28)
- **Date** : 2026-07-28
- **Remplace** : les décisions de la session du 2026-07-27 consignées dans le
  `HANDOVER.md` du squelette `jobtracker` (voir « Alternatives rejetées »)

> Rappel de convention : **Accepté ≠ Implémenté**. Cet ADR fixe les décisions ;
> l'état d'avancement vit dans `BACKLOG.md` et `HANDOVER.md`.

## Contexte

Marc dispose d'un tracker de recherche d'emploi fonctionnel sous forme d'artifact HTML
autonome (`tracker-emploi-v4.html`, 634 lignes) : 23 offres actives notées à la main sur 100
selon un barème pondéré par son profil, 15 candidatures historiques de la campagne 2025,
un tableau de bord, des filtres, un SWOT et une table de salaires du marché. Les données
vivent dans le stockage du navigateur — donc sur un seul appareil, sans persistance garantie.

Une session du 2026-07-27 a produit un squelette Next.js partiel (`jobtracker`, 989 lignes,
jamais exécuté, `npm install` jamais lancé) portant les types Zod, le barème, le stockage et
trois routes API. Ce squelette n'avait **pas** inspecté l'écosystème du hub perso ; il laissait
trois questions ouvertes dont une bloquante.

L'objectif est de porter ce tracker en app du hub perso, à `emploi.hubperso.com`, aux côtés
de FinanceAI, DriveAI et BatchChef, avec une couche d'assistance IA.

Situation personnelle qui contraint le produit : permis de travail lié à l'employeur actuel,
résidence permanente estimée dans 4 à 12 mois, **aucune candidature envoyée en 2026**.
L'app est donc d'abord un **thermomètre du marché**, pas un outil de candidature massive.

## Décision

### Identité et hébergement
- Dépôt **`MoKarade/JobAI`, PRIVÉ**. Le seed contient l'adresse du domicile, le statut
  migratoire, l'historique de refus et le nom d'une conseillère RH — données personnelles
  de Marc et d'un tiers. Les autres apps (FinanceAI, DriveAI, BatchChef) sont publiques :
  JobAI ne peut pas l'être.
- Domaine : **`emploi.hubperso.com`**. Identité publiée au hub : `id: "jobai"`,
  `name: "JobAI"`, `color: "#f2a31b"` (l'ambre du tracker ; distinct de `#0f766e` FinanceAI,
  `#8ab4f8` DriveAI, `#c2410c` BatchChef).

### Socle technique
- Fork de la structure **`app-template`** (Next.js 15 App Router, React 19, TypeScript
  strict, Zod, vitest), enrichi du squelette `jobtracker` pour la logique métier.
- Persistance : **Neon (Postgres serverless) + Drizzle**, migrations SQL committées,
  appliquées à la main hors build. Patron de connexion paresseuse de BatchChef.
- Auth utilisateur : **Auth.js v5, Google, mono-adresse** (`AUTHORIZED_EMAIL`),
  middleware fail-closed. Même schéma que le reste de l'écosystème.
- Contrat hub : `@mokarade/hub-contract`, **maintenu au pin `#v1.0.0` du fork pour la V1**.
  La V1 ne publie aucun coût, donc le bloc `usage` (v1.1) ne sert à rien encore, et le tag
  `v1.1.0` **n'existe pas côté distant** (seul `v1.0.0` est publié, vérifié par
  `git ls-remote --tags`). Le passage au contrat v1.1 se fera au moment où l'IA introduira un
  coût réel à publier — tâche `[V3-05]` — soit par le tag une fois créé dans `hub-contract`,
  soit par le SHA `2d37a61` comme le font déjà quatre consommateurs sur cinq.
  ⚠️ Conséquence à connaître d'ici là : un champ `usage` envoyé sous le contrat v1.0 serait
  **stripé silencieusement** par Zod, sans erreur.
- Endpoint hub : **`GET /api/hub/summary`**, 503 si `HUB_TOKEN` absent, 401 si jeton
  invalide, `no-store`, **exclu du middleware d'auth utilisateur**.

### Périmètre par phases
- **V1 — port fidèle + hub.** L'artifact devient une app déployée : auth, persistance,
  UI portée à l'identique (CSS et responsive réutilisés), widget sur le hub. Aucune
  fonctionnalité nouvelle. Critère de fin : Marc utilise JobAI depuis son téléphone et le
  widget s'affiche sur `hubperso.com`.
- **V2 — scan Gmail.** Détection des réponses de recruteurs, scope `gmail.readonly`
  dans JobAI (voir « Alternatives rejetées »). Le scan **propose**, Marc valide.
- **V3 — IA.** Notation automatique par lecture de la description, tri intelligent des
  réponses, et génération de CV/lettres ciblés à partir du CV lu depuis Google Drive.
- **V4 — ingestion d'offres.** Guichet-Emplois (flux XML sur demande EDSC, export CSV
  ouvert en attendant).

### Widget hub
Métrique en position 0 (le gros chiffre) : **la meilleure offre du moment** — son score et
l'entreprise. Le widget répond à « qu'est-ce qui vaut le coup en ce moment » plutôt qu'à
« combien j'en ai ». Métriques suivantes : offres suivies, CV envoyés, réponses, entrevues.

### Outillage projet
Niveau DriveAI : garde-fous non négociables en constitution, 5 agents de revue, gate
`typecheck + test + build + lint` avant commit, CI GitHub, ADR pour les décisions
structurantes, documents vivants (`BACKLOG`, `HANDOVER`, `LESSONS`).

## Impact quotas / coût

- **Neon** : offre gratuite (0,5 Go, un projet). Volume réel : quelques dizaines d'offres et
  de documents générés — hors de portée des limites. **Nul.**
- **Vercel** : projet supplémentaire sur le compte existant, offre gratuite. **Nul.**
- **LLM (à partir de la V3)** : la notation d'une offre lit une description (~2 à 5 k tokens
  en entrée). La génération d'un CV/lettre est plus coûteuse mais reste déclenchée à la main,
  offre par offre. Ordre de grandeur attendu : **quelques dollars par mois**, à mesurer et
  publier dans le bloc `usage`, jamais à estimer. Un plafond chiffré non désactivable sera
  fixé par l'ADR de la V3 : il suspend les traitements **de fond** (notation en lot), jamais
  une action déclenchée par Marc.
- **Gmail (V2)** : quota d'appels journalier partagé. Le scan est déclenché à la main ou une
  fois par jour, sur un volume faible. **Négligeable**, mais la suspension sur quota épuisé
  doit être implémentée dès le départ (patron DriveAI).

## Analyse de risques

| Risque | Parade |
|---|---|
| **Fuite de données personnelles** (adresse, statut migratoire, tiers nommés) | Dépôt privé ; adresse en variables d'environnement ; noms de tiers hors du code versionné ; test-garde `pii-guard` qui scanne les fichiers suivis. |
| **Le hub reçoit une redirection HTML au lieu du JSON** (route hub capturée par le middleware) | Route hub explicitement exclue du matcher, avec un test qui le prouve. C'est le défaut n°1 constaté dans le squelette du 27/07. |
| **Le scan Gmail meurt après une heure** (jeton Google expiré, refresh non implémenté) | Renouvellement du jeton implémenté **avec** la feature, jamais après (leçon `AUTH-DRIVE-PERSIST` de FinanceAI). |
| **XSS stockée par le champ `why`** (HTML brut, injecté sans échappement dans l'artifact) | `why` devient un format **structuré** (liste de points typés atout/réserve), rendu par React. Aucun HTML brut, en particulier quand la V3 le fera générer par un LLM. |
| **Écrasement concurrent du suivi** (lire-modifier-écrire dans le squelette) | Écritures ciblées en base par offre, pas de document global réécrit. |
| **Injection de prompt** (description d'offre, courriel de recruteur) | `sanitizePromptText` + balisage de données ; le LLM propose, le code valide par Zod, Marc confirme. |
| **Deux scopes Google restreints sur la même app** (`gmail.readonly` + Drive pour le CV) | Point ouvert — voir « Conséquences ». À trancher avant la V2. |

## Méthode de test

1. **Fonctions pures d'abord** (`scoring.ts`, fusion du suivi, résumé hub) : tests unitaires
   sans I/O, exécutables par `vitest`.
2. **Non-régression du barème** : les 38 offres du seed servent de corpus de référence.
   Toute modification de la notation rend un tableau avant/après sur ce corpus.
3. **Contrat hub verrouillé par le vrai schéma** du package (`validateSummary`), pas par une
   copie locale — patron `app/test/hub-summary.test.ts` de DriveAI.
4. **Tests-gardes qui scannent le code source** (`pii-guard`), avec **volume prouvé**
   (`expect(fichiers.length).toBeGreaterThan(N)`) : un scan qui ne lit rien passe à vide.
5. **Au moins un test d'intégration par feature** — pour la base, avec une vraie instance
   Postgres en mémoire, jamais uniquement des mocks.

## Conséquences

**Positif**
- Marc récupère son tracker sur tous ses appareils, avec une persistance réelle.
- L'app entre dans l'écosystème existant sans exception : même contrat, même auth, même
  méthode, même gate.
- Le schéma Postgres est posé dès la V1 en anticipant les documents générés de la V3 : une
  seule modélisation, pas de migration de rattrapage.

**Négatif**
- Neon est plus lourd qu'un simple document JSON pour 40 offres. C'est un pari sur la V3 :
  sans génération de CV/lettres, Redis aurait suffi.
- Le dépôt privé sort JobAI de la vitrine publique des autres projets.

**Risques acceptés**
- Les offres du seed **expireront** avant la résidence permanente. L'app doit marquer une
  offre « périmée » plutôt que de laisser croire qu'elle est ouverte — c'est une contrainte
  produit, pas un détail d'affichage.
- La notation reste subjective par construction : elle est pondérée par le profil de Marc,
  pas par une qualité absolue de l'offre. Le barème est documenté et visible dans l'UI.

## Alternatives rejetées

**Réutiliser le scan Gmail de DriveAI** *(option A de la session du 27/07, question bloquante)*
DriveAI n'expose que 8 fichiers HTTP, dont un seul endpoint consommable de l'extérieur
(`api/hub/summary.ts`). Son moteur Gmail vit dans Apps Script, à l'intérieur du compte Google
de Marc, déclenché par un trigger temporel ; sa web app `/exec` a 8 actions, aucune liée au
suivi de candidature. Sa surface Gmail est verrouillée par un check CI requis
(`test/surface-gmail-ecriture.test.js`) et sa mission est le classement de documents.
Y greffer une catégorie « candidature » déclencherait son protocole de précision (ADR + audit
sur 20 documents réels) pour un besoin qui n'est pas le sien.
→ **Rejeté.** JobAI implémente son propre scan, en réutilisant les listes de mots-clés
éprouvées du script `surveillance-emploi.gs`.
*Conséquence technique à retenir* : DriveAI **archive** les courriels de Marc. Une recherche
limitée à `in:inbox` raterait tout ce que DriveAI a déjà rangé.

**Publier un schéma JobAI dans `hub-contract`** *(question ouverte n°2 de la session du 27/07)*
Le contrat est délibérément générique : le hub ne connaît aucune app en particulier et rend
ce que le summary contient. Y ajouter un `JobTrackerSummarySchema` casserait son principe
fondateur et obligerait à re-pinner les cinq consommateurs.
→ **Rejeté.** Le résumé interne reste dans `lib/types.ts` ; une fonction pure le traduit en
`HubSummary` standard, patron `lib/hubSummary.ts` de BatchChef.

**Upstash Redis** *(décision de la session du 27/07)*
Défendable pour 40 offres et un utilisateur. Mais la V3 stocke des CV et lettres générés par
offre, avec un historique : c'est du stockage de documents et de relations, pas un document
JSON unique. Le lire-modifier-écrire global était par ailleurs sujet à écrasement silencieux.
→ **Rejeté au profit de Neon + Drizzle**, déjà en service dans BatchChef.

**Scraper Indeed et Jobillico**
Interdit par leurs conditions d'utilisation, bloqué activement, et un tel pipeline casserait
en permanence. → **Rejeté** (décision maintenue depuis le 27/07).

**Livrer la V1 avec le scan Gmail et l'ingestion**
Chacune de ces briques a une inconnue externe (configuration OAuth Google pour l'une, accès
EDSC pour l'autre). Les coupler à la mise en ligne, c'est bloquer tout sur le maillon le plus
lent. → **Rejeté** au profit d'un port fidèle livré d'abord.

## Réversibilité

- **Persistance** : la logique métier est pure et le stockage est isolé derrière un module
  d'accès. Changer Neon pour autre chose est une réécriture de ce module, pas de l'app.
- **Contrat hub** : un pin par SHA se change en une commande ; le summary est produit par une
  fonction pure, testée contre le vrai schéma.
- **IA** : la V3 est additive. Sans clé Anthropic configurée, les fonctionnalités d'IA sont
  simplement absentes — l'app reste un tracker complet.
- **Dépôt privé → public** : impossible en pratique sans réécrire l'historique (le seed a été
  committé). C'est la décision la moins réversible de cet ADR, et c'est pourquoi elle est
  prise dans le bon sens dès le premier commit.
