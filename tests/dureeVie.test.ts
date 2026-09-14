// tests/dureeVie.test.ts — la durée de vie observée des offres.
//
// ⚠️ LE TEST QUI COMPTE EST CELUI DE LA CENSURE. Deux méthodes naïves existent pour estimer
// une durée de vie quand une partie des offres est encore ouverte : jeter ces offres-là, ou
// les traiter comme si elles avaient fermé. Les deux donnent un chiffre qui a l'air d'une
// médiane, et les deux sont fausses — la première parce que les offres qui durent sont
// justement celles qu'on écarte, la seconde parce qu'elle raccourcit une vie qui continue.
// Le cas central ci-dessous est construit pour que les DEUX naïves donnent 10 jours et que
// l'estimateur juste donne 15 : un module qui glisserait vers l'une ou l'autre le fait
// tomber, au lieu de publier un chiffre plausible.

import { describe, it, expect } from "vitest";
import {
  joursEntre,
  observer,
  survie,
  survieParGroupe,
  rapportDureeVie,
  MINIMUM_GROUPE,
  type Observation,
} from "@/lib/dureeVie";
import type { Offre } from "@/lib/types";
import type { JournalVeille } from "@/lib/veille";

function obs(jours: number, fermee: boolean, reste: Partial<Observation> = {}): Observation {
  return {
    id: `o-${jours}-${fermee}-${reste.entreprise ?? ""}`,
    entreprise: "Employeur",
    poste: "Coordonnateur de projets",
    categorie: "coordination",
    premiereVue: "2026-09-01",
    derniereVue: "2026-09-01",
    jours,
    fermee,
    ...reste,
  };
}

function offre(id: string, reste: Partial<Offre> = {}): Offre {
  return {
    id,
    source: "jobbank",
    dateReperage: "2026-09-01",
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

describe("joursEntre", () => {
  it("compte des jours civils, y compris par-dessus un mois et une année", () => {
    expect(joursEntre("2026-09-01", "2026-09-01")).toBe(0);
    expect(joursEntre("2026-09-01", "2026-09-15")).toBe(14);
    expect(joursEntre("2026-08-28", "2026-09-03")).toBe(6);
    expect(joursEntre("2025-12-30", "2026-01-02")).toBe(3);
  });

  it("ne dépend d'aucun fuseau — c'est une différence de dates, pas d'instants", () => {
    // Le serveur tourne en UTC, Marc vit à UTC−4. Un calcul qui passerait par
    // `new Date(chaîne)` puis par des composants locaux rendrait 13 ou 15 selon l'heure.
    expect(joursEntre("2026-03-08", "2026-03-22")).toBe(14); // passage à l'heure d'été
    expect(joursEntre("2026-11-01", "2026-11-15")).toBe(14); // retour à l'heure normale
  });
});

describe("observer", () => {
  const journal: JournalVeille = {
    vue: { premiereVue: "2026-09-01", derniereVue: "2026-09-11", absences: 0 },
    fermee: { premiereVue: "2026-08-20", derniereVue: "2026-09-02", absences: 5 },
    ancienne: { premiereVue: "2025-05-01", derniereVue: "2025-05-10", absences: 0 },
  };

  it("mesure la fenêtre entre première et dernière vue, pas jusqu'à aujourd'hui", () => {
    const { observations } = observer([offre("vue")], journal);
    expect(observations).toHaveLength(1);
    expect(observations[0]?.jours).toBe(10);
    expect(observations[0]?.fermee).toBe(false);
  });

  it("une offre périmée est FERMÉE, et sa durée s'arrête à la dernière vue", () => {
    // ⚠️ PAS jusqu'à `perimeeLe` : le constat de péremption arrive plusieurs jours APRÈS la
    // dernière observation (le seuil d'absences). Compter jusque-là ajouterait ce délai à
    // chaque durée — tout le monde surestimé du même nombre de jours, en silence.
    const { observations } = observer(
      [offre("fermee", { perimeeLe: "2026-09-07T00:00:00.000Z" })],
      journal,
    );
    expect(observations[0]?.fermee).toBe(true);
    expect(observations[0]?.jours).toBe(13); // 20 août → 2 septembre
  });

  it("écarte ce que la veille n'a jamais vu, et le COMPTE", () => {
    // Une offre saisie à la main n'a pas de dernière vue : lui inventer une durée serait
    // exactement le « chiffre plausible » que le garde-fou n°3 interdit.
    const { observations, horsVeille } = observer(
      [offre("vue"), offre("saisie-a-la-main"), offre("autre-saisie")],
      journal,
    );
    expect(observations.map((o) => o.id)).toEqual(["vue"]);
    expect(horsVeille).toBe(2);
  });

  it("ignore les offres historiques, qu'aucun balayage ne concerne", () => {
    const { observations, horsVeille } = observer(
      [offre("ancienne", { histo: true })],
      journal,
    );
    expect(observations).toHaveLength(0);
    // Elle n'est pas « hors veille » : elle est hors SUJET. La compter gonflerait un
    // avertissement d'écran avec des lignes de 2025 qui n'ont jamais eu vocation à être vues.
    expect(horsVeille).toBe(0);
  });
});

describe("survie (Kaplan-Meier)", () => {
  /**
   * Le cas central, calculé à la main.
   *
   * 5 observations : fermées à 5, 10 et 15 jours ; encore ouvertes à 5 et 12 jours.
   *   t=5  : 5 à risque, 1 ferme → 1 × (1 − 1/5) = 0,80
   *   t=10 : 3 à risque (10, 12, 15), 1 ferme → 0,80 × (1 − 1/3) = 0,533
   *   t=15 : 1 à risque, 1 ferme → 0,533 × 0 = 0
   * La courbe passe sous 0,5 à t=15 : c'est la médiane.
   */
  const cas: Observation[] = [
    obs(5, true),
    obs(5, false),
    obs(10, true),
    obs(12, false),
    obs(15, true),
  ];

  it("rend la courbe et la médiane calculées à la main", () => {
    const s = survie(cas);
    expect(s.total).toBe(5);
    expect(s.fermees).toBe(3);
    expect(s.courbe.map((p) => p.jours)).toEqual([5, 10, 15]);
    expect(s.courbe[0]?.part).toBeCloseTo(0.8, 5);
    expect(s.courbe[1]?.part).toBeCloseTo(0.5333, 4);
    expect(s.courbe[2]?.part).toBeCloseTo(0, 5);
    expect(s.medianeJours).toBe(15);
  });

  it("DISCRIMINE contre les deux méthodes naïves — c'est tout l'objet du module", () => {
    const juste = survie(cas).medianeJours;

    // Naïve n°1 : jeter les offres encore ouvertes. Reste 5, 10, 15 → médiane 10.
    const enJetant = survie(cas.filter((o) => o.fermee)).medianeJours;
    // Naïve n°2 : traiter les ouvertes comme fermées. 5, 5, 10, 12, 15 → médiane 10.
    const enFermantTout = survie(cas.map((o) => ({ ...o, fermee: true }))).medianeJours;

    expect(enJetant).toBe(10);
    expect(enFermantTout).toBe(10);
    // Le juste diffère des deux : un glissement vers l'une ou l'autre fait tomber ce test.
    expect(juste).toBe(15);
  });

  it("rend `null` quand plus de la moitié des offres est encore en ligne", () => {
    // Ce n'est pas « zéro » ni « on ne sait pas » : la moitié tient encore, et c'est une
    // information. Un module qui rendrait 0 ferait écrire « médiane : 0 jour » à l'écran.
    const s = survie([obs(3, true), obs(20, false), obs(25, false), obs(30, false)]);
    expect(s.medianeJours).toBeNull();
    expect(s.total).toBe(4);
    expect(s.fermees).toBe(1);
  });

  it("une offre encore ouverte ne fait jamais descendre la courbe", () => {
    const s = survie([obs(4, false), obs(9, false)]);
    expect(s.courbe).toEqual([]);
    expect(s.medianeJours).toBeNull();
  });

  it("sans observation, ne rend aucun chiffre", () => {
    expect(survie([])).toEqual({ courbe: [], medianeJours: null, total: 0, fermees: 0 });
  });

  it("plusieurs fermetures le même jour comptent ensemble", () => {
    // Deux offres qui ferment à 6 jours : un seul palier, qui descend de 2/4 d'un coup.
    const s = survie([obs(6, true, { id: "a" }), obs(6, true, { id: "b" }), obs(9, false), obs(11, false)]);
    expect(s.courbe).toHaveLength(1);
    expect(s.courbe[0]?.part).toBeCloseTo(0.5, 5);
    expect(s.medianeJours).toBe(6);
  });
});

describe("survieParGroupe", () => {
  const assez = (nom: string, n: number, jours: number) =>
    Array.from({ length: n }, (_, i) => obs(jours, true, { id: `${nom}-${i}`, entreprise: nom }));

  it("écarte les groupes trop maigres et les COMPTE", () => {
    // ⚠️ Une médiane sur trois offres a la forme d'un chiffre et ne vaut rien : deux offres
    // de plus la déplacent de moitié. Et un tableau court sans avertissement se lit comme un
    // marché calme au lieu d'un échantillon insuffisant.
    const { groupes, ecartes } = survieParGroupe(
      [...assez("Gros", MINIMUM_GROUPE, 12), ...assez("Petit", MINIMUM_GROUPE - 1, 3)],
      (o) => o.entreprise,
      MINIMUM_GROUPE,
    );
    expect(groupes.map((g) => g.nom)).toEqual(["Gros"]);
    expect(ecartes).toBe(1);
  });

  it("classe les plus courtes d'abord, et les indécidables en dernier", () => {
    // L'urgence intéresse : où faut-il postuler vite. Un groupe sans médiane ne dit pas
    // « zéro jour », il dit « plus de la moitié tient encore » — il ne peut donc pas être
    // trié avec les autres, et se met à la fin.
    const ouvertes = Array.from({ length: MINIMUM_GROUPE }, (_, i) =>
      obs(30, false, { id: `jeune-${i}`, entreprise: "Jeune" }),
    );
    const { groupes } = survieParGroupe(
      [...assez("Lente", MINIMUM_GROUPE, 25), ...assez("Rapide", MINIMUM_GROUPE, 4), ...ouvertes],
      (o) => o.entreprise,
      MINIMUM_GROUPE,
    );
    expect(groupes.map((g) => g.nom)).toEqual(["Rapide", "Lente", "Jeune"]);
    expect(groupes[2]?.medianeJours).toBeNull();
  });
});

describe("rapportDureeVie", () => {
  it("assemble les trois axes et remonte ce qui est hors mesure", () => {
    const journal: JournalVeille = {};
    const offres: Offre[] = [];
    for (let i = 0; i < MINIMUM_GROUPE; i++) {
      const id = `off-${i}`;
      journal[id] = { premiereVue: "2026-09-01", derniereVue: "2026-09-09", absences: 0 };
      offres.push(offre(id, { perimeeLe: "2026-09-14T00:00:00.000Z" }));
    }
    offres.push(offre("jamais-vue"));

    const r = rapportDureeVie(offres, journal);
    expect(r.ensemble.total).toBe(MINIMUM_GROUPE);
    expect(r.ensemble.medianeJours).toBe(8);
    expect(r.horsVeille).toBe(1);
    expect(r.parEmployeur.map((g) => g.nom)).toEqual(["Employeur"]);
    expect(r.parCategorie).toHaveLength(1);
  });
});
