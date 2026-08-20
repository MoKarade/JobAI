// tests/ingest-lieux.test.ts — le registre des lieux jugés PAR LA MESURE.
//
// Ce que ces tests protègent : la sortie du pari de liste blanche. Le 2026-08-17, quarante-
// sept offres ont été refusées « lieu inconnu » en une passe, sans qu'on puisse dire si
// elles étaient à vingt kilomètres ou à trois mille. La liste blanche ne connaît que les
// noms qu'on a pensé à y écrire ; la mesure, elle, répond pour tous.

import { describe, it, expect } from "vitest";
import {
  MARGE_LIEU_KM,
  PALIERS_RETENTE_LIEU_JOURS,
  aJuger,
  appliquerJugements,
  deciderLieu,
  verdictsFermes,
  type RegistreLieux,
} from "../lib/ingest/lieux";
import { lieuxAMesurer, trier, villesRefusees } from "../lib/ingest/pipeline";
import { situer } from "../lib/ingest/region";
import { PROFIL_DEFAUT } from "../lib/profil";
import type { OffreBrute } from "../lib/ingest/types";

const brute = (champs: Partial<OffreBrute> = {}): OffreBrute => ({
  refSource: "1",
  entreprise: "Exemple inc.",
  titre: "Coordonnateur de projets en automatisation",
  ville: "Québec",
  description: "Coordination d'une équipe technique, robotique et mise en service.",
  lien: "https://exemple.test/1",
  publieeLe: "2026-07-29",
  ...champs,
});

describe("deciderLieu — la ligne qui décide si une offre entre", () => {
  // Les cas se DÉRIVENT du rayon et de la marge, jamais de leur valeur du jour : un test
  // écrit « 90 km passe » mentirait au premier rajustement du profil.
  const rayon = PROFIL_DEFAUT.rayonMaxKm;

  it("accepte dans le rayon, et jusqu'à la marge", () => {
    expect(deciderLieu(0, rayon)).toBe("dans-la-region");
    expect(deciderLieu(rayon - 1, rayon)).toBe("dans-la-region");
    // La marge n'est pas un assouplissement : on mesure le CENTRE d'une municipalité, et
    // l'employeur est quelque part dedans. Certaines font quarante kilomètres de long.
    expect(deciderLieu(rayon + MARGE_LIEU_KM, rayon)).toBe("dans-la-region");
  });

  it("refuse au-delà de la marge", () => {
    expect(deciderLieu(rayon + MARGE_LIEU_KM + 0.1, rayon)).toBe("hors-region");
    // ⚠️ DÉRIVÉ DU RAYON, jamais un nombre choisi. Ce test écrivait « 250 km » comme
    // exemple de « clairement loin » — vrai tant que le rayon valait 75, faux dès qu'il est
    // passé à 300, où Montréal entre dans la région. Un cas paramétré par une constante se
    // dérive de la constante.
    expect(deciderLieu(rayon + MARGE_LIEU_KM + 100, rayon)).toBe("hors-region");
  });

  it("ne rend jamais un verdict géographique sur une distance absurde", () => {
    // Un NaN qui passerait pour « dans la région » ferait entrer n'importe quoi. « On n'a
    // pas pu juger » est le seul aveu honnête, et il déclenche une retente.
    expect(deciderLieu(Number.NaN, rayon)).toBe("introuvable");
    expect(deciderLieu(Number.POSITIVE_INFINITY, rayon)).toBe("introuvable");
    expect(deciderLieu(-3, rayon)).toBe("introuvable");
  });
});

describe("aJuger — un lieu hors circuit doit avoir un chemin de retour", () => {
  it("demande un nom jamais vu", () => {
    expect(aJuger(undefined, "2026-08-17")).toBe(true);
  });

  it("ne redemande JAMAIS un verdict ferme — une ville ne se rapproche pas", () => {
    const ferme = {
      verdict: "hors-region" as const,
      // Loin PAR RAPPORT AU RAYON, pas 250 km en dur : voir le cas ci-dessus.
      km: PROFIL_DEFAUT.rayonMaxKm + MARGE_LIEU_KM + 100,
      le: "2020-01-01",
      essais: 1,
    };
    expect(aJuger(ferme, "2026-08-17")).toBe(false);
    const proche = { verdict: "dans-la-region" as const, km: 12, le: "2020-01-01", essais: 1 };
    expect(aJuger(proche, "2026-08-17")).toBe(false);
  });

  it("retente un introuvable à des paliers qui s'espacent", () => {
    const premier = PALIERS_RETENTE_LIEU_JOURS[0]!;
    const introuvable = (essais: number) => ({
      verdict: "introuvable" as const,
      km: null,
      le: "2026-08-01",
      essais,
    });

    // Un échec unique se retente vite : une panne réseau d'une matinée ne doit pas
    // condamner une ville bien réelle.
    expect(aJuger(introuvable(1), "2026-08-01")).toBe(false);
    expect(aJuger(introuvable(1), decaler("2026-08-01", premier - 1))).toBe(false);
    expect(aJuger(introuvable(1), decaler("2026-08-01", premier))).toBe(true);

    // Après plusieurs échecs, la prémisse « c'est transitoire » s'affaiblit : on attend
    // plus longtemps. Mais on n'arrête jamais tout à fait — une porte définitivement
    // fermée est exactement ce qu'on reproche à la liste blanche.
    const dernier = PALIERS_RETENTE_LIEU_JOURS[PALIERS_RETENTE_LIEU_JOURS.length - 1]!;
    expect(aJuger(introuvable(9), decaler("2026-08-01", dernier - 1))).toBe(false);
    expect(aJuger(introuvable(9), decaler("2026-08-01", dernier))).toBe(true);
  });
});

describe("appliquerJugements — la mesure entre au registre, le reste n'y entre pas", () => {
  // Domicile fictif ; la vraie fonction reçoit une closure et ne voit jamais de point.
  const distance = (p: { lat: number; lon: number }) => Math.abs(p.lat) * 10;

  it("inscrit un verdict par nom trouvé, et compte les essais", () => {
    // ⚠️ LA LATITUDE SE DÉRIVE DU RAYON. Le stub rend `|lat| × 10` : « lat: 30 » valait
    // 300 km, choisi quand le rayon était 75. À 300 km de rayon, ce même point est DANS la
    // région et le test échouait sur sa propre fixture, pas sur la fonction.
    const loinKm = PROFIL_DEFAUT.rayonMaxKm + MARGE_LIEU_KM + 100;
    const r = appliquerJugements(
      {},
      { trouvees: [{ nom: "baie-comeau", lat: loinKm / 10, lon: -68 }], introuvables: ["remote"] },
      distance,
      PROFIL_DEFAUT.rayonMaxKm,
      "2026-08-17",
    );

    expect(r["baie-comeau"]).toEqual({
      verdict: "hors-region",
      km: loinKm,
      le: "2026-08-17",
      essais: 1,
    });
    expect(r["remote"]).toEqual({
      verdict: "introuvable",
      km: null,
      le: "2026-08-17",
      essais: 1,
    });
  });

  it("n'écrit AUCUN km quand le verdict n'a pas pu être mesuré", () => {
    // Un `km` fantaisiste posé à côté d'un « introuvable » serait pire que rien : il
    // aurait l'air d'une mesure.
    const r = appliquerJugements(
      {},
      { trouvees: [{ nom: "nulle-part", lat: Number.NaN, lon: 0 }], introuvables: [] },
      distance,
      PROFIL_DEFAUT.rayonMaxKm,
      "2026-08-17",
    );
    expect(r["nulle-part"]?.verdict).toBe("introuvable");
    expect(r["nulle-part"]?.km).toBeNull();
  });

  it("ne touche PAS aux noms qu'une passe coupée n'a pas traités", () => {
    // Le budget s'épuise, la panne survient : ce qui n'est ni trouvé ni déclaré
    // introuvable reste intact, et la passe suivante le reprend. Enregistrer un verdict
    // qu'on n'a pas mesuré serait exactement le pari qu'on retire.
    const avant: RegistreLieux = {
      amos: { verdict: "introuvable", km: null, le: "2026-08-01", essais: 2 },
    };
    const r = appliquerJugements(
      avant,
      { trouvees: [], introuvables: [] },
      distance,
      PROFIL_DEFAUT.rayonMaxKm,
      "2026-08-17",
    );
    expect(r).toEqual(avant);
  });

  it("accumule les essais d'un nom déjà tenté", () => {
    const avant: RegistreLieux = {
      amos: { verdict: "introuvable", km: null, le: "2026-08-01", essais: 2 },
    };
    const r = appliquerJugements(
      avant,
      { trouvees: [], introuvables: ["amos"] },
      distance,
      PROFIL_DEFAUT.rayonMaxKm,
      "2026-08-17",
    );
    expect(r["amos"]?.essais).toBe(3);
    expect(r["amos"]?.le).toBe("2026-08-17");
  });
});

describe("verdictsFermes — « on n'a pas pu juger » n'est pas « ce n'est pas dans la région »", () => {
  it("écarte les introuvables", () => {
    const m = verdictsFermes({
      levis: { verdict: "dans-la-region", km: 8, le: "2026-08-17", essais: 1 },
      toronto: { verdict: "hors-region", km: 700, le: "2026-08-17", essais: 1 },
      remote: { verdict: "introuvable", km: null, le: "2026-08-17", essais: 1 },
    });
    expect(m.get("levis")).toBe("dans-la-region");
    expect(m.get("toronto")).toBe("hors-region");
    // S'il entrait, `situer` le prendrait pour un verdict et cesserait de le retenter.
    expect(m.has("remote")).toBe(false);
  });
});

describe("situer consulte la mesure — et c'est ce qui sauve les 47", () => {
  it("une ville absente de la liste blanche entre quand la mesure la dit proche", () => {
    // LE TEST DISCRIMINANT : sans le registre, ce nom est refusé. Avec lui, il entre.
    expect(situer("Sainte-Hénédine")).toBe("lieu-inconnu");
    expect(
      situer("Sainte-Hénédine", "", new Map([["sainte-henedine", "dans-la-region"]])),
    ).toBe("dans-la-region");
  });

  it("et une ville lointaine sort, sans qu'aucune liste ne la nomme", () => {
    expect(situer("Amos")).toBe("lieu-inconnu");
    expect(situer("Amos", "", new Map([["amos", "hors-region"]]))).toBe("hors-region");
  });

  it("la liste blanche garde la priorité : un nom connu ne coûte aucune mesure", () => {
    // Le registre est consulté APRÈS les deux listes. Sans cet ordre, un verdict mesuré
    // erroné pourrait faire entrer une offre montréalaise.
    expect(situer("Montréal", "", new Map([["montreal", "dans-la-region"]]))).toBe(
      "hors-region",
    );
  });

  it("la correspondance est STRICTE, jamais par sous-chaîne", () => {
    // Les listes comparent par `includes` ; le registre, non. « saint-georges » ne doit
    // pas emporter « saint-georges-de-champlain », qui est à 200 km.
    expect(
      situer("Saint-Georges-de-Champlain", "", new Map([["saint-georges", "dans-la-region"]])),
    ).toBe("lieu-inconnu");
  });
});

describe("lieuxAMesurer — la liste de travail du géocodeur", () => {
  it("ne retient que ce que ni la liste blanche ni le registre ne savent trancher", () => {
    const lot = [
      brute({ ville: "Québec" }), // liste blanche
      brute({ ville: "Toronto" }), // liste blanche (hors portée)
      brute({ ville: "Amos" }), // déjà jugé
      brute({ ville: "Sainte-Hénédine" }), // inconnu : à mesurer
    ];
    const registre: RegistreLieux = {
      amos: { verdict: "hors-region", km: 500, le: "2026-08-01", essais: 1 },
    };
    expect(lieuxAMesurer(lot, registre, "2026-08-17")).toEqual(["sainte-henedine"]);
  });

  it("trie par fréquence : le budget sert d'abord au nom qui débloque le plus d'offres", () => {
    const lot = [
      brute({ entreprise: "A", ville: "Sainte-Hénédine" }),
      brute({ entreprise: "B", ville: "Adstock" }),
      brute({ entreprise: "C", ville: "Sainte-Hénédine" }),
      brute({ entreprise: "D", ville: "Sainte-Hénédine" }),
    ];
    expect(lieuxAMesurer(lot, {}, "2026-08-17")).toEqual(["sainte-henedine", "adstock"]);
  });

  it("ignore une ville vide : il n'y a rien à demander au géocodeur", () => {
    expect(lieuxAMesurer([brute({ ville: "" })], {}, "2026-08-17")).toEqual([]);
  });

  it("laisse un introuvable tranquille jusqu'à son palier", () => {
    const lot = [brute({ ville: "Adstock" })];
    const registre: RegistreLieux = {
      adstock: { verdict: "introuvable", km: null, le: "2026-08-17", essais: 1 },
    };
    expect(lieuxAMesurer(lot, registre, "2026-08-17")).toEqual([]);
    expect(
      lieuxAMesurer(lot, registre, decaler("2026-08-17", PALIERS_RETENTE_LIEU_JOURS[0]!)),
    ).toEqual(["adstock"]);
  });
});

describe("bout en bout : le tri suit la mesure", () => {
  it("une offre d'une ville mesurée proche entre, et n'est plus comptée « lieu inconnu »", () => {
    const lot = [brute({ ville: "Sainte-Hénédine" })];

    const sans = trier(lot, new Set(), "2026-08-17");
    expect(sans.retenues).toHaveLength(0);
    expect(sans.lieuInconnu).toBe(1);
    // Et le refus est NOMMÉ — c'est ce qui permet de constater le changement.
    expect(villesRefusees(sans.refusees, "lieu-inconnu")).toEqual([
      { ville: "sainte-henedine", n: 1 },
    ]);

    const avec = trier(
      lot,
      new Set(),
      "2026-08-17",
      new Map([["sainte-henedine", "dans-la-region"]]),
    );
    expect(avec.retenues).toHaveLength(1);
    expect(avec.lieuInconnu).toBe(0);
    // La ville est CONSERVÉE : sans elle l'employeur n'est pas géocodable, donc l'offre
    // resterait sans distance et hors de la carte — le manque même qu'on corrige.
    expect(avec.retenues[0]?.ville).toBe("Sainte-Hénédine");
  });

  it("une ville mesurée lointaine passe de « lieu inconnu » à « hors région »", () => {
    // Le compte change de colonne, et c'est le but : « on ne sait pas » devient « on sait,
    // et c'est trop loin ». Le premier appelle un correctif, le second non.
    const lot = [brute({ ville: "Amos" })];
    const avec = trier(lot, new Set(), "2026-08-17", new Map([["amos", "hors-region"]]));
    expect(avec.horsRegion).toBe(1);
    expect(avec.lieuInconnu).toBe(0);
  });
});

/** Ajoute `n` jours à une date AAAA-MM-JJ. */
function decaler(jour: string, n: number): string {
  const t = Date.parse(`${jour}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
