# ADR-0029 — Les signaux d'un employeur viennent du suivi, rien d'autre

**Date** : 2026-10-16 · **Statut** : Proposé — tâche JobAI#159 (mission JobAI#147, plan « analyse du CV et dossier
employeur », étape B1). Aucun coût IA, aucune nouvelle source.

## Contexte

Rien n'indiquait, sur la carte d'une entreprise, qu'elle republie les mêmes postes ou garde des offres ouvertes depuis
des mois. Le suivi le sait pourtant : chaque offre porte `perimeeLe`, et le journal de veille garde son jour de première
et de dernière vue.

## Décision

`lib/signauxEmployeur.ts` (pur) calcule, par employeur (même clé de regroupement que la liste, `cleGroupement`), sur
TOUTES les offres suivies hors historique 2025 — jamais sur ce qu'un filtre laisse voir :

- le nombre d'offres réputées ouvertes et fermées ;
- la plus ancienne offre ouverte : jours entre sa première et sa dernière vue, et son jour de première vue ;
- la durée médiane des offres fermées, à partir de 3 fermées observées ; en dessous, pas de médiane ;
- les intitulés repris : même employeur, même titre (accents, casse, ponctuation écartés), au plus 3 montrés.

Ils s'affichent en tête du détail de la carte entreprise (`components/SignauxEmployeur.tsx`).

## Règles de lecture (reprises de `lib/dureeVie.ts`, ADR sur la durée de vie)

1. Une durée est celle que NOTRE balayage a vue : « depuis au moins N jours », jamais « depuis N jours ».
2. Une offre sans ligne de journal n'a pas de durée : elle compte parmi les ouvertes, jamais dans une durée.
3. Une médiane se tient à un effectif : 3 fermées observées au minimum, sinon l'écran dit combien il y en a.
4. Un « intitulé repris » n'est pas une preuve de republication : un employeur peut ouvrir deux postes distincts sous
   le même titre. L'écran écrit « intitulé repris », jamais « republie en boucle ».

## Alternatives rejetées

- **Kaplan-Meier par employeur** : exact pour une courbe de marché (`lib/dureeVie.ts`, 8 offres minimum), mais sur
  quelques offres par employeur il donne un chiffre qui se lit comme une mesure et ne se refait pas à la main.
- **Moyenne des durées** : un employeur qui garde une annonce six mois la tire à lui seul.
- **Détecter la republication par proximité d'intitulés** : une heuristique floue décide de ce qu'on affirme sur un
  employeur ; l'égalité après normalisation ne se trompe que dans un sens, par défaut.

## Conséquences

- Aucune colonne, aucune migration, aucune route ; le calcul se refait à chaque affichage de l'accueil.
- Le chiffre le plus sensible (les intitulés repris) est un constat sur nos données, pas sur l'employeur.

## Preuve attendue

Trois employeurs vérifiés à la main : les ouvertes, la plus ancienne ouverte et les intitulés repris refaits depuis la
fiche de chaque offre et le journal.
