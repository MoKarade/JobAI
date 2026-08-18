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
   tiers ne sont jamais persistés dans un fichier versionné. Le domicile n'est ni affiché
   ni envoyé au navigateur — le TRAJET vers une entreprise passe par un lien Google Maps
   qui ne porte que la destination (`lib/lienTrajet.ts`) : l'origine est fournie par
   Google, côté compte de Marc, jamais par l'app. *(Une révision ADR-0004 avait assoupli
   cette règle pour une carte Google ; le chantier a été annulé le jour même — la règle
   stricte est rétablie, et le lien trajet la rend inutile à assouplir.)*
   *Verrou* : `tests/piiGuard.test.ts` — scan des fichiers **réellement versionnés**
   (`git ls-files`), volume prouvé, discrimination prouvée motif par motif. Sa **portée est
   écrite dans le test** : il détecte des FORMES (adresse municipale, coordonnées, civilité,
   secret affecté), pas des noms isolés — un motif générique de patronyme est inutilisable en
   français (mesuré : il attrapait « Machines-Outils », « Saint-Damien », « garde-fou »).
   *Second verrou, né du texte ingéré* : les annonces lues par la veille portent la **PII de
   TIERS** (courriel nominatif, profil LinkedIn personnel, téléphone d'un recruteur — vécu le
   2026-08-12 sur une annonce Randstad). `lib/ingest/expurger.ts` (`expurgerPII`, PURE) est
   l'outil qui nettoie ; le test « aucune PII de tiers dans les descriptions d'un dépôt »
   (scan des `data/depot/*.json`) est la garde qui **refuse**. Les deux sont nécessaires : un
   outil qu'on peut oublier d'appeler ne protège rien. La boîte de rôle (`carriere@…`) SURVIT
   — c'est l'adresse à laquelle Marc postule.

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
- **Sans PR, la CI ne se regarde pas toute seule : la vérifier fait partie du push.**
  Le gate local a été vert sur quatre commits d'affilée pendant que la CI était ROUGE — et
  personne ne l'a vu, parce qu'il n'y a pas de PR pour afficher un ✗. Sur ce dépôt,
  « poussé » ne veut pas dire « vert ». Le push n'est fini qu'une fois le run consulté.
  ⚠️ **Et Vercel ne bloque PAS sur la CI** : les quatre commits rouges ont été déployés en
  production comme les autres. GitHub Actions et Vercel sont deux chaînes indépendantes —
  « le site marche » ne prouve rien sur l'état de la CI, et réciproquement. Vérifier les
  deux, séparément.
- **Une même règle tenue dans deux langages diverge, et le mauvais exemplaire gagne.**
  Le garde-fou n°1 vivait à la fois dans `tests/piiGuard.test.ts` et dans un `git grep` de
  la CI. Le grep, plus grossier, a fini par bloquer sur la chaîne fabriquée qui PROUVE que
  le test détecte quelque chose — il détectait le détecteur. Et il cachait un second échec
  latent, faute de connaître la convention « un exemple porte un marqueur ». Deux
  implémentations d'une règle, c'est une règle et demie : garder la précise, retirer l'autre.
- **Un garde qui s'exclut d'un dossier entier s'en exclut pour toujours.** `piiGuard`
  ignorait tout `tests/` pour ne pas se détecter lui-même : la bonne exclusion était LUI,
  pas le dossier. Exclure large est le réflexe facile, et il laisse un angle mort permanent
  que rien ne signale.
- **Lire un fichier écrit sous Windows = retirer le BOM, tolérer CRLF.** `Set-Content
  -Encoding utf8` (PowerShell 5.1) et le Bloc-notes écrivent un BOM UTF-8 **par défaut**.
  `process.loadEnvFile` de Node ne le retire pas : la première clé devient
  `\uFEFFDATABASE_URL`, donc `process.env.DATABASE_URL` reste `undefined` — le fichier est
  correct, la variable est introuvable, et rien ne l'explique. On ne demande pas à
  quelqu'un de contourner le comportement par défaut de son système : on lit le fichier
  soi-même. Vaut pour tout fichier de config que Marc édite à la main.
- **Un outil qui échoue en SILENCE est pire qu'un outil qui plante.** `drizzle-kit migrate`
  choisit le pilote `@neondatabase/serverless` dès qu'il est installé ; ce pilote exige un
  websocket qu'il faut configurer soi-même en Node. Sans ça il sort avec le **code 0**, sans
  erreur, **sans avoir créé une seule table** — et on continue en croyant la base à jour.
  Deux règles qui en découlent : (a) un script qui MODIFIE quelque chose doit VÉRIFIER le
  résultat auprès de la source, pas se fier à l'absence d'exception ; (b) « la commande n'a
  rien dit » ne vaut jamais « la commande a réussi ». `npm run db:migrate` passe désormais
  par `scripts/migrer.ts` (pilote HTTP, celui de l'app), qui relit `information_schema` et
  sort en échec si une table manque. Verrouillé par `tests/outillage.test.ts`.
- **Ce que Next.js fait pour toi, les outils en ligne de commande ne le font pas.** Next
  charge `.env.local` ; `drizzle-kit` et les scripts `tsx` tournent HORS de Next et ne le
  chargent pas. `npm run db:migrate` échouait donc sur `url: ''` avec la chaîne dans le
  fichier juste à côté, et l'unique contournement — poser la variable dans le terminal —
  meurt avec la fenêtre et oblige à recoller un SECRET à la main chaque fois. Tout script
  hors Next qui lit une variable d'environnement appelle `chargerEnvLocal()` en première
  ligne. Et un message « valeur manquante » doit dire OÙ la poser, pas seulement qu'elle
  manque.
- **Un message d'erreur FAUX coûte plus cher qu'un message générique.** La page Carte a
  annoncé « la base n'a pas répondu » alors que la base répondait très bien — pour dire que
  la table n'existait pas. Marc est parti vérifier une connexion là où il manquait une
  commande. La cause n'était pas la logique mais sa DUPLICATION : l'accueil classait
  correctement (`42P01` = table absente ≠ panne), la nouvelle page avait été écrite sans
  reprendre cette classification. **Quand tu écris une page qui ressemble à une page
  existante, va CHERCHER ses gardes au lieu de les réécrire** — et si elles sont inline,
  extrais-les d'abord (`lib/panne.ts`). Verrouillé par un test qui interdit à toute page de
  re-comparer le code Postgres dans son coin.
- **Toute date que l'app ÉCRIT se calcule dans le fuseau de Marc, jamais en UTC.**
  Vercel tourne en UTC, Marc vit à UTC−4 : `new Date().toISOString().slice(0, 10)` date du
  LENDEMAIN toute offre ajoutée après 20 h locale. Le format voulu (`AAAA-MM-JJ`) s'obtient
  par `Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU })` — pas en recomposant les
  composants à la main. Et l'instant reste un **paramètre** de la fonction : c'est la seule
  façon de tester le passage de minuit. Vaut pour `dateReperage`, `dateEnvoi`, et toute
  date future que l'app posera elle-même.
- **Un invariant de COMPTAGE additionne des grandeurs de MÊME unité.** Le test « aucune
  offre ne disparaît » additionnait un compte d'OFFRES épinglées à `horsCibles` — un compte
  de NOMS dédupliqués : vacant dès qu'un employeur hors cibles porte deux offres (trouvé par
  la revue, sonde à l'appui). Compter des deux côtés dans la même unité, et préférer
  l'égalité EXACTE au `>=` quand la partition est totale. Sœur, même revue : une résolution
  de géocodeur DANS les bornes régionales n'est pas encore la bonne — la valider par la
  CLASSE du lieu et la DISTANCE au référent attendu, sinon un homonyme d'ailleurs s'inscrit
  « exact » à vie.
- **Un traitement automatique qui RETIRE quelque chose se conçoit à l'envers : d'abord ce
  qu'il n'a pas le droit de toucher.** « Enlève les offres qui ne sont plus dispos » se code
  en trois lignes et détruit le jeu de données. Une offre absente d'un balayage n'est pas
  fermée — le classement de la source suffit à la faire disparaître d'une requête. Trois
  gardes, chacune prouvée par sonde : un SEUIL d'absences consécutives (pas une), une
  RÉSURRECTION automatique (un faux positif ne doit jamais être définitif), et l'exclusion
  de ce que le traitement n'a jamais vu lui-même (les entrées saisies à la main ne relèvent
  pas d'une requête automatique). Sans la troisième, un balayage vide périmait les 29 offres
  d'un coup — mesuré, pas supposé.
- **« Redeploy » rejoue le commit du déploiement existant, PAS le dernier commit.** Vécu le
  2026-07-31 : `CRON_SECRET` posé, redéploiement fait, tout semblait en place — mais la
  production servait encore le commit précédent, et le code de la veille n'était nulle part.
  Le webhook GitHub → Vercel avait manqué le push, et un redéploiement ne le rattrape pas :
  il rejoue le MÊME commit avec les nouvelles variables. Vérifier un déploiement, c'est donc
  comparer le SHA servi au SHA attendu (`latestDeployment` / `githubCommitSha`), jamais se
  fier au fait qu'un déploiement récent existe. Même famille que « CI verte ≠ code en
  production » : le statut d'une opération ne dit pas ce qui tourne.
  ⚠️ **Récidive le 2026-08-12, en pire : AUCUN déploiement créé pour DEUX pushes d'affilée**
  (pas même un déploiement qui rejoue un vieux SHA — zéro entrée dans `list_deployments`).
  Le symptôme ne se lit donc PAS dans les build logs (rien à lire, rien n'a démarré) mais
  dans l'ABSENCE d'entrée récente comparée à l'heure du push (`git show -s --format=%cI`
  vs `createdAt` du dernier déploiement). Remède qui a marché : un nouveau commit RÉEL
  poussé (pas un redeploy depuis le dashboard, qui rejoue l'ancien SHA comme ci-dessus) —
  un nouveau push retente une livraison de webhook.
- **Un revert de conteneur peut effacer un travail non commité EN PLUS DE la plomberie git**
  (voir la leçon voisine sur `.git/config`) : ici, le fichier `lib/travaux.ts` entier avait
  disparu du disque, pas seulement le HEAD local qui pointait 20 commits en arrière. Le test
  décisif n'est pas « `git status` est-il propre » (il l'était — rien à perdre puisque tout
  était déjà reverté) mais « `git rev-parse HEAD` correspond-il à `git ls-remote origin
  main` ». Le correctif est le même que d'habitude (`git fetch` + `checkout -B main
  origin/main`), mais la conséquence change : tout ce qui n'était PAS encore poussé au
  moment du revert est perdu pour de vrai, pas juste temporairement invisible — il faut le
  refaire, pas le récupérer. Confirme le corollaire déjà noté : committer ne protège pas,
  seul un push protège.
- **Le FORMAT d'une erreur dit d'où elle vient.** `{"error":"non_authentifie"}` est le
  middleware ; `{"ok":false,"erreur":"non autorisé"}` est la route. Recevoir le premier là
  où on attend le second prouve que la requête n'atteint jamais la route — donc que le code
  n'est pas déployé, pas que le secret est faux. Distinguer les messages d'erreur par
  couche, c'est se donner un diagnostic gratuit.
- **Quand deux acteurs détiennent chacun la moitié d'un accès, la solution n'est pas de
  compléter l'un — c'est de vérifier que l'accès manquant est nécessaire.** Une Routine a
  Indeed sans le dépôt GitHub ; ma session a le dépôt sans réseau. J'ai d'abord cherché à
  donner le dépôt à la Routine. La vraie question était : les offres doivent-elles passer
  par un commit ? Non — elles vont en base. Un point d'entrée HTTP a fait disparaître le
  blocage au lieu de le contourner. Avant de chercher à élargir une permission, se demander
  si le chemin qui l'exige est le bon.
- **Compter un refus ne suffit pas : il faut le NOMMER.** « 5 écartées » ne se vérifie pas —
  ça ne dit pas si le filtre a bien travaillé ou s'il vient de jeter la meilleure offre du
  jour, et le seul moyen de trancher serait de tout rouvrir à la main : exactement ce que
  l'automatisation doit épargner. Tout rejet automatique porte son motif et son objet. Deux
  façons de compter la même réalité (total et liste) se vérifient l'une l'autre par test.
- **Un flux VALIDE n'est pas un flux UTILE : lire le contenu, pas le format.** Le RSS
  d'Espresso-Jobs répond 200, en XML bien formé, avec 20 entrées — tous les voyants au vert.
  La première s'intitule « TI : peut-on encore se priver des femmes ? » : c'est leur blogue,
  pas leurs offres. Un analyseur qui compte les entrées aurait déclaré la source
  fonctionnelle. Toujours faire remonter un ÉCHANTILLON du contenu jusqu'à l'œil humain —
  c'est la seule vérification qu'aucun code ne remplace.
- **Un HTTP 200 ne prouve rien tant qu'on n'a pas mesuré ce que l'API répond à une question
  ABSURDE.** La découverte de pages carrières annonçait « 36 entreprises trouvées » : c'était
  faux, le code prenait un 200 pour une preuve. Un TÉMOIN NÉGATIF a tranché en une requête —
  on interroge un nom qu'aucune entreprise ne porte : Greenhouse, Lever, Recruitee et
  Workable répondent 404 (leur réponse est donc exploitable), SmartRecruiters répond 200
  (la sienne ne vaut rien sans offres réelles). Avant de croire un signal de présence,
  vérifier ce que la source répond à une ABSENCE.
- **Un identifiant deviné trouve des homonymes, et ils sont crédibles.** `recruitee/ace` et
  `recruitee/robert` ont bien répondu — avec des postes à Amsterdam. Une résolution par nom
  normalisé n'a aucune valeur tant que le CONTENU n'a pas été confronté à ce qu'on attend
  (ici la région) : deux vérifications indépendantes, jamais une seule.
- **Ne jamais laisser tourner une source prouvée morte.** Le flux du Guichet-Emplois répond
  404 sur toutes les adresses testées. Le garder dans la liste active ferait huit requêtes
  vouées à l'échec chaque matin : du bruit dans le rapport, et surtout l'habitude de voir des
  sources en erreur — après quoi une vraie panne ne se remarque plus. Désactiver, avec la
  preuve écrite à côté.
- **Un seuil se pose sur la composante qui MESURE, pas sur le total.** Un plancher sur la
  note globale ne filtrait rien : « Caissier » et « Préposé à l'entretien ménager » notent
  48/100, parce que les points accordés aux INCONNUES (distance non mesurée, salaire non
  affiché, aucune exigence détectée) s'accumulent quel que soit le métier — un poste sans
  aucun rapport part déjà avec 40 points. Avant de fixer un seuil sur une note composite,
  INSTANCIER des cas volontairement hors sujet et regarder ce qu'ils obtiennent ; c'est ce
  qui révèle que seule une composante discrimine vraiment.
- **Une expression composée ne survit pas à l'écriture inclusive.** « Chargé(e) de projets »
  ne correspondait pas à « chargé de projet » : le `(e)` coupe l'expression en deux, et le
  poste tombait de 28 à 8 sur 40. Les mots isolés (« coordonnateur(trice) ») s'en tiraient
  par hasard, la marque tombant après le mot — donc le bug était invisible sur la moitié des
  cas. Au Québec, c'est la forme NORMALE d'une annonce : toute recherche de motif dans un
  titre doit d'abord normaliser (`normaliserTitre`).
- **Supprimer un geste manuel déplace son coût : il faut le borner AVANT de le supprimer.**
  Le bouton « Situer » servait de limiteur de débit humain — Marc cliquait une fois de temps
  en temps. Lancé automatiquement à chaque affichage de la carte, le même code enverrait une
  salve à Nominatim à chaque rechargement, et un service gratuit bannit les appelants
  insistants : le confort aurait coûté la fonctionnalité. Toute automatisation d'un geste
  humain hérite donc d'une contre-pression explicite (ici une passe / 5 min), stockée là où
  toutes les instances la voient — en serverless, une variable de module ne borne rien.
  Défaut sûr en cas d'échec de la borne : ne rien faire.
- **Un travail de fond va APRÈS la réponse, pas dedans.** Une passe de géocodage enchaîne
  des requêtes espacées de 1,1 s ; l'exécuter pendant le rendu ajouterait ces secondes à
  chaque affichage. `after()` (Next 15) la sort du chemin critique : la page s'affiche à sa
  vitesse normale et se complète au passage suivant.
- **Un déclencheur automatique se calibre sur ce qui doit VRAIMENT le réveiller.** L'app se
  synchronise sur une empreinte du contenu du jeu de départ — pas sur un compte d'offres,
  qui ne verrait pas une note corrigée, et surtout pas sur les champs de Marc, sinon chacun
  de ses clics déclencherait une réécriture complète. Le test qui le prouve doit être
  discriminant : ajouter `statut` à l'empreinte doit le faire tomber.
- **Un mécanisme qui ne peut pas atteindre sa source doit le DIRE, pas rendre un résultat
  vide.** L'absence de résultat et l'incapacité de chercher se ressemblent — « aucune
  nouvelle offre » est une phrase vraie sur la forme et fausse sur le fond quand la source
  n'a jamais été interrogée. Tout travail de fond vérifie donc sa source AVANT de conclure,
  et rapporte l'empêchement plutôt qu'un vide trompeur.
- **Un `| grep` masque le code de sortie : ne jamais chaîner un gate derrière lui.**
  `npm run test 2>&1 | grep -E "×|Tests " && echo VERT` affiche « VERT » alors que deux
  tests échouent — c'est `grep` qui a réussi, pas la suite. Vérifié en direct sur ce dépôt.
  Un gate se juge sur l'exit code de CHAQUE commande (`cmd > /dev/null; echo $?`), jamais
  sur la sortie d'un filtre placé après. Même famille que « ne jamais juger un `git push`
  via `| tail` ».
- **Un test qui désigne une donnée par son INDEX se met à tester autre chose en silence.**
  `SEED[30]` visait une candidature de 2025 ; neuf offres insérées plus haut ont décalé
  l'indice, et le test s'est mis à vérifier une offre active — sans rien signaler d'autre
  qu'un échec cryptique. Désigner par PRÉDICAT (`SEED.find(o => o.histo)`) avec une garde
  qui lève si le prédicat ne trouve rien : sinon le jour où il ne trouve plus rien, le test
  passe à vide.
- **Diagnostiquer AVANT de corriger : « trop peu d'offres » n'était pas un bug de carte.**
  Le réflexe était de retoucher l'affichage. Le comptage a montré l'inverse : 23 offres
  vivantes, 23 épinglées, zéro hors cibles — la carte montrait 100 % de ce qu'elle avait.
  Le manque était dans le STOCK, et le remède n'avait rien à voir (alimenter le jeu de
  données). Une plainte sur ce qu'on VOIT ne désigne pas forcément ce qu'il faut CHANGER :
  mesurer d'abord, sinon on « corrige » ce qui marche.
- **Un jeu de données qui change de nature casse les tests qui décrivaient son état — et
  c'est le moment de distinguer la DESCRIPTION de l'INVARIANT.** Ajouter six offres
  automatiques a fait tomber sept tests. Trois comptaient (23 → 29 : à mettre à jour).
  Quatre encodaient des propriétés du seed d'origine — « toute note est manuelle », « toute
  offre a une distance » — vraies par construction tant que tout était saisi à la main.
  Les supprimer aurait ouvert un trou ; les garder aurait forcé à inventer des distances.
  On les REFORMULE en ce qu'ils protègent vraiment (« une note calculée respecte son
  plafond », « une distance PRÉSENTE est plausible ») et on ajoute un **filet de
  majorité** : le jour où l'automatique dominera le manuel, ce sera une décision, pas un
  glissement. Reformuler n'est pas affaiblir — encore faut-il l'écrire dans le test.
- **Une sonde qui tourne dans un état local différent du distant ne prouve rien.**
  L'avertissement « le tag de la version courante existe-t-il ? » a répondu « tag v1.1.0
  présent » — parce que mon clone portait le tag créé lors d'un `git push` REFUSÉ (403).
  Invisible du distant, donc inexistant pour le clone frais d'une CI : la sonde validait
  un garde qui, en vrai, se serait déclenché. Toute vérification d'un mécanisme qui
  tournera ailleurs (CI, autre poste, production) se fait dans SES conditions —
  ici `git ls-remote`, pas `git rev-parse`. Vaut aussi pour l'inverse : un `.env.local`
  présent en local ferait croire qu'un build « ne demande aucun secret ».
- **Un message de commit ne passe jamais par une chaîne interpolée par le shell.**
  Deux mots entre backticks dans un `git commit -m "…"` ont été exécutés comme des
  commandes : le message poussé disait « le gate accepte ␣ comme ␣ ». Bash ne prévient
  pas, et le message est déjà en ligne quand on le relit. Passer par
  `git commit -F - <<'MSG'` (heredoc entre quotes : aucune interpolation) dès qu'un
  message contient des backticks, `$`, ou des guillemets.
- **Ce qui doit bloquer vit dans le gate ; ce qui change sans le code vit à côté.**
  `npm audit` en CI est utile mais devient rouge alors qu'aucune ligne n'a bougé — dans
  le gate, il peint un dépôt sain en rouge et on prend l'habitude du rouge, ce qui est
  exactement comment la CI de ce dépôt a été ignorée quatre commits d'affilée. En job
  séparé (plus un passage hebdomadaire), « gate vert / audit rouge » se lit d'un coup
  d'œil et désigne la vraie cause.
- **Une liste de colonnes recopiée à N endroits perd le champ suivant, et personne ne le
  voit.** `offers.ville` a été ajoutée au schéma, au type et à la lecture — et oubliée dans
  les QUATRE chemins d'insertion, qui recopiaient chacun leur liste. Aucune erreur, aucun
  log : le type porte le champ, la lecture le lit, l'écriture le perd. Quarante offres
  réelles sont entrées en production sans ville, donc sans position, donc sans distance —
  le critère n°1 de Marc, effacé en silence pendant qu'il regardait une carte qui « manquait
  d'offres ». Un `INSERT` recopié est une bombe à retardement dont la mèche est la prochaine
  colonne : une seule copie (`lib/persistance.ts`), et un verrou qui **dérive** la liste
  attendue du schéma plutôt que de la réécrire — sinon il vieillit comme les copies qu'il
  remplace. Corollaire : unifier des colonnes CHANGE un comportement là où une copie
  écrivait moins que les autres (ici `perimeeLe`, que la synchro du seed ne touchait pas et
  qui aurait ressuscité les offres périmées). Lister ces écarts AVANT d'unifier, et les
  nommer dans le code.
- **Une colonne ajoutée à une table dont le traitement SAUTE les entrées déjà présentes est
  une colonne morte pour tout l'existant.** Vécu TROIS FOIS le même jour : `ville` (l'insert
  ne l'écrivait pas), `ville` encore (`empreinteSeed` l'ignorait), puis `adresse` — les deux
  passes de géocodage écartent explicitement ce qui est déjà situé (`!deja.has(nom)`), donc
  toute entreprise géocodée avant l'ajout de la colonne ne serait jamais retentée. Le
  symptôme est toujours le même : ça marche pour les nouvelles entrées, donc les tests
  passent et l'écran a l'air correct, pendant que le stock existant reste vide à vie. La
  règle : **le chemin de rattrapage se livre DANS le même lot que la colonne**, jamais
  « plus tard ». Et la question à se poser en ajoutant un champ : « qu'est-ce qui le
  remplira pour ce qui est DÉJÀ en base ? » — si la réponse est « rien », le lot est
  incomplet.
- **« Cette liste-là sert à autre chose » n'immunise pas contre l'oubli qu'on vient de
  corriger.** En unifiant les quatre listes de colonnes, j'ai écarté une CINQUIÈME liste de
  champs (`empreinteSeed`) au motif qu'elle répond à une autre question — et j'ai écrit ce
  motif dans le message de commit. Elle avait pourtant perdu `ville` exactement pareil : une
  ville corrigée dans le jeu de départ ne changeait pas l'empreinte, donc la synchro
  répondait « à jour » et la correction ne partait jamais en base. Quand on corrige un champ
  oublié, RECENSER toutes les listes qui l'énumèrent — écriture, empreinte, sérialisation,
  export — et vérifier chacune par une sonde, pas par un raisonnement sur sa finalité.
- **Une heuristique peut grouper ce qu'on REGARDE, jamais décider ce qu'on ÉCRIT.**
  En unifiant l'appariement des noms d'employeur, j'ai fait passer une règle de sous-chaîne
  de l'affichage (grouper deux annonces sur une épingle) à l'écriture (choisir la position
  qui donne la distance et la note d'une offre) — dans le fichier même dont l'en-tête
  interdisait ce glissement. Mesuré : `apparier("Robert", "Groupe Robert")` est vrai, donc
  une offre de « Robert » aurait reçu en silence la distance de « Groupe Robert ». Deux
  usages, deux règles : floue pour regrouper un affichage (une erreur se voit), stricte pour
  décider d'une donnée (une erreur s'écrit en base sans bruit). Et quand on unifie deux
  implémentations, se demander laquelle des deux était la PLUS STRICTE — c'est elle qui
  protégeait quelque chose.
- **Un choix qui dépend de l'ordre d'un `SELECT` sans `ORDER BY` est un tirage au sort.**
  Postgres ne garantit aucun ordre sans tri explicite. Un « premier candidat qui apparie »
  change donc d'une requête à l'autre — et se fige en base à la première écriture, ce qui
  le rend indébogable après coup. Trier avant de choisir, et le tester.
- **Un écart « assumé par un commentaire » reste un écart.** Le rattrapage de ville
  n'existait que dans le point de dépôt, et un commentaire disait que le cron ne le faisait
  pas — ce qui laissait la veille quotidienne aveugle au même manque, pour la seule raison
  qu'on avait codé le remède ailleurs. Écrire « c'est voulu » ne rend pas une lacune
  voulue : ou bien le second chemin n'en a réellement pas besoin, et on dit POURQUOI, ou
  bien il en a besoin et le commentaire ne fait que différer le travail. Même chose pour un
  cul-de-sac silencieux : une offre saisie sans ville était insituable À VIE, `ville`
  n'étant modifiable nulle part — une donnée qu'on ne peut ni fournir ni corriger n'est pas
  une limite de produit, c'est un défaut.
- **Un travail de fond a besoin d'un gate qui CONVERGE, pas d'un gate qui a l'air juste.**
  « Cet employeur n'a pas de position » se code en comparant son nom à la table des
  positions — et ne s'éteint jamais quand la position est inscrite sous un autre nom
  (« Laserax » vs « Laserax inc. »). Le bon critère est celui du RÉSULTAT visé (`km === null`
  : la distance est-elle mesurée ?), pas celui du moyen. Corollaire : deux pages qui
  déclenchent le même travail doivent le déclencher sur la MÊME condition, sinon l'une des
  deux boucle.
- **Deux `after()` ne s'exécutent pas l'un après l'autre.** La file de Next est créée sans
  limite de concurrence (mesuré : `p-queue` par défaut = `Infinity`). Deux travaux de fond
  qui respectent chacun leur cadence de 1,1 s produisent donc DEUX flux simultanés vers un
  service qui interdit la concurrence. Un seul `after()`, les travaux `await`és en série —
  et un `try` par travail, sinon l'échec du premier emporte le second.
- **Une plainte sur ce qu'on VOIT ne désigne presque jamais ce qu'il faut CHANGER.**
  « Les offres ne sont pas sur la carte » : le réflexe est la carte, la cause était une
  colonne jamais écrite deux couches plus bas. Déjà vécu avec « trop peu d'offres », qui
  était un manque de STOCK et non d'affichage. Remonter la chaîne complète — écriture,
  lecture, transformation, rendu — avant de toucher la couche qu'on accuse.
- **Un export de données est une surface d'exécution, pas un dump.** Une cellule CSV qui
  commence par `=`, `+`, `-` ou `@` est évaluée à l'ouverture par Excel, LibreOffice et
  Google Sheets. Tout champ de texte libre qui sort de l'app vers un tableur se neutralise
  au point de FORMATAGE (`lib/export.ts`), jamais dans le composant qui télécharge.
- **Retirer ce qui est laid ne produit pas du beau : ça produit du NEUTRE.** L'épure du
  2026-08-05 a retiré les ombres, les contours, les liserés, quatre tuiles sur cinq, et rendu
  l'ambre « rare ». Chaque geste était juste — l'écran d'avant empilait trois signaux qui se
  neutralisaient. Mais rien n'est venu REMPLACER ce qui partait, et le résultat (des
  rectangles blancs sur du gris) a valu « on dirait un logiciel de gestion ». Une épure
  libère la place, elle ne la remplit pas : elle doit être suivie d'un geste POSITIF, sinon
  on a juste soustrait. Corollaire pour toute demande d'apparence : « c'est trop chargé » et
  « c'est plat » sont les deux bouts du même axe, et on les traverse en une seule refonte si
  on ne remplace rien.
- **Une règle d'apparence vraie en CLAIR peut être fausse en SOMBRE — la vérifier sur les
  jetons, pas au jugé.** « Une carte blanche sur un fond gris se détache déjà, la lumière
  suffit » a servi à retirer tous les contours. Mesuré ensuite : l'écart de clarté fond↔carte
  vaut 4 points en sombre et 2,9 en clair. C'était donc insuffisant DANS LES DEUX THÈMES, et
  la règle avait l'air vraie parce qu'on ne l'avait jamais chiffrée. Avant de supprimer un
  séparateur au motif que « le contraste suffit », lire les valeurs.
- **Une maquette de refonte doit partir du code EXISTANT, pas d'une page blanche.** En
  proposant une direction visuelle, j'ai remplacé le dégradé de couleur par note d'un binaire
  ambre/gris — sans voir que `lib/couleurNote.ts` faisait déjà exactement ça, à la demande de
  Marc six jours plus tôt. Il l'a lu comme une nouvelle demande ; c'était une RÉGRESSION que
  je lui présentais. Même réflexe que « vérifier qu'une tâche n'est pas déjà faite », mais
  appliqué au DESIGN : recenser ce que l'écran fait déjà avant de redessiner, sinon on fait
  valider une perte.
- **Un second thème jamais montré à la validation n'est pas une option, c'est une version
  NON VALIDÉE de l'app servie au hasard du réglage système.** La refonte « Poste de nuit »
  a été choisie sur maquette, sa densité réglée au curseur, sa couleur arbitrée écran par
  écran — tout ça sur UNE apparence. L'autre, produite gratuitement par une
  `@media (prefers-color-scheme: light)`, n'a été ni montrée ni réglée. Le jour du
  déploiement Marc a signalé « les couleurs sont pas les mêmes » : son système est en clair,
  il regardait le pendant fade. Ce n'était pas un bug de code, et pourtant c'en était un
  d'expérience. Règle : soit un thème est dessiné, mesuré et validé comme l'autre, soit il
  n'existe pas. Corollaire de plomberie, quand on en retire un : `viewport.themeColor` et
  `manifest.background_color`/`theme_color` sont HORS du CSS — une valeur claire oubliée
  dans le manifeste fait un flash blanc au démarrage de l'app installée, et personne ne
  regarde le manifeste en revoyant une feuille de style.
- **Une lecture de format binaire écrite à la main s'éprouve sur des fichiers TIERS, ou elle
  ment.** J'ai écrit un lecteur de PDF (zlib + opérateurs `Tj`/`TJ`) : raisonnement
  défendable, tests verts, et deux échecs sur les deux premiers PDF réels rencontrés. Le
  pire n'était pas le faux négatif (« c'est un scan » sur un document plein de texte) mais
  le faux POSITIF : **76 784 caractères de binaire d'image annoncés comme un succès**, prêts
  à partir vers un modèle qui en aurait tiré un profil entièrement inventé. Un test écrit
  par l'auteur du parseur valide ses propres hypothèses, pas le format. Règle : soit une
  bibliothèque éprouvée, soit une épreuve sur des fichiers que personne n'a produits pour ce
  test. Et l'échec d'un extracteur doit être **impossible à confondre avec un succès
  maigre** — d'où un seuil de vraisemblance, pas seulement un `try/catch`.
- **Un test qui EXIGE un fichier absent de la CI transforme une dépendance de machine en
  rouge permanent.** J'avais vu le risque (« un test sauté en silence a cessé de protéger »)
  et tranché du mauvais côté : assertion dure ⇒ CI rouge sur autre chose qu'un défaut du
  code. Et committer les fichiers était exclu — l'un montrait du contenu réel du Drive de
  Marc. Le bon geste : **construire les cas** (ils sont lus par une bibliothèque tierce, qui
  refuserait une structure fantaisiste) et garder les fichiers réels en épreuve
  SUPPLÉMENTAIRE, jamais en condition de réussite.
- **Un garde de données personnelles fait des faux positifs, et c'est le garde qui a
  raison.** Les coordonnées d'un rectangle dans un PDF d'épreuve (trois groupes de trois
  chiffres) ont été lues comme un numéro d'assurance sociale. Puis le COMMENTAIRE qui citait
  la valeur fautive a rejoué l'échec — un scan de source ne distingue pas une explication de
  la chose expliquée. On adapte la donnée d'épreuve, jamais le motif : un garde qu'on
  assouplit une fois « parce que c'était un faux positif » ne protège plus rien.
- **Une bibliothèque peut DÉTACHER le tampon qu'on lui passe.** `getDocumentProxy` (pdf.js)
  ramène le `Uint8Array` de l'appelant à 0 octet — mesuré, 124 310 → 0. Comme l'appelant
  stockait le fichier APRÈS l'extraction, la base aurait reçu des CV vides, sans la moindre
  erreur, invisibles jusqu'à la première ré-analyse. Réflexe : quand une fonction tierce
  reçoit un tampon et rend un objet qui « possède » les données, **copier avant** et
  verrouiller par un test qui compare la longueur avant/après.
- **Composer un objet par `{ ...brut, quelquesChamps: netto(…) }` laisse passer TOUT LE
  RESTE.** J'ai nettoyé les coordonnées d'un CV dans un objet… que personne ne lisait, puis
  persisté un étalement de la réponse BRUTE du modèle avec trois champs seulement ré-écrits
  par-dessus. `langues`, `diplomes`, `outils`, `titresOccupes` et la provenance partaient
  donc en base, dans le profil et à l'écran, pendant que le code ET l'interface promettaient
  à Marc le contraire. **Nettoyer d'abord, composer ensuite, champ par champ** : ajouter un
  champ au schéma sans l'ajouter à la composition casse alors le typage, au lieu de laisser
  filer du texte brut en silence. Et le test doit viser **le champ réellement persisté**,
  jamais celui qu'on espérait voir utilisé — c'est la confusion même qui a créé le trou.
- **Un test qui n'éprouve qu'UNE variante d'un motif fait croire que le motif entier est
  couvert.** Mon filtre anti-évasion acceptait `[ \t]` là où il fallait `\s` : une balise
  coupée par un retour à la ligne traversait intacte et refermait le bloc de données. Le
  test « un texte balisé ne peut pas sortir de son bloc » passait — il n'essayait que
  l'espace. Pour un motif à classe de caractères, boucler sur TOUTES les variantes.
- **Le garde PII se déclenchera sur tes FIXTURES et sur tes COMMENTAIRES, et il aura
  raison.** Trois fois dans la même session : des coordonnées de rectangle lues comme un
  NAS, le commentaire qui citait la valeur fautive, puis des adresses et téléphones de test.
  Un scan de source ne distingue ni une illustration ni un faux numéro. Remède : **assembler
  les valeurs sensibles à l'exécution** (`["514","555","1234"].join("-")`) — aucune ligne de
  source ne porte de motif complet, la valeur est entière au runtime, le test reste réel.
- **Le conteneur peut REVERTIR l'arbre de travail en pleine tâche — `origin` est la seule
  vérité.** Vécu le 2026-08-14 : `git log` local remonté de sept commits (jusqu'à
  `[BORNE-02]`), `node_modules` amputé des paquets installés le jour même. Rien n'était
  perdu — `git ls-remote origin main` donnait le bon tip — mais **j'avais commencé à éditer
  la version périmée d'un fichier**, et cette version-là ne connaissait ni les bornes de
  recharge, ni le site, ni le téléphone, ni les horaires : mon édition les aurait toutes
  supprimées, sous couvert d'un « restylage ». Réflexes, dans cet ordre : (1) au moindre
  fichier qui montre du code supprimé récemment, **suspecter le revert AVANT toute
  hypothèse** ; (2) `git ls-remote origin main` — le serveur, jamais le ref local ;
  (3) `git checkout -B main FETCH_HEAD` puis `npm install` ; (4) **jeter les éditions faites
  sur l'ancienne base** au lieu de les rejouer, et refaire le travail sur la bonne.
- **Après un revert, `refs/remotes/origin/main` peut MANQUER alors que le tracking est
  configuré.** La refspec de ce clone ne suit qu'une branche : `git fetch` ne recrée donc pas
  `origin/main`, `@{u}` ne résout plus, et un garde d'arrêt annonce « 173 commits non poussés,
  pas de branche distante » sur un dépôt parfaitement à jour. Ne pas courir après un push
  déjà fait : comparer `git rev-parse HEAD` à `git ls-remote origin main`, puis rétablir le
  ref (`git config --add remote.origin.fetch '+refs/heads/main:refs/remotes/origin/main'`
  puis `git fetch origin`). Un avertissement de garde se VÉRIFIE comme un finding.
- **Une couleur écrite EN DUR ne se plaint jamais d'un changement de thème : elle devient
  fausse, en silence.** Deux valeurs du thème clair ont survécu au passage au sombre dans la
  bulle de la carte — un orange foncé pour une mention, un gris clair pour un filet — sur un
  écran qu'on ne rouvre pas tous les jours. Aucun test ne les voyait. Verrou :
  `tests/styles.test.ts` refuse tout `#rrggbb` dans une RÈGLE (les commentaires citent les
  valeurs retirées, à dessein). Corollaire : quand un écran « ne ressemble pas à la
  maquette », commencer par COMPARER LES JETONS aux hex de la maquette — ici les quatre
  neutres étaient identiques, ce qui a désigné tout de suite la vraie cause.
- **Un travail périodique qui dépend d'un déclencheur UNIQUE meurt en silence.** Le cron
  Vercel de la veille a cessé d'être appelé pendant trois jours ; celui de géocodage, déclaré
  dans le MÊME `vercel.json`, tournait chaque nuit. Rien ne l'a signalé : les offres cessent
  de se rafraîchir, l'app affiche les anciennes, la péremption les éteint une par une. Deux
  règles en sortent : (1) **toute action périodique porte une RÉSERVATION** (`reserverPasse`)
  même quand un seul chemin la déclenche — c'est elle qui rend un second chemin possible plus
  tard sans risque de double exécution ; (2) **un second déclencheur vaut mieux qu'un seul**,
  et le meilleur candidat est celui dont on a la PREUVE qu'il tourne. Le délai de réservation
  se dérive de l'écart entre les déclencheurs (ici 12 h ⇒ 20 h, entre 12 et 24), jamais d'un
  chiffre rond choisi au jugé — et le test le dérive de cet écart, pas de la valeur du jour.
- **Un saut de build se décide contre `HEAD^`, en SUPPOSANT que `HEAD^` a été déployé — et
  cette supposition tombe précisément le jour où un déploiement manque.** Troisième occurrence
  du webhook GitHub non livré (2026-08-14, après le 07-31 et le 08-12) : aucun déploiement créé
  pour `a30409d`, quarante minutes durant. Le piège est dans la suite : `build-necessaire.sh`
  ne regarde que le diff `HEAD^..HEAD`, donc un commit de docs poussé ensuite serait IGNORÉ —
  et le correctif serait resté hors ligne sans qu'aucun voyant ne change. Un mécanisme
  d'économie qui raisonne sur le commit PRÉCÉDENT plutôt que sur le commit DÉPLOYÉ hérite de
  toutes les livraisons manquées. Trois conséquences opératoires : (a) le remède reste un
  nouveau PUSH (un « Redeploy » rejoue le SHA du déploiement existant, ici ANTÉRIEUR au
  correctif) ; (b) un **commit vide** est le véhicule le plus sûr — il ne touche aucun fichier
  et son diff vide tombe dans « aucun fichier lisible » ⇒ `exit 1` ⇒ build LANCÉ, vérifié par
  sonde avant le push, jamais supposé ; (c) après le push, le seul signal valable est le SHA
  du déploiement `READY` comparé au SHA attendu.
- **`deploy_to_vercel` n'est pas « déploie ce dépôt ».** L'outil MCP téléverse un arbre de
  fichiers qu'il faut ÉNUMÉRER (151 fichiers ici) : ce qu'on oublie n'existe pas en production
  — la panne `outputFileTracingIncludes` du 08-12, mais provoquée à la main. Sans jeton ni CLI
  Vercel dans la session, le canal git est le SEUL chemin de déploiement fiable ; le dire au
  lieu de promettre un déploiement direct.
- **Un revert de conteneur RÉCIDIVE dans la même session, et il revient au même point.**
  Deux fois le 2026-08-14, jusqu'à `[BORNE-02]` les deux fois. Le tell de la seconde a été un
  `No such file or directory` sur un fichier lu quinze minutes plus tôt — et le commit que je
  venais de créer s'était posé sur la base périmée. « J'ai déjà vérifié l'arbre tout à l'heure »
  n'est donc PAS un acquis : la vérification se refait avant chaque écriture qui compte
  (`git ls-remote` contre `git rev-parse HEAD`), et ce qui a été fait sur l'ancienne base se
  JETTE. Corollaire déjà noté, re-vécu : le revert casse aussi la `refspec` d'`origin` (réduite
  à une vieille branche de travail), donc le garde d'arrêt annonce des centaines de commits non
  poussés sur un dépôt parfaitement à jour.
- **Un garde qui tombe pendant un refactor a raison : on met à jour sa LISTE, jamais son
  assertion.** En déplaçant la veille vers un module partagé, `tests/persistance.test.ts` a
  refusé le commit — sa liste de chemins d'écriture nommait encore l'ancien fichier. C'est
  exactement son travail : empêcher un chemin d'écriture de sortir de la surveillance à la
  faveur d'un déménagement. Retirer un chemin de cette liste, c'est cesser de le garder.
- **Prouver qu'une extraction est VERBATIM se fait sur les EFFETS, pas sur les lignes.** Un
  diff de 120 lignes déplacées ne se relit pas utilement. Ce qui se vérifie mécaniquement :
  le COMPTE de chaque écriture (`insert`, `update` par table, écritures d'état) et surtout
  leur ORDRE — ici la garantie « les offres d'abord, le journal ensuite » tient à cet ordre.
  Attention aux appels à cheval sur deux lignes : ma première regex rendait 0 des deux côtés
  et « validait » un champ qu'elle ne voyait pas.
- **Un contrôle promis en prose (« il suffira de grep ») ne verrouille rien.** L'ADR-0008
  annonçait « `grep prefers-color-scheme` ne doit rien rendre ». Personne ne lance ce grep :
  le second thème se serait reformé règle par règle sans qu'aucun test ne tombe. Le verrou
  vit dans le même commit que la décision (`tests/styles.test.ts`, discrimination prouvée en
  réintroduisant une media query), et il scanne les RÈGLES en écartant les commentaires —
  sinon il échoue sur le commentaire qui explique pourquoi il existe, et on le retire.
- **Un test « la garde couvre-t-elle X ? » se vérifie en RETIRANT la garde.** En ajoutant une
  page, j'ai voulu confirmer que `routesGardees.test.ts` l'attrapait : il passait toujours
  après suppression du `await auth()` de la page. Il n'était pas fautif — il éprouve la
  décision de la MIDDLEWARE, ce qui est son périmètre. Mais chaque page porte AUSSI une
  revérification que les commentaires appellent « défense en profondeur », promesse vérifiée
  nulle part. L'invariant tenait partout ; il n'était simplement pas protégé, et quelqu'un
  l'aurait un jour supprimé en le croyant décoratif. Réflexe : quand un commentaire annonce
  une SECONDE ligne de défense, chercher le test qui la couvre — s'il n'existe pas, elle
  n'existe qu'en intention.
- **Ajouter un paramètre à une fonction d'un seul argument piège tous les `map(fn)`.**
  `xs.map(scoreDistance)` passe (valeur, INDEX, tableau) : l'index atterrit dans le nouveau
  paramètre. Ici ça LÈVE (un nombre n'a pas de `.paliersDistanceKm`), donc ça se voit ; avec
  un défaut numérique plausible, ça noterait faux en silence. Grep les appels sans
  parenthèses avant d'élargir une signature.
- **Quand une passe fait PLUSIEURS travaux, son déclencheur doit couvrir CHACUN d'eux.**
  Le gate des pages était « une offre n'a pas de distance ». Il se referme au moment précis
  où toutes les distances sont mesurées — donc où les trajets se mettent à marcher — et il
  affamait le rattrapage des adresses et la mesure des bornes, qui vivent dans la MÊME
  passe : il ne restait que le cron nocturne, six entreprises par nuit. Marc l'a décrit
  exactement : « j'ai toujours pas toutes les adresses, POURTANT les trajets Maps
  marchent » — les deux moitiés de la phrase étaient la même cause, et c'est le « pourtant »
  qui la désignait. Un gate calibré sur le premier travail fini affame tous les autres, et
  le symptôme (« ça marche, mais il en manque toujours ») ne pointe jamais vers le gate.
  Corollaire : un gate doit aussi CONVERGER — un travail dont la réponse ne viendra jamais
  (une entreprise qu'OpenStreetMap ne connaît pas) porte un délai de retente, sinon on
  remplace « s'éteint trop tôt » par « ne s'éteint jamais ». Et vérifier qu'il y a du
  travail AVANT de réserver la passe : réserver puis ne rien faire brûle le créneau partagé
  des autres déclencheurs.
- **Un travail de fond qui ne journalise QUE ses échecs est indiagnosticable.** « Tourné
  sans rien produire » et « jamais tourné » laissent tous deux des journaux vides : on ne
  peut pas distinguer un travail qui n'a rien à faire d'un travail affamé, ni d'un travail
  coupé par son budget. Tracer CHAQUE passe, même vide, et compter en X/Y — « 0/0 » dit
  qu'il n'y avait rien à faire, « 0/6 » dit que six candidates ont été écartées, et ce sont
  deux situations opposées. Même exigence que pour les refus d'ingestion : chaque rejet
  porte son motif, parce que trois causes (homonyme écarté, source muette, service
  indisponible) appellent trois corrections différentes.
- **Une amputation de requête se fait passer pour une source vide.** La sonde CKAN portait
  `fl=title,organization,notes`, croyant DEMANDER ces champs ; le paramètre restreint la
  projection Solr et a supprimé de la réponse `organization`, `metadata_modified` et
  `resources` — précisément ce qu'on cherchait. Le rapport affichait « organisme : ? ·
  formats : aucun », et j'allais conclure que la source ne publiait rien. Une API rend son
  objet complet par défaut : on ne l'ampute que si le volume gêne, jamais « pour cibler ».
  Quand une réponse est vide là où on l'attendait pleine, suspecter SA PROPRE requête avant
  la source.
- **Un travail de fond hérite de la durée de vie de sa page — il ne s'y ajoute pas.**
  Le travail lancé par `after()` (Next 15) vit DANS l'invocation de la fonction : croire
  l'inverse est l'erreur de fond qui a tué trois `GET /carte` d'affilée en « Task timed out
  after 30 seconds », sans qu'une seule ligne de trace ne sorte — le processus est tué avant
  d'avoir pu écrire. Deux causes cumulées, dont une bien plus générale : **un budget laissé
  à `null` n'est pas un grand budget, c'est AUCUNE borne**, et ce défaut dort tant que le
  chemin est rare. Corollaire opératoire : deux séries d'appels enchaînées repartent chacune
  à zéro sur le garde-temps ET sur le plafond par passe — une frontière réseau se traverse
  en UNE série, sinon les bornes qu'on croit poser sont doublées en silence.
- **Le coût d'une frontière réseau se dimensionne sur le PIRE CAS, pas sur le cas nominal.**
  Une requête Overpass par entreprise coûte un aller-retour chacune — et quand elle échoue,
  elle coûte le délai × les trois instances de repli. Mesuré : `bornes=2/6 (3 en échec),
  budget restant=0 ms`. Baisser le délai ne réglait rien, c'était traiter le symptôme : la
  bonne question était « pourquoi le coût dépend-il du nombre de lieux ? ». Une requête sur
  la BOÎTE ENGLOBANTE de tout le lot, puis la proximité calculée en local, a rendu `76/76`
  et 27 s de budget. Quand un budget est mangé par des échecs, chercher la requête qui rend
  le coût indépendant du volume avant de rogner les délais.
- **Une déduction écrite au présent dans un commentaire devient un fait pour la prochaine
  session — donc elle se mesure ou elle se dit comme déduction.** J'ai posé un garde
  (« au-delà de 25 correspondances, le résultat serait de toute façon jugé ambigu ») en
  justifiant sa valeur par un raisonnement que je n'avais pas vérifié : il est faux dès
  qu'une seule des candidates est dans la ville attendue, cas que le code sait très bien
  trancher. Le garde jetait donc en SILENCE des résultats résolvables, pour économiser un
  coût que la mesure du jour montrait inexistant (27 s de budget restant). Deux règles :
  un filtre qui peut perdre des résultats DIT quand il mord, et un seuil qu'on n'a pas
  mesuré se place là où il n'est qu'un filet anti-explosion, jamais là où il devient une
  politique.
- **Un délai de retente encode une PRÉMISSE : quand elle tombe, le délai doit tomber avec.**
  « Retenter dans sept jours » était calibré sur une question dont la réponse ne change pas
  (« OpenStreetMap connaît-il cette entreprise ? »). Le jour où l'on acquiert une adresse
  civique, la question CHANGE — et laisser l'horodatage en place ferait attendre une semaine
  à une information déjà en main. C'est la même erreur que `ville` puis `adresse`, une
  troisième fois sous un autre visage : ce n'est pas une colonne qui manque de rattrapage,
  c'est un délai dont la justification vient de disparaître. Se demander, en acquérant une
  donnée : « quel mécanisme, calibré sans elle, devrait être ré-armé maintenant ? »
- **Un service qui ne trouve pas ne dit pas toujours non — il répond à côté, et à côté peut
  passer les contrôles.** Nominatim, faute de trouver une adresse, remonte la rue ou la
  MUNICIPALITÉ. Or la municipalité est à 0 km du centre-ville : elle franchit la validation
  par la distance sans broncher et s'inscrit « exacte » à vie. Ce n'est pas une donnée
  manquante, c'est une donnée fausse qui a l'air juste. Tout élargissement d'une recherche
  exige donc son propre discriminant, au niveau de la chose cherchée : le nom pour une
  entreprise, le NUMÉRO CIVIQUE **et** la voie pour une adresse — le numéro seul apparie
  toutes les rues, la voie seule tous les numéros.
- **Un garde dont la PORTÉE est « ce que git suit » arrive un commit trop tard.**
  `piiGuard` listait `git ls-files` : un fichier NEUF n'y figure pas, et devient visible du
  garde au moment précis où il entre dans l'historique. Résultat mesuré le 2026-08-05 : le
  gate local sincèrement vert avant le commit, la CI ROUGE juste après, et le fichier fautif
  portait douze adresses sous la forme surveillée — déjà en ligne. Un garde qui ne voit une
  faute qu'une fois commise ne protège pas, il constate. La portée juste est « ce qui est en
  ligne ET ce qui est sur le point d'y aller » (`git ls-files` + `--others
  --exclude-standard`, soit exactement ce qu'un `git add -A` emporterait). Question à poser
  à tout test-garde : **existe-t-il un état du dépôt où la faute existe et où le garde ne la
  voit pas ?** Ici c'était l'état le plus courant de tous — juste avant le commit.
- **Un OUTIL DE DIAGNOSTIC qui se tait quand il ne trouve rien ne diagnostique rien.**
  J'ai livré une sonde qui journalisait ses trouvailles et rien d'autre. Résultat en
  production : pas de ligne — donc impossible de distinguer « le registre est muet sur ces
  noms » de « le code n'est pas déployé », qui sont les deux hypothèses opposées qu'elle
  devait départager. C'est la règle des passes de fond (« 0/0 » et « 0/6 » disent des choses
  contraires) appliquée à un outil de mesure : il parle DÈS QU'IL Y A QUELQUE CHOSE À
  CHERCHER, et dit « aucune » quand c'est le cas. Sœur : le même jet annonçait en
  commentaire une recherche « dans les deux sens » alors que le code n'en faisait qu'un —
  une affirmation de commentaire se vérifie comme n'importe quel finding, et celle-ci
  cachait que le lien recherché (« Groupe Mundial » ↔ « MUNDIAL ») n'était atteignable par
  aucun préfixe.
- **Un quota de déploiement est une ressource PARTAGÉE, et pousser à chaque correctif la
  brûle.** Douze commits en deux heures ont produit douze déploiements de production et
  épuisé le quota du compte — qui sert aussi aux cinq autres projets de Marc. Plusieurs de
  ces commits ne touchaient QUE des `.md` et des tests : rien de ce que le site sert. Deux
  changements, l'un de comportement et l'autre de mécanique. (a) Un correctif qui n'est pas
  vérifiable tout de suite attend le suivant : on groupe, on ne pousse pas par réflexe.
  (b) `vercel.json` porte un `ignoreCommand` (`scripts/build-necessaire.sh`) qui saute le
  build quand le diff ne contient que documentation et tests. ⚠️ Sa convention est
  contre-intuitive — **exit 0 IGNORE le build, exit 1 le LANCE** — et l'inverser ne
  produirait pas « un déploiement de trop » : elle les supprimerait TOUS, en silence, la CI
  restant verte pendant que la production se fige sur un commit ancien. D'où la règle du
  script : toute incertitude (historique tronqué, diff illisible, extension inconnue) se
  résout en CONSTRUISANT. La liste des exemptions est FERMÉE, celle de ce qui construit est
  ouverte, et les deux sens de la panne sont prouvés par sonde.
- **Un revert de conteneur n'emporte pas que le travail : il emporte la PLOMBERIE GIT, et
  tous les outils qui s'y fient se mettent à mentir.** Vécu deux fois le 2026-08-05. Le
  premier symptôme est le bon : `git status` annonce « 124 commits non poussés, aucune
  branche distante » alors que le serveur porte exactement le HEAD local. La cause n'est pas
  l'état du dépôt mais celui de `.git/config` : le `refspec` de `origin` avait été réduit à
  une vieille branche de travail, sans `main`, et `refs/remotes/origin/main` avait disparu.
  Sans ce mapping, `git fetch` réussit, la ref est écrite, et git refuse quand même de la
  reconnaître comme branche de suivi — donc `@{u}` n'existe pas et tout compte de « non
  poussés » se fait contre le vide.
  Réflexe en trois temps, dans cet ordre : (1) **le serveur d'abord** — `git ls-remote origin
  <branche>` comparé à `git rev-parse HEAD` tranche en une commande, et c'est la seule
  vérité ; (2) si l'écart est réel, `git merge-base --is-ancestor HEAD FETCH_HEAD` AVANT tout
  `checkout -B`, sinon on détruit du travail local unique ; (3) réparer la plomberie
  (`git config --add remote.origin.fetch '+refs/heads/main:refs/remotes/origin/main'` puis
  `--set-upstream-to`), sans quoi le prochain outil racontera la même histoire.
  Corollaire de comportement : sous un conteneur qui reverte, **committer ne protège plus** —
  seul un push protège. Un lot vert se pousse tout de suite ; c'est aussi ce qui rend
  l'`ignoreCommand` de `vercel.json` payant, puisqu'un lot de docs ou de tests ne coûte alors
  aucun déploiement.

- **Une Routine qui allume une session NEUVE n'hérite de rien : ni des dépôts attachés, ni
  des outils MCP de la session qui l'a créée.** Deux exécutions d'affilée ont fini
  identiquement — gate vert, `git push` refusé 403 — parce que `MoKarade/JobAI` n'est pas
  dans les sources d'une session fraîche, et que la liste d'outils autorisés d'une session
  allumée par un déclencheur ne contient aucun `mcp__*` : elle ne peut donc même pas s'ajouter
  le dépôt elle-même. Deux commits valides sont morts avec leur conteneur.
  ⚠️ **Et j'ai relayé DEUX FOIS à Marc le message d'erreur (« ajoutez le dépôt aux sources »)
  comme si c'était un geste à sa portée, sans vérifier que ce chemin existait de son côté.**
  Un message d'erreur décrit l'état du système, pas toujours une action disponible à
  l'utilisateur : avant de le transmettre comme consigne, vérifier que le geste EXISTE là où
  on l'envoie. C'est la même faute que « CI verte ≠ code en production », appliquée à une
  instruction plutôt qu'à un statut.
  Le correctif n'a pas été d'élargir une permission mais de changer de cible : la Routine
  tire désormais dans la session de développement (`persistent_session_id`), qui a déjà le
  dépôt, Indeed et la recherche web. Corollaire de la leçon « deux acteurs, chacun la moitié
  d'un accès » : avant d'élargir, VÉRIFIER OÙ SONT VRAIMENT LES MOITIÉS — ici la session
  neuve avait le réseau vers l'app (qu'elle a mesuré) et la session de développement ne
  l'a pas (re-mesuré 403 au CONNECT le 11/08), l'inverse de ce que j'avais supposé.
  ⚠️ **MISE À JOUR 2026-08-13 — cette asymétrie n'est plus structurelle, elle était un effet
  de la politique réseau par défaut.** Marc a élargi la politique de l'environnement
  (`Trusted` → `Custom` + `*.hubperso.com`) : une session FRAÎCHEMENT provisionnée joint
  `emploi.hubperso.com` sans problème (mesuré : `curl` direct, 401 propre de
  `/api/hub/summary`, pas une redirection HTML). Mais le réglage vit au niveau de
  l'ENVIRONNEMENT, pas de la session, et ne se relit qu'au (re)provisioning : LA SESSION DE
  DÉVELOPPEMENT ELLE-MÊME (celle liée à la Routine, déjà active au moment du changement) est
  restée bloquée après coup — re-testé le jour même. Donc `curl` direct est de nouveau une
  vérification valide, mais seulement depuis une session ouverte APRÈS le changement de
  politique ; une session ancienne reste un faux négatif jusqu'à son prochain provisioning.
  ⚠️ **Re-mesuré le 2026-08-14 : la session de développement joint désormais la production**
  (`curl https://emploi.hubperso.com/api/hub/summary` ⇒ 401 propre). Les reverts de conteneur
  la re-provisionnent, donc elle a fini par relire la politique élargie. Ce qu'il faut retenir
  n'est pas « c'est débloqué » — ça peut rebasculer — mais que **l'accès réseau d'une session
  se MESURE au moment où l'on en a besoin**, jamais depuis une note écrite la veille : la §7
  affirmait « bloquée » et c'était faux au moment de s'en servir.
- **Un quota d'API partagé ne se mesure qu'en le heurtant, et il se referme en s'aggravant.**
  Indeed a rendu « Rate limit exceeded, try again in 26 s », puis 29, puis 51 après deux
  tentatives — le délai CROÎT à chaque appel refusé. Une boucle de retente serré ne fait donc
  pas qu'échouer : elle repousse le moment où le quota revient. Espacer, attendre le délai
  ANNONCÉ, ne jamais paralléliser. Et un travail de fond qui partage ce quota avec une
  Routine doit supposer qu'il arrive APRÈS elle, pas avant.
  ⚠️ **Le délai annoncé est un PLANCHER, pas une promesse — et « attendre plus » n'est pas
  une stratégie qui converge.** Mesuré le 2026-08-12 sur neuf tentatives espacées, dont une
  après trois minutes de silence TOTAL : 14 s → 42 → 3 → 42 → 23 → 13 → 30 → 12 → 43, et
  **zéro succès**. Le nombre annoncé oscille sans jamais s'éteindre : il dit « pas
  maintenant », il ne dit rien sur « quand ». Respecter chaque délai n'a donc pas suffi, et
  chaque nouvelle tentative ne faisait que confirmer la saturation à un prix. La règle
  opératoire qui manquait : **après trois refus consécutifs malgré l'attente annoncée,
  conclure que la fenêtre est dépensée et ARRÊTER** — le quota est partagé, quelqu'un
  d'autre (Routine, autre session, veille de la veille) l'a consommé, et aucune patience de
  ma part ne le rend. Corollaire pour la veille : ce jour-là il n'y a pas de lot, donc pas
  de fichier — et surtout pas de repli par `WebFetch` sur les pages de liste d'Indeed, qui
  serait du scraping (garde-fou n°4). Un `WebSearch` ne rend que des pages d'agrégat, sans
  employeur ni lien par offre : de quoi fabriquer une structure, pas de quoi la remplir.

- **Lire du texte écrit par un tiers, c'est l'INGÉRER — et un garde de forme ne suffit plus.**
  Tant que la veille ne collectait que des titres, aucune PII ne pouvait entrer. Le jour où
  elle a lu les annonces en entier (2026-08-12, 44 lues), une seule d'entre elles portait le
  nom, le courriel et le LinkedIn PERSONNELS d'un recruteur — et aucun motif existant ne
  l'attrapait : il a fallu que je le voie. Deux règles en découlent. (a) **Élargir ce qu'on
  ingère élargit la surface de PII** : la question à poser en ouvrant un nouveau champ n'est
  pas « ce champ est-il utile ? » mais « qui a écrit ce texte, et qu'y a-t-il mis ? ».
  (b) **Un outil de nettoyage sans garde qui refuse ne protège rien** — une exécution
  automatique oublierait de l'appeler. Le couple est indissociable : `expurgerPII` nettoie,
  `piiGuard` refuse. Corollaire mesuré : un test qui VÉRIFIE des formes de PII en contient
  par nature, et fait donc échouer le garde ; la bonne réponse est le marqueur d'exemple déjà
  conventionné (`estExemple`), **jamais** d'ajouter le fichier aux exclusions — exclure est le
  réflexe facile, et il laisse un angle mort permanent que plus rien ne signale.
- **Un identifiant fourni par une source externe n'est pas forcément un identifiant.**
  Le protocole de la veille disait « dédoublonner par lien ». Mesuré sur 64 offres Indeed :
  le lien capte **zéro** doublon, l'identité (entreprise + titre + ville) en capte **quinze**.
  Indeed forge un jeton de redirection par RÉSULTAT DE RECHERCHE — `get_job_details` rend
  encore un autre lien pour le même `job_id`. Avant de bâtir une déduplication sur un champ,
  vérifier qu'il est STABLE pour la même entité : le demander deux fois et comparer.
  (L'app avait raison depuis le début : `trier()` dédoublonne par `cleDoublon`.)
- **Une liste et son détail se contredisent : c'est le détail qui dit le lieu.** Deux offres
  du 2026-08-12 étaient listées « Quebec City » alors que l'annonce disait « basé à Saguenay »
  pour l'une et « territoire : grande région de Montréal » pour l'autre. Sans lecture, elles
  entraient sur la carte de Québec avec une fausse distance — le critère n°1 de Marc, faux en
  silence. Corriger `ville` d'après l'annonce, jamais d'après l'en-tête de la liste.

- **Un fichier commité n'existe pas en serverless tant que le traceur ne le voit pas — et
  l'absence du chemin doit être une PANNE DITE.** Incident du 2026-08-12, prouvé par les
  traces du build (`route.js.nft.json` : 91 fichiers, zéro dépôt) : le cron lisait
  `data/depot` par `readdir`, invisible au traceur Next, donc ABSENT du bundle de prod.
  Le code rendait ce manque comme « un jour sans dépôt » (`ok:true, offres:[]`) : aucune
  ingestion, et la péremption a mangé 40 offres en 3 jours pendant que tous les voyants
  restaient verts — le « 30 suivies » de Marc. Trois règles : (a) tout accès filesystem à
  l'EXÉCUTION en serverless exige `outputFileTracingIncludes` ; (b) un dossier versionné
  qui manque à l'exécution n'est jamais « l'état normal », c'est un déploiement amputé —
  `ok:false`, nommé ; (c) **un balayage qui n'a rien pu voir ne DÉCIDE rien** : aucune
  source en succès ⇒ compteurs d'absences gelés, suspension dite dans le résumé. La leçon
  « un mécanisme qui ne peut pas atteindre sa source doit le DIRE » ne suffisait pas — il
  faut aussi qu'il s'ABSTIENNE d'agir sur son vide.
- **Un plan écrit d'après un TABLEAU de symptômes se trompe ; il se vérifie contre le CODE
  avant d'être promis.** Le 2026-08-12, l'ADR-0005 a été rédigé à partir d'un tableau de
  notes et d'un compte d'adresses manquantes. Trois de ses conclusions sur quatre n'ont pas
  survécu à la lecture du code — et je les avais annoncées à Marc entre-temps :
  (a) « toutes les offres notent 68 » — vrai sans description, faux dès qu'on lit les
  annonces : treize notes distinctes sur 49 ;
  (b) « le barème récompense l'ignorance » — mesuré, ses défauts sont empiriquement justes ;
  le vrai défaut était un SYNONYME manquant dans une liste de mots (six mots, pas un seuil) ;
  (c) « rien ne mémorise les échecs de recherche d'adresse » — la fiche par employeur, le
  délai de retente, le ré-armement et le signalement des cas non convergents existaient tous.
  Le point commun des trois : j'avais diagnostiqué depuis une SORTIE (une distribution de
  notes, un compte de champs vides) au lieu de la MÉCANIQUE qui la produit. Une sortie dit
  QU'IL Y A un problème, jamais LEQUEL. Avant d'écrire un chantier dans un ADR — et surtout
  avant de l'annoncer — ouvrir le code qui produit le symptôme et nommer la ligne fautive.
  Corollaire vécu : ces réfutations ont fait GAGNER du temps (une table entière non écrite,
  un barème non touché) ; les écrire dans l'ADR vaut mieux que de les taire, sinon la
  prochaine session refera le mauvais chantier avec le même raisonnement.
- **Un plafond « configurable » peut être un LEURRE si un cap interne, plus bas, tronque déjà
  tout ce qui le dépasse.** `[CARTE-03]`, 2026-08-12 : Marc voyait 60 employeurs « sans
  adresse » et je m'apprêtais à monter `MAX_SITUATIONS_CRON` (8→20) pour accélérer le
  raffinage Nominatim. Lire `geocoderSerie` (lib/geocodage.ts) avant de toucher au nombre a
  montré que `MAX_VILLES_PAR_PASSE = 8` tronque DÉJÀ chaque série en interne, quel que soit
  le paramètre reçu — et l'historique (ADR-01, 2026-07-31) confirmait que ce plafond app-level
  avait DÉJÀ été ramené de 12 à 8 pour cette exacte raison (« mon "12" était un leurre »). Le
  commentaire du cron disait pourtant encore « Douze » onze jours plus tard : **un
  commentaire qui reste faux après que la valeur a changé est indiscernable d'un commentaire
  vrai** tant que personne ne recroise le texte et le nombre. Deux règles : (a) avant
  d'agrandir un plafond, chercher s'il existe un cap PLUS BAS, plus profond dans la pile, qui
  le rendrait sans effet — grep le nom de la constante voisine (`MAX_*`, `LIMITE_*`) dans le
  fichier qu'elle appelle ; (b) quand un plafond par-passe est un vrai calcul de sécurité
  (pire cas × nombre de requêtes sous un mur de temps de fonction), le lever exige de
  re-dériver ce calcul pour TOUTES les étapes qui partagent le budget — le levier sûr, qui
  n'y touche pas, est d'ajouter une PASSE (un second cron, à une autre heure) plutôt que
  d'agrandir la passe existante.
- **Un garde « déjà connu, ne pas retoucher » doit distinguer « à jour » de « obsolète depuis
  un événement précis » — sinon il fige une valeur périmée pour toujours.** `[CARTE-03]`,
  2026-08-12, trouvé en vérifiant le tout premier passage réel du 2ᵉ cron (demande de Marc :
  « check maintenant », pas dans 9 h) : les logs serveur disaient `precisees=2/8` (deux
  entreprises venaient d'obtenir leur vraie adresse) mais le JSON rendu disait `mesurees=0` —
  un chiffre qui semblait dire « rien ne s'est passé ». Cause : `planifierDistances` ne
  retouche jamais une offre dont `km` est déjà connu (bon réflexe en général — sinon
  l'affichage bougerait sans raison à chaque passe), mais ce garde ne savait pas distinguer
  « mesurée à la bonne précision » de « mesurée depuis un repli centre-ville que le raffinage
  vient de corriger » : la distance restait celle de la mairie, silencieusement, alors que la
  vraie adresse était en base. Fix : une fonction dédiée (`invaliderDistancesPrecisees`,
  lib/distances.ts) efface la distance des offres dont l'employeur vient d'être précisé
  CETTE passe, avant que le garde ne s'applique — reconnu par la MÊME correspondance que
  partout ailleurs (`memeEmployeur`), jamais une comparaison littérale sur le nom. Règle
  générale : un garde anti-recalcul économise un travail, mais son EXCEPTION doit couvrir
  chaque événement qui rend l'ancien calcul faux — ici, la précision de la position qui
  s'améliore ; l'écrire « ne jamais retoucher » sans lister ces événements, c'est figer un
  bug latent que rien ne signale (le chiffre existe, il n'est juste plus vrai).
  ⚠️ **Corollaire trouvé dans le même incident : un nombre calculé en interne mais jamais
  exposé cache un bug adjacent.** `raffinage.precisees` existait depuis toujours (calculé,
  logué en `console.log`), mais `mesurerDistances` ne le renvoyait pas — le JSON rendu au
  client n'avait donc AUCUN moyen de dire « le raffinage a marché ». Sans les vrais logs
  Vercel (lus à la demande explicite de Marc), j'aurais rapporté « 0 partout » comme un échec
  alors que la mécanique avançait. Un champ calculé qui ne sort pas de la fonction qui le
  produit est une PROMESSE d'observabilité non tenue — l'exposer coûte une ligne, pas exposer
  coûte un diagnostic à l'aveugle la prochaine fois que quelqu'un demande « ça a marché ? ».
- **Un mécanisme demandé peut déjà exister sous un nom qu'on ne cherchait pas.** Marc a
  demandé (2026-08-12) « une recherche web quand Nominatim échoue » — je m'apprêtais à
  construire un appel LLM avant de découvrir que `[LIEU-04]` (2026-08-06) avait DÉJÀ câblé
  une recherche web, côté Routine (elle a l'accès web, l'app n'appelle aucun LLM), avec la
  valeur `adresse_source = "recherche"` déjà dans le schéma et déjà affichée (« trouvée sur
  le web — à confirmer »). Le signal que j'ai failli manquer : un `grep` de la fonctionnalité
  DEMANDÉE (« recherche web ») aurait dû précéder toute conception, pas juste un `grep` du
  fichier que je pensais devoir modifier. Corollaire : **un ADR annulé n'est pas un ADR à
  ignorer.** ADR-0004 (Google Maps complet) a été accepté PUIS annulé le jour même — je l'ai
  lu avant de proposer Google Maps Geocoding (ADR-0007) et j'ai pu montrer en quoi les deux
  ne se contredisent pas (repli étroit et optionnel vs remplacement complet de l'UI). Sans
  cette lecture, j'aurais soit rouvert un débat déjà tranché, soit laissé Marc découvrir la
  contradiction après coup. Réflexe : avant tout nouveau mécanisme, `grep` le CONCEPT (pas
  le nom de fichier supposé) dans le code ET dans `docs/adr/`.
- **`drizzle-kit generate` peut proposer un diff halluciné si l'historique des snapshots a
  un trou.** Les migrations 0012 à 0014 avaient été écrites À LA MAIN (bon réflexe pour des
  changements simples), mais sans jamais lancer `db:generate` — leurs `meta/NNNN_snapshot.json`
  n'existent donc pas. Au premier VRAI `db:generate` depuis (migration 0015), l'outil a
  comparé mon schéma contre son DERNIER snapshot connu (0011) et proposé de RECRÉER deux
  colonnes (`bornes_rapide`/`bornes_tarif`) déjà en production depuis 0012 — un
  `ADD COLUMN` sur une colonne existante aurait fait échouer le déploiement suivant
  (« column already exists »), silencieusement jusqu'au moment où `lib/migrations.ts` le
  tenterait vraiment. Réflexe : **relire CHAQUE ligne d'un SQL généré contre l'historique
  des migrations DÉJÀ APPLIQUÉES**, pas seulement contre le schéma visé — surtout après une
  ou plusieurs migrations écrites à la main sans régénérer les snapshots. Le snapshot le
  plus RÉCENT (celui que `generate` vient de produire) redevient correct pour l'avenir ; ce
  sont les migrations SQL intermédiaires qu'il faut vérifier une à une.

- **`node_modules` PRÉSENT ne veut pas dire PAQUETS présents.** Après un revert, le dossier
  existe et les paquets installés le jour même ont disparu. J'ai vérifié `[ -d node_modules ]`,
  conclu « présent », et lancé le gate : typecheck rouge et quatre tests rouges sur
  `Cannot find module '@anthropic-ai/sdk'` / `unpdf`. Ça RESSEMBLE à un défaut du code qu'on
  vient d'écrire — c'était un `npm install` manquant. La vérification juste porte sur un
  paquet RÉCENT (`node -e "require.resolve('unpdf')"`), jamais sur l'existence du dossier.
- **Une configuration indexée PAR ROUTE ne suit pas un refactor qui PARTAGE du code.**
  `outputFileTracingIncludes` est une table route → fichiers. En sortant la veille dans
  `lib/veilleComplete.ts` pour lui donner un second déclencheur, j'ai créé un SECOND appelant
  (`/api/cron/geocodage`) avec son propre bundle — et sans entrée de traçage. Le chemin de
  reprise aurait donc tourné avec `data/depot` ABSENT : la panne du 2026-08-12 rouverte par la
  porte qu'on venait d'ouvrir, deux jours après l'avoir fermée, et invisible jusqu'au jour où
  la reprise sert vraiment. Tout refactor « je partage ce travail entre deux routes » se
  termine par un balayage des configs indexées par route ; ici la règle est écrite dans le
  fichier, à côté de l'entrée.
- **Un gate ne peut pas être vert dans une session sans egress — et ça se DIT.**
  `next/font/google` télécharge les fontes AU BUILD : `fonts.gstatic.com` hors allowlist ⇒
  build rouge, sans le moindre rapport avec le code. Trois façons de mal réagir : croire à une
  régression, retirer la fonte pour « faire passer », ou annoncer « gate vert » en comptant
  les trois autres. La bonne : annoncer exactement ce qui a tourné (« typecheck, tests et lint
  verts ; build non exécutable ici, hôte bloqué ») et laisser la CI, qui a le réseau, trancher.
- **Les paramètres d'une API se mesurent en les FAISANT VARIER, avant d'écrire un protocole
  autour.** Le protocole de veille prescrivait 24 recherches Indeed (12 termes × 2 villes).
  Mesuré : le paramètre de lieu est INERTE — « Québec » et « Lévis » rendent le même contenu,
  seul le terme discrimine. Douze appels sur vingt-quatre brûlaient un quota partagé pour
  rien. Même méthode, même jour, autre trouvaille : les `job_id` sont des compteurs PAR
  RÉPONSE (`940-942`, puis `943-945` pour la MÊME recherche relancée) — d'où le dédoublonnage
  par identité, jamais par identifiant ni par lien. Relancer avec UN paramètre changé et
  comparer les deux réponses coûte deux appels et corrige un protocole entier.
- **Un connecteur « activé » peut n'exposer AUCUN outil.** `ListConnectors` donnait Indeed
  `enabledInChat: true` — donc actif en apparence — avec `installState: "unknown"` et zéro
  outil chargé. « Activé dans ce chat » décrit une intention de configuration, pas une
  capacité. La capacité se lit dans la liste d'outils réellement disponible ; et la distinction
  compte, parce que l'une se répare en reconnectant (OAuth) et l'autre pas.
- **Une donnée d'entreprise renvoie le SIÈGE SOCIAL, jamais l'établissement local.**
  `get_company_data` (Indeed) rend `addresses: ["Charlotte, NC"]` pour une offre Honeywell à
  Québec, et échoue carrément sur les PME (`Laserax` → « Unknown error »). La brancher sur le
  champ `adresse` automatiserait la faute AMETEK déjà consignée — une donnée fausse qui a
  l'air précise, à 2 500 km, et qui franchirait la validation par la distance. Cet outil sert
  à JUGER un employeur (avis, salaires, taille), jamais à SITUER une offre. Règle générale :
  avant de brancher un champ d'une API sur un champ du modèle, demander « de quelle ENTITÉ
  cette valeur parle-t-elle ? » — l'entreprise et l'établissement ne sont pas la même chose.

- **Un verdict qui recouvre DEUX situations ne peut pas porter UN délai — il porte une
  ÉCHELLE.** `verifierAts` rend `refute` sur une seule constatation (« des offres, aucune
  dans la région »), et cette constatation vaut aussi bien pour un homonyme d'Amsterdam que
  pour le board MONDIAL de la bonne entreprise, un jour sans poste régional. Le délai fixe de
  60 jours était calibré sur la première seule : appliqué à la seconde, il mettait deux mois à
  l'étagère les plus gros employeurs visés. C'est la leçon du « délai qui encode une prémisse »
  d'un cran plus loin : quand la prémisse n'est vraie qu'une fois sur deux, on ne corrige pas
  la valeur, on la fait ESCALADER — court au premier constat, long seulement quand la SÉRIE
  l'a confirmé (et le compteur se remet à zéro dès qu'un autre verdict rompt la série, sinon
  on atteint le palier long par accumulation d'accidents). L'arbitrage se fait sur l'ASYMÉTRIE
  DES COÛTS : une retente inutile coûte une requête, un board mondial oublié coûte deux mois.
- **Un travail trop long pour une fonction serverless se découpe en LOTS que le NAVIGATEUR
  enchaîne, et sa progression se relit de l'état, jamais d'un compteur local.** 180 paires à
  vérifier ne tiennent pas dans 60 s. Un `after()` aurait hérité de la durée de vie de la page
  sans rien afficher ni pouvoir s'arrêter. L'onglet rappelle l'action lot par lot : chaque
  aller-retour reste court, le bouton « Arrêter » agit immédiatement (la boucle est côté
  client), et chaque lot renvoie `faites/total` RELUS de l'état persisté — fermer l'onglet et
  revenir reprend au bon endroit, là où un compteur accumulé afficherait « 0 % » sur un
  balayage à moitié fait. Deux corollaires : la boucle garde sa CONTRE-PRESSION en base (un
  clic répété ou deux onglets martèleraient les services tiers — une variable de module ne
  borne rien en serverless), et le calcul de progression s'extrait en fonction PURE, parce
  qu'une barre fausse ne lève aucune erreur : elle raconte juste une histoire fausse.
- **Une mesure faite depuis une session bloquée par le proxy ne mesure que le proxy.** 180
  essais ATS ont rendu « 180 absent » : `verifierAts` traduit un `fetch` qui lève en `absent`,
  et les cinq hôtes répondaient 403 par la politique réseau de l'environnement. Le chiffre
  avait l'air d'un résultat accablant ; il ne disait rien du monde. Avant de conclure d'une
  série d'échecs identiques, DISCRIMINER l'échec distant de l'empêchement local (ici : un
  `fetch` nu qui montre le code HTTP) — et le dire, plutôt que de laisser un 0/180 s'installer.
- **Dans un fichier `"use server"`, TOUTE fonction async exportée est un point d'entrée HTTP
  anonyme — un `export` n'y est pas un choix de portée, c'est une PUBLICATION.**
  `domicile()` (garde-fou n°1 : les coordonnées du domicile de Marc) vivait dans
  `lib/actions.ts`, privée. En voulant la réutiliser depuis la veille, j'allais lui ajouter
  `export` : un POST anonyme aurait alors rendu ces coordonnées. Aucun test n'aurait bronché —
  la fonction est correcte, c'est le FICHIER qui la publie, et rien dans la ligne qu'on écrit
  ne le rappelle. Ce qui l'a attrapé n'est ni la revue ni un garde, mais le build refusant une
  CONSTANTE exportée du même fichier (« Only async functions are allowed to be exported ») —
  un signal sans rapport avec le vrai danger, arrivé par chance. Règle : tout helper qui touche
  un secret, une coordonnée, une clé ou un service tiers à ménager vit dans un module ORDINAIRE,
  jamais dans un fichier `"use server"` ; la frontière est alors portée par la nature du module
  et non par la vigilance de celui qui l'édite. Et avant d'ajouter un `export` dans un tel
  fichier : se demander « suis-je en train d'ouvrir une route ? ».
- **Une liste blanche est un pari ; quand la question a une réponse MESURABLE, la mesurer.**
  `situer()` acceptait une offre si sa ville figurait dans une liste de ~130 municipalités,
  écrite pour un rayon de 50 km puis rallongée à la main quand il est passé à 75. Elle n'a
  jamais connu que les noms qu'on avait pensé à y mettre : le 2026-08-17, quarante-sept offres
  ont été refusées d'un coup, sans qu'on sache si elles étaient à vingt kilomètres ou à trois
  mille. L'élargir une fois de plus aurait été le même pari, en plus gros — et il aurait fallu
  le refaire au rayon suivant. Or « cette ville est-elle à moins de 75 km ? » se MESURE, et le
  géocodeur qui répond était déjà là, déjà borné. Trois conditions pour que la mesure remplace
  le pari sans coûter l'intake : elle est **bornée** (n noms par passe, budget en ms, sous le
  cap le plus profond de la pile), elle **s'éteint** (un verdict est conservé, une même chaîne
  n'est jamais redemandée — sinon le coût grandit avec le volume et l'étape doit passer en
  aval), et son échec est **un aveu, pas un verdict** (« introuvable » ≠ « hors région », sans
  quoi une panne d'une matinée condamne une ville à vie). Corollaire de dépendance : le seuil
  se DÉRIVE de la constante qui décide déjà (`rayonMaxKm`), sinon on recrée le décalage
  liste/rayon qu'on vient de supprimer.
- **Nommer le refus AVANT de le corriger — et le NOMMER, c'est nommer son OBJET.** La règle
  « compter un refus ne suffit pas » était tenue à moitié : `refusees` portait le motif,
  l'entreprise et le titre, mais pas la VILLE — le seul champ sur lequel les motifs
  géographiques se décident. « 47 lieu inconnu » ne permettait donc de choisir aucun remède :
  quarante-sept « Remote » et quarante-sept municipalités québécoises appellent des corrections
  opposées. Quand un rejet se décide sur un champ, ce champ fait partie du refus. Et un lot de
  refus se rend GROUPÉ et trié par fréquence : une liste de quarante-sept lignes ne se lit pas,
  trois lignes comptées désignent le correctif.

- **Rendre un paramètre RÉGLABLE périme tout ce qui a été décidé sous son ancienne valeur —
  et ce qui sauve la mise, c'est d'avoir stocké la MESURE, pas la conclusion.** En exposant
  le rayon de recherche (`[VEILLE-37]`), le travail visible était un champ et une action ; le
  vrai travail était ailleurs. Chaque verdict du registre des lieux avait été rendu SOUS un
  rayon donné, et ce registre est consulté AVANT toute nouvelle mesure : écrire le nouveau
  nombre sans y toucher aurait laissé « Baie-Comeau, hors région » en place alors qu'elle
  venait d'entrer dans le rayon — jamais revu, aucune erreur, Marc règle son rayon et rien ne
  change. C'est la leçon du « délai qui encode une prémisse » remontée d'un cran : ce n'est
  plus un délai mais un VERDICT qui encode le seuil sous lequel il a été rendu. La question à
  poser en rendant une constante réglable : **qu'est-ce qui, en base, a été décidé avec
  l'ancienne valeur ?** Ici le re-jugement n'a coûté aucune requête, uniquement parce que
  `appliquerJugements` stockait `km` à côté du verdict — un registre qui n'aurait gardé que la
  conclusion aurait exigé de re-géocoder des dizaines de villes à chaque réglage, et le
  réglage n'aurait probablement jamais été livré. Corollaire de conception : quand on met une
  décision en cache, garder la GRANDEUR qui l'a produite, pas seulement son résultat.
  Trois précisions qui se généralisent : re-juger n'est pas re-mesurer (garder l'horodatage
  et le compte d'essais, sinon on rend son palier de retente à un nom qui ne l'a pas gagné) ;
  ce qu'on n'a pas pu mesurer ne se re-juge pas (re-dériver depuis un `km` nul inventerait un
  verdict) ; et un compte de bascules ne se rend jamais seul — « 0 sur 0 » dit qu'il n'y avait
  rien à re-juger, « 0 sur 40 » que le réglage n'a rien libéré, et ce sont deux situations
  opposées que le même « 0 » masquerait.

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
