# HANDOVER — JobAI

> État courant du projet, **à lire en premier** à chaque reprise de session.
> Antichronologique : la session la plus récente en haut. Ne rien inventer ici — si un point
> n'a pas été vérifié, écrire « à confirmer ».

---

## Session 2026-07-28 — cadrage, fondations, fork personnalisé

### État en une page

| | |
|---|---|
| **Dépôt** | `MoKarade/JobAI`, **privé**, créé par Marc. Forké depuis `app-template` (contenu identique, un commit `Initial commit`). |
| **Branches** | **Développement direct sur `main`**, sans branche de travail ni PR (ADR-0002). `main` est la branche par défaut du dépôt (réglé par Marc). ⚠️ La branche `claude/hopeful-lovelace-4d09zx` (ancienne branche par défaut) traîne encore sur le distant, sans usage — `[B-07]`. |
| **Gate** | `typecheck` + `test` + `lint` + `build` verts. Rejoué par la CI à chaque push. |
| **CI** | `.github/workflows/ci.yml` : un seul job `gate` (typecheck · tests · lint · build). Node épinglé par `.nvmrc` (**22**, pas 20 comme les autres dépôts : Node 20 est en fin de support et cette session développe en 22). ⚠️ Le job `garde-fous` a été retiré le 2026-07-28 : ses deux `git grep` doublaient `tests/piiGuard.test.ts` en moins précis, avaient divergé, et tenaient la CI au rouge depuis quatre commits. **Sans PR, une CI rouge ne se voit pas toute seule — la consulter fait partie du push.** |
| **Endpoint hub** | `GET /api/hub/summary` branché sur les vraies données via `getTrackerState()`. `503` si `HUB_TOKEN` absent · `401` si jeton invalide · `200` + `building` tant qu'aucune donnée réelle · `200` + `error` si l'état est illisible (jamais un 500 muet). Métrique en position 0 = la meilleure offre du moment. |
| **Base de données** | Neon (`us-east-2`), migration **appliquée** et jeu de départ **chargé**. Connexion paresseuse : le module s'importe au build sans `DATABASE_URL`, l'erreur ne part qu'à la première requête réelle. ⚠️ Le mot de passe initial a été exposé en conversation le 2026-07-28 et **doit avoir été régénéré** — à confirmer. |
| **Sécurité des dépendances** | `npm audit --omit=dev` → **0 vulnérabilité**. drizzle-orm monté en 0.45.2 (injection SQL), Next en 15.5.22 (8 avis HIGH), `postcss`/`sharp` forcés par `overrides`. ⚠️ **BatchChef reste exposé** à la même injection SQL (drizzle 0.44.7) — voir `[SEC-BATCHCHEF-DRIZZLE]`. |
| **Auth utilisateur** | ✅ **Fonctionnelle en production.** Auth.js v5 + Google, une seule adresse (`AUTHORIZED_EMAIL`), middleware **fail-closed** (503 si `AUTH_SECRET`/`AUTHORIZED_EMAIL` manquent). Décision de garde en fonctions pures testées. La page `/connexion` traduit les codes d'erreur d'Auth.js en cause actionnable. |
| **Logique métier** | Complète, testée et branchée : `lib/types.ts` (schémas Zod), `lib/scoring.ts` (barème), `lib/seed.ts` (38 offres), `lib/suivi.ts` (fusion, modification, résumé), `lib/filtres.ts`, `lib/hubSummary.ts`, `lib/actions.ts`, `lib/export.ts`, `lib/ajout.ts`, `lib/aFaire.ts`. **235 tests**, dont 13 d'intégration sur PGlite. |
| **UI** | Tracker complet. La page s'ouvre sur **« À faire maintenant »** (entrevues, relances échues, candidatures à envoyer, offres à vérifier — chacune justifiée par un fait du suivi), puis tableau de bord, ajout manuel, liste (recherche + 5 filtres), panneaux barème/salaires/SWOT. **Écriture** (statut, priorité, note perso), **vue détaillée** `/offre/[id]`, marquage **périmée**, **export CSV** qui suit les filtres affichés. Styles bi-thème reprenant l'identité de l'artifact. |
| **Chargement du suivi** | `npm run db:seed` charge les 38 offres. **Idempotent et non destructif** : relançable après une mise à jour du jeu de départ, le suivi de Marc est préservé. |
| **Déploiement** | ✅ **EN LIGNE** sur `https://emploi.hubperso.com` (projet Vercel `job-ai`, DNS Cloudflare en DNS only). Vérifié le 2026-07-28 : dernier déploiement production `READY` sur le SHA de `main`, **zéro erreur runtime**. ⚠️ **Vercel ne bloque pas sur la CI** — les quatre commits à CI rouge ont été déployés normalement. Les deux chaînes sont indépendantes : vérifier les deux. ⚠️ Le proxy réseau de la session Claude **refuse `emploi.hubperso.com`** (403 au CONNECT) : la vérification passe par les outils Vercel, pas par `curl`. |
| **Widget hub** | ✅ **ACTIF**. PR #12 de Hubperso mergée (entrée `jobai`), `HUB_TOKEN_JOBAI` posé, hub redéployé. |
| **Chantier courant** | **Chantier #01 (V1) terminé côté Claude** : toutes les tâches 🔧 sont livrées. La suite est le chantier #05 (expérience et présentation), dont deux items attendent une décision de Marc (`[UX-01]` style, `[UX-05]` sources). Voir `BACKLOG.md`. |

### Ce qui a été fait

- Lecture intégrale des 8 dépôts de l'écosystème (hub-contract, app-template, Hubperso,
  FinanceAI, DriveAI, BatchChef, claude-config, claude-code-toolkit) pour établir le contrat,
  la procédure de branchement au hub et la méthode de travail.
- Analyse des trois pièces fournies par Marc : l'artifact `tracker-emploi-v4.html` (référence
  UI et métier), le `HANDOVER.md` de la session du 27/07 et le squelette `jobtracker`.
- **ADR-0001** : identité, stack, phases V1→V4, périmètre, alternatives rejetées.
- `CLAUDE.md` (constitution, 6 garde-fous non négociables), `BACKLOG.md`, `docs/adr/`.
- Fork personnalisé : identité JobAI, route déplacée sous `/api/`, contrat d'échec 503,
  `.env.example` complété, `package.json` renommé, tests adaptés et étendus.
- **PR #1 mergée** (en merge commit `53b17ff`, pas en squash) — c'était la première et la
  dernière : **ADR-0002** acte le développement direct sur `main`, décidé après le
  va-et-vient de cette PR. Le filet perdu est remplacé par la CI.
- **CI en place** `[B-05]`. Ses deux garde-fous en bash ont été retirés le 2026-07-28 au
  profit du seul `tests/piiGuard.test.ts` — voir `BACKLOG.md` `[B-05]` pour le détail de
  l'incident (CI rouge quatre commits durant, non vue faute de PR).

### Décisions de cette session (détail dans ADR-0001)

IA : analyse d'offres + rédaction de CV/lettres + notation automatique + tri des réponses
Gmail · V1 = port fidèle + hub · Neon + Drizzle · scan Gmail dans JobAI (pas via DriveAI) ·
widget avec la meilleure offre en position 0 · CV lu depuis Google Drive · outillage niveau
DriveAI · dépôt privé.

### Réponses aux questions ouvertes du 27/07

1. **Réutiliser le scan Gmail de DriveAI ? Non.** Vérifié dans le dépôt : DriveAI n'expose
   que `api/hub/summary.ts` vers l'extérieur ; son moteur Gmail vit dans Apps Script à
   l'intérieur du compte Google de Marc, et sa surface Gmail est verrouillée par un check CI
   requis (`test/surface-gmail-ecriture.test.js`). JobAI implémente son propre scan.
   ⚠️ **DriveAI archive les courriels** : une requête limitée à `in:inbox` raterait tout ce
   qu'il a déjà rangé.
2. **Publier un schéma JobAI dans `hub-contract` ? Non.** Le contrat est générique par
   construction. JobAI expose un `HubSummary` standard ; son résumé interne reste privé.
3. **Le scan modifie-t-il les statuts ? Non.** Il propose, Marc valide.

### Risques et points ouverts

1. ⚠️ **Deux scopes Google restreints sur la même app OAuth.** La V2 demande
   `gmail.readonly`, et le choix « CV lu depuis Drive » ajoute un scope Drive. Ce sont des
   scopes *restreints* chez Google : en mode Test, les refresh tokens expirent au bout de
   7 jours [Probable — à confirmer dans la console Google Cloud] ; en production, ils
   déclenchent une vérification lourde. Les autres apps de Marc ne demandent que
   `openid/email/profile`, donc c'est un terrain neuf. **Piste** : `drive.file` + sélecteur
   de fichier Google (l'app ne voit que le fichier explicitement choisi) — satisfait le choix
   « depuis Drive » sans le scope large. À trancher par ADR-0002 avant la V2.
2. **Le contrat est pinné en `v1.0.0`**, donc **sans** le bloc `usage`. Sans effet en V1
   (aucun coût à publier) ; bloquant en V3. Un champ inconnu est stripé silencieusement.
3. **Ajouter JobAI au hub exige un redéploiement du hub** : `SOURCE_DEFS` est du code
   (`Hubperso/lib/sources.ts`), pas de la configuration, et `tests/sources.test.ts` est
   exhaustif — il cassera tant que les trois endroits ne sont pas mis à jour.
4. ~~**Le garde-fou n°1 n'a pas encore de vrai test-garde**~~ — **résolu** le 2026-07-28
   (`tests/piiGuard.test.ts`, `[V1-10]`). Ce qui reste ouvert est sa **portée assumée** :
   il détecte des FORMES (adresse, coordonnées, civilité, secret affecté), pas un nom de
   personne isolé — un motif générique de patronyme est inutilisable en français. Les six
   garde-fous ont désormais un verrou codé, sauf le n°4 (aucun scraping), qui reste tenu par
   l'ADR et la revue.

### Mise en ligne — FAITE le 2026-07-28

Neon, client OAuth Google, secrets, projet Vercel, DNS `emploi.hubperso.com`, déclaration
au hub : tout est en place et vérifié par les journaux. La procédure reste dans
[`docs/DEPLOIEMENT.md`](./docs/DEPLOIEMENT.md) pour la prochaine app.

**Trois pièges rencontrés à la mise en ligne, tous corrigés dans le code** :
1. La page rendait l'écran d'erreur générique de Next quand le schéma n'était pas appliqué.
   Elle explique désormais la panne et donne la commande à lancer.
2. La page de connexion disait « connexion refusée » sans distinguer un mauvais compte
   d'une variable manquante. Les codes d'Auth.js sont maintenant traduits.
3. Le hub applique `.trim()` à son jeton, JobAI ne le faisait pas : un espace invisible
   dans une variable Vercel donnait un 401 permanent entre deux valeurs d'apparence
   identique. Corrigé des deux côtés, verrouillé par tests.

### Reste à faire côté Marc (action humaine)

- [x] ~~Changer la branche par défaut en `main`~~ — fait le 2026-07-28.
      *(L'auto-merge et la protection de branche sont sans objet depuis l'ADR-0002 :
      décision de Marc, on n'y revient pas sans nouvel ADR.)*
- [x] ~~Neon, projet Vercel + DNS, client OAuth Google, les deux `HUB_TOKEN`~~ —
      **tout fait le 2026-07-28** `[V1-11]` `[V1-12]` `[V1-13]` `[V1-15]`. Cette liste est
      restée cochée « à faire » pendant que l'app était en ligne : le genre de dérive qui
      fait recommencer une étape déjà faite à la session suivante.

**Ce qui reste réellement côté Marc — deux points, aucun lié à la V1 :**

- [ ] ⚠️ **Confirmer que le mot de passe Neon a été régénéré.** Il a été exposé en
      conversation le 2026-07-28. Tant que ce n'est pas confirmé, considérer qu'il ne l'est pas.
- [ ] ⚠️ **BatchChef reste vulnérable en production** — `drizzle-orm` 0.44.7, injection SQL
      GHSA-gpj5-g38j-94v9 (HIGH). Voir `[SEC-BATCHCHEF-DRIZZLE]` dans `BACKLOG.md`. C'est un
      autre dépôt : il faut le dire, pas l'oublier ici.
- [ ] Accorder (ou refuser) la suppression de la branche distante
      `claude/hopeful-lovelace-4d09zx` `[B-07]`.

### Comment reprendre

1. `git fetch origin && git status` — vérifier l'état réel avant de juger quoi que ce soit.
   On travaille **directement sur `main`** : un commit poussé est en ligne, il n'y a pas de
   revue pour rattraper. Le gate avant commit n'est pas une formalité.
2. Lire `BACKLOG.md`. Le chantier #01 (V1) est livré à une tâche près ; l'essentiel du
   travail restant est au chantier #05.
3. La prochaine tâche est `[B-04]` (flotte d'agents) ou `[UX-04]` (carte des offres). ⚠️ `[UX-01]` (refonte visuelle) et `[UX-05]` (agrégateur
   multi-sources) attendent une **décision de Marc**, pas du code : ne pas les démarrer
   sans elle. `[NOTE-SALAIRE]` exige un ADR avant la moindre ligne (protocole §8).
4. Les trois pièces de référence de Marc (artifact HTML, squelette `jobtracker`, handover du
   27/07) ne sont **pas** dans le dépôt : elles ont été fournies en pièces jointes de session.
   L'artifact reste la référence pour le portage de l'UI `[V1-06]`.
