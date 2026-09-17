// lib/raisons.ts — la phrase qui porte la ville annoncée : qui l'écrit, qui la relit,
// et quand l'écran a encore le droit de l'afficher.
//
// POURQUOI CE MODULE EXISTE, ET POURQUOI IL EST UNE FEUILLE
// Ces trois fonctions travaillent sur la MÊME phrase, et elles vivaient dans
// `lib/ingest/pipeline.ts` — un module d'ingestion, qui parle à la base. Or la règle
// d'affichage est consommée par `CarteOffre` (composant CLIENT), la fiche d'offre et la vue
// MCP : l'y laisser aurait tiré tout l'ingest dans le bundle du navigateur. Un module sans
// dépendance, à côté de `scoring` et `couleurNote`, que le client peut importer sans rien
// traîner.
//
// ⚠️ ET SURTOUT : L'ÉCRITURE, LA RELECTURE ET L'AFFICHAGE DE LA MÊME PHRASE SE TIENNENT.
// Le préfixe est écrit par l'ingestion, relu par le rattrapage de ville, et masqué par
// l'écran quand il cesse d'être vrai. Trois endroits qui doivent coïncider : séparés, ils
// divergent en silence, et la divergence ne lève aucune erreur — elle affiche simplement
// quelque chose de faux, ou cesse de retrouver une ville.

import type { Offre } from "./types";

/**
 * Le début de la justification qui porte la ville annoncée.
 *
 * Exporté pour que `texteVilleAnnoncee` l'ÉCRIVE et que `villeDepuisRaisons` la RELISE
 * depuis la même constante : deux littéraux qui doivent coïncider finissent toujours par
 * diverger, et ici la divergence serait muette (plus aucune ville relue, sans erreur).
 * Un test prouve l'aller-retour.
 */
export const PREFIXE_VILLE_ANNONCEE = "Annoncée à ";

/** La longueur qu'`OffreSchema` accepte pour `ville` — la relecture s'y tient. */
const LONGUEUR_MAX_VILLE = 120;

/**
 * La phrase telle que l'ingestion l'écrit. PURE.
 *
 * Un seul exemplaire : elle est à la fois une DONNÉE (la ville, relue plus tard) et une
 * AFFIRMATION (« la distance reste à mesurer »), et c'est cette double nature qui a produit
 * `[LIEN-04]` — voir `raisonsAffichables`.
 */
export function texteVilleAnnoncee(ville: string): string {
  return `${PREFIXE_VILLE_ANNONCEE}${ville.trim()} — la distance reste à mesurer, elle n'est pas déduite du nom de la ville.`;
}

/**
 * La ville qu'une offre déjà suivie porte dans ses justifications.
 *
 * POURQUOI CETTE FONCTION EXISTE
 * Les 40 premières offres déposées sont entrées AVANT que la colonne `ville` soit écrite :
 * elles l'ont donc vide, et sans ville leur employeur n'est pas géocodable — pas de
 * position, pas de distance, pas d'épingle sur la carte. Mais l'information n'est pas
 * perdue : au moment du tri, on a écrit « Annoncée à Lévis — … » dans leurs justifications.
 *
 * ⚠️ CE N'EST PAS UNE DÉDUCTION. La ville n'est pas devinée depuis le nom de l'employeur ni
 * depuis le texte de l'annonce : elle est RELUE là où notre propre code l'avait recopiée
 * telle que la source l'annonçait. C'est la même donnée, à un autre endroit — pas une
 * reconstitution, et donc pas une entorse au garde-fou n°3.
 *
 * Rend `null` quand aucune justification ne porte de ville : mieux vaut une offre qui reste
 * insituable et le DIT qu'une ville approximative écrite en base.
 */
export function villeDepuisRaisons(raisons: readonly Offre["raisons"][number][]): string | null {
  for (const r of raisons) {
    if (!r.texte.startsWith(PREFIXE_VILLE_ANNONCEE)) continue;
    // Le tiret cadratin sépare la ville du reste de la phrase. Un tiret ASCII ne
    // conviendrait pas : c'est « — » que le code écrit.
    const reste = r.texte.slice(PREFIXE_VILLE_ANNONCEE.length);
    const fin = reste.indexOf(" — ");
    // BORNÉE à la longueur que le schéma accepte pour `ville`. Sans tiret cadratin, tout
    // le reste de la phrase serait pris pour un nom de lieu — et ce texte part ensuite
    // vers Nominatim. Ni la création d'offre ni le rattrapage ne repassent par
    // `OffreSchema`, donc la borne doit être ici.
    const ville = (fin === -1 ? reste : reste.slice(0, fin)).trim().slice(0, LONGUEUR_MAX_VILLE);
    if (ville !== "") return ville;
  }
  return null;
}

/**
 * Les justifications que l'écran a encore le droit de MONTRER. PURE.
 *
 * ⚠️ `[LIEN-04]` — VU SUR UNE VRAIE FICHE, celle que Marc a nommée le 2026-09-17
 * (`groupe-dsd-inc-…`) : elle affichait `km: 81.2` ET « Annoncée à Thetford Mines — la
 * distance reste à mesurer ». Les deux ensemble, et la seconde fausse depuis que la
 * première existe. La phrase est écrite UNE fois, à l'ingestion, quand `km` est encore nul ;
 * rien ne la retirait quand la mesure arrivait. Même famille que `[LIEN-03]` : un champ figé
 * à la première écriture, qui continue d'affirmer au présent.
 *
 * ⚠️ POURQUOI ON FILTRE À L'AFFICHAGE PLUTÔT QUE DE CESSER D'ÉCRIRE. C'était le remède que
 * le ticket recommandait, et il est PIÉGÉ : `villeDepuisRaisons` relit cette phrase pour
 * rattraper la ville des offres entrées avant la colonne `ville`. Ne plus l'écrire — ou la
 * réécrire sans sa ville — casserait ce rattrapage en silence, sans qu'aucun test d'écran ne
 * bronche. La phrase reste donc une DONNÉE en base ; ce qui est corrigé, c'est l'AFFIRMATION
 * qu'on en tire à l'écran.
 *
 * ⚠️ ET LE FILTRE VIT ICI, PAS DANS LES COMPOSANTS. Trois surfaces la montrent — la carte, la
 * fiche, et la vue MCP (donc une conversation). Trois copies de la même condition auraient
 * divergé, et c'est la vue MCP qu'on aurait oubliée : elle ne se regarde pas.
 *
 * @param km La distance MESURÉE, ou `null` quand elle ne l'est pas encore. C'est l'état
 *           depuis lequel la phrase se juge — jamais une seconde lecture des raisons.
 */
export function raisonsAffichables(
  raisons: readonly Offre["raisons"][number][],
  km: number | null,
): Offre["raisons"] {
  if (km === null) return [...raisons];
  return raisons.filter((r) => !r.texte.startsWith(PREFIXE_VILLE_ANNONCEE));
}
