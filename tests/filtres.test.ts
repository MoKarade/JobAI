// tests/filtres.test.ts — le filtrage de la liste.
//
// Un filtre faux se remarque tard : on croit simplement qu'il n'y a rien à voir. D'où une
// couverture sur le vrai jeu de départ plutôt que sur des objets fabriqués.

import { describe, it, expect } from "vitest";
import { SEED } from "../lib/seed";
import type { EtatFiltres } from "../lib/filtres";
import {
  FILTRES_VIDES,
  PALIERS_DISTANCE_KM,
  PALIERS_NOTE,
  sansNoteCalculee,
  filtrer,
  sansDistanceMesuree,
  unFiltreEstActif,
} from "../lib/filtres";

describe("filtres", () => {
  it("sans filtre, tout passe", () => {
    expect(filtrer(SEED, FILTRES_VIDES)).toHaveLength(SEED.length);
  });

  it("« actives » masque les candidatures de 2025", () => {
    const r = filtrer(SEED, { ...FILTRES_VIDES, activesSeules: true });
    expect(r).toHaveLength(38);
    expect(r.every((o) => !o.histo)).toBe(true);
  });

  it("« historique » est exclusif : il REMPLACE la vue active", () => {
    // Le piège serait de le traiter comme un filtre additif, qui ne rendrait alors rien.
    const r = filtrer(SEED, { ...FILTRES_VIDES, historique: true });
    expect(r).toHaveLength(15);
    expect(r.every((o) => o.histo)).toBe(true);
  });

  it("« historique » l'emporte sur « actives » quand les deux sont cochés", () => {
    const r = filtrer(SEED, { ...FILTRES_VIDES, historique: true, activesSeules: true });
    expect(r).toHaveLength(15);
    expect(r.every((o) => o.histo)).toBe(true);
  });

  it("le seuil de note ne garde que ce qui l'atteint, à CHAQUE palier", () => {
    // Un SEUIL, plus une bascule : « Note 80+ » obligeait à reparcourir 193 offres dès
    // qu'on voulait descendre un peu. On éprouve les deux paliers, pas seulement le haut —
    // un filtre qui ne marcherait qu'à 80 passerait un test écrit sur 80 seul.
    for (const seuil of PALIERS_NOTE) {
      const r = filtrer(SEED, { ...FILTRES_VIDES, noteMinimale: seuil });
      expect(r.length, `palier ${seuil}`).toBeGreaterThan(0);
      expect(r.every((o) => o.score !== null && o.score >= seuil), `palier ${seuil}`).toBe(true);
    }
  });

  it("un palier BAS garde au moins ce que garde un palier HAUT", () => {
    // La monotonie du seuil : sans elle, un filtre pourrait « rater » des offres en
    // s'assouplissant, et ça ne se verrait sur aucun palier pris isolément.
    const [bas, haut] = [PALIERS_NOTE[0]!, PALIERS_NOTE[1]!];
    const idsHaut = filtrer(SEED, { ...FILTRES_VIDES, noteMinimale: haut }).map((o) => o.id);
    const idsBas = new Set(filtrer(SEED, { ...FILTRES_VIDES, noteMinimale: bas }).map((o) => o.id));
    for (const id of idsHaut) expect(idsBas.has(id), id).toBe(true);
  });

  it("une offre NON NOTÉE ne franchit aucun seuil, et se COMPTE à part", () => {
    // `null` veut dire « pas encore évaluée », pas « nulle » : la compter zéro serait un
    // jugement qu'on n'a pas porté. Elle est donc écartée — on ne peut pas affirmer qu'elle
    // vaut 80 — mais le compte le DIT, sinon la liste se vide sans explication.
    const sansNote = { ...SEED[0]!, id: "sans-note", score: null, scoreSource: null };
    const jeu = [...SEED, sansNote];
    const f = { ...FILTRES_VIDES, noteMinimale: PALIERS_NOTE[1]! };
    expect(filtrer(jeu, f).some((o) => o.id === "sans-note")).toBe(false);
    // ⚠️ LE DELTA, PAS UN ABSOLU. Le jeu de départ porte DÉJÀ des offres sans note (mesuré),
    // et un chiffre écrit en dur ici deviendrait faux à la prochaine offre ajoutée — la
    // faute d'un test qui désigne par l'index plutôt que par le prédicat.
    expect(sansNoteCalculee(jeu, f)).toBe(sansNoteCalculee(SEED, f) + 1);
    // Sans seuil, on ne compte rien : le chiffre n'aurait aucun sens.
    expect(sansNoteCalculee(jeu, FILTRES_VIDES)).toBe(0);
  });

  it("un seuil de distance exclut les distances INCONNUES", () => {
    // « montre-moi ce qui est à 25 km » est une demande de certitude, pas de tolérance :
    // une offre dont on ignore la distance ne peut pas y répondre. Ce que ça écarte est
    // compté à part (`sansDistanceMesuree`) pour ne pas passer pour une absence d'offres.
    const seuil = PALIERS_DISTANCE_KM[1]!;
    const r = filtrer(SEED, { ...FILTRES_VIDES, distanceMaxKm: seuil });
    expect(r.every((o) => o.km !== null && o.km <= seuil)).toBe(true);
    expect(r.every((o) => !o.histo)).toBe(true); // l'historique n'a pas de distance
  });

  it("chaque palier est plus large que le précédent", () => {
    // Les cas DÉRIVENT des paliers : codés « 10 » et « 25 », ils mentiraient au premier
    // ajustement de la constante.
    const tailles = PALIERS_DISTANCE_KM.map(
      (km) => filtrer(SEED, { ...FILTRES_VIDES, distanceMaxKm: km }).length,
    );
    for (let i = 1; i < tailles.length; i++) {
      expect(tailles[i]!).toBeGreaterThanOrEqual(tailles[i - 1]!);
    }
    // Non vacuité : sans ça, trois zéros passeraient le test.
    expect(tailles[tailles.length - 1]!).toBeGreaterThan(0);
  });

  it("sans seuil, aucune offre n'est écartée pour distance inconnue", () => {
    expect(sansDistanceMesuree(SEED, FILTRES_VIDES)).toBe(0);
  });

  it("compte ce qu'un seuil écarte FAUTE DE MESURE, et pas ce qui est loin", () => {
    const seuil = PALIERS_DISTANCE_KM[0]!;
    const filtres = { ...FILTRES_VIDES, distanceMaxKm: seuil };
    const attendu = SEED.filter((o) => o.perimeeLe === null && o.km === null).length;
    expect(sansDistanceMesuree(SEED, filtres)).toBe(attendu);
    // Non vacuité : le jeu de départ DOIT contenir des offres sans distance, sinon ce
    // test ne mesure rien.
    expect(attendu).toBeGreaterThan(0);
  });

  it("la recherche couvre l'entreprise, le poste, les notes et les justifications", () => {
    expect(filtrer(SEED, { ...FILTRES_VIDES, texte: "robotiq" }).length).toBeGreaterThan(0);
    expect(filtrer(SEED, { ...FILTRES_VIDES, texte: "superviseur" }).length).toBeGreaterThan(0);
    // « syndiqué » n'apparaît que dans une justification.
    expect(filtrer(SEED, { ...FILTRES_VIDES, texte: "syndiqué" }).length).toBeGreaterThan(0);
  });

  it("la recherche ignore la casse et les espaces autour", () => {
    const a = filtrer(SEED, { ...FILTRES_VIDES, texte: "Laserax" });
    const b = filtrer(SEED, { ...FILTRES_VIDES, texte: "  laserax  " });
    expect(a.map((o) => o.id)).toEqual(b.map((o) => o.id));
    expect(a.length).toBeGreaterThan(0);
  });

  it("rend une liste vide plutôt qu'une liste complète quand rien ne correspond", () => {
    // Le bug classique : une recherche sans résultat qui « retombe » sur tout.
    expect(filtrer(SEED, { ...FILTRES_VIDES, texte: "zzzzz-inexistant" })).toEqual([]);
  });

  it("combine les filtres sans en perdre un", () => {
    const r = filtrer(SEED, {
      ...FILTRES_VIDES,
      activesSeules: true,
      distanceMaxKm: PALIERS_DISTANCE_KM[1]!,
      noteMinimale: PALIERS_NOTE[1]!,
    });
    expect(
      r.every(
        (o) => !o.histo && o.km! <= PALIERS_DISTANCE_KM[1]! && o.score! >= PALIERS_NOTE[1]!,
      ),
    ).toBe(true);
  });

  it("ne modifie jamais le tableau d'entrée", () => {
    const avant = SEED.map((o) => o.id);
    filtrer(SEED, { ...FILTRES_VIDES, texte: "laserax", distanceMaxKm: PALIERS_DISTANCE_KM[0]! });
    expect(SEED.map((o) => o.id)).toEqual(avant);
  });
});

describe("offres périmées", () => {
  const perimee = { ...SEED[0]!, id: "perimee", perimeeLe: "2026-07-20T00:00:00.000Z" };
  const jeu = [...SEED, perimee];

  it("sont masquées par défaut", () => {
    // Une offre fermée n'a rien à faire dans une liste qu'on parcourt pour décider où
    // postuler.
    const r = filtrer(jeu, FILTRES_VIDES);
    expect(r.some((o) => o.id === "perimee")).toBe(false);
    expect(r).toHaveLength(SEED.length);
  });

  it("réapparaissent quand on le demande", () => {
    const r = filtrer(jeu, { ...FILTRES_VIDES, avecPerimees: true });
    expect(r.some((o) => o.id === "perimee")).toBe(true);
  });

  it("restent visibles dans la vue historique", () => {
    // L'historique sert justement à regarder ce qui est derrière soi.
    // L'offre de base est choisie par son PRÉDICAT, jamais par un index dans SEED :
    // `SEED[30]` désignait une candidature de 2025 jusqu'à ce qu'un balayage insère des
    // offres avant elle, et le test s'est mis à vérifier tout autre chose en silence.
    const histo = SEED.find((o) => o.histo);
    if (!histo) throw new Error("aucune offre historique dans SEED : le test ne teste rien");
    const histoPerimee = { ...histo, id: "histo-perimee", perimeeLe: "2026-07-20T00:00:00.000Z" };
    const r = filtrer([...SEED, histoPerimee], { ...FILTRES_VIDES, historique: true });
    expect(r.some((o) => o.id === "histo-perimee")).toBe(true);
  });
});

describe("« un filtre est-il posé ? »", () => {
  // La carte s'en sert pour décider si elle montre encore les entreprises cibles SANS
  // offre. Une réponse fausse ferait croire qu'une épingle satisfait un filtre.

  it("dit non quand rien n'est posé", () => {
    expect(unFiltreEstActif(FILTRES_VIDES)).toBe(false);
  });

  it("ne prend PAS des espaces pour une recherche", () => {
    expect(unFiltreEstActif({ ...FILTRES_VIDES, texte: "   " })).toBe(false);
    expect(unFiltreEstActif({ ...FILTRES_VIDES, texte: " laserax " })).toBe(true);
  });

  it("répond oui pour CHAQUE filtre, un par un", () => {
    // Un par un, pas « au moins un » : c'est ce qui attrape le filtre oublié dans la
    // condition. Les valeurs de test sont DÉRIVÉES du type, jamais recopiées.
    const cas: EtatFiltres[] = [
      { ...FILTRES_VIDES, texte: "laserax" },
      { ...FILTRES_VIDES, activesSeules: true },
      { ...FILTRES_VIDES, noteMinimale: PALIERS_NOTE[1]! },
      { ...FILTRES_VIDES, distanceMaxKm: PALIERS_DISTANCE_KM[0]! },
      { ...FILTRES_VIDES, historique: true },
      { ...FILTRES_VIDES, avecPerimees: true },
    ];
    for (const f of cas) expect(unFiltreEstActif(f)).toBe(true);
    // Volume prouvé : un filtre AJOUTÉ au type sans cas ici ferait tomber ce compte.
    expect(cas).toHaveLength(Object.keys(FILTRES_VIDES).length);
  });
});
