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
