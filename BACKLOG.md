# BACKLOG — JobAI

> Les phases V1→V4 sont définies dans [ADR-0001](./docs/adr/0001-fondations-jobai.md).
> Chaque tâche a un ID utilisé en préfixe de commit (ex. `[V1-03] endpoint hub summary`).
>
> Statuts : ⬜ à faire · 🟦 en cours · ✅ fait · ⏸️ en pause · ❌ abandonné
> Légende : 🔧 Claude · 👤 action humaine requise · 🧭 décision de Marc requise

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
- [ ] 🔧 **`[B-04]`** Flotte de 5 agents (`.claude/agents/`) + hooks de gate.
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
- [ ] 🔧 **`[B-07]`** Supprimer la branche distante `claude/hopeful-lovelace-4d09zx`
      (ancienne branche par défaut, sans usage) — 👤 accord de Marc requis avant suppression.

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

- [ ] 🧭 **`[V3-00]`** ADR-0002 : accès au CV dans Google Drive. ⚠️ Deux scopes Google
      restreints sur la même app OAuth — la piste `drive.file` + sélecteur de fichier évite
      le scope large.
- [ ] 🔧 **`[V3-01]`** `promptSafety` (assainissement + balisage des données non maîtrisées).
- [ ] 🔧 **`[V3-02]`** Notation par lecture de la description (remplace le plafond à 85).
      Passe par le protocole de précision du `CLAUDE.md` §8 : tableau avant/après sur les 38 offres.
- [ ] 🔧 **`[V3-03]`** Tri intelligent des réponses de recruteurs.
- [ ] 🔧 **`[V3-04]`** Génération de CV et lettres ciblés par offre.
- [ ] 🔧 **`[V3-05]`** Mesure du coût réel + publication dans le bloc `usage` du summary.
      Jamais estimé, uniquement mesuré.
- [ ] 🔧 **`[V3-06]`** Plafond budgétaire chiffré, non désactivable, qui suspend les
      traitements de fond mais jamais une action déclenchée par Marc.

## Chantier #04 — V4 : ingestion d'offres ⬜

- [ ] 👤 **`[V4-01]`** Demander l'accès au flux XML du Guichet-Emplois auprès d'EDSC.
- [ ] 🔧 **`[V4-02]`** Pipeline sur l'export CSV des données ouvertes en attendant le flux.
- [ ] 🔧 **`[V4-03]`** Compléter les codes CNP visés.
- [ ] 🔧 **`[V4-04]`** Déduplication et filtre de rayon appliqués avant notation.

## Chantier #05 — Expérience et présentation ⬜

> Demandé par Marc le 2026-07-28, juste après la mise en ligne : « améliorer affichage,
> page accueil, meilleur UI un peu comme FinanceAI, une carte avec les offres pour voir la
> proximité et la distance de la maison, avec l'affichage complet des offres, un onglet qui
> va prendre les offres de tous les sites d'offres genre LinkedIn et autre que tu peux
> trouver avec un lien cliquable pour aller sur l'offre directement ».

- [ ] 🔧 **`[UX-01]`** Refonte de l'interface, en s'inspirant de FinanceAI (densité,
      hiérarchie visuelle, navigation par onglets). ⚠️ Cadrer d'abord : FinanceAI a une
      identité claire et sobre, l'artifact JobAI une identité terminal/ambre. Décider si on
      converge vers le style FinanceAI ou si on garde l'identité JobAI en montant le niveau
      de finition — les deux se défendent, mais mélanger donnerait un résultat bâtard.
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
- [ ] 🔧 **`[UX-04]`** **Carte des offres** (proximité et distance depuis le domicile).
      Contraintes à régler avant de coder :
      · il faut des **coordonnées par offre** — aujourd'hui on ne stocke que la distance en
        km. Géocodage gratuit possible via Nominatim (OpenStreetMap), limité à 1 requête/s
        et exigeant un en-tête d'identification ; à faire **une fois par offre**, résultat
        persisté en base (colonnes à ajouter).
      · carte : **Leaflet + tuiles OpenStreetMap** (gratuit, pas de clé). ⚠️ Les tuiles
        viennent d'un domaine tiers : si une CSP est ajoutée d'ici là, il faudra l'autoriser.
      · **le domicile ne doit PAS être affiché ni envoyé au client** (garde-fou n°1) : la
        carte montre les offres, pas où habite Marc. Centrer sur la région, pas sur le point.
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

## Découvertes et dette (à trier)

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

- **`hub-contract`** : le tag `v1.1.0` n'existe pas côté distant alors que `package.json`
  l'annonce, et `package-lock.json` est resté en `1.0.0`. JobAI pinne le SHA en attendant.
  À corriger dans le dépôt `hub-contract`, avec sa table de consommateurs qui oublie déjà
  BatchChef (JobAI en sera le 6ᵉ).
- **`app-template`** pinne `#v1.0.0` : un fork brut n'a donc **pas** le bloc `usage`, et un
  champ inconnu est stripé **silencieusement** par Zod.
- **`next lint` est déprécié** (retiré dans Next 16) — migré vers l'ESLint CLI (`eslint .`)
  dès le bootstrap. ⚠️ Piège : `next lint` ignorait `node_modules` et `.next`
  implicitement, l'ESLint CLI **non** — sans bloc `ignores` explicite, `eslint .` rend
  4122 problèmes de faux positifs. À remonter dans `app-template` pour les prochains forks.
- **`app-template` répond 500** quand `HUB_TOKEN` manque, là où BatchChef et DriveAI
  répondent 503. JobAI a tranché pour 503 (ADR-0001) : le template est l'exception, pas
  la règle. À harmoniser dans `app-template`.
- 🔴 **`[SEC-BATCHCHEF-DRIZZLE]` — BatchChef est exposé à une injection SQL.** Découvert en
  installant Drizzle ici : `drizzle-orm < 0.45.2` a une **injection SQL par identifiants mal
  échappés** (GHSA-gpj5-g38j-94v9, sévérité HIGH). `batchchef-/web` déclare `^0.44.0` et son
  lockfile résout **0.44.7** — donc vulnérable, en production. JobAI est passé à `^0.45.2`.
  👤 À corriger dans le dépôt BatchChef (`npm install drizzle-orm@^0.45.2`, puis gate).
- **Next < 15.5.22 cumulait 8 avis HIGH** (DoS Server Actions, SSRF, cache confusion,
  divulgation d'endpoints internes). JobAI est passé à 15.5.22. Les autres dépôts Next de
  l'écosystème (Hubperso, BatchChef, app-template) sont à vérifier.
- **`postcss` et `sharp` sont épinglés vulnérables par Next lui-même** → forcés par
  `overrides` dans `package.json`, avec la note de retrait quand Next les remontera.
  Résultat mesuré : `npm audit --omit=dev` → **0 vulnérabilité**.
- **Node 20 est en fin de support** (avril 2026) [Probable] alors que les 4 workflows de
  DriveAI et les 4 de FinanceAI l'épinglent encore. JobAI épingle **22** (`.nvmrc`), la
  version réellement utilisée en développement — épingler 20 aurait créé un écart dev/CI
  non testé. À réévaluer pour les autres dépôts.
