# ADR-0006 — Dédoublonner malgré les variantes de raison sociale

**Date** : 2026-08-12 · **Statut** : accepté

## Contexte

Le 2026-08-12, ZipRecruiter est branché à côté d'Indeed (`[VEILLE-07]`). Les deux sources
décrivent les mêmes employeurs avec des raisons sociales **différentes** :

| Indeed | ZipRecruiter |
|---|---|
| `EllisDon Corporation` | `Ellisdon` |

`trier()` dédoublonne par `cleDoublon(entreprise, titre)` = `idOffre`, qui normalise les
accents et la casse mais **pas les suffixes juridiques**. Les deux produisent donc deux
identités, et la même offre entrerait deux fois.

**Ce n'est pas encore arrivé** : la variante ZipRecruiter a été écartée à la main lors du
premier lot conjoint. Le défaut est donc prospectif — il se déclenchera au premier balayage
automatique qui ramènera les deux sources. Le corriger avant est moins cher que de nettoyer
des doublons déjà en base et déjà annotés par Marc.

Une seule source ne pouvait pas produire ce défaut : c'est le second connecteur qui le crée.

## Le piège à ne pas tomber dedans

⛔ **Changer `idOffre` serait catastrophique.** Cet identifiant est **persisté** : il est la
clé primaire des offres en base, et `dejaSuivies` se construit à partir des `id` stockés
(`connues.map(o => o.id)`). Le modifier changerait l'identité de TOUTES les offres
existantes ; au balayage suivant, plus rien ne matcherait et le pipeline recréerait
l'intégralité du suivi en double — l'inverse exact du but, avec en prime la perte du lien
vers les champs que Marc possède (`statut`, `prio`, `dateEnvoi`, `userNote`, garde-fou n°2).

## Décision

**On n'écrit pas un nouvel identifiant : on ajoute une seconde CLÉ DE COMPARAISON.**

1. `cleCanonique(entreprise, titre)` — pure, exportée : même normalisation qu'`idOffre`,
   plus le retrait d'une liste **fermée** de suffixes juridiques
   (`inc`, `inc.`, `ltee`, `ltée`, `ltd`, `corporation`, `corp`, `enr`, `senc`, `srl`).
2. `trier()` considère une offre déjà vue si **l'une des deux clés** correspond, et mémorise
   les deux.
3. Les appelants ajoutent à `dejaSuivies` la clé canonique **dérivée des champs stockés**
   (`entreprise`, `poste`), à côté de l'`id` existant.

Aucune ligne de la base n'est réécrite. `idOffre` reste le générateur d'identité ; la clé
canonique ne sert **qu'à comparer**.

## Pourquoi une liste FERMÉE, et pas un rapprochement flou

Le dépôt porte déjà la leçon : *« une heuristique peut grouper ce qu'on REGARDE, jamais
décider ce qu'on ÉCRIT »*. `apparier("Robert", "Groupe Robert")` est vrai — et fusionner ces
deux-là ferait entrer une offre sous le mauvais employeur, avec la mauvaise distance.

Un suffixe juridique n'est pas une heuristique : c'est un **jeton de bruit connu**. `X inc.`
et `X` sont la même entité en droit comme en fait. On retire donc une liste énumérée, en fin
de chaîne uniquement, et **rien d'autre** :

- `Groupe Novatech Inc.` et `Novatech` restent **distincts** (le préfixe `Groupe` demeure) ;
- `Robert` et `Groupe Robert` restent **distincts** ;
- `EllisDon Corporation` et `Ellisdon` **fusionnent**.

C'est volontairement moins ambitieux que « résoudre les variantes de noms ». Le sur-mesure
viendra si la mesure le réclame — pas avant.

## Trade-offs assumés

- **Faux négatifs restants** : `Groupe X` / `X`, `X Canada` / `X`, les fautes de frappe. Non
  couverts, et c'est délibéré — chacun demanderait une règle dont le risque de sur-fusion
  dépasse le gain.
- **Coût** : deux clés calculées par offre au lieu d'une. Négligeable (chaînes courtes,
  quelques dizaines d'offres par passe).
- **La première occurrence gagne**, comme aujourd'hui : l'ordre des sources dans
  `passe.ts` décide donc quelle raison sociale Marc verra. Le dépôt Indeed passe en premier
  (`[depot, ...reseau]`), donc la forme la plus complète l'emporte — ce qui est le bon défaut.

## Alternatives rejetées

- **Migrer les `id` vers une forme canonique.** Corrige la cause à la racine, mais exige de
  réécrire la clé primaire de toutes les offres et de leurs dépendances. Le risque (perdre le
  rattachement des champs de Marc) est sans commune mesure avec le gain.
- **Canoniser à l'écriture du dépôt** (côté veille, avant l'app). Déplace le problème sans le
  résoudre : les offres déjà en base garderaient leur forme, et deux règles cohabiteraient.
- **Un rapprochement flou** (distance d'édition, sous-chaîne). Rejeté ci-dessus.

## Vérification

- La fusion et la NON-fusion sont prouvées cas par cas dans `tests/pipeline.test.ts`.
- Un test prouve qu'une offre dont l'`id` est déjà connu reste écartée — c'est la
  non-régression qui garantit qu'aucune migration n'est nécessaire.
