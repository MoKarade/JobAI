// tests/rapportVeilleVue.test.tsx — test du composant RapportVeilleVue (« Dernière passe »).
//
// Verrou : le composant de compte rendu de la veille est rendu via `renderToStaticMarkup`
// pour vérifier le HTML produit selon les différents états du rapport (données FICTIVES).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RapportVeilleVue } from "../components/RapportVeille";
import type { RapportVeille } from "../lib/rapportVeille";

const MAINTENANT = Date.parse("2026-10-20T14:00:00.000Z");

const RAPPORT_BASE: RapportVeille = {
  jour: "2026-10-20",
  fini: "2026-10-20T12:00:00.000Z",
  declencheur: "cron-veille",
  trouvees: 0,
  nouvelles: 0,
  noteMoyenneNouvelles: null,
  noteMoyenneSuivi: null,
  meilleure: null,
  refusees: [],
  verdictsLieu: [],
  sansMotif: 0,
  perimees: 0,
  revenues: 0,
  enSursis: 0,
  suivies: 0,
  sources: [],
  fraicheur: { dernierJour: "2026-10-20", retardJours: 0 },
  lieux: { demandes: 0, juges: 0, introuvables: 0 },
  localisation: "Québec (10 km)",
  villesCompletees: 0,
  adressesAnnoncees: 0,
};

function rapport(partiel: Partial<RapportVeille> = {}): RapportVeille {
  return { ...RAPPORT_BASE, ...partiel };
}

describe("RapportVeilleVue", () => {
  it("rend un rapport calme (chiffres absents, aucune source, fraîcheur OK)", () => {
    const html = renderToStaticMarkup(
      <RapportVeilleVue
        rapport={rapport({
          nouvelles: 0,
          noteMoyenneNouvelles: null,
          noteMoyenneSuivi: null,
          meilleure: null,
          sansMotif: 0,
          sources: [],
          fraicheur: { dernierJour: "2026-10-20", retardJours: 0 },
        })}
        maintenant={MAINTENANT}
      />,
    );

    const tirets = (html.match(/<span class="rapport__valeur">—<\/span>/g) || []).length;
    expect(tirets).toBe(2);
    expect(html).toContain("aucune source interrogée");
    expect(html).not.toContain('role="status"');
    expect(html).not.toContain("SANS MOTIF");
    expect(html).not.toContain("Meilleure du lot");
  });

  it("affiche une alerte de fraîcheur rompu quand le flux n'a rien rendu", () => {
    const html = renderToStaticMarkup(
      <RapportVeilleVue
        rapport={rapport({ fraicheur: { dernierJour: null, retardJours: null } })}
        maintenant={MAINTENANT}
      />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain("rapport__fraicheur--rompu");
  });

  it("gère l'accord au singulier et au pluriel des offres SANS MOTIF", () => {
    const htmlPluriel = renderToStaticMarkup(
      <RapportVeilleVue rapport={rapport({ sansMotif: 3 })} maintenant={MAINTENANT} />,
    );
    expect(htmlPluriel).toContain("3 offres SANS MOTIF");

    const htmlSingulier = renderToStaticMarkup(
      <RapportVeilleVue rapport={rapport({ sansMotif: 1 })} maintenant={MAINTENANT} />,
    );
    expect(htmlSingulier).toContain("1 offre SANS MOTIF");
  });

  it("tronque la liste des villes à 8 et indique le reliquat", () => {
    const villes10 = Array.from({ length: 10 }, (_, i) => ({
      ville: `VilleFictive${i + 1}`,
      n: 1,
    }));

    const html = renderToStaticMarkup(
      <RapportVeilleVue
        rapport={rapport({
          refusees: [{ motif: "hors-region", n: 10, villes: villes10 }],
        })}
        maintenant={MAINTENANT}
      />,
    );

    const attendu8 = Array.from({ length: 8 }, (_, i) => `VilleFictive${i + 1} (1)`).join(" · ");
    expect(html).toContain(attendu8);
    expect(html).not.toContain("VilleFictive9");
    expect(html).not.toContain("VilleFictive10");
    expect(html).toContain("et 2 autres");
  });

  it("distingue les sources en échec des sources en succès", () => {
    const html = renderToStaticMarkup(
      <RapportVeilleVue
        rapport={rapport({
          sources: [
            { id: "guichet", ok: false, offres: 0 },
            { id: "source-fictive", ok: true, offres: 5 },
          ],
        })}
        maintenant={MAINTENANT}
      />,
    );

    expect(html).toContain("rapport__source--muette");
    expect(html).toContain("en échec");
    expect(html).toContain(">5<");
  });

  it("personnalise le titre, le déclencheur et la durée écoulée", () => {
    const htmlDefaut = renderToStaticMarkup(
      <RapportVeilleVue rapport={rapport()} maintenant={MAINTENANT} />,
    );
    expect(htmlDefaut).toContain('<h3 class="rapport__titre">Dernière passe</h3>');
    expect(htmlDefaut).toContain('aria-label="Dernière passe"');

    const htmlCustom = renderToStaticMarkup(
      <RapportVeilleVue rapport={rapport()} maintenant={MAINTENANT} titre="Autre titre" />,
    );
    expect(htmlCustom).toContain('<h3 class="rapport__titre">Autre titre</h3>');
    expect(htmlCustom).toContain('aria-label="Autre titre"');

    const htmlManuel = renderToStaticMarkup(
      <RapportVeilleVue
        rapport={rapport({ declencheur: "bouton-app" })}
        maintenant={MAINTENANT}
      />,
    );
    expect(htmlManuel).toContain("lancée à la main");

    const htmlAuto = renderToStaticMarkup(
      <RapportVeilleVue
        rapport={rapport({ declencheur: "cron-veille" })}
        maintenant={MAINTENANT}
      />,
    );
    expect(htmlAuto).toContain("automatique");

    const fini2h = new Date(MAINTENANT - 2 * 3600 * 1000).toISOString();
    const html2h = renderToStaticMarkup(
      <RapportVeilleVue rapport={rapport({ fini: fini2h })} maintenant={MAINTENANT} />,
    );
    expect(html2h).toContain("il y a 2 h");
  });
});
