# BACKLOG — JobAI

> Les phases V1→V4 sont définies dans [ADR-0001](./docs/adr/0001-fondations-jobai.md).
> Chaque tâche a un ID utilisé en préfixe de commit (ex. `[V1-03] endpoint hub summary`).
>
> Statuts : ⬜ à faire · 🟦 en cours · ✅ fait · ⏸️ en pause · ❌ abandonné
> Légende : 🔧 Claude · 👤 action humaine requise · 🧭 décision de Marc requise

---

## Trouvé en passant (non demandé — feu vert requis)

- [ ] 🔧 **`[DOC-ADR-INDEX]` ADR-0019 n'a pas de ligne dans l'index de `docs/adr/README.md`.**
  Le fichier existe (`0019-toutes-les-quebecoises-entrent.md`, Accepté le 2026-09-18), la table
  s'arrête à 0018 puis saute à 0020. Exactement l'oubli déjà réparé pour ADR-0017 le 2026-09-17
  — donc la deuxième fois, ce qui dit que l'index se tient à la main et se reperd. Une table qui
  omet une décision acceptée est pire qu'absente : elle se lit comme la liste complète.
  Repéré en ajoutant ADR-0020 ; **pas corrigé, scope non demandé**.

---

## Installable sur le téléphone (Marc, 18/09/2026 — Android) ✅

- [x] **`id` et `launch_handler: navigate-existing` au manifeste.** Sans `id`, l'identité de
  l'installation EST le `start_url` : le jour où il change, Android installe une SECONDE app au
  lieu de mettre à jour la première. `navigate-existing` fait qu'un lien venu du hub réutilise la
  fenêtre ouverte plutôt que d'en empiler une. Garde : `tests/pwaManifeste.test.ts`, 3
  perturbations prouvées.
- [x] **Rien d'autre à faire ici, et c'est une mesure** : le manifeste avait déjà ses icônes 192,
  512 et maskable-512 DISTINCTES, et son service worker était bien enregistré. Sur les sept dépôts
  du parc, seul FinanceAI n'était pas installable (une unique icône SVG, que Chrome refuse pour
  fabriquer le WebAPK).
- [ ] **⏸️ La bascule « le lien du hub ouvre l'app installée » n'est pas vérifiable d'ici** : elle
  dépend de la version de Chrome, de l'installation réelle et d'un réglage système. C'est le
  téléphone de Marc qui tranche. Côté hub, le verrou était un `target="_blank"` retiré là-bas.

---

## Chantier #49 — la chaîne de build : le GITHUB_TOKEN restait lisible tout le run  ✅

Lot L2 de l'audit multi-outils du 2026-09-18, livré le même jour.

- Les **3** étapes `actions/checkout` portent `persist-credentials: false`. La v2+ écrit le
  `GITHUB_TOKEN` dans la config git du runner POUR TOUT LE RESTE DU RUN : n'importe quelle
  étape suivante, y compris une action tierce, peut le lire. Vérifié un par un qu'**aucun**
  workflow de ce dépôt ne fait de `git push` ni d'appel `gh`.
- Les **3** `npm ci` portent `--ignore-scripts`. ⚠️ **MESURÉ avant d'être posé** : `npm ci
  --ignore-scripts` puis typecheck, build et **1 742 tests** — tous verts.
- `S8543` (version d'un `npm install -g` non figée) et `S7637` (action tierce non épinglée au
  SHA) sont **sans objet ici** : ce dépôt n'a aucun `npm install -g` et n'utilise que des
  actions `actions/*`. ⚠️ Le document d'audit annonçait `S8543 × 5` — re-mesuré à **zéro**.
  Deux des trois comptes équivalents de FinanceAI valaient zéro aussi : les commandes de
  re-mesure valent mieux que les chiffres, comme le dit le §7 du document.

- [ ] 🔧 **`[CI-CURL-PROTO]` `githubactions:S6506` sur `sonde-registre.yml`** (S) — HORS
  PÉRIMÈTRE du lot L2, signalé et non corrigé. L'`URL` est bien en `https://` (l. 74) : le
  risque n'est pas le protocole de départ mais le `-L` de `curl`, qui suit une redirection
  **pouvant rétrograder en HTTP**. Le correctif tient en un drapeau —
  `--proto '=https' --proto-redir '=https'` — et vaut aussi pour les autres `curl` de ce
  dépôt (Nominatim, Overpass) : à faire en un seul passage plutôt qu'un site à la fois.

---

## Chantier #00 — Bootstrap 🟦

- [x] 👤 **`[B-01]`** Créer le dépôt **`MoKarade/JobAI` en PRIVÉ**. ✅ 2026-07-28 : fait par
      Marc, déjà forké depuis `app-template` (contenu identique, un commit initial).
      Découverte : l'intégration GitHub de la session Claude **ne peut pas créer de dépôt**
      (`403 Resource not accessible by integration`) — c'est une action humaine, toujours.
- [x] 🔧 **`[B-02a]`** Personnaliser le fork : identité JobAI publiée au hub
      (`id: jobai`, `#f2a31b`), route déplacée sous `/api/hub/summary`, contrat d'échec 503,
      `.env.example`, `package.json`, `layout`/`page`. ✅ 2026-07-28 — gate vert, 5 tests.
- [x] 🔧 **`[B-02b]`** Porter la logique du squelette `jobtracker` : `lib/types.ts`,
      `lib/scoring.ts`, `lib/seed.ts`. ✅ 2026-07-28 — **pas** son stockage Redis ni ses
      routes API. Le bug `SEED` (`source` requis en sortie de `z.infer` et absent des 38
      entrées) est corrigé par construction. La fusion du suivi reste à écrire `[V1-02]`.
- [x] 🔧 **`[B-03]`** Documents vivants et constitution : `CLAUDE.md` (6 garde-fous),
      `HANDOVER.md`, `BACKLOG.md`, `docs/adr/` (ADR-0001), `docs/LESSONS.md`. ✅ 2026-07-28.
- [x] 🔧 **`[B-04]`** Flotte d'agents + commande `/review`. ✅ 2026-07-28 — **5 agents**
      (`.claude/agents/`), avec des périmètres qui NE SE RECOUVRENT PAS : chacun dit
      explicitement ce qu'il ne traite pas, sinon trois agents remontent le même point et
      la synthèse devient du bruit.
      · `gardien-des-garde-fous` — les six règles de `CLAUDE.md` §2, rien d'autre. Une
        violation est bloquante et ne se nuance pas.
      · `code-reviewer` — correction, cas limites, **discrimination des tests**, duplication
        d'une règle. Ne traite ni garde-fous, ni pannes muettes, ni accessibilité.
      · `chasseur-de-pannes-muettes` — ce qui échoue sans le dire : `catch` qui avale,
        `catch` trop large, panne de plateforme confondue avec un fait métier, repli qui
        fabrique une donnée.
      · `auditeur-accessibilite` — WCAG AA, dans les DEUX thèmes.
      · `gardien-des-documents` — seul autorisé à éditer la doc, jamais le code. Sur ce dépôt
        sans PR ni revue humaine, un handover qui ment fait refaire du travail déjà fait.
      La commande `/review` route selon les fichiers touchés et rappelle les trois règles de
      lecture : un garde-fou ne se nuance pas · un finding est une hypothèse · entre deux
      agents qui se contredisent, **celui qui a mesuré l'emporte**.
      ⚠️ Écart assumé avec le libellé d'origine : **pas de hooks de gate**. Le gate est déjà
      obligatoire et documenté ; un hook qui le rejoue ajouterait un point de panne (et un
      hook `Stop` auto-relanceur est explicitement déconseillé dans l'écosystème).
- [x] 🔧 **`[B-05]`** CI GitHub : un job `gate` qui rejoue le gate local (typecheck, tests,
      lint, build). ✅ 2026-07-28. L'auto-merge est sans objet — voir ADR-0002
      (développement direct sur `main`).
      ⚠️ **Le job `garde-fous` a été RETIRÉ le 2026-07-28**, après avoir mis la CI au rouge
      sur **quatre commits d'affilée** sans que personne le voie (sans PR, rien n'affiche
      un ✗). Cause : son `git grep` d'adresse attrapait la chaîne fabriquée qui PROUVE que
      `tests/piiGuard.test.ts` détecte quelque chose — il détectait le détecteur. Et il
      masquait un second échec latent, son grep de secrets n'ayant aucune notion d'exemple
      documenté (il aurait bloqué sur `DATABASE_URL='postgres://…'` de `charger-seed.ts`).
      La même règle tenue en bash ET en TypeScript avait divergé. Une seule survit : le
      test, plus précis et prouvé. En échange, sa couverture a été **étendue aux fixtures
      de test** (il ne s'exclut plus que lui-même), preuve faite par sonde.
- [x] 👤 **`[B-06]`** Réglages du dépôt : **branche par défaut → `main`** ✅ 2026-07-28
      (fait par Marc). L'auto-merge et la protection de branche sont sans objet depuis
      l'ADR-0002. ⚠️ Reste optionnel : ne laisser que « Allow squash merging » si des PR
      réapparaissent un jour (le merge de la PR #1 s'est fait en merge commit).
- [ ] 👤 **`[B-07]`** Supprimer la branche distante `claude/hopeful-lovelace-4d09zx`
      (ancienne branche par défaut, sans usage) — 👤 accord de Marc requis avant suppression.
      ✔ **ACCORD DONNÉ le 2026-09-17 (« supprimer la branche »), VÉRIFICATION FAITE, et la
      suppression REFUSÉE PAR L'ENVIRONNEMENT.**
      Ce qui a été vérifié avant d'essayer, parce qu'une suppression ne se rejoue pas :
      · un seul commit, `a2b1025 « Initial commit »` du 2026-07-28, absent de `main` ;
      · deux fichiers seulement qu'elle a et que `main` n'a pas — `app/hub/summary/route.ts`
        et `lib/hubToken.ts`, tous deux le SQUELETTE `app-template` (`id: "app-template"`,
        « À PERSONNALISER AU FORK »). `main` porte ses vraies versions
        (`app/api/hub/summary/route.ts`, `lib/hubSummary.ts`) ;
      · aucune PR, ouverte ou fermée, ne la référence ;
      · le diff `main` → branche est −93 519 / +1 604 : c'est l'état d'AVANT le projet.
      **Rien d'unique à perdre. La suppression est sûre.**
      ⚠️ **`git push origin --delete` rend HTTP 403**, quatre tentatives avec temporisation.
      Ce n'est pas un incident réseau : le proxy git de la session pousse des branches mais
      refuse d'en SUPPRIMER une, et le connecteur GitHub n'expose aucun outil de suppression
      de branche. **Le geste revient donc à Marc** — un clic sur
      `https://github.com/MoKarade/JobAI/branches`, avec la vérification ci-dessus en main.
      ⚠️ Et j'ai failli l'annoncer faite : le premier essai passait par `| tail`, qui MASQUE
      le code de sortie — `exit=0` sur un push en échec. La règle du dépôt existe déjà
      (« ne jamais juger un `git push` via `| tail` ») ; c'est `git ls-remote` qui a tranché.
      ⚠️ Constaté au passage, **non traité** (hors périmètre de cet item) : seize autres
      branches `claude/**` traînent sur le distant.

## Chantier #01 — V1 : port fidèle + hub ✅

**Critère de fin** : Marc utilise JobAI depuis son téléphone, et le widget s'affiche sur
`hubperso.com` avec des données réelles.

- [x] 🔧 **`[V1-01]`** Schéma Drizzle + migration initiale + connexion paresseuse.
      ✅ 2026-07-28 : tables `offers` et `offer_reasons`, **7 contraintes CHECK réelles**
      (les `enum` de Drizzle ne sont que du typage TypeScript — sans CHECK, la base
      accepterait n'importe quelle chaîne), 13 tests d'intégration sur PGlite, **prouvés
      discriminants** (contrainte neutralisée → exactement le bon test échoue).
      Choix assumé : on anticipe la **forme** (`scoreSource`, `perimeeLe`, justification
      structurée) mais on ne crée **pas** les tables de la V3 — un `CREATE TABLE` est
      additif et indolore, une table vide « au cas où » est de la spéculation.
- [x] 🔧 **`[V1-02]`** Fusion du suivi + modification + résumé (`lib/suivi.ts`).
      ✅ 2026-07-28 : **le verrou du garde-fou n°2 existe enfin** (`tests/suivi.test.ts`,
      19 tests, discrimination prouvée en inversant le sens de fusion). Vérifie chaque
      champ de `CHAMPS_UTILISATEUR` un par un — ajouter un champ sans le préserver casse
      le test. Fusion idempotente et sans mutation des entrées.
- [x] 🔧 **`[V1-03]`** Endpoint `GET /api/hub/summary` branché sur les vraies données.
      ✅ 2026-07-28 : `construireSummary` (pure, la date est un paramètre) + point de
      bascule unique `getTrackerState()` — `null` = pas branché, objet = données réelles,
      `throw` = panne. Chemin de panne testé et **prouvé discriminant** (masquer la panne
      en `building` fait tomber le test). ⚠️ L'exclusion du middleware reste à verrouiller
      quand le middleware existera `[V1-04]`.
- [x] 🔧 **`[V1-04]`** Auth.js v5 Google mono-adresse + middleware fail-closed + `/connexion`.
      ✅ 2026-07-28 : décision de garde en **fonctions pures testées** (`lib/garde.ts`,
      `lib/autorisation.ts`) — le middleware ne fait que l'appliquer. **L'exclusion de
      `/api/hub/summary` est enfin verrouillée par un test**, y compris contre les variantes
      de contournement (`/api/hub/summaryX`, `/api/hub/summary/secret`). Une route `/api/*`
      non authentifiée reçoit **401**, jamais une redirection HTML.
      ⚠️ Aucun scope Gmail ni Drive : ce sont des scopes restreints, ils feront l'objet
      d'un ADR au chantier V2.
- [x] 🔧 **`[V1-05]`** Seed des 38 offres. ✅ 2026-07-28 : adresse du domicile hors du code
      (seules les distances subsistent), nom de la personne des RH retiré, adresses
      municipales des entreprises réduites à la ville (elles auraient fait échouer le
      garde-fou de la CI pour rien). 18 tests d'intégrité, garde PII prouvé discriminant.
- [x] 🔧 **`[V1-06a]`** Cœur de l'interface : `TableauBord`, `CarteOffre`, `ListeOffres`
      (recherche + 4 filtres), page d'accueil, styles bi-thème. ✅ 2026-07-28.
      Logique de filtrage en fonction pure testée (`lib/filtres.ts`, 11 tests).
      États honnêtes distincts : « base non configurée » ≠ « aucune offre ».
- [x] 🔧 **`[V1-06b]`** Écriture : statut, priorité et note personnelle modifiables
      (Server Action + revalidation, affichage optimiste avec retour arrière signalé).
      ✅ 2026-07-28. Le verrou du garde-fou n°2 est testé : un patch contenant `score`,
      `raisons` ou `entreprise` ne survit pas au parse Zod. Écart assumé avec l'artifact :
      liste déroulante au lieu du cycle au clic (le cycle est inutilisable au clavier et
      n'annonce pas ses valeurs).
- [x] 🔧 **`[V1-06c]`** Panneaux de contenu : barème, entreprises cibles, salaires du
      marché, position/SWOT. ✅ 2026-07-28 — sections `<details>` natives (repliables sans
      JavaScript, accessibles au clavier par construction). Les POINTS du barème sont LUS
      depuis `PONDERATION`, jamais re-écrits : une valeur recopiée dans un texte explicatif
      dérive dès qu'on ajuste le barème, et l'explication se met à mentir en silence.
      Le test de cohérence a trouvé une incohérence RÉELLE dès sa première exécution
      (« Groupe ACE » avait une offre active mais aucune fiche — écart déjà présent dans
      l'artifact d'origine).
- [x] 🔧 **`[V1-06d]`** Ajout manuel d'une offre. ✅ 2026-07-28 : formulaire replié
      (`<details>` natif), Server Action `ajouterOffre`, toute la décision en fonctions
      pures testées (`lib/ajout.ts`, 29 tests). Trois points qui valaient d'être verrouillés :
      · **l'identifiant** — dérivé de l'entreprise et du poste (lisible, diffable, comme le
        jeu de départ), suffixé en cas de collision, tronqué sans tiret orphelin, avec repli
        quand le slug est vide (titre non latin). Une collision non gérée écraserait une
        offre existante.
      · **la provenance de la note** — premier consommateur réel de `scoreSource` : note
        saisie ⇒ `manuel` (peut valoir 100) ; champ laissé vide ⇒ `calcule` via `computeScore`,
        plafonné à 85. Aucune justification n'est fabriquée : elle décrirait une lecture de
        l'annonce que personne n'a faite.
      · **la date de repérage** — ⚠️ vrai bug évité : `toISOString().slice(0,10)` est de
        l'UTC. Vercel tourne en UTC, Marc est à UTC−4 ⇒ toute offre ajoutée après 20 h
        locale aurait porté la date du LENDEMAIN. **Discrimination prouvée** (retour à
        l'UTC ⇒ exactement les 2 tests de fuseau tombent, aucun autre).
- [x] 🔧 **`[V1-07]`** `why` converti en **format structuré** (`raisons` : un ton, un texte).
      ✅ 2026-07-28 — plus aucun HTML brut, verrouillé par un test qui refuse toute balise
      résiduelle dans le seed.
- [x] 🔧 **`[V1-08]`** Marquage **« offre périmée »**. ✅ 2026-07-28 : colonne `perimeeLe`
      branchée (elle existait, anticipée par l'ADR-0001 — aucune migration nécessaire),
      action réversible, badge visible, filtre « Voir les périmées » (masquées par défaut).
      **Changement de sémantique du résumé** : une offre périmée ne compte plus parmi les
      actives et ne peut plus être « la meilleure » du widget — le hub afficherait sinon un
      poste pourvu comme la meilleure opportunité. Elle reste dans le total : le suivi
      n'efface rien. 8 tests, **prouvés discriminants** (retirer le filtre fait échouer
      exactement les 4 tests du résumé, et aucun autre).
- [x] 🔧 **`[V1-09]`** Export CSV. ✅ 2026-07-28 : mise en forme **pure et testée**
      (`lib/export.ts`, 17 tests), téléchargement côté navigateur sans route à protéger.
      L'export suit les **filtres affichés** — un fichier qui ne correspond pas à l'écran est
      une source de confusion garantie. Deux pièges traités : BOM UTF-8 (sans lui Excel rend
      « Chargé » en « ChargÃ© ») et surtout l'**injection de formule** — une cellule
      commençant par `=`, `+`, `-` ou `@` est ÉVALUÉE par Excel, LibreOffice et Sheets ;
      elle est neutralisée par apostrophe. Le contenu vient de Marc aujourd'hui, il viendra
      d'un LLM en V3 : on ferme avant que ce soit un problème. **Discrimination prouvée**
      (neutralisation retirée ⇒ exactement les 2 tests d'injection tombent).
- [x] 🔧 **`[V1-10]`** Test-garde PII. ✅ 2026-07-28 — `tests/piiGuard.test.ts` : scan des
      fichiers **réellement versionnés** (`git ls-files`, la seule définition qui compte :
      ce qui part en ligne), **volume prouvé** (un scan qui ne lit rien passerait tous les
      tests en silence — premier piège d'un test-garde), et discrimination prouvée motif par
      motif (contenu fabriqué détecté / formulation légitime ignorée). Sa **portée est écrite
      dans le test** : il détecte des FORMES, pas des noms isolés. Un garde qui promet plus
      qu'il ne fait est pire qu'un garde absent : on cesse de relire.
- [x] 👤 **`[V1-11]`** Provisionner Neon + lier au projet Vercel. ✅ 2026-07-28 (Marc) —
      base `us-east-2`, migration appliquée, jeu de départ chargé.
- [x] 👤 **`[V1-12]`** Projet Vercel + DNS Cloudflare `emploi.hubperso.com`. ✅ 2026-07-28
      (Marc) — projet `job-ai`, DNS en « DNS only ». Vérifié : déploiement production
      `READY` sur le SHA de `main`, zéro erreur runtime.
- [x] 👤 **`[V1-13]`** Client OAuth Google. ✅ 2026-07-28 (Marc) — auth fonctionnelle en
      production, une seule adresse admise.
- [x] 🔧 **`[V1-14]`** Déclarer JobAI dans le hub. ✅ 2026-07-28 — **PR #12 du dépôt
      Hubperso** : entrée `jobai` dans `lib/sources.ts`, les 3 assertions de
      `tests/sources.test.ts` (exhaustif) et `.env.example`. Gate vert côté hub (63 tests),
      déploiement de prévisualisation Vercel *Ready*. 👤 Reste à Marc : merger la PR, poser
      `HUB_TOKEN_JOBAI` dans les variables Vercel du hub, redéployer.
- [x] 👤 **`[V1-15]`** `HUB_TOKEN` (JobAI) et `HUB_TOKEN_JOBAI` (hub). ✅ 2026-07-28
      (Marc) — widget actif sur `hubperso.com`. Un `.trim()` asymétrique entre les deux
      côtés avait donné un 401 permanent : corrigé et verrouillé par tests des deux côtés.

## Chantier #02 — V2 : scan Gmail ⬜

- [ ] 🧭 **`[V2-00]`** Trancher le mode de publication OAuth (voir `HANDOVER.md`, risque
      ouvert n°1) : `gmail.readonly` est un scope restreint chez Google.
- [ ] 🔧 **`[V2-01]`** Renouvellement du jeton Google — **livré avec la feature**, jamais
      après (leçon `AUTH-DRIVE-PERSIST` de FinanceAI : sans lui, le scan meurt en 1 h).
- [ ] 🔧 **`[V2-02]`** Scan des réponses : listes de mots-clés du script `surveillance-emploi.gs`.
      ⚠️ Ne PAS restreindre la requête à `in:inbox` — DriveAI archive les courriels.
- [ ] 🔧 **`[V2-03]`** Le scan **propose**, Marc valide : aucune écriture automatique de statut.
- [ ] 🔧 **`[V2-04]`** Suspension sur quota Gmail épuisé (patron DriveAI : détecter, persister,
      re-sonder), jamais de re-tentatives en boucle.

## Chantier #03 — V3 : IA ⬜

- [x] ~~🧭 **`[V3-00]`** ADR-0002 : accès au CV dans Google Drive~~ — **RETIRÉ** par
      ADR-0009 (2026-08-13). Marc a choisi le téléversement direct + stockage en base : les
      deux scopes Google restreints deviennent inutiles. C'était le blocage le plus coûteux
      du chantier IA, et il disparaît sans être résolu — la meilleure façon de fermer un
      ticket.
- [x] 🔧 **`[V3-01]`** `promptSafety` (assainissement + balisage des données non maîtrisées).
      Livré 2026-08-13 (`lib/promptSafety.ts`). Neutralise les marqueurs de STRUCTURE, pas
      la sémantique — et le dit : « oublie ce qu'on t'a dit » en français courant passe, et
      passera toujours. La vraie défense est que le modèle ne fait que PROPOSER.
- [ ] 🔧 **`[V3-02]`** Notation par lecture de la description (remplace le plafond à 85).
      Passe par le protocole de précision du `CLAUDE.md` §8 : tableau avant/après sur les 38 offres.
- [ ] 🔧 **`[V3-03]`** Tri intelligent des réponses de recruteurs.
- [ ] 🔧 **`[V3-04]`** Génération de CV et lettres ciblés par offre.
- [ ] 🔧 **`[V3-05]`** Mesure du coût réel + publication dans le bloc `usage` du summary.
      Jamais estimé, uniquement mesuré.
- [ ] 🔧 **`[V3-06]`** Plafond budgétaire chiffré, non désactivable, qui suspend les
      traitements de fond mais jamais une action déclenchée par Marc.

## Chantier #09 — la veille muette (2026-08-14) 🟨

> Constaté pendant la Routine du jour : `/api/cron/veille` (15:00 UTC) n'apparaît dans AUCUN
> journal Vercel les 12, 13 et 14 août, pendant que `/api/cron/geocodage` (03:00) y figure
> chaque nuit avec son compte rendu complet. Trois jours sans veille, sans que rien ne le dise.

- [x] 🔧 **`[VEILLE-10]`** La passe devient reprenable : `lib/veilleComplete.ts` (déplacement
      VERBATIM, prouvé écriture par écriture et sur leur ORDRE), réservation `CLE_VEILLE`
      (20 h, bornes dérivées de l'écart de 12 h entre les deux crons), reprise depuis le cron
      de géocodage. Discrimination prouvée dans les deux sens (25 h → jour sauté ; 10 h →
      double passe).
- [x] 👤 **`[VEILLE-11]`** ✅ **Clos à l'audit du 2026-09-17 : le cron PART.** Mesuré deux jours de suite dans les journaux Vercel — 11:31:50 UTC les 16 et 17/09 (plan hobby : un cron `0 11 * * *` y est déclenché à l'heure près, pas à la minute). Le filet de reprise reste utile, mais il n'y a plus de panne à diagnostiquer. **Vérifier côté Vercel pourquoi le cron de veille ne part plus** :
      Dashboard → projet `job-ai` → Settings → Cron Jobs (état activé/désactivé, dernière
      exécution). Ou en CLI : `vercel crons ls`. Non lisible depuis une session Claude (pas de
      jeton Vercel, et le MCP Vercel n'expose pas les crons). Le filet ci-dessus rend la panne
      inoffensive, il ne la corrige pas à la source.
- [x] 🔧 **`[VEILLE-12]`** Rendre le silence VISIBLE. Fait le 14/09/2026, **autrement que
      prévu et c'est mieux** : plutôt qu'une alerte maison à 36 h, JobAI publie `dataAsOf` +
      `expectedMaxAgeSec` (contrat v1.3) et c'est le HUB qui juge — `lib/gel.ts` compare, et
      distingue « fraîche », « figée », « horloge en avance » et « âge connu non jugé ». Une
      alerte écrite ici n'aurait parlé qu'à la carte JobAI ; un seuil publié entre dans la page
      « Ce qui demande mon attention » du hub avec les quatre autres apps.
      **Le seuil vaut 30 h et non 36** : la cadence DÉCLARÉE (le cron quotidien) plus une marge
      de 6 h. Un test lit `vercel.json` et refuse la divergence.
      ⚠️ **Et surtout pas les 16 h de la cadence OBSERVÉE**, même si c'est le rythme réel
      aujourd'hui : il ne l'est que par l'effet de bord `[VEILLE-13]` ci-dessous. Calibrer sur
      un accident ferait crier « figée » chaque jour le jour où l'accident est corrigé.
      La fraîcheur se lit sur `CLE_RAPPORT` (fin d'une passe RÉUSSIE) et jamais sur
      `sync_state["veille-auto"].majLe`, qui est le jeton de réservation posé AVANT le travail :
      une passe qui démarre puis échoue l'avancerait, et le hub annoncerait une fraîcheur que
      personne n'a produite. 7 mutations jouées, 7 attrapées.
- [ ] 🟡 **`[VEILLE-13]`** **Le cron de géocodage fait une passe de VEILLE chaque nuit, et son
      journal annonce une panne qui n'existe pas.** Découvert en écrivant `[VEILLE-12]`,
      **non corrigé** (hors périmètre — un bug préexistant ne se corrige pas sans feu vert).
      Le filet de reprise de `app/api/cron/geocodage/route.ts` est gardé par
      `reserverPasse(db, CLE_VEILLE, DELAI_VEILLE_MS, …)`. Ce délai valait **20 h** quand le
      filet a été écrit ; il est passé à **45 s** le 17/08/2026 (`lib/synchro.ts`, pour la bonne
      raison — le compteur d'absences compte désormais des jours). À 03:00, la dernière veille
      a donc 16 h : la réservation réussit TOUJOURS, et la branche de rattrapage part chaque
      nuit. Conséquences, par ordre de gravité décroissante : (a) `console.warn("veille en
      retard — reprise depuis ce cron")` est écrit chaque nuit alors que rien n'est en retard —
      c'est le bruit qui rend un vrai signal invisible, exactement l'inverse du but du chantier ;
      (b) deux ingestions complètes par jour au lieu d'une (la donnée est plus FRAÎCHE, pas
      moins — le coût est en runtime et en requêtes aux sources) ; (c) le chemin de géocodage
      dédié (`MAX_SITUATIONS_CRON`, `BUDGET_GEOCODAGE_CRON_MS`) n'est jamais emprunté — sans
      perte fonctionnelle, `executerVeilleComplete` mesure les distances elle-même, mais avec un
      autre budget que celui prévu ici ; (d) le commentaire de la route dit encore « 20 h ».
      Correctif probable : un délai PROPRE au filet (« reprendre si la veille a plus de N heures »)
      au lieu de réutiliser l'anti-rafale de 45 s, qui protège d'autre chose.
      ✅ **CORRIGÉ le 2026-09-17** (« continue les tâches backlog »), exactement comme prévu :
      `DELAI_RATTRAPAGE_VEILLE_MS` (20 h) répond à « la veille a-t-elle manqué son tour ? »,
      `DELAI_VEILLE_MS` (45 s) reste sur « une passe tourne-t-elle en ce moment ? ». Deux
      questions, deux constantes — le partage était la cause racine.
      **20 h est DÉRIVÉ, pas rond** : les crons sont à 11:00 et 03:00, soit 16 h d'écart ; le
      seuil doit dépasser 16 h (sinon le filet part chaque nuit) et rester sous 40 h (l'âge de
      la veille au premier 03:00 qui suit un tour manqué, sinon le filet ne part jamais). Un
      test le verrouille contre ces deux bornes.
      ⚠️ **Conséquence qui dépasse le bruit corrigé** : le chemin de géocodage DÉDIÉ
      (`MAX_SITUATIONS_CRON`, `BUDGET_GEOCODAGE_CRON_MS`) redevient emprunté chaque nuit — il
      ne l'était plus depuis un mois. Ça rend une SECONDE passe de géocodage par jour, et c'est
      exactement la ressource que `[VEILLE-42]` a montrée saturée (3 705 offres non placées
      pour 40 places de mesure par passe).
      ⚠️ Le test qui affirmait « le géocodage la reprend CHAQUE JOUR » décrivait le DÉFAUT,
      pas une intention — son propre commentaire l'avouait (« ce test ne vérifie plus un
      arbitrage entre crons »). Il a été re-décidé, pas re-basé, avec son histoire écrite dedans.
      ⏸️ **EFFET NON VÉRIFIÉ, ET LA FENÊTRE EST MANQUÉE — 2026-09-18.** Le contrôle armé
      pour ce matin visait le cron de VEILLE (11:31 UTC) ; or ce correctif ne se prouve que sur
      le cron de GÉOCODAGE (03:00 UTC). Les journaux d'exécution Vercel hobby sont retenus
      ~17 minutes : à 11:42, ceux de 03:00 n'existaient plus. Une requête sur 12 h n'a rien
      rendu, ce qui n'est PAS un « aucun warn » — c'est une absence de données.
      **Ce qu'il faut pour clore** : un relevé pris entre 03:00 et ~03:15 UTC, et deux choses
      seulement à y lire — (a) `veille en retard — reprise depuis ce cron` ne doit PLUS
      apparaître ; (b) le chemin dédié doit s'être exécuté (`MAX_SITUATIONS_CRON` /
      `BUDGET_GEOCODAGE_CRON_MS`), donc une ligne `[distances]` SANS ligne `[veille]`.
      ⚠️ **Piège de lecture** : l'absence de warn ne prouve rien si le cron n'a pas tourné du
      tout. Exiger la preuve POSITIVE (la ligne du chemin dédié), pas seulement le silence.

## Chantier #08 — CV et profil (ADR-0009) 🟩

> Demandé par Marc le 2026-08-13 : « je veux la possibilité d'uploader mon CV pour que la
> recherche de job se fasse par rapport à ça, et que tout s'update ». Livré le jour même,
> lots CV-00 à CV-06.

- [x] 🧭 **`[CV-00]`** ADR-0009 — le profil sort du code, le CV le remplit.
- [x] 🔧 **`[CV-01]`** `lib/profil.ts` : FAITS (vérifiables dans un CV) séparés des
      ARBITRAGES (le barème, qu'aucun CV ne contient). Non-régression prouvée par empreinte
      md5 des 142 sorties du barème, avant/après.
- [x] 🔧 **`[CV-02]`** `promptSafety` (= `[V3-01]`).
- [x] 🔧 **`[CV-03]`** Téléversement, lecture (unpdf), extraction, stockage.
- [x] 🔧 **`[CV-04]`** Écran de revue : rien n'est coché d'avance, la provenance est
      affichée, son absence est dite.
- [x] 🔧 **`[CV-05]`** Re-notation immédiate à la validation, notes manuelles préservées.
- [x] 🔧 **`[CV-06]`** SWOT enrichi par les FAITS du CV, jugement conservé et marqué.

### Ce qui reste ouvert sur ce chantier

- [ ] 👤 **`[CV-07]`** Poser `ANTHROPIC_API_KEY` dans l'environnement Vercel. **Sans elle,
      l'extraction ne tourne pas** — elle rend un échec nommé, jamais un profil inventé, et
      le CV reste stocké pour être ré-analysé d'un clic ensuite.
      ✔ **MARC S'EN CHARGE (décision du 2026-09-17).**
      ⚠️ **ET « D'UN CLIC » ÉTAIT FAUX JUSQU'À CE SOIR** — c'est en préparant ce geste que je
      l'ai vu. `reanalyserCv` était écrite, correcte, testée… et appelée par AUCUN composant.
      Le seul chemin restant était de re-téléverser le fichier, c'est-à-dire exactement ce que
      le commentaire de l'écran voulait éviter. Le bouton existe maintenant
      (`components/ReanalyseCv.tsx`), sur les CV en échec d'extraction ou sans proposition.
      Sans lui, la clé serait arrivée sans rien débloquer de ce qui est déjà déposé.
- [ ] 🔧 **`[CV-08]`** La Routine quotidienne porte ses termes de recherche dans son PROMPT,
      hors du dépôt : un CV validé enrichit `profil.recherches` sans changer ce qu'elle tape
      le matin. Divergence réelle, nommée dans l'ADR-0009. La fermer suppose que la Routine
      LISE le profil (endpoint dédié, gardé comme `/api/ingest/depot`).
      ✔ **PRÉCISÉ le 2026-09-17, en cherchant quoi faire du backlog.** La divergence a un
      SECOND site, DANS le dépôt cette fois : `RECHERCHES_GUICHET_CANDIDATES`
      (`lib/ingest/sources.ts`) portait en commentaire « VIENT DU PROFIL (ADR-0009) — la
      veille doit chercher ce que Marc EST », et lisait `PROFIL_DEFAUT`, c'est-à-dire le
      profil DU CODE. Un CV validé change le profil ACTIF, en base, et n'a jamais touché
      cette valeur.
      ⚠️ **Ce n'est pas réparable à cet endroit** : une constante de module est évaluée à
      l'import, le profil actif est une lecture de base ASYNCHRONE. La promesse se tient au
      point d'APPEL, quand une passe construit ses sources — c'est là que le raccordement
      devra vivre.
      ⚠️ **Et la divergence est DORMANTE** : `RECHERCHES_GUICHET` est vide depuis le
      2026-07-31 (le flux RSS du Guichet ne répond à aucune des cinq adresses testées), donc
      la veille n'interroge aucun terme par ce canal. Le seul consommateur restant est le banc
      d'essai `scripts/sonder-sources.ts`, qui en lit le PREMIER élément. Le commentaire a été
      corrigé pour dire ce qui est vrai ; le raccordement reste à faire le jour où le canal
      revit. **Aucune ligne de comportement n'a changé.**
      ⚠️ **ÉCARTÉ PAR MARC le 2026-09-17** : interrogé sur le lot à deux mains (je livre
      l'endpoint, il change une ligne de prompt), il ne l'a pas retenu. L'item reste ouvert
      sans travail de ma part.
- [x] 🔧 **`[CV-09]`** ✅ **Livré le 2026-09-17** (« continue les tâches backlog »). Aucun test
      ne couvrait `lib/cv/actions.ts` ni `lib/cv/depot.ts` — **471 lignes qui écrivent à partir
      d'un document personnel, sans un seul verrou** (la logique PURE, elle, l'était déjà :
      46 tests). Deux fichiers, 15 cas, 4 mutations prouvées.
      · **La session, revérifiée par les QUATRE actions** — c'était une PROMESSE écrite dans
        l'en-tête du module (« un point d'entrée POST généré par Next est appelable
        directement, le middleware ne le couvre pas ») et rien ne la tenait. L'assertion porte
        AUSSI sur le fait qu'aucune n'a touché au dépôt avant de refuser : un refus qui arrive
        après l'écriture est décoratif.
      · **La paire OPPOSÉE de `televerserCv`** — une LECTURE ratée ne stocke rien (sans texte,
        rien à ré-analyser), une EXTRACTION ratée stocke QUAND MÊME avec sa raison (jeter le
        fichier punirait Marc d'une panne de clé qui n'est pas la sienne). Trois lignes
        d'écart, comportements inverses, et les intervertir ne casse rien de visible.
      · **Les TROIS issues de `propositionDe`** — « absente » et « illisible » se répondent
        différemment (la seconde se répare par une ré-analyse) ; la première version les
        rabattait toutes deux sur `null`.
      · **`null` ≠ liste vide** — « base non configurée » et « aucun CV » ne se disent pas
        pareil, avec le contrôle négatif qui rend `[]` quand la base est là.
      ⚠️ Ce que ces tests NE prouvent PAS, et c'est écrit dedans : le SQL. La fausse base est
      un objet thenable, pas un moteur — la logique de DÉCISION est éprouvée, le SQL réel
      l'est ailleurs (`tests/oauthStore.test.ts`, sur une vraie Postgres).
      ⚠️ **Le garde-fou n°5 a tiré DEUX fois sur ce lot, et il avait raison les deux fois** :
      d'abord sur une fausse chaîne de connexion posée « juste pour tester » (le vecteur exact
      qu'il surveille — remplacée par `vi.stubEnv`), puis sur le COMMENTAIRE qui citait la
      ligne fautive pour l'expliquer. Une garde d'absence sur du source contredit
      mécaniquement une bonne explication ; la phrase décrit désormais la forme sans la
      reproduire.
- [ ] 🔧 **`[CV-10]`** Un PDF SCANNÉ reste illisible (pas de reconnaissance de caractères).
      L'app le dit et propose le remède ; c'est une limite, pas un bug.
      ⚠️ **ÉCARTÉ PAR MARC le 2026-09-17**, interrogé explicitement. Reste une limite assumée.
- [x] 🔧 **`[CV-11]`** ✅ **Livré le 2026-09-17 : 1 854 → 491 lignes.** Les 153 leçons de la §9 (1 536 lignes, 83 % du fichier) sont déménagées VERBATIM dans `docs/LESSONS.md` ; la §9 garde leur RÈGLE, une ligne chacune, reprise au caractère près du gras que chaque incident avait déjà produit. ⚠️ **C'est une perte assumée** : un `CLAUDE.md` ne charge rien hors de son arbre, donc les histoires n'arrivent plus en session. ⚠️ **Et le plafond de 150 n'est pas atteint** — 153 règles ne se réduisent qu'en en supprimant, et chacune a été payée par un incident ; l'en-tête le dit maintenant au lieu d'annoncer un plafond que le fichier violait depuis toujours. Vérifié par trois contrôles : corps présent verbatim, 153/153 règles dans l'index, tout ce qui n'est pas la §9 inchangé. ~~`CLAUDE.md` fait **1 854 lignes** pour un « plafond assumé : 150 » — il en faisait 867 quand cet item a été écrit, donc il a DOUBLÉ depuis (re-mesuré à l'audit du 2026-09-17).~~ Il se
      charge à chaque session : le distiller vers `docs/LESSONS.md` en gardant ici les seules
      règles qui changent la façon de coder.

## Chantier #04 — V4 : ingestion d'offres ⬜

- [x] 👤 **`[V4-01]`** ✅ **Clos à l'audit du 2026-09-17 : sans objet.** Le flux XML est lu et branché depuis le 2026-08-20 — aucune demande à EDSC n'a été nécessaire, il est public. Mesuré ce jour : `ingérées=8/1600`. ~~Demander l'accès au flux XML du Guichet-Emplois auprès d'EDSC.~~
- [x] 🔧 **`[V4-02]`** ✅ **CADUC (audit 2026-09-17).** Il n'y a plus d'« en attendant » : le flux XML tourne. Un second pipeline sur le CSV serait une deuxième source de la même donnée, à maintenir pour rien. ~~Pipeline sur l'export CSV des données ouvertes en attendant le flux.~~
- [x] 🔧 **`[V4-03]`** ✅ **Fait (ADR-0013), vérifié à l'audit du 2026-09-17.** Les codes retenus se choisissent depuis l'écran (mesure du flux, table code/compte/titres, cases à cocher) et pèsent dans la note via `metiers`. ~~Compléter les codes CNP visés.~~
- [x] 🔧 **`[V4-04]`** ✅ **Vérifié dans le code à l'audit du 2026-09-17** : dans `trier`, `cleDoublon`/`cleCanonique` écartent le doublon puis `situer` tranche la région — les deux AVANT `computeScore`. ~~Déduplication et filtre de rayon appliqués avant notation.~~

## Chantier #05 — Expérience et présentation ⬜

> Demandé par Marc le 2026-07-28, juste après la mise en ligne : « améliorer affichage,
> page accueil, meilleur UI un peu comme FinanceAI, une carte avec les offres pour voir la
> proximité et la distance de la maison, avec l'affichage complet des offres, un onglet qui
> va prendre les offres de tous les sites d'offres genre LinkedIn et autre que tu peux
> trouver avec un lien cliquable pour aller sur l'offre directement ».

- [x] 🔧 **`[UX-01]`** Refonte de l'interface. ✅ 2026-07-28 — **décision de Marc** :
      densité et grammaire de FinanceAI, **accent ambre conservé** (voir
      [ADR-0003](./docs/adr/0003-direction-visuelle.md)). Ce n'est pas un mélange
      d'identités : une langue de mise en page et une couleur de marque sont séparables, et
      l'ambre n'est pas décorative — c'est l'`app.color` publiée au hub, elle identifie
      JobAI parmi les widgets.
      · **Navigation par onglets, en vraies ROUTES** (`/`, `/references`) plutôt qu'un état
        client : chaque onglet a une URL, se met en signet, le bouton Retour marche, et une
        page ne charge que ce qu'elle affiche. Onglet courant signalé par `aria-current` ET
        par un trait — la couleur ne porte jamais l'information seule.
      · **L'accueil cesse d'être un mur** : barème, entreprises, salaires et SWOT partent
        sous `/references`. Ce sont des documents qu'on consulte, pas des choses qu'on fait.
      · Cadre partagé (`components/Cadre.tsx`), échelle d'espacement unique, tuiles de
        compteurs plus compactes. La page de connexion ne prend PAS le cadre : hors session,
        afficher des onglets donnerait l'illusion d'un accès.
      · ⚠️ **Régression d'accessibilité rattrapée en cours de route** : en devenant un lien,
        la marque a cessé d'être un `<h1>` — `/` et `/references` se sont retrouvées sans
        titre de niveau 1. Corrigé par un `<h1>` hors écran nommant l'onglet (`.hors-ecran`,
        jamais `display:none` qui le retirerait aussi des lecteurs d'écran).
      · **Verrou posé** : `tests/routesGardees.test.ts` DÉCOUVRE les routes depuis `app/` et
        exige que chacune soit gardée, sauf exemption motivée. Le danger n'était pas
        `/references`, vérifiée en l'écrivant — c'est la sixième route, dans six semaines.
        Discrimination prouvée (ouvrir `/references` indûment fait tomber exactement ce test).
- [x] 🔧 **`[UX-02]`** Page d'accueil : bloc **« À faire maintenant »** en tête.
      ✅ 2026-07-28 — `lib/aFaire.ts` (pur, 19 tests). Le tableau de bord répondait à « où
      en est la recherche » ; il manquait « par où je commence aujourd'hui ».
      Quatre déclencheurs, tous adossés à un FAIT du suivi : entrevue à préparer, relance
      échue (CV envoyé depuis ≥ 14 j), candidature à envoyer (note ≥ 80 jamais postulée),
      offre à vérifier (repérée depuis ≥ 30 j et jamais traitée). Une seule action par
      offre, plafond de 6, ordre **entrevue → relance → postuler → vérifier** (un tri par
      note mettrait la meilleure offre devant une entrevue qui a lieu demain).
      · **Aucune suggestion sur une offre périmée ou historique** — suggérer de postuler à
        un poste pourvu est pire que ne rien suggérer. **Discrimination prouvée** : filtre
        retiré ⇒ exactement les 3 tests qui le portent tombent, dont celui sur les 38 offres.
      · Chaque suggestion affiche **le fait qui la déclenche** : une suggestion qu'on ne peut
        pas contester finit par être ignorée en bloc. Les seuils sont des heuristiques
        nommées, exportées et citées dans le texte — jamais des vérités déguisées.
      ⚠️ Reste de `[UX-02]` : rien. La refonte visuelle globale est `[UX-01]`.
- [x] 🔧 **`[UX-03]`** **Affichage complet d'une offre** : page `/offre/[id]` avec la
      justification séparée en atouts / réserves, les notes de recherche, les faits
      (distance, salaire, dates, **provenance de la note** — vérifiée à la main ou
      calculée), et les contrôles de suivi. ✅ 2026-07-28. L'entreprise devient un lien
      depuis la liste ; « offre ↗ » reste le lien externe — deux destinations, deux liens.
      Une panne de base y donne un message honnête plutôt qu'un 404 trompeur.
      ⚠️ Reste à faire : l'historique des changements de statut (rien ne l'enregistre
      aujourd'hui — il faudrait une table dédiée).
- [x] 🔧 **`[UX-04]`** **Carte des offres**. ✅ 2026-07-28 — 3ᵉ onglet `/carte`.
      · **On géocode des VILLES, pas des offres** : une douzaine de municipalités pour des
        dizaines d'offres. Géocoder par offre ferait dix fois la même requête pour
        « Québec », alors que Nominatim demande une requête/seconde et un usage parcimonieux.
        La ville vient de `ENTREPRISES_CIBLES`, déjà structurée — aucun parsing des `notes`,
        qui aurait produit des épingles fausses là où la ville n'est pas écrite.
      · **Les coordonnées vont en BASE, jamais dans le code.** Le garde PII interdit tout
        couple `4x.xxxx, -7x.xxxx` dans un fichier versionné. Ces coordonnées-ci sont
        publiques, mais aucun garde ne distingue « les bonnes » des « mauvaises » par la
        forme : l'assouplir pour laisser passer des centres-villes ouvrirait la porte à
        celles qu'il protège. Nouvelle table `villes` + migration `0001`.
      · **Garde-fou n°1 tenu** : le domicile n'est ni affiché, ni envoyé au client, ni
        déductible — le cadrage se calcule à partir des seules épingles. Verrouillé par test.
      · **Ce qui manque est COMPTÉ** : « 4 offres situées sur 23 », employeurs sans ville
        nommés, villes en attente de géocodage. Une carte qui montre 12 épingles pour
        23 offres sans le dire laisse croire à une couverture qu'elle n'a pas.
      · **Parité clavier/lecteur d'écran** : la carte est `aria-hidden` (une carte de tuiles
        ne s'explore pas au lecteur d'écran) et la liste sous elle porte la MÊME information.
      · `circleMarker` plutôt que les marqueurs par défaut : ceux-ci référencent des PNG par
        URL relative et disparaissent dès qu'un bundler renomme les fichiers — panne visible
        en production seulement. Leaflet est chargé dynamiquement (**mesuré** : absent des
        chunks de démarrage).
      · La règle d'appariement offre↔entreprise vivait **dans un test** ; extraite dans
        `lib/carte.ts`, consommée par la carte ET par le test de référence. Une règle, un
        endroit — plancher de longueur ajouté contre le piège du matching par sous-chaîne.
      ⚠️ **Deux parties NON vérifiées depuis la session** (le proxy réseau refuse Nominatim
      et il n'y a pas d'e2e) : l'appel réel au géocodeur, et le rendu Leaflet. Toute la
      logique est testée avec un `fetch` injecté (18 tests) ; le premier clic sur « Situer
      les villes » en production est le vrai signal. 👤 À exercer une fois.
- [x] 🔧 **`[UX-06]`** **Logo**. ✅ 2026-07-28 (demandé par Marc en fin de session).
      Le mot-symbole portait déjà la marque : « JOB **_** AI », un souligné ambre au milieu —
      c'est le curseur d'une invite de terminal. Plutôt qu'inventer un symbole sans lien
      (mallette, loupe), on dessine ce qui existe déjà : `>_`.
      · **Deux formes, pas une de plus.** À 16 px — la taille réelle d'un onglet — une lettre
        devient une bouillie et un dessin détaillé une tache.
      · **Fond sombre opaque** dans `app/icon.svg` : un favicon ne connaît pas le thème de qui
        le regarde, et une icône transparente disparaîtrait sur l'une des deux barres d'onglets.
      · **Dans l'en-tête, le même motif est DESSINÉ, pas importé** (`components/Cadre.tsx`) :
        il suit `currentColor`, donc les deux thèmes. Une image figée resterait ambre sur un
        fond qui change.
      · L'ambre est `#f2a31b` — la même que l'`app.color` publiée au hub. La changer ici sans
        la changer là désaccorderait le widget.

- [x] ❌ **`[UX-07]`** Refonte carte Google Maps — **ANNULÉ par Marc le 2026-07-29**,
      quelques heures après l'acceptation de l'ADR-0004 (mis à jour). Remplacé par
      `[UX-08]`, qui couvre l'essentiel du besoin sans facturation Google ni clé API.
      La carte Leaflet existante reste en place en attendant la décision de Marc :
      🧭 garder l'onglet Carte tel quel, ou le retirer ?
- [x] 🔧 **`[UX-08]`** **Lien « Trajet dans Google Maps »**. ✅ 2026-07-29 — sur chaque
      offre (liste ET page de détail). URL officielle `maps/dir/?api=1`, gratuite, sans
      clé. **Le lien ne porte que la DESTINATION** (« Entreprise, Ville, QC ») : l'origine
      est proposée par Google côté compte — Marc y voit sa maison, ses endroits enregistrés
      et la durée réelle avec trafic, sans que l'app ne connaisse ni ne transmette une seule
      coordonnée personnelle. C'est ce qui a permis de RÉTABLIR le garde-fou n°1 strict.
      Verrou : `tests/lienTrajet.test.ts` — le paramètre `origin` est INTERDIT dans l'URL
      (l'ajouter « pour aider » enverrait le domicile dans l'historique de navigation), et
      chaque offre active du seed produit un lien avec sa ville.

- [x] 🔧 **`[UX-09]`** **Carte par ENTREPRISES** (demande Marc 2026-07-29 : « je veux la
      vue d'ensemble, mais je veux voir sur la carte les entreprises et leurs endroits et
      les offres associées »). ✅ 2026-07-29 — remplace les épingles de municipalités.
      · **Chaque entreprise cible à son emplacement** (Nominatim, requête « nom, ville,
        Québec, Canada »), avec fiche au clic : lecture des Références, km mesuré, ses
        offres actives (liens vers le détail), lien « Trajet dans Google Maps ».
      · **Repli honnête** : une entreprise absente d'OpenStreetMap est posée au CENTRE de
        sa ville — cercle en POINTILLÉ, « position approximative » dans la fiche ET la
        liste. Présenter un centre-ville comme l'adresse d'un employeur serait du fake data.
        Les replis d'une même ville sont REGROUPÉS sur une épingle (des cercles empilés se
        masqueraient). Re-tenter une approximative = retirer sa ligne `entreprises_lieux`
        (👤 en base pour l'instant ; correction manuelle dans l'app = `[UX-10]` si besoin).
      · **Une cible SANS offre active reste affichée** (teinte neutre) : c'est la liste de
        chasse (« candidature spontanée possible »), pas un vide à masquer.
      · **Zoom molette activé au premier clic** sur la carte (avant, faire défiler la page
        zoomait la carte au survol — le piège classique).
      · Table `entreprises_lieux` (migration `0002`) : precision `exacte`/`ville` en CHECK,
        bornes régionales en CHECK (un homonyme de Vancouver est refusé par la base).
      · La mécanique Nominatim est UNE seule série générique (`geocoderSerie`) pour villes
        et entreprises — deux copies de la boucle auraient divergé.
      · Frontière `lib/geocodage.ts` élargie aux entreprises cibles dans `CLAUDE.md` §2.4 ;
        toujours JAMAIS le domicile ni un lieu personnel.
      · **Revue adversariale : 14 findings confirmés, 0 réfuté — tous corrigés.** Les
        structurants : une résolution Nominatim DANS les bornes régionales n'est pas encore
        la bonne — validée par la CLASSE du lieu (`place`/`boundary`/`highway` rejetées :
        « Labatt, Québec » résolvait une RUE ou la municipalité, inscrite « exacte » à VIE)
        ET par la DISTANCE au centre-ville attendu (≤ 30 km — la brasserie Labatt de
        Montréal est dans les bornes) · délai de 4 s PAR requête (sans lui, une requête qui
        pend meurt au mur des 30 s de la Server Action, APRÈS le travail, AVANT
        l'enregistrement) · villes d'abord PUIS entreprises dans la même passe (une
        entreprise dont la ville n'était pas géocodée restait coincée à vie) · villes
        insituables NOMMÉES dans le compte-rendu · dénominateur d'offres rétabli (« X sur
        Y ») · légende des couleurs, seuils LUS du barème (`SEUIL_PALIER_A/B`) · contraste
        des liens MESURÉ (sonde oklch→sRGB : ambre 3,7:1 → variantes texte 6,0:1, deux
        thèmes) · `role=status` permanent pendant la passe · focusables de Leaflet retirés
        du parcours clavier (conteneur `aria-hidden`) · invariant de comptage du test
        corrigé (il additionnait des OFFRES à des NOMS dédupliqués — vacant). Chaque
        correctif discriminant est prouvé par sonde (validation par distance et invariant
        compris : neutralisés ⇒ exactement le bon test tombe).
      👤 Reste à Marc : `npm run db:migrate` (migration 0002), puis « Situer N entreprises »
      sur l'onglet Carte — plusieurs passes (~6 entreprises/passe, cadence Nominatim).
      ⚠️ L'appel réel Nominatim n'est toujours pas exerçable depuis la session : logique
      testée par injection, le premier clic réel fait foi.

- [x] 🔧 **`[UX-10]`** **Six offres réelles ajoutées au jeu** (demande Marc 2026-07-29 :
      « j'ai réussi à situer les entreprises, y a encore trop peu d'offres »).
      ✅ 2026-07-29 — 23 → **29 offres actives**, 23 → **29 entreprises cibles**.
      · **Diagnostic d'abord** : la carte ne cachait RIEN (23 offres vivantes, 23
        épinglées, 0 hors cibles). Le problème n'était pas l'affichage mais le STOCK —
        c'est ce qui a évité de « corriger » une carte qui fonctionnait.
      · Offres trouvées via le **connecteur Indeed de la session** (usage prévu par
        `[UX-05]` : rafraîchir le jeu au fil des sessions, jamais un fetch de l'app —
        garde-fou n°4 intact). **Chaque annonce a été lue** : atouts et réserves en
        viennent. Honeywell, APN, Dracon Automatisation, Techsol Marine, Dexterra,
        Spécialistes en Services.
      · **Notes CALCULÉES** (`scoreSource: "calcule"`, 54 à 74, plafond 85 respecté), pas
        manuelles : une note manuelle vient de la lecture de Marc, et lui seul peut la
        poser — l'annoncer autrement viderait de son sens la distinction qui fait autorité
        dans tout le barème.
      · **`km: null` — non mesuré, jamais estimé.** Le domicile ne vit que dans
        `DOMICILE_LAT`/`DOMICILE_LON` : la session ne peut pas calculer ces distances, et
        un chiffre « à peu près » s'afficherait ensuite avec l'assurance d'un relevé.
        `EntrepriseCible.km` devient donc `number | null`, et les trois surfaces
        d'affichage (fiches, carte, liste) **disent** « distance non mesurée ».
        Suite possible : `[DISTANCE-CALCULEE]`.
      · **Trois invariants de test reformulés, aucun affaibli** : la provenance des notes
        (une note calculée doit prouver son plafond), les distances (une distance
        PRÉSENTE est plausible ; absente, elle est franchement nulle), le tri des cibles.
        Chacun est doublé d'un **filet de majorité** — si les repérages automatiques
        venaient à dominer les entrées lues à la main, ce sera une décision à prendre, pas
        un glissement à constater.
      · Découverte au passage : `[SCORE-SENIORITE-LETTRES]` (années en toutes lettres non
        détectées par le barème).

- [x] 🔧 **`[VEILLE-01]`** **Veille quotidienne : ajouter les nouvelles offres, retirer celles
      qui ne sont plus disponibles** (demande Marc 2026-07-30). ✅ 2026-07-30 — la DÉCISION
      est livrée et testée ; le déclenchement quotidien attend une action de Marc (ci-dessous).
      · **Où tourne le balayage, et pourquoi pas dans la CI** : le connecteur Indeed vit
        dans une session Claude, pas dans l'app ni dans GitHub Actions. Un workflow CI ne
        peut donc pas balayer. C'est une **Routine** (`trig_01KGVHdBHi2QJwSfpoKeQi1D`,
        7 h heure du Québec) qui réveille une session, laquelle balaye, applique la
        décision, passe le gate, commit et pousse. L'app, elle, ne fait toujours aucun
        `fetch` vers une source d'offres — garde-fou n°4 intact.
      · ⚠️ **Pas de Routine — décision de Marc, 2026-07-30.** La Routine créée plus tôt a été
        **supprimée** à sa demande (« je veux que tu fasses tout toi-même sans routine »).
        Conséquence à assumer : **la veille n'est PAS automatique**. Elle tourne quand Marc
        la demande en session, et rien ne se déclenche seul le matin. Le module de décision
        reste ce qui la rend sûre à chaque passage.
      · **La péremption est le vrai risque, pas l'ajout.** « Absente d'un balayage » ne veut
        pas dire « fermée » : le classement de la source ou un mot-clé qui ne matche pas ce
        jour-là suffisent à la faire disparaître. D'où **3 absences consécutives** avant
        péremption (`SEUIL_ABSENCES_PEREMPTION`), la **résurrection automatique** d'une
        offre revue (un faux positif ne doit jamais être définitif), et surtout : une offre
        **jamais vue par un balayage n'est JAMAIS périmée** — les 23 offres relevées à la
        main ne viennent pas d'une requête Indeed, leur absence ne prouve rien.
        ⚠️ Discrimination prouvée par sonde : sans cette dernière protection, **un balayage
        vide périmerait les 29 offres actives d'un coup**.
      · `lib/veille.ts` (pur, 15 tests), état dans `lib/veille-journal.json`. La date est
        un **paramètre** — Vercel tourne en UTC et Marc vit à UTC−4.
      · **Premier balayage réel, 30/07/2026** : 17 offres vues, dont 7 déjà suivies —
        confirmées vivantes, compteur d'absences remis à zéro. **9 offres ajoutées**
        (29 → 38 actives) et **7 entreprises cibles** (Groupe Sani-Tech, Groupe Robert,
        Opsens, Domtar, Groupe Mundial, TARDIF, Nutriart). Aucune péremption :
        `techsol-coordonnateur-qualite` est **en sursis à 1 absence sur 3**.
        Trois candidates ont été **écartées après lecture** — Groupe Laberge
        (« Responsable de l'entretien et service ») est de l'entretien d'immeubles
        locatifs, et deux annonces d'agence ne nomment pas l'employeur. Le titre ne dit
        pas ce qu'est un poste ; c'est pour ça que chaque annonce se lit en entier.

- [x] 🔧 **`[AUTO-01]`** **Plus aucune commande à taper** (demande Marc 2026-07-30 : « je veux
      pas avoir à faire des commandes à chaque fois, je veux que ce soit automatique »).
      ✅ 2026-07-30 — les deux gestes manuels qui restaient sont supprimés.
      · **`npm run db:seed` → automatique.** `lireOffres()` appelle `assurerSeedAJour()` :
        au premier affichage qui suit un déploiement, la base se met au niveau du jeu de
        départ. Le reste du temps, **une lecture et rien d'autre** — l'écriture n'a lieu
        que si le jeu de départ a réellement changé.
      · **Pourquoi une EMPREINTE (`sync_state`) et pas un compte d'offres** : comparer les
        53 offres à chaque affichage coûterait une centaine de requêtes pour, presque
        toujours, ne rien faire ; un simple compte, lui, ne verrait pas une note corrigée
        ou une justification réécrite — la base servirait l'ancienne version sans que rien
        ne cloche. L'empreinte ignore les champs de Marc, sinon **chacun de ses clics
        déclencherait une réécriture complète** (prouvé par sonde : ajouter `statut` à
        l'empreinte fait tomber le test dédié).
      · **Verrou** : la valeur vaut `en-cours:<empreinte>` pendant l'application, et
        l'empreinte finale n'est posée qu'APRÈS succès — deux instances ne peuvent pas
        écrire ensemble, et une application interrompue est reprise au passage suivant au
        lieu de passer pour terminée.
      · **Bouton « Situer » → automatique.** La carte lance la passe manquante via
        `after()` de Next 15 : **après** la réponse, jamais pendant — la passe enchaîne des
        requêtes Nominatim à 1,1 s d'intervalle, et la faire dans le rendu ajouterait ces
        secondes à chaque affichage. `passeGeocodage` a été extraite de `situerEntreprises`
        pour être appelable sans clic ; elle n'écrit que des positions, jamais rien
        d'irréversible — c'est ce qui autorise son passage à l'automatique.
      · ⚠️ **Contre-pression obligatoire** : `reserverPasse` borne à **une passe / 5 min**,
        via la base (une variable de module ne bornerait rien en serverless). Sans elle,
        chaque rechargement enverrait une salve à Nominatim — service gratuit qui BANNIT
        les appelants insistants : supprimer le clic aurait coûté la carte entière. Défaut
        sûr : si la réservation échoue, **pas de passe**.
      · Le bouton et `npm run db:seed` restent — pour amorcer une base neuve et pour forcer
        sans attendre. Le script appelle désormais le MÊME `appliquerSeed` que l'app.
      · Migration `drizzle/0003_*.sql`. 13 tests dédiés, 371 au total.

- [ ] 🔧 **`[INGEST-01]`** **Veille quotidienne automatique, multi-sources** (demande Marc
      2026-07-30 : « je veux que automatiquement chaque jour ça se fasse », « au moins 6 sites
      + les sites d'entreprises directement »).
      ⚠️ **RE-OUVERT le 2026-07-31 — la MÉCANIQUE tourne, les SOURCES ne rapportent rien.**
      Le cron, l'authentification, le tri, la péremption et l'écriture sont déployés et
      vérifiés en production. Mais deux sondes sur les VRAIES sources ont montré qu'il n'y a
      rien à récolter par cette voie. Cocher cet item aurait fait croire à une veille qui
      fonctionne : elle s'exécute, elle ne trouve rien.
      · **Guichet-Emplois : aucune adresse ne répond.** Cinq formes testées — deux 404, deux
        délais dépassés, une page HTML « Temporary Foreign Workers Search ». Il n'expose pas
        de flux public, et les délais suggèrent qu'il ralentit les appels automatisés.
        Désactivé, avec la preuve écrite dans `lib/ingest/sources.ts`. Piste suivante : leur
        API partenaire, qui demande une clé.
      · **ATS : les employeurs de la région n'y sont pas.** Après correction du témoin
        négatif, 10 pages vérifiées au lieu de 36 — dont 7 vides, Dexterra (100 offres,
        toutes hors Québec) et deux HOMONYMES néerlandais (« ace », « robert » à Amsterdam).
        **Zéro offre locale.** Les PME de Québec publient sur Indeed et Jobillico, pas sur
        des ATS américains.
      · ✅ Ce qui est acquis et vérifié : le filtre géographique (106 brutes → 0 retenue, tout
        le hors-région écarté), le témoin négatif, le rapport par source, et la mécanique
        complète. Le jour où une source locale sera trouvée, tout est prêt à la recevoir.
      · **La seule source qui produit reste Indeed** — 9 offres réelles le 30/07, annonces
        lues, 3 écartées à raison. Elle exige une Routine claude.ai avec le connecteur.
      Suite : `[INGEST-02]`.
      · 👤 **ACTION REQUISE, une seule fois** : poser **`CRON_SECRET`** dans les variables
        Vercel (Production) et **`npm run db:migrate`** pour la table `sync_state`. Sans le
        secret, la route répond **503** — une route qui ÉCRIT ne s'ouvre jamais par oubli.
      · **Sources : uniquement ce que les sites PUBLIENT pour être lu** (décision Marc).
        Le RSS officiel du Guichet-Emplois (8 recherches alignées sur le profil) et les API
        d'ATS des entreprises (Greenhouse, Lever, Recruitee, Workable, SmartRecruiters) —
        c'est ça, « chercher sur les sites d'entreprises directement », en version durable.
        **Jamais** le HTML d'Indeed, LinkedIn, Jobboom ou Jobillico : leurs conditions
        l'interdisent et ils bloquent activement. Un moissonneur banni ne rapporte plus
        rien, en silence.
      · ⚠️ **Le filtre par note TOTALE ne filtrait RIEN — mesuré.** « Caissier », « Commis
        d'entrepôt » et « Préposé à l'entretien ménager » notent tous **48/100**, au-dessus
        d'un plancher naïf à 45 : les points accordés aux INCONNUES (distance non mesurée
        10/20, salaire non affiché 9/15, aucune exigence détectée 11/15) s'accumulent quel
        que soit le métier. Le seuil porte donc sur **`fitRole` ≥ 14/40**, la seule
        composante qui mesure l'adéquation. Les écartées sont **comptées** dans le rapport.
      · 🐛 **Bug du barème corrigé au passage** : « Chargé(e) de projets » notait **8 au lieu
        de 28** — le `(e)` coupe l'expression « chargé de projet » en deux. Les mots isolés
        (« coordonnateur(trice) ») s'en sortaient par hasard, les EXPRESSIONS étaient toutes
        cassées. L'écriture inclusive est la norme dans les annonces québécoises :
        `normaliserTitre` la retire avant tout appariement.
      · **La péremption réutilise `lib/veille.ts`** — aucune règle réécrite. Une offre déjà
        suivie que la veille revoit est marquée vue **sans repasser par le filtre** : son
        titre peut noter sous le plancher (le plancher juge une offre INCONNUE, pas une que
        Marc suit déjà), et la filtrer la ferait périmer en trois jours alors qu'elle est
        publiée sous nos yeux.
      · **Rotation des sources** : 14 par exécution, avec un curseur — sans lui, les
        dernières de la liste ne seraient jamais interrogées.
      · **Rapport PAR SOURCE**, jamais un total : avec six sources, un zéro ne dit pas si le
        marché est calme ou si tout est muet depuis trois semaines.
      · ⚠️ **Aucune source n'a pu être testée** : le proxy de la session de développement
        bloque tout accès sortant (vérifié sur cinq domaines). Les analyseurs sont purs et
        testés sur les formats documentés (35 tests), mais **la validation contre le réel se
        fera sur le déploiement** — c'est précisément pourquoi chaque source rend un compte
        séparé.
      · 407 tests. `lib/ingest/` est le seul endroit autorisé à contacter une source
        (garde-fou n°4) ; la route est exemptée de session avec motif écrit, verrouillé par
        `tests/routesGardees.test.ts`.

- [x] 🔧 **`[INGEST-03]`** **Les sites québécois offrent-ils un flux ?** (demande Marc
      2026-07-31 : « jobillico »). ✅ Mesuré — **aucun des quatre n'expose ses offres.**
      | Site | robots.txt | Flux d'offres |
      |---|---|---|
      | Jobillico | 38 chemins interdits, pas `/` | ❌ RSS 404, API 404, `?rss=1` rend la page HTML |
      | Québec emploi | 15 chemins interdits | ❌ le « flux » est une page TYPO3 |
      | Espresso-Jobs | 5 interdits (permissif) | ⚠️ flux XML valide — mais c'est leur BLOGUE |
      | Isarta | 31 chemins interdits | ❌ 404 |
      · ⚠️ **Le piège d'Espresso-Jobs** : 200, XML, 20 entrées — tous les voyants au vert.
        La première s'intitule « TI : peut-on encore se priver des femmes ? ». Sans LIRE le
        contenu, on annonçait une source qui marche. Un flux valide n'est pas un flux utile.
      · **Piste ouverte, mais elle demande un arbitrage** : le sitemap de Jobillico répond en
        XML. Un sitemap est fait pour les robots — c'est sa raison d'être. Il donne les URL
        des offres, **pas leur contenu** : titre, ville et salaire exigeraient de visiter
        chaque page, donc du moissonnage, écarté par la décision du 30/07. À rouvrir
        seulement si Marc assouplit cette règle.
      · **Conclusion de la série INGEST** : la voie « sources officielles » est épuisée pour
        le marché de Québec. Les employeurs d'ici publient sur Indeed, et Indeed n'est
        accessible que depuis une session Claude.

- [x] 🔧 **`[INGEST-04/05]`** **La veille FONCTIONNE — premier vrai lot le 2026-07-31.**
      45 offres réelles reçues, **40 ajoutées** (38 → 78 actives). HTTP 200 vérifié
      indépendamment dans les journaux Vercel, pas seulement dans le rapport du déposant.
      · **Le blocage était mal posé.** Une Routine claude.ai a le connecteur Indeed mais
        AUCUN accès au dépôt GitHub (jeton de session ≠ compte de Marc) ; ma session de
        développement a le dépôt mais aucun réseau sortant. Chacune détenait la moitié.
        La solution n'était pas de donner à l'une ce qui manquait, mais de constater que
        **les offres n'ont pas à passer par un commit** : `POST /api/ingest/depot`, tout
        va en base.
      · **Le tri a fait son travail sur du réel** : 0 hors-région, 2 sans lieu, 2 sous le
        plancher (Magasinier, Analyste ventes — hors profil), 1 doublon. Et **une offre
        périmée a été RESSUSCITÉE** : le mécanisme de résurrection a tourné sur du vrai.
      · **Défaut corrigé dans la foulée** : l'endpoint comptait les refus sans les nommer.
        « 5 écartées » ne se vérifie pas — Marc aurait dû rouvrir chaque lien, c'est-à-dire
        refaire à la main ce que la veille doit lui épargner. Chaque refus porte maintenant
        son motif, et un test vérifie que compteurs et liste nommée concordent.
      · ⚠️ **Rate limit Indeed — le vrai risque opérationnel**, mesuré par le déposant :
        fenêtre GLISSANTE d'environ 45 s, réarmée par CHAQUE tentative, même refusée.
        8 offres sur 53 n'ont pas pu être lues. Le prompt de la Routine doit lire par lots
        de 10 avec 60 s de pause, et 90 s d'arrêt complet après un throttle. Une offre non
        lue n'est JAMAIS envoyée — la règle a tenu sous pression, c'est ce qui compte.
      · Ce qui reste vrai de `[INGEST-01]` : aucune source AUTOMATIQUE (Guichet-Emplois,
        ATS, sites québécois) ne couvre le marché de Québec. Indeed via Routine est la
        seule voie qui produit — et elle produit.

- [x] 🔧 **`[CARTE-01]`** **La colonne `ville` n'était écrite NULLE PART — et la carte
      partait d'une liste tenue à la main.** Demande de Marc : « je veux que pour toutes
      les offres elles soient visibles sur la carte, même celles déjà importées ».
      · **La plainte ne désignait pas la cause.** Le réflexe était de retoucher la carte.
        Le vrai défaut : les quatre chemins d'insertion (cron, dépôt, ajout manuel, synchro
        du seed) recopiaient chacun leur liste de colonnes, et l'ajout de `ville` a été
        oublié dans les quatre. Le type la porte, la lecture la lit, l'écriture la perd —
        zéro erreur, zéro log. Les 40 offres du premier lot réel sont en base sans ville,
        donc sans position, donc sans distance : le critère n°1, perdu en silence.
      · **Corrigé à la cause** : `lib/persistance.ts` porte l'unique copie des colonnes.
        `tests/persistance.test.ts` DÉRIVE la liste attendue de `OffreSchema` (écrite à la
        main, elle vieillirait comme les quatre copies qu'elle remplace) et interdit à un
        cinquième chemin de réénumérer les colonnes. Discrimination prouvée : retirer
        `ville` fait tomber deux tests.
      · **`colonnesSeed` exclut `perimeeLe`** : la synchro ne l'écrivait pas, et l'écrire
        ressusciterait les offres que la veille a constatées fermées. Une unification de
        colonnes peut changer un comportement par effet de bord — celui-là est nommé.
      · **Rattrapage des 40** : `/api/ingest/depot` complète la ville d'une offre déjà
        suivie au lieu de l'ignorer comme doublon. On complète, on n'écrase jamais, et le
        compte remonte au rapport (`villesCompletees`). **Le prompt de la Routine est
        inchangé** — c'était la question de Marc.
      · **`construireVue` part des OFFRES.** `horsCibles` devient `sansLieu` : être hors de
        la liste de chasse n'empêche plus d'apparaître, ne pas avoir de ville si. Les deux
        manques ne se valent pas — l'un se règle à la prochaine passe, l'autre jamais sans
        que la source annonce une ville.
      · La page carte déclenche aussi `mesurerDistances` : `passeGeocodage` ne situe que
        les cibles, les employeurs de l'ingestion seraient restés « à situer » à vie.

- [x] 🎨 **`[UX-11]`** **Interface épurée** (demande Marc : « style google très épuré simple
      beau »). La FORME change, pas l'identité : ambre `#f2a31b` publié au hub et logo
      monospace conservés. Ombres douces à la place des bordures, onglets en pastilles,
      recherche en pill qui se soulève au focus, filtres en chips, cartes qui s'élèvent au
      survol. Variantes de thème sombre explicites — un noir translucide y disparaît.

- [x] 🔧 **`[CARTE-02]`** **Correctifs du panel sur `[CARTE-01]`** — quatre défauts réels,
      dont le même bug une cinquième fois (`empreinteSeed` ignorait `ville`), deux `after()`
      qui tournaient en parallèle vers Nominatim (mesuré : `p-queue` par défaut = `Infinity`),
      un gate de travail de fond qui ne convergeait pas, un bouton qui annonçait un compte
      que le clic ne pouvait pas honorer, un doublon d'épingle, et l'extraction du rattrapage
      de ville en fonction pure testée. Détail dans le message de commit.

- [x] 🔧 **`[MIGR-01]`** **Deux chemins de lecture, un seul applique les migrations.**
      *Livré le 2026-08-05.* Une conséquence RÉELLE avait été sous-estimée à l'écriture du
      ticket : sur une base neuve, une instance froide dont la première requête est le
      sondage du hub lève « table offers absente » — le hub afficherait une PANNE là où la
      réponse honnête est « en construction », ce que le §6 bis distingue explicitement.
      Le test verrouille l'ORDRE (migrer après avoir lu ne répare rien), pas l'appel ;
      discrimination prouvée en déplaçant l'appel après le `select`.
      *Description d'origine :*
      `lireOffres` appelle `assurerMigrations` ; `getTrackerState` (le endpoint hub) fait un
      `db.select()` direct et ne l'appelle pas. Sans conséquence aujourd'hui — le hub ne lit
      aucune colonne récente — mais le jour où une migration ajoutera une colonne qu'il lit,
      un déploiement dont SEUL le hub est appelé échouerait jusqu'à la première visite de
      Marc. Constaté le 2026-07-31 en cherchant si la migration 0005 pouvait s'appliquer
      sans intervention : elle ne le peut pas par ce chemin.

- [x] 🔧 **`[DIST-03]`** **La passe de fond était affamée par son propre déclencheur.**
      *Livré le 2026-08-05*, en réponse à « j'ai toujours pas toutes les adresses pourtant
      les trajets maps marchent ». Les pages déclenchaient sur « une offre n'a pas de
      distance » — un gate qui se referme au moment exact où les trajets se mettent à
      marcher, alors que le rattrapage des adresses et la mesure des bornes vivent dans la
      MÊME passe. Il ne restait que le cron nocturne, six entreprises par nuit.
      `lib/travaux.ts` (pur) porte désormais la décision, partagée par les trois
      déclencheurs ET par la passe elle-même — les filtres SQL sont remplacés par le même
      prédicat. Délai de retente de 24 h pour que le gate CONVERGE malgré les adresses
      introuvables. Vérification avant réservation, sinon le créneau partagé se brûle à vide.
      Et une trace par passe, même vide, comptée en X/Y : c'est l'absence de cette trace qui
      rendait le défaut indiagnosticable.

- [x] 🔎 **`[SRC-01..05]`** **Chercher une source d'offres qui existe vraiment.**
      *Clos le 2026-08-05 — les sept sont MORTES, mesurées.* Verdict complet en tête de
      `scripts/sonder-ouvert.ts`. Les deux jeux Données Québec nommés « Offres d'emploi »,
      dernière piste ouverte, sont ceux des villes de **Laval** et de **Montréal** : leurs
      propres postes, à 250 km. Il n'existe aucun jeu de données provincial d'offres. Le
      seul canal qui produit est le dépôt, dont le prompt est désormais versionné
      (`docs/ROUTINE-DEPOT.md`) au lieu de vivre uniquement dans la Routine de Marc.

- [x] 🔧 **`[DIST-02]`** **`lib/distances.ts` ne connaît pas les alias d'entreprise.**
      *Livré le 2026-07-31* : la règle vit dans `lib/employeurs.ts` (`apparier`, `positionDe`)
      et les trois consommateurs l'appellent. Discrimination prouvée — les deux tests de
      non-régression tombent sur l'ancienne comparaison littérale. Deux culs-de-sac fermés
      dans la foulée : la ville est saisissable à l'ajout manuel (une offre hors cibles était
      insituable à vie), et le rattrapage de ville s'applique aussi à la veille quotidienne.
      *Description d'origine :*
      `construireVue` rapproche « Laserax » et « Laserax inc. » (`apparier`), mais
      `employeursASituer` et `planifierDistances` comparent les noms LITTÉRALEMENT. Une
      offre dont l'employeur est déjà situé sous son nom canonique peut donc être
      re-géocodée sous son autre nom — un appel Nominatim inutile et une ligne dupliquée
      dans `entreprises_lieux`. Rien de faux à l'écran, mais contraire à l'usage parcimonieux
      qu'impose le garde-fou n°4. Le vrai correctif est une source unique d'appariement
      partagée entre la carte et les distances — pas une seconde copie de `apparier`.
      *(Trouvé par le panel du 2026-07-31, mesuré ; pré-existant à `[CARTE-01]`.)*

- [x] 🔧 **`[UX-12]`** **Brancher le suivi des relances à l'interface.** *Livré le 2026-07-31* —
      et la vraie trouvaille était ailleurs : `lib/aFaire.ts` portait une SECONDE règle de
      relance qui ne surveillait que `CVenvoye`, donc une candidature déjà relancée
      disparaissait à jamais des suggestions. Les deux modules sont consolidés. `lib/relances.ts`
      est livré et testé (seuils 14 j / 45 j, `Relance` n'est PAS une réponse du recruteur,
      une date future est une saisie en cours et non un envoi) — mais **rien ne l'affiche**.
      Une logique juste que personne ne voit ne suit rien.

- [ ] 🧭 **`[UX-05]`** **Onglet agrégateur multi-sources** avec lien direct vers l'offre.
      ⚠️ **Se heurte au garde-fou n°4 (aucun scraping).** État réel des sources :
      · **Guichet-Emplois** — flux XML officiel d'EDSC, sur demande. C'est la source
        légale la plus large pour le Québec. Déjà prévu en `[V4-01]`.
      · **Indeed** — API officielle réservée aux partenaires. ⚠️ Un connecteur Indeed
        existe dans la session Claude de Marc : utilisable pour **rafraîchir le seed** au fil
        des sessions, mais il ne tourne PAS dans l'app déployée. Distinction à ne pas perdre.
      · **LinkedIn** — **pas d'API publique d'offres**, et le scraping est interdit par ses
        conditions et activement bloqué. À écarter tant qu'aucune voie légale n'existe :
        un pipeline qui casse en permanence et expose le compte n'est pas une feature.
      · **Jobillico / Emploi-Québec** — à vérifier (flux RSS ou API éventuels).
      → Trancher par ADR quelles sources sont retenues, et **dire dans l'interface d'où
      vient chaque offre** : une liste qui mélange des sources sans le montrer laisse croire
      à une exhaustivité qu'elle n'a pas.

---

## Chantier #07 — Connecteur MCP pour claude.ai ✅

> Cadré par **ADR-0011** (décision Marc, 2026-08-19). ⚠️ Ce chantier **amende le garde-fou
> n°2** : l'écriture depuis une conversation est une exception nommée, bornée par quatre
> conditions. Toute PR qui en retire une rouvre le trou que le garde-fou fermait.

- [x] **[MCP-01]** Les outils, purs et testables sans réseau ni SDK. `lib/mcp/vue.ts` (forme
      publiée composée CHAMP PAR CHAMP), `lecture.spec.ts` (recherche/offre/résumé, filtres
      Zod avec `.finite()`), `ecriture.spec.ts` (via `appliquerModification`, avant/après
      rendu, refus sur offre périmée). 32 tests. `tests/mcpSurface.test.ts` verrouille la
      frontière (pas de SDK, pas de base, pas de coordonnée), 3 discriminations prouvées.

- [x] **[MCP-02]** Le serveur MCP et son transport HTTP. `lib/mcp/serveur.ts` (seul fichier
      autorise a importer le SDK — l'exception est NOMMEE dans `mcpSurface.test.ts` et
      verifiee DANS LES DEUX SENS), `app/api/mcp/route.ts` (transport Web-standard, sans
      etat, reponses JSON). Quatre outils. 13 tests par un VRAI client MCP — appeler un
      handler contournerait la validation du SDK. Garde provisoire `MCP_TOKEN`, a RETIRER
      dans le meme commit que MCP-03 (sinon second chemin d'entree sur la meme surface).

- [x] **[DATE-01]** Deux dates ecrites en UTC, trouvees en ecrivant MCP-02 : `modifierOffre`
      (date d'envoi) et `lib/cv/actions.ts`. Mesure : un CV marque envoye a 20 h 30 le 19
      aout etait enregistre au 20. Les deux passent par `aujourdhui()` de `lib/ajout.ts`, et
      `tests/datesEcrites.test.ts` scanne la classe — en DISCRIMINANT l'horloge fraiche
      (interdite) d'une date deja donnee par une source (legitime). Regression prouvee.

- [x] **[MCP-03]** OAuth 2.1 complet. `lib/mcp/oauth.ts` (logique pure : redirect_uri jugee
      par `new URL()` + hote EXACT + rejet de l'userinfo, PKCE S256, empreintes, expiration),
      `lib/oauthStore.ts` (etat, HORS de lib/mcp/ pour que le garde de frontiere reste
      absolu), cinq routes, migration 0019. `/oauth/authorize` reste derriere la garde de
      session — c'est le login Google de l'app qui authentifie Marc. `MCP_TOKEN` RETIRE dans
      le meme commit, comme promis. ⚠️ Les deux chaines d'attaque de FinanceAI sont dans les
      tests et font tomber la version fautive. Usage unique et rotation prouves sur une VRAIE
      Postgres (PGlite) : deux echanges simultanes, un seul gagne — le motif naif en fait
      gagner deux. Aucun nouveau secret a configurer.

- [x] **[MCP-04]** Branche dans claude.ai et VERIFIE PAR UNE CONVERSATION REELLE le
      2026-08-19 — le seul signal qui compte, un deploiement vert ne prouvant rien (lecon
      payee trois fois ici). Mesure sur les vraies donnees : `resume_suivi` rend 193 offres
      suivies / 100 perimees / meilleure note 88 ; `chercher_offres` rend les offres notees,
      avec `tronque: true` sur 110 correspondances a 75+. Les quatre outils repondent.
      ⚠️ Deux defauts trouves en essayant de le faire marcher, et invisibles autrement :
      (a) un enregistrement legitime rendait 500 SANS CORPS — les routes OAuth n'appelaient
      pas `assurerMigrations`, et aucun test ne pouvait le voir (la suite tourne sur PGlite,
      ou le harnais applique les migrations lui-meme) ; (b) le SDK refuse de reutiliser un
      transport sans etat, ce qui posait la vraie question — sans etat le serveur ne se
      souvient jamais d'avoir ete initialise, donc `tools/list` DOIT marcher sur un serveur
      neuf, sinon seul le premier echange fonctionnerait. Verifie.

---

## Chantier #06 — Précision de la veille ⬜

> Cadré par **ADR-0005**. Ordre imposé : la profondeur AVANT le volume (décision Marc,
> 2026-08-11). Mesure de départ : 20 des 22 offres du 11 août notent **68**, et 68 est
> exactement la note d'un titre sans description — 30 de ces points viennent de ce qu'on
> ignore.

- [x] **[VEILLE-39]** Ingestion du **flux XML du Guichet-Emplois en streaming**
      (`lib/ingest/guichetFlux.ts`, 29 tests, `app/api/diagnostic/flux-guichet`). Le flux
      pèse ~134 Mo : le module lit par morceaux, découpe dès qu'une offre est complète, la
      juge, la jette si elle est hors région — le pic mémoire dépend de la taille d'UNE
      offre, jamais du flux. Quatre fins distinctes, dont `tampon-deborde` qui est une PANNE
      et jamais un vide. Discrimination prouvée en cassant le code quatre fois.
      ⚠️ **Le format des champs est une HYPOTHÈSE** (échantillon tronqué, hôte inaccessible
      depuis la session) : d'où `recenserBalises` et la route de diagnostic. **Rien n'est
      branché sur la passe** tant que le recensement n'a pas été lu. Voir ADR-0010.

- [x] **[VEILLE-41]** Les trois defauts trouves par le PREMIER PASSAGE REEL du flux Guichet.
      (a) Le recensement rendait un ENSEMBLE sur 20 offres — il ne distinguait pas « champ
      absent du format » de « champ absent de ces offres-la », et m'a presque fait conclure
      que le flux n'a pas de ville. Refait en COMPTES sur 2000 offres + mesure jumelle
      `champsRenseignes`. (b) `&apos;` non decodee dans `texteSimple` : `L'Islet` et
      `Saint-Pierre-de-l'Ile-d'Orleans`, DEUX villes de la region, tombaient en « lieu
      inconnu » (mesure). Corrige avec les entites numeriques ; `&amp;` decodee en dernier.
      (c) Plafond de retenues atteint a ~42 % du flux : aucun compte n'etait concluant.
      500 -> 5000. Quatre discriminations prouvees.

- [x] **[VEILLE-43]** Inventaire des VALEURS du flux Guichet (`Inventaire` dans
      `guichetFlux.ts`, borne 400 classes/champ avec `(autres)` dit, cable dans la route de
      diagnostic). La passe COMPLETE a montre 11 champs presents sur 100 % des offres et
      inutilises — dont `noc2021` (classerait une offre SANS mots-cles, donc sans le probleme
      bilingue), `postalcode` (lieu exact, pas de geocodage, pas d'homonyme) et
      `salary`/`education`/`experience` (ce que le bareme compte comme « inconnu »). Savoir
      qu'une balise existe ne dit pas ce qu'elle porte : on compte les valeurs AVANT de s'en
      servir. Trois discriminations prouvees.

- [x] **[NOC-01]** Cadrage et instrument de mesure du tri par code de profession
      (**ADR-0012**). `lib/nocProfession.ts` : lecture PURE d'un code, aucune semantique
      devinee — le module ne sait pas ce qui interesse Marc et ne doit pas le savoir. TROIS
      verdicts (`retenue` / `ecartee` / `code-illisible`) : un aveu n'est pas une decision,
      et les confondre ferait passer un defaut de la SOURCE pour un tri qui fonctionne.
      Comparaison ancree (2 chiffres ou 5), jamais un `startsWith` — un prefixe d'un chiffre
      avalerait tout un domaine, niveaux 4 et 5 compris. 11 tests, 3 discriminations prouvees.
      + la table de DECISION dans le diagnostic : par code, le compte ET des titres reels
      distincts, sur les offres REGIONALES seulement. RIEN n'est branche sur le pipeline.

- [x] **[NOC-02]** Choisir la liste des codes retenus, **sur la table mesuree**. ✔ REVISE
      le 2026-08-19 : elle ne vit PAS dans `lib/profil.ts` mais dans l'ETAT
      (`lib/metiersRetenus.ts`, cle `veille-metiers`), reglable par Marc depuis l'app — meme
      raison que le rayon : une constante de code exige un commit, donc moi, pour chaque
      correction. ✔ LIVRE : l'ecran `/sources` mesure le flux (bouton), affiche chaque code
      avec son compte ET des titres REELS (un compte seul ne se tranche pas), et Marc coche.
      `lib/metiersMesure.ts` (PUR) fait la lecture du rapport ; une lecture PARTIELLE est
      dite comme telle et jamais presentee comme une mesure. **La dependance a une session
      Claude est supprimee** : c'etait tout l'objet de la demande.
      ✔ **TABLE MESURÉE le 2026-08-20**, sur une lecture qui va au bout
      (`fin: "flux-termine"` — seule fin qui autorise à conclure) : 40 911 offres vues,
      0 illisible, **1 290 régionales**, 5,1 s. **37 classes** à 2 chiffres, **204 codes**
      à 5 chiffres sur la population régionale.
      Les dix premières classes pèsent **1 037 offres sur 1 290, soit 80 %**, et leurs
      titres réels se lisent sans barème : 63 cuisinier/coiffeur (149) · 65 laveur de
      voitures/aide-cuisine (147) · 72 soudeur/peintre (129) · 62 superviseur de commerce
      et restauration rapide (125) · 94 opérateur de machine (122) · 95 manœuvre (78) ·
      85 aménagement paysager (76) · 73 camionneur (73) · 75 aide (71) · 60 gérant de
      restaurant (67).
      **Ce qui correspond au profil de Marc tient dans quatre classes, 45 offres, 3,5 %** :
      **70** cadres des métiers et de la construction (4 — « project manager, construction »,
      « construction project coordinator », « construction general superintendent ») ·
      **92** surveillants en transformation (7 — « production supervisor - food and beverage
      processing », « chemical unit foreman », « production supervisor – plastic
      manufacturing ») · **22** personnel technique (24) · **21** professionnels en sciences
      appliquées (10). En lecture large, en ajoutant la coordination administrative
      (13 : 29, 12 : 14, 10 : 5) et la supervision hors industrie (82 : 4) : **97 offres,
      7,5 %**.
      ⚠️ **Recommandation, pas décision** : cocher `70`, `92`, `22`, `21` donne une source
      qui rend ~45 offres par passe au lieu de 1 290 — c'est le point de [VEILLE-44]. Les
      classes larges (`13`, `12`) sont à essayer une passe puis à retirer si elles ramènent
      des adjointes administratives. La décision reste celle de Marc, l'écran est là pour ça.
      ⚠️ **Une classe à 2 chiffres n'est pas un métier** : `22` mélange technicien réseau,
      dessinateur et technologue en architecture. Descendre au code à 5 chiffres se fait sur
      la même table, deuxième tableau de l'écran.

- [x] **[NOC-03]** Brancher le filtre sur l'ingestion du flux Guichet, avec le compte des
      ecartees PAR CODE (compter ne suffit pas, il faut nommer l'objet). ✔ Livre :
      `lib/ingest/sourceGuichetFlux.ts`, branche par `selectionnerSources` **hors rotation**
      et seulement si la liste de metiers est non vide. Les refus partent a l'ecran par
      `ResultatSource.note`. Non-regression : la source est INERTE par defaut (liste vide),
      donc aucune offre existante ne change de note — verifie par test, pas suppose.

- [x] **[ROUTINE-01]** ✅ **TRANCHÉ PAR MARC le 2026-09-17 : la Routine est GARDÉE.** La
      mesure des deux côtés lui a été reposée (source alignée à ~64 % coordination/technique
      contre un Guichet large à filtrer) ; il garde le complément. L'app permet toujours de la
      supprimer — l'item se ferme comme décision prise, pas comme travail fait.
      ⚠️ **Supprimer la Routine est POSSIBLE, et ça coûte la source la
      plus alignée sur le profil — arbitrage de Marc, mesuré des deux côtés (2026-08-20).**
      Ce qu'elle dépose, passé au barème lui-même (268 offres distinctes sur
      9 lots) : **54 % coordination seule, 4 % la combinaison visee, 6 % technicien, 5 %
      technique seule, 32 % hors sujet** — donc ~64 % portent une dimension coordination ou
      technique. C'est une source ALIGNEE sur le profil. Titres reels : « Coordonnateur
      Fiabilite Maintenance », « Superviseur de production », « Surintendant ».
      L'echantillon regional du Guichet (les 15 PREMIERES retenues — un prefixe, pas un
      tirage ; confirme depuis par la table complete, voir plus bas) donnait *sod layer*,
      *car washer*, *hairstylist*, *kitchen helper*. Trois employeurs du Guichet cherches dans le suivi : 0/3 presents.
      ⚠️ **DEMANDE MARC 2026-08-19 : « je veux la supprimer, fais en sorte que je puisse ».**
      Ce que l'app NE PEUT PAS reprendre : la part Indeed (garde-fou n°4 + conditions
      d'Indeed — la Routine passe par le connecteur officiel, l'app n'y a pas accès).
      Supprimer la Routine, c'est donc CHANGER DE SOURCE pour le flux complet du Guichet.
      **Le chemin est ouvert et livré** ([NOC-03] la source, [NOC-02] l'écran) : Marc peut
      supprimer la Routine sans que l'app cesse de fonctionner. La question n'est plus
      « est-ce possible » mais « qu'est-ce qu'on perd ».
      ✔ **CE QUI MANQUAIT EST MESURÉ (2026-08-20, lecture complète du flux).** Le point (a)
      est clos : mon échantillon Guichet n'était plus les 15 premières mais les 1 290
      régionales d'une passe qui va au bout. Le résultat est net et il ne va pas dans le sens
      que Marc espérait : **45 offres sur 1 290, soit 3,5 %**, tombent dans les classes qui
      portent son profil ; 80 % de la population régionale est cuisinier, laveur de voitures,
      soudeur, manœuvre, camionneur (table dans [NOC-02]). Le dépôt de la Routine, lui, était
      mesuré à **~64 % portant une dimension coordination ou technique**.
      ⚠️ **Ces deux pourcentages ne sont PAS mesurés au même instrument** — 64 % vient du
      barème appliqué à des titres français, 3,5 % de la distribution NOC ; le point (b)
      reste vrai, aucun instrument commun n'existe. **Mais la conclusion n'en dépend pas** :
      elle tient sur les VOLUMES ABSOLUS et sur des titres réels lisibles sans barème. Une
      passe du Guichet rend quelques dizaines d'offres du bon domaine, pas quelques
      centaines.
      **RÉPONSE : le flux du Guichet est un COMPLÉMENT utile, pas un REMPLAÇANT.** Supprimer
      la Routine est faisable et ne casse rien ; ça coûte la source la plus alignée sur le
      profil, contre une source qu'il faut filtrer à 3,5 % pour être lisible. C'est un
      arbitrage, il appartient à Marc — l'app ne l'empêche plus dans les deux sens.
      ⚠️ Ce que la mesure NE dit pas : la redondance entre les deux sources reste inconnue
      (aucune offre du Guichet n'a été retrouvée dans le suivi, mais sur 3 employeurs
      cherchés — c'est une indication, pas une mesure). Et [VEILLE-32]/[VEILLE-34] restent
      le vrai verrou pour EXPLOITER le Guichet : **le barème est monolingue face à des
      titres anglais**, ce que la table complète confirme — les 37 classes rendent des
      titres anglais y compris sur des offres dont la langue de travail est « Français ».

- [x] **[NOTE-01/02/03]** ⚠️ **DEMANDE MARC 2026-08-20 : « je veux que la note de chaque
      offre soit plus précise, comme ça ça me propose jamais une offre pas de mon domaine
      avec une bonne note »**, et « je veux voir toutes les offres dispos, genre 1 300 ».
      **ADR-0013** (D1 facteur de domaine · D2 plancher NOC · D3 mode d'ingestion à trois
      états · D4 vocabulaire bilingue), protocole §8 tenu : ADR, puis audit, puis code.
      Le défaut MESURÉ : `scoreFitRole` rendait `horsSujet` — 8 sur 40, CONSTAMMENT — sur
      tout titre anglais, donc 40 % du barème inerte et un classement décidé par la distance.
      Avant : `supervisor - retail` 59 > `construction project coordinator` 53 >
      `production supervisor` 49. Après : 28 · 73 · 69.
      Audit : D1+D2 déplacent **0 offre sur 53** (mutation : 53/53) ; D4 en déplace 7
      (`Project Manager` 48 → 68), zéro dépassement de note manuelle, zéro faux positif.
      ⚠️ **L'audit a corrigé la décision** : « supervisor » nu faisait remonter
      `supervisor - retail` à 76 — les termes ont été qualifiés avant toute ligne de code.
      ⚠️ **Ce qui n'est PAS réglé** : `Project Engineer`, `Mechanical Engineer`,
      `Ingénieur intégrateur` restent à 48. C'est CORRECT (un ingénieur n'est pas un poste de
      coordination) mais le barème reste muet sur cette part du seed, par construction.
      ⚠️ **Reste à faire côté Marc** : allumer « toute la région » dans `/sources` et cocher
      ses codes. Rien ne se déclenche tout seul — le défaut reste `eteint`.

- [x] **[NOTE-04]** ✅ **Clos à l'audit du 2026-09-17 : le mode « toute la région » TOURNE, et depuis un mois.** Il a tourné tous les jours depuis le 2026-08-20 — mesuré ce jour `ingérées=8/1600`, `doublons=1548`, sur 1 635 offres suivies. Ce qui restait « à vérifier sur la première passe » l'a été par un mois d'exploitation. ⚠️ **Le mode « toute la région » n'a JAMAIS tourné en vrai.** Les bornes
      sont posées (plafond 1 600, `maxDuration` 300 s, insertions par lots de 200) et le
      raisonnement est écrit, mais aucune passe réelle n'a encore ingéré 1 300 offres. Ce qui
      reste à VÉRIFIER sur la première passe, et qu'aucun test ne peut prouver : la durée
      réelle de la fonction, le comportement de la péremption quand la population décuple, et
      le géocodage de ~1 300 employeurs à 1,1 s vers Nominatim — qui s'étalera sur des jours
      et n'a pas de raison d'être un problème, mais n'a jamais été observé à cette échelle.
      Lire le compte rendu de `/sources` après la première passe en mode « tout ».

- [x] **[CARTE-G]** ⚠️ **Plan carte Google (ADR-0016), 7 lots — decisions Marc 2026-08-21,
      cles posees (2 cles, perimetres separes).** A: fond Google + approximatives VISIBLES
      (epingle distincte) + domicile + repli Leaflet DIT. B: trajet au clic (Routes,
      serveur, cache en base). C: matrice de durees nocturne (badge minutes par epingle).
      D: filtres de l'accueil sur la carte. E: bandes de duree (pas d'isochrone vraie :
      Routes n'en fait pas, une grille couterait des centaines d'appels — les bandes donnent
      la meme decision pour presque rien). F: tournee multi-entreprises (waypoints
      optimises). G: densite ponderee par note (local, zero API). Gardes : cache en base
      pour TOUT appel Routes, compteur d'appels/jour avec refus DIT, test anti-fuite de la
      cle serveur, Places DEJA paye reutilise (placeGoogleId/siteWeb/horaires en base).
      « Toutes les API » NON : on reste sur les 4 des cles restreintes — chaque API en plus
      est une surface d'abus en plus.
      ✔ LIVRE le 2026-08-21, six lots en six commits (A f6b795c, B 9ed50a7, C 3997555,
      E f0b7c8f, F 8b72f9f, G ci-dessous). D etait DEJA livre par l'existant (CarteFiltrable
      applique les filtres de l'accueil) — verifie avant de coder, pas recode. Ecarts
      assumes et ecrits : pas de clustering (40 epingles), pas de cache de tournee (geste
      ponctuel, borne par le budget), bandes de duree au lieu d'isochrones (Routes n'en
      fait pas ; meme decision pour un cout nul). ⚠️ RESTE A VERIFIER EN PROD, par Marc :
      la carte charge avec la cle client, le trajet trace au clic, la matrice remplit les
      durees a la prochaine passe. Rien de tout ca n'a tourne contre les vraies cles.

- [x] **[VEILLE-44]** ✅ **Clos à l'audit du 2026-09-17 : tranché par l'usage.** Le flux est branché, le tri se fait par les codes de profession retenus (ADR-0013) et par la note, pas par le volume. Le tableau n'a pas été noyé : 17 offres ouvertes notées 60+. ⚠️ **DECISION MARC : 1 300 offres regionales par passe** (mesure sur
      une passe complete), contre quelques dizaines suivies aujourd'hui. L'echantillon reste
      domine par des postes peu qualifies. Brancher la source telle quelle noierait le
      tableau. Le volume n'est pas le sujet, le TRI l'est — et `noc2021` est le premier
      candidat serieux. A trancher sur l'inventaire de valeurs, pas avant. Bloque
      [VEILLE-40].

- [ ] **[BORNES-03]** ⚠️ **L'enveloppe de `[BORNES-02]` a réglé la FAMINE, et découvert la
      panne qu'elle cachait.** Passe du 2026-09-17 19:41:30 : `[bornes] 1/1 grappe(s)
      interrogée(s)` — l'étape DÉMARRE enfin, ce qu'elle ne faisait plus depuis deux jours.
      Mais : `grappe de 7 lieu(x) non mesurée : This operation was aborted · This operation was
      aborted · fetch failed` et `0 lieu(x) mesuré(s)`. Le problème n'est donc plus le budget
      mais l'appel Overpass lui-même (abandon + échec réseau). ⚠️ Ne pas conclure d'ici que
      l'enveloppe était inutile : elle a fait passer l'étape de « jamais lancée » à « lancée et
      en échec », ce qui est justement ce qui rend la panne VISIBLE. Trouvé en chemin en
      vérifiant `[VEILLE-42]` — **signalé, non corrigé**, hors périmètre demandé.
      ✅ **CORRIGÉ le 2026-09-17 sur demande de Marc (« corrige les bornes »)**, en deux
      parties — parce que l'enquête a trouvé un SECOND défaut, le mien :
      1. **La patience passe de 15 à 25 s.** Ce qui absorbe la FILE D'ATTENTE d'Overpass est
         l'écart entre notre patience et le budget d'exécution accordé au serveur ; il était
         de 3 s, soit le PLANCHER que son propre test impose. C'est la même signature qu'en
         août. 25 s est le PLAFOND que `BUDGET_PASSE_PAGE_MS` (35 s) autorise — pas un chiffre
         rond : l'assertion est désormais exactement à son seuil, et la prochaine hausse
         forcera à trancher « les bornes sont le travail du seul cron de veille ».
      2. ⚠️ **L'enveloppe de `[BORNES-02]` était accordée à des chemins qui ne peuvent pas la
         payer — défaut introduit par moi.** Elle était lue EN DUR dans
         `executerVeilleComplete`, sous un commentaire affirmant « seul le cron de veille
         l'accorde, son mur est à 300 s ». Faux : cette fonction a TROIS appelants, dont le
         cron de GÉOCODAGE (60 s) et le bouton de `/sources` (60 s). Le test censé l'interdire
         scannait le fichier de la route de géocodage — qui ne nomme pas la constante, il
         APPELLE la fonction qui la lisait : **vert, et aveugle**. L'enveloppe est désormais un
         paramètre passé par la route qui connaît son propre mur.
      Le journal d'échec porte maintenant l'étendue de la boîte et le temps d'abandon : « le
      service fait la queue » et « notre boîte est trop grande » rendaient le MÊME message et
      appellent des remèdes opposés.
      ⚠️ **Conséquence à savoir** : le bouton de `/sources` ne mesure plus les bornes (il
      retombe sur le reliquat du budget partagé, comme avant `[BORNES-02]`). C'est le cron de
      veille nocturne qui fait ce travail.
      ✔ **Moitié 2 VÉRIFIÉE en prod le 2026-09-17 à 20:11:47** (passe relancée par Marc) :
      `[bornes] 0/1 grappe(s) interrogée(s)`, aucune ligne d'échec, `budget restant=1346 ms`.
      L'étape a REFUSÉ de partir — c'est le succès, pas la panne : plus d'enveloppe sur ce
      chemin, donc plus de risque d'atteindre le mur de 60 s. Et le bouton ne peut PAS porter
      les bornes : la passe de distances a consommé 33,6 s de ses 35 s, une enveloppe vaut
      désormais 30 s, soit ~64 s pour la seule étape contre un mur de 60. Ça ne se règle pas,
      ça ne rentre pas.
      ✅ **CLOS EN EFFET le 2026-09-18 à 11:31:50 UTC** — passe `cron-veille`, première mesure
      de bornes réussie depuis la famine :
      `[bornes] 1/1 grappe(s) interrogée(s) · 255 borne(s) vue(s) · 14 lieu(x) mesuré(s) ·
      marque=13/14 vitesse=4/14 tarif=3/14`, et `bornes=14/14` dans la ligne des distances.
      `[BORNES-01]`, `[BORNES-02]` et `[BORNES-03]` produisent enfin leur donnée.
      ⚠️ **MAIS LA CAUSE N'EST PAS PROUVÉE, ET JE NE LA REVENDIQUE PAS.** L'appel Overpass a
      pris **2 617 ms** — très loin des 25 s de patience, et loin même des 15 s d'avant. Cette
      passe ne démontre donc PAS que le relèvement de la patience soit ce qui a débloqué la
      mesure : l'échec du 17/09 au soir était vraisemblablement une saturation TRANSITOIRE du
      service. Ce que cette passe prouve, c'est que l'étape DÉMARRE (l'enveloppe de
      `[BORNES-02]`, elle, est bien la cause) et qu'Overpass répond vite quand il répond.
      La patience élargie reste justifiée par la marge (3 s → 13 s au-dessus du budget
      d'exécution serveur), pas par ce relevé — et c'est dit plutôt que tu.

- [ ] **[VEILLE-42]** ⚠️ **La moitie des offres quebecoises du flux tombent en « lieu
      inconnu »**, et la liste est dominee par des municipalites de l'ile de Montreal que
      `HORS_PORTEE` ignore faute de contenir « montreal » : Saint-Laurent, Cote-Saint-Luc,
      Westmount, Hampstead, Outremont, Mont-Royal, Dorval, Saint-Leonard. Chacune couterait
      une mesure Nominatim. ✔ RE-MESURE sur une passe COMPLETE : 3 366 offres en « lieu
      inconnu », soit 50,8 % des quebecoises ; le top-25 n'en couvre que 36,6 % et l'ile de
      Montreal 14,8 % — la queue est longue. ⚠️ **Le remede evident est un piege, MESURE** :
      `HORS_PORTEE` est consulte AVANT les municipalites et compare par SOUS-CHAINE, donc
      ajouter `saint-laurent` exclurait aussi `Saint-Laurent-de-l'Ile-d'Orleans`, qui est
      DANS la region. C'est [VEILLE-33]. Le vrai levier est `postalcode` ([VEILLE-43]) :
      une region de tri ne connait pas d'homonyme et ne coute aucune requete.
      ✔ **RE-MESURE 2026-08-20 sur un flux reconstruit** : 3 310 en « lieu inconnu » sur
      6 531 québécoises, soit 50,7 % — contre 3 366 / 50,8 % la veille. **La proportion est
      structurelle, pas un artefact d'un jour** : c'est ce qui justifie d'y mettre le
      travail de [VEILLE-43] plutôt que d'attendre qu'elle se résorbe.
      ✔ **INSTRUMENT LIVRÉ le 2026-09-17, la RÈGLE reste à écrire.** Le remède annoncé — trier
      par `postalcode` — ne pouvait pas se concevoir : les onze inventaires du diagnostic
      portent sur les offres RETENUES, c'est-à-dire la population INVERSE de celle qu'une
      règle de tri doit trancher (« un échantillon décrit la population dont il est TIRÉ »).
      Écrire une bande postale de mémoire aurait été une table inventée, capable d'admettre en
      silence des offres lointaines. `diagnostic_flux` rend donc désormais `lettresInconnues`
      (la bande, non tronquée) et `regionsInconnues` (la région de tri, top 25) sur la seule
      population « lieu inconnu », à lire avec `verdicts["lieu-inconnu"]` pour dénominateur.
      Trois discriminations prouvées par mutation.
      ✔ **MESURE FAITE le 2026-09-17, 19:05 UTC** (`fin: "flux-termine"`, 42 856 offres lues en
      5,2 s ; `dans-la-region: 1443`, `hors-region: 2020`, `lieu-inconnu: 3683`) :
      · **100 % des non placées portent un code postal** — `(vide)` est ABSENT de
        `lettresInconnues`. Le remède est donc seulement APPLICABLE, ce qu'aucune mesure ne
        disait jusqu'ici.
      · Bandes : **J 1776 (48,2 %) · G 1207 (32,8 %) · H 696 (18,9 %) · E 2 · A 2**.
      · ⚠️ **CONTRE-MESURE, et elle change le remède** : l'inventaire `postalcode-lettre` des
        offres RETENUES (1 443) donne **G 1399, J 43, H 1**. Quarante-quatre offres RÉGIONALES
        portent donc un code hors bande — l'employeur y met son siège, pas le lieu de travail.
        Un rejet franc par bande posé AVANT la liste blanche les perdrait TOUTES.
      · Et `G` ne se rejette pas : c'est la bande de la région elle-même (1 399 des 1 443).
      ⚠️ **CE QUE LE REJET GAGNERAIT N'EST PAS CE QU'ON CROIT.** Les 3 683 non placées sont
      DÉJÀ hors ingestion (`garder` ne retient que `dans-la-region`) : une bande ne changerait
      rien à ce qui entre. Ce qu'elle économise, ce sont les MESURES Nominatim du registre des
      lieux — et ce qu'elle risque, c'est de figer en « hors région » un nom que la mesure
      aurait placé dans la région.
      ➜ **CONCEPTION QUI EN DÉCOULE, à valider par Marc avant toute ligne** : poser le test de
      bande LÀ OÙ `resolus` est consulté — après `HORS_PORTEE` et après la liste blanche, à la
      place du recours Nominatim. Les 44 offres J/H restent alors acceptées PAR LEUR NOM, et la
      bande ne tranche que pour les noms que personne ne connaît. Coût : `situer` doit recevoir
      le code postal, qui vit dans le bloc BRUT — changement de signature sur tous ses
      appelants, donc un lot à part et un ADR.
      ✅ **RÈGLE LIVRÉE le 2026-09-17 (ADR-0018), sur demande de Marc « fais la règle de bande ».**
      Le contraste a été mesuré d'abord (`lettresHorsRegion`, la bande des offres jugées
      lointaines PAR LEUR NOM — verdict indépendant du code postal, donc non circulaire) :
      | bande | dans-région | hors-région | décidables | part régionale |
      |---|---|---|---|---|
      | G | 1 401 | 390 | 1 791 | 78,2 % |
      | J | 43 | 884 | 927 | 4,6 % |
      | H | 1 | 745 | 746 | **0,13 %** |
      **Une seule bande passe le critère** (≥ ~500 décidables ET part régionale < 1 %) : `H`.
      `J` est refusée malgré ses 1 784 offres — parier contre une régionale sur vingt-deux
      coûte une offre que Marc ne verra jamais, et rien ne signalera son absence.
      La bande est lue **EN DERNIER**, après la liste noire, la liste blanche, le registre
      mesuré et le repli sur la description : coût NUL par construction sur les 44 offres
      régionales à code hors bande, qui sont acceptées par leur nom bien avant.
      Gain : **707 offres/passe (19,1 %)** cessent de disputer les 40 places de
      `MAX_LIEUX_INCONNUS_FLUX`. ⚠️ Le gain en PLACES est borné par le nombre de NOMS distincts
      parmi ces 707, que l'instrument ne mesure pas — non annoncé comme un gain.
      ✅ **EFFET VÉRIFIÉ EN PRODUCTION le 2026-09-17 à 19:41:30 UTC** (passe lancée par Marc
      depuis `/sources`, déploiement `cfc9b36`), avec contrôle négatif : `mont-royal×6` et
      `pointe-aux-trembles×4`, présents en « lieu inconnu » à l'audit du matin (ligne 2255
      ci-dessous), ont DISPARU ; `sherrington×5` — que la règle ne vise pas — est inchangé au
      compte exact. C'est lui qui fait la preuve : seules, deux disparitions s'expliqueraient
      par une passe différente. `hors-région` 4 → 6, `lieu-inconnu` 40 → 39.
      `saint-michel×3` reste en lieu inconnu — le cas d'homonymie que la règle devait éviter
      d'écraser, et qu'elle n'a pas écrasé.
      ✔ **TENUE CONFIRMÉE le 2026-09-18 (passe `cron-veille`)** : la liste nommée des lieux
      inconnus ne porte toujours AUCUN nom de l'île de Montréal, et `saint-michel×3` y est
      encore — l'homonyme n'est toujours pas écrasé. Trois passes, trois fois le même verdict.
      ✅ **`J` TRANCHÉ PAR MARC le 2026-09-17 : on ne la rejette pas.** 48 % de la queue
      restent donc non triés, et c'est une décision, plus une question ouverte — 4,6 % de part
      régionale, soit une offre sur vingt-deux qu'on ne verrait jamais disparaître. Rouvrir
      demanderait une mesure neuve, pas une préférence.

- [x] **[VEILLE-40]** ✅ **Fait, vérifié à l'audit du 2026-09-17** : `selectionnerSources` pousse `sourceGuichetFlux(flux).source` (lib/ingest/passe.ts), et la production le confirme (`sources=2`, `ingérées=8/1600`). Les conditions posées ici ont été tenues — `[VEILLE-32]` livré, passe complète obtenue. Brancher le flux Guichet sur `selectionnerSources`, **après** une
      passe de diagnostic qui rend `flux-termine` (celle du 19 août s'est arrêtée sur
      `plafond-retenues`, donc aucun de ses comptes n'était concluant) — et **après**
      [VEILLE-32]/[VEILLE-34] : les titres du flux sont en ANGLAIS, un barème monolingue
      les noterait tous à zéro. Trois choses à vérifier d'abord, dans cet
      ordre : `balisesVues` (les champs supposés existent-ils ?), `verdicts` +
      `villesInconnues` (le registre des lieux sait-il placer ce que le Guichet nomme ?), et
      l'échantillon à l'œil. ⚠️ `Source.interroger` reçoit un `Recuperateur` (qui rend du
      TEXTE, donc chargerait les ~134 Mo) : le branchement devra passer le `fetch` brut, pas
      élargir `Recuperateur`. Le dépôt de fichiers reste la source active d'ici là.
      ✔ **BRANCHÉ le 2026-08-19, mais ÉTEINT par défaut** : `sourceGuichetFlux` reçoit bien
      le `fetch` brut (elle ignore le `Recuperateur` qu'on lui passe, dit dans son en-tête),
      et `selectionnerSources` ne la construit QUE si la liste de métiers est non vide. Les
      deux préalables ci-dessus tiennent donc toujours — ils décident du jour où Marc coche
      un premier code, pas du branchement.

- [x] **[VEILLE-38]** La FRAÎCHEUR du dépôt, dite (`dernierJourDepose`, `fraicheurDepot`).
      Mesuré en cherchant tout autre chose : **la veille n'a plus qu'UNE source**, le dépôt
      de fichiers. Le Guichet est désactivé (404 prouvé) et les pages carrières sont parties
      avec [VEILLE-35]. Or le dépôt lit une **fenêtre de sept jours** : le jour où aucun lot
      n'est déposé, il rend quand même ceux de la veille, tout est compté « déjà connue », et
      le rapport affiche « 0 nouvelle » — mot pour mot ce qu'il afficherait un jour sans
      embauche. Deux situations opposées, un seul affichage.
      **Prouvé de bout en bout contre le vrai dossier** (sonde, pas raisonnement) :
      le 18 août → 261 offres lues, `retard=0`, muet ; le 19 sans dépôt → 194 offres encore
      lues, `retard=1` ; le 21 → 149 offres, `retard=3`, « rompu » ; le 30 → fenêtre vide,
      `retard=null`. Sans ce champ, les quatre cas rendaient le même écran.
      Le seuil d'alerte est à DEUX jours, pas un : crier au premier matin manqué apprendrait
      à ignorer le voyant — c'est exactement ainsi que la CI de ce dépôt a été ignorée quatre
      commits d'affilée. `retardJours` est `null` (jamais `0`) quand le dépôt n'a rien rendu :
      « 0 » se lirait « à jour », alors qu'on ne sait rien.
      *Verrou* : `tests/fraicheurDepot.test.ts` (14 cas ; fenêtre et seuil dérivés des
      constantes, discriminant sur le fichier hors fenêtre, retard jamais négatif).

- [x] **[VEILLE-37]** Rayon de recherche **réglable depuis l'app** (`lib/rayon.ts`,
      `lib/actionsRayon.ts`, `components/ReglageRayon.tsx`). Le rayon était la seule valeur du
      critère n°1 de Marc qu'il ne pouvait pas toucher sans un commit — il est passé de 50 à
      75 km le 2026-08-17 par une modification du code, doublée d'un rallongement à la main de
      la liste blanche. Le découplage était déjà acquis depuis que les lieux se MESURENT
      ([VEILLE-31]) : il ne restait qu'un nombre à exposer.
      ⚠️ **La partie délicate n'est pas de régler le rayon, c'est ce qu'il PÉRIME.** Chaque
      verdict du registre des lieux a été rendu SOUS un rayon donné : « Baie-Comeau, hors
      région » veut dire « à plus de 75 + 15 km ». Le registre étant consulté AVANT toute
      nouvelle mesure, un verdict laissé en place n'aurait JAMAIS été revu : Marc aurait
      élargi son rayon et rien n'aurait changé, sans qu'aucune erreur ne s'affiche. C'est mot
      pour mot la leçon déjà consignée — « un délai de retente encode une PRÉMISSE : quand
      elle tombe, le délai doit tomber avec ». `rejugerRegistre` re-dérive donc tous les
      verdicts, et ne coûte AUCUNE requête parce que le registre stocke la DISTANCE mesurée,
      pas seulement le verdict.
      Trois détails qui ne sont pas des détails : les `introuvable` sont laissés tels quels
      (les re-juger depuis un `km` nul inventerait un verdict) ; `le` et `essais` sont
      CONSERVÉS (re-juger n'est pas re-mesurer — remettre la date à aujourd'hui ferait croire
      à une mesure fraîche) ; et le nombre de bascules est rapporté à l'écran CÔTÉ taille du
      registre, parce que « 0 bascule sur 0 lieu » et « 0 bascule sur 40 lieux » sont deux
      situations opposées. Le rayon atteint aussi la NOTE (`profilAvecRayon` →
      `scoreDistance`), pas seulement l'acceptation : sans ça le réglage ne ferait que la
      moitié du chemin. Une saisie hors bornes (5–300 km) est DITE, jamais rognée en silence.
      *Verrou* : `tests/rayon.test.ts` (12 cas, discriminant prouvé — le registre non re-jugé
      garde son verdict périmé ; bornes et marge dérivées des constantes, jamais écrites en dur).

- [x] **[VEILLE-32]** ✅ **Fait, vérifié à l'audit du 2026-09-17** : `PROFIL_DEFAUT.motsCoordination` porte désormais les deux langues (`project manager`, `project coordinator`, `project lead`, `program manager`, `team lead`, `project planner`…) à côté du vocabulaire français. ⚠️ **Le bassin de termes est bilingue, le VOCABULAIRE DE NOTATION ne
      l'est pas — et c'est le plus restrictif des deux qui gagne, en silence.** Mesuré à la
      veille du 2026-08-18, sur le lot réel : `PROFIL_DEFAUT.motsCoordination` ne contient
      que du français (coordonnateur, superviseur, chargé de projet, gestionnaire…), alors
      que le bassin de recherche est passé au bilingue le 2026-08-17 précisément parce que
      « Honeywell, Alstom, AMETEK et Domtar publient en anglais dans la région ». On cherche
      donc en anglais, on trouve en anglais, et le barème jette le résultat faute de le
      comprendre.
      ⚠️ **ÉLARGI LE 2026-08-20, ET LE TROU N'EST PAS QUE BILINGUE — IL EST AUSSI FRANÇAIS.**
      Mesuré sur les 82 offres uniques de la veille du jour, en classant chaque titre par
      `scoreFitRole` : 29 titres notent 28 (le barème les reconnaît), 53 notent 8 ou 14. Or
      **21 des titres à 8 sont clairement de la supervision ou de la gestion de projet** —
      et quatre graphies FRANÇAISES courantes manquent à `motsCoordination` :
      `surintendant`, `gérant`, `contremaître`, `chef de production`. À elles seules elles
      couvrent 15 des 21. Les 6 autres sont anglaises (`project manager`, `coordinator`,
      `director`, `supervisor`, `process lead`). Exemples réels du jour, tous notés 8 :
      Davie « Contremaître » (90-95 k$, gestion d'une équipe syndiquée), Manpower
      « Surintendant civil senior » (150-250 k$), Volvo/Prevost « Gérant(e) —
      Industrialisation », ELEM « Process engineer – project manager ».
      Conséquence directe : le plancher de note se prononce sur des titres qu'il ne SAIT PAS
      lire, et c'est indiscernable d'un jugement du poste. Ajouter ces quatre mots français
      est le geste le moins cher du lot — mais il touche `lib/scoring.ts`, donc **protocole
      §8 : ADR d'abord, audit sur les 38 offres du seed, puis code**.
      **Chiffré, pas supposé — 6 des 16 refus « sous le plancher » du 18 août** basculent
      de `fitRole 8` à `28` en ajoutant les équivalents anglais (`project manager`, `manager`,
      `supervisor`, `superintendent`, `coordinator`, `team lead`, `lead engineer`, `director`)
      à `motsCoordination`, mesure faite sur un profil en mémoire, sans toucher le fichier :

      | Offre | avant | après |
      |---|---|---|
      | Trane Technologies — Project Manager Equipment | 8 | 28 |
      | ELEM — Process engineer – project manager at Opting | 8 | 28 |
      | Davie — Leader, Project Change Control | 8 | 28 |
      | Manpower — Surintendant civil senior - Projets Hydro-Québec | 8 | 28 |
      | Primo Brands — Operations Team Lead | 8 | 28 |
      | CORACTIVE — Application Technologist | 8 | 28 |

      Les trois premières sont littéralement des postes de **project manager** — la cible
      DÉCLARÉE de Marc sur Indeed (`Preferred Job Titles: Project Manager`). Le barème les
      écarte pour la seule raison qu'elles ne sont pas écrites en français.
      ⚠️ **Non corrigé dans la passe qui l'a trouvé, et c'est délibéré** : le §8 du CLAUDE.md
      impose un ADR AVANT toute ligne, puis l'audit sur les 38 offres du seed avec le tableau
      [entreprise | poste | note avant | note après | écart]. Une liste de mots ajoutée à la
      va-vite au barème est exactement le genre de changement qui déplace des dizaines de
      notes sans qu'on l'ait mesuré. La mesure ci-dessus est l'ENTRÉE de cet audit, pas sa
      conclusion : elle ne dit rien des faux positifs que l'anglais ferait entrer.
      Sœur du même défaut, à vérifier dans le même ADR : `motsTechnique` porte quelques mots
      anglais (`automation`, `robotic`, `plc`) mais pas `engineering`, `mechanical`, `design`,
      `manufacturing`.

- [x] **[VEILLE-34]** ✅ **Livré le 2026-09-17 (ADR-0017), et son chiffre ne s'est PAS reproduit — voir plus bas.** ⚠️ **`normaliserTitre` ne retirait PAS les accents, et les mots-clés du
      barème en portent.** Mesuré le 2026-08-18 sur le lot réel : `motsCoordination` contient
      « chargé de projet » ; un titre écrit « Charge de projet » (sans accent) ne matche pas.
      Ce n'est pas un cas d'école — **ZipRecruiter rend une bonne part de ses titres
      désaccentués** (« Charge(e) de projet », « Contremaitre », « Ingenieur »), et
      Indeed le fait aussi par endroits.
      **Chiffré : 4 offres du lot du 18 août** passent de `fitRole 8` à `28` par la seule
      comparaison insensible aux accents, sans ajouter un seul mot au vocabulaire :
      Regulvar (Chargé de projet), Solution SFT, TEHORA, **Davie — Charge de projet,
      maintenance**.
      C'est la sœur exacte de la leçon déjà consignée : « une expression composée ne survit
      pas à l'écriture inclusive » — `normaliserTitre` a été corrigé pour le `(e)` et pas pour
      les accents. La correction est mécanique (`normalize("NFD")` + `\p{Diacritic}` des DEUX
      côtés de la comparaison), mais elle touche `lib/scoring.ts` : §8 s'applique, ADR et audit
      sur les 38 offres du seed AVANT toute ligne. À traiter dans le MÊME ADR que [VEILLE-32] —
      les deux corrigent la même fonction et leurs effets se cumulent.
      ✅ **LIVRÉ — `docs/adr/0017-le-bareme-cesse-de-buter-sur-un-accent.md`.** Repli des accents
      dans `normaliserTitre`, appliqué **des DEUX côtés** : les mots du profil y passent aussi,
      parce qu'ils sont saisis par Marc depuis `/profil` et que rien ne garantit leur graphie.
      ⚠️ **ET LE CHIFFRE DE CET ITEM NE SE REPRODUIT PAS.** Il annonçait « 4 offres passent de
      `fitRole` 8 à 28 », en citant Davie, Solution SFT et TEHORA. Re-mesuré le 2026-09-17 sur
      la base réelle : les 33 offres du suivi dont le titre contient « charge de projet » sont
      **toutes accentuées** (Davie est en base sous « Chargé de projet, maintenance », note 76,
      pas 8), les 2 offres « electromeca » aussi, et le `SEED` entier (53) ne bouge **pas d'un
      point**. Le ticket avait été mesuré quand ZipRecruiter était une source ; elle ne l'est
      plus. **Le gain d'aujourd'hui est donc NUL, et c'est écrit dans l'ADR** pour que personne
      ne le cite plus tard comme une victoire.
      **Livré quand même, pour le SILENCE que ça ferme** : le jour où Marc ajoute « Ingénieur »
      ou « Chargé d'affaires » à ses listes depuis `/profil`, une moitié des annonces cesserait
      de matcher sans qu'une ligne ne rougisse.
      Verrou : `tests/scoring.test.ts`, quatre cas (titre sans accent qui atteint un mot
      accentué, non-régression accentuée, repli dans les deux sens, écriture inclusive
      cumulée). Deux mutations, deux rouges — dont le repli ASYMÉTRIQUE, qui casse tout le
      corpus accentué : c'est le piège que l'ADR nomme.

- [x] **[VEILLE-33]** ✅ **Livré le 2026-09-17.** La liste blanche de `situer()` comparait par SOUS-CHAÎNE : « Quebec
      Province » est accepté « dans la région » parce qu'il contient « quebec ». Trouvé le
      2026-08-18 sur une offre réelle (Eco-services TGL, mine souterraine) dont l'annonce
      disait « situé au Saguenay ». Le lot l'a corrigée à la lecture, mais rien dans le code
      ne l'aurait attrapée. Le registre de mesure ([VEILLE-31]) ne la sauve pas non plus :
      il n'est consulté qu'APRÈS les deux listes, donc jamais pour ce cas.
      ⚠️ **La piste inscrite ici (« exiger un segment ENTIER plutôt qu'une sous-chaîne ») est
      RÉFUTÉE — mesurée le 2026-08-18, elle échoue des DEUX côtés** :
      · elle n'attrape pas le cas qui a motivé le ticket — « quebec province » se segmente en
        `[quebec, province]`, donc « quebec » EST un segment entier : accepté, comme avant ;
      · et elle **casse 23 offres réelles** — « saint-augustin-de-desmaures » n'apparie plus
        « saint-augustin », la municipalité étant reconnue par PRÉFIXE et non par segment.
      La mesure a aussi montré pourquoi la règle actuelle tient malgré tout : « saguenay
      quebec » et « rouyn-noranda quebec » sont correctement REFUSÉS, non par la finesse de
      l'appariement mais parce que `HORS_PORTEE` passe AVANT `MUNICIPALITES`.
      Le vrai problème n'est donc pas structurel (sous-chaîne vs segment) mais **lexical** :
      « quebec » désigne à la fois la ville et la province, et rien dans la chaîne ne tranche
      sauf le mot qui l'accompagne (`province`, `provincia`, `state`). Piste corrigée : traiter
      cette ambiguïté nommément — un lieu qui porte un qualificatif de PROVINCE sans autre
      municipalité n'est pas « dans la région », il est **inconnu**, donc à MESURER par le
      registre ([VEILLE-31]) plutôt qu'à accepter. Reste à vérifier contre les ~130 entrées
      qu'aucune autre ne porte la même ambiguïté. §8 s'applique (logique d'admission).

- [x] **[VEILLE-33-FIX]** ✅ **Le correctif, livré le 2026-09-17.** `nommeUneMunicipalite`
      (lib/ingest/region.ts, PURE) refuse un lieu dont le qualificatif en fait la PROVINCE
      (`PROVINCE_PAS_LA_VILLE`) avant de consulter la liste blanche.
      ⚠️ **Une frontière de MOT n'aurait rien changé** : « quebec » est un mot entier dans
      « Quebec Province » comme dans « Quebec City ». Ce qui distingue la ville de la province
      n'est pas la forme du nom mais le QUALIFICATIF qui l'accompagne — d'où une liste de
      qualificatifs, et non un motif plus strict. La comparaison par sous-chaîne RESTE, parce
      qu'elle est ce qui attrape « Quebec City, QC » et « Lévis, QC ».
      ⚠️ **Verdict `lieu-inconnu`, jamais `hors-region`** : on ne sait pas où est l'offre, et ce
      fichier refuse de parier dans les deux sens. Le registre mesuré reste libre de trancher.
      ⚠️ **Une règle, DEUX consommateurs** : le champ `ville` ET le repli par la description.
      Deux copies du même `some(includes)` auraient divergé — c'est la classe de défaut déjà
      payée ici (les quatre listes de colonnes, `idsStockesVus`). La mutation qui laisse
      l'ancienne règle sur le seul repli rougit.
      Verrou : `tests/ingest-region.test.ts`, cinq cas dont deux de non-régression (les vraies
      villes avec suffixe de source entrent toujours ; le rejet passe toujours AVANT
      l'acceptation, sinon toute offre montréalaise entre). Trois mutations, trois rouges.
- [ ] **[VEILLE-06]** Lire l'annonce de chaque offre retenue (`get_job_details`) et en tirer
      les QUATRE champs qu'elle porte ensemble : description, salaire, adresse, séniorité.
      La description entre dans le dépôt (le schéma la porte déjà, on l'envoie vide).
- [x] **[VEILLE-06b]** ~~Corriger les deux défauts de barème qui récompensent l'ignorance~~
      **RÉFUTÉ PAR LA MESURE, remplacé par un correctif de vocabulaire** (audit du 2026-08-12
      sur 49 offres réelles, révision d'ADR-0005). Les deux « défauts » se défendent : six
      offres sur 49 portent une vraie barrière, donc `immigration` à 10 par défaut est juste ;
      et « 5 ans exigés » EST un moins bon appariement que « rien d'exigé », donc 9 < 11 n'est
      pas une inversion. Le vrai défaut était un SYNONYME non couvert — « apte aux enquêtes de
      sécurité » notait 10/10. Six mots ajoutés à `MOTS_DISQUALIFIANTS`, avec le test qui prouve
      que la liste ne mord ni sur la résidence au Québec (Marc y habite) ni sur le vocabulaire SST.
- [ ] **[VEILLE-06c]** File d'attente `data/veille/attente.json` (HORS `data/depot/`, donc
      jamais ingérée) : une offre non lue faute de quota n'est pas déposée, elle est reprise
      EN PREMIER le lendemain. Sans cette file, « garder pour demain » perd l'offre au
      prochain tri de la source.
- [x] **[VEILLE-08]** Expurger la PII de tiers des annonces lues — `lib/ingest/expurger.ts`
      (`expurgerPII`, PURE) + garde « aucune PII de tiers dans les descriptions d'un dépôt »
      dans `piiGuard`. Né d'un cas RÉEL : une annonce Randstad portait le nom, le courriel et
      le LinkedIn personnels d'un recruteur. La boîte de rôle (`carriere@…`) survit.
- [x] **[VEILLE-09]** Décaler le cron de l'app (`vercel.json`, `/api/cron/veille`) de 11:00 à
      14:00 UTC. Aujourd'hui la Routine et le cron partent à la même heure : la Routine met
      30-60 min à livrer, donc l'app ingère le dépôt de la VEILLE. La fenêtre de 7 jours de
      `fichiersDansLaFenetre` évite toute perte, mais les offres arrivent avec un jour de
      retard. Décision de Marc (2026-08-12) : fait. Posé à **15:00** et non 14:00 —
      la veille du jour a duré 11:06 → 13:55 UTC, 14:00 aurait été trop juste.
- [x] **[INGEST-05]** **Variantes de raison sociale entre deux sources — FAIT (ADR-0006)** — révélé le
      2026-08-12 en branchant ZipRecruiter à côté d'Indeed. `idOffre` normalise accents et
      casse, PAS les suffixes juridiques : « EllisDon Corporation » (Indeed) et « Ellisdon »
      (ZipRecruiter) sont deux identités, donc l'offre s'affiche DEUX FOIS. Une seule source
      ne pouvait pas produire ce défaut — c'est le second connecteur qui le crée.
      ✅ Résolu SANS migration : `idOffre` est intact, et une SECONDE clé (`cleCanonique`,
      liste FERMÉE de suffixes juridiques) sert uniquement à COMPARER. Les appelants versent
      dans `dejaSuivies` la clé canonique dérivée des champs stockés. Prouvé : EllisDon /
      Stekar / Larouche fusionnent, « Groupe Novatech » ≠ « Novatech » et « Robert » ≠
      « Groupe Robert » restent distincts.
- [x] **[VEILLE-07]** Volume : **ZipRecruiter branché** (MCP disponible depuis le 2026-08-12).
      Mesuré : `offset` pagine réellement (page 2 = cinq offres entièrement différentes),
      `total` annonce le gisement (15 sur « coordonnateur de projet », **51** sur « chargé de
      projet » — on en captait 10 %), `days_ago` donne la fraîcheur sans analyse de date, et
      `radius_miles` élargit sans multiplier les villes. Aucun quota rencontré.
      Rôles : **ZipRecruiter = LARGEUR** (pas de description), **Indeed = PROFONDEUR**
      (`get_job_details`, quota serré). Premier lot conjoint : 49 + 18 = 67 offres.
- [x] **[LIEU-05]** ~~Table `employeurs_adresse`~~ **ANNULÉ — la machinerie existait déjà**
      (vérifié dans le code le 2026-08-12, révision d'ADR-0005). `entreprisesLieux` est clé par
      `nom`, porte `geocodeLe`, se retente via `positionARaffiner` / `DELAI_RETENTE_POSITION_MS`
      (7 j), se ré-arme par `EPOQUE_A_RETENTER` dès qu'une adresse est acquise, cible
      `sansAdresse` et nomme les cas non convergents dans `insituables`. Construire la table
      aurait dupliqué tout ça — et de deux exemplaires d'une règle, c'est le moins relu qui
      garde la version la plus permissive.
- [x] **[LIEU-06]** ~~Remplacer la garde de ville par celle du géocodeur~~ **FAIT, et plus
      simple que prévu** : la garde du géocodeur EXISTAIT DÉJÀ (`RAYON_VALIDATION_KM = 30`,
      `lib/geocodage.ts`). Le défaut était un PRÉ-FILTRE en amont qui rejetait avant qu'elle
      puisse trancher. `villeCoherente` consulte désormais le référentiel des municipalités
      (`situer`, déjà partagé avec le filtre régional) : Sainte-Foy, Beauport et Charlesbourg
      passent, Montréal reste refusé — `situer` teste HORS_PORTEE AVANT d'accepter, donc le
      mot « Québec » dans « Montréal, QC » ne trompe pas. Le géocodeur reste l'arbitre final
      par la DISTANCE.
- [ ] **[LIEU-07]** Sonder Overpass par NOM d'entreprise sur la région — autre question que
      Nominatim, frontière réseau déjà ouverte. **Témoin négatif obligatoire** avant d'y
      croire (leçon « un HTTP 200 ne prouve rien »).
- [ ] **[VEILLE-07]** Volume, APRÈS la profondeur : pagination (ZipRecruiter rend `limit: 5`
      pour `total: 63` — on capte 8 %), plus de villes (Saint-Augustin, Beauport,
      Charlesbourg, Sainte-Foy, Saint-Nicolas, Saint-Apollinaire), rotation sur plusieurs
      jours, les deux connecteurs selon leur rôle (ZipRecruiter = largeur, Indeed = texte).

## Chantier #07 — Chaque offre du jour, toutes sur la carte ⏳

> Réponse à Marc (2026-08-12) : « 30 offres suivies au total et 8 placées sur la carte, ça
> marche vraiment pas bien, il faut tout refaire ». **Diagnostic par panel adversarial (6
> agents, sondes exécutées, dont un vrai `npm run build`) : il ne fallait PAS tout refaire.**
> La mécanique (tri, péremption, fenêtre 7 j, résurrection, honnêteté de la carte) tient
> toutes les sondes. Le symptôme entier venait d'UN défaut d'empaquetage + 2 bugs + 2 défauts
> de comportement, tous fermés le jour même.
>
> **LA CAUSE RACINE, prouvée as-built** : le traceur Next n'embarquait pas `data/depot` dans
> la fonction serverless (readdir invisible au build — traces NFT : 91 fichiers, zéro dépôt).
> En prod, le cron lisait un dossier ABSENT, rendu silencieusement comme « aucune offre » :
> AUCUN dépôt fichier jamais ingéré, et — pire — chaque cron « ne voyait plus » les 40 offres
> ingérées par la route POST du 31/07 → toutes périmées en 3 balayages → retour à ~30, le
> chiffre exact de Marc. Les 8 épinglées = filtre « adresse connue seulement » ON par défaut
> (demande du 06/08) sur un stock où l'acquisition d'adresses était en panne (registre 0/65).

FAIT le 2026-08-12 (tout gaté, discrimination prouvée par stash) :
- [x] **[FIX-BUNDLE]** `outputFileTracingIncludes: { "/api/cron/veille": ["./data/depot/**"] }`
      dans `next.config.mjs` — la ligne qui fait exister les dépôts en production.
- [x] **[FIX-ENOENT]** `sourceDepotFichier` : dossier absent = **panne dite** (`ok:false`),
      plus jamais un vide silencieux. Test retourné avec son histoire.
- [x] **[FIX-BALAYAGE-AVEUGLE]** une passe dont AUCUNE source n'a répondu **suspend le
      balayage** : compteurs d'absences inchangés, suspension nommée dans le résumé. Le
      discriminant inverse est aussi testé : une seule source ok ⇒ péremption honnête intacte.
- [x] **[FIX-VUE-VARIANTE]** le marquage « vue » résout vers l'id STOCKÉ (`idsStockesVus`,
      partagé passe + route POST) — l'ancien calcul laissait une offre suivie prendre des
      absences pendant qu'une source la re-publiait sous une variante de raison sociale
      (bug né d'ADR-0006 le matin même, trouvé par la contre-vérification du panel).
- [x] **[FIX-SEED-CRASH]** `appliquerSeed` ne touche plus que le seed : une offre ingérée
      par la veille provoquait un TypeError en pleine synchro (stub sans `raisons`), après
      écriture partielle du lot.
- [x] **[CARTE-DEFAUT]** filtre « adresse connue seulement » **éteint par défaut** — la
      demande du 12/08 (« toutes mes offres ») révise celle du 06/08.
- [x] **[CARTE-CENTREVILLE]** placement **centre-ville immédiat** des employeurs à ville
      connue (0 requête Nominatim, `geocodeLe: EPOQUE_A_RETENTER` ⇒ raffinage dû) : l'épingle
      existe à la première visite au lieu d'attendre des jours de passes budgétées. Le log
      de passe dit `placées=N`.

- [x] **[V-CRON-13]** Constaté le 2026-08-12 par déclenchement manuel (Marc, une fois le bon
      projet Vercel identifié) : `depot-fichier ok:true`, 115 offres trouvées (55 nouvelles,
      30 revenues). Le bundle embarque bien les dépôts — la cause racine est fermée.
- [ ] **[V-31-07]** Les ~40 offres du 31/07 sont hors fenêtre : elles reviendront par les
      balayages qui les re-trouvent (résurrection automatique). NE PAS les restaurer à la
      main — une offre que plus aucune source ne publie est peut-être vraiment fermée.
- [ ] **[V-ROTATION]** Mesuré par le panel : 68 % des offres d'un jour ne sont pas re-vues
      le lendemain (rotation des top-10) ; plancher de vie 10 jours (fenêtre 7 + seuil 3).
      Après une semaine de régime réparé, relire les péremptions : si des offres encore
      ouvertes périment, le correctif est côté ROUTINE (re-recherche nommée des offres en
      péril, bornée ~10 req/jour) — PAS un seuil plus haut (il retarderait symétriquement
      la péremption honnête).
      ✔ **RELEVÉ le 2026-09-17** (`resume_suivi`) : **1 653 suivies, 640 périmées (38,7 %),
      0 jamais confirmée, `plusVieilleVueJours` = 4**. Le signal que l'item cherche — « des
      offres encore ouvertes périment » — s'observe par les RÉSURRECTIONS, une offre périmée
      que la veille retrouve : trois passes du jour donnent `revenues=3`, puis `0`, puis `0`.
      ⚠️ **Rare, mais non nul, et trois passes ne sont pas une semaine.** Je ne conclus donc
      pas, et surtout je ne déclenche pas le correctif prescrit (la re-recherche nommée côté
      Routine) : rien dans ce relevé ne le justifie aujourd'hui. Ce qu'il faut suivre est le
      compteur `revenues` du journal de veille — s'il monte, l'item a sa preuve ; s'il reste
      à zéro sur une semaine, il se ferme.

### [CARTE-03] — 115 offres, 93 sur la carte, 60 « sans adresse » : le débit du géocodage

> Marc (2026-08-12), une fois [FIX-BUNDLE] déployé : « 115 offres mais sur la carte que 93…
> et 60 sans adresse c'est inacceptable ». **Ce n'est pas une régression : c'est la
> conséquence DIRECTE et VOULUE de [CARTE-CENTREVILLE].** Avant le 12/08, ces 60 employeurs
> étaient dans `aSituer` — invisibles, jamais comptés. Le placement immédiat les rend
> visibles, honnêtes (pointillé + fiche « ville seulement »), mais leur adresse RÉELLE reste
> à trouver — et c'est là qu'est le vrai plafond.

**Mesuré, pas supposé** (lecture de `lib/geocodage.ts` + `lib/actions.ts` + l'historique
git) :
- Les deux leviers GRATUITS ont DÉJÀ tourné sur ces 60 dans la même passe : la recherche OSM
  par NOM d'entreprise (5 candidats, `NB_CANDIDATS_ENTREPRISE`) et le registre des
  entreprises du Québec (28 821 établissements, sans coût réseau, `adressesDepuisRegistre`).
  Les 17 « adresse connue, épinglé au centre-ville » sont leur succès ; les 60 restants n'ont
  matché ni l'un ni l'autre — ce ne sont pas des PME au registre ou trouvables par leur nom
  sur OpenStreetMap.
- Le seul levier qui reste (`raffinerPositions`, Nominatim) est plafonné à **8 requêtes par
  passe** — `MAX_VILLES_PAR_PASSE` (`lib/geocodage.ts`), un plafond de SÉCURITÉ dérivé du
  pire cas sous le mur de 60 s d'une fonction Vercel, PAS un oubli. `MAX_SITUATIONS_CRON`
  vaut aussi 8 depuis ADR-01 (2026-07-31) **pour la même raison** — le porter plus haut ne
  changerait RIEN, `geocoderSerie` tronque déjà à 8 en interne. (Trouvé en chemin : le
  commentaire du cron affirmait encore « Douze », resté faux onze jours — corrigé.)
- Donc : agrandir UNE passe exigerait de re-dériver ce pire cas sur TOUTES les étapes qui
  partagent le budget (situer, adresses, raffinage, bornes) — pas fait ici, risque réel.

**Fait le 2026-08-12** — le levier sûr : une PASSE DE PLUS, pas une plus grosse.
- [x] **[CARTE-03]** `app/api/cron/geocodage/route.ts` : second cron, appelle SEULEMENT
      `mesurerDistances` (zéro ingestion, zéro péremption), même budget que la veille
      (`lib/geocodageCron.ts`, partagé pour ne jamais diverger), même verrou `reserverPasse`.
      `vercel.json` : `0 3 * * *` (12 h d'écart avec la veille, `0 15 * * *`) — double le
      débit quotidien de raffinage sans toucher au plafond par-passe. Auth factorisée
      (`lib/cronAuth.ts`) pour que les deux crons ne divergent plus jamais sur ce point.
      ⚠️ Le plan Vercel de Marc doit accepter un 2ᵉ cron : à vérifier au premier déploiement
      (échec de déploiement clair et sans risque si le plan Hobby le refuse — pas une panne
      silencieuse).

- [x] **[V-CARTE-03-CRON]** Déploiement Vercel confirmé `READY` en production avec les DEUX
      crons dans `vercel.json` (dpl_2rWYNtV6s2DL8byu8u5fjipjJ7tW). Le plan de Marc accepte un
      2ᵉ cron — pas de repli nécessaire.
- [x] **[FIX-DISTANCE-STALE]** Trouvé en vérifiant `/api/cron/geocodage` déclenché à la main
      (Marc, 2026-08-12, 18:20 UTC) : logs serveur = `precisees=2/8 (2 par adresse)`, mais le
      JSON rendu au client disait `mesurees=0` — un chiffre qui semblait dire « rien ne s'est
      passé » alors que 2 entreprises venaient d'obtenir leur vraie adresse. Cause : la
      distance des offres de ces 2 entreprises restait celle du CENTRE-VILLE, jamais
      recalculée, parce que `planifierDistances` ne retouche jamais un `km` déjà connu (par
      design, pour ne pas faire bouger l'affichage sans raison — mais ce garde-fou ne
      distinguait pas « déjà mesurée à la bonne précision » de « mesurée depuis un repli
      centre-ville qui vient d'être corrigé »). Fix : `invaliderDistancesPrecisees`
      (`lib/distances.ts`, pure, testée, discriminant prouvé) efface la distance des offres
      dont l'employeur vient d'être précisé CETTE passe, avant que `planifierDistances` ne
      tourne — reconnu par `memeEmployeur` (variantes de raison sociale comprises), jamais
      une comparaison littérale. `mesurerDistances` expose maintenant `precisees` dans son
      retour, et les deux crons l'affichent dans `localisation` — l'angle mort qui a caché ce
      bug (le nombre existait déjà en interne, jamais rendu) est fermé pour les deux.
- [ ] **[V-CARTE-03]** Mesuré au premier déclenchement manuel du 2ᵉ cron (18:20 UTC) :
      `precisees=2/8` — la mécanique avance vraiment, pas seulement en théorie. À raison de
      ~2 passes/jour × 8 candidats, suivre sur quelques jours si le compte de « sans adresse »
      baisse. Un reliquat qui ne baisse PLUS après plusieurs passes = ces employeurs sont
      introuvables sur les deux services publics — une limite des DONNÉES, pas du code ; le
      dire à Marc plutôt que de rouvrir `MAX_VILLES_PAR_PASSE`.
      ✔ **RELEVÉ le 2026-09-17 (deux passes, 19:41 et 20:11 UTC)** :
      `registre=1/1044 (38 ambigues) (1005 absentes)` puis `registre=0/1042 (38 ambigues)
      (1004 absentes)` ; `precisees=3/8 (3 par Google)` puis `5/8 (1 par adresse, 1 par
      Google)`. La mécanique avance toujours ; le reliquat d'absentes bouge d'UNE unité sur
      ~1 004.
      ⚠️ **Deux passes à trente minutes d'intervalle ne sont PAS « plusieurs jours »** : le
      critère de l'item ne peut pas être appliqué là-dessus, et je ne le déclare donc pas.
      Ce qui EST acquis, c'est l'ordre de grandeur (≈1 000 employeurs absents du registre,
      38 ambigus) et le fait que la série est désormais lisible passe après passe.
      ✅ **MAIS LA QUESTION D'ORIGINE, ELLE, EST TRANCHÉE.** Cet item naît de « 115 offres,
      93 sur la carte, 60 sans adresse — c'est inacceptable » (Marc, 2026-08-12). Mesuré au
      2026-09-17 par `resume_suivi` : **1 653 offres suivies, 12 non situées** — 99,3 % sont
      plaçables. Le reliquat d'employeurs sans ADRESSE PRÉCISE (≈1 004) est une autre
      question : il ne retire personne de la carte, il laisse l'épingle au centre-ville, et
      l'écran le DIT (pointillé + fiche).
      ⚠️ **ET LE CRITÈRE DE CET ITEM EST PIÉGÉ — corrigé le 2026-09-18.** Il prescrit : « un
      reliquat qui ne baisse PLUS = ces employeurs sont introuvables sur les deux services
      publics, une limite des DONNÉES ». La mesure de `[V-ROUTINE-QUOTA]` montre que le
      reliquat ne baisse pas pour une TOUTE AUTRE raison : **1 079 candidates attendent leur
      tour**, huit étant servies par passe. Appliquer le critère tel quel aurait conclu « les
      données manquent » là où c'est le DÉBIT qui plafonne — et fait renoncer à un réglage qui,
      lui, existe. Ne pas conclure cet item sans lire le `+K en attente de quota`.

### [CARTE-03] suite — Google Maps Geocoding + plafond de la Routine

> Marc, 2026-08-12 : « je veux que quand les offres s'importent, si on trouve pas l'adresse
> avec Nominatim on fasse une recherche web ou maps ». Découverte en creusant : une
> recherche web existe DÉJÀ, mais côté Routine (ingestion, `[LIEU-04]`), pas côté app —
> parce que c'est la Routine qui a l'accès web, JobAI n'appelle aucun LLM. Deux leviers
> distincts, demandés ensemble (« fais les deux »).

**[ROUTINE-QUOTA] — corrigé un chiffre qui n'existait pas.** `docs/ROUTINE-DEPOT.md`
décrivait un « budget ~40 offres » pour l'étape d'adresse ; le PROMPT RÉEL de la Routine
(`trig_01YJyokbyHj7ZzHJC8jyiYCY`, tire dans cette même session) n'a jamais eu ce plafond —
elle tente déjà TOUTES les offres retenues, bornée seulement par le quota Indeed partagé
(~44-48 appels avant refus). Le vrai levier manquant était l'ORDRE de lecture, pas un
nombre à augmenter. Fait le 2026-08-12 :
- [x] Live routine + doc : tri explicite par `publieeLe` décroissant (les plus récentes
      d'abord) AVANT la boucle `get_job_details` — sans lui, l'ordre par défaut d'Indeed ne
      garantit pas de traiter les offres fraîches en premier quand le quota coupe.
- [x] Un refus de quota sur CETTE étape (distinct de la recherche) : attendre le délai
      annoncé, réessayer UNE fois, puis arrêter l'étape (jamais boucler indéfiniment).
- [x] Le compte « offres SANS aucune tentative faute de quota » ajouté au rapport.

RESTE — à observer sur les prochains dépôts (rien à coder) :
- [ ] **[V-ROUTINE-QUOTA]** Vérifier que le tri par date change vraiment QUI obtient une
      tentative d'adresse un jour chargé, et que le compte « sans tentative » rapporté à
      l'étape 5 est cohérent avec le nombre d'offres du jour.
      ⚠️ **NON VÉRIFIABLE EN L'ÉTAT, constaté le 2026-09-17** — et c'est le constat qui fait
      avancer l'item. Le journal publie `precisees=N/8` (8 = `MAX_SITUATIONS_CRON`) mais
      AUCUN compte « sans tentative », et rien ne dit QUELLES candidates ont été servies ni
      dans quel ordre. La question posée ici n'a donc pas d'instrument, exactement comme
      `[VEILLE-42]` avant son contraste et `[DISTANCES-01]` avant ses jalons.
      **Préalable** : publier, dans la ligne `[distances]`, le nombre de candidates ÉCARTÉES
      faute de quota (`candidates − servies`) — un `N/8` seul ne distingue pas « il n'y avait
      que 3 candidates » de « il y en avait 300 et 8 ont été servies », qui sont les deux
      situations que cet item veut départager.
      ✅ **PRÉALABLE LIVRÉ le 2026-09-17**, dans la foulée. La ligne porte désormais
      `precisees=N/M (+K en attente de quota)`, et `K` se compte sur la file ENTIÈRE.
      ⚠️ **La cause était une LIGNE D'ORDRE** : `raffinerPositions` tranchait à
      `MAX_SITUATIONS_CRON` AVANT de compter, donc le dénominateur valait au plus 8 quoi
      qu'il arrive. Le correctif n'est pas « compter plus tôt » — ça redériverait au premier
      remaniement — mais `trancherParQuota` (`lib/quota.ts`, pure), qui rend la tranche ET le
      reste du MÊME appel, sur la MÊME entrée : le défaut ne peut plus revenir par
      inadvertance, il faudrait défaire la fonction.
      ⚠️ Le compte dit « en attente », jamais « écartées » : la file est triée par
      « la moins récemment tentée d'abord », donc ces candidates repassent — c'est une FILE,
      pas un refus. Un quota à zéro rend « tout attend », pas « rien à faire ».
      Trois mutations : compte pris sur la tranche, quota nul traité comme 1, `slice` reposé à
      part.
      ✅ **MESURÉ le 2026-09-18 à 11:31:50 : `precisees=4/8 (+1079 en attente de quota)`.**
      La réponse est nette — **le quota de 8 est MASSIVEMENT mordant** : 1 087 positions
      éligibles au raffinage, 8 servies par passe. À ce rythme (8/passe, deux passes par jour
      une fois `[VEILLE-13]` effectif), il faut ~68 jours pour drainer la file, et elle
      grossit avec l'ingestion.
      ⚠️ **ET ÇA CHANGE LA LECTURE DE `[V-CARTE-03]`.** Son critère disait « un reliquat qui ne
      baisse plus après plusieurs passes = ces employeurs sont introuvables, une limite des
      DONNÉES ». Faux ici : le reliquat ne baisse pas parce que **huit** sont tentées par
      passe. C'est une limite de DÉBIT, pas de données — et sans ce `+K`, on aurait conclu
      l'inverse en toute bonne foi.
      **Reste pour clore** : ~~vérifier que le tri « la moins récemment tentée d'abord » sert
      bien les plus anciennes (le compte ne le dit pas)~~ **FAIT, voir ci-dessous**, et décider
      si 8 doit bouger — c'est un arbitrage de quota Nominatim, donc une décision de Marc.
      ✅ **LE TRI EST VÉRIFIÉ, ET LA VÉRIFICATION A TROUVÉ UN DÉFAUT — 2026-09-18.** Oui, la
      file est bien triée « la moins récemment tentée d'abord ». Non, elle ne servait pas les
      plus anciennes : le quota était **tranché AVANT** que les éligibles sans ville soient
      écartées.
      **Le mécanisme, en entier.** Une éligible dont `villeDe` ne rend rien prenait une place
      de la tranche, puis était retirée juste après (sans ville, Nominatim chercherait la
      raison sociale dans le monde entier). Aucune requête ne partait pour elle ⇒ son
      `geocodeLe` n'était jamais marqué ⇒ elle restait la plus ancienne ⇒ elle reprenait la
      même place à la passe suivante, **indéfiniment**. Avec huit places pour 1 087 attentes,
      chaque bloqueuse coûtait **un huitième du débit, pour toujours**.
      ⚠️ **ET LE JOURNAL NE POUVAIT PAS LE MONTRER** : `precisees=N/M` avec `M < 8` se lit
      « il n'y avait que M candidates ». C'est la même cécité que celle que le préalable de
      cet item venait de corriger sur le dénominateur — corrigée d'un côté, intacte de l'autre.
      **Correctif** : `choisirARaffiner` (`lib/travaux.ts`, PURE) fait le tri, la résolution
      de ville et le quota **du même appel**, dans le bon ordre, et rend la ville AVEC la
      ligne retenue (la rechercher chez l'appelant, c'est la faire diverger un jour). Elle
      réutilise `trancherParQuota` plutôt que de refaire la tranche à la main.
      **Un troisième compte paraît dans la ligne `[distances]` : `(K sans ville connue)`**,
      dit à PART de `en attente de quota` parce que le geste est opposé — une « en attente »
      repassera toute seule, une « sans ville » n'avancera jamais tant que la ville manque.
      Les additionner ferait lire « ça avance lentement » là où il faut retrouver une donnée.
      ⚠️ **CE QUE JE NE PRÉTENDS PAS** : que le défaut mordait le 2026-09-18. Ce jour-là
      `candidates=8`, donc aucune place perdue sur CETTE passe — le défaut est certain dans le
      code, sa portée réelle est inconnue. Le nouveau compte est justement ce qui la rendra
      visible.
      ⚠️ **CORRECTION DE CE QUE J'AI ÉCRIT CI-DESSUS LE 2026-09-18** : « `K > 0` ⇒ K places
      étaient gelées depuis toujours » est **trop fort**, et un lecteur en tirerait un chiffre
      faux. `sansVille` compte les éligibles sans ville sur **toute la file**, pas seulement en
      tête. Or seules celles qui tombaient dans les `max` premières gelaient une place. La
      lecture juste est asymétrique : **`K = 0` est concluant** (aucune place ne pouvait être
      gelée), **`K > 0` ne l'est pas** (il faudrait savoir combien de ces K étaient parmi les
      plus anciennes). Mesurer ça exigerait un quatrième compte dont le coût dépasse l'intérêt,
      maintenant que le défaut est fermé.
      ⚠️ **Et `+1079` va MÉCANIQUEMENT baisser de K** : `sansTentative` ne compte plus que les
      tentables. Ce n'est pas la file qui se vide, c'est le compte qui cesse de mélanger deux
      populations — ne pas le lire comme un progrès.
      Quatre mutations jouées, quatre rouges : ordre d'origine restauré (3 cas), tri retiré,
      `sansVille` fondu dans `sansTentative`, `villeDe` consultée hors éligibles.

- [ ] 🟠 **`[QUOTA-VILLE-02]`** **Le MÊME défaut d'ordre vit dans `rattraperAdresses`, et il n'a
      PAS été corrigé** — trouvé en chemin le 2026-09-18 en cherchant si le patron existait
      ailleurs, signalé plutôt que réparé (un bug préexistant ne se corrige pas sans feu vert).
      `lib/actions.ts`, `rattraperAdresses` : `.sort(geocodeLe)` puis **`.slice(0, max)`**, et
      c'est seulement APRÈS que `villeDe` écarte celles dont la ville est inconnue. Une éligible
      sans ville consomme donc une place, n'est jamais interrogée, ne voit jamais son
      `geocodeLe` marqué, et revient en tête à la passe suivante — exactement le mécanisme que
      `[V-ROUTINE-QUOTA]` vient de fermer sur le raffinage.
      ⚠️ **Et son propre commentaire décrit le piège qu'il ne couvre pas** : « une entreprise
      qu'OpenStreetMap ne connaîtra JAMAIS resterait éternellement en tête et consommerait le
      quota à la place des autres ». C'est vrai, c'est bien géré pour un ÉCHEC de géocodage
      (`geocodeLe` marqué à chaque tentative), et c'est faux pour une absence de VILLE — le cas
      où aucune tentative n'a lieu.
      **Remède prêt** : `choisirARaffiner` ne convient pas telle quelle (elle filtre sur
      `positionARaffiner`, pas sur `adresseARattraper`). Il faut soit la paramétrer par son
      prédicat d'éligibilité, soit écrire sa jumelle — dans les deux cas le corps est le même,
      et `trancherParQuota` reste le seul endroit qui tranche.
      ⚠️ **Portée inconnue, comme pour son jumeau** : rien ne prouve que le défaut morde
      aujourd'hui. `adresseARattraper` exige `precision === "exacte"`, donc un lieu déjà géocodé
      avec succès depuis une ville — et les offres ne sont jamais supprimées, donc `villeDe`
      devrait encore la retrouver. Le chemin réellement atteignable est une entrée de
      `ENTREPRISES_CIBLES` **retirée du code** alors que son lieu persiste en base.
      **Avant de coder** : publier d'abord le compte (comme `(K sans ville connue)` côté
      raffinage) et lire un relevé. Corriger à l'aveugle un défaut dont la portée est inconnue,
      c'est se priver de la mesure qui dit s'il fallait le corriger.
      ➜ Le troisième consommateur de `villeDe`, `adressesDepuisRegistre`, est SAIN : il n'a
      aucun quota (c'est l'étape non bornée de `[DISTANCES-01]`), donc rien à trancher.
      ✅ **LIVRÉ le 2026-09-18, sur feu vert explicite de Marc (« fais QUOTA-VILLE-02 aussi »).**
      ⚠️ **ET ÇA PASSE OUTRE LA CONDITION QUE CET ITEM SE POSAIT** (« publier d'abord le compte,
      lire un relevé, puis corriger »). C'est la décision de Marc, elle est raisonnable — le
      correctif est gratuit et le défaut structurel — mais elle a un coût qu'il faut dire :
      **on ne saura jamais combien de places le rattrapage d'adresses gelait avant.** Le compte
      part avec le correctif, donc il ne mesurera plus que l'après.
      **Ce qui a été fait** : le corps de sélection est devenu UNIQUE pour les deux files —
      `choisirDansLaFile` (`lib/travaux.ts`, PURE), et deux enveloppes nommées qui ne diffèrent
      que par leur **prédicat d'éligibilité** (`choisirARaffiner` / `choisirARattraperAdresse`).
      Corriger deux copies en aurait laissé deux à re-diverger ; c'est d'ailleurs la duplication
      qui avait produit ce défaut en double.
      **Les deux comptes paraissent aussi sur la ligne des adresses** :
      `adresses=N/M (+K en attente de quota) (K' sans ville connue) (…)`. Sans le premier, `M`
      avait exactement la cécité que `precisees=N/M` avait — il vaut au plus le quota.
      ⚠️ **Le commentaire de `rattraperAdresses` disait déjà le bon raisonnement, et il reste
      dans le code avec ce qui le complète** : trier par `geocodeLe` + marquer à chaque
      tentative fait tourner la file **quand une requête part**. Il ne protégeait de rien quand
      aucune ne part — le cas « pas de ville ». Le commentaire n'a pas été corrigé mais ÉTENDU :
      il raconte maintenant les deux moitiés, la juste et celle qui manquait.
      Trois mutations, trois rouges : prédicat d'éligibilité recopié de travers (4 cas), tranche
      reposée sur les éligibles au lieu des tentables (9 cas), file des adresses cessant de
      publier son compte.
      ⚠️ **Et la garde de câblage a failli compter la PROSE** : `/en attente de quota/g` rendait
      TROIS occurrences dans `lib/actions.ts` — la troisième étant le commentaire qui explique
      le champ. Le motif porte désormais l'interpolation (`.sansVille} sans ville connue`), donc
      il ne peut matcher que du code. Piège déjà nommé dans les leçons du hub, re-payé ici.

**[CARTE-03-GOOGLE] — Google Maps Geocoding, troisième repli.** ADR-0007. Marc a choisi
Google Maps Geocoding (sur 4 options présentées) pour les entreprises que Nominatim ET le
registre ratent encore. Fait le 2026-08-12, gate vert :
- [x] `lib/geocodage.ts` : `urlRechercheGoogle` / `lireReponseGoogle` /
      `geocoderEntrepriseGoogle`, mêmes gardes que Nominatim (nom + distance), testés.
- [x] `raffinerPositions` (`lib/actions.ts`) : tente Google UNIQUEMENT sur ce que Nominatim
      a raté cette passe (introuvable ou hors rayon), jamais en plus de ce qu'il a résolu.
- [x] `adresse_source` : cinquième valeur `google` (migration `drizzle/0015_adresse_google.sql`),
      distincte de `recherche` — une réponse structurée n'a pas besoin du « à confirmer ».
- [x] `Raffinage.parGoogle` / `.googleTente` exposés dans les logs `[distances]` des deux
      crons — la même leçon que `precisees` : un chiffre calculé mais jamais renvoyé cache
      un angle mort.
- [x] `.env.example` : `GOOGLE_MAPS_API_KEY`, optionnelle, marche à suivre pour l'obtenir.

- [x] **[V-CARTE-03-GOOGLE-CLE]** Marc a créé la clé Google Cloud et l'a posée dans Vercel
      (`GOOGLE_MAPS_API_KEY`, 2026-08-12) — avec Geocoding API, Places API (New) et
      quelques API supplémentaires activées (voir `[CARTE-03-PLACES]` ci-dessous).

RESTE — à observer sur les prochaines passes (rien à coder) :
- [x] **[V-CARTE-03-GOOGLE]** ✅ **Mesuré à l'audit du 2026-09-17** : `precisees=2/8 (2 par Google)` le 16/09, `precisees=1/6 (1 par adresse) (0 par Google)` le 17/09. Google résout donc bien une partie des cas — la question posée ici a sa réponse, et `parGoogle=0` sur UNE passe n'est pas un verdict. Lire `[distances] … (N par Google)` dans les logs d'une passe
      réelle. `googleTente=true` avec `parGoogle=0` sur plusieurs passes = ces employeurs
      sont introuvables aussi chez Google — limite des données, pas du code.

**[CARTE-03-PLACES] — autocomplétion et fiches enrichies via Places API.** ADR-0007
(extension). Demande de Marc, « utilise les autres API aussi », clarifiée en deux usages
choisis explicitement (voir l'ADR pour le détail des options écartées). Fait le
2026-08-12, gate vert :
- [x] `lib/geocodage.ts` : `chercherEntreprisesGoogle`/`lireReponseAutocomplete` (Places
      Autocomplete New) et `detailsEntrepriseGoogle`/`lireReponseDetails` (Place Details),
      `CoordonneesGoogle.placeId` capturé sur la résolution Geocoding — testés.
- [x] `entreprises_lieux` : cinq colonnes (`placeGoogleId`, `siteWeb`, `telephone`,
      `horairesGoogle`, `detailsLe`), migration `drizzle/0016_places_enrichissement.sql`,
      même patron à trois états que les bornes de recharge.
- [x] `lib/travaux.ts` : `detailsAEnrichir` ajouté au gate `resteDuTravail` — sans lui,
      l'enrichissement se serait affamé comme le rattrapage d'adresses avant lui.
- [x] `enrichirDetailsGoogle` (`lib/actions.ts`), câblé dans `mesurerDistances` après les
      bornes ; `detailsEnrichis` exposé dans les logs `[distances]` et les réponses JSON
      des deux crons.
- [x] `suggererEntreprises` (Server Action) + `FormulaireAjout.tsx` : autocomplétion du
      champ « Entreprise » via `<datalist>` natif, débounce 300 ms, seuil 3 caractères.
- [x] `lib/carte.ts`, `CarteOffres.tsx`, `ListeCarte.tsx` : site web / téléphone / horaires
      affichés sur la fiche, dans la fenêtre Leaflet ET l'accès clavier — les deux surfaces
      tenues synchrones (`ListeCarte.tsx` porte tout ce que la fenêtre porte, par contrat).
- [x] `.env.example` : section réécrite pour les trois usages de la clé.

RESTE — à observer sur les prochaines passes (rien à coder) :
- [x] **[V-CARTE-03-PLACES]** ✅ **Mesuré à l'audit du 2026-09-17** : `details=2/2` sur la passe du 17/09 au matin — l'enrichissement de fiche progresse en production. Vérifier en production : des suggestions apparaissent bien à
      l'ajout d'une offre, et `[distances] … details=N/M` progresse sur les entreprises déjà
      résolues par Google.

## Découvertes et dette (à trier)

- ✅ **`[SEC-NEXT-RCE]` — RÉSOLU le 2026-09-14.** Cinq avis sur des dépendances de
  **production**, dont une RCE **critique non authentifiée**. Trouvés en passant : le job
  `audit` de CarAI a rougi sur une PR qui ne touchait aucune de ces dépendances, et la
  vérification a montré le même jeu d'avis ici. Préexistant, établi avant d'agir.
  - `next` ≤ 15.5.23 — **critique**, GHSA-2xp9-vwfh-vxw4 : exécution de code à distance
    **non authentifiée** dans l'API d'optimisation d'images (fichiers AVIF).
    ⚠️ Ce n'est pas théorique sur une app publique : `/_next/image` est joignable sans
    session par construction. *(GHSA-p293-qw3h-jr36 ne vise que les serveurs Windows et ne
    s'applique pas à Vercel — dit pour ne pas laisser croire que les deux pèsent pareil.)*
  - `fast-uri` 3.0.0-3.1.5 — **haute** : deux SSRF (normalisation IPv6 malformée,
    pourcent-décodage répété du nom d'hôte) et deux confusions d'hôte. JobAI part vers des
    sources externes, c'est la plus inconfortable du lot.
  - `sharp` < 0.35.4 — **haute**, GHSA-rgj7-g3m4-5g8c (libheif) : même chemin que l'avis
    critique, c'est la dépendance de l'optimisation d'images.
  - `hono` ≤ 4.13.4 (**modérée** ×3) et `qs` ≤ 6.15.3 (**modérée** ×2).

  `npm audit fix` : **lockfile uniquement**, aucune contrainte de `package.json` touchée.
  `npm audit --omit=dev` : 0 vulnérabilité. Gate rejoué entier après le bump.
  ⚠️ Ça change ce qui est SERVI (Next lui-même) : vérifier le déploiement de production
  après le merge, pas seulement la CI.
  État de la constellation au 14/09 : Hubperso ✅, CarAI ✅, JobAI ✅ (celui-ci),
  BatchChef déjà sain (`next ^15.5.25`), DriveAI sain (`app/` à 0, `api/` zéro-dépendance),
  FinanceAI — un `hono` modéré seulement, pas de Next.


- 🔧 **`[SCORE-SENIORITE-LETTRES]` — le barème ne lit pas les années écrites en toutes
  lettres.** `scoreSeniorite` cherche `(\d+)…ans d'expérience` : « Posséder **trois à cinq
  années** d'expérience » (offre Dracon, réelle) ne matche pas et retombe sur la valeur
  neutre 11/15 au lieu de 9. L'offre est donc surnotée de 2 points. Trouvé en notant les
  offres du repérage du 2026-07-29. ⚠️ C'est une modification de la NOTATION : protocole
  `CLAUDE.md` §8 (ADR + tableau avant/après sur les offres du jeu) avant toute ligne de code.

- 🧭 **`[DISTANCE-CALCULEE]` — mesurer les distances au lieu de les écrire à la main.**
  Depuis `[UX-09]`, les entreprises situées ont leurs coordonnées en base
  (`entreprises_lieux`), et le domicile vit déjà dans `DOMICILE_LAT`/`DOMICILE_LON` : le
  serveur a donc les deux bouts pour calculer chaque distance avec `distanceKm`
  (`lib/geocodage.ts`, déjà écrite et testée). Ça remplirait les `km: null` des entrées
  ajoutées automatiquement **sans qu'aucune adresse n'entre dans le dépôt**, et rendrait
  les distances vérifiables au lieu d'être des constantes recopiées. Points à trancher :
  une distance à vol d'oiseau n'est pas une distance routière (l'afficher comme telle
  serait malhonnête) ; et le repli quand l'entreprise n'est pas encore située.

- 🧭 **`[NOTE-SALAIRE]` — le salaire affiché n'entre pas dans la note calculée.**
  `scoreSalaire` attend un annuel ; `salaireAffiche` est du texte libre, et les six formes
  réellement présentes dans le seed le montrent : `40 $/h+ (~83 k$)`, `52 260 – 120 727 $`,
  `marché 51-74 k$`, `marché ~89 k$`, `à partir de 65 000 $`, `à partir de 70 000 $`.
  Un parseur devrait trancher : quelle extrémité d'une fourchette ? quel facteur pour
  annualiser un taux horaire ? un « marché ~89 k$ » est-il une donnée de l'offre ou une
  estimation de la recherche ? **Chaque réponse change la note d'une offre** — c'est donc
  une modification de la logique de notation, soumise au protocole `CLAUDE.md` §8 (ADR +
  tableau avant/après sur les 38 offres). En attendant, `scoreSalaire(null)` rend sa valeur
  **neutre** (9/15), jamais zéro : une offre saisie à la main n'est ni avantagée ni pénalisée.

- ✅ **`hub-contract` — TRAITÉ le 2026-07-29** (PR `hub-contract#2`, draft) : lockfile
  resynchronisé, table des consommateurs complétée (BatchChef et JobAI manquaient — dans
  `HANDOVER.md` ET `CLAUDE.md` §3). ⚠️ Le **tag `v1.1.0` reste à pousser par Marc** (la
  session ne peut pas pousser de tag — proxy git restreint à sa branche) : la commande
  d'une ligne est dans le HANDOVER de hub-contract. JobAI re-pinnera `#v1.1.0` ensuite.
- ✅ **`app-template` — TRAITÉ le 2026-07-29** (PR `app-template#1`, draft) : re-pinné sur
  le SHA du contrat v1.1.0 (le bloc `usage` arrive aux forks), **503** au lieu de 500,
  migration ESLint CLI avec le bloc `ignores`, next `^15.5.22` + overrides. Gate vert,
  `npm audit --omit=dev` → 0.
- ✅ **`[SEC-BATCHCHEF-DRIZZLE]` — RÉSOLU le 2026-07-28** (PR `MoKarade/batchchef-#22`,
  mergée par Marc). `drizzle-orm < 0.45.2` portait une **injection SQL par identifiants mal
  échappés** (GHSA-gpj5-g38j-94v9, HIGH) ; le lockfile de `batchchef-/web` résolvait 0.44.7,
  **en production, dans un dépôt PUBLIC**. Découvert en installant Drizzle ici.
  La mesure a sorti deux autres HIGH au passage : `postcss` 8.4.31 — embarquée par Next dans
  son PROPRE `node_modules`, donc invisible pour qui ne regarde que la racine — et `sharp`
  0.34.5. Fermées par les mêmes `overrides` que JobAI, pas par un second remède inventé.
  Résultat mesuré : `npm audit --omit=dev` **4 HIGH + 1 moderate → 0**.
  Verrou posé là-bas : `web/tests/dependances.test.ts`, qui inspecte TOUTES les copies du
  lockfile (volume et discrimination prouvés).
  ⚠️ **Reste ouvert chez BatchChef : il n'a AUCUNE CI.** Aucun workflow GitHub Actions —
  seule la prévisualisation Vercel s'exécute. C'est en partie pourquoi cette faille a vécu
  en production sans que rien ne se déclenche. 🧭 Décision de Marc : lui poser le job `gate`
  de JobAI ?
  ⚠️ **Élargi le 2026-07-29, en vérifiant les CI des PR du lot dette : Hubperso,
  hub-contract et app-template n'avaient AUCUNE CI non plus** — JobAI était le seul dépôt
  de l'écosystème avec un workflow.
  ✅ **TRAITÉ le 2026-07-29 — une CI par dépôt, quatre PR draft**, chacune avec son gate
  prouvé localement AVANT livraison (une CI rouge au premier run est pire que pas de CI) :
  `Hubperso#14`, `hub-contract#3`, `app-template#2`, `batchchef-#23`. 🧭 Reste à Marc de
  les merger. Les décisions de conception, communes aux quatre :
  · **Le gate rejoue EXACTEMENT le gate local du CLAUDE.md de chaque dépôt** — une CI qui
    vérifie autre chose diverge, et c'est le mauvais exemplaire qu'on finit par croire.
  · **L'audit (`npm audit --omit=dev`) est un job SÉPARÉ**, aussi en hebdomadaire. Un avis
    de sécurité paraît sans qu'une ligne n'ait changé : mêlé au gate, il peindrait un dépôt
    sain en rouge du jour au lendemain et on prendrait l'habitude du rouge — exactement
    comment cette CI-ci a été ignorée sur quatre commits. Séparés, « gate vert / audit
    rouge » se lit d'un coup d'œil.
  · **Vérifié partout : aucun build ne demande de variable d'environnement** (aucun clone
    n'a de `.env.local`) — donc aucune CI ne réclame de secret ni ne rougit au premier run.
  · Spécificités : `working-directory: web` + `cache-dependency-path` chez BatchChef
    (`.nvmrc` reste à la RACINE, `setup-node` le résout depuis le workspace) ; chez
    hub-contract, deux gardes **prouvés discriminants** (aucune dépendance runtime hors
    `zod` ; version du package == tag poussé) plus un **avertissement** quand le tag de la
    version courante manque — le garde attrape un tag qui DIVERGE, jamais un tag ABSENT,
    qui ne déclenche aucun run et fut pourtant l'incident réel.
  · Au passage, `next lint` (déprécié, retiré dans Next 16) migré vers l'ESLint CLI chez
    Hubperso : inscrire dans une CI une commande condamnée, c'est programmer sa panne.
- ✅ **Next < 15.5.21 cumulait 8 avis HIGH — VÉRIFIÉ PARTOUT le 2026-07-29** (l'audit
  qu'annonçait cette entrée) :
  · **Hubperso** était PIRE que prévu : 5 vulnérabilités en production dont **2 CRITICAL
    sur `@auth/core`** — l'une est un contournement d'adresse par homoglyphes, le vecteur
    exact contre un hub à adresse unique (`AUTHORIZED_EMAIL`). Fermées (next 15.5.22,
    next-auth beta.32, overrides postcss/sharp) — **PR `Hubperso#13`** (draft), audit
    mesuré à 0, gate vert (63 tests).
  · **BatchChef** : déjà propre — 15.5.21 (la version corrigée des 8 avis) + overrides
    posés par la PR #22, `npm audit --omit=dev` mesuré à 0. Item périmé, rien à faire.
  · **app-template** : corrigé dans la PR `app-template#1` (voir ci-dessus).
- **`postcss` et `sharp` sont épinglés vulnérables par Next lui-même** → forcés par
  `overrides` dans `package.json`, avec la note de retrait quand Next les remontera.
  Résultat mesuré : `npm audit --omit=dev` → **0 vulnérabilité**.
- **Node 20 est en fin de support** (avril 2026) [Probable] alors que les 4 workflows de
  DriveAI et les 4 de FinanceAI l'épinglent encore. JobAI épingle **22** (`.nvmrc`), la
  version réellement utilisée en développement — épingler 20 aurait créé un écart dev/CI
  non testé. À réévaluer pour les autres dépôts.

## Chantier — accueil regroupé par entreprise

- [x] 🔧 **`[ACCUEIL-01]`** **Accueil regroupé par entreprise** (demande de Marc,
      2026-08-21 : « regrouper toutes les offres par entreprise, mettre l'entreprise avec
      la meilleure note en moyenne en premier, permettre de cliquer sur la carte entreprise
      pour avoir plus d'info sur l'entreprise et voir toutes les offres avec notes, possible
      de cliquer chaque offre pour avoir la même carte que les offres actuelles »). ✅
      2026-08-21.
      · `lib/groupesEntreprise.ts` (déjà en place) fournit `grouperParEntreprise` — même
        règle d'appariement que la carte (`apparier`), classement par moyenne décroissante,
        groupes SANS aucune note toujours en DERNIER (jamais zéro, une entreprise non jugée
        n'est pas une mauvaise entreprise). Ajouté ici : le TRI DES OFFRES à l'intérieur
        d'un groupe (meilleure note d'abord, distance croissante à égalité, non mesurées en
        dernier) — sinon la première offre visible en dépliant n'aurait pas été la
        meilleure.
      · `components/CarteEntreprise.tsx` (nouveau) : même geste que `CarteOffre` — clic
        agrandit, ça ne navigue pas. Dépliée, elle rend CHAQUE offre du groupe avec
        `CarteOffre` telle quelle : aucune seconde implémentation de carte d'offre, qui
        aurait fini par diverger.
      · `components/ListeOffres.tsx` : le filtrage produit les offres visibles EXACTEMENT
        comme avant — le compte affiché reste un compte d'OFFRES (ce que Marc a demandé de
        voir en premier, 2026-08-19) — et c'est SUR ce résultat filtré que le regroupement
        se construit : un filtre qui écarte une offre l'écarte aussi du groupe, jamais
        l'inverse. Une phrase secondaire, discrète, dit en combien d'entreprises ça se
        regroupe.
      · Tests : `tests/groupesEntreprise.test.ts` (+1, le tri intra-groupe, discriminant :
        note décroissante puis distance croissante, non mesurées en dernier). Gate complet
        vert (81 fichiers, 1390 tests). Aucune modification de `lib/scoring.ts` ni de la
        logique de matching : protocole §11 non déclenché — regroupement et affichage
        seulement, zéro recalcul de note.
      Reste ouvert : la fiche entreprise ne porte PAS les champs Google Places (adresse,
      téléphone, horaires) que la fiche de la carte affiche déjà — la demande de Marc lisait
      « voir toutes les offres avec notes » comme le contenu du dépliage, pas une fiche
      d'entreprise enrichie séparée. À confirmer si Marc en veut plus.

## Chantier — quatre retours de test réels sur la carte Google

- [x] 🔧 **`[CARTE-H]`** **Quatre correctifs mesurés sur la carte, demande de Marc
      2026-08-21** : « je veux pas pouvoir scroll sous la map… les entreprises sont
      toujours écrites 1 au lieu de la moyenne des notes des offres… les boutons sont
      moches et mauvaise couleur… je veux pouvoir cliquer sur la carte pour désélectionner
      la sélection ». ✅ 2026-08-21.
      · **Défilement sous le plan** — l'ancien correctif posait `height: calc(100vh -
        13rem)`, un chiffre DEVINÉ pour « tout ce qu'il y a au-dessus » qui a re-dérivé dès
        qu'une barre d'outils s'est ajoutée (la classe de bug que ce dépôt nomme partout
        « un commentaire qui reste faux après que la valeur a changé »). Remplacé par un
        remplissage FLEX qui ne devine rien : `Cadre` gagne un prop `pleinEcran`, l'en-tête
        et les onglets gardent leur taille naturelle, `<main>` puis `.plan-ecran` absorbent
        tout le reste — le calcul est fait par le moteur de mise en page. `.plan-ecran
        :has(.carte-offres--agrandie)` reste une échappatoire au défilement normal (le mode
        « agrandir » a toujours voulu dépasser l'espace disponible ; les deux comportements
        entraient en conflit sinon). Sous 56 rem, `.page--pleine` s'efface : un empilement
        mobile dépasse presque toujours un écran, le figer aurait rendu le bas de liste
        INATTEIGNABLE. **Vérifié par un harnais Playwright** (page HTML statique, la vraie
        feuille de style, 59 lignes de test) — mesuré, pas supposé : desktop 900/900 sans
        défilement de page, liste interne qui défile (6608/493) ; mobile 375×812 redevient
        un flux normal (page 9234, défilement de page) ; agrandie restaure l'ancien 82vh au
        pixel près ET redonne le défilement de page.
      · **Note « 1 » au lieu de la moyenne** — trouvé dans `CarteGoogle.tsx` : la pastille
        d'une épingle APPROXIMATIVE affichait `e.entreprises.length` (un compte
        d'entreprises) au lieu de la note — et la quasi-totalité des points flous ne
        portent qu'UNE entreprise, d'où le « toujours 1 ». La distinction floue/exacte reste
        dite par le STYLE (petite, grisée, pointillée), plus par un chiffre différent :
        la pastille montre désormais `note ?? "—"` dans tous les cas.
      · **Boutons moches, mauvaise couleur** — `.bouton` est le style du BOUTON DE
        CONNEXION (`--accent`, un violet hérité du gabarit `app-template`, jamais destiné à
        cet écran) ; les boutons « Agrandir la carte » / « Densité des bonnes offres »
        l'utilisaient par erreur. La carte Leaflet portait déjà la bonne règle en
        commentaire (« même allure que les filtres, ils n'ont pas à s'inventer un style ») —
        elle ne l'avait simplement pas traversée jusqu'à la carte Google. Remplacé par
        `.filtre`/`.filtre--actif` + `aria-pressed`, la même convention que partout ailleurs.
      · **Cliquer sur la carte pour désélectionner** — `onClick` posé sur `<FondGoogle>`
        (`Map` de `@vis.gl/react-google-maps`) appelle `setSelection(null)`. Sans risque
        de refermer la fiche qu'on vient d'ouvrir : l'événement `click` de la carte (Maps
        JS natif) et le `gmp-click` d'un `AdvancedMarker` sont deux canaux SÉPARÉS — cliquer
        une épingle ne déclenche jamais aussi le clic de fond (vérifié dans les typings de
        la bibliothèque : `AdvancedMarkerClickEvent` ≠ `MapMouseEvent`).
      Aucune modification de `lib/scoring.ts` ni de la logique de matching : protocole §11
      non déclenché — mise en page et affichage seulement. Gate complet vert (81 fichiers,
      1386 tests).

## Chantier — 403 encore, map trop petite, tri de la liste

- [x] 🔧 **`[CARTE-I]`** **Retours de test de Marc, 2026-08-21 (suite)** : « jai encore
      erreur 403, rends la map plus grande de base, jai aussi encore beaucoup le soucis de
      scroll sous la map, corrige. aussi pour les offres a droite de la map, laisse moi les
      classer (note, distance, etc) ». ✅ 2026-08-21.
      · **403, source élargie** — `[CARTE-H]` ne traduisait le 403 QUE pour Routes.
        La clé serveur est restreinte par API (ADR-0016) : Geocoding, Places et Routes se
        refusent chacune INDÉPENDAMMENT tant qu'elles ne sont pas TOUTES activées et
        listées. `lib/geocodage.ts` (Google Maps Geocoding, Places Autocomplete, Place
        Details) rendait un `HTTP 403` générique, sans dire LAQUELLE des trois manquait
        encore — exactement ce qui a pu maintenir le 403 après que Marc n'a activé que
        Routes. Les trois nomment maintenant l'API et le geste console, comme Routes.
      · **Map trop petite / scroll persistant, MESURÉ, pas supposé** — un harnais
        Playwright avec la VRAIE barre de filtres (16 boutons + le bloc `BoutonSituer`) a
        montré la vraie cause : `.plan-ecran{min-height:0}` laissait le plan s'écraser à
        **39,7 px** sur 1280×720 dès que les filtres prenaient deux ou trois lignes — un
        plan visible mais inutilisable, pas un défilement. Trois correctifs mesurés :
        (a) `BoutonSituer` replie sa note explicative (~124 px, toujours visible) dans un
        `<details>` — l'info reste accessible, sa place permanente non ;
        (b) `.page--pleine` resserre SPÉCIFIQUEMENT le rythme des onglets et le padding du
        haut sur cette page (pas globalement — le rythme normal reste un choix ailleurs) ;
        (c) `.plan-ecran` gagne un PLANCHER (`min-height: 26rem`, pas 0) : le plan ne
        s'écrase plus, `main` absorbe un éventuel écart résiduel par un défilement interne
        CONTENU (`overflow-y: auto`, un filet, pas le mécanisme) plutôt que de rendre le bas
        de la carte inatteignable en silence. Mesuré après coup : 1440×900 et 1920×1080
        sans aucun défilement (plan à 373 et 553 px) ; 1280×720 garde un défilement interne
        de ~150 px dans `main` — un plan à 345 px garanti valait mieux qu'un plan à 40 px.
      · **Tri de la liste à droite** (`lib/carte.ts` : `aplatirEntreprises`,
        `trierEntreprisesListees`, PUR, testé — 9 tests) : note (moyenne décroissante,
        même règle que la pastille de l'épingle et les groupes de l'accueil — jamais zéro
        pour une entreprise non jugée), distance (croissante), nom (alphabétique
        français). Non mesuré passe toujours en DERNIER, jamais trié comme zéro ni comme
        l'infini. `ListeCarte.tsx` devient client (`useState` du critère), même style de
        boutons que les filtres (`.filtre`/`.filtre--actif`).
      Gate complet vert (81 fichiers, 1398 tests). Aucune modification de `lib/scoring.ts`
      ni de la logique de matching : protocole §11 non déclenché.

---

## Chantier — cliquer pour avoir l'offre, et savoir ce qu'on regarde ✅

Demande de Marc, 2026-09-14 : « les liens marchent pas forcément, je veux juste cliquer pour
avoir l'offre, parce que ça m'étonne certaines devraient être périmées ».

- [x] 🔧 **`[LIEN-01]`** Classer ce qu'un lien d'offre ATTEINT (`lib/lienOffre.ts`, PURE) et
      offrir un second chemin quand il ne mène pas à l'annonce. ✅ 2026-09-14.
      **Mesuré** sur les 32 offres ouvertes notées 60 et plus : 14 vraies annonces
      (`jobbank.gc.ca/jobsearch/jobposting/N`), 10 jetons `to.indeed.com`, 4 listes d'emplois
      d'employeur, 4 pages d'accueil. Les 18 liens faibles sont EXACTEMENT les 18 offres du
      jeu de départ présentes dans la liste ; les 14 ingérées portent toutes une annonce.
      La règle retenue porte sur le DERNIER segment du chemin — un `includes` naïf aurait
      classé « liste » les 14 liens qui marchent (`/jobsearch/` contient `jobs`), ce que la
      mutation du test a montré.
- [x] 🔧 **`[LIEN-02]`** Dire depuis quand personne n'a vu l'offre (`lib/fraicheur.ts`,
      PURE). ✅ 2026-09-14. Les offres qui « devraient être périmées » sont les **38 offres
      du jeu de départ**, jamais entrées dans le journal de veille : `appliquerBalayage` ne
      compte d'absences que pour ce qu'il a vu lui-même, donc elles sont INPÉRIMABLES par
      construction. Cette protection est juste et reste — ce qui manquait est l'aveu.
      🧭 **Tranché sans feu vert, à signaler** : elles ne sont PAS archivées d'office sur leur
      âge. Ce sont les mieux notées du suivi (88, 85, 84, 82, 80…) ; les retirer sur une
      supposition ferait l'inverse de ce que Marc demande — il veut cliquer pour vérifier.
      L'alternative écartée : un seuil d'âge qui périme automatiquement.
- [x] 🔧 **`[DUREE-03]`** ✅ **Livré le 2026-09-17, et le vrai défaut était la DUPLICATION.** `joursEntre` (`lib/dureeVie.ts`) rendait **NaN**, pas 0, sur une date
      malformée : son garde teste `undefined`, or `"pas-une-date".split("-").map(Number)`
      rend trois `NaN`, qui ne sont pas `undefined`. Trouvé en écrivant
      `tests/fraicheur.test.ts` (le libellé sortait avec « il y a NaN jours » dedans).
      `lib/fraicheur.ts` se protège par `Number.isFinite`, mais `observer`/`survie` restent
      exposés — en pratique ils ne lisent que des dates écrites par l'app. Bug PRÉEXISTANT,
      non causé par ce lot, **non corrigé sans feu vert**.
      ✅ **CORRIGÉ, et pas comme prévu.** En ouvrant le fichier : cette fonction existait en
      **DEUX exemplaires** dans `lib/`, et l'autre (`lib/relances.ts`) répondait DÉJÀ juste à la
      même question — `Date.parse`, `null` explicite. Le défaut de fond n'était donc pas le
      garde, c'était que personne ne savait qu'une réponse correcte existait à côté. C'est SA
      version qui a gagné ; la copie a disparu. `dureeVie.joursEntre` rend désormais
      `number | null`.
      ⚠️ **`null`, pas `0`** : zéro est une MESURE (« le même jour »), et une date illisible
      n'autorise à affirmer ni la durée ni son absence.
      ⚠️ **Le compilateur a énuméré les consommateurs** — cinq sites, tous déjà gardés par
      `Number.isFinite` (des gardes écrits À CAUSE du NaN). Ils passent à `=== null` : même
      comportement, mais le type l'impose au lieu de compter sur la vigilance.
      ⚠️ **ET J'AI ÉCRIT UNE AFFIRMATION FAUSSE AVANT DE LA MESURER** : « `Date.parse` refuse
      `2026-02-30` ». Non — il le REPORTE au 2 mars, exactement comme l'ancien `Date.UTC`.
      Mesuré, corrigé dans le commentaire, et figé par un test qui écrit la vraie frontière
      (mois hors bornes et forme non ISO refusés ; jour qui déborde reporté). Une limite connue
      vaut mieux qu'une limite redécouverte comme un défaut.
      Verrou : `tests/dureeVie.test.ts`, cinq cas dont l'unicité de l'exemplaire. Deux
      mutations — le défaut d'origine fait rougir SIX tests dans TROIS fichiers (dont des tests
      préexistants de `relances` et `fraicheur`), la copie réintroduite en fait rougir un.

---

## Chantier — la vérification se fait toute seule ✅

Demande de Marc, 2026-09-14 : « quasi toutes les offres sont à vérifier, mais je veux pas
revérifier manuellement, je veux que tu le mettes en place ».

- [x] 🔧 **`[MESURE-01]`** `resume_suivi` (MCP) rend un bloc `veille` : confirmées, jamais
      confirmées, leur répartition par âge, et depuis combien de jours la plus ancienne offre
      suivie n'a pas été revue. ✅ 2026-09-14 — **mesuré aussitôt : 1 572 confirmées, 21
      jamais vues, toutes entre 30 et 90 jours**, contre « quasi toutes » à l'œil.
- [x] 🔧 **`[FERMETURE-01]`** `lib/fermetureAuto.ts` ferme d'office, dans la passe
      quotidienne, ce qu'aucun balayage ne peut confirmer. Seuil d'âge MESURÉ sur la survie
      observée (`lib/dureeVie.ts`), jamais choisi ; échec fermé quand la mesure ne conclut
      pas. ✅ 2026-09-14.
- [x] 🔧 **`[FERMETURE-02]`** La pastille « à vérifier » se tait quand le journal de veille a
      perdu la majorité du suivi : une pastille sur 1 593 offres ne dit rien des offres, elle
      dit que le journal est en panne. ✅ 2026-09-14.
- [x] 🔧 **`[PROFIL-01]`** Le profil actif stocké en base ne passait plus son schéma Zod
      (`ponderation.conditions`, `pointsConditions`, `facteurHorsDomaine`, `termesParJour`
      manquants — les QUATRE ajoutés au même commit, ADR-0014 D2). ✅ 2026-09-14 :
      `lib/profilStocke.ts` comble depuis `PROFIL_DEFAUT` ce que le document n'a pas, champ
      par champ et RÉCURSIVEMENT, **sans jamais écraser une valeur présente**, puis passe le
      schéma STRICT. Une valeur présente mais fausse lève toujours : « ce champ n'existait
      pas encore » et « ce champ est cassé » ne se confondent pas.
      ⚠️ **Correction de ce que cette entrée affirmait** : « tout réglage enregistré est
      ignoré, `termesParJour` compris » était FAUX, et mesuré comme tel. Le rayon et les
      métiers vivent dans leurs propres lignes d'état (`CLE_RAYON`, `CLE_METIERS`),
      `lib/scoring.ts` note avec `PROFIL_DEFAUT` par défaut, et `termesParJour` n'est lu par
      aucun code hors du défaut (c'est la Routine qui l'applique, depuis le protocole). Ce
      qui était réellement cassé : la FICHE de Marc (`/profil` et `/references` affichaient
      le barème et le SWOT du code au lieu des siens) et surtout **`validerProfil`, qui
      refusait — donc plus aucun CV validable**.
- [x] 🔧 **`[BORNES-01]`** `bornes=0/1293 (1293 en échec)` dans les journaux du 2026-09-14,
      plus « boîte englobante anormalement large — interrogation annulée ». ✅ 2026-09-14 :
      la garde d'étendue décide désormais du **découpage**, plus de l'abandon.
      `grapperPourBornes` (`lib/bornes.ts`, PURE) rend des grappes dont chaque boîte respecte
      l'étendue PAR CONSTRUCTION — croissance gloutonne sur la vraie boîte, marge comprise,
      donc aucune taille de cellule ni latitude supposée. La passe interroge les plus grosses
      grappes d'abord, tant que le budget permet une requête entière ; ce qui n'est pas
      atteint repasse. Les positions qu'aucune requête régionale ne peut couvrir sont
      **NOMMÉES avec leurs coordonnées** (à re-géocoder), plus jamais fondues dans un compte.
      ⚠️ Le défaut n'était pas la garde — refuser une requête qui ramènerait un continent est
      juste — mais son EFFET : un seul lieu mal géocodé gelait 1 292 mesures, et le refus
      était définitif (un échec ne marque rien, donc le lot du lendemain était identique).

---

## Constats de production du 2026-09-15 (12:49 UTC)

Les trois correctifs de la veille, vérifiés sur la vraie base après que Marc a ouvert l'app.

- ✅ **`[FERMETURE-03]`** — `perimees` 624 → 645 (+21), `jamaisConfirmees` 21 → 0. La fermeture
      d'office tire ET s'écrit. ⚠️ `meilleureNote` 85 → 78 : les mieux notées du suivi étaient
      ces offres-là. Réversible depuis les archives.
- ✅ **`[BORNES-01]`** — `1/6 grappe(s) interrogée(s) · 225 borne(s) vue(s) · 1178 lieu(x)
      mesuré(s)`, soit `bornes=1178/1300`. Les cinq grappes restantes repasseront (budget).
      ⚠️ **AUCUN aberrant signalé** : ma supposition « homonyme mal géocodé » était fausse. Les
      six grappes sont des amas légitimes — le bassin couvre maintenant Gaspé, Cacouna,
      Cap-Chat, plus de 3° d'étalement réel. Bon remède, mauvaise cause supposée.
- ✅ **`[PROFIL-01]`** — **confirmé par Marc le 2026-09-15** : `/profil` affiche les faits
      tirés de son CV. La branche « aucun CV actif » est donc écartée, et le document se relit
      bien — c'est l'écran qui a tranché ce que les journaux ne pouvaient pas dire.
      ⚠️ **Ce qui reste indéterminé, et c'est une limite d'OBSERVABILITÉ, pas du correctif** :
      aucun `[profil] document antérieur à N champ(s)…` n'a été capté, donc on ne sait pas si
      la migration a comblé quelque chose ou si le document n'avait plus rien à combler. Le
      `console.warn` devait être ce signal ; les journaux Vercel ne l'ont pas rendu, alors
      qu'ils rendent les `console.log` des mêmes requêtes. Une promesse d'observabilité qu'on
      ne peut pas relire n'en est pas une — à re-vérifier au prochain incident de profil
      plutôt qu'à chasser à froid (`[PROFIL-02]`).
- [x] 🔧 **`[PROFIL-02]`** ✅ **Tranché le 2026-09-15 par l'observation, sans écrire une ligne.**
      La question était : le `console.warn` de `profilActif` est-il filtré par Vercel, ou n'a-t-il
      jamais été émis ? Il est apparu au `GET /profil` de 15:44:59 UTC :
      `[profil] document antérieur à 5 champ(s) du barème, comblés depuis le défaut :
      faits.parcours, ponderation.conditions, pointsConditions, facteurHorsDomaine, termesParJour`.
      Rien n'est filtré ; la ligne n'avait simplement pas été émise dans la fenêtre observée la
      veille. **La migration du profil n'est donc PAS silencieuse**, et elle comble cinq champs —
      dont `faits.parcours`, que le diagnostic initial ne nommait pas.
      ⚠️ Leçon : une absence de log dans une fenêtre d'une heure ne prouve rien (rétention Vercel
      ≈ 1 h). Ce lot a existé sur une inférence tirée d'un silence.
- [x] 🧭 **`[TRAJETS-01]`** ✅ **CLOS le 2026-09-16 — la matrice passe.** `[trajets] échec : Matrice refusée (403) — « Routes API » doit être
      activée et dans les restrictions de la clé serveur.` Geste console Google, côté Marc.
      ⚠️ **L'énoncé ci-dessus était une SUPPOSITION du code, pas un diagnostic** : cette phrase
      était déduite du seul nombre 403, alors qu'un 403 de Google porte au moins six causes
      (API non activée, clé hors restrictions, clé NAVIGATEUR côté serveur, restriction d'IP,
      clé invalide, facturation inactive) qui appellent des gestes différents. Cinq fois sur
      six, elle envoyait Marc au mauvais endroit de la console en le laissant croire le
      problème réglé. Livré le 2026-09-15 : `lib/erreurGoogle.ts` lit la cause dans
      `error.details[].reason` (l'identifiant STABLE de Google) et rend LE geste de cette
      cause ; les cinq sites de refus (Routes ×2, Geocoding, Places ×2) y passent.
      **Premier passage réel, 2026-09-15 15:45 UTC** : `Routes API refuse la clé (403). Google
      n'a donné aucune explication lisible — relever la réponse brute pour trancher.` Le message
      n'a donc PAS menti (il a refusé d'inventer « active l'API »), mais il n'apprenait rien :
      les cinq sites lisaient `reponse.json()`, donc un corps vide, une page HTML et un JSON
      muet rendaient la même phrase. Corrigé dans la foulée — lecture en TEXTE, JSON tenté
      dessus, et ce qui ne livre aucune phrase est CITÉ tel quel, borné.
      **CAUSE TROUVÉE — passage de 17:05 UTC, par la citation** :
      `[{ "error": { … "reason": "API_KEY_SERVICE_BLOCKED" … } }]`. Deux faits d'un coup.
      (a) Le geste est **« ajouter Routes API aux RESTRICTIONS D'API de la clé serveur »** —
      Console Google → Identifiants → la clé serveur → Restrictions d'API. L'API est ACTIVÉE ;
      c'est la clé qui ne l'autorise pas. Le message d'origine (« doit être activée ») envoyait
      donc bien au mauvais endroit, comme supposé.
      (b) La cause était dans la table `PAR_REASON` **depuis le premier jour** et n'a jamais été
      atteinte : `computeRouteMatrix` est un endpoint de STREAMING, son refus arrive enveloppé
      dans un TABLEAU, et `.error` sur un tableau vaut `undefined`. Corrigé (`denvelopper`),
      verrouillé par le corps EXACT relevé en production.
      ✅ **GESTE FAIT, ET ÇA MARCHE (2026-09-15)** : Marc a ajouté « Routes API » aux
      restrictions de la clé serveur, et le trajet au clic rend une durée sur la Carte. Reste à
      confirmer la MATRICE au prochain passage — elle demande plus d'un élément, et le budget
      du jour était épuisé par les appels refusés (cf. `[TRAJETS-02]`).
      ✅ **PROUVÉ EN PRODUCTION — cron de veille du 2026-09-16, 11:31:50 UTC** :
      `[trajets] 12 durée(s) remplie(s) · 277 restante(s) pour les passes suivantes`.
      Douze = `MATRICE_MAX_PAR_PASSE`, donc **l'appel entier a été accepté** et douze lignes
      ont été écrites : c'est la PREMIÈRE réussite de `computeRouteMatrix` depuis l'existence
      du lot. Le geste console de Marc (Routes API dans les restrictions de la clé serveur)
      couvre donc bien les DEUX méthodes de l'API — `computeRoutes` (le clic, prouvé la
      veille) et `computeRouteMatrix` (la passe nocturne, prouvé ici).
- [x] 🟡 **`[CARTE-04]`** ✅ **Clos à l'audit du 2026-09-17** — livré le 15/09, et son point d'observation est tranché : `[CARTE-05]` a mesuré que ce lot n'avait rien donné au plan sur un portable. Il n'y a plus rien à observer ici. La barre de filtres est repliée sur la page Carte (2026-09-15, « rends
      la carte plus grande »). ✅ Livré. Reste ouvert comme point d'OBSERVATION : filtrer y coûte
      désormais un clic de plus, et c'est un arbitrage assumé. Si l'usage montre que la
      recherche mérite de rester à l'air libre, la sortir du pli est un changement d'une ligne
      au point d'appel — le pli n'est pas dans `Filtres`.
      ⚠️ **ET CE LOT-LÀ N'A RIEN DONNÉ AU PLAN SUR UN PORTABLE** — Marc : « elle a pas grandi ».
      Mesuré : 337 px avant ET après sur 1366×648, la place libérée étant allée au défilement.
      Voir `[CARTE-05]`, qui livre le vrai levier.
- [x] 🟡 **`[CARTE-05]`** ✅ **Clos à l'audit du 2026-09-17** — livré et mesuré le 15/09, sans retour de Marc depuis. Le point d'observation (« si le défilement gêne, le plancher est le bouton à tourner ») reste écrit dans `app/globals.css`, où il sert. Hauteur du plan : bande d'état + plancher (2026-09-15). ✅ Livré.
      Deux mécanismes, deux écrans : l'enveloppe `.carte-etat` rend `display:inline` opérant
      (il était INERTE sur des items flex — 102 px au lieu de 54, donc +80 px de plan sur un
      grand écran), et le plancher de `.plan-ecran` passe de 26rem à 36rem (+160 px de plan
      sur un portable, au prix de ~80 px de défilement en plus). Mesures datées dans
      `app/globals.css`, mécanismes verrouillés par `tests/carteHauteur.test.ts`.
      **Point d'observation** : si le défilement gêne sur un portable, le plancher est le
      bouton à tourner (34rem est le minimum que le test accepte). Si la carte reste petite
      sur un écran donné, la re-MESURER sur CET écran avant de toucher quoi que ce soit —
      c'est ce qui a manqué au lot précédent.
      ⚠️ **17:18 UTC — le 403 a disparu, mais la vérification est BLOQUÉE pour la journée** :
      `[trajets] sautée : Budget Routes du jour épuisé (48/50 éléments)`. L'appel n'est donc
      même pas parti — on ne sait PAS encore si le geste console a marché. Un clic de trajet
      sur la Carte coûte 1 élément et tient dans les 2 restants : c'est le seul test possible
      aujourd'hui (voir `[TRAJETS-02]`).
- [x] 🟠 **`[TRAJETS-02]`** ✅ **Livré le 2026-09-15.** **Un refus de PLATEFORME ne doit pas consommer le budget Routes.**
      `consommerBudgetRoutes` réserve AVANT l'appel, et son commentaire le justifie : « un appel
      parti est facturé même si sa réponse est illisible ». C'est juste pour un appel que Google
      ACCEPTE — c'est faux pour un **403 `API_KEY_SERVICE_BLOCKED`**, que Google refuse à la
      porte et ne facture pas. Mesuré le 2026-09-15 : **48 des 50 éléments du jour brûlés sans
      qu'un seul trajet n'existe**, uniquement par des appels refusés. Conséquence vécue : le
      geste console de Marc a été fait, et il devient INVÉRIFIABLE jusqu'au lendemain — le frein
      posé pour protéger l'argent bloque la réparation du défaut qui n'a rien coûté.
      C'est la classe de leçon déjà écrite pour les échecs LLM de DriveAI (« classer par ORIGINE
      avant de compter ; une panne de plateforme ne s'impute jamais à l'item »).
      **Correctif proposé** : RENDRE le budget quand la réponse est un refus de configuration
      (401/403 avec une `raison` de `lib/erreurGoogle.ts` ≠ quota). Ne pas rendre sur un 429
      (quota réel), ni sur un succès, ni sur une réponse illisible d'un appel accepté — ce sont
      les cas que la réservation avant appel protège vraiment. Un test par cas, et la mutation
      « on rend toujours » doit rougir.
      ✅ **Fait** : `nonFacture` (`lib/trajetRoutes.ts`) est posé par le site qui a VU la
      réponse — appel jamais parti, ou 401/403 — et `rendreBudgetRoutes` (`lib/budgetRoutes.ts`)
      rend alors ce qui avait été réservé, au JOUR de la réservation, sans jamais descendre
      sous zéro. Restent dépensés : 429, 5xx, et la réponse illisible d'un appel ACCEPTÉ.
      Verrou : `tests/budgetRoutes.test.ts` (10 cas), trois mutations, trois rouges distincts.
      ⚠️ **Ce que ça ne fait PAS** : rendre les 48 éléments déjà brûlés le 2026-09-15. Le
      compteur du jour reste à 50/50 jusqu'à sa remise à zéro (minuit, fuseau de Marc). Aucun
      chemin de correction manuelle n'a été ajouté — ce serait un override d'un frein de
      dépense, et ça se décide.
      ✅ **PROUVÉ EN PRODUCTION — 2026-09-16, 11:31 UTC.** Le compteur, remis à zéro à minuit
      (fuseau de Marc), a servi une réservation de douze éléments qui ont TOUS produit une
      durée. Aucune ligne « Budget Routes du jour épuisé » dans la passe. Le rendu n'a pas eu
      à tirer — il n'y a plus eu de refus à rendre —, ce qui est le résultat attendu et non
      une preuve de son câblage : celle-là reste portée par `tests/budgetRoutes.test.ts`.

---

## Constats de production du 2026-09-16 (cron de veille, 11:31:50 UTC)

Les deux points laissés en suspens la veille, tranchés sur la ligne de journal de la passe.

- ✅ **`[TRAJETS-01]` + `[TRAJETS-02]`** — `[trajets] 12 durée(s) remplie(s) · 277 restante(s)
      pour les passes suivantes`. Première réussite de la matrice. Détail dans chaque entrée.
- ✅ **`[BORNES-01]`** — la campagne est passée de `bornes=1178/1300` (15/09) à **14 lieux
      restants**, en deux grappes. Les grappes que le budget avait laissées de côté ont bien
      été servies par les passes suivantes : le découpage n'était pas en cause, comme annoncé.

- [x] 🟠 **`[BORNES-02]`** ✅ **Corrigé le 2026-09-17, sur feu vert de Marc (« corrige les bornes »).** **La dernière étape de la passe de distances pouvait être affamée, et
      elle l'a été.** Même passe, même ligne de journal :
      `[bornes] 0/2 grappe(s) interrogée(s) · 0 borne(s) vue(s) · 0 lieu(x) mesuré(s)` avec
      `bornes=0/14` et, à la fin, `budget restant=7409 ms`.
      **Le mécanisme** : `mesurerBornes` est appelée en avant-dernier (`lib/actions.ts`, avec
      `budgetRestant()`), et elle refuse de COMMENCER une requête s'il reste moins de
      `DELAI_MAX_MS` = 15 000 ms (`lib/overpass.ts`) — une requête tuée en vol ne rapporte rien
      et consomme tout. Le budget total de la passe est `BUDGET_GEOCODAGE_CRON_MS` = 25 000 ms.
      Il faut donc que TOUT ce qui précède tienne en moins de 10 s pour qu'une seule grappe
      soit interrogée. Ce jour-là le reste a consommé ~17,6 s : zéro grappe, sans qu'aucune
      erreur ne soit levée.
      ⚠️ **Ce n'est pas un blocage définitif** — `mesurerDistances` tourne DEUX fois par jour
      (cron de géocodage 03:00 UTC + cron de veille), et c'est précisément ce qui a drainé les
      1 286 autres. Avec 14 lieux restants, la campagne finira probablement d'elle-même.
      **À décider si elle stagne** : remonter l'étape des bornes AVANT les étapes de géocodage
      (l'ORDRE est la politique d'allocation d'un budget partagé), ou lui réserver sa propre
      enveloppe. Ne rien changer tant que le compte descend — une étape qui avance n'est pas
      une étape à réparer.
      🔴 **MA PRÉDICTION EST DÉMENTIE — mesure du 2026-09-17, 11:31 UTC.** J'avais écrit « pas
      un blocage, ça finira tout seul ». Deuxième passe consécutive à `0 lieu(x) mesuré(s)`, et
      le reste ne descend pas : il **MONTE**, `bornes=0/14` (16/09) → `bornes=0/21` (17/09).
      La condition d'action que j'avais moi-même posée (« si le compte cesse de descendre »)
      est donc dépassée : il ne stagne pas, il croît.
      **CE QUI L'EXPLIQUE, et c'est structurel, pas accidentel.** Le budget restant à la FIN de
      la passe est remarquablement stable — 7 409 ms le 16/09, 7 722 ms le 17/09 — donc ce qui
      PRÉCÈDE consomme ~17,5 s des 25 s (`BUDGET_GEOCODAGE_CRON_MS`) de façon reproductible.
      L'essentiel part dans les recherches Nominatim (`situerLot`, plafonné à
      `MAX_SITUATIONS_CRON` = 8, ~2 s l'appel) — qui ont rendu `situées=0/10` les deux jours :
      du temps dépensé sans rien placer, pendant que l'étape suivante a besoin de 15 s d'un
      coup pour seulement COMMENCER. Et les DEUX passes quotidiennes ont le même budget et le
      même ordre, donc elles s'affament de la même façon : il n'y a pas de « seconde chance »,
      c'est ce que je supposais et c'était faux.
      **Pourquoi ça marchait avant** : les 1 286 mesures ont été prises quand le travail en
      amont était moins cher. Le registre a grandi (`registre=0/1042`, 1 005 absentes), l'amont
      s'est renchéri, et l'étape des bornes est passée SOUS le seuil — sans qu'aucune ligne ne
      change. C'est « drainer avant d'alimenter » : l'alimenteur (les entreprises nouvellement
      placées) tourne, le drainage n'a plus jamais de budget.
      **Remède recommandé** : remonter `mesurerBornes` AVANT les étapes Nominatim, en la gardant
      gatée sur son propre besoin. L'ORDRE est la politique d'allocation d'un budget partagé ;
      une étape placée en avant-dernier derrière un poste qui grossit finit toujours par ne plus
      jamais tourner. Coût : les placements Nominatim perdent jusqu'à 15 s les jours où des
      bornes restent à mesurer — et ils ne placent rien en ce moment.
      ⚠️ **CORRECTION DE MON ATTRIBUTION.** J'ai écrit que « l'essentiel part dans les recherches
      Nominatim ». C'est une DÉDUCTION, pas une mesure : le journal donne le budget restant en
      fin de passe, jamais la durée de chaque étape. Et un candidat sérieux que j'avais manqué
      vit entre les deux — `adressesDepuisRegistre` n'est bornée par RIEN (son commentaire le
      dit : « aucun accès réseau, cette passe n'est donc bornée par rien ») et travaille sur
      1 042 entreprises contre 28 821 établissements, un volume qui a grandi exactement comme
      l'amont s'est renchéri. Ce qui est MESURÉ : l'amont, dans son ensemble, consomme ~17,5 s
      des 25 s, de façon reproductible. Qui exactement, on ne le sait pas.
      ✅ **CORRECTIF LIVRÉ — une enveloppe DÉDIÉE, pas un déplacement d'étape.**
      `BUDGET_BORNES_VEILLE_MS` (20 s) est accordée à `mesurerBornes` par le SEUL cron de
      veille, dont la route est à `maxDuration = 300`. Le cron de géocodage (60 s) ne la reçoit
      pas et garde exactement le comportement d'avant. Le budget partagé n'est PAS touché — son
      propre commentaire l'interdit sans re-dériver le pire cas contre le mur de 60 s, et écrit
      noir sur blanc : « vouloir un débit plus haut = ajouter une PASSE, JAMAIS agrandir
      celle-ci ».
      ⚠️ **Pourquoi PAS le déplacement en tête de passe que je recommandais hier — j'avais
      tort.** `bornesLe` ne se pose qu'UNE fois par lieu, et `raffinerPositions` tourne juste
      avant : mesurer les bornes AVANT lui les figerait DÉFINITIVEMENT depuis le centre-ville,
      et pas pour un cas marginal — une entreprise épinglée au centre à l'étape « 0 bis » est
      précisément la PREMIÈRE candidate au raffinage de la même passe (le tri prend le
      `geocodeLe` le plus ancien, et elle porte `EPOQUE_A_RETENTER`). On aurait troqué une étape
      affamée contre une donnée fausse sur chaque nouvelle entreprise.
      Verrou : `tests/budgetPasse.test.ts`, quatre invariants — l'enveloppe suffit à COMMENCER
      une requête, elle est accordée par la veille ET consommée par l'étape (les deux moitiés,
      sinon c'est le trou de `[FERMETURE-03]`), le cron 60 s ne la reçoit pas, et le mur de la
      route qui l'accorde tient le budget partagé plus l'enveloppe avec une marge de 2×.
      Cinq mutations, cinq rouges distincts.
      ⚠️ **Ce que ça ne prouve pas** : que les 21 lieux seront mesurés. Ça se vérifie sur la
      ligne `[bornes]` de la prochaine passe, pas sur un déploiement vert.
- [ ] 🟡 **`[DISTANCES-01]`** **Une étape de la passe de distances n'est bornée par RIEN, et
      son volume grandit.** Découvert en corrigeant `[BORNES-02]` — signalé, non corrigé.
      `adressesDepuisRegistre` (lib/actions.ts) ne reçoit aucun budget : son commentaire
      l'assume (« aucun accès réseau, cette passe n'est donc bornée par rien et comble TOUTES
      les adresses manquantes d'un coup »). L'argument tenait quand le registre était petit ;
      au 2026-09-17 elle traite 1 042 entreprises contre 28 821 établissements, et le budget
      partagé qu'elle traverse en a ~17,5 s de consommés. Tant qu'elle reste rapide, rien à
      faire — mais **rien ne le mesure**, et c'est ça le défaut : une étape sans borne dans un
      budget partagé est invisible jusqu'au jour où elle le mange.
      **Remède recommandé** : publier la durée de CHAQUE étape dans la ligne `[distances]`.
      Le diagnostic deviendrait certain au lieu d'être déduit — c'est exactement ce qui a
      manqué ici, et ce qui m'a fait accuser Nominatim sans preuve.
      ✅ **LIVRÉ le 2026-09-17** (« continue les tâches backlog »), tel que recommandé :
      `lib/jalons.ts` (pur, horloge injectée) et une ligne DÉDIÉE
      `[distances] budget par étape — villes:Nms centres:Nms … (total N ms)`, neuf jalons.
      Une ligne à part parce que celle des comptes est déjà longue et répond à une AUTRE
      question. Ordre chronologique et non trié par durée : ce qu'on cherche est l'étape qui
      affame CELLES QUI LA SUIVENT, et c'est une relation d'ordre. Les zéros restent affichés.
      ⚠️ L'étape non bornée n'est PAS bornée par ce lot — elle est désormais MESURÉE. Le
      défaut corrigé est l'absence d'instrument, pas la durée ; borner se décidera sur le
      chiffre, s'il le demande.
      Le mode de panne de l'instrument est l'oubli : un inventaire des neuf noms rougit si une
      étape est ajoutée sans son jalon. Trois mutations prouvées (horodatages cumulés, zéros
      masqués, jalon retiré).
      ✅ **PREMIÈRE MESURE, 2026-09-18 11:31:50 — ET ELLE RÉFUTE LE SOUPÇON DE CET ITEM.**
      `[distances] budget par étape — villes:1ms centres:448ms situer:6403ms adresses:84ms
      registre:767ms raffinage:11922ms bornes:2617ms details:85ms mesure:615ms (total 22 942 ms)`
      ⚠️ **L'étape NON BORNÉE — `adressesDepuisRegistre` — coûte 767 ms, soit 3,3 % du total.**
      C'était elle que cet item désignait comme le risque. Le vrai poste est `raffinage` à
      **11 922 ms (52 %)**, suivi de `situer` à **6 403 ms (28 %)** : 80 % du budget part dans
      DEUX étapes qui appellent Nominatim.
      ⚠️ **Ce qui est corroboré et ce qui ne l'est pas, séparément** : ma déduction du 17/09
      (« l'amont consomme ~17,5 s », attribués à Nominatim) est CONFIRMÉE en agrégat — 18,3 s
      pour les deux étapes Nominatim. Mon inquiétude sur l'étape sans borne, elle, est
      DÉMENTIE. Une déduction juste sur un total peut couvrir une erreur sur la cause : c'est
      exactement pour ça que l'instrument existe.
      ➜ **Conséquence** : borner `adressesDepuisRegistre` ne servirait à rien aujourd'hui. Si
      un jour il faut gagner du budget, c'est le raffinage qu'il faut regarder — et il est
      déjà plafonné à 8 candidates (voir `[V-ROUTINE-QUOTA]`).
- [x] 🟡 **`[TRAJETS-03]`** ✅ **Livré le 2026-09-16, sur « accélère les trajets » (Marc).** **Le débit des durées était plafonné par la PASSE, pas par le budget
      — et la justification de la constante a rôti.** `MATRICE_MAX_PAR_PASSE` = 12, avec en
      commentaire « douze par nuit couvrent le stock d'entreprises placées en trois jours ».
      Mesuré le 2026-09-16 : **277 durées restantes** après la passe, soit ~23 jours à ce
      rythme. Le stock a grandi, le chiffre n'a pas suivi.
      Le budget quotidien (`ROUTES_ELEMENTS_MAX_PAR_JOUR` = 50) n'est donc utilisé qu'au
      quart : 12 éléments sur 50, une seule passe de veille par jour (le plan Vercel est
      **hobby**, un cron par jour). Monter la constante à 48 finirait le stock en six jours
      sans toucher au frein quotidien.
      ⚠️ **C'est une décision de DÉPENSE, donc elle revient à Marc** : ça consomme le budget
      Routes quatre fois plus vite. Rien n'est changé ici.
      ⚠️ Et si la constante bouge, re-dériver son commentaire depuis le stock RÉEL plutôt que
      d'y réécrire une durée — c'est exactement ce qui vient de se périmer.
      ✅ **FAIT — 12 → 40 par passe, et la borne est DÉRIVÉE.**
      `MATRICE_MAX_PAR_PASSE = ROUTES_ELEMENTS_MAX_PAR_JOUR − MARGE_CLICS_PAR_JOUR`, soit
      50 − 10. **277 restantes : ~23 jours → ~7 jours.**
      **Pourquoi 40 et pas 48** (qui aurait donné 6 jours) : la passe et le clic partagent le
      MÊME compteur, et la matrice ne remplit qu'une DURÉE — le tracé sur la carte vient du
      clic, qui coûte un élément de plus. À 48, il resterait deux clics par jour tant que la
      passe a du travail. Un jour de rattrapage en plus contre cinq fois plus de marge de
      clic : l'arbitrage n'est pas serré.
      **Pourquoi DÉRIVÉE et pas écrite en dur** : une borne par passe posée au-dessus du
      plafond quotidien ferait refuser la réservation ENTIÈRE à chaque passe — plus une seule
      durée remplie, pour toujours, avec « Budget Routes du jour épuisé » pour seule trace,
      c'est-à-dire une configuration qui se bloque elle-même en ressemblant à un frein qui
      marche. Dérivée, elle suit le plafond et ne peut pas le dépasser.
      **Et le commentaire est réécrit en BUDGET, pas en durée** : l'ancien promettait « trois
      jours » et s'est périmé sans bruit quand le stock a grandi. Une borne exprimée en « ce
      qu'on accepte de dépenser par jour » reste vraie quel que soit le stock ; le rythme se
      lit dans le journal (`[trajets] N remplie(s) · M restante(s)`).
      Verrou : `tests/budgetRoutes.test.ts`, trois invariants dérivés des constantes (jamais
      de leur valeur du jour) — la passe ne peut pas demander plus que le jour, elle laisse
      au moins un clic, elle remplit encore quelque chose. Trois mutations, trois rouges.
      ⚠️ **Ce qui reste à surveiller** : la passe écrit une ligne par élément, à la fin d'une
      invocation qui a déjà ingéré et géocodé. Le cron de veille a 300 s (large), mais le cron
      de géocodage qui la REPREND quand elle est restée muette n'a que 60 s. Une coupure au
      mur y laisserait des éléments réservés pour un travail à moitié écrit — du budget perdu,
      jamais une ligne fausse, et la passe suivante refait le reliquat. Si ça se produit, le
      remède est de grouper les écritures en une seule, pas de redescendre la borne.
      ✅ **MESURÉ AU PREMIER PASSAGE — 2026-09-17, 11:31 UTC** :
      `[trajets] 40 durée(s) remplie(s) · 241 restante(s) pour les passes suivantes`.
      La borne tient, aucun refus de budget, aucune coupure au mur (le risque ci-dessus ne
      s'est pas matérialisé sur le cron de veille, qui a 300 s). Attendu 237, mesuré 241 : le
      stock GROSSIT d'environ quatre par jour (offres ingérées puis entreprises placées), donc
      le drainage NET est ~36/jour et l'horizon reste ~7 jours.
      ⚠️ **DEUXIÈME MESURE, 2026-09-18 11:31:50 — et elle CORRIGE l'horizon ci-dessus** :
      `[trajets] 40 durée(s) remplie(s) · 223 restante(s) pour les passes suivantes`.
      La borne tient toujours (40/40, aucun refus de budget). Mais l'arithmétique dément le
      « ~4 par jour » : 241 − 40 aurait dû donner **201**, le relevé dit **223**. Il est donc
      arrivé **22 nouvelles durées à remplir** dans la journée — cinq fois mon estimation.
      Drainage NET ≈ 18/jour, horizon **~12 jours** et non ~7. [Certain sur le delta mesuré]
      ⚠️ **Avec une réserve que je ne masque pas** : Marc a relancé une veille à la main le
      17/09 au soir, et cette passe a pu remplir jusqu'à **10** durées (le plafond quotidien de
      50 était déjà entamé de 40). Si c'est le cas, les arrivées valent 32 et le drainage net
      ~8/jour. La fourchette honnête est donc **18 à 8 par jour, soit 12 à 28 jours** — le
      journal d'une passe ne permet pas de trancher, il faudrait DEUX relevés consécutifs sans
      passe manuelle entre eux. [À vérifier]
      ➜ Ce qui est SÛR et ne dépend pas de la réserve : le stock grossit plus vite qu'annoncé,
      et l'horizon « ~7 jours » écrit le 17/09 est optimiste. Ne pas le recopier.
- [ ] 🟡 **`[TEST-FLAKE-01]`** **Bug préexistant, vu au gate du 2026-09-16.**
      `tests/oauthStore.test.ts` a échoué sur `Hook timed out in 10000ms` — son `beforeAll`
      démarre une base PGlite en mémoire et applique les migrations. Relancé SEUL dans la
      foulée : vert en 1,8 s. C'est donc la contention de la suite complète qui fait déborder
      le `hookTimeout` de 10 s par défaut, pas le test. Remède probable : un `hookTimeout`
      explicite sur ce fichier (le seul qui démarre un moteur Postgres). Non corrigé —
      découvert en chemin, hors périmètre du contrôle.
      ✅ **CORRIGÉ le 2026-09-17** (« continue les tâches backlog »), comme prévu :
      `beforeAll`/`afterAll` reçoivent **30 s** — ~16× le coût mesuré en isolation (1,8 s),
      assez pour absorber la contention, assez peu pour qu'un VRAI blocage échoue encore vite.
      Posé sur CE fichier et pas dans `vitest.config.ts` : relever le défaut global couvrirait
      les 97 autres, qui n'ont aucune raison de dépasser 10 s, et un `beforeAll` qui pend
      ailleurs cesserait de se voir.
      ⚠️ **Aucune garde ne verrouille la valeur, et c'est dit** : un test qui asserterait
      « 30 s » serait tautologique, un test qui prouverait la contention serait lui-même
      instable. Ce qui tient le rôle est le gate — si le flake revient, il se reverra là.

- [x] 🟠 **`[LIEN-03]`** ✅ **Livré le 2026-09-17, sur signalement de Marc** (« il y a des jobs
      périmés qui devraient plus être là, tu check pas assez bien à chaque jour »).
      **MESURÉ AVANT DE CODER, et le diagnostic n'est pas celui que la plainte désigne.** Le
      balayage FAIT son travail tous les jours : `resume_suivi` donne `confirmees` 1 635,
      `jamaisConfirmees` 0, `plusVieilleVueJours` **4** — aucune offre ouverte n'est restée
      plus de quatre jours sans être revue, et le seuil de péremption est à 2 jours sous
      couverture complète. Ce qui ne bougeait PAS, c'est le **LIEN** : une offre déjà connue
      est comptée « doublon » par `trier`, et **rien d'elle n'était jamais réécrit**. Le
      Guichet republiant le même poste sous un NOUVEAU numéro d'annonce, l'entrée restait
      ouverte — à juste titre, la source la publie — en pointant sur l'annonce FERMÉE vue la
      première fois. Marc cliquait, tombait sur une offre expirée, et concluait que la
      vérification quotidienne ne marchait pas. Elle marchait ; c'est l'adresse qu'elle ne
      mettait pas à jour.
      Le stock le rend visible : sur les 17 offres ouvertes notées 60+, sept portent
      `dateReperage: 2026-08-20` — vingt-huit jours, sur un support où une annonce tient
      rarement plus de trente.
      ✅ **CORRECTIF.** `liensARafraichir` (PURE, `lib/ingest/pipeline.ts`) rend les offres
      suivies dont le lien a changé depuis la dernière vue, à partir du MÊME matcheur que le
      marquage « vue » (`brutesParIdStocke`, qui résout aussi les variantes de raison
      sociale) — une règle, deux consommateurs, jamais deux copies. Deux refus d'écrasement :
      un lien VIDE ne remplace jamais celui qu'on a, un lien IDENTIQUE ne produit aucune
      écriture (le cas nominal ne touche pas la base). **Seul le lien** : ni `statut`, ni
      `prio`, ni `dateEnvoi`, ni `userNote` (garde-fou n°2), ni la ville (elle déplacerait
      l'épingle et la distance), ni la note (protocole §11).
      Branché dans les DEUX chemins d'écriture — `lib/veilleComplete.ts` et
      `app/api/ingest/depot/route.ts` — parce qu'un seul aurait rouvert le défaut par la porte
      d'à côté, exactement comme `[FERMETURE-03]`.
      Observabilité : la ligne `[veille]` porte désormais `liens=N`. Sans elle, « le correctif
      a tiré » et « il n'y avait rien à rafraîchir » produiraient le même silence.
      Verrou : `tests/ingest-pipeline.test.ts` — six cas purs plus quatre de branchement
      (chaque chemin écrit le lien, et n'écrit QUE lui). Six mutations, six rouges distincts.
      ⚠️ **CE QUE JE N'AI PAS PU MESURER** : l'état réel des annonces. `jobbank.gc.ca` est
      injoignable depuis la session (mesuré : HTTP 000 sur cinq URL du suivi), donc je ne peux
      pas dire COMBIEN des 17 pointaient sur une annonce fermée. Le mécanisme est établi par
      le code ; son ampleur ne l'est pas. La preuve viendra de `liens=N` à la prochaine passe.
      ⚠️ **Et ce que ça ne corrige pas** : si le Guichet continue de republier un poste que
      Marc considère comme mort, l'entrée reste — avec le bon lien. Le délai de péremption
      reste à 2 jours (son choix, 2026-09-17) : le descendre à 1 ferait fermer des offres
      vivantes au premier hoquet du flux, incident déjà vécu (40 offres périmées en 3 jours).

### `[LIEN-03]` — mesuré en production le 2026-09-17, 17:31 UTC (passe lancée par Marc)

    [veille] bouton-app — ingérées=8/1600 périmées=0 revenues=3 doublons=1548
             hors-région=4 sous-plancher=0 lieu-inconnu=40 en-sursis=209 liens=226 sources=2

**`liens=226`** : le correctif a tiré. 226 offres suivies portaient un lien qui ne
correspondait plus à l'annonce que la source publie aujourd'hui.

⚠️ **ET LE CHIFFRE SE LIT AVEC SON DÉNOMINATEUR.** 226 sur les **1 548** offres que le flux a
re-présentées ce jour-là, soit **~15 %** — pas 226 sur ce que Marc regarde. Vérifié par un
avant/après sur ses 17 offres ouvertes notées 60+ : **une seule** a changé de lien,
`Groupe DSD Inc` (`49422722` → `50155497`). Les seize autres pointaient déjà sur l'annonce
courante. Le gros du rattrapage est donc dans la longue traîne qu'il ne consulte pas.

**Ce que ça prouve quand même** : l'écart n'est pas cosmétique. 730 000 numéros d'annonce
séparent l'ancien lien du nouveau — c'est une AUTRE annonce, republiée plus tard, et l'ancienne
est selon toute vraisemblance fermée. La règle est aussi conservatrice qu'annoncé : sur 17
offres, elle n'a réécrit que celle qui avait vraiment bougé.

⚠️ **CE QUE ÇA N'EXPLIQUE PAS.** Marc a écrit « des jobs périmés », au pluriel, et le correctif
ne rend compte que d'UN cas dans sa liste. Si l'écran continue de lui montrer des annonces
fermées, la cause restante est ailleurs — il faut alors qu'il NOMME une offre précise, parce
que `jobbank.gc.ca` est injoignable depuis la session (HTTP 000) et que je ne peux pas
vérifier l'état d'une annonce moi-même.

- ✅ **`[BORNES-02]`** — `bornes=0/0` sur la passe de 17:31:14 : plus AUCUN lieu à mesurer (il
      en restait 21 le 17/09 au matin). ⚠️ Je ne peux pas dire QUEL chemin les a drainés : une
      passe déclenchée par une PAGE dispose de `BUDGET_PASSE_PAGE_MS` (35 s), bien plus que les
      25 s du cron, et a pu y suffire sans l'enveloppe. Le verdict sur l'enveloppe elle-même
      viendra du prochain cron de veille.
- ℹ️ `[trajets] sautée : Budget Routes du jour épuisé (41/50 éléments)` — attendu : 40 pris par
      la passe de 11:31 plus un clic. La marge de 10 réservée aux clics joue son rôle.
- [ ] 🟡 **`[LIEN-04]`** **Une réserve écrite à l'ingestion n'est jamais retirée quand elle
      cesse d'être vraie.** Vu en lisant `groupe-dsd-inc-plastic-products-manufacturing-supervisor`
      le 2026-09-17 : la fiche porte `km: 81.2` ET la réserve « Annoncée à Thetford Mines — la
      distance reste à mesurer ». Les deux s'affichent ensemble, et la seconde est fausse depuis
      que la première existe. `raisonsAutomatiques` (lib/ingest/pipeline.ts) écrit cette phrase
      une fois, à l'ingestion, quand `km` est encore nul ; rien ne la retire quand la mesure
      arrive. Même famille que `[LIEN-03]` : un champ figé à la première écriture, qui continue
      d'affirmer au présent.
      **Remède** : ne pas la stocker — la DÉRIVER à l'affichage de `km === null`. Une phrase qui
      décrit un état se calcule depuis l'état, elle ne se recopie pas.
      ⚠️ Attention en corrigeant : `villeDepuisRaisons` RELIT cette phrase pour rattraper une
      ville manquante (`PREFIXE_VILLE_ANNONCEE`). La retirer des données casserait ce
      rattrapage — c'est un consommateur, pas une décoration.
      ✅ **CORRIGÉ le 2026-09-17** (« continue les tâches backlog »). ⚠️ **Le remède recommandé
      ci-dessus était PIÉGÉ et n'a pas été appliqué tel quel** : cesser d'écrire la phrase
      aurait cassé `villeDepuisRaisons` en silence — la ville n'a aucun autre porteur pour les
      offres entrées avant la colonne `ville`. Ce qui est corrigé n'est donc pas la DONNÉE mais
      l'AFFIRMATION qu'on en tire : `raisonsAffichables(raisons, km)` masque la réserve dès que
      la distance est mesurée, et la phrase reste en base pour le rattrapage.
      La règle vit dans un module FEUILLE (`lib/raisons.ts`, sans dépendance, importable par un
      composant client) avec l'écriture et la relecture de la même phrase — trois gestes qui
      doivent coïncider. **TROIS** surfaces la consomment : la carte, la fiche, et la vue MCP —
      celle-là ne se regarde pas, elle se LIT dans une conversation, et je l'avais oubliée au
      premier jet. `0 km` est traité comme une MESURE, pas comme un inconnu.
      Trois mutations prouvées : filtre toujours actif (supprime la fonctionnalité), `!km` à la
      place de `km === null` (le zéro effacé), vue MCP débranchée.

---

## Consolidation — 2026-09-18

- [x] 🟠 **`[ACTIONS-01]`** ✅ **Livré le 2026-09-18** (« continue les tâches backlog »).
      **Cinq modules `lib/actions*.ts` portent des Server Actions ; DEUX étaient testés,
      TROIS ne l'étaient pas.** `actionsVeille` et `actionsTrajet` avaient leurs verrous,
      `actionsRayon`, `actionsMetiers` et `actionsAnalyse` n'en avaient aucun — la signature
      d'un patron appliqué à côté mais pas ici : le risque était connu, traité deux fois, et
      les trois voisins oubliés. `tests/actionsReglages.test.ts`, 11 cas, 3 mutations.
      **Ce qui est verrouillé, et la conséquence de chacun** :
      · **La session est revérifiée, et le refus arrive AVANT toute écriture.**
        `lib/session.ts` le dit en toutes lettres (« une Server Action n'est pas une route,
        c'est un point d'entrée POST appelable directement ») — c'était une promesse en
        commentaire. Pour `lancerAnalyseMarche`, la conséquence est chiffrable : **l'action
        fait un appel FACTURÉ**, donc la garde protège une dépense.
      · **L'ordre des deux écritures de `reglerRayon`** : le rayon d'abord, le registre
        re-jugé ensuite. Le module l'explique sur huit lignes et rien ne le tenait. Inversé,
        on laisse un registre jugé sous un rayon jamais écrit — incohérent avec l'écran, et
        rien ne le rattrape.
      · **Un refus de validation n'écrit rien** (saisie hors bornes, trop de codes).
      · **Une saisie partiellement illisible garde sa part valide ET rend ses rejets** — les
        deux moitiés sont délibérées, en perdre une trompe Marc dans un sens ou dans l'autre.
      · **Une analyse PAYÉE n'est pas perdue** quand l'écriture d'état échoue.
      ⚠️ **Avec son contrôle d'anti-vacuité** : « aucun appel facturé » ne prouve rien tant
      qu'un cas ne montre pas que le même espion sait en VOIR un. Sans lui, un espion jamais
      câblé rendait les deux cas verts.
      ⚠️ **Deux pièges payés en écrivant les tests, tous deux déjà nommés dans les leçons du
      hub** : (a) les clés d'état recopiées de mémoire (`"rayon"`, `"metiers"`) valent en
      réalité `veille-rayon` et `veille-metiers` — elles se dérivent désormais de leur
      CONSTANTE ; (b) une **fixture aux mauvais noms de champs** (`{ km, dansLeRayon }` contre
      un `LieuJuge` qui porte `{ verdict, km, le, essais }`) rendait `verdict` `undefined`,
      donc comptait une bascule PARTOUT, donc rendait le contrôle négatif vert par accident.

- [ ] 🟡 **`[ACTIONS-02]`** **Treize modules `lib/` ne sont importés par aucun test.**
      ✅ **PREMIER LOT LIVRÉ le 2026-09-18** — `tests/gardesEntree.test.ts`, 13 cas, 3 mutations.
      Trois des douze restants ne sont pas des modules ordinaires : ce sont des **GARDES**, du
      code dont le seul travail est de refuser. Un module de calcul sans test rend un mauvais
      chiffre, qu'on finit par voir ; une garde sans test ne rend RIEN — elle laisse passer.
      `cheminInterne` (tremplin d'après-connexion), `origineDe` (l'en-tête `Host` ne décide pas
      de l'adresse publiée dans les métadonnées OAuth), `domicile` (pas de position plutôt
      qu'une position fausse). **Et les exercer a trouvé deux défauts, ci-dessous.**
      ⚠️ Nuance mesurée en écrivant : `AUTH_URL=""` n'est PAS remplacée par `NEXTAUTH_URL` —
      `??` est le coalescement NULLISH. Mon premier test posait `""` et mesurait donc autre
      chose que son titre. Reste après ce lot : neuf modules.
      Recensé le 2026-09-18, après `[ACTIONS-01]` (qui en a retiré trois). Par taille :
      `ingest/sources.ts` (269), `donnees.ts` (126, MOCKÉ seulement), `domicile.ts` (91),
      `coutLlmStore.ts` (77, mocké), `mesureLieux.ts` (75), `adresse.ts` (58), `etat.ts` (51),
      `navigation.ts` (50), `connexionHub.ts` (47), `analyseConservee.ts` (42), `db/index.ts`
      (36), `mcp/origine.ts` (22), `session.ts` (21, mocké).
      ⚠️ **« MOCKÉ seulement » n'est pas « couvert »** : un module qui n'apparaît que comme
      cible de `vi.mock` n'est jamais exercé — c'est le patron exact que `[CV-09]` avait
      trouvé (« un mock de confort de la fonction sous test masque à vie ses propres bugs »).
      `session.ts` est dans ce cas, et c'est la garde de TOUTES les Server Actions.
      ⚠️ **Le recensement lui-même s'est trompé DEUX FOIS avant d'être juste**, et le chiffre
      annoncé a valu successivement 17, 39, 68 puis 13. Cause : le dépôt importe sous DEUX
      formes (`@/lib/x` et `../lib/x`), et mes témoins de contrôle étaient tous de la première.
      **Un recenseur ne voit que les formes que son auteur avait sous les yeux** — d'où des
      témoins nommés dans CHAQUE forme avant de se servir de la sortie. Ne pas reprendre la
      liste ci-dessus sans la re-mesurer : elle décrit une population, pas un mécanisme.

- [x] 🔴 **`[REDIR-01]`** ✅ **CORRIGÉ le 2026-09-18, sur feu vert de Marc (« go »).**
      **La garde anti-tremplin de `cheminInterne` se contournait par un
      ANTISLASH — et le second verrou qu'elle invoquait N'EXISTAIT PAS.** Trouvé le 2026-09-18 en
      écrivant les tests de `[ACTIONS-02]`, **NON corrigé** (bug préexistant : il se signale,
      il ne se répare pas sans feu vert).
      **MESURÉ**, à travers la vraie fonction, pas une réécriture :
      ```
      "/\evil.com"   → cheminInterne rend "/\evil.com"   → callbackUrl origin = https://evil.com
      "/\/evil.com"  → cheminInterne rend "/\/evil.com"  → callbackUrl origin = https://evil.com
      "//evil.com"    → cheminInterne rend "/"             → callbackUrl origin = emploi.hubperso.com
      ```
      **La cause** : la garde teste `startsWith("//")`, et l'analyseur d'URL du navigateur (norme
      WHATWG) NORMALISE l'antislash en barre oblique pour les schémas spéciaux. `/\` et `/\/`
      deviennent donc `//` APRÈS la garde. Le commentaire du module nomme exactement cette
      classe (« `//evil.com` ressemble à un chemin sans en être un ») : l'auteur la connaissait,
      il a couvert une forme sur trois. C'est la règle §9 n°128 du `CLAUDE.md`, mot pour mot —
      « un contrôle de sécurité se teste avec les chaînes d'attaque EXACTES ».
      ⚠️ **ET LE SECOND VERROU CITÉ PAR LE COMMENTAIRE N'EXISTE PAS.** `lib/connexionHub.ts`
      écrit : « Le hub valide cette destination de son côté (`lib/retour.ts`) : il n'accepte que
      les sous-domaines de `hubperso.com` ». **Il n'y a aucun `lib/retour.ts` dans Hubperso**
      (vérifié sur `b401f6a`) ; `app/login/page.tsx` passe `callbackUrl` directement à
      `signIn("google", { redirectTo: … })`. Une promesse de verrou sans verrou.
      ⚠️ **CE QUE JE N'AI PAS MESURÉ, ET QUE JE NE PRÉTENDS DONC PAS** : que la chaîne soit
      exploitable de bout en bout. Auth.js applique par défaut un `redirect` qui refuse une
      origine étrangère, et Hubperso ne le surcharge pas — ce troisième filet joue
      probablement. Mais il n'a pas été exercé, et la sécurité de JobAI ne peut pas reposer sur
      le comportement par défaut d'une dépendance du hub. [Probable, non mesuré]
      **Correctif proposé (une ligne)** : refuser aussi l'antislash en 2ᵉ position — ou mieux,
      NORMALISER avant de juger (`new URL(valeur, "https://x.invalid")` et exiger que l'origine
      obtenue soit `https://x.invalid`), ce qui ferme la classe entière au lieu d'une forme de
      plus. Le test d'attaque est déjà écrit dans `tests/gardesEntree.test.ts` pour `//` : il
      suffit d'y ajouter les deux chaînes mesurées.
      ⚠️ **Aucun test ne fige le contournement**, délibérément : écrire `expect(cheminInterne(
      "/\evil.com")).toBe("/\evil.com")` verrouillerait le défaut. Ce qui le porte est cet item.
      ✅ **CORRECTIF LIVRÉ — la CLASSE, pas une forme de plus.** `cheminInterne` ne compare
      plus du TEXTE : elle demande à l'analyseur d'URL lui-même où mène le chemin, contre une
      origine témoin jetable (`https://temoin.invalid`, domaine réservé RFC 2606, jamais
      requêté). Origine différente ⇒ refus. Ajouter une forme de plus à une liste textuelle
      aurait laissé la quatrième dehors ; juger sur ce que la plateforme FAIT ferme l'ensemble.
      **Mesuré après correctif** : les quatre formes à antislash, `//evil.com` et
      `https://evil.com` rendent toutes `/` ; `/carte` et `/offre/42?vue=liste#bas` passent
      VERBATIM. La valeur n'est pas normalisée au retour — la garde répond « interne ou pas »,
      elle ne réécrit pas la demande.
      ✅ **Et le commentaire menteur est corrigé dans le même commit.** Il raconte désormais ce
      qui a été vérifié : pas de `lib/retour.ts` dans le hub, un filet Auth.js par défaut qui
      joue probablement mais qui appartient à une dépendance du hub et n'a jamais été exercé
      ici. Une promesse de verrou rendait la vraie garde moins relue qu'elle n'aurait dû l'être.
      Verrou : `tests/gardesEntree.test.ts` porte les **chaînes d'attaque exactes** (règle §9
      n°128) et vérifie AUSSI le `callbackUrl` produit — la garde ne vaut que si l'appelant en
      hérite, et c'est là que le défaut se voyait. Mutation jouée : retour à la garde textuelle
      ⇒ 2 rouges.

- [x] 🟠 **`[ENV-VIDE-01]`** ✅ **CORRIGÉ le 2026-09-18, sur feu vert de Marc (« go »).**
      **Une variable d'environnement VIDE n'est pas une variable absente,
      et deux endroits confondaient les deux.** Trouvé le 2026-09-18 avec `[REDIR-01]`, **NON
      corrigé** (même raison).
      `Number("")` vaut **0**, et `Number.isFinite(0)` vaut **true** (mesuré). Donc :
      · **`DOMICILE_LAT=""` + `DOMICILE_LON=""` ⇒ `domicileConfigure()` rend `{lat: 0, lon: 0}`**,
        au large de la Guinée. Le repli par adresse n'est jamais atteint, et **toutes** les
        distances sont calculées depuis ce point sans qu'aucun écran ne puisse le démentir.
        C'est « no fake data » pris à revers : une coordonnée plausible et fausse.
      · `DOMICILE_LAT=" "` fait pareil (`Number(" ")` vaut 0).
      · **`AUTH_URL=""` court-circuite `NEXTAUTH_URL`** (`??` est nullish) et fait retomber
        `origineDe` sur l'en-tête de la requête — exactement ce que ce module refuse.
      ⚠️ **Le scénario n'est pas théorique** : une variable créée puis laissée blanche dans
      l'interface Vercel donne une chaîne vide, pas une absence.
      **Correctif proposé** : comparer la chaîne BRUTE à `""` après `trim()` avant de la
      convertir, aux trois endroits. Et comme c'est une CLASSE, pas trois cas, un test-scan qui
      cherche `Number(process.env.` sans garde de chaîne vide vaudrait mieux que trois
      correctifs.
      ✅ **CORRECTIF LIVRÉ — `lib/env.ts` (PURE, feuille)** : `texteEnv(...noms)` rend la
      première variable NON BLANCHE (donc la chaîne de repli enjambe une variable vide, ce que
      `??` ne faisait pas), `nombreEnv(nom)` ne convertit que sur une chaîne non vide.
      **DEUX sites, pas trois** — le troisième soupçon était un faux positif, et le dire
      compte : les trois `AUTHORIZED_EMAIL` sont SAINS, parce que `estProprietaire` refuse
      explicitement une autorisation vide (échec fermé, déjà écrit et déjà testé).
      ✅ **Et le scan promis a été écrit** (`tests/env.test.ts`) : aucun module de `lib/` ne
      convertit une variable d'environnement en nombre par lui-même, `lib/env.ts` excepté.
      C'est ce qui empêche un TROISIÈME site d'apparaître — une règle qui ne vit que dans un
      document se reperd (règle §9 n°125). Avec son anti-vacuité : le scan doit lire plus de
      cinquante fichiers ET prouver que son motif sait trouver.
      ⚠️ **Le motif du scan est COMPOSÉ dans le test**, pas écrit en toutes lettres : sinon il
      matcherait sa propre explication. Le piège a été payé deux fois aujourd'hui.
      ⚠️ **Un ZÉRO ÉCRIT reste un zéro** : `nombreEnv` rend `0` pour `"0"`. Sans ce cas, on ne
      saurait pas distinguer « blanc rejeté » de « zéro rejeté ».
      Mutation jouée : retour à la conversion directe ⇒ le test de comportement ET le scan
      rougissent, ce qui est exactement la paire voulue.

## Audit du backlog — 2026-09-17

Demandé par Marc (« fais backlog »). **48 items ouverts** avant, **35 après** : treize fermés,
chacun contre le CODE ou une MESURE de production, jamais contre son titre. Aucun code touché.

⚠️ **Ce que cet audit a appris, et qui vaut plus que les treize cases.** Un backlog qui mélange
le fait et l'à-faire ne trompe pas un peu : il trompe au moment précis où on lui demande quoi
faire ensuite. Quatre items décrivaient un monde qui n'existe plus depuis un mois — « demander
l'accès au flux », « en attendant le flux », « le mode toute la région n'a JAMAIS tourné » —
alors que le flux tourne tous les jours depuis le 2026-08-20. Les lire aujourd'hui aurait fait
refaire du déjà-fait, ou pire, renoncer à brancher ce qui est déjà branché.

### Fermés, avec ce qui les a tranchés

| Item | Tranché par |
|---|---|
| `[V4-01]` | Sans objet : le flux est public et lu depuis le 20/08 (`ingérées=8/1600`). |
| `[V4-02]` | Caduc : plus d'« en attendant », le flux tourne. |
| `[V4-03]` | Fait (ADR-0013) : les codes se choisissent à l'écran et pèsent dans la note. |
| `[V4-04]` | Code : dans `trier`, doublon puis `situer` passent AVANT `computeScore`. |
| `[VEILLE-11]` | Journaux : le cron part à 11:31 les 16 ET 17/09. |
| `[VEILLE-32]` | Code : `motsCoordination` porte les deux langues. |
| `[VEILLE-40]` | Code + prod : `selectionnerSources` pousse le flux, `sources=2`. |
| `[NOTE-04]`, `[VEILLE-44]` | Un mois d'exploitation à 1 600 offres/passe. |
| `[V-CARTE-03-GOOGLE]` | Journaux : `precisees=2/8 (2 par Google)` le 16/09. |
| `[V-CARTE-03-PLACES]` | Journaux : `details=2/2` le 17/09. |
| `[CARTE-04]`, `[CARTE-05]` | Livrés le 15/09, points d'observation tranchés ou écrits dans le code. |

### Vérifiés ENCORE OUVERTS — la vérification compte autant que la fermeture

- **`[VEILLE-34]`** — `normaliserTitre` (lib/scoring.ts) ne retire toujours PAS les accents :
  ni `normalize("NFD")`, ni retrait de diacritiques. Un titre « Charge de projet » continue de
  ne pas matcher « chargé de projet ». **Toujours vrai, relu ligne à ligne.**
- **`[VEILLE-33]`** — `situer` (lib/ingest/region.ts) compare toujours `MUNICIPALITES` par
  `includes`, et ces listes sont consultées AVANT le registre mesuré. « Quebec Province »
  passerait encore. La mesure a réduit le pari, elle ne l'a pas supprimé.
- **`[VEILLE-42]`** — confirmé par les journaux du jour même : `mont-royal×6`,
  `pointe-aux-trembles×4`, `sherrington×5` tombent encore en « lieu inconnu ».
- **`[DUREE-03]`** — le garde de `joursEntre` teste toujours `undefined`, et
  `"pas-une-date".split("-").map(Number)` rend trois `NaN`, qui n'en sont pas. **Toujours vrai.**
- **`[CV-09]`** — aucun fichier de test ne référence `cv/actions` ni `cv/depot`. **Toujours vrai.**
- **`[B-07]`** — `claude/hopeful-lovelace-4d09zx` existe toujours sur le distant. Attend le feu
  vert de Marc, comme écrit.
- **`[CV-11]`** — chiffre RE-MESURÉ : 867 → **1 854 lignes**. L'item ne s'est pas périmé, il a
  empiré du double, et ce fichier se charge à chaque session.

### Non re-vérifiés, et je le dis plutôt que de les cocher

`[VEILLE-13]` (le cron de géocodage annoncerait une panne qui n'existe pas), les items `[V2-*]`
et `[V3-*]` (fonctionnalités non commencées), `[CV-07]` (variable d'environnement, côté Marc),
`[ROUTINE-01]` (arbitrage de Marc, pas une tâche). Les laisser ouverts est le verdict honnête :
je n'ai pas mesuré, donc je ne coche pas.

---

## Chantier — la veille n'a plus qu'une source (2026-09-18) 🟦

Demande de Marc, 2026-09-18 : « enlève tout ce qui ne rend rien à la recherche ». Quatre
canaux nommés, tous mesurés morts le jour même.

### `[VEILLE-51]` — supprimer les canaux qui ne rendent rien ✅

| Canal supprimé | Ce que la mesure a dit |
|---|---|
| Recherches RSS du Guichet par mot-clé | Liste de recherches **vide** : les adresses ne répondent pas (404 sur six formes, 31/07 puis 05/08). |
| Pages carrières d'ATS (5 familles) | **Aucune entreprise déclarée**, jamais. La source interrogeait une liste vide à chaque passe. |
| Dépôt de fichiers `data/depot/` + `POST /api/ingest/depot` | Dernier lot le **21/08** — hors de la fenêtre de 7 jours depuis trois semaines. |
| Routine claude.ai qui alimentait le dépôt | **Aucune** des 60 Routines du compte ne pointait sur JobAI (relues le 18/09). |

Reste : le **flux complet du Guichet-Emplois**, 42 894 offres vues par passe.
`selectionnerSources` n'a plus de rotation ni de curseur — il rend une source ou aucune.

⚠️ **Ce qui a été GARDÉ délibérément, et pourquoi** :
- `lib/ingest/expurger.ts` `expurgerLot` — orpheline depuis la suppression de
  `scripts/deposer-veille.ts`, annotée comme telle. `[VEILLE-06]` (import complet du flux)
  en aura besoin, et une boucle réécrite à côté divergerait de `expurgerPII`.
- `lib/ingest/sondeSources.ts` et `/api/diagnostic/sources` — la sonde MESURE, elle
  n'ingère pas. Ses six candidats d'ATS sont partis ; les treize autres (Guichet, données
  ouvertes, portails publics, agrégateurs par `robots.txt`) restent utiles.
- `docs/ROUTINE-DEPOT.md` et `docs/veille-prompt.md` — **récits datés**, bandeau en tête.
  Ils portent la mesure des sept sources, qui est la raison du choix actuel.

### `[PII-02]` — le garde de PII de tiers ne scannait qu'un dossier qui a disparu ✅

Les motifs « courriel nominatif » et « profil LinkedIn personnel » ne tournaient que sur
`data/depot/*.json`. Ce dossier supprimé, ils auraient scanné une liste **vide** en restant
verts. Re-pointés sur **tous** les fichiers versionnés — et ils ont trouvé du premier coup,
sur 369 fichiers, le vrai nom, le vrai courriel et le vrai identifiant LinkedIn du recruteur
Randstad, recopiés de l'annonce du 12/08 dans les fixtures de `tests/expurger.test.ts`, dans
un dépôt **public**, invisibles depuis cinq semaines. Remplacés par des valeurs de même forme
sans personne derrière. L'exemption du champ `adresse` des dépôts a été retirée avec eux :
`piiGuard` ne neutralise plus rien nulle part.

### `[PERSIST-02]` — la liste des chemins d'écriture d'offres est incomplète ✅

`tests/persistance.test.ts` gardait une liste ÉCRITE À LA MAIN des fichiers qui écrivent des
offres. Remplacée par une découverte par balayage (`cheminsQuiEcriventDesOffres`), même
patron que `cheminsQuiEcriventLeLien` (18/09, `tests/ingest-pipeline.test.ts`) : elle a trouvé
les deux manquants (`app/api/mcp/route.ts`, `lib/cv/actions.ts`), des écritures CIBLÉES (deux
champs chacune, ADR-0011 pour la première) qui n'appellent ni `colonnesOffre` ni
`colonnesSeed` — légitimement, elles n'insèrent jamais une ligne complète. L'invariant a donc
été scindé en deux : aucun chemin ne réénumère les colonnes à la main (universel), et seuls
les `.insert(offers)` doivent passer par la source unique. Un second test fige que les deux
chemins ciblés restent découverts. Un piège trouvé en route (mutation testing) : ma première
vérification « au moins un inséreur existe » relisait les fichiers séparément avec le même
motif — vert même si la branche `if (/\.insert\(offers\)/…)` était débranchée. Remplacée par
un compteur incrémenté DANS la branche.

### `[VEILLE-52]` — toutes les québécoises entrent, le lieu ne refuse plus ✅

ADR-0019. Demande de Marc : « toutes les 43k offres tu les importes, ensuite on filtre par km ».
Puis « go lot 2 » après avoir entendu la réserve d'ordre (voir *Points d'attention*).

Ce qui a été mesuré avant d'être codé, le 2026-09-18 :

| Mesure | Valeur |
|---|---|
| Flux complet (`fin: flux-termine`) | 43 071 offres vues |
| Passent `estPeutEtreQuebec` | **7 239** |
| Verdicts de `situer` | 1 457 dans la région · 2 034 hors région · 3 748 lieu inconnu |
| Ce que la passe de 20:23 a ramené | `ingérées=21/1600 · doublons=1535 · lieu-inconnu=38 · hors-région=6` |
| `trier` sur 7 239 offres | **368 ms** (banc local) |

`trouvees` valait EXACTEMENT `MAX_RETENUES_FLUX` : le plafond mordait, la lecture s'arrêtait
sur un PRÉFIXE du flux. Trois changements : plafond 1 600 → 12 000, plus aucun refus de lieu
dans le flux ni dans `trier`, et le verdict ENREGISTRÉ (colonne `situation`).

### `[UI-FILTRE-KM]` — le filtre de distance à l'écran ✅

⚠️ **Deux des trois volets étaient DÉJÀ faits, et l'entrée ne le disait pas** (constaté le
2026-09-21, troisième « déjà fait ? » de la semaine — règle n° 1). Le filtre par km existe
depuis le 2026-07-31 (`distanceMaxKm`, paliers 10/25/50, et un compte des offres écartées
faute de mesure) ; le tri par note existe depuis le 2026-08-21 (`grouperParEntreprise` trie
par note moyenne décroissante, avec trois départages). Ce qui manquait vraiment :

1. **Le rayon de Marc n'était pas un palier.** Les repères s'arrêtaient à 50 km alors que le
   rayon réglé vaut 75 par défaut et se règle jusqu'à 300 : la seule question qui a un sens
   métier — « qu'est-ce qui est DANS mon rayon ? » — n'était pas offerte par l'écran.
   `paliersDistance(rayonMaxKm)` l'ajoute, trié et dédoublonné, et les deux écrans lisent le
   rayon dans l'état (`CLE_RAYON`) au lieu de le recopier.
2. **Les offres sans distance étaient MASQUÉES, pas montrées.** Un compte les résumait
   au-dessus de la liste ; elles disparaissaient de l'écran. Depuis ADR-0019 c'est la majorité
   du suivi : un seuil posé le matin vidait la liste et laissait croire qu'il n'y avait rien à
   moins de 25 km. `separerParDistance` en fait un GROUPE, sous la liste, qui dit ce qu'il est.
3. **Le compte et le groupe n'étaient pas le même ensemble** : `sansDistanceMesuree`
   n'appliquait que trois des huit filtres, donc il annonçait une population que l'écran ne
   montrait pas (une recherche textuelle ne le faisait pas bouger). Il DÉRIVE désormais du
   groupe.

### `[GEO-BOOTSTRAP]` — une distance approchée tout de suite 🟦

⚠️ **CE QUI EST ÉCRIT CI-DESSOUS ÉTAIT FAUX, ET C'EST MOI QUI L'AVAIS ÉCRIT** (corrigé le
2026-09-21) : « la table `villes` existe et n'est pas exploitée ». L'étape « 0 bis » de
`mesurerDistances` (chantier #07, 2026-08-12) épingle DÉJÀ tout employeur au centre de sa
ville, sans réseau, dès que ce centre est en base. Deuxième fois en deux jours qu'un remède
est prescrit depuis un journal sans ouvrir le code qui produit la ligne (règle n° 159).

**Ce que la mesure a trouvé à la place — des distances FAUSSES, pas manquantes.** Relevé du
2026-09-21 (MCP, `scoreMin=65`, 185 correspondances) : l'offre de **Coffrages Synergy à
Lavaltrie** (~200 km) affiche **6,1 km** et note **76** — comme ses quinze sœurs ; l'**Université
du Québec à Montréal** affiche **5,1 km**, la **Société québécoise des infrastructures à
Montréal** **6,1 km**. Deux mécanismes, tous deux inoffensifs avant ADR-0019 et graves depuis :
`entreprises_lieux.nom` est la clé primaire (un employeur, UNE position, héritée par toutes ses
offres quelle que soit leur ville), et le lecteur qui remplit `villes` n'exigeait pas que la
réponse SOIT une ville.

**Livré le 2026-09-21** ([ADR-0021](./docs/adr/0021-la-ville-de-l-offre-decide-de-sa-distance.md))
— lecteur strict `lireReponseVille`, bornes élargies au Québec (elles refusaient Gatineau,
Rouyn, Sept-Îles et Gaspé, donc condamnaient leurs offres à n'avoir jamais de distance), garde
de plausibilité position↔ville de l'OFFRE, effacement des km invraisemblables déjà en base,
re-vérification des centres écrits par l'ancien lecteur (`villes.verifie_le`), et priorité des
villes par ce qu'elles débloquent.

**Ce qui RESTE** ⬜ :
- Le débit : **8 villes par passe** (`MAX_VILLES_PAR_PASSE`), partagé avec la re-vérification.
  `lib/geocodageCron.ts` interdit d'agrandir la passe — il faut une passe de plus, et c'est une
  décision à part. La ligne `[distances]` publie désormais `villesManquantes`, qui est le
  chiffre qui dimensionne ce choix ; il n'existait pas avant, d'où un lot dimensionné le
  2026-09-21 sur le mauvais des deux nombres.
- Le repli par **bande postale** pour les 3 751 offres dont personne ne nomme la ville
  (`lieu-inconnu` au flux complet du 2026-09-21). **Investigué le 2026-09-21, BLOQUÉ dans cet
  environnement — pas seulement en retard.** Une bande postale exige un jeu de centroïdes de
  codes postaux (FSA) que ce sous-chantier doit lire quelque part ; aucune source mesurée
  n'est joignable depuis le proxy de ce conteneur : `geogratis.gc.ca`, `www12.statcan.gc.ca`
  et `download.geonames.org` refusent la connexion (bloqués par la politique réseau du
  bac à sable), et `api.github.com` n'accepte que des appels scopés à un dépôt (pas de
  recherche générale pour trouver un jeu de données tiers). `WebFetch` reste disponible mais
  résume via un petit modèle plutôt que d'extraire des nombres exacts — risque de coordonnées
  **inventées**, inacceptable pour un dataset qui alimenterait directement des distances
  affichées à Marc (garde-fou n°3, no fake data). Décision de Marc (2026-09-21) : laisser
  ouvert tel quel plutôt que d'improviser une source non fiable. Si une source de centroïdes
  FSA est fournie (fichier ou URL lisible directement, sans passer par un résumé de modèle),
  ce sous-chantier redevient un travail normal.
- La preuve en production : `bornes`, `effacées` et `centresCorrigés` se lisent au cron suivant.

### `[CARTE-PERF]` — l'assemblage des écrans est quadratique ✅

Marc, 2026-09-21 : « la carte met un temps fou à charger ». Mesuré avant de corriger, sur un
corpus de FORME production (6 923 offres, 3 000 employeurs, 400 villes) :

| | avant | après |
|---|---|---|
| `construireVue` (carte) | **1 900 ms** | **615 ms** |
| `grouperParEntreprise` (liste) | **1 471 ms** | **483 ms** |
| à 200 offres / 100 employeurs | 19 et 11 ms | 16 et 2 ms |

Les deux répondaient à « cet employeur est-il déjà connu ? » par
`[...map.keys()].find((c) => apparier(nom, c))` : la liste des clés RÉ-ALLOUÉE par offre, et
`apparier` qui re-normalise LES DEUX côtés à chaque comparaison — ~18 millions de
`trim().toLowerCase()` pour un seul écran. Et ça recommence à CHAQUE changement de filtre.
`indexEmployeurs` garde la règle et l'ordre à l'identique (1 767 tests verts, quatre
perturbations rouges) : ×3.

⚠️ **Le POIDS n'était PAS le problème, contrairement à ce que j'avais recommandé.** Mesuré :
4,93 Mo de JSON → **0,12 Mo en gzip, 0,05 Mo en brotli**, et `content-encoding: br` est
confirmé sur `emploi.hubperso.com`. `JSON.parse` vaut ~103 ms sur ce conteneur. Un
dégraissage du payload (table de textes dédoublonnés : −34 %) aurait été du travail que le
réseau n'aurait pas vu.

**Livré le 2026-09-21** ([ADR-0022](./docs/adr/0022-la-carte-cesse-de-reallouer-et-de-relire-en-serie.md)) —
`cleGroupement` : le regroupement d'affichage passe à l'égalité stricte (`memeEmployeur`),
la MÊME identité que les données. O(1) natif (`Map.get`), plus de balayage. « Robert » ne
tombe plus sur « Groupe Robert ». `apparier` survit pour le proofreading uniquement
(`tests/reference.test.ts`, lien Google Maps). Côté serveur : la page Carte lisait cinq
sources en SÉRIE (`domicile`, rayon, offres, positions, trajets) alors qu'aucune des quatre
premières ne dépend d'une autre — passées en `Promise.all`.

Découvert en chemin, **non corrigé** : `STERIS`/`STERIS Canada` et `Exo-s Saint-Damien`/
`Exo-s` ne s'égalent plus sous la règle stricte (« Canada », « Saint-Damien » ne sont pas des
suffixes juridiques). Sans effet aujourd'hui (les deux offres SEED ont un `km` manuel, jamais
retouché), mais une offre future ingérée sous « STERIS » referait un géocodage au lieu de
retrouver la position de « STERIS Canada ». Porté sous `[EMPLOYEUR-VARIANTE]`.

### `[EMPLOYEUR-VARIANTE]` — une variante de nom re-géocode au lieu de retrouver sa position 🟦

Trouvé en mesurant l'impact d'ADR-0022 (2026-09-21), PRÉEXISTANT à ce lot — `positionDe`
utilise `memeEmployeur` (égalité stricte après normalisation) depuis sa correction
antérieure, et cette règle ne rapproche pas deux noms qui ne diffèrent que par un
qualificatif de lieu/région (« STERIS Canada » vs « STERIS », « Exo-s Saint-Damien » vs
« Exo-s » — mesuré sur `SEED` × `ENTREPRISES_CIBLES`, 2 cas sur les offres actives).

Une offre ingérée sous « STERIS » quand seul « STERIS Canada » est géocodé ne retrouve pas
sa position existante : elle repasse par `employeursASituer` et se fait géocoder à nouveau
sous son propre nom. Coût : un appel Nominatim de plus (le service est gratuit et borné à
une passe / 5 min), jamais une donnée fausse — `memeEmployeur` refuse à raison de deviner.

Piste, non creusée : une table d'ALIAS explicite (« STERIS » → « STERIS Canada ») plutôt
qu'une heuristique de nom, pour les cas RENCONTRÉS réellement plutôt que devinés à l'avance.

**Cadré le 2026-09-21** ([ADR-0023](./docs/adr/0023-une-table-d-alias-fermee-pour-les-employeurs-deja-rencontres.md),
**Proposé** — soumis à Marc, AUCUN CODE ÉCRIT). Ça touche `lib/employeurs.ts`, qui alimente
`km` puis `scoreDistance` : protocole §11, ADR avant toute ligne de code. En attente de la
ratification de Marc avant l'audit sur `SEED` et l'implémentation.

### `[ADR-INDEX-01]` — ADR-0019 existe mais n'a aucune ligne dans l'index ⬜

Découvert en chemin (2026-09-21), non corrigé — hors périmètre de la tâche en cours.
`docs/adr/0019-toutes-les-quebecoises-entrent.md` existe et est cité PAR ADR-0021
(« élargit les bornes ouvertes par ADR-0019 »), mais `docs/adr/README.md` saute directement
de la ligne 0018 à la ligne 0020 : aucune entrée ne le liste. Un lecteur qui parcourt
l'index seul ne le trouve pas. Correctif trivial (une ligne de tableau) mais pas fait sans
feu vert (§6 de la convention commune).

### `[OBS-01]` — la preuve qu'un cron a tourné n'est lisible NULLE PART ✅

Constat du 2026-09-19, après **deux** tentatives ratées de vérifier `[VEILLE-13]` la même nuit.

Le protocole de vérification était : lire les journaux runtime Vercel pendant la fenêtre du
cron de géocodage, et y trouver une ligne `[distances]` sans ligne `[veille]`. Il est
**structurellement impossible à tenir**, et les trois raisons se composent :

| Contrainte | Mesure |
|---|---|
| Rétention des journaux (Vercel hobby) | **~17 min** — à 03:39 on ne voit plus rien d'avant ~03:22 |
| Heure RÉELLE de départ du cron | **inconnue** — `0 3 * * *` n'est pas parti à 03:00, ni vers 03:31 (le décalage ~31 min mesuré sur le cron de veille ne s'applique pas ici) |
| Fenêtres observées | 02:49→03:09 et 03:14→03:39. **Trou de 03:09→03:22, définitivement perdu** |

Viser une heure devinée avec une fenêtre de 17 minutes est un pari, et il a été perdu deux
fois de suite. Ce n'est pas un problème de calibrage : c'est que **la preuve ne survit pas
assez longtemps pour être allée la chercher**.

**Ce qu'il faut à la place** : un état PERSISTANT que le cron écrit et qu'on peut lire à
n'importe quelle heure. `sync_state` porte déjà `geocodage-auto` (`CLE_GEOCODAGE`) et
`distances-auto` — leur `majLe` dirait quand la dernière passe a été RÉSERVÉE. Il manque
seulement de quoi les LIRE : aucun outil MCP ne les expose, et il n'y a pas d'écran de
diagnostic qui les montre. ⚠️ Et ça ne prouverait qu'un DÉMARRAGE, pas un succès — la
réservation se pose avant le travail (voir la note de `CLE_VEILLE` dans `lib/synchro.ts`).

**Ce qui a été possible malgré tout, et qui vaut d'être noté** : le signal INDÉPENDANT.
`resume_suivi.nonSituees` est passé de **34** (18/09 ~20:05 UTC) à **13** (19/09 03:39) —
**21 offres situées** dans l'intervalle. Donc un chemin de géocodage a bien tourné.
⚠️ Ce chiffre ne dit PAS que c'est le cron dédié : une visite de page déclenche aussi une
passe (`DELAI_PASSE_AUTO_MS`). `[VEILLE-13]` reste donc **ouvert**, et la mesure n'est pas
une conclusion.

**Livré** : un outil MCP, `etat_synchro`, qui rend `cle`/`majLe`/`ageMs` pour CHAQUE ligne
de `sync_state` (`lib/diagnosticSynchro.ts`, fonction pure `resumerEtatSynchro`) — pas
seulement les deux clés nommées ci-dessus. Les clés se DÉCOUVRENT à la lecture plutôt que
d'être nommées une par une dans le code : la table en porte onze aujourd'hui, une liste
écrite à la main deviendrait fausse au premier ajout, exactement le défaut que `[PERSIST-02]`
vient de corriger sur les chemins d'écriture. Ne rend JAMAIS `valeur` — certaines lignes
(`veille-journal`, `veille-historique`, `veille-rapport`) portent des blocs JSON de
plusieurs dizaines de milliers de caractères, et ce diagnostic sert à DATER un passage, pas
à le relire. Le type d'entrée (`LigneSynchroBrute`) ne porte que `cle`/`majLe` : `valeur`
n'a structurellement pas de place pour fuiter.

⚠️ Ne prouve toujours qu'un DÉMARRAGE, pas un succès — la limite était déjà connue et reste
entière, la description de l'outil le redit explicitement à qui l'appelle.

### `[VEILLE-52]` — PREMIER PASSAGE RÉEL, mesuré le 2026-09-19 à 12:15 UTC ✅

Le lot produit son effet. Passe de veille de 11:00 UTC, première sur le nouveau code :

| Mesure | Avant (18/09 ~20:05) | Après (19/09 12:15) |
|---|---|---|
| `suivies` | 1 689 | **6 271** (+4 582) |
| `nonSituees` | 13 | **4 285** (68 % du stock) |
| `perimees` | 637 | 605 |
| `nonNotees` | 0 | 0 |

⚠️ **+4 582, et non les ~5 500 annoncés** (7 239 québécoises − 1 689 déjà suivies). L'écart
vient des doublons par clé canonique (même employeur écrit autrement) et de la variation
quotidienne de la population du flux. L'ordre de grandeur est bon ; le chiffre exact ne
l'était pas, et c'était une soustraction, pas une mesure.

**Preuve de bout en bout, pas seulement un compteur** : des offres de Montréal, Dorval et
Saint-Léonard sont en base, datées du 19/09. Le lieu ne refuse donc plus rien.

### `[GEO-BOOTSTRAP]` — chiffré par la même mesure ⬜

Le risque annoncé est réalisé, et il se mesure en tête de liste :

| Population | Compte |
|---|---|
| Offres notées ≥ 65 | **238** |
| … dont distance mesurée ET ≤ 50 km | **15** |

⚠️ **Les 223 autres ne sont PAS « lointaines »** : le filtre `kmMax` écarte aussi les `km:
null`, qu'il ne peut pas juger. Ce sont donc « lointaines OU de distance inconnue ». Ne pas
lire ce nombre comme un compte d'offres à jeter.

**Ce que la mesure établit quand même, et c'est l'essentiel** : le barème SAIT déclasser une
offre lointaine — `Chapiteau Montréal inc` à Saint-Bernard-de-Lacolle, distance mesurée à
**260,6 km**, note **38**. Les offres montréalaises sans distance, elles, notent **70**, à
huit points de la meilleure du suivi (78). Ce n'est donc pas la notation qui est en cause :
il lui manque la seule entrée qui tranche. Donner une distance approchée tout de suite
(table `villes`, puis repli par bande postale) suffit à remettre la tête de liste d'aplomb.

### Relevé du 2026-09-20 (cron de 11:31:50) — trois items, un seul vraiment neuf

#### `[GEO-BOOTSTRAP]` — la saturation annoncée est maintenant MESURÉE 🔴

```
[distances] passe terminée — placées=0 mesurées=5 situées=0/3332 villes=0 adresses=0/0
            registre=0/1122 (39 ambigues) (1083 absentes) precisees=0/8
            (+1136 en attente de quota) bornes=0/1 budget restant=0 ms
[distances] budget par étape — villes:1ms centres:20765ms situer:5334ms adresses:74ms
            registre:712ms raffinage:74ms bornes:643ms details:52ms mesure:20269ms
            (total 47924 ms)
```

**`situées=0/3332`, budget restant `0 ms`.** L'étape de localisation avait 3 332 offres à
traiter et n'en a situé AUCUNE. Le budget total (47 924 ms) est parti ailleurs : `centres`
20 765 ms et `mesure` 20 269 ms en mangent 86 % à elles deux, `situer` n'a eu que 5 334 ms.

Ce n'est plus une prévision, c'est un constat : depuis `[VEILLE-52]`, le géocodage est noyé.
⚠️ Ne pas confondre `3332` (ce que l'étape avait en file ce jour-là) avec les `4285` de
`resume_suivi.nonSituees` — deux populations, deux moments.

⚠️ **Le remède n'est pas de relever un budget.** À 8 villes par passe Nominatim (cadence
imposée, 1,1 s/requête), aucun réglage ne rattrape 3 332 offres. Il faut une distance
APPROCHÉE sans réseau : la table `villes` porte déjà des centres de municipalités géocodés.

#### `[TRAJETS-03]` — ça descend, mais moins vite que projeté ⬜

`[trajets] 40 durée(s) remplie(s) · 160 restante(s)`

| Date | Restantes |
|---|---|
| 16/09 | 277 |
| 17/09 | 241 |
| 20/09 | **160** |

241 → 160 = **27/jour net** sur trois jours, contre ~36/jour projeté (donc ~130 attendues,
30 de plus que prévu).

⚠️ **Ne pas re-projeter une date de fin sur cette série.** Le régime a changé le 19/09 : le
stock d'offres est passé de 1 689 à 6 271. Une moyenne qui enjambe ce changement décrit deux
mondes différents. Ce qui se dit honnêtement : **160 restantes, et ça descend**.

#### `[BORNES-02]` — le reste descend, la dernière grappe échoue ⬜

`bornes=0/1` — contre `0/14` le 16/09 et `0/21` le 17/09. Le reste à mesurer a bien fondu,
donc l'enveloppe dédiée (`BUDGET_BORNES_VEILLE_MS`, `b9f60b1`) atteint l'étape : elle a
consommé 643 ms cette passe. Le câblage est bon.

Mais la grappe restante échoue, et honnêtement :
`[bornes] réponse VIDE sur 30 km — traitée comme un échec, pas comme « aucune borne » : la
grappe repassera`. Une réponse vide n'est pas « il n'y a pas de borne » — c'est le bon
comportement, et c'est pour ça que le compteur ne descend pas à 0. À re-regarder si elle
échoue encore dans quelques jours.

#### Preuve de production du lot `[VEILLE-52]`, en passant

`[veille] cron-veille — ingérées=12/7052 · doublons=7040 · hors-région=12 · lieu-inconnu=0`

Deux choses s'y lisent : **`trouvees=7052`** (le plafond de 12 000 ne mord plus — il valait
1 600 et la lecture s'arrêtait dessus), et **`hors-région=12` sur 12 ingérées**, c'est-à-dire
des offres COMPTÉES par le lieu et ENTRÉES quand même. C'est exactement le nouveau contrat,
vu en production. La ligne les nomme : `montreal×2 · chicoutimi · gatineau · granby ·
longueuil · mont-royal · rouyn-noranda · saint-leonard · trois-rivieres · val-d'or ·
westmount`.

### `[BORNES-03]` — la grappe Overpass a explosé avec le périmètre des offres 🔴

**Régression NEUVE, causée par `[VEILLE-52]`.** Relevé du 21/09 (cron de 11:31:50) :

```
[bornes] grappe de 520 lieu(x) non mesurée — boîte ~168 km, abandon après 25002 ms
         (patience 25000 ms) : overpass-api.de → HTTP 504 · This operation was aborted
[distances] … bornes=0/533 (520 en échec) …
```

| Date | Reste à mesurer |
|---|---|
| 16/09 | 14 |
| 17/09 | 21 |
| 20/09 | **1** |
| 21/09 | **533** |

⚠️ **Ce n'est PAS l'enveloppe dédiée qui manque** — le contrôle du 20/09 avait justement
conclu que le câblage était bon, et il l'est toujours : l'étape a consommé ses 25 066 ms,
soit toute sa patience. La cause est ailleurs et elle est nouvelle : depuis que les offres
couvrent tout le Québec (Montréal, Sept-Îles, Val-d'Or, Rouyn-Noranda…), la boîte englobante
de la grappe fait **~168 km** au lieu de quelques dizaines. Overpass répond **504** dessus.

**Le remède n'est pas d'allonger la patience** : attendre plus longtemps un service bénévole
qui répond déjà 504 n'est ni efficace ni poli.

⚠️ **CORRECTION DU DIAGNOSTIC (2026-09-21, en codant le correctif).** J'avais écrit ici
« il faut découper la grappe géographiquement ». **C'était déjà fait** : `grapperPourBornes`
découpe depuis le 14/09, et le commentaire de `mesurerBornes` le dit en toutes lettres. J'ai
prescrit un remède déjà livré — la leçon n° 1 du dépôt (« vérifier qu'une tâche n'est pas
DÉJÀ faite »), appliquée au diagnostic plutôt qu'à la tâche.

Ce qui manquait vraiment est plus fin, et c'est ce qui a été livré : **couper APRÈS un
échec**. Le découpage initial borne l'ÉTENDUE, et 168 km tient largement sous les 3°
d'`ETENDUE_MAX_DEG` — qui garde contre une position aberrante, pas contre une requête
coûteuse. Et resserrer cette garde aurait été inventer un nombre : le coût d'une requête
Overpass dépend de la **densité** autant que de la surface, la même boîte passant en Gaspésie
là où elle tombe sur l'île de Montréal. **Aucun seuil d'étendue fixe ne peut être juste.**

✅ **Livré le 2026-09-21** : `scinderGrappe` (PURE) coupe une grappe en échec par sa dimension
la plus longue, et la passe remet les deux moitiés EN TÊTE de file. On écoute la réponse au
lieu de la deviner — une requête qui passe dit que la grappe était assez petite, une qui
échoue dit le contraire. Borné par `MAX_SCISSIONS_GRAPPE = 3` : sans plafond, une PANNE
d'Overpass (où tout échoue) ferait doubler les requêtes à chaque tour jusqu'à épuiser le
budget.

⚠️ **Le VIDE suspect est réparé par la même coupe**, et c'était l'autre moitié du problème :
une réponse vide sur une grande boîte est refusée (l'inscrire figerait « aucune borne » sur
tout le lot) — mais sans scission, la grappe « repassait » à l'identique chaque jour pour
échouer pareil. Vécu : `bornes=0/1` immobile le 20/09. Coupée, elle finit par tenir sous
`ETENDUE_VIDE_SUSPECTE_KM`, où un vide redevient crédible et s'inscrit enfin.

### Relevé du 2026-09-21 — le rattrapage des distances a démarré

| Mesure | 20/09 | 21/09 |
|---|---|---|
| `suivies` | 6 190 | 6 190 |
| `perimees` | 698 | 733 |
| `nonSituees` | 4 291 | **3 671** (−620) |
| `[trajets]` restantes | 160 | **120** (40/jour) |
| Budget de la passe | 47 924 ms | **115 709 ms** (×2,41) |

**Le compte ferme** : 6 190 + 35 ingérées − 39 périmées + 4 revenues = 6 190, exact.

⚠️ **La baisse de `nonSituees` vient de `mesurées=631`, PAS de `situer`.** Ce sont deux
étapes différentes, et les confondre ferait croire `[GEO-BOOTSTRAP]` résolu :
- `mesure` (calculer la distance d'un lieu DÉJÀ connu) : **5 → 631 en un jour**, parce que le
  budget de la passe a plus que doublé et qu'il reste de la marge sous les 300 s de la fonction.
- `situer` (attribuer un lieu à une ville que personne ne reconnaît) : **`situées=0/2820`,
  toujours ZÉRO**, et 153 ms de budget. La file descend (3 332 → 2 820) par d'autres chemins,
  pas par celui-là.

`[GEO-BOOTSTRAP]` reste donc entier. Ce qui a changé, c'est que la moitié « mesure » du
problème se résorbe toute seule, plus vite que prévu.

⚠️ Deux files montent, à surveiller : `registre=0/1643` (contre 0/1122) et
`precisees=… (+1696 en attente de quota)` (contre +1136).
