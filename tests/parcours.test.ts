// tests/parcours.test.ts — le parcours extrait du CV, de bout en bout.
//
// ⚠️ AUCUN EMPLOYEUR RÉEL DANS CE FICHIER. Le dépôt est public et `piiGuard` scanne les
// fichiers versionnés sans distinguer une illustration d'une vraie donnée. Les fixtures
// portent des noms manifestement fictifs.

import { describe, it, expect } from "vitest";
import { ReponseExtractionSchema, PLAFONDS } from "@/lib/cv/extraction";
import { calculerEcarts, appliquerEcarts } from "@/lib/cv/proposition";
import { PROFIL_DEFAUT } from "@/lib/profil";

const poste = (titre: string, employeur = "Fabrique Imaginaire") => ({
  titre,
  employeur,
  debut: "Avril 2023",
  fin: "Présent",
  faits: ["Coordination d’une équipe", "Suivi du budget"],
});

const extraction = (parcours: unknown[]) =>
  ReponseExtractionSchema.parse({ anneesExperience: null, parcours });

describe("le schéma du parcours — tolérant sur les manques, jamais inventif", () => {
  it("accepte un poste réduit à son intitulé", () => {
    // Un CV peut décrire une mission sans nommer le client ni dater : ça ne doit pas faire
    // échouer l'extraction entière.
    const r = extraction([{ titre: "Chargé de projet" }]);
    expect(r.parcours[0]!.employeur).toBe("");
    expect(r.parcours[0]!.debut).toBe("");
    expect(r.parcours[0]!.faits).toEqual([]);
  });

  it("garde les dates TELLES QU’ÉCRITES — jamais converties", () => {
    // Les convertir obligerait à deviner un jour, donc à fabriquer une précision que le
    // document ne porte pas.
    const r = extraction([{ titre: "Responsable technique", debut: "2023", fin: "Présent" }]);
    expect(r.parcours[0]!.debut).toBe("2023");
    expect(r.parcours[0]!.fin).toBe("Présent");
  });

  it("un parcours absent vaut liste vide, pas un échec", () => {
    const r = ReponseExtractionSchema.parse({ anneesExperience: null });
    expect(r.parcours).toEqual([]);
  });

  it("borne le nombre de postes et de faits par poste", () => {
    const trop = Array.from({ length: PLAFONDS.parcours + 5 }, (_, i) => poste(`Poste ${i}`));
    expect(() => extraction(trop)).toThrow();
  });
});

describe("l’écart de parcours — il se voit, et il ne crie pas pour rien", () => {
  it("propose un parcours quand le profil n’en a aucun", () => {
    const e = calculerEcarts(PROFIL_DEFAUT, extraction([poste("Chargé de projet")]));
    const p = e.find((x) => x.cle === "faits.parcours");
    expect(p).toBeDefined();
    expect(p!.avant).toBe("non établi");
  });

  it("⚠️ ne signale RIEN quand seules les phrases changent", () => {
    // Deux analyses du même CV reformulent volontiers un fait sans que le POSTE ait changé.
    // Un diff sur l'objet entier afficherait un écart à chaque passage, et Marc finirait
    // par cocher sans lire — la validation en apparence, l'acceptation aveugle en pratique.
    const initial = calculerEcarts(PROFIL_DEFAUT, extraction([poste("Chargé de projet")]));
    const profil = appliquerEcarts(
      PROFIL_DEFAUT,
      initial,
      initial.map((x) => x.cle),
      "2026-08-20",
    );
    const reformule = extraction([
      { ...poste("Chargé de projet"), faits: ["Encadrement de l’équipe", "Gestion du budget"] },
    ]);
    expect(calculerEcarts(profil, reformule).some((x) => x.cle === "faits.parcours")).toBe(false);
  });

  it("signale quand un POSTE change vraiment", () => {
    const initial = calculerEcarts(PROFIL_DEFAUT, extraction([poste("Chargé de projet")]));
    const profil = appliquerEcarts(
      PROFIL_DEFAUT,
      initial,
      initial.map((x) => x.cle),
      "2026-08-20",
    );
    const nouveau = extraction([poste("Superviseur de production"), poste("Chargé de projet")]);
    expect(calculerEcarts(profil, nouveau).some((x) => x.cle === "faits.parcours")).toBe(true);
  });

  it("un parcours vide proposé n’efface pas celui du profil", () => {
    // Le modèle qui n'a rien trouvé ne prouve pas que Marc n'a rien.
    const initial = calculerEcarts(PROFIL_DEFAUT, extraction([poste("Chargé de projet")]));
    const profil = appliquerEcarts(
      PROFIL_DEFAUT,
      initial,
      initial.map((x) => x.cle),
      "2026-08-20",
    );
    expect(calculerEcarts(profil, extraction([])).some((x) => x.cle === "faits.parcours")).toBe(
      false,
    );
  });
});
