// tests/ingest-region.test.ts — le filtre qui manquait.
//
// Écrit APRÈS un échec mesuré, pas par précaution : la première sonde des vraies sources
// (2026-07-31) a fait entrer « Superviseur de l'entretien ménager — campement minier
// fly-in/fly-out » à 68/100, vraisemblablement au Manitoba. Le critère numéro un de Marc —
// 50 km — n'existait nulle part dans le pipeline d'ingestion.
//
// Le premier test est donc ce cas exact. Les autres couvrent le piège qui l'accompagne :
// « Québec » est aussi le nom de la province, et il apparaît dans « Montréal, Québec ».

import { describe, it, expect } from "vitest";
import {
  BANDES_HORS_REGION,
  bandeHorsRegion,
  estDansLaRegion,
  normaliserLieu,
  situer,
} from "../lib/ingest/region";
import { trier } from "../lib/ingest/pipeline";
import type { OffreBrute } from "../lib/ingest/types";

describe("le cas qui a révélé le trou", () => {
  it("REFUSE le campement minier fly-in/fly-out", () => {
    expect(situer("Northern Manitoba")).toBe("hors-region");
    expect(estDansLaRegion("Manitoba, Canada")).toBe(false);
  });

  it("le refuse aussi à travers tout le pipeline, malgré une note élevée", () => {
    // La note n'est pas en cause : le poste notait 68 sur 100. Seul le lieu le disqualifie,
    // et il doit le faire AVANT que la note n'ait son mot à dire.
    const brute: OffreBrute = {
      refSource: "1",
      titre: "Superviseur de l'entretien ménager - Campement minier (Fly-in/fly-out)",
      entreprise: "Dexterra",
      ville: "Northern Manitoba",
      lien: "https://exemple.test/1",
      description: "Supervision d'une équipe en camp éloigné.",
      publieeLe: "2026-07-30",
    };
    const r = trier([brute], new Set(), "2026-07-31");
    expect(r.retenues).toEqual([]);
    expect(r.horsRegion).toBe(1);
    expect(r.souslePlancher).toBe(0); // écartée par le LIEU, pas par la note
  });
});

describe("le piège du mot « Québec »", () => {
  it("« Montréal, Québec » est REFUSÉ — la province n'est pas la ville", () => {
    // Sans priorité au rejet, toute offre montréalaise entrerait : « quebec » est bien
    // présent dans la chaîne.
    expect(situer("Montréal, Québec")).toBe("hors-region");
  });

  it("« Québec, QC » est accepté", () => {
    expect(situer("Québec, QC")).toBe("dans-la-region");
  });

  it("« Gatineau, Québec » est refusé", () => {
    expect(situer("Gatineau, Québec")).toBe("hors-region");
  });
});

describe("les villes de la région", () => {
  const proches = [
    "Lévis, QC",
    "Sainte-Foy",
    "Saint-Augustin-de-Desmaures, QC",
    "Château-Richer, QC",
    "Saint-Lambert-de-Lauzon, QC",
    "Laurier-Station, QC",
    "Saint-Anselme, QC",
    "Courcelette, QC",
    "Sainte-Claire, QC",
    "L'Ancienne-Lorette",
  ];
  for (const ville of proches) {
    it(`accepte « ${ville} »`, () => {
      expect(situer(ville)).toBe("dans-la-region");
    });
  }

  it("accepte les villes écrites sans accent", () => {
    // Les sources écrivent les deux formes, parfois dans la même réponse.
    expect(situer("Levis, QC")).toBe("dans-la-region");
    expect(situer("Quebec City, QC")).toBe("dans-la-region");
  });
});

describe("ce qui n'est pas tranchable", () => {
  it("un lieu vide est « inconnu », pas « hors région »", () => {
    // Deux situations différentes : si ce compte explose, c'est qu'une source a cessé
    // d'indiquer les villes — rien à voir avec un marché qui s'éloigne.
    expect(situer("")).toBe("lieu-inconnu");
    expect(situer("   ")).toBe("lieu-inconnu");
  });

  it("un lieu inconnu N'ENTRE PAS : une ingestion automatique ne parie pas", () => {
    expect(estDansLaRegion("Saint-Machin-des-Bois")).toBe(false);
  });

  it("le pipeline compte séparément « hors région » et « lieu inconnu »", () => {
    const base = {
      refSource: "1",
      titre: "Coordonnateur de projets en automatisation",
      entreprise: "X",
      lien: "https://exemple.test/1",
      description: "Coordination technique.",
      publieeLe: null,
    };
    const r = trier(
      [
        { ...base, id: "a", ville: "Toronto, ON" } as OffreBrute,
        { ...base, entreprise: "Y", ville: "" } as OffreBrute,
      ],
      new Set(),
      "2026-07-31",
    );
    expect(r.horsRegion).toBe(1);
    expect(r.lieuInconnu).toBe(1);
    expect(r.retenues).toEqual([]);
  });

  it("la description sert de recours quand le champ ville est vague", () => {
    // Un ATS met parfois « Canada » en ville et la vraie ville dans le texte. On s'en sert
    // pour ACCEPTER, jamais pour rejeter.
    expect(situer("Canada", "Poste basé à notre usine de Lévis.")).toBe("dans-la-region");
    expect(situer("Canada", "Poste basé à Calgary.")).toBe("lieu-inconnu");
  });
});

describe("normalisation", () => {
  it("retire accents et ponctuation", () => {
    expect(normaliserLieu("Québec, QC")).toBe("quebec qc");
    expect(normaliserLieu("Saint-Augustin-de-Desmaures (QC)")).toBe("saint-augustin-de-desmaures qc");
  });
});

describe("« Quebec Province » n'est pas la ville de Québec (VEILLE-33)", () => {
  // ⚠️ TROUVÉ SUR UNE OFFRE RÉELLE le 2026-08-18 : une annonce disant « situé au Saguenay »
  // portait « Quebec Province » en champ ville, et l'acceptation par sous-chaîne l'a fait
  // entrer « dans la région ». Une frontière de MOT n'y changerait rien — « quebec » est un
  // mot entier des deux côtés. Ce qui distingue la ville de la province est le QUALIFICATIF.

  it("⚠️ le cas mesuré : la province n'entre pas", () => {
    expect(situer("Quebec Province")).toBe("lieu-inconnu");
  });

  it("⚠️ et le verdict est « inconnu », jamais « hors région » — on ne sait pas où c'est", () => {
    // Ce fichier refuse de parier DANS LES DEUX SENS : dire « hors région » affirmerait que
    // l'offre est loin, ce que rien ne prouve. `lieu-inconnu` la laisse au registre mesuré.
    expect(situer("Province de Québec")).toBe("lieu-inconnu");
  });

  it("la même règle vaut sur le repli par la DESCRIPTION, pas seulement sur le champ ville", () => {
    // Deux sites d'acceptation, une seule règle : sans ça, la porte se rouvre par le repli.
    expect(situer("Remote", "Poste basé en Quebec Province, déplacements fréquents")).toBe(
      "lieu-inconnu",
    );
  });

  it("non-régression : les vraies villes, suffixes de source compris, entrent toujours", () => {
    // C'est ce que la comparaison par sous-chaîne sert à attraper, et il ne faut pas le casser.
    for (const v of ["Québec", "Quebec City, QC", "Lévis, QC", "Saint-Augustin-de-Desmaures"]) {
      expect(situer(v), v).toBe("dans-la-region");
    }
  });

  it("non-régression : le rejet passe toujours AVANT l'acceptation", () => {
    // « Montréal, Québec » contient « quebec » : sans la priorité au rejet, toute offre
    // montréalaise entrerait. C'est écrit dans `situer`, et ça doit le rester.
    expect(situer("Montréal, Québec")).toBe("hors-region");
  });
});

describe("la bande postale — le dernier recours, quand aucun nom ne sait placer (ADR-0018)", () => {
  it("rejette un lieu inconnu dont la bande est mesurée jamais régionale", () => {
    // Sans le code, l'offre reste « lieu inconnu » et consomme une des 40 places de mesure.
    expect(situer("Saint-Machin-des-Bois")).toBe("lieu-inconnu");
    expect(situer("Saint-Machin-des-Bois", "", new Map(), "H3B 1A1")).toBe("hors-region");
  });

  it("ne touche PAS une offre qu'un NOM a su placer — c'est ce qui rend son coût nul", () => {
    // ⚠️ LE CŒUR DE L'ADR, mesuré : 44 offres régionales portent un code hors bande (siège
    // social de l'employeur). Elles sont acceptées par leur nom AVANT que la bande ne soit
    // lue. Poser la bande plus haut les perdrait toutes — c'est l'alternative rejetée.
    expect(situer("Lévis", "", new Map(), "H3B 1A1")).toBe("dans-la-region");
    // Et une mesure du registre gagne aussi : elle porte sur CE nom, la bande sur une classe.
    const mesure = new Map<string, "dans-la-region" | "hors-region">([["val-machin", "dans-la-region"]]);
    expect(situer("Val-Machin", "", mesure, "H3B 1A1")).toBe("dans-la-region");
    // Le repli sur la description aussi : il accepte sur un nom, la bande n'a plus à trancher.
    expect(situer("Poste à distance", "Usine située à Beaupré", new Map(), "H3B 1A1")).toBe(
      "dans-la-region",
    );
  });

  it("ÉCHOUE OUVERT : un code absent, vide ou illisible ne rejette rien", () => {
    // Un code qu'on ne sait pas lire n'autorise à affirmer rien du tout, et le défaut prudent
    // d'une règle qui REJETTE est de ne pas rejeter.
    expect(bandeHorsRegion("")).toBe(false);
    expect(bandeHorsRegion("   ")).toBe(false);
    expect(bandeHorsRegion("3B1 H1A")).toBe(false);
    expect(situer("Saint-Machin-des-Bois", "", new Map(), "")).toBe("lieu-inconnu");
    expect(situer("Saint-Machin-des-Bois", "", new Map(), "3B1")).toBe("lieu-inconnu");
  });

  it("lit la bande quel que soit la casse et les espaces du code", () => {
    expect(bandeHorsRegion("h3b1a1")).toBe(true);
    expect(bandeHorsRegion("  H3B 1A1 ")).toBe(true);
  });

  it("RATCHET — ni `G` ni `J` ne sont rejetées, et les chiffres disent pourquoi", () => {
    // ⚠️ CETTE ASSERTION EST FAITE POUR ROUGIR. Mesuré le 2026-09-17 sur une passe complète :
    //   · `G` porte 1 401 des 1 445 offres régionales — c'est la bande de la région (78,2 %
    //     de ses décidables sont dedans). La rejeter viderait la veille.
    //   · `J` est à 4,6 % (43 régionales sur 927 décidables). La rejeter gagnerait 1 784
    //     offres par passe et parierait contre une sur vingt-deux — un faux rejet coûte une
    //     offre que Marc ne verra jamais, et dont rien ne signalera l'absence.
    // Ajouter l'une des deux doit forcer à relire la mesure, pas à re-baser ce test.
    expect(BANDES_HORS_REGION).not.toContain("G");
    expect(BANDES_HORS_REGION).not.toContain("J");
    // Anti-vacuité : une liste vide satisferait les deux lignes ci-dessus sans rien protéger.
    expect(BANDES_HORS_REGION.length).toBeGreaterThan(0);
  });
});
