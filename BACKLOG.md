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
- [ ] 👤 **`[VEILLE-11]`** **Vérifier côté Vercel pourquoi le cron de veille ne part plus** :
      Dashboard → projet `job-ai` → Settings → Cron Jobs (état activé/désactivé, dernière
      exécution). Ou en CLI : `vercel crons ls`. Non lisible depuis une session Claude (pas de
      jeton Vercel, et le MCP Vercel n'expose pas les crons). Le filet ci-dessus rend la panne
      inoffensive, il ne la corrige pas à la source.
- [ ] 🔧 **`[VEILLE-12]`** Rendre le silence VISIBLE : publier la fraîcheur de la dernière
      passe dans `lib/hubSummary.ts` (alerte quand > 36 h). C'est ce qui manquait le plus —
      trois jours ont passé parce qu'aucun écran ne disait « la veille n'a pas tourné ».

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
- [ ] 🔧 **`[CV-08]`** La Routine quotidienne porte ses termes de recherche dans son PROMPT,
      hors du dépôt : un CV validé enrichit `profil.recherches` sans changer ce qu'elle tape
      le matin. Divergence réelle, nommée dans l'ADR-0009. La fermer suppose que la Routine
      LISE le profil (endpoint dédié, gardé comme `/api/ingest/depot`).
- [ ] 🔧 **`[CV-09]`** Aucun test ne couvre `lib/cv/actions.ts` ni `lib/cv/depot.ts` (I/O).
      La logique PURE l'est (46 tests) ; les actions ne le sont pas.
- [ ] 🔧 **`[CV-10]`** Un PDF SCANNÉ reste illisible (pas de reconnaissance de caractères).
      L'app le dit et propose le remède ; c'est une limite, pas un bug.
- [ ] 🔧 **`[CV-11]`** `CLAUDE.md` fait 867 lignes pour un « plafond assumé : 150 ». Il se
      charge à chaque session : le distiller vers `docs/LESSONS.md` en gardant ici les seules
      règles qui changent la façon de coder.

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

## Chantier #06 — Précision de la veille ⬜

> Cadré par **ADR-0005**. Ordre imposé : la profondeur AVANT le volume (décision Marc,
> 2026-08-11). Mesure de départ : 20 des 22 offres du 11 août notent **68**, et 68 est
> exactement la note d'un titre sans description — 30 de ces points viennent de ce qu'on
> ignore.

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

- [ ] **[VEILLE-32]** ⚠️ **Le bassin de termes est bilingue, le VOCABULAIRE DE NOTATION ne
      l'est pas — et c'est le plus restrictif des deux qui gagne, en silence.** Mesuré à la
      veille du 2026-08-18, sur le lot réel : `PROFIL_DEFAUT.motsCoordination` ne contient
      que du français (coordonnateur, superviseur, chargé de projet, gestionnaire…), alors
      que le bassin de recherche est passé au bilingue le 2026-08-17 précisément parce que
      « Honeywell, Alstom, AMETEK et Domtar publient en anglais dans la région ». On cherche
      donc en anglais, on trouve en anglais, et le barème jette le résultat faute de le
      comprendre.
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

- [ ] **[VEILLE-34]** ⚠️ **`normaliserTitre` ne retire PAS les accents, et les mots-clés du
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

- [ ] **[VEILLE-33]** La liste blanche de `situer()` compare par SOUS-CHAÎNE : « Quebec
      Province » est accepté « dans la région » parce qu'il contient « quebec ». Trouvé le
      2026-08-18 sur une offre réelle (Eco-services TGL, mine souterraine) dont l'annonce
      disait « situé au Saguenay ». Le lot l'a corrigée à la lecture, mais rien dans le code
      ne l'aurait attrapée. Le registre de mesure ([VEILLE-31]) ne la sauve pas non plus :
      il n'est consulté qu'APRÈS les deux listes, donc jamais pour ce cas. Piste : exiger
      que la correspondance porte sur un segment ENTIER du lieu normalisé plutôt que sur
      une sous-chaîne quelconque — à mesurer contre les ~130 municipalités avant de changer.

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
- [ ] **[V-CARTE-03-GOOGLE]** Lire `[distances] … (N par Google)` dans les logs d'une passe
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
- [ ] **[V-CARTE-03-PLACES]** Vérifier en production : des suggestions apparaissent bien à
      l'ajout d'une offre, et `[distances] … details=N/M` progresse sur les entreprises déjà
      résolues par Google.

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
