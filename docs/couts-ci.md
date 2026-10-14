# Coûts CI — JobAI

**Dépôt PUBLIC** (`gh repo view MoKarade/JobAI` : `isPrivate: false`), branche par défaut **main**. Mesuré le 29/09/2026.
⚠️ Correction du 14/10 : « sans protection de branche » était faux. L'API de protection classique rend bien 404, mais `main` est protégée par un **ruleset** (`gh api repos/MoKarade/JobAI/rulesets`) créé le 28/09 : pas de suppression, pas de réécriture, trois contrôles obligatoires (ceux de `.github/auto-merge.json`), aucun contournement. Au 14/10, le workflow « Fusion automatique » (`fusion-auto.yml`) est désactivé manuellement côté GitHub ; la fusion passe par `auto-merge.yml`.
GitHub Actions est **GRATUIT** sur un dépôt public : aucune minute n'est comptée. Modèle : `modeles/couts/couts.md` de l'Atelier. Les coûts LLM de l'app sont dans `docs/claude/07-hub.md` (bloc `usage` publié au hub) ; il n'existe pas de `docs/COUTS.md` distinct ici.

## Runs GitHub Actions (information)

Mesure : `node modeles/couts/compter-runs.mjs MoKarade/JobAI 2026-09` (lecture seule ; liste limitée à 1 000 runs : le mois peut être incomplet ; la durée de calendrier compte l'attente et n'est pas une facturation) :

| Workflow | Déclencheurs | Runs en 09/2026 (mesuré) | Échoués | Rôle |
|---|---|---|---|---|
| CI | push 90, pull_request 34 | 124 | 10 | Gate (typecheck/tests/lint/build) + Qualité + Sécurité (S6). |
| auto-merge | check_run 15, status 18, workflow_run 9, schedule 2 | 44 | 0 | Fusion automatique quand tous les contrôles requis sont verts. |
| Dependabot Updates | dynamique 21 | 21 | 2 | Mises à jour de dépendances. |
| Fusion automatique | pull_request 15 | 15 | 0 | Kit de l'Atelier. |
| armement-auto-merge | pull_request_target 9 | 9 | 0 | Arme/désarme l'auto-fusion selon `.github/auto-merge.json`. |

## Crons

- `/api/cron/veille` (11 h) et `/api/cron/geocodage` (3 h) : crons applicatifs **Vercel** (`vercel.json`), pas GitHub Actions — hors du périmètre de ce document.
- Aucun cron GitHub Actions dans `ci.yml`. `auto-merge.yml` en a un (`23 */6 * * *`, filet de rattrapage, sortie immédiate sans PR ouverte) — corrigé le 14/10, la ligne disait le contraire alors que le tableau ci-dessus compte ses runs `schedule`.
- `sonde-registre.yml` et `sonde-sources.yml` : déclenchement manuel seulement (`workflow_dispatch`), absents du tableau de 09/2026.

## Exceptions au gabarit

| Quoi | Raison | Condition de retour |
|---|---|---|
| Pas de `.github/ci/ignore-command.mjs` : `vercel.json` garde son `ignoreCommand` existant, `scripts/build-necessaire.sh` | JobAI avait déjà sa propre garde avant ce lot (créée après l'incident du 2026-08-05 : douze déploiements en deux heures, quota épuisé). Elle exempte AUSSI `tests/*` — pas seulement `*.md`/`docs/**`/`.github/**` comme le gabarit — et échoue fermé (construit) sur tout doute. Remplacer une garde plus large, déjà vécue en production, par une plus étroite serait une régression, pas un alignement. | Si les deux implémentations divergent sur un cas réel constaté, réconcilier à ce moment-là. |
| Copie locale de `generer-index.mjs` adaptée (`lireCorrespondance` accepte 2 OU 3 colonnes) | `docs/correspondance.md` de JobAI a TROIS colonnes (ancien renvoi, ancien titre, nouveau chemin), le gabarit d'origine en attend DEUX : `--verifier` passait « correspondances valides » sans avoir lu une seule ligne (vacuité constatée, corrigée le 2026-09-29 sur signalement du gérant). Adapté plutôt que le fichier reformaté (garde la colonne « ancien titre », utile aux lecteurs humains) : la copie locale n'est donc plus identique octet pour octet aux autres apps sur cette seule fonction. Vérifié : 11 lignes réellement lues, une ligne cassée injectée à la main est détectée. | Si un outil de l'Atelier compare les copies de `generer-index.mjs` entre apps pour en garantir l'identité, celle-ci le fera échouer à dessein — signaler l'écart plutôt que le faire disparaître en silence. |
| Pas de nouveau test `structure-doc` dédié à ce lot | La structure commune (CLAUDE.md court + `docs/claude/`) a déjà ses propres gardes, posées le 2026-09-29 dans un lot séparé (PR #41/#42, avant `st-jobai`) : `tests/piiGuard.test.ts` (garde-fou n°1, plus stricte que le motif générique du gabarit) et la structure elle-même. Dupliquer une garde déjà couverte, dans un style de test différent (`node:test` du gabarit vs `vitest` du reste du dépôt), ajouterait de la divergence sans rien détecter de neuf. | Si `docs/INDEX.md` ou `verifier-longueur.mjs` perdent leur couverture par un autre moyen. |
