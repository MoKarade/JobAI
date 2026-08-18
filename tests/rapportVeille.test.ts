// tests/rapportVeille.test.ts — le compte rendu d'une passe.
//
// Ce que ces tests protègent : qu'un rapport ne puisse pas se contredire lui-même. Le
// 17 août, l'écran affichait « 100 trouvées · 0 nouvelle · 26 déjà connues » — soixante-
// quatorze offres disparaissaient sans motif. Le tri travaillait très bien ; c'est le
// compte rendu qui mentait par omission.

import { describe, it, expect } from "vitest";
import {
  LIBELLE_MOTIF,
  construireRapport,
  depuis,
  type RapportVeille,
} from "../lib/rapportVeille";
import type { Tri } from "../lib/ingest/pipeline";
import { OffreSchema, type Offre } from "../lib/types";

const offre = (champs: Partial<Offre> = {}): Offre =>
  OffreSchema.parse({
    id: "exemple-inc-coordonnateur",
    source: "jobbank",
    dateReperage: "2026-08-18",
    entreprise: "Exemple inc.",
    poste: "Coordonnateur de projets",
    lien: "https://exemple.test/1",
    km: null,
    ville: "Québec",
    salaireAffiche: null,
    priorite: "Moyenne",
    statut: "Identifiee",
    dateEnvoi: "",
    score: 68,
    scoreSource: "calcule",
    raisons: [],
    notes: "",
    userNote: "",
    histo: false,
    perimeeLe: null,
    ...champs,
  });

const tri = (refusees: Tri["refusees"] = []): Omit<Tri, "retenues"> => ({
  souslePlancher: refusees.filter((r) => r.motif === "sous-le-plancher").length,
  doublons: refusees.filter((r) => r.motif === "doublon").length,
  horsRegion: refusees.filter((r) => r.motif === "hors-region").length,
  lieuInconnu: refusees.filter((r) => r.motif === "lieu-inconnu").length,
  refusees,
});

const base = {
  jour: "2026-08-18",
  fini: "2026-08-18T15:00:00.000Z",
  declencheur: "cron-veille",
  trouvees: 0,
  tri: tri(),
  nouvelles: [] as string[],
  perimees: [] as string[],
  revenues: [] as string[],
  enSursis: 0,
  offres: [] as Offre[],
  sources: [] as RapportVeille["sources"],
  lieux: { demandes: 0, juges: 0, introuvables: 0 },
  localisation: "non tentée",
  villesCompletees: 0,
  adressesAnnoncees: 0,
};

describe("le compte tombe juste, ou il le DIT", () => {
  it("sansMotif vaut zéro quand chaque offre trouvée est expliquée", () => {
    const r = construireRapport({
      ...base,
      trouvees: 3,
      nouvelles: ["a"],
      tri: tri([
        { entreprise: "X", titre: "T", ville: "Toronto", motif: "hors-region" },
        { entreprise: "Y", titre: "U", ville: "", motif: "sous-le-plancher" },
      ]),
      offres: [offre({ id: "a" })],
    });
    expect(r.sansMotif).toBe(0);
  });

  it("sansMotif EXPOSE le reliquat — c'est le défaut du 17 août", () => {
    // 100 trouvées, 26 doublons, rien d'autre de nommé : 74 offres s'évaporent. Le rapport
    // doit le crier plutôt que de laisser le lecteur faire la soustraction.
    const r = construireRapport({
      ...base,
      trouvees: 100,
      tri: tri(
        Array.from({ length: 26 }, (_, i) => ({
          entreprise: `E${i}`,
          titre: "T",
          ville: "Québec",
          motif: "doublon" as const,
        })),
      ),
    });
    expect(r.sansMotif).toBe(74);
  });
});

describe("les notes moyennes", () => {
  it("distinguent les NOUVELLES du suivi entier", () => {
    const r = construireRapport({
      ...base,
      nouvelles: ["a"],
      offres: [
        offre({ id: "a", score: 80 }),
        offre({ id: "b", score: 60 }),
        offre({ id: "c", score: 40 }),
      ],
    });
    // La passe a fait entrer une offre à 80 ; le suivi entier tourne à 60.
    expect(r.noteMoyenneNouvelles).toBe(80);
    expect(r.noteMoyenneSuivi).toBe(60);
  });

  it("EXCLUENT une note absente au lieu de la compter zéro", () => {
    // Discriminant : avec un `?? 0`, la moyenne tomberait à 34 et décrirait la complétude
    // de la saisie plutôt que la qualité des offres.
    const r = construireRapport({
      ...base,
      offres: [offre({ id: "a", score: 68 }), offre({ id: "b", score: null })],
    });
    expect(r.noteMoyenneSuivi).toBe(68);
  });

  it("rendent null quand AUCUNE note n'est connue — jamais un 0 qui aurait l'air mesuré", () => {
    const r = construireRapport({ ...base, offres: [offre({ id: "a", score: null })] });
    expect(r.noteMoyenneSuivi).toBeNull();
    expect(r.noteMoyenneNouvelles).toBeNull();
    expect(r.meilleure).toBeNull();
  });

  it("ignorent l'historique et les périmées : elles ne sont plus regardées", () => {
    const r = construireRapport({
      ...base,
      offres: [
        offre({ id: "a", score: 80 }),
        offre({ id: "b", score: 20, histo: true }),
        offre({ id: "c", score: 20, perimeeLe: "2026-08-01T00:00:00.000Z" }),
      ],
    });
    expect(r.noteMoyenneSuivi).toBe(80);
    expect(r.suivies).toBe(1);
  });
});

describe("les refus sont groupés, triés, et nommés par leur objet", () => {
  it("classe du plus fréquent au moins fréquent et n'invente aucun motif vide", () => {
    const r = construireRapport({
      ...base,
      trouvees: 4,
      tri: tri([
        { entreprise: "A", titre: "T", ville: "Toronto", motif: "hors-region" },
        { entreprise: "B", titre: "T", ville: "Montréal", motif: "hors-region" },
        { entreprise: "C", titre: "T", ville: "Toronto", motif: "hors-region" },
        { entreprise: "D", titre: "T", ville: "", motif: "sous-le-plancher" },
      ]),
    });
    expect(r.refusees.map((x) => [x.motif, x.n])).toEqual([
      ["hors-region", 3],
      ["sous-le-plancher", 1],
    ]);
    // Les villes sont nommées, et groupées : « toronto (2) » se lit, trois lignes non.
    expect(r.refusees[0]?.villes).toEqual([
      { ville: "toronto", n: 2 },
      { ville: "montreal", n: 1 },
    ]);
  });

  it("ne nomme PAS de ville sous un motif qui ne se décide pas sur le lieu", () => {
    // Afficher une ville sous « sous le plancher » laisserait croire qu'elle y est pour
    // quelque chose, alors que c'est le titre qui a tranché.
    const r = construireRapport({
      ...base,
      trouvees: 1,
      tri: tri([{ entreprise: "A", titre: "Caissier", ville: "Québec", motif: "sous-le-plancher" }]),
    });
    expect(r.refusees[0]?.villes).toEqual([]);
  });

  it("chaque motif a un libellé lisible — la table est la seule source", () => {
    for (const r of ["hors-region", "lieu-inconnu", "sous-le-plancher", "doublon"] as const) {
      expect(LIBELLE_MOTIF[r].length).toBeGreaterThan(0);
    }
  });
});

describe("depuis — l'âge du rapport, sans lire l'horloge", () => {
  const t = Date.parse("2026-08-18T15:00:00.000Z");

  it("rend une durée lisible aux différentes échelles", () => {
    expect(depuis("2026-08-18T15:00:00.000Z", t)).toBe("à l’instant");
    expect(depuis("2026-08-18T14:30:00.000Z", t)).toBe("il y a 30 min");
    expect(depuis("2026-08-18T13:00:00.000Z", t)).toBe("il y a 2 h");
    expect(depuis("2026-08-16T15:00:00.000Z", t)).toBe("il y a 2 jours");
  });

  it("rend null sur un instant illisible plutôt qu'une durée fantaisiste", () => {
    expect(depuis("pas une date", t)).toBeNull();
  });

  it("ne rend jamais une durée NÉGATIVE si l'horloge du serveur est en avance", () => {
    // Vercel tourne en UTC et l'instant est posé côté serveur : une dérive d'une seconde
    // suffirait à afficher « il y a -1 min », qui se lit comme un bug.
    expect(depuis("2026-08-18T15:00:30.000Z", t)).toBe("à l’instant");
  });
});
