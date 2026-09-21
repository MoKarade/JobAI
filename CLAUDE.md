# CLAUDE.md — JobAI

> Mémoire de projet, chargée à chaque session. **Garde ce fichier court et à jour.**
> Au 2026-09-17 : **491 lignes**, dont **153** pour l'index des règles de la §9 — il en
> faisait 1 854 la veille, et sa §9 en portait 1 536 à elle seule (`[CV-11]`). Les histoires
> des leçons vivent désormais dans `docs/LESSONS.md` ; leurs RÈGLES restent ici, parce qu'un
> lien ne descend jamais dans une session. ⚠️ Le plafond de 150 lignes n'est PAS atteint et ne
> le sera pas : 153 règles ne se réduisent qu'en en supprimant, et chacune a été payée par un
> incident. Le dire vaut mieux que d'écrire un plafond que le fichier viole depuis toujours. L'état courant vit dans `HANDOVER.md`, le reste à faire dans
> `BACKLOG.md`, le détail dans `docs/`.
>
> Structure imposée par la convention commune aux huit dépôts
> ([`claude-config/conventions/STRUCTURE-DEPOT.md`](https://github.com/MoKarade/claude-config/blob/main/conventions/STRUCTURE-DEPOT.md)).
> **Les sections ont été renumérotées le 2026-08-20.** Correspondance :
> **ancien §2 (garde-fous) → §1** · **ancien §7 (leçons) → §9** · **ancien §8 (protocole) →
> §11**. Les renvois figés dans les ADR, le `BACKLOG.md` et le `HANDOVER.md` gardent l'ancienne
> numérotation : ce sont des **récits datés**, et réécrire un récit le falsifie. Les fichiers
> d'*instruction* (`.claude/agents/`, `.claude/commands/`, `docs/LESSONS.md`), eux, ont suivi.

**JobAI** suit la recherche d'emploi de Marc dans la région de Québec : offres notées selon
son profil, statuts de candidature, détection des réponses de recruteurs, et assistance IA
pour l'analyse d'offres et la rédaction de CV/lettres ciblés.

Stack : **Next.js 15** (App Router, Server Components + Server Actions) · **Neon** (Postgres
serverless) + **Drizzle** · **Auth.js v5** (`providers: []` — la session vient du hub) ·
**Anthropic SDK** ·
**Zod** · **vitest**. Déploiement **Vercel** sur `emploi.hubperso.com`.
Widget publié au hub perso via `GET /api/hub/summary` (contrat `@mokarade/hub-contract`).

## 1. Principes non négociables

Format : {l'interdit · l'exception nommée et bornée · le seul fichier autorisé · le verrou}.

1. **Dépôt PUBLIC (décision Marc, 2026-08-14) — donc aucune donnée personnelle, jamais.**
   Le dépôt était déclaré « privé » par ce document alors qu'il est public depuis le début ;
   Marc a tranché en connaissance de cause : **il reste public**. Ce qui change n'est pas la
   règle, c'est son filet. En privé, une PII commitée par erreur était une faute rattrapable
   entre nous. En public, elle est **lisible du monde entier à la seconde du push**, et un
   commit correctif ne la retire pas — l'historique, les forks et les miroirs la gardent.
   `tests/piiGuard.test.ts` n'est donc plus une ceinture : c'est le MUR, et c'est le seul.
   Le suivi de recherche d'emploi contient l'adresse du domicile, le statut migratoire,
   l'historique de refus et des noms de personnes tierces (conseillers RH). *Interdit* : tout
   commit portant l'un de ces éléments. *Exception* : aucune. Les coordonnées du domicile
   vivent dans `DOMICILE_LAT` / `DOMICILE_LON` (variables d'environnement) ; les noms de
   tiers ne sont jamais persistés dans un fichier versionné. **Version 3 (ADR-0016,
   décision Marc 2026-08-21)** : le domicile PEUT être affiché et envoyé au navigateur —
   derrière la session mono-adresse, le « client » est Marc, et lui cacher sa propre
   maison protégeait le principe, pas la personne. Ce qui reste ABSOLU et ne se
   re-négociera pas dans une phrase groupée : (a) aucune coordonnée du domicile ni d'un
   lieu personnel dans un fichier VERSIONNÉ ; (b) rien de servi à une requête NON
   authentifiée. ⚠️ Leçon des trois versions : « le domicile ne sort jamais » protégeait
   DEUX choses différentes — le dépôt public (invariant) et le navigateur de Marc
   (politique). Écrites dans la même phrase, elles sont tombées ensemble (ADR-0004),
   remontées ensemble (annulation), retombées ensemble (ADR-0016) — alors qu'une seule
   bougeait à chaque fois. Le lien Google Maps externe (`lib/lienTrajet.ts`) reste, en
   repli et pour l'itinéraire « avec trafic » côté compte Google.
   *Verrou* : `tests/piiGuard.test.ts` — scan des fichiers **réellement versionnés**
   (`git ls-files`), volume prouvé, discrimination prouvée motif par motif. Sa **portée est
   écrite dans le test** : il détecte des FORMES (adresse municipale, coordonnées, civilité,
   secret affecté), pas des noms isolés — un motif générique de patronyme est inutilisable en
   français (mesuré : il attrapait « Machines-Outils », « Saint-Damien », « garde-fou »).
   *Second verrou, né du texte ingéré* : les annonces lues par la veille portent la **PII de
   TIERS** (courriel nominatif, profil LinkedIn personnel, téléphone d'un recruteur — vécu le
   2026-08-12 sur une annonce Randstad). `lib/ingest/expurger.ts` (`expurgerPII`, PURE) est
   l'outil qui nettoie ; le test « aucune PII de tiers » est la garde qui **refuse**. Les deux
   sont nécessaires : un outil qu'on peut oublier d'appeler ne protège rien. La boîte de rôle
   (`carriere@…`) SURVIT — c'est l'adresse à laquelle Marc postule.
   ⚠️ **Sa portée est passée des `data/depot/*.json` à TOUT le dépôt le 2026-09-18**, et ce
   n'est pas du confort : le canal de dépôt a été supprimé, donc les deux motifs qui ne
   tournaient que sur lui auraient scanné une liste VIDE en restant verts. Élargis, ils ont
   trouvé du premier coup le vrai nom, le vrai courriel et le vrai identifiant LinkedIn du
   recruteur Randstad — recopiés de l'annonce dans les fixtures de `tests/expurger.test.ts`
   le 12/08, dans un dépôt PUBLIC, et invisibles depuis. L'exemption du champ `adresse` des
   dépôts a disparu avec eux : **`piiGuard` ne neutralise plus rien nulle part**.

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
   *Autre frontière réseau, distincte* : `lib/geocodage.ts` est le seul fichier autorisé à
   appeler Nominatim (OpenStreetMap). Il géocode des **municipalités** et des **entreprises
   cibles** (données publiques — frontière élargie le 2026-07-29, demande de Marc `[UX-09]`) ;
   **jamais le domicile, jamais un lieu personnel**. Service bénévole : une requête par
   seconde, déclenchée par un geste de Marc, jamais au chargement d'une page. Une entreprise
   introuvable est posée au centre de sa ville avec `precision: "ville"` DITE à l'écran —
   jamais présentée comme son adresse (garde-fou n°3).

5. **Échec fermé, server-side only.** Jetons et appels LLM restent côté serveur. Chaque
   Server Action revérifie la session (`requireSession`). `HUB_TOKEN` absent → 503 ;
   `x-hub-token` faux → 401 ; comparaison en temps constant. Jamais de secret en dur.
   *Verrou* : `tests/routesGardees.test.ts` — il DÉCOUVRE les routes depuis `app/` et exige
   que chacune soit gardée, sauf exemption **motivée dans le test**. Une nouvelle page non
   exemptée le fait échouer tant qu'on n'a pas tranché son cas : le risque n'est jamais la
   route qu'on écrit aujourd'hui, c'est la sixième.

6. **Le texte non maîtrisé n'entre pas nu dans un prompt.** Une description d'offre ou un
   courriel de recruteur est une surface d'injection : tout passe par `sanitizePromptText`
   + balisage de données (patron `promptSafety` de FinanceAI). Le LLM ne décide jamais seul
   d'une écriture : il propose, le code valide contre un schéma Zod, Marc confirme.

## 2. Conventions de code

- **Langue** : code, commentaires, commits et docs **en français**. UI en français.
- **TypeScript strict** + `noUncheckedIndexedAccess`. Pas de `any` silencieux.
- **Fonctions pures testées** : la logique (notation, fusion, agrégation, résumé hub) vit
  hors des I/O et des composants. C'est ce qui rend le reste testable.
- **Erreurs honnêtes** : jamais de `catch` qui avale. Un échec de plateforme (429, crédit
  épuisé, quota Gmail) se distingue d'un échec métier et ne s'impute jamais à l'item.
- **Pas d'emoji** dans l'UI produit ni dans les commits. Tolérés comme marqueurs de statut
  dans `BACKLOG.md` et `HANDOVER.md` uniquement.
- **Discipline de scope** : on livre par phases (voir `BACKLOG.md`). Ne pas anticiper.
- **Ne pas imposer le dark mode** : les deux thèmes suivent `prefers-color-scheme`. (Règle de
  PRODUIT — elle vivait en §10 avant que la §10 ne devienne un renvoi.)

## 3. Workflow git

- **Branches** : développement **directement sur `main`** (décision Marc 2026-07-28,
  ADR-0002). Pas de branche de travail, pas de PR : projet solo, le va-et-vient de revue
  coûtait plus qu'il ne protégeait.
  ⚠️ **Ce n'est plus vrai à 100 %, et l'écrire au singulier induisait en erreur** : une session
  Claude distante ne peut pas pousser sur `main` protégée, donc elle passe par
  `claude/<slug>` + PR draft (#9, #10, et celle-ci). Les deux régimes coexistent — direct sur
  `main` depuis un poste, branche + PR depuis une session distante. Ce qui ne change pas : le
  gate de §5 avant chaque commit, et `git revert` plutôt qu'une réécriture d'historique.
- **Commits** : préfixés par l'ID de tâche du backlog. Ex. `[V1-03] endpoint hub summary`.
- **Le gate est en §5**, et il est obligatoire avant chaque commit. Jamais `--no-verify`.
- **Push** : commits directs sur `main`. **Il n'y a donc AUCUNE revue pour rattraper une
  erreur** — le gate local est obligatoire avant chaque commit, et la CI est le seul filet
  partagé. Un commit poussé est en ligne : dans le doute, on vérifie avant, pas après.
  Retour arrière = `git revert`, jamais de réécriture d'historique sur `main`.
  ⚠️ **Le push n'est pas fini tant que le run de CI n'a pas été CONSULTÉ.** Sans PR, rien
  n'affiche un ✗ : une CI rouge peut passer inaperçue sur plusieurs commits (vécu, ×4).
- **Flotte d'agents** (`.claude/agents/`, **5**) : `gardien-des-garde-fous`,
  `code-reviewer`, `chasseur-de-pannes-muettes`, `auditeur-accessibilite`,
  `gardien-des-documents`. Panel avant commit via `/review`, qui route selon les fichiers
  touchés. Leurs périmètres ne se recouvrent pas — chacun dit ce qu'il ne traite pas.
  Un finding est une **hypothèse** : on vérifie le vrai code avant de coder un correctif.
  Entre deux agents qui se contredisent, **celui qui a mesuré l'emporte sur celui qui a
  déduit**. La flotte ne remplace pas le gate déterministe.
- **Documents vivants**, tenus à jour dans la **même PR** que le code : `HANDOVER.md` (état
  courant, lu en premier), `BACKLOG.md` (coché au merge), `docs/LESSONS.md`, `docs/adr/`.
  Doc périmée = pire que pas de doc.
- **Boucle de leçons** : à chaque push, se demander « qu'ai-je appris ? ». Une leçon durable
  remonte en §9 ci-dessous, dans le même commit. Rien appris → le dire, jamais sauter en silence.

## 4. Commandes utiles

- `npm run dev` · `npm run typecheck` · `npm run test` · `npm run build` · `npm run lint`
- `npm run db:generate` — produit le SQL de migration. **L'application est automatique** au
  premier accès aux données (`lib/migrations.ts`) ; `db:migrate` ne sert qu'à forcer et prouver
  depuis un poste (voir §5).
- `/review` — panel d'agents sur le diff courant · `/lesson "…"` — consigne une leçon
- `/handover` — régénère `HANDOVER.md` à partir de l'état réel

## 5. Vérifications avant commit

```bash
npm run typecheck && npm run test && npm run lint && npm run build
```

Les quatre sont bloquants, `lint` compris. Jamais `--no-verify`.

La **CI** (`.github/workflows/`) rejoue ce gate. ⚠️ **Sans PR, rien n'affiche un ✗ dans
l'interface** : une CI rouge peut passer inaperçue sur plusieurs commits d'affilée — vécu 4×.
Le push n'est donc pas fini tant que le run n'a pas été **consulté**.

**Les migrations ne se lancent pas à la main.** `npm run db:generate` produit le fichier SQL ;
c'est `lib/migrations.ts` (`assurerMigrations`) qui l'applique **au premier accès aux données**,
une fois par processus, Drizzle arbitrant entre instances via `__drizzle_migrations`. Demande
explicite de Marc le 2026-07-31 : « je veux plus jamais avoir à faire run db migrate, je veux
full auto ». `npm run db:migrate` (`scripts/migrer.ts`) reste là pour appliquer et **prouver**
depuis un poste, pas pour la production. Un échec de migration n'éteint pas l'app : les pages
servent ce que la base a déjà, avec un écran honnête (`lib/panne.ts`) plutôt qu'une page blanche.

## 6. Après un merge : vérifier le DÉPLOIEMENT, pas seulement la CI

**CI verte ne veut pas dire « en ligne ».** Ce sont deux systèmes indépendants : la CI juge le
code, l'hébergeur construit et sert. Un merge peut passer le gate et ne jamais être déployé — la
branche reste verte, le site continue de servir l'ancien build, et rien n'est rouge nulle part.

Vécu le 31/07/2026 : quatre projets Vercel ont cessé de créer des déploiements pendant ~3 h.
JobAI a rattrapé au push suivant ; Hubperso et BatchChef n'en ont pas eu — leur commit d'en-têtes
de sécurité est resté **cinq jours** en attente sans que personne ne le voie.

Donc, après un commit qui change ce qui est SERVI : vérifier qu'un déploiement de production a
bien été créé et qu'il est `READY`, puis **contrôler l'effet sur la réponse réelle** — un en-tête
se lit dans la réponse, il ne se déduit pas du fichier source. Ici, c'est d'autant plus vrai que
les commits vont directement sur `main` : il n'y a aucune PR dont l'échec sauterait aux yeux.

Corollaire : un commit qui ne change QUE de la doc n'a pas de déploiement à vérifier. Le dire
plutôt que de laisser croire qu'on a vérifié.

## 7. Intégration hub

JobAI expose **un seul** endpoint au hub : `GET /api/hub/summary`, contrat
`@mokarade/hub-contract` — **pinné sur le tag `v1.3.0`** depuis le 14/09/2026 (il l'était par
SHA, voir ADR-0001 ; le tag reste un point immuable, le lockfile fige le commit).

⚠️ **Re-pinner N'EST PAS optionnel pour consommer un champ neuf.** Zod STRIPPE les clés
inconnues : sur un pin antérieur, `validateSummary` retire `dataAsOf`, `expectedMaxAgeSec`,
`details` et `primary` **en silence** — et les tests passent en n'affirmant plus rien sur eux.
Un test vert sur un champ retiré est exactement le genre de vert dont on prend l'habitude.

- **Identité publiée** : `id: "jobai"`, `name: "JobAI"`, `url: "https://emploi.hubperso.com"`,
  `color: "#f2a31b"`. L'`id` doit rester identique à l'entrée de `Hubperso/lib/sources.ts`.
- **Auth** : header `x-hub-token`, comparaison en temps constant (SHA-256 + `timingSafeEqual`).
  `HUB_TOKEN` absent → **503** ; jeton absent/faux → **401** ; méthode ≠ GET → **405**.
  Réponse toujours `Cache-Control: no-store`.
- **La route hub est hors du middleware d'auth utilisateur** : elle porte sa propre
  authentification. L'ajouter au matcher renverrait une redirection HTML au hub, qui
  afficherait « injoignable » en permanence.
- **`HUB_TOKEN` sert dans LES DEUX SENS.** Entrant : le hub le présente pour lire le summary
  (ci-dessus). **Sortant** : JobAI le présente au hub sur `POST /api/acces` (`lib/accesHub.ts`)
  pour demander « cette personne a-t-elle le droit d'entrer ici ? ». C'est ce jeton qui
  IDENTIFIE JobAI côté hub, donc aucun `appId` n'est envoyé dans le corps. Sans lui, aucun
  invité n'entre (échec fermé) — seul le propriétaire passe, parce qu'il est vérifié avant,
  et sans réseau.
- **`NEXT_PUBLIC_HUB_URL` n'est pas décoratif.** `lib/connexionHub.ts` en tire `URL_HUB`, qui
  sert à la fois à la redirection de connexion ET de destination à `POST /api/acces`. La
  pointer ailleurs « pour tester » coupe l'accès de tout le monde sauf le propriétaire,
  silencieusement (échec fermé → `false`).
- **Honnêteté** : `status:"building"` tant qu'aucune donnée réelle n'est en base. Le point de
  bascule unique est `getTrackerState()` — `null` = pas encore branché, `throw` = panne.
  **Règle de maintenance** : chaque phase qui rend une métrique réellement disponible la
  branche ici et fait passer le statut à `ok`. Jamais de chiffre fabriqué.
- Le bloc `usage` (coût LLM) n'est publié que **mesuré**, jamais estimé — et **pas du tout**
  tant qu'aucun appel n'a eu lieu (`amount: 0` affirmerait « JobAI ne coûte rien »). Un seul
  site d'appel dans le dépôt : `lib/cv/extraction.ts`, qui comptabilise lui-même (deux
  appelants ; laisser chacun y penser serait « un outil qu'on peut oublier d'appeler »). Les
  prix, le cumul et la règle de publication sont PURS (`lib/coutLlm.ts`), la lecture/écriture
  du compteur est impure (`lib/coutLlmStore.ts`), et le bloc se compose en UN exemplaire
  (`blocUsage`) pour les deux consommateurs — summary complet et summary « en construction ».
  Période `total`, devise `USD` : le hub somme par période et convertit lui-même.
- **La FRAÎCHEUR se lit sur la fin d'une passe RÉUSSIE, jamais sur son début.**
  `lib/fraicheurVeille.ts` publie `dataAsOf` depuis `CLE_RAPPORT`, écrit à la fin d'une passe
  complète. Deux sources plus évidentes ont été écartées, et il ne faut pas y revenir :
  `sync_state["veille-auto"].majLe` est le jeton de RÉSERVATION, posé AVANT le travail — une
  passe qui démarre puis échoue l'avance quand même, donc le hub annoncerait une fraîcheur que
  personne n'a produite ; `CLE_HISTORIQUE` a son propre try/catch et peut rester en arrière
  d'une passe réussie. Sans `dataAsOf`, JobAI ne publiait AUCUNE fraîcheur : c'est la panne du
  12-14 août 2026, où le cron est resté muet trois jours pendant que les compteurs de la veille
  s'affichaient, inchangés, avec l'aplomb d'une mesure.
- **`dataAsOf` et `expectedMaxAgeSec` se publient ENSEMBLE ou pas du tout** (`blocFraicheur`,
  un seul objet pour qu'on n'en publie pas un par distraction). Le contrat v1.3 rejette un âge
  attendu sans horodatage à comparer : un seuil orphelin donnerait la certitude d'être
  surveillé alors que rien ne le serait. Le seuil vaut la **cadence du cron plus une marge**
  (24 h + 6 h) — pas un chiffre choisi : à la cadence nue, le moindre décalage du
  planificateur Vercel crierait « figée » chaque jour, et une alerte permanente n'est plus une
  alerte. `tests/fraicheurVeille.test.ts` lit `vercel.json` et refuse la divergence.
- **Le bloc `details` ne porte que des NOMBRES** (garde-fou n°1, dépôt PUBLIC) : la dernière
  passe (vues, retenues, périmées, revenues, inexpliquées) et l'entonnoir de candidature. Le
  rapport de passe contient, lui, l'employeur et le poste de la meilleure offre — il n'est
  **jamais republié tel quel**, `lireVeillePubliee` en extrait champ par champ, et un test
  échoue si on le recopie.

## 8. Documentation (où vit quoi)

| Fichier | Contenu |
|---|---|
| `HANDOVER.md` | **L'état RÉEL** : ce qui tourne, ce qui reste. À lire en premier — l'état ne se duplique nulle part ailleurs, parce qu'un état recopié se périme dans l'exemplaire le moins relu. |
| `BACKLOG.md` | Ce qui est décidé mais pas fait. Chaque tâche a un ID, utilisé en préfixe de commit. |
| `docs/adr/` | Les décisions architecturales, `NNNN-slug.md`. Obligatoire avant toute modif de la notation ou du matching (§11). |
| `docs/LESSONS.md` | Le journal des leçons **et leurs HISTOIRES** (incident, mesure, date) — depuis le 2026-09-17, il porte aussi les 153 récits déménagés de la §9. Leur RÈGLE reste en §9 : une leçon s'écrit des DEUX côtés, dans le même commit. |
| `docs/DEPLOIEMENT.md` | Déployer, et les variables d'environnement attendues. |
| `docs/ROUTINE-DEPOT.md` · `docs/veille-prompt.md` | **RÉCITS depuis le 2026-09-18** : la routine de dépôt et son prompt décrivent un canal supprimé. Gardés comme récits datés (leur en-tête le dit), jamais comme mode d'emploi. |

La structure est commune aux huit dépôts du hub — elle est fixée dans
[`conventions/STRUCTURE-DEPOT.md`](https://github.com/MoKarade/claude-config/blob/main/conventions/STRUCTURE-DEPOT.md)
du dépôt `claude-config`, et nulle part ailleurs.

Un fichier **daté** (audit, plan, analyse) est un **récit** : il vit dans `docs/`, sa date dit à
quoi il correspond, et il **ne se met pas à jour**. Ce qui doit rester vrai va dans un document
sans date. C'est pourquoi les renvois `§7` / `§8` figés dans les ADR et le `BACKLOG.md` n'ont pas
été réécrits par la renumérotation (voir l'en-tête) : réécrire un récit, c'est le falsifier.

## 9. Leçons apprises (règles durables)

> **Les RÈGLES sont ici ; leurs HISTOIRES sont dans [`docs/LESSONS.md`](./docs/LESSONS.md).**
>
> ⚠️ Pourquoi ce découpage, et ce qu'il coûte (`[CV-11]`, 2026-09-17). Cette section faisait
> **1 536 lignes** — 83 % d'un fichier chargé EN ENTIER à chaque session, pour un plafond
> assumé de 150. Le déménagement garde en session ce qui change la façon de coder (la règle)
> et sort ce qui l'explique (l'incident, la mesure, la date). **C'est une PERTE, et elle est
> délibérée** : un `CLAUDE.md` ne charge rien hors de son arbre, donc les histoires
> n'arriveront plus dans la session — il faudra aller les lire. Une règle sans son histoire
> reste applicable ; l'inverse n'est pas vrai, et c'est ce qui décide du sens de la coupe.
>
> ⚠️ **Ajouter une leçon = DEUX écritures, dans le même commit** : son histoire dans
> `docs/LESSONS.md`, sa règle ici. Écrire la règle seule la rend invérifiable ; écrire
> l'histoire seule ne la fait pas descendre en session.
>
> ⚠️ **Le compte ci-dessous n'a pas été distillé à la main** : chaque ligne est le texte en
> GRAS de sa leçon, repris au caractère près. Ce gras avait été écrit comme la conclusion de
> chaque incident — c'était déjà l'index, il n'était simplement pas séparé du récit.

1. Avant d'écrire un fichier ou d'annoncer une tâche, vérifier qu'elle n'est pas DÉJÀ faite.
2. Un document vivant qui décrit un verrou doit nommer le fichier EXACT, et se met à jour dans le commit qui livre le verrou.
3. Sans PR, la CI ne se regarde pas toute seule : la vérifier fait partie du push.
4. Une même règle tenue dans deux langages diverge, et le mauvais exemplaire gagne.
5. Un garde qui s'exclut d'un dossier entier s'en exclut pour toujours.
6. Lire un fichier écrit sous Windows = retirer le BOM, tolérer CRLF.
7. Un outil qui échoue en SILENCE est pire qu'un outil qui plante.
8. Ce que Next.js fait pour toi, les outils en ligne de commande ne le font pas.
9. Un message d'erreur FAUX coûte plus cher qu'un message générique.
10. Toute date que l'app ÉCRIT se calcule dans le fuseau de Marc, jamais en UTC.
11. Un invariant de COMPTAGE additionne des grandeurs de MÊME unité.
12. Un traitement automatique qui RETIRE quelque chose se conçoit à l'envers : d'abord ce qu'il n'a pas le droit de toucher.
13. « Redeploy » rejoue le commit du déploiement existant, PAS le dernier commit.
14. Un revert de conteneur peut effacer un travail non commité EN PLUS DE la plomberie git
15. Le FORMAT d'une erreur dit d'où elle vient.
16. Quand deux acteurs détiennent chacun la moitié d'un accès, la solution n'est pas de compléter l'un — c'est de vérifier que l'accès manquant est nécessaire.
17. Compter un refus ne suffit pas : il faut le NOMMER.
18. Un flux VALIDE n'est pas un flux UTILE : lire le contenu, pas le format.
19. Un HTTP 200 ne prouve rien tant qu'on n'a pas mesuré ce que l'API répond à une question ABSURDE.
20. Un identifiant deviné trouve des homonymes, et ils sont crédibles.
21. Ne jamais laisser tourner une source prouvée morte.
22. Un seuil se pose sur la composante qui MESURE, pas sur le total.
23. Une expression composée ne survit pas à l'écriture inclusive.
24. Supprimer un geste manuel déplace son coût : il faut le borner AVANT de le supprimer.
25. Un travail de fond va APRÈS la réponse, pas dedans.
26. Un déclencheur automatique se calibre sur ce qui doit VRAIMENT le réveiller.
27. Un mécanisme qui ne peut pas atteindre sa source doit le DIRE, pas rendre un résultat vide.
28. Un `| grep` masque le code de sortie : ne jamais chaîner un gate derrière lui.
29. Un test qui désigne une donnée par son INDEX se met à tester autre chose en silence.
30. Diagnostiquer AVANT de corriger : « trop peu d'offres » n'était pas un bug de carte.
31. Un jeu de données qui change de nature casse les tests qui décrivaient son état — et c'est le moment de distinguer la DESCRIPTION de l'INVARIANT.
32. Une sonde qui tourne dans un état local différent du distant ne prouve rien.
33. Un message de commit ne passe jamais par une chaîne interpolée par le shell.
34. Ce qui doit bloquer vit dans le gate ; ce qui change sans le code vit à côté.
35. Une liste de colonnes recopiée à N endroits perd le champ suivant, et personne ne le voit.
36. Une colonne ajoutée à une table dont le traitement SAUTE les entrées déjà présentes est une colonne morte pour tout l'existant.
37. « Cette liste-là sert à autre chose » n'immunise pas contre l'oubli qu'on vient de corriger.
38. Une heuristique peut grouper ce qu'on REGARDE, jamais décider ce qu'on ÉCRIT.
39. Un choix qui dépend de l'ordre d'un `SELECT` sans `ORDER BY` est un tirage au sort.
40. Un écart « assumé par un commentaire » reste un écart.
41. Un travail de fond a besoin d'un gate qui CONVERGE, pas d'un gate qui a l'air juste.
42. Deux `after()` ne s'exécutent pas l'un après l'autre.
43. Une plainte sur ce qu'on VOIT ne désigne presque jamais ce qu'il faut CHANGER.
44. Un export de données est une surface d'exécution, pas un dump.
45. Retirer ce qui est laid ne produit pas du beau : ça produit du NEUTRE.
46. Une règle d'apparence vraie en CLAIR peut être fausse en SOMBRE — la vérifier sur les jetons, pas au jugé.
47. Une maquette de refonte doit partir du code EXISTANT, pas d'une page blanche.
48. Un second thème jamais montré à la validation n'est pas une option, c'est une version NON VALIDÉE de l'app servie au hasard du réglage système.
49. Une lecture de format binaire écrite à la main s'éprouve sur des fichiers TIERS, ou elle ment.
50. Un test qui EXIGE un fichier absent de la CI transforme une dépendance de machine en rouge permanent.
51. Un garde de données personnelles fait des faux positifs, et c'est le garde qui a raison.
52. Une bibliothèque peut DÉTACHER le tampon qu'on lui passe.
53. Composer un objet par `{ ...brut, quelquesChamps: netto(…) }` laisse passer TOUT LE RESTE.
54. Un test qui n'éprouve qu'UNE variante d'un motif fait croire que le motif entier est couvert.
55. Le garde PII se déclenchera sur tes FIXTURES et sur tes COMMENTAIRES, et il aura raison.
56. Le conteneur peut REVERTIR l'arbre de travail en pleine tâche — `origin` est la seule vérité.
57. Après un revert, `refs/remotes/origin/main` peut MANQUER alors que le tracking est configuré.
58. Une couleur écrite EN DUR ne se plaint jamais d'un changement de thème : elle devient fausse, en silence.
59. Un travail périodique qui dépend d'un déclencheur UNIQUE meurt en silence.
60. Un saut de build se décide contre `HEAD^`, en SUPPOSANT que `HEAD^` a été déployé — et cette supposition tombe précisément le jour où un déploiement manque.
61. `deploy_to_vercel` n'est pas « déploie ce dépôt ».
62. Un revert de conteneur RÉCIDIVE dans la même session, et il revient au même point.
63. Un garde qui tombe pendant un refactor a raison : on met à jour sa LISTE, jamais son assertion.
64. Prouver qu'une extraction est VERBATIM se fait sur les EFFETS, pas sur les lignes.
65. Un contrôle promis en prose (« il suffira de grep ») ne verrouille rien.
66. Un test « la garde couvre-t-elle X ? » se vérifie en RETIRANT la garde.
67. Ajouter un paramètre à une fonction d'un seul argument piège tous les `map(fn)`.
68. Quand une passe fait PLUSIEURS travaux, son déclencheur doit couvrir CHACUN d'eux.
69. Un travail de fond qui ne journalise QUE ses échecs est indiagnosticable.
70. Une amputation de requête se fait passer pour une source vide.
71. Un travail de fond hérite de la durée de vie de sa page — il ne s'y ajoute pas.
72. Le coût d'une frontière réseau se dimensionne sur le PIRE CAS, pas sur le cas nominal.
73. Une déduction écrite au présent dans un commentaire devient un fait pour la prochaine session — donc elle se mesure ou elle se dit comme déduction.
74. Un délai de retente encode une PRÉMISSE : quand elle tombe, le délai doit tomber avec.
75. Un service qui ne trouve pas ne dit pas toujours non — il répond à côté, et à côté peut passer les contrôles.
76. Un garde dont la PORTÉE est « ce que git suit » arrive un commit trop tard.
77. Un OUTIL DE DIAGNOSTIC qui se tait quand il ne trouve rien ne diagnostique rien.
78. Un quota de déploiement est une ressource PARTAGÉE, et pousser à chaque correctif la brûle.
79. Un revert de conteneur n'emporte pas que le travail : il emporte la PLOMBERIE GIT, et tous les outils qui s'y fient se mettent à mentir.
80. Une Routine qui allume une session NEUVE n'hérite de rien : ni des dépôts attachés, ni des outils MCP de la session qui l'a créée.
81. Un quota d'API partagé ne se mesure qu'en le heurtant, et il se referme en s'aggravant.
82. Lire du texte écrit par un tiers, c'est l'INGÉRER — et un garde de forme ne suffit plus.
83. Un identifiant fourni par une source externe n'est pas forcément un identifiant.
84. Une liste et son détail se contredisent : c'est le détail qui dit le lieu.
85. Un fichier commité n'existe pas en serverless tant que le traceur ne le voit pas — et l'absence du chemin doit être une PANNE DITE.
86. Un plan écrit d'après un TABLEAU de symptômes se trompe ; il se vérifie contre le CODE avant d'être promis.
87. Un plafond « configurable » peut être un LEURRE si un cap interne, plus bas, tronque déjà tout ce qui le dépasse.
88. Un garde « déjà connu, ne pas retoucher » doit distinguer « à jour » de « obsolète depuis un événement précis » — sinon il fige une valeur périmée pour toujours.
89. Un mécanisme demandé peut déjà exister sous un nom qu'on ne cherchait pas.
90. `drizzle-kit generate` peut proposer un diff halluciné si l'historique des snapshots a un trou.
91. `node_modules` PRÉSENT ne veut pas dire PAQUETS présents.
92. Une configuration indexée PAR ROUTE ne suit pas un refactor qui PARTAGE du code.
93. Un gate ne peut pas être vert dans une session sans egress — et ça se DIT.
94. Les paramètres d'une API se mesurent en les FAISANT VARIER, avant d'écrire un protocole autour.
95. Un connecteur « activé » peut n'exposer AUCUN outil.
96. Une donnée d'entreprise renvoie le SIÈGE SOCIAL, jamais l'établissement local.
97. Un verdict qui recouvre DEUX situations ne peut pas porter UN délai — il porte une ÉCHELLE.
98. Un travail trop long pour une fonction serverless se découpe en LOTS que le NAVIGATEUR enchaîne, et sa progression se relit de l'état, jamais d'un compteur local.
99. Une mesure faite depuis une session bloquée par le proxy ne mesure que le proxy.
100. Dans un fichier `"use server"`, TOUTE fonction async exportée est un point d'entrée HTTP anonyme — un `export` n'y est pas un choix de portée, c'est une PUBLICATION.
101. Une liste blanche est un pari ; quand la question a une réponse MESURABLE, la mesurer.
102. Nommer le refus AVANT de le corriger — et le NOMMER, c'est nommer son OBJET.
103. Rendre un paramètre RÉGLABLE périme tout ce qui a été décidé sous son ancienne valeur — et ce qui sauve la mise, c'est d'avoir stocké la MESURE, pas la conclusion.
104. Une source qui lit une FENÊTRE ne peut pas se taire : elle répète l'avant-veille, et le silence prend l'apparence d'un résultat.
105. Chercher un défaut est le meilleur moment pour recenser ce qui reste debout.
106. Une règle de PII écrite dans UNE seule langue laisse l'autre entrer, et le dépôt est public.
107. Un plafond de lecture qu'on s'impose se dit AVEC la liste de ce qu'il a laissé de côté.
108. Le gate ne vaut que pour l'arbre qu'il a VU : éditer après l'avoir lancé, c'est ne pas l'avoir lancé.
109. Un compte d'octets écrit en tranches de trois EST un numéro d'assurance sociale pour un scan de source.
110. Un test de NETTOYAGE ne discrimine que si le nettoyage a encore quelque chose à faire.
111. Borner la mémoire ne borne PAS le réseau.
112. Quand on ne peut pas LIRE la source, l'analyseur doit RAPPORTER ce qu'il a vu.
113. Un recensement qui rend un ENSEMBLE ne conclut RIEN sur une absence.
114. Un plafond atteint transforme toutes les mesures d'une passe en PRÉFIXES.
115. Une entité HTML non décodée ne casse rien — elle fait juste disparaître des données.
116. Le VOLUME d'une source n'est pas sa VALEUR, et ça se regarde avant de brancher.
117. Savoir qu'un champ EXISTE ne dit rien de ce qu'il PORTE.
118. Une liste blanche qui compare par SOUS-CHAÎNE ne s'étend pas par simple ajout : un nom court avale ses composés.
119. Le VOLUME d'une source est une question de TRI, pas de branchement.
120. Un échantillon décrit la population dont il est TIRÉ, jamais celle qui t'intéresse — et c'est la troisième fois en une session.
121. Un gabarit de texte servi par une source tierce n'est pas stable, même à quelques minutes d'intervalle.
122. Un module qui documente CE QUI LE PROTÈGE devient FAUX quand on change les conditions — et c'est lui qu'il faut relire AVANT d'ajouter la fonctionnalité, pas après.
123. Une exception à un garde-fou non négociable se livre avec ses CONDITIONS, jamais seule.
124. Zod STRIPPE les clés inconnues : un test qui croit éprouver un REJET éprouve peut-être un silence.
125. Une règle qui ne vit que dans un document se reperd — il lui faut un test-scan.
126. Éprouver un serveur par son PROTOCOLE, pas par ses handlers.
127. Une liste écrite à la main devient fausse au chantier suivant — et deux d'entre elles l'étaient déjà.
128. Un contrôle de sécurité se teste avec les chaînes d'attaque EXACTES, pas avec des cas plausibles.
129. Une garantie d'unicité vit dans l'ÉCRITURE, jamais dans une lecture qui la précède.
130. Un automatisme « pour ne plus jamais y penser » ne s'applique QUE là où quelqu'un l'a appelé — donc tout module qui ajoute des tables en hérite.
131. Sur un endpoint authentifié, une PANNE n'est pas un REFUS.
132. Quand je demande la même mesure une quatrième fois, le problème n'est plus la mesure : c'est que je n'ai pas d'accès.
133. Un réglage qui exige une session Claude n'est pas un réglage — c'est une dépendance, et elle se supprime en livrant l'ÉCRAN, pas la donnée.
134. Un `\b` placé après une alternation dont une branche finit par un POINT ne matche jamais — et la branche est morte en silence.
135. Une doc qui déduit une conclusion d'un fait devient FAUSSE en silence quand le fait change — et la conclusion, elle, avait des conséquences.
136. Deux populations sans instrument commun : mesurer chacune dans SON unité, conclure sur les ORDRES DE GRANDEUR ABSOLUS.
137. `git checkout <fichier>` pour défaire UNE mutation efface TOUT le travail non commité du fichier.
138. Un mécanisme de troncature ne protège que la PROFONDEUR qu'il parcourt.
139. Un budget plus long que le MUR de sa fonction ne borne rien.
140. Une garde qui EXCLUT une population d'un mécanisme la prive aussi de ce que ce mécanisme DISAIT.
141. Deux plaintes d'un même message peuvent n'avoir qu'UNE cause, et seule la mesure le montre.
142. Un mot-clé cherché N'IMPORTE OÙ dans une URL classe mal exactement ce qui marche.
143. « Quasi tout X » se MESURE avant d'être corrigé — et l'outil de mesure se livre d'abord.
144. La garde qu'on copie du voisin peut être INOPÉRANTE chez soi, et elle a l'air prudente.
145. Un seuil se mesure avec l'instrument qu'on a déjà construit.
146. Un témoin d'intégration peut être protégé par la BORNE plutôt que par la garde qu'il prétend éprouver.
147. Un document PERSISTÉ est daté par le schéma qui l'a écrit : ajouter un champ requis le rend illisible, et personne ne le voit avant des semaines.
148. Un diagnostic tiré d'un message d'erreur décrit le SYMPTÔME, pas la portée — y compris quand c'est moi qui l'ai écrit une heure plus tôt.
149. Un garde-fou qui REFUSE un lot entier se transforme en panne permanente dès qu'un seul membre est mauvais — et le bon remède n'est jamais de relever le seuil, c'est de DÉCOUPER.
150. Un test qui vérifie ce qu'une fonction REND ne prouve rien sur ce qui est ÉCRIT — et la liste que la persistance parcourt EST le contrat.
151. Un message qui DÉDUIT sa cause d'un code de statut envoie au mauvais endroit — et il le fait avec aplomb.
152. Libérer de la place au-dessus d'un élément qui est à son PLANCHER ne lui donne RIEN.
153. Un frein qui compte ce que PERSONNE n'a dépensé ne protège rien : il enferme.
154. Un recensement de commandes d'installation s'énumère par ce qu'elles FONT, jamais par le nom de l'une d'elles — `npm ci` recensé, `npx` oublié, et `npx` installe ET exécute des scripts.
155. Un champ additif s'écrit `.nullable().optional()`, jamais `.nullable().default(null)` : un `default` Zod rend le champ REQUIS en SORTIE, donc obligatoire sur tout objet construit à la main.
156. Avant de nommer un champ dans un type déjà large, grep le nom DANS ce type — savoir ce qu'on veut exprimer ne dit rien de ce que le nom porte déjà.
157. Avant de retirer un filtre, lister ce que son chemin PRODUIT en plus du refus : ce qui sert à DÉCIDER meurt avec la décision, ce qui sert à OBSERVER doit survivre sous un nom qui ne ment plus.
158. Le LIBELLÉ d'une métrique publiée à un consommateur est une CLÉ chez lui, jamais un titre — le renommer jette l'historique en silence, et un libellé qui porte une part VARIABLE (entreprise, date) ne peut structurellement pas avoir de courbe.
159. Avant de prescrire un remède depuis un JOURNAL, ouvrir le code qui produit la ligne — sinon on décrit ce qu'on ferait à partir de rien, pas ce qui manque à ce qui existe (« déjà fait ? » vaut pour le DIAGNOSTIC autant que pour la tâche).
160. Devant une garde qui laisse passer ce qu'elle devrait arrêter, se demander si elle ne remplit pas DÉJÀ un autre rôle légitime : c'est alors une SECONDE garde qu'il faut, jamais un seuil plus serré.
161. Un seuil qui dépend de la DENSITÉ autant que de la surface ne se devine pas : on ÉCOUTE la réponse (couper sur échec, recommencer) plutôt que d'inventer un nombre — avec un plafond, sinon une panne fait doubler le travail à chaque tour.
162. Quand un comparateur a un SECOND critère, une fixture où le premier est CONSTANT teste le second : faire varier toutes les clés du tri, ou la mutation reste verte.
163. Deux lecteurs pour la MÊME question et le plus permissif en DÉFAUT : la série la moins gardée est celle qu'on obtient en ne choisissant pas — rendre le choix REQUIS, le compilateur garde mieux que la discipline.
164. Une garde de plausibilité posée à l'ÉCRITURE doit être re-posée à la LECTURE quand ce n'est pas la même entité qui porte le critère : un employeur a une position, une offre a SA ville.
165. Élargir ce qu'on INGÈRE sans élargir ce qu'on sait SITUER transforme une garde régionale en plafond invisible — et le refus se compte comme « introuvable », indistinguable de « la source ne sait pas ».
166. Un identifiant d'ENTITÉ n'est pas l'identifiant du FAIT : une clé primaire par employeur fait hériter une position à des offres qui n'ont rien à voir, et le chiffre qui en sort est plausible.

## 10. Style et compte-rendu

> 📣 Forme des comptes-rendus, des commits, des PR et des docs générées :
> [convention commune aux neuf dépôts](https://github.com/MoKarade/claude-config/blob/main/conventions/COMPTE-RENDU.md).
> Elle régit **la forme** ; ce fichier garde **le contenu métier**. Sur la forme, c'est la
> convention qui gagne ; sur le métier, c'est ce fichier.

@docs/COMPTE-RENDU.md

⚠️ **Pourquoi une COPIE et pas seulement un lien.** Un `CLAUDE.md` ne charge rien hors de son
propre arbre : le lien ci-dessus est lisible par un humain, il n'arrive jamais dans la session.
C'est exactement le mode de panne du 20/08/2026 — les règles de cadrage écrites dans un
`~/.claude/CLAUDE.md` local ne descendaient nulle part, et Marc constatait « je ne vois pas la
différence » alors que rien n'était jamais arrivé. `docs/COMPTE-RENDU.md` est donc une copie
**synchronisée**, importée ci-dessus, et la CI échoue si elle a dérivé de la source.

Pour changer la convention : la changer dans `claude-config`, propager les huit copies, mettre
à jour les huit empreintes. La friction est le garde-fou — une copie qu'on peut modifier sur
place redevient huit conventions différentes en trois mois.

## 11. Protocole de précision (toute modification de la NOTATION ou du MATCHING)

La note de fit est le cœur du produit : elle décide ce que Marc regarde en premier.
Toute modification de `lib/scoring.ts` ou de la logique de matching offre↔profil exige :

1. **ADR d'abord** — problème, impact coût LLM estimé, risques, méthode de test. Aucune
   ligne de code avant l'ADR.
2. **Audit sur du réel** — exécuter la nouvelle logique sur **TOUTES les offres du seed**
   (`SEED.length`, 53 au 2026-08-20 — ⚠️ ne PAS recopier le compte ici : il a déjà dérivé de
   38 à 53, et un nombre périmé dans un protocole le fait sous-spécifier en silence, l'audit
   se croyant complet sur un préfixe) et rendre le tableau
   [entreprise | poste | note avant | note après | écart] **avant** de modifier le pipeline.
   Prouver sur du réel, jamais sur 2-3 cas choisis.
3. **Non-régression** — les offres à note manuelle font foi : une note calculée qui dépasse
   une note vérifiée à la main est un bug (plafond 85).
4. **Fonctions pures + revue flotte** — logique isolée des I/O, testable, revue avant merge.
