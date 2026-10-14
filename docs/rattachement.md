# Rattachement de JobAI à l'Atelier

- Session dédiée dans l'agence : `jobai-53` (pas de `jobai-chef` distinct à ce jour ; les lots récents sont coordonnés directement avec le gérant).
- Dernières PR : `[DOC-CLAUDE-COURT]` CLAUDE.md court + `docs/claude/` (#41/#42, 2026-09-29) ; `[AUTH-ASYM-P1]` phase 1 de la connexion signée (fusionnée le 29/09, #43) ; `[TEST-CVSURFACE-WIN]` correctif de garde masquée sous Windows.
- Ce lot (`st-jobai`) : structure commune allégée — `docs/INDEX.md` généré, `docs/couts-ci.md`, documentation légère en CI. `ignoreCommand` Vercel **non repris** : JobAI garde `scripts/build-necessaire.sh`, sa propre garde antérieure et plus large (voir `docs/couts-ci.md`, table des exceptions).
- Dépôt PUBLIC, branche par défaut `main`. Au 14/10 : `main` protégée par un ruleset depuis le 28/09 (trois contrôles obligatoires, push direct refusé) — ADR-0002 (« direct sur `main` ») est en écart, à trancher par Marc (voir `docs/claude/03-workflow-git.md`). Dernières fusions : #51-#54 (30/09).
- Décision de Marc en attente : aucune connue à ce jour pour la structure commune elle-même. Le format à trois colonnes de `docs/correspondance.md` (contre deux dans le gabarit) reste un écart documenté, pas encore tranché.
