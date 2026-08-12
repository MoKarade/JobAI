// lib/geocodageCron.ts — le débit d'une passe de géocodage automatique.
//
// PARTAGÉ entre les deux crons (`cron/veille`, `cron/geocodage`) : les deux appellent le même
// `mesurerDistances` avec le même budget, et c'est voulu — deux copies indépendantes de ces
// deux nombres pourraient diverger sans qu'aucun test ne le remarque (même risque que
// `lib/cronAuth.ts`).

/**
 * Employeurs situés par passage de cron.
 *
 * Huit — et pas plus, PARCE QUE `MAX_VILLES_PAR_PASSE` (lib/geocodage.ts) plafonne DÉJÀ une
 * série de requêtes Nominatim à 8, quelle que soit la valeur demandée ici. Une valeur plus
 * haute serait un leurre : ADR-01 (2026-07-31) l'a mesuré une première fois, en ramenant
 * cette constante de 12 à 8 pour la même raison — et le commentaire d'alors n'avait pas
 * suivi (« Douze » est resté écrit ici jusqu'au 2026-08-12, alors que la valeur réelle était
 * 8 depuis onze jours : la preuve qu'une affirmation de commentaire se vérifie, pas qu'elle
 * se lit).
 *
 * ⚠️ Vouloir un débit plus haut = ajouter une PASSE (un second cron, à une autre heure —
 * `vercel.json`), JAMAIS agrandir celle-ci. Voir `BUDGET_GEOCODAGE_CRON_MS` pour le calcul
 * qui interdit d'agrandir ce plafond sans re-dériver le pire cas sur les 60 s d'une fonction
 * Vercel.
 */
export const MAX_SITUATIONS_CRON = 8;

/**
 * Temps accordé au géocodage d'une passe de cron, toutes étapes confondues (villes,
 * adresses, raffinage, bornes).
 *
 * Le plafond en NOMBRE ne borne pas la DURÉE : une série de huit requêtes vaut ~40 s dans le
 * pire cas (chacune peut aller jusqu'à `DELAI_MAX_REQUETE_MS` = 4 s, plus l'espacement
 * `DELAI_ENTRE_REQUETES_MS` = 1,1 s), et `mesurerDistances` enchaîne PLUSIEURS séries
 * (situer, rattraper les adresses, raffiner) sous le même budget partagé — deux séries
 * pleines dépasseraient déjà les 60 s d'une fonction Vercel. Un mur atteint tue le processus
 * sans exécuter le moindre `catch` : ni trace, ni acquis enregistré. Vingt-cinq secondes
 * laissent de la marge à ce qui tourne AVANT dans le cron de veille (l'ingestion, qui est
 * l'essentiel) ; le cron de géocodage, qui ne fait QUE ça, pourrait en théorie se permettre
 * davantage, mais garder le MÊME budget évite de re-dériver ce calcul deux fois pour un gain
 * qui ne changerait rien — le plafond en nombre, ci-dessus, reste la vraie limite.
 */
export const BUDGET_GEOCODAGE_CRON_MS = 25_000;
