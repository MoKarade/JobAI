// tests/nouveauBareme.test.ts — le salaire en premier (ADR-0032, JobAI#152). Données FICTIVES.
import { describe, it, expect } from "vitest";
import { PROFIL_DEFAUT, paliersSenioriteDepuisAnnees, ProfilSchema, type Profil } from "../lib/profil";
import {
  POIDS_NOUVEAU_BAREME,
  appliquerNouveauBareme,
  dejaApplique,
} from "../lib/nouveauBareme";
import { apercuNouveauBareme } from "../lib/apercuBareme";
import { noterOffre } from "../lib/noteOffre";
import { plancherFitRole, trier } from "../lib/ingest/pipeline";
import type { OffreBrute } from "../lib/ingest/types";
import { parserProfilStocke } from "../lib/profilStocke";
import { appliquerEcarts, calculerEcarts } from "../lib/cv/proposition";
import { SEED } from "../lib/seed";
import type { ReponseExtraction } from "../lib/cv/extraction";
import type { Offre } from "../lib/types";

const DATE = "2026-10-17";
const nouveau = appliquerNouveauBareme(PROFIL_DEFAUT, DATE);

/** Le sommet d'une table de points : ce qu'une offre peut gagner AU PLUS sur l'axe. */
function sommets(p: Profil): Record<keyof Profil["ponderation"], number> {
  return {
    fitRole: Math.max(...Object.values(p.pointsRole)),
    distance: Math.max(...p.paliersDistanceKm.map((x) => x.points), p.distanceInconnue, p.distancePlancher),
    seniorite: Math.max(...p.paliersSeniorite.map((x) => x.points), p.senioriteNonPrecisee, p.senioritePlancher),
    salaire: Math.max(...p.paliersSalaire.map((x) => x.points), p.salaireNonAffiche, p.salairePlancher),
    immigration: Math.max(p.immigrationLibre, p.immigrationOrdre),
    conditions: Math.max(...Object.values(p.pointsConditions)),
  };
}

const BASE: Offre = {
  id: "o-1",
  source: "jobbank",
  dateReperage: "2026-10-01",
  entreprise: "Société Exemple",
  poste: "Coordonnateur de projets d'automatisation",
  lien: "https://exemple.test/o",
  km: 10,
  noc: null,
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

describe("les poids", () => {
  it("font 100, dans l'ordre voulu : salaire d'abord", () => {
    const somme = Object.values(POIDS_NOUVEAU_BAREME).reduce((a, b) => a + b, 0);
    expect(somme).toBe(100);
    const max = Math.max(...Object.values(POIDS_NOUVEAU_BAREME));
    expect(POIDS_NOUVEAU_BAREME.salaire).toBe(max);
  });

  it("le sommet de chaque table de points est le poids de son axe", () => {
    // Avant ET après : sinon un axe pourrait donner plus de points que son poids ne le dit.
    expect(sommets(PROFIL_DEFAUT)).toEqual(PROFIL_DEFAUT.ponderation);
    expect(sommets(nouveau)).toEqual(nouveau.ponderation);
    expect(nouveau.ponderation).toEqual(POIDS_NOUVEAU_BAREME);
  });
});

describe("appliquerNouveauBareme", () => {
  it("n'a pas bougé un seuil : km, années et dollars restent ceux de Marc", () => {
    expect(nouveau.paliersDistanceKm.map((p) => p.max)).toEqual(PROFIL_DEFAUT.paliersDistanceKm.map((p) => p.max));
    expect(nouveau.paliersSeniorite.map((p) => p.max)).toEqual(PROFIL_DEFAUT.paliersSeniorite.map((p) => p.max));
    expect(nouveau.paliersSalaire.map((p) => p.min)).toEqual(PROFIL_DEFAUT.paliersSalaire.map((p) => p.min));
    expect(nouveau.rayonMaxKm).toBe(PROFIL_DEFAUT.rayonMaxKm);
    expect(nouveau.motsCoordination).toEqual(PROFIL_DEFAUT.motsCoordination);
  });

  it("garde chaque palier dans l'ordre (l'arrondi ne les croise pas)", () => {
    const decroit = (xs: readonly number[]) => xs.every((x, i) => i === 0 || x <= (xs[i - 1] as number));
    expect(decroit(nouveau.paliersDistanceKm.map((p) => p.points))).toBe(true);
    expect(decroit(nouveau.paliersSeniorite.map((p) => p.points))).toBe(true);
    expect(decroit(nouveau.paliersSalaire.map((p) => p.points))).toBe(true);
  });

  it("met le salaire à l'échelle : 10 → 32, le neutre reste à 60 % (19 sur 32)", () => {
    expect(nouveau.paliersSalaire.map((p) => p.points)).toEqual([32, 29, 26, 19]);
    expect(nouveau.salaireNonAffiche).toBe(19);
    expect(nouveau.salairePlancher).toBe(10);
  });

  it("incrémente la version, date le profil et allume le salaire", () => {
    expect(nouveau.version).toBe(PROFIL_DEFAUT.version + 1);
    expect(nouveau.etabliLe).toBe(DATE);
    expect(nouveau.salaireDansLaNote).toBe(true);
    expect(PROFIL_DEFAUT.salaireDansLaNote).toBe(false);
  });

  it("est idempotent : appliqué deux fois, rien ne bouge, la version non plus", () => {
    expect(dejaApplique(nouveau)).toBe(true);
    expect(dejaApplique(PROFIL_DEFAUT)).toBe(false);
    expect(appliquerNouveauBareme(nouveau, "2026-11-01")).toBe(nouveau);
  });

  it("repart du profil EN COURS : les paliers de séniorité du CV sont conservés à l'échelle", () => {
    const duCv = ProfilSchema.parse({
      ...structuredClone(PROFIL_DEFAUT),
      paliersSeniorite: paliersSenioriteDepuisAnnees(6),
    });
    const r = appliquerNouveauBareme(duCv, DATE);
    expect(r.paliersSeniorite.map((p) => p.max)).toEqual([5, 6, 8]);
    expect(r.paliersSeniorite.map((p) => p.points)).toEqual([10, 9, 6]);
  });

  it("survit à un aller-retour JSON, comme le profil enregistré en base", () => {
    const { profil, combles } = parserProfilStocke(JSON.stringify(nouveau));
    expect(combles).toEqual([]);
    expect(profil).toEqual(nouveau);
  });
});

describe("le salaire n'entre dans la note que si le profil le demande", () => {
  const metiers: string[] = [];

  it("profil d'avant : le salaire de l'offre est ignoré, la note est celle d'hier", () => {
    const sans = noterOffre(offre({ salaireAnnuel: null }), PROFIL_DEFAUT, metiers).total;
    const avec = noterOffre(offre({ salaireAnnuel: 95_000 }), PROFIL_DEFAUT, metiers).total;
    expect(avec).toBe(sans);
  });

  it("nouveau profil : un salaire haut monte la note, un bas la baisse, l'absence est neutre", () => {
    // Un poste et une distance assez moyens pour que le plafond de 85 ne masque pas l'écart.
    const moyenne = { poste: "Technicien en laboratoire", km: 40 };
    const neutre = noterOffre(offre({ ...moyenne, salaireAnnuel: null }), nouveau, metiers).total;
    const haut = noterOffre(offre({ ...moyenne, salaireAnnuel: 95_000 }), nouveau, metiers).total;
    const bas = noterOffre(offre({ ...moyenne, salaireAnnuel: 45_000 }), nouveau, metiers).total;
    expect(haut).toBeGreaterThan(neutre);
    expect(bas).toBeLessThan(neutre);
    expect(haut - neutre).toBe(nouveau.paliersSalaire[0]!.points - nouveau.salaireNonAffiche);
  });

  it("le plafond des notes calculées tient toujours", () => {
    const meilleure = noterOffre(
      offre({ poste: "Project manager automatisation", km: 1, salaireAnnuel: 120_000, typePoste: "Temps plein", dureeEmploi: "Permanent" }),
      nouveau,
      metiers,
    );
    expect(meilleure.total).toBeLessThanOrEqual(nouveau.plafondNoteCalculee);
  });
});

describe("l'aperçu", () => {
  const calculees = [
    offre({ id: "a", poste: "Project manager automatisation", score: null, salaireAnnuel: 92_000 }),
    offre({ id: "b", poste: "Coordonnateur de projets", score: null, salaireAnnuel: 85_000 }),
    offre({ id: "c", poste: "Chargé de projet mécanique", score: null, salaireAnnuel: 75_000 }),
    offre({ id: "d", poste: "Superviseur de production", score: null, salaireAnnuel: 40_000 }),
    offre({ id: "e", poste: "Gestionnaire de projet", score: null, salaireAnnuel: 48_000 }),
    offre({ id: "f", poste: "Caissier", score: null }),
  ];
  // La note enregistrée = celle du barème actif : tout le mouvement vient du nouveau barème.
  const offres: Offre[] = [
    ...calculees.map((o) => ({ ...o, score: noterOffre(o, PROFIL_DEFAUT, []).total })),
    offre({ id: "m", scoreSource: "manuel", score: 91 }),
    offre({ id: "h", histo: true, score: 60 }),
    offre({ id: "p", perimeeLe: "2026-09-01", score: 60 }),
  ];
  const ap = apercuNouveauBareme(offres, PROFIL_DEFAUT, [], DATE);

  it("compte les calculées, préserve la manuelle, ignore l'historique et le périmé", () => {
    expect(ap.population.calculees).toBe(6);
    expect(ap.population.manuellesPreservees).toBe(1);
    expect(ap.population.avecSalaireAnnuel).toBe(5);
    expect(ap.population.avantEgalAncien).toBe(6);
    // L'historique et le périmé ne sont pas mesurés, mais ils seront re-notés : l'écran le dit.
    expect(ap.population.autresRenotees).toBe(2);
    expect(ap.dejaApplique).toBe(false);
    expect(ap.versionNouvelle).toBe(PROFIL_DEFAUT.version + 1);
  });

  it("rend trois offres qui montent et deux qui descendent, du plus gros écart au plus petit", () => {
    expect(ap.exemples.montent).toHaveLength(3);
    expect(ap.exemples.descendent).toHaveLength(2);
    expect(ap.exemples.montent.every((e) => e.ecart > 0)).toBe(true);
    expect(ap.exemples.descendent.every((e) => e.ecart < 0)).toBe(true);
    const m = ap.exemples.montent.map((e) => e.ecart);
    expect(m).toEqual([...m].sort((x, y) => y - x));
    const d = ap.exemples.descendent.map((e) => e.ecart);
    expect(d).toEqual([...d].sort((x, y) => x - y));
  });

  it("un exemple dit sa note d'avant, celle d'après, et ses points par axe", () => {
    const e = ap.exemples.montent[0]!;
    expect(e.apres - e.avant).toBe(e.ecart);
    const somme = Object.values(e.partsApres).reduce((a, b) => a + b, 0);
    expect(somme).toBeGreaterThanOrEqual(e.apres);
  });

  it("ne modifie aucune offre et agrège sans nom", () => {
    const copie = structuredClone(offres);
    apercuNouveauBareme(offres, PROFIL_DEFAUT, [], DATE);
    expect(offres).toEqual(copie);
    const { exemples: _exemples, ...agregats } = ap;
    expect(JSON.stringify(agregats)).not.toContain("Société Exemple");
  });

  it("déjà appliqué : aucun mouvement", () => {
    const deja = apercuNouveauBareme(offres, nouveau, [], DATE);
    expect(deja.dejaApplique).toBe(true);
    expect(deja.mouvement.ecartMoyenBaremeSeul).toBe(0);
  });
});

describe("non-régression sur le jeu de référence", () => {
  it("le profil d'avant note le seed comme avant (le code n'a déplacé aucune note)", () => {
    for (const o of SEED) {
      const t = noterOffre(o, PROFIL_DEFAUT, ["21", "22", "70", "92"]).total;
      const sansSalaire = noterOffre({ ...o, salaireAnnuel: null }, PROFIL_DEFAUT, ["21", "22", "70", "92"]).total;
      expect(t).toBe(sansSalaire);
    }
  });

  it("aucune note manuelle n'est touchée par le plan de re-notation", async () => {
    const { planifierRenotation } = await import("../lib/cv/renotation");
    const plan = planifierRenotation(SEED, { profil: nouveau, metiers: ["21"] });
    const manuelles = SEED.filter((o) => o.scoreSource === "manuel");
    expect(plan.manuellesPreservees).toBe(manuelles.length);
    for (const c of plan.changements) {
      expect(manuelles.some((o) => o.id === c.id)).toBe(false);
    }
  });
});

describe("ce que le changement d'échelle emporte avec lui", () => {
  it("le plancher de rôle de l'ingestion suit le poids du rôle : 14 sur 40 → 10 sur 28", () => {
    expect(plancherFitRole(PROFIL_DEFAUT)).toBe(14);
    expect(plancherFitRole(nouveau)).toBe(10);
    // Il sépare toujours un signal de rôle (technicien, 18) d'une absence de signal (6).
    expect(nouveau.pointsRole.horsSujet).toBeLessThan(plancherFitRole(nouveau));
    expect(nouveau.pointsRole.technicien).toBeGreaterThanOrEqual(plancherFitRole(nouveau));
  });

  it("une validation de CV ne remet pas la séniorité à 15 points", () => {
    expect(paliersSenioriteDepuisAnnees(4).map((p) => p.points)).toEqual([15, 13, 9]);
    const extraction: ReponseExtraction = {
      anneesExperience: 7,
      anneesExperienceProvenance: "",
      parcours: [],
      langues: [],
      diplomes: [],
      outils: [],
      titresOccupes: [],
      recherchesSuggerees: [],
      competences: [],
      forces: [],
      manques: [],
    };
    const ecarts = calculerEcarts(nouveau, extraction);
    const palier = ecarts.find((e) => e.cle === "paliersSeniorite");
    expect(palier).toBeDefined();
    const apres = appliquerEcarts(nouveau, ecarts, ["paliersSeniorite"], "2026-10-18");
    expect(apres.paliersSeniorite.map((p) => p.points)).toEqual([10, 9, 6]);
  });
});

describe("le tri de l'ingestion suit l'échelle du profil qui note", () => {
  const brute = (titre: string, description: string): OffreBrute => ({
    refSource: titre,
    titre,
    entreprise: "Société Exemple",
    ville: "Lévis, QC",
    lien: `https://exemple.test/${encodeURIComponent(titre)}`,
    description,
    publieeLe: "2026-10-16",
  });

  it("garde un poste technique (18 sur 28) et refuse un hors-sujet (6), au plancher de 10", () => {
    const r = trier(
      [
        brute("Technicien en automatisation", "Automates et robotique."),
        brute("Caissier", "Service à la clientèle en épicerie."),
      ],
      new Set(),
      "2026-10-17",
      new Map(),
      [],
      nouveau,
    );
    expect(r.retenues.map((o) => o.poste)).toEqual(["Technicien en automatisation"]);
    expect(r.souslePlancher).toBe(1);
  });
});

describe("le plafond des notes calculées", () => {
  it("n'est pas mis à l'échelle : l'aperçu compte les offres qu'il arrête", () => {
    const forte = offre({
      id: "forte",
      poste: "Chargé de projet automatisation",
      km: 3,
      typePoste: "Temps plein",
      dureeEmploi: "Permanent",
      salaireAnnuel: 95_000,
    });
    const offres = [{ ...forte, score: noterOffre(forte, PROFIL_DEFAUT, []).total }];
    const ap = apercuNouveauBareme(offres, PROFIL_DEFAUT, [], DATE);
    expect(ap.auPlafond.avant).toBe(1);
    expect(ap.auPlafond.apres).toBe(1);
    expect(nouveau.plafondNoteCalculee).toBe(PROFIL_DEFAUT.plafondNoteCalculee);
  });
});
