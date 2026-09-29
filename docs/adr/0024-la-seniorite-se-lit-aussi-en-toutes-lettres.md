# ADR-0024 — La séniorité se lit aussi en toutes lettres

**Date** : 2026-09-29 · **Statut** : Accepté (gérant, 2026-09-29, sur les deux questions
bloquantes ci-dessous) — signalé à Marc

## Contexte

`scoreSeniorite` (`lib/scoring.ts`) ne reconnaît que `(\d+)…ans d'expérience`. « Posséder
**trois à cinq années** d'expérience » (offre Dracon, réelle, trouvée en notant les offres
du repérage du 2026-07-29, `BACKLOG.md`) ne matche pas : le motif ne trouve aucun chiffre et
retombe sur la valeur neutre (`senioriteNonPrecisee`, 11/15). Une exigence RÉELLE et
LISIBLE est donc traitée comme « non précisée », alors que ce n'est pas le cas.

## Décision

Une table `un`→`quinze` (`ANNEES_EN_LETTRES`), essayée en SECOND, seulement si le motif
chiffré ne matche pas. Même logique de capture que l'existant : le PREMIER nombre rencontré
est le minimum retenu (voir « Question 1 » ci-dessous). `un`/`une` valent 1 : le genre ne
change pas la quantité. La table s'arrête à quinze — le seul cas réel connu (Dracon)
s'arrête à « cinq », et l'allonger sans un second cas réel pour la justifier serait une
généralisation non prouvée.

### Question bloquante 1 — quelle borne pour un intervalle en lettres ?

`BACKLOG.md` disait « 11 au lieu de 9 » (implique lire **cinq**, la borne haute). Mais la
convention DÉJÀ EN PLACE pour un intervalle CHIFFRÉ retient la borne BASSE :
`scoreSeniorite("5-10 ans d'expérience")` **égale** `scoreSeniorite("5 ans d'expérience")`
(`tests/scoring.test.ts`, capture `m[1]`, le premier nombre). En appliquant la même règle à
« trois à cinq », le nombre retenu est **trois**, donc la valeur correcte est **13**, pas 9.

**Tranché par le gérant (2026-09-29)** : borne basse partout, cohérente avec l'existant —
ce n'est pas un nouveau sens de la notation, c'est la même règle appliquée à une seconde
forme d'écriture. La ligne de `BACKLOG.md` (« au lieu de 9 ») est corrigée en conséquence.

### Question bloquante 2 — le tableau avant/après du protocole §11 est impossible sur `SEED`

Vérifié : ni `SEED` (`lib/seed.ts`), ni la base réelle (`lib/db/schema.ts`), ne conservent le
texte source d'une annonce. `computeScore` lit `brute.description` à L'INGESTION
(`lib/ingest/pipeline.ts`), puis ce texte est jeté — seuls `score` et `raisons` (un résumé
écrit par Marc, pas l'annonce) survivent sur l'`Offre` persistée. Le protocole §11.2 demande
de rejouer la logique sur les 53 offres du seed : structurellement impossible, aucune n'a de
texte à rejouer.

**Tranché par le gérant (2026-09-29)** : audit allégé accepté — voir « Méthode de test ».
La conservation du texte source est notée comme IDÉE au `BACKLOG.md`
(`[TEXTE-SOURCE-OFFRES]`), sans être construite : elle soulève ses propres questions
(volume en base, garde-fou n°1 sur un texte non maîtrisé, rétention) qui dépassent le
périmètre de ce correctif.

## Impact quotas/coût

Nul. Pur regex, aucun appel LLM, aucune dépendance neuve.

## Analyse de risques

- **Faux positif** (un mot de nombre matché hors contexte) : mitigé par `\b…\b` (limites de
  mot) et l'exigence du même suffixe `an(?:s|nées)? d'exp` que le motif chiffré — « sept »
  ne matche pas dans « septembre », testé.
- **Portée** : seules les offres dont l'exigence est écrite entièrement en lettres sont
  concernées ; toute offre déjà correctement notée (motif chiffré) est inchangée — testé
  explicitement (non-régression).
- **Risque accepté** : la table s'arrête à quinze ; une offre exigeant « vingt ans »
  écrite en lettres retomberait sur le neutre, comme avant ce correctif. Pas de cas réel
  connu à ce jour.

## Méthode de test

Audit allégé (accepté par le gérant, faute de corpus — voir Question 2) :
1. **Le cas réel nommé** : la phrase Dracon exacte rend le même score que « 3 ans
   d'expérience ».
2. **Couverture exhaustive de la table** : chaque mot de `un` à `quinze`, seul, rend le
   même score que son équivalent chiffré.
3. **Intervalle en lettres** : « cinq à dix ans » rend le même score que « cinq ans »
   (borne basse), symétrique au test déjà existant sur les intervalles chiffrés.
4. **Variantes de forme** : `an`/`ans`/`année`/`années`, apostrophe typographique — mêmes
   cas que ceux déjà couverts pour la forme chiffrée.
5. **Non-régression** : les cas chiffrés existants (`tests/scoring.test.ts`) restent
   inchangés — le motif chiffré est toujours essayé en premier.

## Conséquences

**Positif** : une offre réelle (Dracon, et toute future offre similaire) reçoit sa vraie
note de séniorité au lieu d'un neutre par défaut.

**Négatif** : aucun — changement additif, la forme chiffrée n'est pas touchée.

**Risques acceptés** : la table de mots s'arrête à quinze (voir Analyse de risques) ; les
formes mixtes (« 3 à cinq ans ») ne sont pas reconnues — aucun cas réel connu à ce jour.

## Alternatives rejetées

- **Une bibliothèque de conversion mot→nombre en français** (npm) : rejetée — dépendance
  neuve pour 16 mots fixes, alors qu'une table statique suffit et reste auditable en une
  lecture.
- **Étendre la table au-delà de quinze par prudence** : rejetée — généraliser sans un
  second cas réel serait spéculatif (YAGNI), et le repli neutre existant reste un filet
  honnête en attendant un cas qui le justifie.

## Réversibilité

Totale et locale : retirer `ANNEES_EN_LETTRES` et `RE_ANNEES_EN_LETTRES`, et
`anneesMinExigees` retombe sur le seul motif chiffré (comportement d'avant cet ADR).
