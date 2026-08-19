// tests/ingest-analyseurs.test.ts — comprendre ce qu'une source répond.
//
// ⚠️ CE QUE CES TESTS PROUVENT, ET CE QU'ILS NE PROUVENT PAS
// Ils prouvent que les analyseurs traitent correctement les formats DOCUMENTÉS de chaque
// API, y compris leurs cas dégradés. Ils ne prouvent PAS que ces APIs répondent vraiment
// ça aujourd'hui : la session qui a écrit ce code n'a aucun accès réseau (proxy fermé,
// vérifié sur cinq domaines). Les échantillons viennent de la documentation publique de
// chaque ATS, pas d'une réponse observée.
// La vérification contre le réel se fait donc en production, et c'est précisément pour ça
// que chaque source rend un compte séparé : quand une source est muette, il faut pouvoir
// dire LAQUELLE, sinon on ne débogue rien.

import { describe, it, expect } from "vitest";
import {
  analyserGreenhouse,
  analyserLever,
  analyserRecruitee,
  analyserRss,
  analyserSmartRecruiters,
  analyserWorkable,
  jourDe,
  texteSimple,
} from "../lib/ingest/analyseurs";

describe("nettoyage du texte", () => {
  it("retire les balises et les entités des descriptions d'ATS", () => {
    const html = "<p>Coordonner l&#39;équipe &amp; les <b>projets</b></p><script>x()</script>";
    expect(texteSimple(html)).toBe("Coordonner l'équipe & les projets");
  });

  it("écrase les espaces multiples que produit le retrait des balises", () => {
    expect(texteSimple("<div>  a  </div>\n<div>b</div>")).toBe("a b");
  });

  it("décode `&apos;` — MESURÉ sur le flux du Guichet, et il perdait des villes", () => {
    // ⚠️ CE N'EST PAS COSMÉTIQUE. Le flux écrit « Val-d&apos;Or ». Non décodée, l'entité
    // survit à `normaliserLieu` (« val-d&apos or ») et ne peut plus matcher aucune entrée
    // des listes de lieux : `L'Islet` et `Saint-Pierre-de-l'Île-d'Orléans`, DEUX VILLES DE
    // LA RÉGION, tombaient en « lieu inconnu ». Aucune erreur, aucune trace.
    expect(texteSimple("L&apos;Islet")).toBe("L'Islet");
    expect(texteSimple("Val-d&apos;Or")).toBe("Val-d'Or");
  });

  it("décode les entités NUMÉRIQUES, décimales comme hexadécimales", () => {
    expect(texteSimple("Qu&#233;bec")).toBe("Québec");
    expect(texteSimple("Caf&#xe9;")).toBe("Café");
  });

  it("laisse INTACTE une entité numérique hors des points de code valides", () => {
    // Un flux mal formé n'est pas une raison de perdre l'annonce entière : on rend
    // l'entité telle quelle plutôt que de lever.
    expect(texteSimple("a&#999999999;b")).toBe("a&#999999999;b");
    expect(texteSimple("a&#xD800;b")).toBe("a&#xD800;b");
  });

  it("décode `&amp;` EN DERNIER — sinon `&amp;lt;` subirait un décodage de trop", () => {
    // `&amp;lt;` est une esperluette littérale suivie de « lt; ». Décoder `&amp;` d'abord
    // en ferait un `<`, c'est-à-dire une balise fabriquée à partir de texte.
    expect(texteSimple("a &amp;lt; b")).toBe("a &lt; b");
  });
});

describe("dates", () => {
  it("ramène une date RFC-822 (RSS) au jour", () => {
    expect(jourDe("Tue, 28 Jul 2026 14:05:00 GMT")).toBe("2026-07-28");
  });

  it("ramène une date ISO au jour", () => {
    expect(jourDe("2026-07-30T18:00:00Z")).toBe("2026-07-30");
  });

  it("rend null sur une date illisible plutôt qu'une date inventée", () => {
    expect(jourDe("bientôt")).toBeNull();
    expect(jourDe("")).toBeNull();
    expect(jourDe(undefined)).toBeNull();
    expect(jourDe(42)).toBeNull();
  });
});

describe("RSS (Guichet-Emplois)", () => {
  const flux = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Résultats</title>
  <item>
    <title><![CDATA[Coordonnateur de projets - Usine Machin - Lévis (QC)]]></title>
    <link>https://www.jobbank.gc.ca/jobsearch/jobposting/12345</link>
    <description><![CDATA[<p>Coordination d&#39;équipe et suivi des <b>échéanciers</b>.</p>]]></description>
    <pubDate>Tue, 28 Jul 2026 14:05:00 GMT</pubDate>
    <guid>https://www.jobbank.gc.ca/jobsearch/jobposting/12345</guid>
  </item>
  <item>
    <title>Superviseur maintenance</title>
    <link>https://www.jobbank.gc.ca/jobsearch/jobposting/67890</link>
    <description>Sans entreprise dans le titre.</description>
    <pubDate>Mon, 27 Jul 2026 09:00:00 GMT</pubDate>
  </item>
</channel></rss>`;

  it("lit les offres, CDATA et HTML imbriqué compris", () => {
    const r = analyserRss(flux);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({
      titre: "Coordonnateur de projets",
      entreprise: "Usine Machin",
      ville: "Lévis (QC)",
      lien: "https://www.jobbank.gc.ca/jobsearch/jobposting/12345",
      publieeLe: "2026-07-28",
    });
    expect(r[0]!.description).toBe("Coordination d'équipe et suivi des échéanciers.");
  });

  it("garde le titre ENTIER quand il ne se découpe pas — mal découper est pire", () => {
    const r = analyserRss(flux);
    expect(r[1]!.titre).toBe("Superviseur maintenance");
    expect(r[1]!.entreprise).toBe("");
    expect(r[1]!.ville).toBe("");
  });

  it("écarte une entrée sans lien : on ne peut ni l'ouvrir ni la vérifier", () => {
    const sansLien = `<rss><channel><item><title>Poste</title><link></link></item></channel></rss>`;
    expect(analyserRss(sansLien)).toEqual([]);
  });

  it("rend une liste vide sur un flux vide ou non-RSS, sans lever", () => {
    expect(analyserRss("<html><body>Erreur 500</body></html>")).toEqual([]);
    expect(analyserRss("")).toEqual([]);
  });
});

describe("Greenhouse", () => {
  const corps = JSON.stringify({
    jobs: [
      {
        id: 4567,
        title: "Coordonnateur de projets",
        absolute_url: "https://boards.greenhouse.io/exemple/jobs/4567",
        location: { name: "Québec, QC" },
        updated_at: "2026-07-29T12:00:00Z",
        content: "&lt;p&gt;Gestion de projets industriels&lt;/p&gt;",
      },
      { id: 9, title: "Sans lien", location: { name: "Lévis" } },
    ],
  });

  it("lit les offres et écarte celle qui n'a pas d'URL", () => {
    const r = analyserGreenhouse(corps, "Exemple inc.");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      refSource: "4567",
      titre: "Coordonnateur de projets",
      entreprise: "Exemple inc.",
      ville: "Québec, QC",
      publieeLe: "2026-07-29",
    });
  });

  it("rend une liste vide quand le tableau attendu est absent", () => {
    expect(analyserGreenhouse(JSON.stringify({ jobs: null }), "X")).toEqual([]);
    expect(analyserGreenhouse(JSON.stringify({}), "X")).toEqual([]);
  });

  it("LÈVE sur une page HTML servie en 200 — sinon on dirait « aucun poste »", () => {
    // Le cas réel : un jeton d'entreprise erroné rend une page de connexion, pas une 404.
    // Rendre [] ici ferait passer une source cassée pour une entreprise qui n'embauche pas.
    expect(() => analyserGreenhouse("<!doctype html><html>…", "X")).toThrow(/pas du JSON/);
  });
});

describe("Lever", () => {
  const corps = JSON.stringify([
    {
      id: "abc-123",
      text: "Superviseur technique",
      hostedUrl: "https://jobs.lever.co/exemple/abc-123",
      categories: { location: "Lévis, QC", team: "Opérations" },
      descriptionPlain: "Encadrement d'une équipe technique.",
      createdAt: 1785000000000,
    },
  ]);

  it("lit un tableau racine et une date en millisecondes", () => {
    const r = analyserLever(corps, "Exemple");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      refSource: "abc-123",
      titre: "Superviseur technique",
      ville: "Lévis, QC",
      lien: "https://jobs.lever.co/exemple/abc-123",
    });
    expect(r[0]!.publieeLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rend une liste vide si la racine n'est pas un tableau", () => {
    expect(analyserLever(JSON.stringify({ postings: [] }), "X")).toEqual([]);
  });
});

describe("Recruitee", () => {
  it("compose la ville depuis city et country", () => {
    const corps = JSON.stringify({
      offers: [
        {
          id: 77,
          title: "Chargé de projets",
          careers_url: "https://exemple.recruitee.com/o/charge-de-projets",
          city: "Québec",
          country: "Canada",
          description: "<p>Coordination</p>",
          published_at: "2026-07-20T10:00:00Z",
        },
      ],
    });
    const r = analyserRecruitee(corps, "Exemple");
    expect(r[0]).toMatchObject({ ville: "Québec, Canada", publieeLe: "2026-07-20" });
  });
});

describe("Workable", () => {
  it("compose la ville depuis city et region", () => {
    const corps = JSON.stringify({
      jobs: [
        {
          shortcode: "AB12CD",
          title: "Technicien en automatisation",
          url: "https://apply.workable.com/exemple/j/AB12CD",
          location: { city: "Lévis", region: "Quebec" },
          description: "<p>Automates</p>",
          published_on: "2026-07-15",
        },
      ],
    });
    const r = analyserWorkable(corps, "Exemple");
    expect(r[0]).toMatchObject({
      refSource: "AB12CD",
      ville: "Lévis, Quebec",
      publieeLe: "2026-07-15",
    });
  });
});

describe("SmartRecruiters", () => {
  it("lit le tableau content", () => {
    const corps = JSON.stringify({
      content: [
        {
          id: "743999",
          name: "Superviseur de maintenance",
          ref: "https://jobs.smartrecruiters.com/Exemple/743999",
          location: { city: "Québec", region: "QC" },
          releasedDate: "2026-07-10T08:00:00.000Z",
        },
      ],
    });
    const r = analyserSmartRecruiters(corps, "Exemple");
    expect(r[0]).toMatchObject({
      refSource: "743999",
      titre: "Superviseur de maintenance",
      ville: "Québec, QC",
      publieeLe: "2026-07-10",
    });
  });

  it("écarte un poste sans URL exploitable plutôt que d'en fabriquer une fausse", () => {
    const corps = JSON.stringify({ content: [{ id: "", name: "Sans référence" }] });
    expect(analyserSmartRecruiters(corps, "X")).toEqual([]);
  });
});

describe("ce qu'aucun analyseur ne fait", () => {
  it("aucun n'invente de ville, de date ni de description", () => {
    // Sur une offre minimale mais valide, les champs absents restent vides — jamais
    // remplis par déduction. C'est la règle no-fake-data au point d'entrée des données.
    const corps = JSON.stringify({
      jobs: [{ id: 1, title: "Poste", absolute_url: "https://exemple.test/1" }],
    });
    const r = analyserGreenhouse(corps, "Exemple");
    expect(r[0]).toEqual({
      refSource: "1",
      titre: "Poste",
      entreprise: "Exemple",
      ville: "",
      lien: "https://exemple.test/1",
      description: "",
      publieeLe: null,
    });
  });
});
