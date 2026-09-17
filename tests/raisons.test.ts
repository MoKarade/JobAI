// tests/raisons.test.ts — la phrase de la ville annoncée : écrite, relue, et masquée à temps.
//
// CE QUE CES TESTS PROTÈGENT
//
// La même phrase porte DEUX choses : une DONNÉE (la ville, que `villeDepuisRaisons` relit
// pour les offres entrées avant la colonne `ville`) et une AFFIRMATION (« la distance reste à
// mesurer »), qui cesse d'être vraie dès que la mesure arrive. C'est cette double nature qui a
// produit `[LIEN-04]`, vu sur une vraie fiche : `km: 81.2` affiché à côté de « la distance
// reste à mesurer ».
//
// Le remède évident — cesser d'écrire la phrase — casserait le rattrapage de ville EN
// SILENCE. D'où la forme retenue : on garde la donnée, on filtre l'affirmation, et les deux
// moitiés se testent ensemble ici.

import { describe, it, expect } from "vitest";
import {
  PREFIXE_VILLE_ANNONCEE,
  raisonsAffichables,
  texteVilleAnnoncee,
  villeDepuisRaisons,
} from "../lib/raisons";
import type { Offre } from "../lib/types";

const reserveVille = { ton: "reserve", texte: texteVilleAnnoncee("Thetford Mines") } as const;
const reserveGenerale = {
  ton: "reserve",
  texte: "Trouvée automatiquement : la note vient du seul titre…",
} as const;
const atout = { ton: "atout", texte: "Le titre porte de la coordination." } as const;

const TOUTES: Offre["raisons"] = [reserveGenerale, reserveVille, atout];

describe("raisonsAffichables — une phrase qui décrit un état se juge depuis l'état", () => {
  it("MASQUE la réserve de ville dès que la distance est mesurée", () => {
    // Le cas RÉEL de `[LIEN-04]` : 81,2 km mesurés, et la phrase qui dit le contraire.
    const vues = raisonsAffichables(TOUTES, 81.2);
    expect(vues.map((r) => r.texte)).toEqual([reserveGenerale.texte, atout.texte]);
  });

  it("la GARDE et rien d'autre tant que la distance est inconnue", () => {
    // `null` n'est pas zéro : tant que personne n'a mesuré, la réserve dit vrai et doit
    // rester. Sans ce cas, un filtre qui retirerait TOUJOURS la phrase passerait le test
    // ci-dessus en supprimant la fonctionnalité au lieu de la corriger.
    expect(raisonsAffichables(TOUTES, null)).toEqual(TOUTES);
    // ⚠️ Et `0` est une MESURE — l'employeur est à la porte. Le traiter comme « inconnu »
    // serait la faute que ce dépôt nomme « un zéro effacé par `||` ».
    expect(raisonsAffichables(TOUTES, 0).map((r) => r.texte)).toEqual([
      reserveGenerale.texte,
      atout.texte,
    ]);
  });

  it("ne touche AUCUNE autre justification, et ne réordonne rien", () => {
    // Une garde qui filtre trop large est pire que le défaut : elle fait disparaître l'aveu
    // « trouvée automatiquement, jamais lue par un humain », qui, lui, reste vrai pour
    // toujours.
    const vues = raisonsAffichables(TOUTES, 5);
    expect(vues).toHaveLength(2);
    expect(vues[0]).toEqual(reserveGenerale);
    expect(vues[1]).toEqual(atout);
  });

  it("ne MUTE pas la liste d'origine — la donnée reste en base", () => {
    // C'est toute la conception : on masque à l'écran, on ne perd pas la phrase. Si le
    // filtre mutait son entrée, le rattrapage de ville perdrait sa source au premier rendu.
    const source: Offre["raisons"] = [...TOUTES];
    raisonsAffichables(source, 42);
    expect(source).toEqual(TOUTES);
  });
});

describe("l'aller-retour ville — ce que le masquage ne doit PAS casser", () => {
  it("la phrase écrite par l'ingestion est relue telle quelle", () => {
    // Le verrou qui interdit le remède naïf (« cesse d'écrire la phrase ») : la ville n'a pas
    // d'autre porteur pour les offres entrées avant la colonne `ville`.
    expect(villeDepuisRaisons([{ ton: "reserve", texte: texteVilleAnnoncee("Lévis, QC") }])).toBe(
      "Lévis, QC",
    );
    expect(texteVilleAnnoncee("Lévis")).toContain(PREFIXE_VILLE_ANNONCEE);
  });

  it("⚠️ la ville se relit sur la donnée STOCKÉE, pas sur ce que l'écran montre", () => {
    // La distinction qui fait toute la correction : à 81,2 km l'écran ne montre plus rien,
    // et le rattrapage retrouve quand même la ville. Passer les raisons AFFICHÉES à
    // `villeDepuisRaisons` — l'erreur naturelle une fois le filtre en place — rendrait `null`.
    expect(villeDepuisRaisons(TOUTES)).toBe("Thetford Mines");
    expect(villeDepuisRaisons(raisonsAffichables(TOUTES, 81.2))).toBeNull();
  });
});
