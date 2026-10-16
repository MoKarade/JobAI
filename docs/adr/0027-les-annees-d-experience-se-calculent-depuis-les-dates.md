# ADR-0027 — Les années d'expérience se calculent depuis les dates du CV

**Date** : 2026-10-16 · **Statut** : Proposé — tâche JobAI#154 (mission JobAI#147, plan « analyse du CV et dossier
employeur », étape A1). Deux règles ci-dessous (année seule lue en juillet ; tout le travail hors stages compte) sont
des choix PROVISOIRES que Marc voit dans le détail du calcul à chaque analyse.

## Contexte

Le modèle estimait « les années d'expérience pertinente » et ce nombre réglait la séniorité de toutes les offres
(`paliersSenioriteDepuisAnnees`). Un nombre estimé ne se refait pas à la main : si le résultat s'écarte du CV, rien
ne dit d'où vient l'écart, et le garde-fou n°3 (pas de chiffre inventé) ne tient que sur la foi du modèle.

## Décision

1. **Le modèle recopie, le code compte.** Le modèle ne rend plus `anneesExperience` (retiré du schéma d'outil et de
   la consigne) ; il recopie les dates de CHAQUE poste, telles qu'écrites, et marque `estStage` quand le CV le dit.
   Un nombre qu'il écrirait quand même est ignoré.
2. **Calcul** (`lib/cv/anneesExperience.ts`, pur, l'horloge en paramètre) : un poste va du mois de début au mois de
   fin, les deux INCLUS (« avril 2023 – mars 2024 » = 12 mois) ; « Présent » vaut le mois courant ; les mois couverts
   par deux postes ne comptent qu'une fois ; le total est en années à une décimale.
3. **Rien n'est deviné.** Début ou fin absent ou illisible, saison, début futur, fin avant le début : le poste est
   EXCLU et le détail dit pourquoi. Aucun poste comptable → `null` (« non établi »), jamais 0. Une fin future est
   plafonnée à aujourd'hui.
4. **Une année seule** (« 2023 ») est lue en **juillet** : l'erreur est symétrique (±6 mois) et la ligne est marquée
   « année seule ». *Provisoire.*
5. **Stages exclus, pertinence abandonnée.** Le total est celui de l'expérience professionnelle hors stages. Avant,
   le modèle jugeait ce qui était « pertinent » — une opinion invérifiable. *Provisoire :* si Marc veut n'en compter
   qu'une partie, c'est un champ de plus par poste, pas un retour à l'estimation.
6. **Le détail est la provenance.** Il est écrit dans `anneesExperienceProvenance` (jusqu'à 1 500 caractères) et
   s'affiche sous l'écart « Années d'expérience » de l'écran de revue : une ligne par poste, les chevauchements
   retirés, le total en mois et en années. Les écarts restent à valider par Marc (ADR-0009).

## Conséquences

- Le barème de séniorité (consequence) se déduit du nombre calculé, comme avant ; seule la source du nombre change.
- Les analyses déjà enregistrées gardent leur ancien nombre jusqu'à une ré-analyse du CV.
- Un CV dont les postes n'ont pas de dates lisibles ne propose plus d'années : l'écran le dit, au lieu d'afficher un
  nombre supposé.
- Aucun coût IA de plus : le même appel, un champ de moins à produire.

## Preuve attendue

Marc ré-analyse son CV et refait le calcul à la main à partir du détail affiché (les dates sont celles de son CV).
