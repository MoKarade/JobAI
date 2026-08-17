// tests/decouverteAts.test.ts — la découverte doit CONVERGER, et ne jamais affamer.
//
// Ce module décide ce qu'on tente chaque jour pour remplir `veille-ats`, la liste vide qui
// explique le `sources=1` de toutes les traces de passe. Deux façons de rater ça, toutes
// deux déjà vécues ailleurs dans ce dépôt :
//
//   · ne jamais s'éteindre — retenter éternellement une entreprise qu'aucun ATS ne connaît ;
//   · s'éteindre trop tôt — abandonner une entreprise réelle parce qu'elle n'embauchait pas
//     le jour où on a regardé.
//
// Les bornes sont DÉRIVÉES des constantes, jamais de leur valeur du jour : le jour où un
// délai changera, ces tests suivront au lieu de mentir.

import { describe, it, expect } from "vitest";
import {
  planifierDecouverte,
  appliquerVerdict,
  DELAIS_RETENTE_JOURS,
  MAX_ESSAIS_PAR_PASSE,
  MAX_ESSAIS_PAR_FAMILLE,
  type EssaiAts,
} from "@/lib/ingest/decouverteAts";

const FAMILLES = ["greenhouse", "lever", "recruitee", "workable", "smartrecruiters"] as const;

const JOUR = "2026-08-17";

/** Une date décalée de N jours avant le jour de référence. */
function ilYA(jours: number): string {
  return new Date(Date.parse(`${JOUR}T00:00:00Z`) - jours * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

describe("planifierDecouverte — ce qu'on tente aujourd'hui", () => {
  it("propose les entreprises jamais essayées", () => {
    const p = planifierDecouverte(["Laserax"], ["greenhouse", "lever"], [], [], JOUR);
    expect(p).toHaveLength(2);
    expect(p.map((e) => e.famille)).toEqual(["greenhouse", "lever"]);
  });

  it("ne retente jamais une entreprise déjà résolue", () => {
    const p = planifierDecouverte(["Laserax"], ["greenhouse"], [], ["laserax"], JOUR);
    expect(p).toEqual([]);
  });

  it("respecte le plafond par passe quand les hôtes sont assez nombreux", () => {
    const noms = Array.from({ length: 50 }, (_, i) => `Entreprise ${i}`);
    const p = planifierDecouverte(noms, FAMILLES, [], [], JOUR);
    expect(p).toHaveLength(MAX_ESSAIS_PAR_PASSE);
  });

  // ⚠️ LE TEST QUI TIENT LA BORNE DE TEMPS. Le coût se paie par HÔTE : cinq familles
  // s'interrogent en parallèle, mais on reste en série chez chacune. Si tout le travail en
  // attente tombait sur une seule famille, douze essais feraient 96 s en série contre un mur
  // de 60 s — la passe entière mourrait sans écrire son état. Le plafond par famille rend
  // cette borne STRUCTURELLE au lieu d'accidentelle.
  it("ne dépasse JAMAIS le plafond par famille, même si tout le travail est sur un seul hôte", () => {
    const noms = Array.from({ length: 50 }, (_, i) => `Entreprise ${i}`);
    const p = planifierDecouverte(noms, ["greenhouse"], [], [], JOUR);
    expect(p).toHaveLength(MAX_ESSAIS_PAR_FAMILLE);
    expect(p.every((e) => e.famille === "greenhouse")).toBe(true);
  });

  it("répartit entre les hôtes plutôt que d'en saturer un", () => {
    const noms = Array.from({ length: 50 }, (_, i) => `Entreprise ${i}`);
    const p = planifierDecouverte(noms, FAMILLES, [], [], JOUR);
    for (const f of FAMILLES) {
      expect(p.filter((e) => e.famille === f).length).toBeLessThanOrEqual(MAX_ESSAIS_PAR_FAMILLE);
    }
  });

  // Le produit des deux plafonds est ce qui borne vraiment : monter l'un sans l'autre
  // n'ajoute aucun essai.
  it("le plafond par passe reste atteignable avec les familles réelles", () => {
    expect(FAMILLES.length * MAX_ESSAIS_PAR_FAMILLE).toBeGreaterThanOrEqual(MAX_ESSAIS_PAR_PASSE);
  });

  // ⚠️ LA CONVERGENCE. Un `indecis` doit revenir vite — l'entreprise existe peut-être et
  // n'avait simplement aucun poste ouvert ce jour-là.
  it("retente un INDÉCIS une fois son délai écoulé, pas avant", () => {
    const base = (jours: number): EssaiAts[] => [
      { entreprise: "Puribec", famille: "greenhouse", verdict: "indecis", le: ilYA(jours) },
    ];
    const trop = DELAIS_RETENTE_JOURS.indecis - 1;
    const assez = DELAIS_RETENTE_JOURS.indecis;
    expect(planifierDecouverte(["Puribec"], ["greenhouse"], base(trop), [], JOUR)).toEqual([]);
    expect(planifierDecouverte(["Puribec"], ["greenhouse"], base(assez), [], JOUR)).toHaveLength(1);
  });

  // ⚠️ L'EXTINCTION. Un homonyme ne devient pas la bonne entreprise en trois jours.
  it("laisse un RÉFUTÉ tranquille bien plus longtemps qu'un indécis", () => {
    const essais: EssaiAts[] = [
      { entreprise: "ACE", famille: "recruitee", verdict: "refute", le: ilYA(DELAIS_RETENTE_JOURS.indecis + 1) },
    ];
    expect(planifierDecouverte(["ACE"], ["recruitee"], essais, [], JOUR)).toEqual([]);
    expect(DELAIS_RETENTE_JOURS.refute).toBeGreaterThan(DELAIS_RETENTE_JOURS.absent);
    expect(DELAIS_RETENTE_JOURS.absent).toBeGreaterThan(DELAIS_RETENTE_JOURS.indecis);
  });

  // ⚠️ L'ANTI-FAMINE. Sans cette priorité, quelques indécis qui reviennent tous les trois
  // jours mangeraient tout le budget et le reste de la liste ne serait jamais exploré.
  it("sert les JAMAIS ESSAYÉES avant les retentes", () => {
    const essais: EssaiAts[] = Array.from({ length: 10 }, (_, i) => ({
      entreprise: `Vieille ${i}`,
      famille: "greenhouse" as const,
      verdict: "indecis" as const,
      le: ilYA(DELAIS_RETENTE_JOURS.indecis + 5),
    }));
    const noms = [...essais.map((e) => e.entreprise), "Toute Neuve"];
    const p = planifierDecouverte(noms, ["greenhouse"], essais, [], JOUR);
    expect(p[0]?.entreprise).toBe("Toute Neuve");
  });

  it("sert la retente la PLUS ANCIENNE en premier", () => {
    const essais: EssaiAts[] = [
      { entreprise: "Récente", famille: "greenhouse", verdict: "indecis", le: ilYA(DELAIS_RETENTE_JOURS.indecis) },
      { entreprise: "Ancienne", famille: "greenhouse", verdict: "indecis", le: ilYA(DELAIS_RETENTE_JOURS.indecis + 20) },
    ];
    const p = planifierDecouverte(["Récente", "Ancienne"], ["greenhouse"], essais, [], JOUR, 1);
    expect(p[0]?.entreprise).toBe("Ancienne");
  });

  it("ne propose rien plutôt que de planter sur une date illisible", () => {
    const essais: EssaiAts[] = [
      { entreprise: "X", famille: "greenhouse", verdict: "absent", le: "pas-une-date" },
    ];
    // Date illisible : on ne sait pas quand ça a été tenté, donc on retente — jamais un
    // blocage définitif né d'une donnée corrompue.
    expect(() => planifierDecouverte(["X"], ["greenhouse"], essais, [], JOUR)).not.toThrow();
    expect(planifierDecouverte(["X"], ["greenhouse"], essais, [], JOUR)).toHaveLength(1);
  });
});

describe("appliquerVerdict — ce qu'on retient", () => {
  it("mémorise un échec avec son motif", () => {
    const apres = appliquerVerdict([], "ACE", "recruitee", "refute", JOUR, "postes à Amsterdam");
    expect(apres).toHaveLength(1);
    expect(apres[0]?.raison).toContain("Amsterdam");
  });

  it("REMPLACE l'essai précédent au lieu de l'empiler", () => {
    const avant: EssaiAts[] = [
      { entreprise: "Puribec", famille: "greenhouse", verdict: "indecis", le: ilYA(10) },
    ];
    const apres = appliquerVerdict(avant, "Puribec", "greenhouse", "absent", JOUR);
    expect(apres).toHaveLength(1);
    expect(apres[0]?.verdict).toBe("absent");
    expect(apres[0]?.le).toBe(JOUR);
  });

  // ⚠️ Une entreprise confirmée passe dans `veille-ats`. La laisser AUSSI dans la mémoire
  // des échecs ferait diverger les deux listes au premier oubli.
  it("RETIRE l'entrée quand l'essai confirme", () => {
    const avant: EssaiAts[] = [
      { entreprise: "Laserax", famille: "greenhouse", verdict: "indecis", le: ilYA(5) },
    ];
    expect(appliquerVerdict(avant, "Laserax", "greenhouse", "confirme", JOUR)).toEqual([]);
  });

  it("ne touche pas aux essais des autres familles", () => {
    const avant: EssaiAts[] = [
      { entreprise: "Laserax", famille: "lever", verdict: "absent", le: ilYA(5) },
    ];
    const apres = appliquerVerdict(avant, "Laserax", "greenhouse", "absent", JOUR);
    expect(apres).toHaveLength(2);
  });
});
