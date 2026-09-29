# Coûts CI — JobAI

**Dépôt PUBLIC** (`gh repo view MoKarade/JobAI` : `isPrivate: false`), branche par défaut **main**, **sans protection de branche** (`gh api .../branches/main/protection` : 404). Mesuré le 29/09/2026.
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
- Aucun cron GitHub Actions dans `ci.yml` ni `auto-merge.yml`.

## Exceptions au gabarit

| Quoi | Raison | Condition de retour |
|---|---|---|
| Pas de `.github/ci/ignore-command.mjs` : `vercel.json` garde son `ignoreCommand` existant, `scripts/build-necessaire.sh` | JobAI avait déjà sa propre garde avant ce lot (créée après l'incident du 2026-08-05 : douze déploiements en deux heures, quota épuisé). Elle exempte AUSSI `tests/*` — pas seulement `*.md`/`docs/**`/`.github/**` comme le gabarit — et échoue fermé (construit) sur tout doute. Remplacer une garde plus large, déjà vécue en production, par une plus étroite serait une régression, pas un alignement. | Si les deux implémentations divergent sur un cas réel constaté, réconcilier à ce moment-là. |
| `--verifier` de `generer-index.mjs` ne contrôle PAS les correspondances de `docs/correspondance.md` (vacuité silencieuse, pas un échec) | `docs/correspondance.md` de JobAI a TROIS colonnes (ancien renvoi, ancien titre, nouveau chemin), le gabarit en attend DEUX : chaque ligne de données a `c.length === 3` et `lireCorrespondance` l'ignore (`c.length !== 2`). Le fichier reste correct et utile pour un lecteur humain ; seul le contrôle automatique ne porte sur rien. Constaté en lançant `--verifier` localement (« correspondances valides » alors qu'aucune ligne n'a été lue). | Reformater `docs/correspondance.md` en deux colonnes (perd la colonne « ancien titre »), ou adapter la copie locale du script (cesse d'être identique aux autres apps) — décision à trancher, pas prise ici. |
| Pas de nouveau test `structure-doc` dédié à ce lot | La structure commune (CLAUDE.md court + `docs/claude/`) a déjà ses propres gardes, posées le 2026-09-29 dans un lot séparé (PR #41/#42, avant `st-jobai`) : `tests/piiGuard.test.ts` (garde-fou n°1, plus stricte que le motif générique du gabarit) et la structure elle-même. Dupliquer une garde déjà couverte, dans un style de test différent (`node:test` du gabarit vs `vitest` du reste du dépôt), ajouterait de la divergence sans rien détecter de neuf. | Si `docs/INDEX.md` ou `verifier-longueur.mjs` perdent leur couverture par un autre moyen. |
