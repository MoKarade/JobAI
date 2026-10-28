// Tâche : #317 — tests/listeCarte.test.tsx
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ListeCarte } from "@/components/ListeCarte";
import type { Epingle } from "@/lib/carte";

function epingle(partiel?: Partial<Epingle>): Epingle {
  const entrepriseDefaut = {
    nom: "Entreprise Fictive",
    ville: "Ville Fictive",
    km: 10,
    adresse: "Voie Fictive", // factice
    adresseSource: "osm" as const,
    bornes: {
      plusProcheM: 500,
      nom: "Réseau Fictif",
      rapide: true,
      tarif: null,
    },
    siteWeb: null,
    telephone: "+1 581-555-0123", // factice
    horaires: null,
    lecture: "Lecture fictive",
    offres: [
      {
        id: "offre-fictive-1",
        entreprise: "Entreprise Fictive",
        poste: "Poste Fictif",
        score: 75,
        km: 10,
        kmApproche: false,
        statut: "Identifiee" as const,
      },
    ],
  };

  return {
    lat: 46.81,
    lon: -71.21,
    precision: "exacte",
    ville: "Ville Fictive",
    entreprises: [entrepriseDefaut],
    ...partiel,
  };
}

describe("ListeCarte", () => {
  it("liste vide : rend le groupe de filtres avec 'Note' actif et aucun carte-liste__ville", () => {
    const html = renderToStaticMarkup(<ListeCarte epingles={[]} />);

    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Classer par"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('filtre--actif');
    expect(html).toContain(">Note<");
    expect(html).toContain(">Distance<");
    expect(html).toContain(">Nom<");
    expect(html).not.toContain("carte-liste__ville");
  });

  it("distance : '—' si km est null, et '12,5 km' si km est 12.5", () => {
    const epingleSansKm = epingle({
      entreprises: [
        {
          ...epingle().entreprises[0]!,
          km: null,
        },
      ],
    });
    const htmlSansKm = renderToStaticMarkup(<ListeCarte epingles={[epingleSansKm]} />);
    expect(htmlSansKm).toContain("—");

    const epingleAvecKm = epingle({
      entreprises: [
        {
          ...epingle().entreprises[0]!,
          km: 12.5,
        },
      ],
    });
    const htmlAvecKm = renderToStaticMarkup(<ListeCarte epingles={[epingleAvecKm]} />);
    expect(htmlAvecKm).toContain("12,5 km");
  });

  it("bornes : 'non mesuré' si bornes est null, 'aucune trouvée' si plusProcheM est null", () => {
    const epingleBornesNull = epingle({
      entreprises: [
        {
          ...epingle().entreprises[0]!,
          bornes: null,
        },
      ],
    });
    const htmlBornesNull = renderToStaticMarkup(<ListeCarte epingles={[epingleBornesNull]} />);
    expect(htmlBornesNull).toContain("non mesuré");

    const epinglePlusProcheNull = epingle({
      entreprises: [
        {
          ...epingle().entreprises[0]!,
          bornes: {
            plusProcheM: null,
            nom: null,
            rapide: null,
            tarif: null,
          },
        },
      ],
    });
    const htmlPlusProcheNull = renderToStaticMarkup(
      <ListeCarte epingles={[epinglePlusProcheNull]} />,
    );
    expect(htmlPlusProcheNull).toContain("aucune trouvée");
  });

  it("précision : contient 'position approximative' pour 'ville' et pas pour 'exacte'", () => {
    const epingleVille = epingle({ precision: "ville" });
    const htmlVille = renderToStaticMarkup(<ListeCarte epingles={[epingleVille]} />);
    expect(htmlVille).toContain("position approximative");

    const epingleExacte = epingle({ precision: "exacte" });
    const htmlExacte = renderToStaticMarkup(<ListeCarte epingles={[epingleExacte]} />);
    expect(htmlExacte).not.toContain("position approximative");
  });

  it("téléphone : rend un lien tel: pour un numéro valide, aucun carte-liste__telephone si null", () => {
    const epingleTelValide = epingle({
      entreprises: [
        {
          ...epingle().entreprises[0]!,
          telephone: "+1 581-555-0123", // factice
        },
      ],
    });
    const htmlTelValide = renderToStaticMarkup(<ListeCarte epingles={[epingleTelValide]} />);
    expect(htmlTelValide).toContain('href="tel:+15815550123"');
    expect(htmlTelValide).toContain("carte-liste__telephone");

    const epingleSansTel = epingle({
      entreprises: [
        {
          ...epingle().entreprises[0]!,
          telephone: null,
        },
      ],
    });
    const htmlSansTel = renderToStaticMarkup(<ListeCarte epingles={[epingleSansTel]} />);
    expect(htmlSansTel).not.toContain("carte-liste__telephone");
  });

  it("offre : score null affiche '–' et 'Jamais notée', score 72 affiche '72 sur 100', lien /offre/<id> et classe palier", () => {
    const epingleScoreNull = epingle({
      entreprises: [
        {
          ...epingle().entreprises[0]!,
          offres: [
            {
              id: "offre-null",
              entreprise: "Entreprise Fictive",
              poste: "Poste Inconnu",
              score: null,
              km: null,
              kmApproche: false,
              statut: "Identifiee",
            },
          ],
        },
      ],
    });
    const htmlScoreNull = renderToStaticMarkup(<ListeCarte epingles={[epingleScoreNull]} />);
    expect(htmlScoreNull).toContain('title="Jamais notée"');
    expect(htmlScoreNull).toContain("–");

    const epingleScore72 = epingle({
      entreprises: [
        {
          ...epingle().entreprises[0]!,
          offres: [
            {
              id: "offre-72",
              entreprise: "Entreprise Fictive",
              poste: "Poste Analyse",
              score: 72,
              km: 5,
              kmApproche: false,
              statut: "Identifiee",
            },
          ],
        },
      ],
    });
    const htmlScore72 = renderToStaticMarkup(<ListeCarte epingles={[epingleScore72]} />);
    expect(htmlScore72).toContain('title="72 sur 100"');
    expect(htmlScore72).toContain('href="/offre/offre-72"');
    expect(htmlScore72).toContain("carte-liste__offre--B");
  });

  it("trajet : le lien Trajet Google Maps porte target='_blank', rel='noopener noreferrer' et aria-label approprié", () => {
    const epingleTrajet = epingle({
      entreprises: [
        {
          ...epingle().entreprises[0]!,
          nom: "Entreprise Test",
        },
      ],
    });
    const html = renderToStaticMarkup(<ListeCarte epingles={[epingleTrajet]} />);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-label="Trajet vers Entreprise Test dans Google Maps"');
  });
});
