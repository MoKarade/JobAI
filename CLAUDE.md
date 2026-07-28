# CLAUDE.md — JobAI

> Mémoire de projet, chargée à chaque session. **Garde ce fichier court et à jour** (plafond
> assumé : 150 lignes). Le détail vit dans `docs/`, `BACKLOG.md` et `HANDOVER.md`.

## 1. Le projet en une phrase

**JobAI** suit la recherche d'emploi de Marc dans la région de Québec : offres notées selon
son profil, statuts de candidature, détection des réponses de recruteurs, et assistance IA
pour l'analyse d'offres et la rédaction de CV/lettres ciblés.

Stack : **Next.js 15** (App Router, Server Components + Server Actions) · **Neon** (Postgres
serverless) + **Drizzle** · **Auth.js v5** (Google, mono-adresse) · **Anthropic SDK** ·
**Zod** · **vitest**. Déploiement **Vercel** sur `emploi.hubperso.com`.
Widget publié au hub perso via `GET /api/hub/summary` (contrat `@mokarade/hub-contract`).

## 2. Garde-fous NON NÉGOCIABLES

Format : {l'interdit · l'exception nommée et bornée · le seul fichier autorisé · le verrou}.

1. **Dépôt PRIVÉ, et aucune donnée personnelle en clair dans le code.**
   Le suivi de recherche d'emploi contient l'adresse du domicile, le statut migratoire,
   l'historique de refus et des noms de personnes tierces (conseillers RH). *Interdit* : tout
   commit portant l'un de ces éléments. *Exception* : aucune. L'adresse de référence pour le
   calcul de distance vit dans `DOMICILE_LAT` / `DOMICILE_LON` (variables d'environnement) ;
   les noms de tiers ne sont jamais persistés dans un fichier versionné.
   *Verrou* : `tests/piiGuard.test.ts` — scan des fichiers **réellement versionnés**
   (`git ls-files`), volume prouvé, discrimination prouvée motif par motif. Sa **portée est
   écrite dans le test** : il détecte des FORMES (adresse municipale, coordonnées, civilité,
   secret affecté), pas des noms isolés — un motif générique de patronyme est inutilisable en
   français (mesuré : il attrapait « Machines-Outils », « Saint-Damien », « garde-fou »).

2. **Le suivi appartient à Marc.** `statut`, `prio`, `dateEnvoi`, `userNote`
   (`USER_OWNED_FIELDS`) ne sont **jamais** écrasés par un rafraîchissement de seed, une
   ingestion ni un scan Gmail. *Exception* : aucune — le scan **propose**, Marc valide.
   *Seul module autorisé à les écrire* : `lib/suivi.ts` (`appliquerModification`, appelée
   depuis une Server Action déclenchée par un geste de Marc). *Verrou* :
   `tests/suivi.test.ts` — vérifie CHAQUE champ de `CHAMPS_UTILISATEUR` un par un, et sa
   discrimination est prouvée (fusion inversée ⇒ le test tombe).

3. **No fake data.** Une métrique non mesurée ne s'affiche pas : `status:"building"` tant que
   le moteur ne produit rien de réel, `—` plutôt qu'un 0 plausible, et une offre dont on ne
   sait plus si elle est active est marquée **périmée**, jamais présentée comme ouverte.
   Une note calculée par `scoring.ts` est plafonnée à 85 pour ne jamais dépasser une note
   vérifiée à la main. *Verrou* : `tests/hubSummary.test.ts` couvre aujourd'hui le volet hub
   (statut `building`, identité publiée) ; le plafond de notation reste à verrouiller `[V1-02]`.

4. **Aucun scraping.** Indeed et Jobillico l'interdisent par leurs conditions et le bloquent
   activement. *Exception nommée* : les sources publiques officielles (flux XML du
   Guichet-Emplois, données ouvertes EDSC) et les API officielles. *Seul fichier autorisé à
   faire un `fetch` sortant vers une source d'offres* : `lib/ingest/`. *Verrou* : ADR-0002
   avant toute nouvelle source.

5. **Échec fermé, server-side only.** Jetons et appels LLM restent côté serveur. Chaque
   Server Action revérifie la session (`requireSession`). `HUB_TOKEN` absent → 503 ;
   `x-hub-token` faux → 401 ; comparaison en temps constant. Jamais de secret en dur.

6. **Le texte non maîtrisé n'entre pas nu dans un prompt.** Une description d'offre ou un
   courriel de recruteur est une surface d'injection : tout passe par `sanitizePromptText`
   + balisage de données (patron `promptSafety` de FinanceAI). Le LLM ne décide jamais seul
   d'une écriture : il propose, le code valide contre un schéma Zod, Marc confirme.

## 3. Conventions de code

- **Langue** : code, commentaires, commits et docs **en français**. UI en français.
- **Commits** : préfixés par l'ID de tâche du backlog. Ex. `[V1-03] endpoint hub summary`.
- **Branches** : développement **directement sur `main`** (décision Marc 2026-07-28,
  ADR-0002). Pas de branche de travail, pas de PR : projet solo, le va-et-vient de revue
  coûtait plus qu'il ne protégeait.
- **TypeScript strict** + `noUncheckedIndexedAccess`. Pas de `any` silencieux.
- **Fonctions pures testées** : la logique (notation, fusion, agrégation, résumé hub) vit
  hors des I/O et des composants. C'est ce qui rend le reste testable.
- **Erreurs honnêtes** : jamais de `catch` qui avale. Un échec de plateforme (429, crédit
  épuisé, quota Gmail) se distingue d'un échec métier et ne s'impute jamais à l'item.
- **Pas d'emoji** dans l'UI produit ni dans les commits. Tolérés comme marqueurs de statut
  dans `BACKLOG.md` et `HANDOVER.md` uniquement.
- **Discipline de scope** : on livre par phases (voir `BACKLOG.md`). Ne pas anticiper.

## 4. Workflow

- **Gate avant chaque commit** : `npm run typecheck && npm run test && npm run build`,
  plus `npm run lint` (bloquant). Jamais `--no-verify`.
- **Push** : commits directs sur `main`. **Il n'y a donc AUCUNE revue pour rattraper une
  erreur** — le gate local est obligatoire avant chaque commit, et la CI est le seul filet
  partagé. Un commit poussé est en ligne : dans le doute, on vérifie avant, pas après.
  Retour arrière = `git revert`, jamais de réécriture d'historique sur `main`.
- **Flotte d'agents** (`.claude/agents/`) : panel avant merge via `/review`. Un finding est
  une **hypothèse** : on vérifie le vrai code avant de coder un correctif. Entre deux agents
  qui se contredisent, **celui qui a mesuré l'emporte sur celui qui a déduit**.
- **Documents vivants**, tenus à jour dans la **même PR** que le code : `HANDOVER.md` (état
  courant, lu en premier), `BACKLOG.md` (coché au merge), `docs/LESSONS.md`, `docs/adr/`.
  Doc périmée = pire que pas de doc.
- **Boucle de leçons** : à chaque push, se demander « qu'ai-je appris ? ». Une leçon durable
  remonte en §7 ci-dessous, dans le même commit. Rien appris → le dire, jamais sauter en silence.

## 5. Commandes utiles

- `npm run dev` · `npm run typecheck` · `npm run test` · `npm run build` · `npm run lint`
- `npm run db:generate` / `db:migrate` — migrations Drizzle (appliquées à la main, hors build)
- `/review` — panel d'agents sur le diff courant · `/lesson "…"` — consigne une leçon
- `/handover` — régénère `HANDOVER.md` à partir de l'état réel

## 6. État du projet

Voir **`HANDOVER.md`** — ne pas dupliquer ici un état qui se périme.

## 6 bis. Intégration Hub

JobAI expose **un seul** endpoint au hub : `GET /api/hub/summary`, contrat
`@mokarade/hub-contract` (pinné par SHA, voir ADR-0001).

- **Identité publiée** : `id: "jobai"`, `name: "JobAI"`, `url: "https://emploi.hubperso.com"`,
  `color: "#f2a31b"`. L'`id` doit rester identique à l'entrée de `Hubperso/lib/sources.ts`.
- **Auth** : header `x-hub-token`, comparaison en temps constant (SHA-256 + `timingSafeEqual`).
  `HUB_TOKEN` absent → **503** ; jeton absent/faux → **401** ; méthode ≠ GET → **405**.
  Réponse toujours `Cache-Control: no-store`.
- **La route hub est hors du middleware d'auth utilisateur** : elle porte sa propre
  authentification. L'ajouter au matcher renverrait une redirection HTML au hub, qui
  afficherait « injoignable » en permanence.
- **Honnêteté** : `status:"building"` tant qu'aucune donnée réelle n'est en base. Le point de
  bascule unique est `getTrackerState()` — `null` = pas encore branché, `throw` = panne.
  **Règle de maintenance** : chaque phase qui rend une métrique réellement disponible la
  branche ici et fait passer le statut à `ok`. Jamais de chiffre fabriqué.
- Le bloc `usage` (coût LLM) n'est publié que **mesuré**, jamais estimé.

## 7. Leçons apprises (règles durables)

> N'ajouter ici que ce qui change la façon de coder.

- **Avant d'écrire un fichier ou d'annoncer une tâche, vérifier qu'elle n'est pas DÉJÀ
  faite.** Vécu 2× en une session : `components/Panneaux.tsx` puis `tests/piiGuard.test.ts`
  ont été ré-écrits de zéro alors qu'ils existaient et étaient committés — seul le refus
  d'écrasement de l'outil l'a évité. Réflexe : `git log --oneline -- <fichier>` et
  `grep <ID-de-tâche>` dans les commits **avant** de coder, pas après.
- **Un document vivant qui décrit un verrou doit nommer le fichier EXACT, et se met à jour
  dans le commit qui livre le verrou.** `CLAUDE.md` a déclaré le garde-fou n°1 « pas encore
  codé » alors que son test était en ligne depuis deux commits, et le nommait
  `tests/pii-guard.test.ts` au lieu de `tests/piiGuard.test.ts`. Une constitution qui
  renvoie à un fichier inexistant n'est pas juste périmée : elle est invérifiable — on ne
  peut pas distinguer « le verrou manque » de « le nom est faux ».
- **Toute date que l'app ÉCRIT se calcule dans le fuseau de Marc, jamais en UTC.**
  Vercel tourne en UTC, Marc vit à UTC−4 : `new Date().toISOString().slice(0, 10)` date du
  LENDEMAIN toute offre ajoutée après 20 h locale. Le format voulu (`AAAA-MM-JJ`) s'obtient
  par `Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU })` — pas en recomposant les
  composants à la main. Et l'instant reste un **paramètre** de la fonction : c'est la seule
  façon de tester le passage de minuit. Vaut pour `dateReperage`, `dateEnvoi`, et toute
  date future que l'app posera elle-même.
- **Un export de données est une surface d'exécution, pas un dump.** Une cellule CSV qui
  commence par `=`, `+`, `-` ou `@` est évaluée à l'ouverture par Excel, LibreOffice et
  Google Sheets. Tout champ de texte libre qui sort de l'app vers un tableur se neutralise
  au point de FORMATAGE (`lib/export.ts`), jamais dans le composant qui télécharge.

## 8. Protocole de précision (toute modification de la NOTATION ou du MATCHING)

La note de fit est le cœur du produit : elle décide ce que Marc regarde en premier.
Toute modification de `lib/scoring.ts` ou de la logique de matching offre↔profil exige :

1. **ADR d'abord** — problème, impact coût LLM estimé, risques, méthode de test. Aucune
   ligne de code avant l'ADR.
2. **Audit sur du réel** — exécuter la nouvelle logique sur les **38 offres du seed**
   (23 actives + 15 historiques, notées à la main) et rendre le tableau
   [entreprise | poste | note avant | note après | écart] **avant** de modifier le pipeline.
   Prouver sur du réel, jamais sur 2-3 cas choisis.
3. **Non-régression** — les offres à note manuelle font foi : une note calculée qui dépasse
   une note vérifiée à la main est un bug (plafond 85).
4. **Fonctions pures + revue flotte** — logique isolée des I/O, testable, revue avant merge.
