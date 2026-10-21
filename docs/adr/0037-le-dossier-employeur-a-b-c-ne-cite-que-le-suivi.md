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

## Révision du 2026-10-21 — relecture de Marc sur 5 enseignes

Lu en production sur Tim Hortons (C), A&W (C), Harvey's (B), Canadian Tire (B) et Jean Coutu (B), deux signaux ne disaient pas ce
qu'ils prétendaient. Marc a demandé de les régler (« Corriger »).

1. **« Ouverte depuis N jours » ne compte que pour une offre dont on a VU l'apparition.** « 62 jours » était le premier jour de la
   veille (2026-08-20) : la durée d'une offre déjà là ce jour-là est tronquée (« depuis qu'on regarde »). Le dossier lit maintenant
   `plusAncienneOuverteMesurable`, la plus ancienne ouverte dont la première vue est **postérieure** au premier jour de la veille
   (tiré du journal, `debutDeLaVeille`, pas écrit en dur). Si toutes les offres ouvertes étaient déjà là, la ligne le dit et reste
   neutre. Le seuil de 60 jours est inchangé.
2. **Les « intitulés repris » ne comptent plus pour un employeur qui embauche en continu**, c'est-à-dire à partir de **10 offres
   observées** (`SEUIL_EMBAUCHE_CONTINUE`). Chez une chaîne, un intitulé repris dit le roulement des postes, pas un mauvais
   employeur ; chez un petit employeur, le même titre affiché deux fois dit encore quelque chose. La ligne reste, en constat
   neutre, avec la mention « Sans poids dans la lettre ». [Supposition : 10 est un seuil de bon sens, pas une mesure ; le repli
   honnête était de ne rien affirmer plutôt que de poser une lettre sur un signal douteux.]

Les autres seuils (45 j de médiane, 2 intitulés repris, 3 et 6 offres observées) sont inchangés, faute de remarque de Marc.

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

- Les seuils (60 j, 45 j, 2 offres, 3 et 6 observées, et depuis la révision 10 offres pour l'embauche en continu) sont des
  suppositions raisonnables, non calibrées ; la relecture de Marc sur des employeurs qu'il connaît sert à les ajuster. Ils vivent à
  un seul endroit (constantes exportées).
- Si le journal est élagué (offres retirées du suivi), le premier jour de la veille avance et un peu moins d'offres sont reconnues
  « déjà là » : l'erreur va dans le sens prudent, vers plus de signaux.
- Un employeur dont la veille n'a vu que quelques offres reste « inconnu » : c'est voulu.
- Trois cartes d'une même enseigne montrent le même dossier : c'est celui de l'enseigne (ADR-0036).

## Méthode de test

Tests purs sur données fictives (`tests/dossierEmployeur.test.ts`), contrôle de `preuves_ecrans` (`tests/mcpServeur.test.ts`).
En production, après déploiement : le dossier de 5 employeurs connus de Marc est rendu par `preuves_ecrans` et relu avec lui.
