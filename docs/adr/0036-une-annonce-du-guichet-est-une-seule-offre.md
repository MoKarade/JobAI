# ADR-0036 — Une annonce du Guichet est une seule offre, même quand l'employeur change de nom

**Date** : 2026-10-21 · **Statut** : proposé (JobAI#195)

## Contexte

L'identité d'une offre suivie est `idOffre(entreprise, titre)` (ADR-0006). Le Guichet-Emplois renomme parfois l'employeur
d'une annonce entre deux passages (« Harvey's » devient « Harvey's 2538 ») : l'annonce, qui garde son numéro, entre alors une
seconde fois dans le suivi. Tout ce qui compte des offres par employeur compte double, et un employeur à trois noms
(« Harvey's », « Harvey's 2538 », « Harvey's 2789 ») est trois lignes.

**Mesure, lue en production le 2026-10-21 avec `preuves_ecrans` → `suivi.doublonsAnnonce`** (PR #206, avant toute
correction) : 8 800 offres suivies hors historique ; **40 annonces comptées pour plusieurs offres** (41 offres en trop,
environ 0,5 %), dont 16 sous des noms d'employeur différents ; 7 enseignes éclatées sur 20 noms (Tim Hortons 5 noms, A&W 4,
Harvey's 3, Canadian Tire 2, Jean Coutu 2). Le défaut est réel mais petit : la réponse reste proportionnée.

## Décision

**On n'écrit rien dans le suivi existant et on ne change aucun identifiant** (ADR-0006 : changer `idOffre` recréerait tout
le suivi en perdant le lien vers les champs de Marc). Le numéro d'annonce du lien devient une CLÉ DE COMPARAISON de plus.

1. **`numeroAnnonce(lien)`** (`lib/annonce.ts`) lit le numéro d'une annonce, pour les seuls hôtes du Guichet et de Job Bank.
   Un lien qui ne se lit pas rend `null` : « je ne sais pas », jamais « identique ».
2. **Lecture** : `chercher_offres` rend une offre par annonce (`unePourChaqueAnnonce`). La représentante est l'offre ouverte,
   puis la plus récemment repérée. **Quand deux copies, ou plus, portent chacune une décision de Marc** (statut, date d'envoi
   ou note), on les garde toutes : choisir laisserait de côté une décision. Le résultat dit `copiesMasquees`.
3. **Signaux d'employeur** (ADR-0029) : les copies d'un numéro forment une offre ; sa durée court de la première vue de ses
   copies à leur dernière vue. Les signaux se regroupent par **enseigne** (`cleEnseigne`, `lib/enseigne.ts`) : un numéro de
   succursale de 3 à 5 chiffres en fin de nom est retiré, rien d'autre. `cleGroupement`, la clé de la carte et des
   positions, ne change pas : **une enseigne sert à COMPTER, jamais à placer une épingle** (ADR-0022 : une heuristique peut
   signaler ce qu'on regarde, jamais décider ce qu'on écrit).
4. **Ingestion** : `trier` écarte comme doublon une annonce dont le numéro est déjà suivi, et `brutesParIdStocke` retrouve
   l'offre stockée par ce numéro — sans quoi l'offre prendrait des absences pendant qu'elle est publiée sous un autre nom
   (le défaut qu'ADR-0006 avait fermé pour les variantes de raison sociale).

## Ce que ça ne fait pas

- Les 41 copies déjà stockées restent en base : elles ne sont ni supprimées ni fusionnées (aucune écriture sur le suivi,
  aucune migration). Elles ne se voient plus à la lecture, et vieillissent d'elles-mêmes (absences, péremption).
- Deux enseignes sans rapport ne sont jamais réunies sur un détail de format : « Studio 54 » (deux chiffres) et une société à
  numéro (« 9123-4567 Québec inc. ») gardent leur nom. Au pire, la règle réunit trop peu.
- La forme juridique placée AVANT le numéro (« X inc. 1234 ») n'est pas réduite : prudence assumée.

## Risques

- Une annonce réutilisée par le Guichet pour un autre poste : non constaté (un numéro désigne une publication) ; si cela
  arrivait, l'effet serait un doublon écarté à tort, visible dans les comptes de passe (`doublons`).
- Un signal d'enseigne s'affiche sur chaque carte portant l'un de ses noms : trois cartes « Harvey's » montrent le même
  compte, celui de l'enseigne. Le libellé de la carte pourra le dire quand #161 (dossier employeur) la reprendra.

## Méthode de test

Tests purs sur des données fictives (`tests/annonce*.test.ts`, `tests/doublonsAnnonce.test.ts`,
`tests/annonceUnique.test.ts`, `tests/mcpServeur.test.ts`). Aucun appel IA : coût nul. En production, après déploiement :
`chercher_offres` sur « Harvey's » (périmées et historique inclus) ne rend plus deux offres de même lien, et `preuves_ecrans`
avec `employeur` « Harvey's » rend des comptes qui reprennent les trois noms.
