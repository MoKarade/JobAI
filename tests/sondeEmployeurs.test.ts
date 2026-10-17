// tests/sondeEmployeurs.test.ts — la sonde des sources ouvertes sur les employeurs (JobAI#160).
//
// Aucune requête réelle : un faux `fetch` sert un vrai ZIP fabriqué ici (deflate brut, répertoire
// central, en-tête local) en honorant les plages d'octets, comme le fait le registre. Les noms sont
// fictifs : le dépôt est public.

import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import {
  debutDonnees,
  lireFinZip,
  lireLigneNom,
  lireRena,
  mesurerBase,
  lireRepertoireZip,
  mesurerRena,
  mesurerReq,
  mesurerSalaires,
  populationDe,
  pourcent,
  sonderEmployeurs,
  type Fetch,
} from "@/lib/ingest/sondeEmployeurs";
import { clesDeRecherche } from "@/lib/registre";
import type { Offre } from "@/lib/types";

function offre(id: string, entreprise: string, reste: Partial<Offre> = {}): Offre {
  return {
    id,
    source: "jobbank",
    dateReperage: "2026-09-01",
    entreprise,
    poste: "Agent",
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

// ── Un vrai ZIP, fabriqué à la main ─────────────────────────────────────────

function le32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}
function le16(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}

function fabriquerZip(entrees: { nom: string; contenu: string }[], extraLocal = 0): Buffer {
  const parties: Buffer[] = [];
  const repertoire: Buffer[] = [];
  let decalage = 0;
  for (const e of entrees) {
    const brut = Buffer.from(e.contenu, "utf8");
    const comp = deflateRawSync(brut);
    const nom = Buffer.from(e.nom, "utf8");
    const local = Buffer.concat([
      le32(0x04034b50), le16(20), le16(0), le16(8), le16(0), le16(0), le32(0),
      le32(comp.length), le32(brut.length), le16(nom.length), le16(extraLocal),
      nom, Buffer.alloc(extraLocal), comp,
    ]);
    repertoire.push(
      Buffer.concat([
        le32(0x02014b50), le16(20), le16(20), le16(0), le16(8), le16(0), le16(0), le32(0),
        le32(comp.length), le32(brut.length), le16(nom.length), le16(0), le16(0),
        le16(0), le16(0), le32(0), le32(decalage), nom,
      ]),
    );
    parties.push(local);
    decalage += local.length;
  }
  const cd = Buffer.concat(repertoire);
  const fin = Buffer.concat([
    le32(0x06054b50), le16(0), le16(0), le16(entrees.length), le16(entrees.length),
    le32(cd.length), le32(decalage), le16(0),
  ]);
  return Buffer.concat([...parties, cd, fin]);
}

const NOM_CSV = [
  "﻿NEQ,NOM_ASSUJ,NOM_ASSUJ_LANG_ETRNG,STAT_NOM,TYP_NOM_ASSUJ,DAT_INIT_NOM_ASSUJ,DAT_FIN_NOM_ASSUJ",
  "1000000001,LASERAX INC.,,A,N,2010-01-01,",
  "1000000002,BÊTA LTÉE,,A,N,2010-01-01,2015-01-01",
  "1000000003,GAMMA,,A,N,2010-01-01,",
  "1000000004,GAMMA INC.,,A,N,2012-01-01,",
  '1000000005,"DELTA, SERVICES INC.",,A,N,2012-01-01,',
  "1000000006,AUTRE ENTREPRISE,,A,N,2012-01-01,",
].join("\r\n") + "\r\n";

/** Un faux serveur qui honore `Range` (206), comme le registre. */
function serveurDePlages(zip: Buffer, statut = 206): Fetch {
  return async (_url, init) => {
    const plage = new Headers(init?.headers).get("range");
    if (!plage) return new Response(new Uint8Array(zip), { status: 200 });
    const m = /^bytes=(-?\d+)(?:-(\d+))?$/.exec(plage);
    if (!m) return new Response("", { status: 416 });
    let a: number;
    let b: number;
    if (m[1]!.startsWith("-")) {
      a = Math.max(0, zip.length + Number(m[1]));
      b = zip.length - 1;
    } else {
      a = Number(m[1]);
      b = Math.min(Number(m[2]), zip.length - 1);
    }
    return new Response(new Uint8Array(zip.subarray(a, b + 1)), { status: statut });
  };
}

const ZIP = fabriquerZip([
  { nom: "Entreprise.csv", contenu: "NEQ\n1\n" },
  { nom: "Nom.csv", contenu: NOM_CSV },
]);

const OFFRES = [
  offre("a", "Laserax inc.", { noc: "21231" }),
  offre("b", "Bêta"),
  offre("c", "Gamma"),
  offre("d", "Delta Services"),
  offre("e", "Epsilon (introuvable)"),
  offre("h", "Historique seul", { histo: true }),
];

describe("population", () => {
  it("compte les employeurs par leur forme normalisée, hors historique", () => {
    const p = populationDe(OFFRES);
    expect(p.employeurs).toBe(5);
    expect(p.formes.has("laserax")).toBe(true);
    expect(p.formes.has("historique seul")).toBe(false);
    expect([p.offresSuivies, p.offresAvecCode]).toEqual([5, 1]);
  });

  it("un employeur sans nom ne se cherche pas : on ne devine pas", () => {
    const p = populationDe([offre("x", " "), offre("y", "Zêta")]);
    expect(p.employeurs).toBe(1);
  });

  it("le pourcentage d'un total nul est nul, jamais zéro", () => {
    expect(pourcent(0, 0)).toBeNull();
    expect(pourcent(1, 8)).toBe(12.5);
  });
});

describe("lecture d'un ZIP par sa fin", () => {
  const fin = lireFinZip(new Uint8Array(ZIP))!;

  it("retrouve le répertoire central", () => {
    expect(fin.entrees).toBe(2);
    const cd = ZIP.subarray(fin.decalageRepertoire, fin.decalageRepertoire + fin.tailleRepertoire);
    const e = lireRepertoireZip(new Uint8Array(cd), fin.entrees)!;
    expect(e.map((x) => x.nom)).toEqual(["Entreprise.csv", "Nom.csv"]);
    expect(e[1]!.methode).toBe(8);
    expect(e[1]!.tailleBrute).toBe(Buffer.byteLength(NOM_CSV));
  });

  it("le début des données tient compte des champs extra de l'en-tête local", () => {
    for (const extra of [0, 5]) {
      const zip = fabriquerZip([{ nom: "Nom.csv", contenu: "NEQ\n" }], extra);
      const f = lireFinZip(new Uint8Array(zip))!;
      const cd = zip.subarray(f.decalageRepertoire, f.decalageRepertoire + f.tailleRepertoire);
      const [e] = lireRepertoireZip(new Uint8Array(cd), 1)!;
      const debut = debutDonnees(new Uint8Array(zip.subarray(e!.decalageLocal, e!.decalageLocal + 30)), e!.decalageLocal);
      expect(debut).toBe(30 + "Nom.csv".length + extra);
    }
  });

  it("refuse ce qui n'est pas un ZIP, ou un ZIP64, au lieu de deviner", () => {
    expect(lireFinZip(new Uint8Array(Buffer.from("pas un zip du tout, pas du tout vraiment")))).toBeNull();
    const z64 = Buffer.from(ZIP);
    z64.writeUInt32LE(0xffffffff, z64.length - 22 + 16);
    expect(lireFinZip(new Uint8Array(z64))).toBeNull();
    expect(debutDonnees(new Uint8Array(10), 0)).toBeNull();
  });
});

describe("Nom.csv", () => {
  const idx = { NEQ: 0, NOM_ASSUJ: 1, DAT_FIN_NOM_ASSUJ: 6 };

  it("lit un nom avec virgule entre guillemets sans décaler les colonnes", () => {
    const l = lireLigneNom('1000000005,"DELTA, SERVICES INC.",,A,N,2012-01-01,', idx);
    expect(l).toEqual({ neq: "1000000005", nom: "DELTA, SERVICES INC.", vigueur: true });
  });

  it("une date de fin dit que le nom n'est plus en vigueur", () => {
    expect(lireLigneNom("1,ANCIEN,,A,N,2010-01-01,2015-01-01", idx)?.vigueur).toBe(false);
  });
});

describe("rattachement au registre des entreprises", () => {
  it("compte retrouvés, uniques, ambigus et noms en vigueur — par nom exact normalisé", async () => {
    const m = await mesurerReq(serveurDePlages(ZIP), populationDe(OFFRES), 30_000);
    expect(m.fin).toBe("termine");
    expect(m.lignesLues).toBe(6);
    // Laserax (1 NEQ), Bêta (1 NEQ, nom périmé), Gamma (2 NEQ : GAMMA et GAMMA INC.), Delta (1).
    expect(m.retrouves).toBe(4);
    expect(m.uniques).toBe(3);
    expect(m.ambigus).toBe(1);
    // Seul Bêta n'a que des noms dont la date de fin est posée.
    expect(m.nomEnVigueur).toBe(3);
    // 4 retrouvés sur 5 employeurs.
    expect(m.tauxPct).toBe(80);
  });

  it("le temps épuisé ne conclut pas : pas de taux", async () => {
    let t = 0;
    const m = await mesurerReq(serveurDePlages(ZIP), populationDe(OFFRES), 10, () => (t += 1_000));
    expect(m.fin).toBe("temps-ecoule");
    expect(m.tauxPct).toBeNull();
  });

  it("un refus du registre est dit « refusé », avec le code", async () => {
    const m = await mesurerReq(async () => new Response("", { status: 403 }), populationDe(OFFRES), 30_000);
    expect(m.fin).toBe("refuse");
    expect(m.detail).toContain("403");
  });

  it("un serveur qui ignore les plages n'est pas lu en entier", async () => {
    const m = await mesurerReq(serveurDePlages(ZIP, 200), populationDe(OFFRES), 30_000);
    expect(m.fin).not.toBe("termine");
  });

  it("un ZIP sans Nom.csv, ou sans les colonnes attendues, est un format inattendu", async () => {
    const sansNom = fabriquerZip([{ nom: "Autre.csv", contenu: "x\n" }]);
    expect((await mesurerReq(serveurDePlages(sansNom), populationDe(OFFRES), 30_000)).fin).toBe("format-inattendu");
    const mauvais = fabriquerZip([{ nom: "Nom.csv", contenu: "A,B\n1,2\n" }]);
    expect((await mesurerReq(serveurDePlages(mauvais), populationDe(OFFRES), 30_000)).fin).toBe("format-inattendu");
  });
});

describe("rattachement au registre déjà en base", () => {
  const offres = [
    offre("1", "Alpha Inc."),
    offre("2", "Alpha Inc."), // même employeur : compté une fois
    offre("3", "Bêta (Québec) inc."),
    offre("4", "Gamma ltée"),
    offre("5", "Delta SENC"),
    offre("6", ""), // sans nom : jamais un employeur
    offre("7", "Epsilon inc.", { histo: true }), // hors liste suivie
  ];

  /** Une fausse base : on lui donne les clés EXACTES calculées par l'application. */
  function base(par: Record<string, number>) {
    return async (cles: readonly string[]) => {
      const m = new Map<string, number>();
      for (const c of cles) if (par[c] !== undefined) m.set(c, par[c]);
      return m as ReadonlyMap<string, number>;
    };
  }

  it("compte uniques, ambigus et absents, un employeur une seule fois", async () => {
    const cles = (n: string) => clesDeRecherche(n);
    const lire = base({
      [cles("Alpha Inc.")[0]!]: 1,
      [cles("Gamma ltée")[0]!]: 3,
    });
    const r = await mesurerBase(offres, lire);
    expect(r.fin).toBe("termine");
    expect(r.employeursCherches).toBe(4);
    expect(r.retrouves).toBe(2);
    expect(r.uniques).toBe(1);
    expect(r.ambigus).toBe(1);
    expect(r.tauxPct).toBe(50);
  });

  it("retombe sur la variante sans parenthèse", async () => {
    const variantes = clesDeRecherche("Bêta (Québec) inc.");
    expect(variantes.length).toBeGreaterThan(1);
    const r = await mesurerBase(offres, base({ [variantes[variantes.length - 1]!]: 1 }));
    expect(r.retrouves).toBe(1);
    expect(r.uniques).toBe(1);
  });

  it("ne lève pas : une base illisible rend « injoignable » sans taux", async () => {
    const r = await mesurerBase(offres, async () => {
      throw new Error("base coupée");
    });
    expect(r.fin).toBe("injoignable");
    expect(r.tauxPct).toBeNull();
    expect(r.retrouves).toBe(0);
  });

  it("aucun employeur nommé : pas de taux, pas d'appel à la base", async () => {
    let appels = 0;
    const r = await mesurerBase([offre("9", "")], async () => {
      appels++;
      return new Map();
    });
    expect(appels).toBe(0);
    expect(r.employeursCherches).toBe(0);
    expect(r.tauxPct).toBeNull();
  });

  it("ne rend aucun nom d'entreprise", async () => {
    const r = await mesurerBase(offres, base({}));
    expect(JSON.stringify(r)).not.toMatch(/Alpha|Gamma|Delta|Bêta/);
  });
});

describe("RENA", () => {
  const json = {
    rena: {
      "@attributes": { date: "2026-09-09 10:09:29" },
      inscription: [
        { NEQ: "1", Nom_entreprise: "EPSILON (INTROUVABLE) INC.", Nom_personne_liee: "Personne Fictive" },
        { NEQ: "2", Nom_entreprise: "Quelqu'un d'autre" },
        { NEQ: "3", Nom_entreprise: "" },
      ],
    },
  };

  it("lit les noms d'entreprise seulement, jamais les personnes", () => {
    const lu = lireRena(json)!;
    expect(lu.noms).toEqual(["EPSILON (INTROUVABLE) INC.", "Quelqu'un d'autre"]);
    expect(lu.date).toBe("2026-09-09 10:09:29");
    expect(lireRena({ autre: 1 })).toBeNull();
  });

  it("compte les employeurs en cause sans en nommer aucun", async () => {
    const m = await mesurerRena(async () => new Response(JSON.stringify(json), { status: 200 }), populationDe(OFFRES));
    expect(m.fin).toBe("termine");
    expect(m.inscriptions).toBe(2);
    expect(m.employeursEnCause).toBe(1);
    expect(JSON.stringify(m)).not.toMatch(/epsilon|personne/i);
  });

  it("un fichier absurdement gros n'est pas analysé", async () => {
    const gros = "x".repeat(9 * 1024 * 1024);
    const m = await mesurerRena(async () => new Response(gros, { status: 200 }), populationDe(OFFRES));
    expect(m.fin).toBe("trop-gros");
  });
});

describe("salaires par code de profession", () => {
  it("rend le catalogue ET la part des offres qui portent un code", async () => {
    const catalogue = {
      success: true,
      result: {
        count: 2,
        results: [{ title: "Jeu A", resources: [{ format: "CSV", url: "https://exemple.test/a.csv" }] }],
      },
    };
    const m = await mesurerSalaires(async () => new Response(JSON.stringify(catalogue), { status: 200 }), populationDe(OFFRES));
    expect(m.fin).toBe("termine");
    expect(m.jeux).toBe(2);
    expect(m.exemples[0]!.ressources[0]!.format).toBe("CSV");
    expect([m.offresAvecCode, m.offresSuivies, m.tauxPct]).toEqual([1, 5, 20]);
  });

  it("une réponse qui n'est pas un catalogue est un format inattendu", async () => {
    const m = await mesurerSalaires(async () => new Response("{}", { status: 200 }), populationDe(OFFRES));
    expect(m.fin).toBe("format-inattendu");
  });
});

describe("l'ensemble", () => {
  it("mesure les trois sources et n'écrit aucun nom d'entreprise dans le rapport", async () => {
    const f: Fetch = async (url, init) => {
      if (url.includes("rena.json")) return new Response(JSON.stringify({ rena: { inscription: [] } }), { status: 200 });
      if (url.includes("open.canada.ca")) return new Response(JSON.stringify({ success: true, result: { count: 0, results: [] } }), { status: 200 });
      return serveurDePlages(ZIP)(url, init);
    };
    const r = await sonderEmployeurs(OFFRES, f, 30_000);
    expect(r.employeursCherches).toBe(5);
    expect([r.rena.fin, r.salaires.fin, r.req.fin]).toEqual(["termine", "termine", "termine"]);
    expect(JSON.stringify(r)).not.toMatch(/laserax|gamma|delta|epsilon/i);
  });

  it("s'identifie honnêtement et ne se fait pas passer pour un navigateur", async () => {
    const agents: string[] = [];
    const f: Fetch = async (url, init) => {
      agents.push(new Headers(init?.headers).get("user-agent") ?? "");
      return new Response("", { status: 404 });
    };
    await sonderEmployeurs(OFFRES, f, 30_000);
    expect(agents.length).toBeGreaterThan(0);
    for (const a of agents) expect(a).toMatch(/^JobAI-sonde\//);
    for (const a of agents) expect(a).not.toMatch(/mozilla|chrome|safari/i);
  });
});
