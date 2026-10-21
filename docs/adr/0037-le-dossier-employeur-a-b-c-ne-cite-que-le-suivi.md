# ADR-0037 — Le dossier employeur A, B ou C ne cite que le suivi, et dit « inconnu » sans source

**Date** : 2026-10-21 · **Statut** : proposé (JobAI#161, plan « analyse du CV et dossier employeur », étape B3). Aucun coût IA,
aucune nouvelle source, aucune écriture. Les seuils sont des choix à relire avec Marc sur 5 employeurs (preuve de la tâche).

## Contexte

La fiche d'une offre ne disait rien de l'employeur. Les signaux du suivi existent (ADR-0029 : offres ouvertes, plus ancienne
ouverte, durée médiane des fermées, intitulés repris), corrigés par ADR-0036 (une annonce compte une fois, les succursales d'une
enseigne se regroupent). Reste à les résumer en une lettre, sans affirmer ce qu'aucune source ne dit.

## Décision

1. **Une seule source : le suivi de la veille.** Le registre des entreprises en base n'a ni date d'import ni statut, et le RENA ne
   s'affirme jamais sur une simple égalité de nom (ADR-0030) : aucun des deux ne peut citer une date, aucun n'entre dans une
   ligne. Ils pourront entrer par une tâche à part, avec leur ADR, le jour où une date et un statut existent.
2. **Chaque ligne cite sa source et sa date** : « Suivi JobAI (veille), vu jusqu'au <dernier jour où un balayage a vu une offre
   de l'employeur> » (`SignauxEmployeur.observeLe`).
3. **Inconnu** : moins de 3 offres observées par la veille (au moins une ligne de journal), ou aucune date d'observation. Le bloc
   dit « Employeur : inconnu » et n'affiche aucune ligne.
4. **La lettre** (`lib/dossierEmployeur.ts`, pur) compte des signaux défavorables, tous des constats sur le suivi :
   - la plus ancienne offre ouverte l'est depuis au moins **60 jours** (vus) ;
   - la durée médiane des offres fermées (3 observées au moins) est d'au moins **45 jours** ;
   - au moins **2 offres de plus** sous un intitulé déjà vu (« intitulés repris »).
   **C** = 2 signaux défavorables ou plus ; **B** = 1, ou 0 avec trop peu d'offres observées ; **A** = 0 avec au moins **6** offres
   observées dont 3 fermées. Un A ne se donne jamais sans assise.
5. **La note de l'offre ne change pas** : le dossier est affiché à côté, calculé à part, et n'alimente aucune note.
6. **Affichage** : la fiche d'une offre (`/offre/[id]`) montre le bloc, calculé sur les offres de l'enseigne (requête bornée par le
   premier mot du nom, puis filtre par enseigne) ; `preuves_ecrans` avec `employeur` rend le même dossier pour la relecture.

## Ce que la lettre ne dit pas

« C » veut dire « le suivi voit deux signaux défavorables », pas « mauvais employeur ». Une offre fermée n'est pas une offre
pourvue (elle a pu simplement disparaître de la source), d'où le refus de lire une fermeture rapide comme un signe favorable :
aucun signal favorable n'existe, seule l'ABSENCE de signal défavorable, avec assise, donne un A.

## Alternatives rejetées

- **Un score numérique** : un chiffre précis sur quelques offres se lit comme une mesure et ne se refait pas à la main.
- **Un signal favorable (fermeture rapide)** : fermée ne veut pas dire pourvue.
- **Brancher le registre et le RENA maintenant** : sans date ni statut, la ligne ne pourrait pas citer sa source (exigence de la
  tâche), et accuser un homonyme à tort est le pire résultat possible.

## Risques

- Les seuils (60 j, 45 j, 2 offres, 3 et 6 observées) sont des suppositions raisonnables, non calibrées ; la relecture de Marc sur
  5 employeurs qu'il connaît sert à les ajuster. Ils vivent à un seul endroit (constantes exportées).
- Un employeur dont la veille n'a vu que quelques offres reste « inconnu » : c'est voulu.
- Trois cartes d'une même enseigne montrent le même dossier : c'est celui de l'enseigne (ADR-0036).

## Méthode de test

Tests purs sur données fictives (`tests/dossierEmployeur.test.ts`), contrôle de `preuves_ecrans` (`tests/mcpServeur.test.ts`).
En production, après déploiement : le dossier de 5 employeurs connus de Marc est rendu par `preuves_ecrans` et relu avec lui.
