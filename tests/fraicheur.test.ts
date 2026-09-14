// tests/fraicheur.test.ts — depuis quand personne n'a vu cette offre.
//
// ⚠️ LE CAS QUI COMPTE EST CELUI QUI NE DIT RIEN. Une offre que la veille SUIT ne reçoit
// aucun libellé d'âge, même très vieille : c'est le balayage qui décide de son sort, avec
// un mécanisme qui compte de vraies absences. Doubler son verdict par un âge fabriquerait
// un second avis sur le même fait — et le jour où les deux divergeraient, l'écran
// contredirait la base sans que rien ne le signale.
//
// ⚠️ ET LE SEUIL SE DÉRIVE DE LA CONSTANTE, jamais de sa valeur du jour. Les deux cas
// limites sont écrits `JOURS_AVANT_DOUTE - 1` et `JOURS_AVANT_DOUTE` : rajuster la patience
// de la veille déplace les deux ensemble, au lieu de rendre ce fichier faux en silence.

import { describe, it, expect } from "vitest";
import { fraicheurOffre, fraicheursDuSuivi, JOURS_AVANT_DOUTE } from "@/lib/fraicheur";
import { SEUIL_ABSENCES_PEREMPTION, type SuiviVeille } from "@/lib/veille";

const AUJOURDHUI = "2026-09-14";

/** La date civile qui tombe `jours` avant `AUJOURDHUI`. */
function ilYA(jours: number): string {
  const [a, m, j] = AUJOURDHUI.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, j - jours)).toISOString().slice(0, 10);
}

function offre(reste: Partial<Parameters<typeof fraicheurOffre>[0]> = {}) {
  return { histo: false, perimeeLe: null, dateReperage: ilYA(40), ...reste };
}

const SUIVI: SuiviVeille = {
  premiereVue: ilYA(30),
  derniereVue: ilYA(1),
  absences: 0,
};

describe("le seuil", () => {
  it("est la patience que la veille s'accorde déjà, pas un nombre choisi", () => {
    expect(JOURS_AVANT_DOUTE).toBe(SEUIL_ABSENCES_PEREMPTION);
  });

  it("se tait un jour avant, parle le jour même", () => {
    expect(
      fraicheurOffre(offre({ dateReperage: ilYA(JOURS_AVANT_DOUTE - 1) }), undefined, AUJOURDHUI),
    ).toBeNull();
    const dit = fraicheurOffre(
      offre({ dateReperage: ilYA(JOURS_AVANT_DOUTE) }),
      undefined,
      AUJOURDHUI,
    );
    expect(dit).not.toBeNull();
    expect(dit?.jours).toBe(JOURS_AVANT_DOUTE);
  });
});

describe("ce dont l'écran n'a rien à dire", () => {
  it("se tait sur une offre que la veille SUIT, même très vieille", () => {
    // Le cas central : sans cette garde, une offre vue par un balayage hier porterait quand
    // même « repérée il y a 200 jours » — un doute inventé sur une offre confirmée.
    const vieille = offre({ dateReperage: ilYA(200) });
    expect(fraicheurOffre(vieille, SUIVI, AUJOURDHUI)).toBeNull();
    // Et la MÊME offre, hors journal, parle : c'est bien le journal qui fait la différence.
    expect(fraicheurOffre(vieille, undefined, AUJOURDHUI)).not.toBeNull();
  });

  it("se tait sur une offre déjà périmée — l'écran le dit déjà", () => {
    const perimee = offre({ perimeeLe: "2026-08-01T00:00:00.000Z" });
    expect(fraicheurOffre(perimee, undefined, AUJOURDHUI)).toBeNull();
  });

  it("se tait sur une candidature historique", () => {
    expect(fraicheurOffre(offre({ histo: true }), undefined, AUJOURDHUI)).toBeNull();
  });
});

describe("ce qu'elle dit", () => {
  it("compte les jours depuis le REPÉRAGE et le dit dans le libellé", () => {
    const f = fraicheurOffre(offre({ dateReperage: "2026-07-27" }), undefined, AUJOURDHUI);
    expect(f?.jours).toBe(49);
    expect(f?.libelle).toContain("49");
    // Le libellé doit dire POURQUOI on doute, pas seulement l'âge : « repérée il y a 49
    // jours » tout seul se lit comme une info de classement, pas comme un aveu.
    expect(f?.libelle).toContain("balayage");
  });

  it("n'affirme jamais une durée négative sur une date de repérage à venir", () => {
    expect(fraicheurOffre(offre({ dateReperage: ilYA(-3) }), undefined, AUJOURDHUI)).toBeNull();
  });

  it("se tait plutôt que d'inventer sur une date illisible", () => {
    // ⚠️ MESURÉ EN ÉCRIVANT CE TEST : `joursEntre` rend NaN, pas 0 comme son garde le
    // laisse croire — et `NaN < seuil` est faux, donc le libellé SORTAIT, avec « il y a NaN
    // jours » dedans. C'est le module qui refuse maintenant, pas le seuil qui l'attrape.
    expect(fraicheurOffre(offre({ dateReperage: "pas-une-date" }), undefined, AUJOURDHUI)).toBeNull();
  });
});

describe("fraicheursDuSuivi", () => {
  // ⚠️ LA PROPORTION DE CETTE FIXTURE EST SIGNIFICATIVE, pas décorative : la carte ne se
  // remplit que si le balayage a confirmé la MAJORITÉ du suivi. Quatre offres dont trois
  // confirmées reproduisent le régime normal mesuré en production le 2026-09-14
  // (1 572 sur 1 593). Une fixture à une confirmée sur trois ferait taire la fonction, et
  // tout ce fichier passerait en testant l'abstention sans le dire.
  const offres = [
    { id: "seed-vieille", histo: false, perimeeLe: null, dateReperage: ilYA(49) },
    { id: "seed-fraiche", histo: false, perimeeLe: null, dateReperage: ilYA(1) },
    { id: "ingeree", histo: false, perimeeLe: null, dateReperage: ilYA(49) },
    { id: "ingeree2", histo: false, perimeeLe: null, dateReperage: ilYA(49) },
  ] as unknown as Parameters<typeof fraicheursDuSuivi>[0];
  const JOURNAL_NORMAL = { ingeree: SUIVI, ingeree2: SUIVI, "seed-fraiche": SUIVI };

  it("ne retient que les offres qui ont quelque chose à dire", () => {
    const carte = fraicheursDuSuivi(offres, JOURNAL_NORMAL, AUJOURDHUI);
    expect(Object.keys(carte)).toEqual(["seed-vieille"]);
    expect(carte["seed-vieille"]?.jours).toBe(49);
  });

  it("n'inscrit jamais d'entrée vide pour une offre sans rien à dire", () => {
    // Une entrée présente mais nulle se serait mise à s'afficher au premier consommateur
    // qui teste la PRÉSENCE de la clé plutôt que sa valeur.
    const carte = fraicheursDuSuivi(offres, JOURNAL_NORMAL, AUJOURDHUI);
    expect("seed-fraiche" in carte).toBe(false);
    expect("ingeree" in carte).toBe(false);
  });

  it("SE TAIT ENTIÈREMENT quand le journal a perdu la majorité du suivi", () => {
    // ⚠️ LE CAS QUI A MOTIVÉ LA GARDE. Le journal est un seul JSON dans une ligne d'état :
    // perdu, il rend TOUTES les offres « jamais revues » d'un coup, et l'écran affiche
    // « tout est à vérifier ». Ça ne dit rien des offres — ça dit que le journal est en
    // panne. Marc, lui, lit une accusation contre son suivi entier.
    expect(fraicheursDuSuivi(offres, {}, AUJOURDHUI)).toEqual({});
    expect(fraicheursDuSuivi(offres, { ingeree: SUIVI }, AUJOURDHUI)).toEqual({});
  });

  it("parle de nouveau dès que le journal redevient majoritaire — la garde n'est pas un cliquet", () => {
    // Une garde qui met des items hors circuit sans chemin de retour transforme un incident
    // transitoire en silence permanent.
    const carte = fraicheursDuSuivi(offres, JOURNAL_NORMAL, AUJOURDHUI);
    expect(Object.keys(carte)).toHaveLength(1);
  });
});
