# ADR-0023 — Une table d'alias FERMÉE pour les employeurs déjà rencontrés

**Date** : 2026-09-21 · **Statut** : Accepté (Marc, 2026-09-21)

## Contexte

Mesuré en corrigeant ADR-0022 (`[EMPLOYEUR-VARIANTE]`, BACKLOG) : sur `SEED` ×
`ENTREPRISES_CIBLES`, deux paires d'offres actives ne s'égalent plus sous la règle stricte
(`memeEmployeur`, ADR-0021/0022) :

| Nom rencontré | Nom déjà géocodé |
|---|---|
| `STERIS` | `STERIS Canada` |
| `Exo-s Saint-Damien` | `Exo-s` |

Aucune des deux paires ne diffère par un suffixe juridique (`SUFFIXES_CORPORATIFS` dans
`lib/employeurs.ts` : `inc`, `ltee`, `corp`… — déjà traités depuis ADR-0006). L'une ajoute un
qualificatif de pays, l'autre un qualificatif de lieu. `normaliserNomEmployeur` ne les
rapproche donc pas, et `apparier` (qui les rapprocherait par sous-chaîne) n'a plus le droit
de décider une donnée depuis ADR-0022 — à raison : `apparier("Robert", "Groupe Robert")` est
vrai, et fusionner ces deux-là par une règle syntaxique fusionnerait deux entreprises sans
aucun rapport.

**Impact aujourd'hui : nul.** Les deux offres du SEED portent un `km` manuel, jamais retouché
par `planifierDistances` (`lib/distances.ts`). Le défaut est prospectif : une offre FUTURE
ingérée sous « STERIS » ne retrouverait pas la position déjà connue de « STERIS Canada », et
repasserait par `employeursASituer` → un géocodage Nominatim de plus. Coût réel de l'inaction :
un appel Nominatim additionnel par cas, jamais une donnée fausse — `memeEmployeur` refuse déjà
de deviner, ce qui est le comportement voulu.

**Ce n'est pas la première fois que ce problème est regardé.** ADR-0006 (2026-08-12) l'a
déjà tranché une fois, pour le DÉDOUBLONNAGE à l'ingestion : *« Faux négatifs restants :
`Groupe X` / `X`, `X Canada` / `X`… Non couverts, et c'est délibéré — chacun demanderait une
règle dont le risque de sur-fusion dépasse le gain. »* Cet ADR-ci ne renverse pas cette
décision : il propose un mécanisme d'une nature DIFFÉRENTE de celle qu'ADR-0006 a rejetée —
voir « Pourquoi ce n'est pas la règle qu'ADR-0006 a refusée », plus bas.

## Décision proposée

**Une table d'alias EXPLICITE, à la même place que la liste de suffixes juridiques
(`lib/employeurs.ts`), consultée par `normaliserNomEmployeur` — donc par `memeEmployeur`,
`cleGroupement` ET `positionDe` d'un seul mouvement, jamais une troisième règle séparée.**

```ts
/**
 * Paires CONNUES d'un même employeur sous deux noms qu'aucune règle syntaxique ne
 * rapproche (ni suffixe juridique, ni casse/accent). Chaque entrée est un fait constaté,
 * jamais deviné : voir « Pourquoi une liste FERMÉE » plus bas.
 */
const ALIAS_EMPLOYEUR: ReadonlyMap<string, string> = new Map([
  ["steris canada", "steris"],
  ["exo-s saint-damien", "exo-s"],
]);
```

`normaliserNomEmployeur` applique l'alias APRÈS sa normalisation actuelle (accents, casse,
suffixes) : `ALIAS_EMPLOYEUR.get(forme) ?? forme`. Les deux côtés d'une comparaison passent
par la même fonction, donc l'alias joue dans les deux sens sans code supplémentaire — peu
importe lequel des deux noms a été géocodé en premier.

Une seule fonction pure modifiée (`normaliserNomEmployeur`), zéro nouvelle surface : c'est le
même principe qu'ADR-0022 vient d'établir — une identité, un seul endroit qui la décide.

## Audit réalisé (§11 point 2) — AVANT d'écrire le code

Exécuté sur `SEED` (53 offres) × `ENTREPRISES_CIBLES` (36 entrées) = 1 908 paires, comparant
`memeEmployeur` SANS et AVEC la table :

| | Compte |
|---|---|
| Paires déjà égales AVANT (inchangées) | 39 |
| Paires qui BASCULENT de faux à vrai | **2**, exactement les deux visées |
| Paires qui basculent de vrai à faux, ou toute autre paire touchée | **0** |

Les deux seules bascules : `STERIS`/`STERIS Canada` et `Exo-s Saint-Damien`/`Exo-s`.
Non-régression testée en plus sur `Robert`/`Groupe Robert`, `Novatech`/`Groupe Novatech`,
`Novatech`/`Novatech Canada`, `ISS`/`ISS Facility Services` : toutes restent distinctes.
Reproduit dans `tests/employeurs.test.ts` (« audit SEED × ENTREPRISES_CIBLES »).

## Pourquoi ce n'est PAS la règle qu'ADR-0006 a refusée

ADR-0006 a rejeté un **rapprochement flou** (distance d'édition, sous-chaîne) parce qu'une
RÈGLE se trompe un jour sur un cas qu'elle n'a jamais vu — `apparier("Robert", "Groupe
Robert")` en est la preuve vivante. Ce qui est proposé ici n'est pas une règle : c'est une
liste FERMÉE de faits déjà vérifiés à la main, exactement le patron déjà accepté pour les
suffixes juridiques (`SUFFIXES_CORPORATIFS`) — sauf que là où un suffixe est une classe
fermée et énumérable une fois pour toutes, un alias d'entreprise s'ajoute un par un, au fil
des cas **RENCONTRÉS réellement** (mesurés, comme les deux ci-dessus), jamais devinés à
l'avance. Aucune entrée n'est ajoutée « au cas où » — c'est la même discipline que la liste
de suffixes, appliquée à un domaine où la classe n'est pas énumérable d'avance.

## Impact quotas Google & coût LLM

Aucun appel LLM. Impact quota Nominatim : **négatif** (le mécanisme ÉVITE des appels, il n'en
ajoute aucun) — c'est précisément le problème qu'il corrige. Aucun nouvel appel réseau.

## Analyse de risques

- **Sur-fusion par erreur de saisie.** Une entrée mal posée (deux entreprises réellement
  différentes) fusionnerait leur position, leur distance et leur note en silence — le risque
  qu'ADR-0006 nomme. Garde-fou : chaque entrée est un fait vérifié par Marc ou par moi avant
  d'entrer dans la table (comme aujourd'hui pour `ENTREPRISES_CIBLES`), jamais une inférence
  automatique ; et la table reste **petite** par construction (deux entrées au jour de cet
  ADR), ce qui rend une revue exhaustive possible à chaque ajout.
- **Confusion avec `apparier`.** Le fichier porte déjà un avertissement explicite (« une
  heuristique peut SIGNALER, jamais décider ») ; l'alias n'en est pas une exception qui
  l'affaiblirait — il n'est PAS une heuristique, c'est un fait. Le commentaire de
  `ALIAS_EMPLOYEUR` le dira en toutes lettres, et un test dédié prouvera que la table reste
  minuscule (borne haute, mutation testée) pour qu'elle ne dérive jamais vers une liste
  d'exceptions qu'on cesse de relire.
- **Aucun garde-fou du dépôt n'est touché.** Pas de donnée personnelle, pas de scraping, pas
  de jeton, pas d'écriture hors `lib/suivi.ts` : c'est une table de constantes lue par une
  fonction pure déjà testée.

## Méthode de test (protocole §11, point 2)

Avant tout changement du pipeline : exécuter `normaliserNomEmployeur`/`memeEmployeur` avec
et sans la table sur **tout `SEED` croisé avec `ENTREPRISES_CIBLES`** (le même audit qui a
servi à mesurer ce défaut), et rendre le tableau [nom A | nom B | égal avant | égal après]
pour les deux paires connues ET pour un échantillon de paires qui NE doivent PAS s'égaler
(`Robert`/`Groupe Robert`, `Novatech`/`Groupe Novatech`, non-régression explicite héritée
d'ADR-0006). Perturbations à jouer : la table vidée (retour au comportement actuel, prouve
que rien d'autre n'a changé), une entrée corrompue (prouve qu'une seule mauvaise paire ne
fait fusionner qu'elle-même, pas une classe entière).

## Conséquences

**Positif** : les deux cas déjà rencontrés cessent de coûter un géocodage inutile ; le
mécanisme est extensible à coût nul (une ligne par cas futur) ; une seule fonction décide de
l'identité partout (affichage, position, distance, score), donc pas de troisième règle à
faire diverger des deux premières.

**Négatif** : une liste de plus à tenir à la main, comme `ENTREPRISES_CIBLES` et
`SUFFIXES_CORPORATIFS` déjà. Assumé — c'est le trade-off explicite qu'ADR-0006 a choisi pour
la même famille de problème.

**Risques acceptés** : voir « Analyse de risques ». Le risque résiduel (erreur de saisie
humaine) existe déjà pour `ENTREPRISES_CIBLES` sans qu'il ait jamais posé problème.

## Alternatives rejetées

- **Un rapprochement flou** (distance d'édition, retrait générique des qualificatifs
  géographiques). Rejeté : c'est exactement la classe de règle qu'ADR-0006 a refusée, pour
  la même raison — elle se tromperait un jour sur un cas qu'elle n'a jamais vu.
- **Ne rien faire, laisser `[EMPLOYEUR-VARIANTE]` ouvert indéfiniment.** Option valide (coût
  de l'inaction : un appel Nominatim de plus par cas, jamais une donnée fausse) — mais les
  deux cas sont déjà mesurés et la correction est petite ; autant la faire pendant qu'elle
  est encore fraîche plutôt que de la re-découvrir plus tard.
- **Table consultée seulement par `positionDe`**, pas par `cleGroupement`/`memeEmployeur`.
  Rejeté : recréerait exactement la situation qu'ADR-0022 vient de corriger — deux règles
  pour une même question d'identité, qui finissent par diverger là où personne ne regarde.

## Réversibilité

Totale et immédiate : retirer les deux entrées de `ALIAS_EMPLOYEUR` (ou vider la table)
retourne au comportement actuel, sans migration ni donnée à corriger — aucune ligne de base
n'est ré-écrite par ce mécanisme, il ne fait que décider quelle position existante servir.
