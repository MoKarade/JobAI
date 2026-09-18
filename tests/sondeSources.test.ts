// tests/sondeSources.test.ts — la sonde qui mesure ce que l'app peut joindre.
//
// Ce que ces tests protègent : qu'un rapport de sonde ne puisse pas mentir par optimisme.
// Deux confusions ont déjà coûté cher à ce projet — « 403 refusé » lu comme « injoignable »
// (le 0/180 de juillet, qui ne mesurait que le proxy), et « 200 » lu comme « exploitable »
// (SmartRecruiters répond 200 à un nom d'entreprise qui n'existe pas).

import { describe, it, expect } from "vitest";
import {
  CANDIDATS,
  extraireBlocRobots,
  PAUSE_SONDE_MS,
  PLAFOND_LECTURE_OCTETS,
  TAILLE_ECHANTILLON,
  echantillonner,
  sonder,
  verdictDe,
  type Mesure,
} from "../lib/ingest/sondeSources";

const mesure = (p: Partial<Mesure> = {}): Mesure => ({
  id: "x", nom: "X", voie: "api-publique",
  code: 200, contentType: "application/json", taille: 10,
  echantillon: "", offres: null, ms: 1, ...p,
});

describe("verdictDe — un code de succès n'est PAS un verdict", () => {
  it("DISCRIMINE 200-sans-offre de 200-avec-offres — le piège SmartRecruiters", () => {
    // C'est tout l'intérêt de la fonction : sans le compte d'offres, les deux se lisent
    // « la source marche », et l'une des deux ne rend rien.
    expect(verdictDe(mesure({ code: 200, offres: 0 }))).toBe("joignable-mais-vide");
    expect(verdictDe(mesure({ code: 200, offres: 12 }))).toBe("exploitable");
  });

  it("ne promet PAS « exploitable » quand aucun analyseur ne s'applique", () => {
    // `offres: null` = on n'a pas compté. Rendre « exploitable » ici promettrait ce qu'on
    // n'a pas vérifié — un robots.txt répond 200 et ne porte aucune offre.
    expect(verdictDe(mesure({ code: 200, offres: null }))).toBe("joignable-mais-vide");
  });

  it("SÉPARE « refusé » de « injoignable » — la confusion du 0/180", () => {
    // Un 403 PROUVE que l'hôte a été atteint ; `code: null` dit que la requête n'est jamais
    // partie. Les confondre avait produit un « 180 absent » qui ne mesurait que le proxy.
    expect(verdictDe(mesure({ code: 403 }))).toBe("refuse");
    expect(verdictDe(mesure({ code: 401 }))).toBe("refuse");
    expect(verdictDe(mesure({ code: null, erreur: "CONNECT tunnel failed" }))).toBe("injoignable");
  });

  it("distingue introuvable, quota et refus — trois causes, trois remèdes", () => {
    expect(verdictDe(mesure({ code: 404 }))).toBe("introuvable");
    expect(verdictDe(mesure({ code: 429 }))).toBe("quota");
    expect(verdictDe(mesure({ code: 500 }))).toBe("refuse");
  });
});

describe("echantillonner — voir le contenu, pas seulement le format", () => {
  it("resserre les espaces et coupe à la taille annoncée", () => {
    expect(echantillonner("  a \n\n b  ")).toBe("a b");
    expect(echantillonner("x".repeat(5_000)).length).toBe(TAILLE_ECHANTILLON);
  });

  it("rend un extrait ASSEZ GRAND pour trancher « flux valide » vs « flux utile »", () => {
    // Le RSS d'Espresso-Jobs rendait 200, du XML bien formé, 20 entrées — de blogue. Seul
    // un extrait du CONTENU le montrait. Un échantillon de dix caractères ne l'aurait pas dit.
    expect(TAILLE_ECHANTILLON).toBeGreaterThanOrEqual(200);
  });
});

// ⚠️ LE BLOC `compterOffres` A ÉTÉ RETIRÉ LE 2026-09-18 avec la fonction : elle comptait
// les offres d'un corps d'ATS en réutilisant l'analyseur de PRODUCTION, et les analyseurs
// d'ATS ont été supprimés. Ce que ce bloc défendait et qui reste vrai ailleurs : « pas pu
// compter » et « compté zéro » sont deux verdicts différents, et les confondre fait passer
// un blocage pour une source vide. Le champ `offres` existe encore pour cette raison.

describe("la liste des candidats", () => {
  it("⚠️ plus aucun candidat d'ATS — et le cas le DIT plutôt que de disparaître", () => {
    // Les six candidats d'ATS (cinq familles au témoin négatif, plus le jeton SmartRecruiters
    // constaté chez Robotiq) ont été retirés le 2026-09-18 avec la source. Ce cas remplace
    // « sonde les cinq ATS avec le TÉMOIN NÉGATIF, jamais avec 36 employeurs » : supprimé
    // sans trace, rien n'empêcherait de les remettre un jour EN SONDANT DE VRAIS JETONS —
    // c'est-à-dire en refaisant la DÉCOUVERTE que `[VEILLE-35]` avait retirée.
    expect(CANDIDATS.filter((c) => c.id.startsWith("ats:"))).toEqual([]);
    expect(CANDIDATS.filter((c) => c.id.startsWith("jeton:"))).toEqual([]);
  });

  it("porte une RÉSERVE partout où un résultat pourrait être mal lu", () => {
    // Les quatre agrégateurs : un robots.txt n'est PAS une autorisation d'ingérer, et sans
    // la réserve le rapport se lit à l'envers. (`ats:smartrecruiters` figurait ici jusqu'au
    // 2026-09-18 — son 200 sur un nom bidon était le cas d'école ; le candidat a disparu
    // avec la source, la règle non.)
    for (const id of [
      "agregateur:indeed",
      "agregateur:linkedin",
      "agregateur:jobillico",
      "agregateur:ziprecruiter",
    ]) {
      const c = CANDIDATS.find((x) => x.id === id);
      expect(c, `candidat manquant : ${id}`).toBeDefined();
      expect(c?.reserve?.length ?? 0, `réserve manquante : ${id}`).toBeGreaterThan(0);
    }
  });

  it("dit la VOIE LÉGALE de chaque candidat — c'est elle qui décide de l'usage du résultat", () => {
    for (const c of CANDIDATS) expect(c.voie, `voie manquante : ${c.id}`).toBeTruthy();
    // Les quatre agrégateurs ne sont JAMAIS étiquetés « api-publique » : aucun ne l'est.
    for (const c of CANDIDATS.filter((x) => x.id.startsWith("agregateur:"))) {
      expect(c.voie).not.toBe("api-publique");
    }
  });

  it("interroge les agrégateurs sur leur robots.txt — leur joignabilité n'apprend rien", () => {
    for (const c of CANDIDATS.filter((x) => x.id.startsWith("agregateur:"))) {
      expect(c.url, `${c.id} devrait viser robots.txt`).toMatch(/\/robots\.txt$/);
    }
  });

  it("aucune URL en double : deux fois le même hôte, c'est deux fois le coût", () => {
    const urls = CANDIDATS.map((c) => c.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("extraireBlocRobots — lire le bloc qui NOUS vise, pas le début du fichier", () => {
  // La forme réelle de ZipRecruiter, mesurée le 2026-08-19 : le bloc googlebot d'abord.
  const zip = [
    "# GOOGLEBOT",
    "User-agent: googlebot",
    "Allow: /",
    "Disallow: /unsubscribe",
    "",
    "User-agent: *",
    "Disallow: /job/",
    "Crawl-delay: 10",
  ].join("\n");

  it("DISCRIMINANT : ne rend PAS le bloc googlebot quand on demande le générique", () => {
    // C'est le défaut mesuré : les 400 premiers caractères ne montraient que googlebot,
    // et un « Allow: / » qui ne nous était pas adressé se lisait comme une permission.
    const nous = extraireBlocRobots(zip, "*");
    expect(nous).toEqual(["Disallow: /job/", "Crawl-delay: 10"]);
    expect(nous).not.toContain("Allow: /");
  });

  it("rend le bloc nommé quand on le demande explicitement", () => {
    expect(extraireBlocRobots(zip, "googlebot")).toEqual(["Allow: /", "Disallow: /unsubscribe"]);
  });

  it("retombe sur le bloc générique quand l'agent n'est pas nommé", () => {
    expect(extraireBlocRobots(zip, "JobAI")).toEqual(["Disallow: /job/", "Crawl-delay: 10"]);
  });

  it("IGNORE les commentaires — un Disallow commenté n'interdit rien", () => {
    // Le confondre avec une règle ferait renoncer à un accès parfaitement permis.
    const avecCommentaire = "User-agent: *\n# Disallow: /tout\nAllow: /\n";
    expect(extraireBlocRobots(avecCommentaire)).toEqual(["Allow: /"]);
  });

  it("groupe plusieurs User-agent consécutifs sur les MÊMES règles", () => {
    const groupe = "User-agent: a\nUser-agent: b\nDisallow: /x\n";
    expect(extraireBlocRobots(groupe, "a")).toEqual(["Disallow: /x"]);
    expect(extraireBlocRobots(groupe, "b")).toEqual(["Disallow: /x"]);
  });

  it("lit la forme du Guichet-Emplois, mesurée : permissive avec un délai", () => {
    expect(extraireBlocRobots("User-agent: *\nCrawl-delay: 5\n")).toEqual(["Crawl-delay: 5"]);
  });

  it("rend un tableau vide plutôt que d'inventer, sur un fichier sans groupe", () => {
    expect(extraireBlocRobots("")).toEqual([]);
    expect(extraireBlocRobots("<!DOCTYPE html><html>pas un robots.txt</html>")).toEqual([]);
  });
});

describe("lecture bornée — la sonde ne doit pas tuer l'app qu'elle diagnostique", () => {
  /** Une réponse dont le corps arrive en morceaux, comme un vrai flux. */
  const fluxDe = (morceaux: string[]) =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(ctrl) {
          for (const m of morceaux) ctrl.enqueue(new TextEncoder().encode(m));
          ctrl.close();
        },
      }),
      { status: 200, headers: { "content-type": "application/xml" } },
    );

  const unCandidat = [
    { id: "gros", nom: "Gros flux", url: "https://gros.test", voie: "officielle" as const, attendu: "" },
  ];

  it("DISCRIMINANT : coupe un flux énorme au plafond, et le DIT", async () => {
    // Le cas vécu : le flux du Guichet fait 134 Mo, et la première version a tout chargé
    // en mémoire dans une fonction serverless pour n'en garder que 400 caractères.
    const enorme = Array.from({ length: 40 }, () => "x".repeat(16 * 1024));
    const faux = (async () => fluxDe(enorme)) as unknown as typeof fetch;
    const [m] = await sonder(unCandidat, faux, async () => {});
    expect(m?.tronque).toBe(true);
    expect(m?.taille).toBeLessThan(enorme.join("").length);
    expect(m?.taille).toBeGreaterThanOrEqual(PLAFOND_LECTURE_OCTETS);
  });

  it("ne marque PAS tronqué un corps qui tient sous le plafond", async () => {
    // Sinon « tronqué » perdrait son sens : il doit distinguer, pas décorer.
    const faux = (async () => fluxDe(["<source><job>petit</job></source>"])) as unknown as typeof fetch;
    const [m] = await sonder(unCandidat, faux, async () => {});
    expect(m?.tronque).toBeUndefined();
    expect(m?.taille).toBe("<source><job>petit</job></source>".length);
  });

  it("garde l'échantillon exploitable malgré la coupure — c'est lui qui tranche", async () => {
    // Un flux coupé doit quand même montrer son DÉBUT : c'est ce qui distingue du XML
    // d'offres d'une page d'erreur servie en 200.
    const debut = '<?xml version="1.0"?><source><publisher>Guichet Emplois</publisher>';
    const faux = (async () =>
      fluxDe([debut, "y".repeat(600 * 1024)])) as unknown as typeof fetch;
    const [m] = await sonder(unCandidat, faux, async () => {});
    expect(m?.echantillon).toContain("Guichet Emplois");
    expect(m?.tronque).toBe(true);
  });
});

describe("sonder — un candidat qui échoue n'emporte pas les suivants", () => {
  const rep = (code: number, corps: string) =>
    new Response(corps, { status: code, headers: { "content-type": "application/json" } });

  it("DISCRIMINANT : le premier hôte mort ne fait pas taire les autres", async () => {
    // Sans le `try` par candidat, la sonde rendrait un tableau vide qu'on lirait comme
    // « rien n'est accessible » — l'inverse de ce qu'elle a mesuré.
    const candidats = [
      { id: "a", nom: "A", url: "https://a.test", voie: "api-publique" as const, attendu: "" },
      { id: "b", nom: "B", url: "https://b.test", voie: "api-publique" as const, attendu: "" },
    ];
    const faux = (async (url: string | URL | Request) => {
      if (String(url).includes("a.test")) throw new Error("CONNECT tunnel failed");
      return rep(200, "{}");
    }) as unknown as typeof fetch;

    const m = await sonder(candidats, faux, async () => {});
    expect(m.length).toBe(2);
    expect(m[0]?.code).toBeNull();
    expect(m[0]?.erreur).toContain("CONNECT");
    expect(m[1]?.code).toBe(200);
  });

  it("mesure EN SÉRIE et fait une pause entre deux appels", async () => {
    // Une salve parallèle sur quinze hôtes tiers est ce qui fait bannir un appelant.
    const ordre: string[] = [];
    const candidats = ["a", "b", "c"].map((id) => ({
      id, nom: id, url: `https://${id}.test`, voie: "api-publique" as const, attendu: "",
    }));
    const faux = (async (url: string | URL | Request) => {
      ordre.push(`appel:${String(url)}`);
      return rep(200, "{}");
    }) as unknown as typeof fetch;

    const pauses: number[] = [];
    await sonder(candidats, faux, async (ms) => { pauses.push(ms); ordre.push("pause"); });

    expect(ordre).toEqual([
      "appel:https://a.test", "pause", "appel:https://b.test", "pause", "appel:https://c.test",
    ]);
    // Une pause de moins que d'appels : on ne dort pas après le dernier.
    expect(pauses).toEqual([PAUSE_SONDE_MS, PAUSE_SONDE_MS]);
  });

  it("rapporte le code REÇU au lieu de lever — c'est toute la raison d'être de la sonde", async () => {
    const candidats = [{ id: "a", nom: "A", url: "https://a.test", voie: "officielle" as const, attendu: "" }];
    const faux = (async () => rep(403, "refus")) as unknown as typeof fetch;
    const m = await sonder(candidats, faux, async () => {});
    expect(m[0]?.code).toBe(403);
    expect(verdictDe(m[0]!)).toBe("refuse");
  });
});
