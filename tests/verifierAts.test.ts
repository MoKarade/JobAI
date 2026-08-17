// tests/verifierAts.test.ts — un jeton qui répond n'est pas un jeton qui a raison.
//
// CE QUE CE FICHIER PROTÈGE
// La découverte d'entreprises chez un ATS repose sur une SUPPOSITION : le jeton se devine à
// partir du nom (`jetonProbable`). Une supposition qui trouve quelque chose est
// dangereusement convaincante — mesuré le 2026-08-05, `recruitee/ace` et `recruitee/robert`
// répondent parfaitement, avec des postes à AMSTERDAM.
//
// Avant le 2026-08-17, `verifierAts` rendait `trouve: true` dès que la requête et l'analyse
// réussissaient. Elle aurait donc inscrit ces homonymes dans la veille de Marc, et leurs
// offres seraient arrivées sur une carte de Québec avec une distance fabriquée. La fonction
// n'avait aucun appelant, ce qui explique que personne ne l'ait vu : le piège dormait.

import { describe, it, expect } from "vitest";
import { verifierAts } from "@/lib/ingest/sources";
import type { Recuperateur } from "@/lib/ingest/types";

/** Un récupérateur qui rend le corps voulu, sans réseau. */
function rendant(corps: string): Recuperateur {
  return async () => corps;
}

/** Un récupérateur qui échoue, comme un jeton inexistant. */
const introuvable: Recuperateur = async () => {
  throw new Error("404");
};

/** Une réponse Greenhouse minimale : c'est le format que l'analyseur attend. */
function greenhouse(postes: { title: string; location: string }[]): string {
  return JSON.stringify({
    jobs: postes.map((p, i) => ({
      id: 1000 + i,
      title: p.title,
      absolute_url: `https://boards.greenhouse.io/x/jobs/${1000 + i}`,
      location: { name: p.location },
      updated_at: "2026-08-17T00:00:00Z",
    })),
  });
}

describe("verifierAts — le contenu doit corroborer le jeton", () => {
  it("CONFIRME quand au moins une offre est dans la région", async () => {
    const r = await verifierAts(
      "greenhouse",
      "laserax",
      "Laserax",
      rendant(greenhouse([{ title: "Chargé de projets", location: "Québec, QC" }])),
    );
    expect(r.verdict).toBe("confirme");
    if (r.verdict === "confirme") expect(r.offres).toHaveLength(1);
  });

  // ⚠️ LE CAS QUI DONNE SON NOM À CE FICHIER. Sans ce verdict, cette entreprise serait
  // inscrite dans la veille et ses postes néerlandais entreraient sur la carte de Québec.
  it("RÉFUTE un homonyme dont aucune offre n'est dans la région", async () => {
    const r = await verifierAts(
      "greenhouse",
      "ace",
      "ACE",
      rendant(
        greenhouse([
          { title: "Product Manager", location: "Amsterdam, Netherlands" },
          { title: "Backend Engineer", location: "Berlin, Germany" },
        ]),
      ),
    );
    expect(r.verdict).toBe("refute");
    // Le motif NOMME ce qui a été vu : « refusé » sans motif ne se vérifie pas, et c'est la
    // seule trace qui distinguera plus tard un homonyme d'un déménagement.
    if (r.verdict === "refute") {
      expect(r.raison).toContain("Amsterdam");
      expect(r.raison).toContain("2 offre");
    }
  });

  it("reste INDÉCIS sur une réponse vide, au lieu de conclure", async () => {
    // Une entreprise sans poste ouvert et un homonyme au repos rendent EXACTEMENT la même
    // chose. Inscrire sur cette base serait un pari ; l'appelant retentera plus tard.
    const r = await verifierAts("greenhouse", "puribec", "Puribec", rendant(greenhouse([])));
    expect(r.verdict).toBe("indecis");
  });

  it("dit ABSENT quand rien ne répond sous ce jeton", async () => {
    const r = await verifierAts("greenhouse", "nexistepas", "N'existe pas", introuvable);
    expect(r.verdict).toBe("absent");
  });

  it("rend TOUTES les offres quand il confirme, pas seulement celles de la région", async () => {
    // Le tri régional appartient à `trier()`. Le refaire ici en ferait une seconde copie,
    // et deux copies d'une même règle divergent toujours.
    const r = await verifierAts(
      "greenhouse",
      "davie",
      "Davie",
      rendant(
        greenhouse([
          { title: "Chargé de projet", location: "Lévis, QC" },
          { title: "Ingénieur", location: "Vancouver, BC" },
        ]),
      ),
    );
    expect(r.verdict).toBe("confirme");
    if (r.verdict === "confirme") expect(r.offres).toHaveLength(2);
  });
});
