// tests/lienTrajet.test.ts — le lien d'itinéraire Google Maps.
//
// Deux choses à verrouiller. La forme de l'URL (le format officiel `maps/dir/?api=1`,
// seul garanti par Google). Et surtout LE point garde-fou : l'ORIGINE du trajet n'est
// jamais dans le lien — le domicile de Marc n'y figure pas, c'est Google qui la propose
// côté compte. C'est ce qui a permis d'annuler la révision du garde-fou n°1.

import { describe, it, expect } from "vitest";
import { lienTrajetGoogleMaps } from "../lib/lienTrajet";
import { ENTREPRISES_CIBLES } from "../lib/reference";
import { SEED } from "../lib/seed";

describe("forme du lien", () => {
  it("utilise le format d'URL officiel de Google Maps", () => {
    const url = lienTrajetGoogleMaps("Chantier Davie")!;
    expect(url.startsWith("https://www.google.com/maps/dir/?")).toBe(true);
    expect(url).toContain("api=1");
    expect(url).toContain("travelmode=driving");
  });

  it("joint la ville de l'entreprise cible à la destination", () => {
    const url = lienTrajetGoogleMaps("Chantier Davie")!;
    const destination = new URL(url).searchParams.get("destination");
    expect(destination).toBe("Chantier Davie, Lévis, QC");
  });

  it("nettoie un libellé de ville à parenthèse", () => {
    // « Québec (Archibald) » est un repère de lecture, pas une adresse : dans une
    // recherche Google, la parenthèse dégrade la résolution au lieu de l'aider.
    const url = lienTrajetGoogleMaps("Labatt")!;
    expect(new URL(url).searchParams.get("destination")).toBe("Labatt, Québec, QC");
  });

  it("retombe sur « nom, QC » pour un employeur hors des cibles", () => {
    const url = lienTrajetGoogleMaps("Employeur Jamais Vu")!;
    expect(new URL(url).searchParams.get("destination")).toBe("Employeur Jamais Vu, QC");
  });

  it("encode les accents et la ponctuation", () => {
    const url = lienTrajetGoogleMaps("Chantier Davie")!;
    // L'URL brute ne doit porter ni espace ni accent nu : c'est `URL`/`URLSearchParams`
    // qui fait foi au décodage, et le lien doit survivre à un copier-coller.
    expect(url).not.toContain(" ");
    expect(url).not.toContain("é");
  });

  it("rend null sans nom exploitable, jamais un lien vers « , QC »", () => {
    expect(lienTrajetGoogleMaps("")).toBeNull();
    expect(lienTrajetGoogleMaps("   ")).toBeNull();
  });
});

describe("garde-fou n°1 — l'origine n'est JAMAIS dans le lien", () => {
  it("ne transmet aucun paramètre d'origine", () => {
    // C'est LE test qui a permis de garder le garde-fou strict : la destination part dans
    // l'URL, l'origine est proposée par Google côté compte de Marc. Si quelqu'un ajoute un
    // jour `origin=` « pour aider », le domicile partirait dans une URL — historique de
    // navigation, presse-papiers, journaux de proxy. Ce test le refuse.
    for (const entreprise of ["Chantier Davie", "Labatt", "Employeur Jamais Vu"]) {
      const url = lienTrajetGoogleMaps(entreprise)!;
      const params = [...new URL(url).searchParams.keys()];
      expect(params, url).toEqual(["api", "destination", "travelmode"]);
      expect(url.toLowerCase()).not.toContain("origin");
    }
  });

  it("ne contient jamais une coordonnée, même quand l'environnement en porte", () => {
    // La fonction est PURE : elle ne lit pas process.env. On le prouve sur sa sortie —
    // aucun couple de coordonnées de la région ne peut apparaître dans le lien.
    const url = lienTrajetGoogleMaps("Chantier Davie")!;
    expect(url).not.toMatch(/4[5-9]\.\d+/);
    expect(url).not.toMatch(/-7[0-5]\.\d+/);
  });
});

describe("sur le vrai jeu de départ", () => {
  it("produit un lien pour CHAQUE offre active, toujours avec une ville", () => {
    // Les employeurs actifs sont tous dans les entreprises cibles (verrouillé par
    // tests/reference.test.ts) : leurs liens doivent donc tous porter une ville.
    for (const o of SEED.filter((x) => !x.histo)) {
      const url = lienTrajetGoogleMaps(o.entreprise, ENTREPRISES_CIBLES);
      expect(url, o.entreprise).not.toBeNull();
      const destination = new URL(url!).searchParams.get("destination")!;
      expect(destination.split(",").length, `${o.entreprise} → ${destination}`).toBe(3);
    }
  });
});
