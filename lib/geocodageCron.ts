// lib/geocodageCron.ts — le débit d'une passe de géocodage automatique.
//
// PARTAGÉ entre les deux crons (`cron/veille`, `cron/geocodage`) : les deux appellent le même
// `mesurerDistances` avec le même budget, et c'est voulu — deux copies indépendantes de ces
// deux nombres pourraient diverger sans qu'aucun test ne le remarque (même risque que
// `lib/cronAuth.ts`).

import { DELAI_MAX_MS } from "./overpass";

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

/**
 * Enveloppe PROPRE à l'étape des bornes, accordée UNIQUEMENT par le cron de veille.
 *
 * ⚠️ POURQUOI ELLE EXISTE — MESURÉ LES 16 ET 17/09/2026. Deux passes consécutives à
 * `[bornes] 0/N grappe(s) interrogée(s) · 0 lieu(x) mesuré(s)`, et le reste à mesurer qui
 * MONTE (14 → 21) au lieu de descendre. Le budget restant à la FIN de la passe était
 * remarquablement stable — 7 409 ms puis 7 722 ms — donc l'amont consomme ~17,5 s des 25 s
 * de façon reproductible, et l'étape des bornes, qui est en avant-dernier, a besoin de
 * `DELAI_MAX_MS` (15 s) D'UN COUP pour seulement COMMENCER une requête. Elle ne partait
 * plus jamais.
 *
 * ⚠️ CE N'EST PAS UN ACCIDENT DE RÉGLAGE, C'ÉTAIT ÉCRIT AU-DESSUS : le commentaire de
 * `BUDGET_GEOCODAGE_CRON_MS` dit que `mesurerDistances` « enchaîne PLUSIEURS séries (situer,
 * rattraper les adresses, raffiner) sous le même budget partagé » et qu'« une série de huit
 * requêtes vaut ~40 s dans le pire cas ». Vingt-cinq secondes n'ont jamais pu couvrir les
 * séries amont ET la queue — les bornes figuraient dans la liste des étapes couvertes sans
 * qu'aucun chiffre ne leur soit réservé. La promesse était dans le commentaire, pas dans le
 * budget.
 *
 * ⚠️ POURQUOI UNE ENVELOPPE À PART PLUTÔT QU'UN BUDGET PARTAGÉ PLUS GRAND. Le commentaire
 * ci-dessus l'interdit explicitement : agrandir le budget partagé oblige à re-dériver le
 * pire cas contre les 60 s d'une fonction Vercel, et « vouloir un débit plus haut = ajouter
 * une PASSE, JAMAIS agrandir celle-ci ». Cette enveloppe ne touche donc pas au partagé : le
 * cron de VEILLE a `maxDuration = 300`, il peut offrir vingt secondes de plus sans approcher
 * son mur. Le cron de GÉOCODAGE, lui, n'a que 60 s : il ne la reçoit PAS et garde exactement
 * le comportement d'avant.
 *
 * ⚠️ POURQUOI PAS UN SIMPLE DÉPLACEMENT DE L'ÉTAPE EN TÊTE DE PASSE — c'était ma première
 * idée, et elle est FAUSSE. `bornesLe` ne se pose qu'UNE fois par lieu, et `raffinerPositions`
 * (qui tourne juste avant) fait passer les entreprises du centre-ville à leur vraie position.
 * Mesurer les bornes AVANT lui les figerait, définitivement, depuis le centre-ville — pour
 * chaque entreprise nouvellement arrivée, puisqu'une entreprise épinglée au centre est
 * justement la première candidate au raffinage. On aurait échangé une étape affamée contre
 * une donnée fausse.
 *
 * ⚠️ DÉRIVÉE DE `DELAI_MAX_MS`, PLUS ÉCRITE EN DUR. Les deux valeurs étaient deux constantes
 * indépendantes (15 s et 20 s) que seule la discipline gardait cohérentes : relever la
 * patience sans relever l'enveloppe fait passer la garde interne `reste < DELAI_MAX_MS` sous
 * son seuil, et l'étape cesse de partir — la famine EXACTE que cette enveloppe existe pour
 * corriger, réintroduite par un nombre oublié. Le lien est donc dans le code.
 *
 * La marge par-dessus la requête sert à écrire les lignes de la grappe. La garde interne ne
 * lance jamais une requête qu'elle ne peut pas finir, donc l'enveloppe est une BORNE, pas une
 * réservation dépensée d'office : une passe sans bornes à mesurer ne coûte qu'un `SELECT`.
 */
export const MARGE_ECRITURE_BORNES_MS = 5_000;

export const BUDGET_BORNES_VEILLE_MS = DELAI_MAX_MS + MARGE_ECRITURE_BORNES_MS;
