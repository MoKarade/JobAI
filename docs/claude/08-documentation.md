## 8. Documentation (où vit quoi)

| Fichier | Contenu |
|---|---|
| `HANDOVER.md` | **L'état RÉEL** : ce qui tourne, ce qui reste. À lire en premier — l'état ne se duplique nulle part ailleurs, parce qu'un état recopié se périme dans l'exemplaire le moins relu. |
| `BACKLOG.md` | Ce qui est décidé mais pas fait. Chaque tâche a un ID, utilisé en préfixe de commit. |
| `docs/adr/` | Les décisions architecturales, `NNNN-slug.md`. Obligatoire avant toute modif de la notation ou du matching (§11). |
| `docs/LESSONS.md` | Le journal des leçons **et leurs HISTOIRES** (incident, mesure, date) — depuis le 2026-09-17, il porte aussi les 153 récits déménagés de la §9. Leur RÈGLE reste en §9 : une leçon s'écrit des DEUX côtés, dans le même commit. |
| `docs/DEPLOIEMENT.md` | Déployer, et les variables d'environnement attendues. |
| `docs/ROUTINE-DEPOT.md` · `docs/veille-prompt.md` | **RÉCITS depuis le 2026-09-18** : la routine de dépôt et son prompt décrivent un canal supprimé. Gardés comme récits datés (leur en-tête le dit), jamais comme mode d'emploi. |

La structure est commune aux huit dépôts du hub — elle est fixée dans
[`conventions/STRUCTURE-DEPOT.md`](https://github.com/MoKarade/claude-config/blob/main/conventions/STRUCTURE-DEPOT.md)
du dépôt `claude-config`, et nulle part ailleurs.

Un fichier **daté** (audit, plan, analyse) est un **récit** : il vit dans `docs/`, sa date dit à
quoi il correspond, et il **ne se met pas à jour**. Ce qui doit rester vrai va dans un document
sans date. C'est pourquoi les renvois `§7` / `§8` figés dans les ADR et le `BACKLOG.md` n'ont pas
été réécrits par la renumérotation (voir l'en-tête) : réécrire un récit, c'est le falsifier.

