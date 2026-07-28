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
      lint, build) et un job `garde-fous` (aucune adresse municipale en dur, aucun secret en
      dur), tous deux **prouvés discriminants** avant commit. ✅ 2026-07-28.
      L'auto-merge devient sans objet — voir ADR-0002 (développement direct sur `main`).
- [x] 👤 **`[B-06]`** Réglages du dépôt : **branche par défaut → `main`** ✅ 2026-07-28
      (fait par Marc). L'auto-merge et la protection de branche sont sans objet depuis
      l'ADR-0002. ⚠️ Reste optionnel : ne laisser que « Allow squash merging » si des PR
      réapparaissent un jour (le merge de la PR #1 s'est fait en merge commit).
- [ ] 🔧 **`[B-07]`** Supprimer la branche distante `claude/hopeful-lovelace-4d09zx`
      (ancienne branche par défaut, sans usage) — 👤 accord de Marc requis avant suppression.

## Chantier #01 — V1 : port fidèle + hub ⬜

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
- [ ] 🔧 **`[V1-06]`** Portage de l'UI depuis `tracker-emploi-v4.html` : `Dashboard`,
      `Filters`, `OfferCard`, `AddOfferDialog`, `MarketTable`, `SwotPanel`, `ScoringPanel`.
      Le CSS et le responsive (breakpoints 760/380 px) sont réutilisables quasi tels quels.
- [x] 🔧 **`[V1-07]`** `why` converti en **format structuré** (`raisons` : un ton, un texte).
      ✅ 2026-07-28 — plus aucun HTML brut, verrouillé par un test qui refuse toute balise
      résiduelle dans le seed.
- [ ] 🔧 **`[V1-08]`** Marquage **« offre périmée »** : les offres du seed expireront avant la
      résidence permanente. Ne jamais présenter comme ouverte une offre dont on ne sait rien.
- [ ] 🔧 **`[V1-09]`** Export CSV (existe dans l'artifact, à reporter).
- [ ] 🔧 **`[V1-10]`** Test-garde `pii-guard` (scan des fichiers versionnés, volume prouvé).
- [ ] 👤 **`[V1-11]`** Provisionner Neon + lier au projet Vercel.
- [ ] 👤 **`[V1-12]`** Créer le projet Vercel + DNS Cloudflare `emploi.hubperso.com`.
- [ ] 👤 **`[V1-13]`** Client OAuth Google (le projet Cloud du hub fait l'affaire) +
      redirect URIs local et production.
- [ ] 🔧 **`[V1-14]`** Déclarer JobAI dans `Hubperso/lib/sources.ts` + `tests/sources.test.ts`
      (3 endroits) + `.env.example`. ⚠️ Exige un **redéploiement du hub** : `SOURCE_DEFS` est
      du code, pas de la configuration.
- [ ] 👤 **`[V1-15]`** Poser `HUB_TOKEN` (JobAI) et `HUB_TOKEN_JOBAI` (hub) — même valeur.

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

---

## Découvertes et dette (à trier)

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
