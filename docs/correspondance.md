# Correspondance : ancien « CLAUDE.md §N » vers fichier

Le CLAUDE.md de JobAI (523 lignes) a été raccourci le 2026-09-29. Son texte complet, déplacé tel quel, vit dans `docs/claude/`. Un renvoi « CLAUDE.md §N » (dans le code, les ADR, `BACKLOG.md`, `HANDOVER.md`) se lit donc :

| Ancien renvoi | Ancien titre | Nouveau chemin |
|---|---|---|
| CLAUDE.md §1 (et §1.4 = règle 4) | Principes non négociables | `docs/claude/01-principes.md` |
| CLAUDE.md §2 | Conventions de code | `docs/claude/02-conventions.md` |
| CLAUDE.md §3 | Workflow git | `docs/claude/03-workflow-git.md` |
| CLAUDE.md §4 | Commandes utiles | `docs/claude/04-commandes.md` |
| CLAUDE.md §5 | Vérifications avant commit | `docs/claude/05-verifications.md` |
| CLAUDE.md §6 | Après un merge : vérifier le DÉPLOIEMENT | `docs/claude/06-deploiement.md` |
| CLAUDE.md §7 (et « §6 bis », règle de maintenance de `lib/trackerState.ts`) | Intégration hub | `docs/claude/07-hub.md` |
| CLAUDE.md §8 | Documentation (où vit quoi) | `docs/claude/08-documentation.md` |
| CLAUDE.md §9 | Leçons apprises (règles durables) | `docs/claude/lecons.md` |
| CLAUDE.md §10 | Style et compte-rendu | `docs/claude/10-style-compte-rendu.md` |
| CLAUDE.md §11 | Protocole de précision (notation, matching) | `docs/claude/11-protocole.md` |

Les renvois figés dans les ADR, `BACKLOG.md` et `HANDOVER.md` restent tels quels : ce sont des récits datés, et cette table est leur clé. Numérotation antérieure au 2026-08-20 : ancien §2 (garde-fous) = §1, ancien §7 (leçons) = §9, ancien §8 (protocole) = §11.
