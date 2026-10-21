// tests/domaineGradue.test.ts — le domaine gradué : retenu, voisin, autre (ADR-0038, JobAI#151). Données FICTIVES.
import { describe, it, expect } from "vitest";
import { niveauDomaine } from "../lib/nocProfession";
import { computeScore, plafondDuNiveau } from "../lib/scoring";
import { PROFIL_DEFAUT, ProfilSchema, type Profil } from "../lib/profil";
import { appliquerNouveauBareme, dejaApplique } from "../lib/nouveauBareme";
import { apercuNouveauBareme } from "../lib/apercuBareme";
import { parserProfilStocke } from "../lib/profilStocke";
import { diagnostiquerBareme } from "../lib/diagnosticBareme";
import type { Offre } from "../lib/types";

/** Un métier précis retenu (22302) ; les autres codes de « 22 » en sont voisins. */
const METIERS = ["22302"] as const;
const GRADUE: Profil = ProfilSchema.parse({ ...structuredClone(PROFIL_DEFAUT), domaineGradue: true });

describe("niveauDomaine", () => {
  it("retenu : le code complet, ou son préfixe de deux chiffres", () => {
    expect(niveauDomaine("22302", METIERS)).toBe("retenu");
    expect(niveauDomaine("70010", ["70"])).toBe("retenu");
  });

  it("voisin : même domaine ET même niveau (deux chiffres) qu'un métier retenu, mais pas le même métier", () => {
    expect(niveauDomaine("22114", METIERS)).toBe("voisin"); // fictif : un autre technicien du même rayon
    expect(niveauDomaine("22220", METIERS)).toBe("voisin");
  });

  it("autre : un code lu qui ne partage ni le métier ni le préfixe — le premier chiffre seul ne suffit pas", () => {
    expect(niveauDomaine("21100", METIERS)).toBe("autre"); // même premier chiffre (2), autre niveau : pas voisin
    expect(niveauDomaine("65311", METIERS)).toBe("autre");
  });

  it("inconnu : pas de code lisible, ou aucun métier retenu — jamais une pénalité", () => {
    expect(niveauDomaine(null, METIERS)).toBe("inconnu");
    expect(niveauDomaine(undefined, METIERS)).toBe("inconnu");
    expect(niveauDomaine("2230", METIERS)).toBe("inconnu"); // quatre chiffres : format 2016, illisible
    expect(niveauDomaine("65311", [])).toBe("inconnu");
  });

  it("une entrée mal écrite ne retient rien et ne rend personne voisin", () => {
    expect(niveauDomaine("22114", ["223"])).toBe("autre");
  });
});

describe("plafondDuNiveau", () => {
  it("n'en pose qu'au voisin et à l'autre domaine", () => {
    expect(plafondDuNiveau("retenu", GRADUE)).toBeNull();
    expect(plafondDuNiveau("inconnu", GRADUE)).toBeNull();
    expect(plafondDuNiveau("voisin", GRADUE)).toBe(GRADUE.plafondVoisin);
    expect(plafondDuNiveau("autre", GRADUE)).toBe(GRADUE.plafondHorsDomaine);
  });

  it("le défaut est celui de Marc : 40 hors domaine", () => {
    expect(PROFIL_DEFAUT.plafondHorsDomaine).toBe(40);
    expect(PROFIL_DEFAUT.domaineGradue).toBe(false);
  });
});

/** Une offre qui note haut partout (distance, permanent) : seul le domaine peut l'arrêter. */
const BONNE = {
  titre: "Chargé de projet en automatisation robotique",
  description: "Coordination d'une équipe technique, robotique industrielle.",
  km: 2,
};

describe("computeScore avec le domaine gradué", () => {
  it("un métier retenu n'est pas plafonné par le domaine", () => {
    const d = computeScore({ ...BONNE, noc: "22302" }, GRADUE, METIERS);
    expect(d.niveauDomaine).toBe("retenu");
    expect(d.plafondDomaine).toBeNull();
    expect(d.facteurDomaine).toBe(1);
    expect(d.total).toBeGreaterThan(GRADUE.plafondVoisin);
  });

  it("un voisin est plafonné au plafond du voisin, un autre domaine à 40", () => {
    const voisin = computeScore({ ...BONNE, noc: "22114" }, GRADUE, METIERS);
    const autre = computeScore({ ...BONNE, noc: "65311" }, GRADUE, METIERS);
    expect(voisin.plafondDomaine).toBe(GRADUE.plafondVoisin);
    expect(voisin.total).toBeLessThanOrEqual(GRADUE.plafondVoisin);
    expect(autre.plafondDomaine).toBe(40);
    expect(autre.total).toBeLessThanOrEqual(40);
    expect(voisin.total).toBeGreaterThan(autre.total);
  });

  it("jamais deux pénalités : le facteur reste 1 quand un plafond s'applique", () => {
    const autre = computeScore({ ...BONNE, noc: "65311" }, GRADUE, METIERS);
    expect(autre.facteurDomaine).toBe(1);
    expect(autre.total).toBe(Math.min(autre.brut, GRADUE.plafondNoteCalculee, 40));
  });

  it("un plafond ne relève jamais une note : sous le plafond, la note est celle du barème seul", () => {
    const large = ProfilSchema.parse({ ...structuredClone(GRADUE), plafondHorsDomaine: 99 });
    const faible = computeScore({ titre: "Cuisinier", km: 90, noc: "65311" }, large, METIERS);
    expect(faible.total).toBe(Math.min(faible.brut, large.plafondNoteCalculee));
    expect(faible.plafondDomaine).toBe(99);
    expect(faible.total).toBeLessThan(99);
  });

  it("sans code, ou sans métier retenu : la note est celle d'hier (domaine inconnu)", () => {
    const sansCode = computeScore({ ...BONNE }, GRADUE, METIERS);
    const sansMetier = computeScore({ ...BONNE, noc: "65311" }, GRADUE, []);
    expect(sansCode.niveauDomaine).toBe("inconnu");
    expect(sansMetier.niveauDomaine).toBe("inconnu");
    expect(sansCode.total).toBe(computeScore({ ...BONNE }, PROFIL_DEFAUT, METIERS).total);
    expect(sansMetier.plafondDomaine).toBeNull();
  });
});

describe("le profil d'avant note comme avant", () => {
  it("domaine non gradué : le multiplicateur s'applique, aucun plafond de domaine", () => {
    const d = computeScore({ ...BONNE, noc: "65311" }, PROFIL_DEFAUT, METIERS);
    expect(d.facteurDomaine).toBe(PROFIL_DEFAUT.facteurHorsDomaine);
    expect(d.plafondDomaine).toBeNull();
    expect(d.total).toBe(Math.min(Math.round(d.brut * PROFIL_DEFAUT.facteurHorsDomaine), PROFIL_DEFAUT.plafondNoteCalculee));
  });

  it("un profil enregistré avant l'ADR-0038 est comblé à faux, avec les plafonds par défaut", () => {
    const ancien: Record<string, unknown> = structuredClone(PROFIL_DEFAUT) as unknown as Record<string, unknown>;
    delete ancien.domaineGradue;
    delete ancien.plafondVoisin;
    delete ancien.plafondHorsDomaine;
    const { profil, combles } = parserProfilStocke(JSON.stringify(ancien));
    expect(profil.domaineGradue).toBe(false);
    expect(profil.plafondVoisin).toBe(55);
    expect(profil.plafondHorsDomaine).toBe(40);
    expect(combles).toEqual(expect.arrayContaining(["domaineGradue", "plafondVoisin", "plafondHorsDomaine"]));
  });
});

describe("le nouveau barème graduent le domaine avec le même geste", () => {
  it("appliquer allume le domaine gradué ; déjà appliqué seulement s'il l'est", () => {
    const nouveau = appliquerNouveauBareme(PROFIL_DEFAUT, "2026-10-21");
    expect(nouveau.domaineGradue).toBe(true);
    expect(dejaApplique(nouveau)).toBe(true);
    // Un profil au salaire appliqué mais au domaine non gradué n'est pas « déjà appliqué ».
    expect(dejaApplique({ ...nouveau, domaineGradue: false })).toBe(false);
  });
});

const BASE: Offre = {
  id: "o-1",
  source: "jobbank",
  dateReperage: "2026-10-01",
  entreprise: "Société Exemple",
  poste: "Chargé de projet en automatisation robotique",
  lien: "https://exemple.test/o",
  km: 2,
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
const offre = (p: Partial<Offre>): Offre => ({ ...BASE, ...p });

describe("l'aperçu dit ce que devient le haut de la liste", () => {
  const offres = [
    offre({ id: "a", noc: "22302" }),
    offre({ id: "b", noc: "22114", score: 69 }),
    offre({ id: "c", noc: "65311", score: 68 }),
    offre({ id: "d", noc: null, score: 67 }),
  ];
  const apercu = apercuNouveauBareme(offres, PROFIL_DEFAUT, METIERS, "2026-10-21");

  it("compte les offres par niveau", () => {
    expect(apercu.domaine.niveaux).toEqual({ retenu: 1, voisin: 1, autre: 1, inconnu: 1 });
  });

  it("compte celles que le plafond abaisse, et dit les plafonds", () => {
    expect(apercu.domaine.plafonnees).toBe(2);
    expect(apercu.plafondsDomaine).toEqual({ voisin: 55, autre: 40 });
  });

  it("la composition du haut de liste a la taille de la population quand elle est petite", () => {
    expect(apercu.domaine.hautDeListe.taille).toBe(4);
    expect(apercu.domaine.hautDeListe.apres.retenu).toBe(1);
  });

  it("le diagnostic compte voisin et autre comme hors des métiers retenus", () => {
    const r = diagnostiquerBareme(offres, GRADUE, METIERS);
    expect(r.complet.horsDomaine).toBe(2);
    expect(r.meilleures.find((m) => m.id === "b")?.niveauDomaine).toBe("voisin");
    expect(r.profil.domaineGradue).toBe(true);
  });
});
