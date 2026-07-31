// tests/aFaire.test.ts — les prochaines actions.
//
// Ce module CONSEILLE. Un conseil faux coûte plus cher qu'un conseil absent : suggérer de
// postuler à un poste pourvu, ou de relancer une entreprise qu'on vient de relancer, détruit
// la confiance dans toute la liste d'un coup. D'où l'insistance sur ce qu'il ne doit PAS dire.

import { describe, it, expect } from "vitest";
import {
  DELAI_PEREMPTION_PROBABLE_JOURS,
  DELAI_RELANCE_JOURS,
  MAX_ACTIONS,
  NOTE_PRIORITAIRE,
  joursEntre,
  prochainesActions,
} from "../lib/aFaire";
import { SEUIL_SILENCE_JOURS } from "../lib/relances";
import { SEED } from "../lib/seed";
import type { Offre } from "../lib/types";

const AUJ = "2026-07-28";
const base = SEED[0]!;

function offre(champs: Partial<Offre> = {}): Offre {
  return { ...base, id: "test-offre", histo: false, perimeeLe: null, ...champs };
}

/** Une date décalée de N jours avant `AUJ`, dérivée — pas une constante recopiée. */
function ilYA(jours: number): string {
  const d = new Date(`${AUJ}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - jours);
  return d.toISOString().slice(0, 10);
}

describe("écart en jours", () => {
  it("compte les jours entre deux dates calendaires", () => {
    expect(joursEntre("2026-07-01", "2026-07-28")).toBe(27);
    expect(joursEntre("2026-07-28", "2026-07-28")).toBe(0);
  });

  it("traverse un changement d'heure sans gagner ni perdre un jour", () => {
    // Passage à l'heure normale au Québec : 2026-11-01. Un calcul en heure LOCALE
    // donnerait 30 ou 32 jours selon l'implémentation.
    expect(joursEntre("2026-10-15", "2026-11-14")).toBe(30);
  });

  it("rend 0 plutôt que NaN sur une date illisible", () => {
    // `dateEnvoi` peut être vide : un NaN se propagerait en « il y a NaN jours ».
    expect(joursEntre("", AUJ)).toBe(0);
    expect(joursEntre("pas-une-date", AUJ)).toBe(0);
  });
});

describe("ce qui déclenche une action", () => {
  it("met une entrevue en tête, toujours", () => {
    const actions = prochainesActions(
      [
        offre({ id: "a", statut: "Identifiee", score: 95, dateReperage: AUJ }),
        offre({ id: "b", statut: "Entrevue", entreprise: "Fabrique Nord" }),
      ],
      AUJ,
    );
    expect(actions[0]?.genre).toBe("entrevue");
    expect(actions[0]?.offreId).toBe("b");
  });

  it("suggère une relance passé le délai, pas avant", () => {
    const juste = prochainesActions(
      [offre({ statut: "CVenvoye", dateEnvoi: ilYA(DELAI_RELANCE_JOURS - 1) })],
      AUJ,
    );
    expect(juste).toEqual([]);

    const due = prochainesActions(
      [offre({ statut: "CVenvoye", dateEnvoi: ilYA(DELAI_RELANCE_JOURS) })],
      AUJ,
    );
    expect(due[0]?.genre).toBe("relancer");
  });

  it("suggère de postuler à une offre bien notée jamais envoyée", () => {
    const a = prochainesActions(
      [offre({ statut: "Identifiee", score: NOTE_PRIORITAIRE, dateReperage: AUJ })],
      AUJ,
    );
    expect(a[0]?.genre).toBe("postuler");

    const sous = prochainesActions(
      [offre({ statut: "Identifiee", score: NOTE_PRIORITAIRE - 1, dateReperage: AUJ })],
      AUJ,
    );
    expect(sous).toEqual([]);
  });

  it("suggère de vérifier une offre repérée depuis longtemps et jamais traitée", () => {
    const a = prochainesActions(
      [
        offre({
          statut: "Identifiee",
          score: 40,
          dateReperage: ilYA(DELAI_PEREMPTION_PROBABLE_JOURS),
        }),
      ],
      AUJ,
    );
    expect(a[0]?.genre).toBe("verifier");
  });

  it("ne suggère qu'UNE action par offre", () => {
    // Une offre bien notée ET vieille remplit deux conditions : elle ne doit pas apparaître
    // deux fois, sinon la liste se remplit d'une seule offre.
    const a = prochainesActions(
      [offre({ statut: "Identifiee", score: 95, dateReperage: ilYA(90) })],
      AUJ,
    );
    expect(a).toHaveLength(1);
  });
});

describe("ce qu'il ne doit JAMAIS suggérer", () => {
  it("rien sur une offre PÉRIMÉE, même parfaitement notée", () => {
    // C'est le cœur : suggérer de postuler à un poste pourvu est pire que ne rien suggérer.
    const a = prochainesActions(
      [offre({ statut: "Identifiee", score: 100, perimeeLe: "2026-07-01T00:00:00.000Z" })],
      AUJ,
    );
    expect(a).toEqual([]);
  });

  it("rien sur une offre de la campagne historique", () => {
    const a = prochainesActions(
      [offre({ statut: "CVenvoye", histo: true, dateEnvoi: ilYA(400) })],
      AUJ,
    );
    expect(a).toEqual([]);
  });

  it("rien sur une candidature qui a REÇU une réponse", () => {
    // Refus ou offre : dans les deux cas le recruteur a répondu, il n'y a plus rien à
    // relancer. `Relance` n'en fait PAS partie — voir le cas suivant.
    const a = prochainesActions(
      [
        offre({ id: "r", statut: "Refusee", dateEnvoi: ilYA(60) }),
        offre({ id: "o", statut: "Offre", dateEnvoi: ilYA(60) }),
      ],
      AUJ,
    );
    expect(a).toEqual([]);
  });

  it("mais une candidature DÉJÀ RELANCÉE continue d'apparaître", () => {
    // ⚠️ Ce test dit l'INVERSE de ce qu'il disait avant le 2026-07-31, et c'est une
    // décision, pas un glissement. Deux modules portaient chacun leur règle de relance :
    // `aFaire` ne surveillait que `CVenvoye`, `lib/relances.ts` incluait `Relance` en
    // expliquant pourquoi — relancer est un geste de MARC, pas une réponse du recruteur.
    // La candidature attend toujours. L'ancienne version la faisait disparaître à jamais
    // du panneau, ce que Marc a constaté directement (« pourquoi je vois pas relances »).
    // ⚠️ 20 jours, pas 60 : au-delà de `SEUIL_SILENCE_JOURS` (45) l'état devient
    // « sans-suite », dont la branche produit AUSSI `genre: "relancer"` — l'assertion
    // aurait donc été vraie sans rien prouver du cas qu'on veut couvrir. Le titre est
    // vérifié pour la même raison : c'est lui qui distingue les deux branches.
    const a = prochainesActions([offre({ id: "l", statut: "Relance", dateEnvoi: ilYA(20) })], AUJ);
    expect(a.map((x) => x.genre)).toEqual(["relancer"]);
    expect(a[0]?.titre).toContain("Relancer");
    expect(a[0]?.titre).not.toContain("Classer");
  });

  it("après un silence très long, propose de CLASSER, pas seulement de relancer", () => {
    // L'autre branche, distinguée par le titre et le motif : au-delà de
    // `SEUIL_SILENCE_JOURS`, relancer n'a plus grand sens — le silence est une réponse, et
    // le suivi doit pouvoir se refermer.
    const a = prochainesActions(
      [offre({ id: "s", statut: "CVenvoye", dateEnvoi: ilYA(SEUIL_SILENCE_JOURS + 5) })],
      AUJ,
    );
    expect(a[0]?.titre).toContain("Classer ou relancer");
    expect(a[0]?.motif).toContain("silence est une réponse");
  });

  it("pas de relance sur un CV dont la date d'envoi est inconnue", () => {
    // Sans date, « il y a 0 jour » serait une invention. On se tait.
    const a = prochainesActions([offre({ statut: "CVenvoye", dateEnvoi: "" })], AUJ);
    expect(a).toEqual([]);
  });

  it("aucune action sans offre, et aucune sur un suivi entièrement traité", () => {
    expect(prochainesActions([], AUJ)).toEqual([]);
    expect(prochainesActions([offre({ statut: "Refusee" })], AUJ)).toEqual([]);
  });
});

describe("forme de la liste", () => {
  it("plafonne le nombre d'actions", () => {
    const beaucoup = Array.from({ length: MAX_ACTIONS + 5 }, (_, i) =>
      offre({ id: `o${i}`, statut: "Identifiee", score: 90, dateReperage: AUJ }),
    );
    expect(prochainesActions(beaucoup, AUJ)).toHaveLength(MAX_ACTIONS);
  });

  it("respecte l'ordre entrevue → relance → postuler → vérifier", () => {
    const a = prochainesActions(
      [
        offre({ id: "v", statut: "Identifiee", score: 10, dateReperage: ilYA(120) }),
        offre({ id: "p", statut: "Identifiee", score: 95, dateReperage: AUJ }),
        offre({ id: "r", statut: "CVenvoye", dateEnvoi: ilYA(40) }),
        offre({ id: "e", statut: "Entrevue" }),
      ],
      AUJ,
    );
    expect(a.map((x) => x.offreId)).toEqual(["e", "r", "p", "v"]);
  });

  it("porte toujours un motif qui cite le FAIT déclencheur", () => {
    // Une suggestion sans justification n'est pas contestable, donc pas vérifiable.
    const a = prochainesActions(
      [offre({ statut: "CVenvoye", dateEnvoi: ilYA(20), entreprise: "Fabrique Nord" })],
      AUJ,
    );
    expect(a[0]?.motif).toContain("20 jours");
    expect(a[0]?.titre).toContain("Fabrique Nord");
  });

  it("désigne une offre RÉELLE, jamais un identifiant inventé", () => {
    const ids = new Set(SEED.map((o) => o.id));
    for (const a of prochainesActions(SEED, AUJ)) {
      expect(ids, `action « ${a.titre} »`).toContain(a.offreId);
    }
  });
});

describe("sur le vrai jeu de départ", () => {
  it("produit des suggestions plausibles, jamais sur une offre historique", () => {
    const actions = prochainesActions(SEED, AUJ);
    const parId = new Map(SEED.map((o) => [o.id, o]));
    for (const a of actions) {
      const o = parId.get(a.offreId);
      expect(o?.histo, `« ${a.titre} » porte sur une offre historique`).toBe(false);
      expect(o?.perimeeLe).toBeNull();
    }
  });

  it("accorde le singulier au jour près", () => {
    const a = prochainesActions(
      [offre({ statut: "Identifiee", score: 90, dateReperage: ilYA(1) })],
      AUJ,
    );
    expect(a[0]?.motif).toContain("il y a 1 jour");
    expect(a[0]?.motif).not.toContain("1 jours");
  });
});
