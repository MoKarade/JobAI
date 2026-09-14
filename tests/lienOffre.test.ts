// tests/lienOffre.test.ts — ce qu'un lien d'offre atteint vraiment.
//
// ⚠️ LES CAS SONT LES ADRESSES RÉELLES DU SUIVI, pas des exemples inventés. Elles ont été
// relevées le 2026-09-14 sur les 32 offres notées 60 et plus réputées ouvertes, et la
// répartition attendue plus bas (14 / 10 / 4 / 4) est celle qui a été COMPTÉE ce jour-là.
// Un classement écrit sur des URL plausibles aurait validé une règle qui ne rencontre
// jamais la production.
//
// ⚠️ ET LE CAS QUI DISCRIMINE EST `/jobs/1234-coordonnateur` : un mot de liste qui APPARAÎT
// dans le chemin sans en être le dernier segment. C'est lui qui sépare la règle retenue
// (« le DERNIER segment nomme-t-il une liste ? ») d'un `includes` naïf, qui enverrait
// chercher sur le web des liens parfaitement précis.

import { describe, it, expect } from "vitest";
import {
  classerLien,
  proposerRecherche,
  rechercheWeb,
  lienDeOffre,
  LIBELLE_LIEN,
  type GenreLien,
} from "@/lib/lienOffre";

/** Les liens réellement portés par le suivi, avec le genre attendu. */
const RELEVE: ReadonlyArray<readonly [string, GenreLien]> = [
  // Les 14 vraies annonces : toutes du Guichet-Emplois, toutes ingérées.
  ["https://www.jobbank.gc.ca/jobsearch/jobposting/49850218", "offre"],
  ["https://www.jobbank.gc.ca/jobsearch/jobposting/49609893", "offre"],
  ["https://www.jobbank.gc.ca/jobsearch/jobposting/50156335", "offre"],
  ["https://www.jobbank.gc.ca/jobsearch/jobposting/50078546", "offre"],
  ["https://www.jobbank.gc.ca/jobsearch/jobposting/49849390", "offre"],
  ["https://www.jobbank.gc.ca/jobsearch/jobposting/49906900", "offre"],
  ["https://www.jobbank.gc.ca/jobsearch/jobposting/50167522", "offre"],
  ["https://www.jobbank.gc.ca/jobsearch/jobposting/49955651", "offre"],
  ["https://www.jobbank.gc.ca/jobsearch/jobposting/50076678", "offre"],
  ["https://www.jobbank.gc.ca/jobsearch/jobposting/50101670", "offre"],
  ["https://www.jobbank.gc.ca/jobsearch/jobposting/50258084", "offre"],
  ["https://www.jobbank.gc.ca/jobsearch/jobposting/49422722", "offre"],
  ["https://www.jobbank.gc.ca/jobsearch/jobposting/50267691", "offre"],
  ["https://www.jobbank.gc.ca/jobsearch/jobposting/49634088", "offre"],
  // Les 10 jetons Indeed : ils ouvrent peut-être encore, on n'en sait rien.
  ["https://to.indeed.com/aamvczvxcv4y", "redirection"],
  ["https://to.indeed.com/aa97ysrqmtmt", "redirection"],
  ["https://to.indeed.com/aaqdfvt6mjcy", "redirection"],
  ["https://to.indeed.com/aa7xftrrxfwl", "redirection"],
  ["https://to.indeed.com/aatxdpb4mygh", "redirection"],
  ["https://to.indeed.com/aaf97jjqqm94", "redirection"],
  ["https://to.indeed.com/aagfnf8gvc9n", "redirection"],
  ["https://to.indeed.com/aagls9cjxkqh", "redirection"],
  ["https://to.indeed.com/aa7gmlqplqsk", "redirection"],
  ["https://to.indeed.com/aazq7jdvxtqy", "redirection"],
  // Les 4 listes d'emplois d'un employeur (Chantier Davie porte trois offres, donc le
  // même lien trois fois — c'est le suivi tel qu'il est, pas une liste dédoublonnée).
  [
    "https://www.jobillico.com/fr/employeurs/chantier-davie-canada-inc-mmxwau/voir-liste-emplois",
    "liste",
  ],
  [
    "https://www.jobillico.com/fr/employeurs/chantier-davie-canada-inc-mmxwau/voir-liste-emplois",
    "liste",
  ],
  [
    "https://www.jobillico.com/fr/employeurs/chantier-davie-canada-inc-mmxwau/voir-liste-emplois",
    "liste",
  ],
  ["https://www.jobillico.com/fr/employeurs/steris/voir-liste-emplois", "liste"],
  // Les 4 pages d'accueil (Evident Scientific porte deux offres, d'où le lien en double).
  ["https://robotiq.com", "liste"],
  ["https://emplois.ca.indeed.com", "liste"],
  ["https://emplois.ca.indeed.com", "liste"],
  ["https://www.jobillico.com", "liste"],
];

describe("classerLien — sur les adresses réelles du suivi", () => {
  for (const [url, attendu] of RELEVE) {
    it(`${url} → ${attendu}`, () => {
      expect(classerLien(url)).toBe(attendu);
    });
  }

  it("rend la répartition COMPTÉE le 2026-09-14 : 14 annonces, 10 jetons, 8 sans annonce", () => {
    // Le relevé EST le suivi : 32 liens, doublons compris. Si ce compte change, c'est que
    // quelqu'un a modifié le relevé — donc que la mesure qu'il documente n'est plus celle
    // du 2026-09-14, et l'en-tête du module doit être re-mesuré avec.
    expect(RELEVE).toHaveLength(32);
    const comptes = RELEVE.reduce<Record<string, number>>((acc, [url]) => {
      const g = classerLien(url);
      acc[g] = (acc[g] ?? 0) + 1;
      return acc;
    }, {});
    expect(comptes.offre).toBe(14);
    expect(comptes.redirection).toBe(10);
    expect(comptes.liste).toBe(8);
  });

  it("normalise le slash final et la chaîne de requête", () => {
    expect(classerLien("https://emplois.ca.indeed.com/")).toBe("liste");
    expect(
      classerLien(
        "https://www.jobillico.com/fr/employeurs/steris/voir-liste-emplois?utm_source=x",
      ),
    ).toBe("liste");
    expect(classerLien("https://www.jobbank.gc.ca/jobsearch/jobposting/49850218/")).toBe(
      "offre",
    );
  });
});

describe("classerLien — ce qui SÉPARE la règle d'un includes naïf", () => {
  it("un mot de liste qui n'est pas le dernier segment reste une annonce", () => {
    // Si la règle cherchait « /jobs » n'importe où, ces trois-là partiraient en recherche
    // web alors qu'elles désignent une annonce précise.
    expect(classerLien("https://exemple.com/jobs/1234-coordonnateur")).toBe("offre");
    expect(classerLien("https://exemple.com/emplois/coordonnateur-de-projet")).toBe("offre");
    expect(classerLien("https://exemple.com/careers/fr/89321")).toBe("offre");
  });

  it("le même mot en DERNIER segment est une liste", () => {
    expect(classerLien("https://exemple.com/jobs")).toBe("liste");
    expect(classerLien("https://exemple.com/emplois/")).toBe("liste");
    expect(classerLien("https://exemple.com/fr/carrieres")).toBe("liste");
  });

  it("un segment encodé est décodé avant d'être jugé", () => {
    expect(classerLien("https://exemple.com/carri%C3%A8res")).toBe("liste");
  });

  it("une adresse inconnue reste une annonce — le défaut est optimiste, par choix", () => {
    expect(classerLien("https://exemple.com/quelque-chose/opaque")).toBe("offre");
  });
});

describe("classerLien — ce qui ne devient jamais cliquable", () => {
  it("refuse le vide, le blanc et le non-http", () => {
    expect(classerLien("")).toBe("aucun");
    expect(classerLien("   ")).toBe("aucun");
    expect(classerLien("pas une url")).toBe("aucun");
    // Un champ de données ne doit jamais fabriquer un lien exécutable.
    expect(classerLien(`${"java"}script:alert(1)`)).toBe("aucun");
    expect(classerLien("data:text/html,<b>x</b>")).toBe("aucun");
  });
});

describe("le second chemin", () => {
  it("est proposé pour tout ce qui n'est pas une annonce, redirections comprises", () => {
    expect(proposerRecherche("offre")).toBe(false);
    expect(proposerRecherche("liste")).toBe(true);
    expect(proposerRecherche("redirection")).toBe(true);
    expect(proposerRecherche("aucun")).toBe(true);
  });

  it("cherche l'employeur entre guillemets et le poste libre", () => {
    const u = new URL(rechercheWeb("Groupe Robert", "Coordonnateur qualité"));
    expect(u.hostname).toBe("www.google.com");
    expect(u.searchParams.get("q")).toBe('"Groupe Robert" Coordonnateur qualité');
  });

  it("tient sans employeur plutôt que de chercher une paire de guillemets vides", () => {
    const u = new URL(rechercheWeb("  ", "Technicien automatisation"));
    expect(u.searchParams.get("q")).toBe("Technicien automatisation");
  });
});

describe("les libellés", () => {
  it("existent pour chaque genre, et seul « aucun » est vide", () => {
    const genres: GenreLien[] = ["offre", "liste", "redirection", "aucun"];
    for (const g of genres) {
      expect(typeof LIBELLE_LIEN[g]).toBe("string");
    }
    expect(LIBELLE_LIEN.aucun).toBe("");
    expect(LIBELLE_LIEN.offre).not.toBe("");
    expect(LIBELLE_LIEN.liste).not.toBe("");
    expect(LIBELLE_LIEN.redirection).not.toBe("");
  });

  it("ne promettent pas la même chose pour deux genres différents", () => {
    // Trois libellés identiques rendraient le classement décoratif : l'écran afficherait
    // « l'offre » sur une page d'accueil, exactement comme avant.
    const rendus = new Set([LIBELLE_LIEN.offre, LIBELLE_LIEN.liste, LIBELLE_LIEN.redirection]);
    expect(rendus.size).toBe(3);
  });
});

describe("lienDeOffre — genre et adresse issus du MÊME appel", () => {
  it("ne rend jamais un href sur un lien qu'il refuse de classer", () => {
    // La garde qui compte : si le genre et l'adresse étaient calculés séparément, l'un
    // pourrait accepter ce que l'autre refuse — et l'écran rendrait cliquable un lien
    // qu'il vient de déclarer inutilisable.
    for (const brut of ["", "   ", "pas une url", `${"java"}script:alert(1)`]) {
      const l = lienDeOffre(brut, "Robotiq", "Spécialiste");
      expect(l.genre).toBe("aucun");
      expect(l.href).toBeNull();
      expect(l.libelle).toBe("");
    }
  });

  it("accompagne une vraie annonce sans second chemin", () => {
    const l = lienDeOffre(
      "https://www.jobbank.gc.ca/jobsearch/jobposting/49850218",
      "Action-Habitation",
      "project manager",
    );
    expect(l.genre).toBe("offre");
    expect(l.href).toBe("https://www.jobbank.gc.ca/jobsearch/jobposting/49850218");
    expect(l.recherche).toBeNull();
  });

  it("donne un second chemin dès que le lien ne mène pas à l'annonce", () => {
    const accueil = lienDeOffre("https://robotiq.com", "Robotiq", "Spécialiste en solutions");
    expect(accueil.genre).toBe("liste");
    expect(accueil.href).toBe("https://robotiq.com/");
    expect(accueil.recherche).toContain("google.com/search");

    const jeton = lienDeOffre("https://to.indeed.com/aamvczvxcv4y", "Groupe Leclerc", "Chargé");
    expect(jeton.genre).toBe("redirection");
    expect(jeton.href).toBe("https://to.indeed.com/aamvczvxcv4y");
    expect(jeton.recherche).not.toBeNull();
  });

  it("propose une recherche même SANS lien — c'est là qu'elle sert le plus", () => {
    const rien = lienDeOffre("", "Chantier Davie", "Coordonnateur de projet");
    expect(rien.recherche).not.toBeNull();
    expect(new URL(rien.recherche ?? "").searchParams.get("q")).toBe(
      '"Chantier Davie" Coordonnateur de projet',
    );
  });
});
