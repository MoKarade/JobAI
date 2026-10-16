// tests/diagnosticBareme.test.ts — la mesure du barème (JobAI#148). Données FICTIVES.
import { describe, it, expect } from "vitest";
import { diagnostiquerBareme } from "../lib/diagnosticBareme";
import { PROFIL_DEFAUT, type Profil } from "../lib/profil";
import { computeScore } from "../lib/scoring";
import type { Offre } from "../lib/types";

const BASE: Offre = {
  id: "o-1",
  source: "jobbank",
  dateReperage: "2026-08-01",
  entreprise: "Société Exemple",
  poste: "Coordonnateur de projets",
  lien: "https://exemple.test/o",
  km: 10,
  noc: "21301",
  ville: "Québec",
  salaireAffiche: null,
  priorite: "Moyenne",
  statut: "Identifiee",
  dateEnvoi: "",
  userNote: "",
  score: 70,
  scoreSource: "calcule",
  raisons: [],
  notes: "",
  histo: false,
  perimeeLe: null,
};

const offre = (p: Partial<Offre> = {}): Offre => ({ ...BASE, ...p });

describe("diagnostiquerBareme", () => {
  it("ne mesure que les offres ouvertes et notées", () => {
    const d = diagnostiquerBareme(
      [
        offre({ id: "a" }),
        offre({ id: "b", histo: true }),
        offre({ id: "c", perimeeLe: "2026-09-01T00:00:00.000Z" }),
        offre({ id: "d", score: null, scoreSource: null }),
        offre({ id: "e", scoreSource: "manuel" }),
      ],
      PROFIL_DEFAUT,
      ["21"],
    );
    expect(d.population).toMatchObject({ total: 5, ouvertes: 3, notees: 2, manuelles: 1 });
  });

  it("distingue le code de profession retenu, hors métiers et absent", () => {
    const d = diagnostiquerBareme(
      [
        offre({ id: "a", noc: "21301" }),
        offre({ id: "b", noc: "65201" }),
        offre({ id: "c", noc: null }),
      ],
      PROFIL_DEFAUT,
      ["21"],
    );
    expect(d.population.avecNoc).toBe(2);
    expect(d.population.nocRetenu).toBe(1);
    expect(d.population.nocHorsMetiers).toBe(1);
  });

  it("montre que la re-notation perd le facteur de domaine que l'ingestion applique", () => {
    // Une offre hors domaine : l'ingestion la divise par deux, la re-notation non.
    const hors = offre({ id: "h", noc: "65201", poste: "Cuisinier", score: 20 });
    const d = diagnostiquerBareme([hors], PROFIL_DEFAUT, ["21"]);
    expect(d.complet.horsDomaine).toBe(1);
    expect(d.ingestion.horsDomaine).toBe(1);
    expect(d.renotation.horsDomaine).toBe(0);
    expect((d.renotation.distribution.max ?? 0)).toBeGreaterThan(d.complet.distribution.max ?? 0);
  });

  it("recalcule exactement comme computeScore", () => {
    const o = offre({ score: 1 });
    const attendu = computeScore(
      { titre: o.poste, description: o.notes, km: o.km, noc: o.noc },
      PROFIL_DEFAUT,
      ["21"],
    ).total;
    const d = diagnostiquerBareme([o], PROFIL_DEFAUT, ["21"]);
    expect(d.complet.distribution.max).toBe(attendu);
    expect(d.complet.differentesDuStocke).toBe(1);
    expect(d.complet.ecartMoyenDuStocke).toBe(attendu - 1);
  });

  it("répartit les notes enregistrées par tranche", () => {
    const d = diagnostiquerBareme(
      [offre({ id: "a", score: 39 }), offre({ id: "b", score: 64 }), offre({ id: "c", score: 77 }), offre({ id: "d", score: 85 })],
      PROFIL_DEFAUT,
      [],
    );
    expect(d.enregistree.tranches).toMatchObject({ "<40": 1, "60-64": 1, "75-79": 1, "80+": 1 });
    expect(d.enregistree).toMatchObject({ n: 4, min: 39, max: 85, mediane: 70.5 });
  });

  it("nomme les mots de vocabulaire ajoutés au défaut", () => {
    const profil: Profil = { ...PROFIL_DEFAUT, motsTechnique: [...PROFIL_DEFAUT.motsTechnique, "outil-fictif-xyz"] };
    const d = diagnostiquerBareme([offre({ notes: "Maîtrise de outil-fictif-xyz requise" })], profil, []);
    expect(d.profil.motsTechniqueAjoutes).toEqual(["outil-fictif-xyz"]);
    expect(d.meilleures[0]?.motsTechniqueTrouves).toContain("outil-fictif-xyz");
  });

  it("rend des zéros honnêtes sur un suivi vide, jamais des NaN", () => {
    const d = diagnostiquerBareme([], PROFIL_DEFAUT, []);
    expect(d.enregistree).toMatchObject({ n: 0, min: null, max: null, moyenne: null });
    expect(d.complet.moyenneParts.fitRole).toBeNull();
    expect(d.meilleures).toEqual([]);
  });

  it("borne la liste nominative sans toucher aux agrégats", () => {
    const offres = Array.from({ length: 5 }, (_, i) => offre({ id: `o-${i}`, score: 50 + i }));
    const d = diagnostiquerBareme(offres, PROFIL_DEFAUT, [], 2);
    expect(d.meilleures.map((m) => m.stockee)).toEqual([54, 53]);
    expect(d.enregistree.n).toBe(5);
  });
});
