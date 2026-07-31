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

- [ ] 🔧 **`[DIST-02]`** **`lib/distances.ts` ne connaît pas les alias d'entreprise.**
      `construireVue` rapproche « Laserax » et « Laserax inc. » (`apparier`), mais
      `employeursASituer` et `planifierDistances` comparent les noms LITTÉRALEMENT. Une
      offre dont l'employeur est déjà situé sous son nom canonique peut donc être
      re-géocodée sous son autre nom — un appel Nominatim inutile et une ligne dupliquée
      dans `entreprises_lieux`. Rien de faux à l'écran, mais contraire à l'usage parcimonieux
      qu'impose le garde-fou n°4. Le vrai correctif est une source unique d'appariement
      partagée entre la carte et les distances — pas une seconde copie de `apparier`.
      *(Trouvé par le panel du 2026-07-31, mesuré ; pré-existant à `[CARTE-01]`.)*

- [ ] 🔧 **`[UX-12]`** **Brancher le suivi des relances à l'interface.** `lib/relances.ts`
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

## Découvertes et dette (à trier)

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
