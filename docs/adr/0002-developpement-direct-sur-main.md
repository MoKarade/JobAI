# ADR-0002 — Développement direct sur `main`, sans branche de travail ni PR

- **Statut** : Accepté (décision Marc, 2026-07-28)
- **Date** : 2026-07-28
- **Modifie** : ADR-0001, section « Outillage projet » (le volet workflow git uniquement ;
  tout le reste de l'ADR-0001 reste en vigueur)

## Contexte

L'ADR-0001 reprenait le modèle DriveAI : branche `claude/<slug>`, PR draft, revue, puis
auto-merge sur CI verte avec le label `do-not-merge` comme frein.

À l'usage, dès la première PR, ce modèle a coûté plus qu'il n'a rapporté : la PR #1 est
passée en revue puis en brouillon puis en revue, avec des interprétations divergentes du
signal « ready for review » entre Marc et Claude, et un aller-retour sur qui devait merger.
Sur un projet **solo**, où le seul relecteur est aussi le seul auteur, la PR ne joue pas son
rôle de revue par les pairs : elle ajoute une cérémonie sans ajouter de regard.

Le contexte est également différent de DriveAI et FinanceAI : JobAI n'a pas de moteur
financier ni d'opérations irréversibles sur des documents. Le pire cas d'un mauvais commit
est un affichage faux, corrigeable par un `revert`.

## Décision

Le développement se fait **directement sur `main`**. Pas de branche de travail, pas de
pull request, pas d'auto-merge.

Ce qui remplace le filet perdu :

1. **Le gate local reste obligatoire et non négociable** avant chaque commit :
   `typecheck` + `test` + `build` + `lint`. Un commit poussé est en ligne immédiatement.
2. **La CI devient le seul filet partagé** (`.github/workflows/ci.yml`) : elle rejoue
   exactement le gate local sur `push` et ajoute deux garde-fous issus du `CLAUDE.md`
   (aucune adresse municipale en dur, aucun secret en dur).
3. **Retour arrière par `git revert`**, jamais par réécriture d'historique sur `main`.

## Impact quotas / coût

Nul. Une exécution de CI par push, sur le quota gratuit GitHub Actions d'un dépôt privé.
La concurrence est bornée (`cancel-in-progress`) pour ne pas empiler des exécutions inutiles.

## Analyse de risques

| Risque | Parade |
|---|---|
| Un commit fautif est en ligne immédiatement, sans revue | Gate local obligatoire ; CI qui rejoue tout ; `revert` trivial tant que l'historique n'est pas réécrit. |
| Perte de la trace « pourquoi ce changement » que portait la description de PR | Le message de commit porte cette charge : il doit expliquer le **pourquoi**, pas seulement le quoi. Les décisions structurantes vont en ADR. |
| Dérive : on prend l'habitude de committer sans gate | Le gate est dans le `CLAUDE.md` et rejoué par la CI. Un `push` qui casse la CI est visible. |
| Le garde-fou PII n'est qu'un filet grossier (motif d'adresse) | Assumé et **écrit comme tel** dans la CI : ce n'est pas une preuve, c'est un rappel. Le vrai test-garde reste la tâche `[V1-10]`. |

## Méthode de test

Les deux garde-fous de la CI ont été prouvés **discriminants** avant d'être committés :
propres sur l'état réel du dépôt, et détectant bien une adresse municipale et un secret
injectés en sonde, puis retirés. Un garde qui n'a jamais rien détecté ne protège rien.

## Conséquences

**Positif** — Moins de cérémonie, pas d'ambiguïté sur qui merge et quand, un historique
linéaire et lisible. Le travail va en ligne dès qu'il est vert.

**Négatif** — Plus aucune fenêtre de relecture avant que le code n'atteigne `main`. La
qualité repose entièrement sur le gate et sur la discipline de vérification **avant** commit.

**Risque accepté** — Si le projet devient collaboratif, ou si une opération irréversible
apparaît (suppression de données, envoi de courriels, écriture chez un tiers), cette décision
devra être rouverte par un nouvel ADR. Le déclencheur est explicite : **toute opération que
`git revert` ne suffit pas à annuler**.

## Alternatives rejetées

**Garder la PR mais l'auto-merger sur CI verte** (modèle DriveAI, tel qu'ADR-0001 le prévoyait)
Aurait supprimé l'ambiguïté sur qui merge, mais conservé le coût d'une branche, d'une PR et
d'une attente à chaque changement — pour une revue que personne ne fait, le projet étant solo.
→ Rejeté. C'est le modèle à reprendre si le projet devient collaboratif.

**Garder la PR pour les seuls changements structurants**
Séduisant, mais la frontière « structurant ou non » se décide au moment où l'on est le moins
objectif : juste avant de committer. Une règle qui dépend du jugement de celui qu'elle
contraint n'en est pas une.
→ Rejeté. Les décisions structurantes passent déjà par un ADR, qui joue ce rôle en amont.

## Réversibilité

Totale et immédiate : recréer une branche de travail et ouvrir une PR ne demande aucun
changement de code. La CI tourne déjà sur `pull_request` en plus de `push`, précisément pour
que ce retour en arrière ne coûte rien.
