// tests/fermetureAuto.test.ts — fermer tout seul, sans jamais fermer à tort.
//
// ⚠️ LE TEST QUI COMPTE EST CELUI DU JOURNAL PERDU. Le journal de veille est un seul JSON
// dans une ligne d'état : perdu ou écrit à moitié, il rend TOUTES les offres « jamais
// confirmées » d'un coup. Un module qui lirait cette absence comme une preuve archiverait
// le suivi entier en une passe — la panne du 2026-08-12 (un balayage aveugle qui périmait
// 40 offres) multipliée par quarante. La garde de plausibilité est donc éprouvée avant
// tout le reste, et sa mutation fait tomber le fichier.
//
// ⚠️ ET CHAQUE ABSTENTION EST ÉPROUVÉE SÉPARÉMENT, par son MOTIF. Quatre gardes qui rendent
// toutes « rien à fermer » sont indiscernables d'une règle qui ne marche pas : c'est le
// motif qui distingue « je n'avais pas le droit de regarder » de « j'ai regardé, il n'y
// avait rien ».

import { describe, it, expect } from "vitest";
import {
  journalPlausible,
  seuilFermetureJours,
  fermeturesAutomatiques,
  MIN_FERMETURES_OBSERVEES,
  PART_SURVIE_RESIDUELLE,
} from "@/lib/fermetureAuto";
import { MINIMUM_GROUPE } from "@/lib/dureeVie";
import { SEUIL_ABSENCES_PEREMPTION } from "@/lib/veille";
import type { JournalVeille } from "@/lib/veille";
import type { Offre } from "@/lib/types";

const AUJOURDHUI = "2026-09-14";

function ilYA(jours: number): string {
  const [a, m, j] = AUJOURDHUI.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, j - jours)).toISOString().slice(0, 10);
}

function offre(id: string, reste: Partial<Offre> = {}): Offre {
  return {
    id,
    source: "jobbank",
    dateReperage: ilYA(60),
    entreprise: "Employeur",
    poste: "Coordonnateur de projets",
    lien: "",
    km: null,
    noc: null,
    ville: null,
    salaireAffiche: null,
    priorite: "Moyenne",
    statut: "Identifiee",
    dateEnvoi: "",
    score: null,
    scoreSource: null,
    raisons: [],
    notes: "",
    userNote: "",
    histo: false,
    perimeeLe: null,
    ...reste,
  };
}

/**
 * Un suivi où la courbe de survie CONCLUT : assez de fermetures observées, et une chute
 * sous la part résiduelle.
 *
 * Construit en dérivant le nombre de fermetures de `MIN_FERMETURES_OBSERVEES` plutôt qu'en
 * écrivant « 8 » : relever le minimum doit faire évoluer la fixture avec lui, pas rendre ce
 * fichier faux en silence.
 */
function suiviQuiConclut(): { offres: Offre[]; journal: JournalVeille } {
  const offres: Offre[] = [];
  const journal: JournalVeille = {};
  // Des offres FERMÉES, observées 5 jours chacune : la survie tombe à zéro au jour 5.
  for (let i = 0; i < MIN_FERMETURES_OBSERVEES + 2; i++) {
    const id = `fermee-${i}`;
    offres.push(offre(id, { perimeeLe: "2026-09-01T00:00:00.000Z" }));
    journal[id] = { premiereVue: ilYA(20), derniereVue: ilYA(15), absences: 3 };
  }
  // Des offres VIVANTES confirmées, pour que le journal reste majoritaire.
  //
  // ⚠️ VUES UN SEUL JOUR (durée observée nulle), ET C'EST DÉLIBÉRÉ : elles ne sont donc plus
  // « à risque » au jour 5, et n'empêchent pas la courbe d'y tomber à zéro. Observées plus
  // longtemps, elles diluent l'événement et la fixture cesse de conclure — c'est exactement
  // ce que fait le cas « la courbe ne descend jamais assez bas » juste en dessous, et les
  // deux fixtures ne se distinguent que par là.
  for (let i = 0; i < MIN_FERMETURES_OBSERVEES + 2; i++) {
    const id = `vivante-${i}`;
    offres.push(offre(id, { dateReperage: ilYA(3) }));
    journal[id] = { premiereVue: ilYA(1), derniereVue: ilYA(1), absences: 0 };
  }
  return { offres, journal };
}

describe("journalPlausible — un journal perdu n'accuse personne", () => {
  it("exige la MAJORITÉ du suivi vivant, pas une entrée", () => {
    const o = [offre("a"), offre("b"), offre("c")];
    const suivi = { premiereVue: ilYA(3), derniereVue: ilYA(1), absences: 0 };
    expect(journalPlausible(o, {})).toBe(false);
    expect(journalPlausible(o, { a: suivi })).toBe(false);
    // Deux sur trois : la majorité est franchie.
    expect(journalPlausible(o, { a: suivi, b: suivi })).toBe(true);
  });

  it("refuse l'égalité stricte — la moitié n'est pas la majorité", () => {
    const o = [offre("a"), offre("b")];
    const suivi = { premiereVue: ilYA(3), derniereVue: ilYA(1), absences: 0 };
    expect(journalPlausible(o, { a: suivi })).toBe(false);
  });

  it("ne compte que les VIVANTES : une périmée confirmée ne justifie rien", () => {
    const o = [
      offre("morte", { perimeeLe: "2026-08-01T00:00:00.000Z" }),
      offre("histo", { histo: true }),
      offre("vivante"),
    ];
    const suivi = { premiereVue: ilYA(3), derniereVue: ilYA(1), absences: 0 };
    expect(journalPlausible(o, { morte: suivi, histo: suivi })).toBe(false);
    expect(journalPlausible(o, { vivante: suivi })).toBe(true);
  });

  it("rend `false` sur un suivi vide — rien à confirmer, donc rien à conclure", () => {
    expect(journalPlausible([], {})).toBe(false);
  });
});

describe("seuilFermetureJours — la mesure, ou rien", () => {
  it("refuse de conclure sous le minimum de fermetures observées", () => {
    const offres: Offre[] = [];
    const journal: JournalVeille = {};
    for (let i = 0; i < MIN_FERMETURES_OBSERVEES - 1; i++) {
      const id = `f-${i}`;
      offres.push(offre(id, { perimeeLe: "2026-09-01T00:00:00.000Z" }));
      journal[id] = { premiereVue: ilYA(20), derniereVue: ilYA(19), absences: 3 };
    }
    expect(seuilFermetureJours(offres, journal, SEUIL_ABSENCES_PEREMPTION)).toBeNull();
  });

  it("refuse de conclure quand la courbe ne descend jamais assez bas", () => {
    // Une seule fermeture parmi un grand nombre d'offres encore ouvertes : la survie reste
    // très au-dessus de la part résiduelle, donc aucun âge n'est justifiable.
    const offres: Offre[] = [];
    const journal: JournalVeille = {};
    for (let i = 0; i < MIN_FERMETURES_OBSERVEES + 2; i++) {
      const id = `f-${i}`;
      offres.push(offre(id, { perimeeLe: "2026-09-01T00:00:00.000Z" }));
      // Toutes fermées au même jour 1, mais noyées sous 200 vivantes observées bien plus
      // longtemps : à t=1 le risque est énorme, la chute est minuscule.
      journal[id] = { premiereVue: ilYA(20), derniereVue: ilYA(19), absences: 3 };
    }
    for (let i = 0; i < 200; i++) {
      const id = `v-${i}`;
      offres.push(offre(id));
      journal[id] = { premiereVue: ilYA(40), derniereVue: ilYA(1), absences: 0 };
    }
    const s = seuilFermetureJours(offres, journal, SEUIL_ABSENCES_PEREMPTION);
    expect(s).toBeNull();
  });

  it("n'exporte pas un seuil sous le plancher qu'on lui passe", () => {
    const { offres, journal } = suiviQuiConclut();
    const s = seuilFermetureJours(offres, journal, 99);
    expect(s).toBe(99);
  });

  it("dérive son minimum de `MINIMUM_GROUPE`, il ne le réinvente pas", () => {
    expect(MIN_FERMETURES_OBSERVEES).toBe(MINIMUM_GROUPE);
    expect(PART_SURVIE_RESIDUELLE).toBeLessThan(0.5);
  });
});

describe("fermeturesAutomatiques — trois abstentions, chacune par son motif", () => {
  const base = () => {
    const { offres, journal } = suiviQuiConclut();
    // La candidate : jamais confirmée, vieille, intouchée par Marc.
    offres.push(offre("jamais-vue", { dateReperage: ilYA(60) }));
    return { offres, journal };
  };

  const appel = (p: Partial<Parameters<typeof fermeturesAutomatiques>[0]> = {}) => {
    const { offres, journal } = base();
    return fermeturesAutomatiques({
      offres,
      journal,
      aujourdhui: AUJOURDHUI,
      vues: 50,
      plancherJours: SEUIL_ABSENCES_PEREMPTION,
      ...p,
    });
  };

  it("ferme la candidate quand toutes les gardes passent", () => {
    const r = appel();
    expect(r.motifAbstention).toBeNull();
    expect(r.fermetures.map((f) => f.id)).toEqual(["jamais-vue"]);
    expect(r.fermetures[0]?.jours).toBe(60);
    expect(r.seuilJours).not.toBeNull();
  });

  it("s'abstient quand la passe n'a rien vu", () => {
    const r = appel({ vues: 0 });
    expect(r.fermetures).toEqual([]);
    expect(r.motifAbstention).toContain("aucune offre vue");
  });

  it("s'abstient quand le journal a perdu la majorité du suivi", () => {
    const r = appel({ journal: {} });
    expect(r.fermetures).toEqual([]);
    expect(r.motifAbstention).toContain("journal");
  });

  it("s'abstient quand la durée de vie n'est pas mesurable", () => {
    // Un journal majoritaire mais SANS fermeture observée : plausible, et pourtant rien à
    // conclure. C'est ce cas qui distingue les deux gardes — sans lui, on pourrait croire
    // que la plausibilité suffit.
    const offres = [
      offre("a", { dateReperage: ilYA(3) }),
      offre("b", { dateReperage: ilYA(3) }),
      offre("jamais-vue"),
    ];
    // Deux confirmées sur trois vivantes : la plausibilité PASSE. C'est ce qui rend ce cas
    // discriminant — sinon il éprouverait la garde précédente sous un autre nom.
    const journal: JournalVeille = {
      a: { premiereVue: ilYA(3), derniereVue: ilYA(1), absences: 0 },
      b: { premiereVue: ilYA(3), derniereVue: ilYA(1), absences: 0 },
    };
    const r = fermeturesAutomatiques({
      offres,
      journal,
      aujourdhui: AUJOURDHUI,
      vues: 50,
      plancherJours: SEUIL_ABSENCES_PEREMPTION,
    });
    expect(r.fermetures).toEqual([]);
    expect(r.motifAbstention).toContain("durée de vie");
  });
});

describe("fermeturesAutomatiques — ce qu'elle ne touche jamais", () => {
  const avec = (extra: Offre[]) => {
    const { offres, journal } = suiviQuiConclut();
    return fermeturesAutomatiques({
      offres: [...offres, ...extra],
      journal,
      aujourdhui: AUJOURDHUI,
      vues: 50,
      plancherJours: SEUIL_ABSENCES_PEREMPTION,
    });
  };

  it("laisse tout ce que Marc a travaillé, quel que soit l'âge", () => {
    // Trois signaux d'un GESTE. La priorité est exclue à dessein : elle a un défaut, donc
    // elle ne distingue rien — un test qui l'inclurait passerait sans rien prouver.
    const r = avec([
      offre("postulee", { statut: "CVenvoye" }),
      offre("envoyee", { dateEnvoi: "2026-08-01" }),
      offre("annotee", { userNote: "rappeler le recruteur" }),
      offre("priorisee", { priorite: "Haute" }),
    ]);
    const ids = r.fermetures.map((f) => f.id);
    expect(ids).not.toContain("postulee");
    expect(ids).not.toContain("envoyee");
    expect(ids).not.toContain("annotee");
    // Contrôle : sans geste, la priorité seule ne protège rien — sinon l'assertion ci-dessus
    // pourrait être vraie parce que RIEN ne se ferme.
    expect(ids).toContain("priorisee");
  });

  it("laisse les offres déjà périmées et les historiques", () => {
    const r = avec([
      offre("deja", { perimeeLe: "2026-08-01T00:00:00.000Z" }),
      offre("vieux-dossier", { histo: true }),
    ]);
    const ids = r.fermetures.map((f) => f.id);
    expect(ids).not.toContain("deja");
    expect(ids).not.toContain("vieux-dossier");
  });

  it("laisse une offre plus jeune que le seuil, et une date illisible", () => {
    const r = avec([
      offre("jeune", { dateReperage: ilYA(1) }),
      offre("illisible", { dateReperage: "pas-une-date" }),
    ]);
    const ids = r.fermetures.map((f) => f.id);
    expect(ids).not.toContain("jeune");
    expect(ids).not.toContain("illisible");
  });

  it("ne ferme jamais plus que ce que la passe vient de confirmer, les plus vieilles d'abord", () => {
    const { offres, journal } = suiviQuiConclut();
    const candidates = [
      offre("v10", { dateReperage: ilYA(10) }),
      offre("v90", { dateReperage: ilYA(90) }),
      offre("v40", { dateReperage: ilYA(40) }),
    ];
    const r = fermeturesAutomatiques({
      offres: [...offres, ...candidates],
      journal,
      aujourdhui: AUJOURDHUI,
      vues: 2,
      plancherJours: SEUIL_ABSENCES_PEREMPTION,
    });
    expect(r.fermetures.map((f) => f.id)).toEqual(["v90", "v40"]);
  });
});
