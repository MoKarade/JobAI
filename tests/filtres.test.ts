// tests/filtres.test.ts — le filtrage de la liste.
//
// Un filtre faux se remarque tard : on croit simplement qu'il n'y a rien à voir. D'où une
// couverture sur le vrai jeu de départ plutôt que sur des objets fabriqués.

import { describe, it, expect } from "vitest";
import { SEED } from "../lib/seed";
import { FILTRES_VIDES, SEUIL_PROCHE_KM, filtrer } from "../lib/filtres";

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

  it("« note 80+ » ne garde que le palier A", () => {
    const r = filtrer(SEED, { ...FILTRES_VIDES, notees80Plus: true });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((o) => (o.score ?? 0) >= 80)).toBe(true);
    // Les offres sans note ne doivent pas se glisser dedans via un `null` traité comme 0…
    expect(r.every((o) => o.score !== null)).toBe(true);
  });

  it("« proche » exclut les distances inconnues", () => {
    // Ici, contrairement au filtre de rayon, l'inconnu est EXCLU : « montre-moi ce qui est
    // proche » est une demande de certitude, pas de tolérance.
    const r = filtrer(SEED, { ...FILTRES_VIDES, proches: true });
    expect(r.every((o) => o.km !== null && o.km <= SEUIL_PROCHE_KM)).toBe(true);
    expect(r.every((o) => !o.histo)).toBe(true); // l'historique n'a pas de distance
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
      proches: true,
      notees80Plus: true,
    });
    expect(r.every((o) => !o.histo && o.km! <= SEUIL_PROCHE_KM && o.score! >= 80)).toBe(true);
  });

  it("ne modifie jamais le tableau d'entrée", () => {
    const avant = SEED.map((o) => o.id);
    filtrer(SEED, { ...FILTRES_VIDES, texte: "laserax", proches: true });
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
