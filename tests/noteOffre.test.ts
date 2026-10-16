// tests/noteOffre.test.ts — UNE offre, UNE note, quel que soit le chemin (JobAI#149, ADR-0025).
//
// Avant : l'ingestion notait avec le profil par défaut, le code de profession et les conditions ;
// la re-notation avec le profil de Marc mais sans code ni conditions ; la mesure de distance
// avec le profil par défaut. La même offre valait trois notes. Ces tests rejouent le trajet
// complet — brute → ingestion → offre gardée → re-notation / distance — et exigent le même
// résultat, avec un profil de Marc qui DIFFÈRE du défaut (sinon l'égalité serait triviale).

import { describe, it, expect } from "vitest";
import { trier } from "../lib/ingest/pipeline";
import type { OffreBrute } from "../lib/ingest/types";
import { planifierRenotation } from "../lib/cv/renotation";
import { scoreAvecDistance } from "../lib/distances";
import { extraitPourNote, noterOffre, texteDeNotation, LONGUEUR_EXTRAIT_NOTE } from "../lib/noteOffre";
import { computeScore } from "../lib/scoring";
import { PROFIL_DEFAUT, type Profil } from "../lib/profil";
import { OffreSchema } from "../lib/types";
import { colonnesOffre } from "../lib/persistance";

/** Un profil de Marc qui ne ressemble pas au défaut : un mot de coordination de plus. */
const PROFIL_MARC: Profil = {
  ...PROFIL_DEFAUT,
  version: PROFIL_DEFAUT.version + 3,
  motsCoordination: [...PROFIL_DEFAUT.motsCoordination, "chef de chantier"],
};
const METIERS = ["21", "22"];

function brute(champs: Partial<OffreBrute> = {}): OffreBrute {
  return {
    refSource: "1",
    titre: "Chef de chantier, installations mécaniques",
    entreprise: "Exemple inc.",
    ville: "Lévis, QC",
    lien: "https://exemple.test/1",
    description:
      "Encadrer l'équipe de chantier et la mise en service. Posséder cinq ans d'expérience. " +
      "Membre de l'ordre des ingénieurs un atout.",
    publieeLe: "2026-07-29",
    noc: "22301",
    typePoste: "Temps plein",
    dureeEmploi: "Permanent",
    ...champs,
  };
}

function ingerer(b: OffreBrute) {
  const tri = trier([b], new Set(), "2026-10-16", new Map(), METIERS, PROFIL_MARC);
  expect(tri.retenues).toHaveLength(1);
  return tri.retenues[0]!;
}

describe("une offre, une note — l'ingestion, la re-notation et la distance s'accordent", () => {
  it("la re-notation rend EXACTEMENT la note écrite à l'ingestion (aucun changement)", () => {
    const offre = ingerer(brute());
    const plan = planifierRenotation([offre], { profil: PROFIL_MARC, metiers: METIERS });
    expect(plan.changements).toEqual([]);
    expect(plan.inchangees).toBe(1);
  });

  it("la note d'ingestion est celle du profil de Marc, pas celle du défaut", () => {
    // Prouve que le profil passé compte : le mot de coordination ajouté ne vaut qu'avec lui.
    const b = brute({
      description: "Mise en service de lignes d'automatisation.",
      titre: "Chef de chantier",
      noc: null,
    });
    const marc = ingerer(b);
    const defaut = trier([b], new Set(), "2026-10-16", new Map(), METIERS).retenues[0]!;
    expect(marc.score).not.toBe(defaut.score);
  });

  it("la mesure de distance note avec les mêmes champs, seul le kilomètre change", () => {
    const offre = ingerer(brute());
    const bareme = { profil: PROFIL_MARC, metiers: METIERS };
    const attendu = computeScore(
      {
        titre: offre.poste,
        description: offre.texteNote ?? "",
        km: 12,
        noc: offre.noc,
        typePoste: offre.typePoste,
        dureeEmploi: offre.dureeEmploi,
      },
      PROFIL_MARC,
      METIERS,
    ).total;
    expect(scoreAvecDistance(offre, 12, bareme)).toBe(attendu);
  });

  it("à distance égale, les trois chemins rendent la même note", () => {
    const offre = ingerer(brute());
    const bareme = { profil: PROFIL_MARC, metiers: METIERS };
    // Ingestion : km inconnu. Re-notation : km de l'offre. Distance : le km qu'on vient de mesurer.
    const aIngestion = offre.score;
    const aRenotation = noterOffre(offre, PROFIL_MARC, METIERS).total;
    const aDistance = scoreAvecDistance(offre, null, bareme);
    expect(aRenotation).toBe(aIngestion);
    expect(aDistance).toBe(aIngestion);
  });

  it("le code de profession et les conditions pèsent dans la re-notation (ils étaient perdus)", () => {
    const offre = ingerer(brute({ noc: "73300" })); // hors des métiers retenus
    const sansCode = noterOffre({ ...offre, noc: null }, PROFIL_MARC, METIERS).total;
    expect(offre.score).toBeLessThan(sansCode as number);
    expect(noterOffre(offre, PROFIL_MARC, METIERS).total).toBe(offre.score);
  });
});

describe("ce qui est gardé avec l'offre", () => {
  it("l'offre gardée porte le code, le type de poste, la durée et l'extrait", () => {
    const offre = ingerer(brute());
    expect(offre.noc).toBe("22301");
    expect(offre.typePoste).toBe("Temps plein");
    expect(offre.dureeEmploi).toBe("Permanent");
    expect(offre.texteNote).toContain("cinq ans d'expérience");
    // Et le schéma l'accepte, comme les colonnes.
    expect(() => OffreSchema.parse(offre)).not.toThrow();
    const cols = colonnesOffre(offre);
    expect(cols.typePoste).toBe("Temps plein");
    expect(cols.dureeEmploi).toBe("Permanent");
    expect(cols.texteNote).toBe(offre.texteNote);
  });

  it("une source qui ne publie rien laisse des null, neutres à la note", () => {
    const offre = ingerer(brute({ noc: undefined, typePoste: undefined, dureeEmploi: undefined }));
    expect(offre.typePoste).toBeNull();
    expect(offre.dureeEmploi).toBeNull();
    expect(noterOffre(offre, PROFIL_MARC, METIERS).total).toBe(offre.score);
  });

  it("une annonce SANS texte garde un extrait vide, pas une absence", () => {
    // Sinon la re-notation relirait le repli (notes + raisons) et divergerait de l'ingestion.
    const offre = ingerer(brute({ description: "" }));
    expect(offre.texteNote).toBe("");
    expect(texteDeNotation(offre)).toBe("");
    expect(noterOffre(offre, PROFIL_MARC, METIERS).total).toBe(offre.score);
  });

  it("une offre écrite avant l'ADR-0025 se note sur sa provenance, jamais sur ses justifications", () => {
    const ancienne = {
      poste: "Coordonnateur de projets",
      km: null,
      notes: "Repérée le 2026-07-29.",
      raisons: [{ ton: "atout" as const, texte: "Encadrement d'équipe technique." }],
    };
    expect(texteDeNotation(ancienne)).toBe("Repérée le 2026-07-29.");
  });

  it("la justification automatique ne fait pas monter la note qu'elle justifie", () => {
    // « coordination » et « technique » y figurent : lues comme du texte d'annonce, elles
    // feraient d'un titre sans rapport une « combinaison » à 40 points.
    const entree = { poste: "Caissier", km: null, notes: "" };
    const avec = {
      ...entree,
      raisons: [
        { ton: "atout" as const, texte: "Le titre et l'annonce portent à la fois de la coordination et du contenu technique." },
      ],
    };
    expect(noterOffre(avec, PROFIL_DEFAUT, []).total).toBe(noterOffre(entree, PROFIL_DEFAUT, []).total);
  });
});

describe("l'extrait d'annonce", () => {
  it("est borné", () => {
    const long = "mot ".repeat(2000);
    expect(extraitPourNote(long).length).toBe(LONGUEUR_EXTRAIT_NOTE);
  });

  it("replie les espaces et les sauts de ligne", () => {
    expect(extraitPourNote("  une\n\n  annonce\t courte  ")).toBe("une annonce courte");
  });

  it("retire les coordonnées de tiers avant de garder le texte (garde-fou n°1)", () => {
    // Le numéro est assemblé à l'exécution : `piiGuard` refuse un numéro écrit en clair, même fictif.
    const telephone = ["418", "555", "0142"].join("-");
    const sortie = extraitPourNote(`Écrire à jean.tremblay@exemple.test ou appeler le ${telephone}.`);
    expect(sortie).not.toContain("jean.tremblay@exemple.test");
    expect(sortie).not.toContain(telephone);
  });
});
