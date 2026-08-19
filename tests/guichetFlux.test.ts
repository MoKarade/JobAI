// tests/guichetFlux.test.ts — la lecture en flux du Guichet-Emplois.
//
// Ce que ces tests protègent, et pourquoi ça vaut un fichier à part : ce module lit une
// source de ~134 Mo dans une fonction serverless. Deux façons de le casser sans que rien
// ne se voie — accumuler (et tuer la fonction un jour où le flux grossit), ou découper une
// offre en plein milieu (et écrire en base une offre amputée qui a l'air complète). Les
// deux se prouvent ici sur des flux fabriqués morceau par morceau, aux endroits exacts où
// la vraie vie coupe : au milieu d'une balise, au milieu d'un caractère accentué.
//
// La troisième chose protégée est un mensonge d'optimisme déjà payé ailleurs : une source
// injoignable qui rendrait un rapport VIDE se lirait « aucune offre régionale aujourd'hui ».
// Le module lève ; ces tests le vérifient.

import { describe, it, expect } from "vitest";
import {
  BUDGET_MS_DEFAUT,
  ECHANTILLON_BALISES,
  MAX_CLASSES,
  TAMPON_MAX,
  URL_FLUX_GUICHET,
  CHAMPS_ANALYSES,
  analyserJobGuichet,
  champsRenseignes,
  estPeutEtreQuebec,
  extraireJobs,
  lireFluxGuichet,
  recenserBalises,
} from "../lib/ingest/guichetFlux";

const enc = new TextEncoder();

/** Une offre du flux, à la forme constatée le 2026-08-19. */
function job(champs: Record<string, string>): string {
  const corps = Object.entries(champs)
    .map(([k, v]) => `<${k}><![CDATA[${v}]]></${k}>`)
    .join("");
  return `<job>${corps}</job>`;
}

const OFFRE_QC = job({
  title: "Technicien en génie mécanique",
  date: "2026-08-18 09:12:00",
  referencenumber: "44556677",
  url: "https://www.guichetemplois.gc.ca/offre/44556677",
  company: "Laserax",
  city: "Québec",
  state: "QC",
  country: "CA",
  description: "Poste en usine, quart de jour.",
});

const OFFRE_ON = job({
  title: "Warehouse Associate",
  date: "2026-08-18",
  referencenumber: "99887766",
  url: "https://www.guichetemplois.gc.ca/offre/99887766",
  company: "Somewhere Ltd",
  city: "Mississauga",
  state: "ON",
  country: "CA",
  description: "Shift work.",
});

/** Un flux servi en morceaux EXACTEMENT là où on le demande. */
function fluxDe(morceaux: (Uint8Array | string)[]) {
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (const m of morceaux) c.enqueue(typeof m === "string" ? enc.encode(m) : m);
      c.close();
    },
  });
}

function reponse(body: ReadableStream<Uint8Array> | null, init: ResponseInit = {}) {
  return new Response(body, { status: 200, ...init });
}

/** Un récupérateur qui rend ce flux-là, quoi qu'on lui demande. */
const sert =
  (r: Response): typeof fetch =>
  async () =>
    r;

/** Une horloge qui avance d'un pas fixe à chaque lecture. */
function horloge(pasMs: number) {
  let t = 0;
  return () => {
    const v = t;
    t += pasMs;
    return v;
  };
}

describe("extraireJobs — une offre à cheval sur deux morceaux n'est JAMAIS tronquée", () => {
  it("garde le fragment incomplet dans le reste, et ne le rend pas comme une offre", () => {
    // Le cas de la vraie vie : le réseau coupe au milieu d'une balise. Rendre le fragment
    // ici produirait une offre sans lien, qui passerait pour une offre pauvre au lieu
    // d'être reconnue comme une moitié.
    const { jobs, reste } = extraireJobs(`${OFFRE_QC}<job><title><![CDATA[Tech`);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toBe(OFFRE_QC);
    expect(reste).toBe("<job><title><![CDATA[Tech");
  });

  it("JETTE ce qui précède la dernière offre complète — sinon le tampon grossit sans fin", () => {
    // C'est la moitié « mémoire » de l'invariant : sans cette coupe, un flux de 134 Mo se
    // reconstruirait en mémoire un morceau à la fois, exactement ce qu'on évite.
    const { reste } = extraireJobs(`<en-tete>beaucoup de texte</en-tete>${OFFRE_QC}`);
    expect(reste).toBe("");
  });

  it("ne rend rien quand aucune offre n'est complète", () => {
    const { jobs, reste } = extraireJobs("<source><publisher>Guichet</publisher>");
    expect(jobs).toHaveLength(0);
    expect(reste).toBe("<source><publisher>Guichet</publisher>");
  });
});

describe("analyserJobGuichet — le bruit ne compte pas comme une trouvaille", () => {
  it("lit les champs, CDATA compris", () => {
    const o = analyserJobGuichet(OFFRE_QC);
    expect(o).not.toBeNull();
    expect(o?.titre).toBe("Technicien en génie mécanique");
    expect(o?.entreprise).toBe("Laserax");
    expect(o?.ville).toBe("Québec");
    expect(o?.refSource).toBe("44556677");
    expect(o?.publieeLe).toBe("2026-08-18");
  });

  it("REFUSE une offre sans lien http(s) — pas une offre pauvre, un déchet", () => {
    expect(analyserJobGuichet(job({ title: "Technicien", url: "javascript:void(0)" }))).toBeNull();
    expect(analyserJobGuichet(job({ title: "Technicien" }))).toBeNull();
  });

  it("REFUSE une offre sans titre", () => {
    expect(analyserJobGuichet(job({ url: "https://exemple.ca/1" }))).toBeNull();
  });

  it("se rabat sur le lien quand la source ne donne pas de référence", () => {
    const o = analyserJobGuichet(job({ title: "T", url: "https://exemple.ca/1" }));
    expect(o?.refSource).toBe("https://exemple.ca/1");
  });
});

describe("recenserBalises — l'aveu d'ignorance, rendu vérifiable", () => {
  it("rapporte les noms RÉELLEMENT rencontrés, pas ceux que j'ai supposés", () => {
    // Le format vient d'un échantillon tronqué : un champ que j'aurais mal nommé doit
    // apparaître ici plutôt que de disparaître en silence de chaque offre.
    expect(recenserBalises(job({ title: "T", workterm: "Permanent", url: "https://x.ca" })))
      .toEqual(["title", "url", "workterm"]);
  });

  it("n'inclut pas la balise englobante", () => {
    expect(recenserBalises(OFFRE_QC)).not.toContain("job");
  });

  it("IGNORE le HTML des descriptions — sinon le recensement se noie dans le balisage", () => {
    // Mesuré au premier passage réel : les descriptions du Guichet sont du HTML, et le
    // recensement rendait `ul`, `li` et `h2` au milieu des champs du flux. La seule
    // question qu'il sert à trancher se perdait dans le bruit.
    const avecHtml = `<job><title><![CDATA[T]]></title><description><![CDATA[<ul><li>Tâche</li></ul>]]></description></job>`;
    expect(recenserBalises(avecHtml)).toEqual(["description", "title"]);
  });
});

describe("champsRenseignes — la mesure JUMELLE du recensement", () => {
  it("ne compte que les champs qui portent VRAIMENT une valeur", () => {
    // Elle et `recenserBalises` se vérifient l'une l'autre : l'une dit ce que le flux
    // écrit, l'autre ce que l'analyseur en tire. L'écart désigne le défaut.
    expect(champsRenseignes(job({ title: "T", url: "https://x.ca", city: "" })))
      .toEqual(["title", "url"]);
  });

  it("couvre tous les champs que l'analyseur lit, sans en oublier", () => {
    // Une liste recopiée à côté de l'analyseur finirait par décrire un autre analyseur que
    // celui qui tourne.
    expect([...CHAMPS_ANALYSES]).toContain("city");
    expect([...CHAMPS_ANALYSES]).toContain("state");
    expect(champsRenseignes(OFFRE_QC).sort()).toEqual(
      ["city", "company", "date", "description", "referencenumber", "state", "title", "url"],
    );
  });
});

describe("estPeutEtreQuebec — un pré-filtre se trompe en GARDANT, jamais en jetant", () => {
  it("garde une offre du Québec, écarte une offre d'ailleurs", () => {
    expect(estPeutEtreQuebec(OFFRE_QC)).toBe(true);
    expect(estPeutEtreQuebec(OFFRE_ON)).toBe(false);
  });

  it("garde une offre dont SEULE la description mentionne le Québec", () => {
    // Sur-inclusif à dessein : un faux positif coûte une analyse, un faux négatif perd une
    // offre sans laisser de trace — et le prédicat final tranchera de toute façon.
    expect(estPeutEtreQuebec(job({ city: "Ottawa", description: "Déplacements au Québec." })))
      .toBe(true);
  });
});

describe("lireFluxGuichet — lire sans jamais charger", () => {
  it("reconstitue une offre coupée au milieu par le réseau", async () => {
    // LE test du module. La coupe tombe au milieu de « <compa|ny> », là où un découpage
    // naïf perdrait l'employeur sans qu'aucune erreur ne soit levée.
    const entier = `<source><lastBuildDate>2026-08-19T13:16:05Z</lastBuildDate>${OFFRE_QC}</source>`;
    const coupe = entier.indexOf("<company>") + 5;
    const r = await lireFluxGuichet(
      sert(reponse(fluxDe([entier.slice(0, coupe), entier.slice(coupe)]))),
    );
    expect(r.fin).toBe("flux-termine");
    expect(r.retenues).toHaveLength(1);
    expect(r.retenues[0]?.entreprise).toBe("Laserax");
  });

  it("ne perd pas un caractère accentué coupé en deux par une frontière d'octets", async () => {
    // « é » fait deux octets en UTF-8. Un décodage morceau par morceau sans `stream: true`
    // rendrait « g<?>nie » — une description subtilement corrompue, jamais signalée.
    const octets = enc.encode(`<source>${OFFRE_QC}</source>`);
    const milieu = octets.indexOf(enc.encode("génie")[1] ?? 0);
    const r = await lireFluxGuichet(
      sert(reponse(fluxDe([octets.slice(0, milieu + 1), octets.slice(milieu + 1)]))),
    );
    expect(r.retenues[0]?.titre).toBe("Technicien en génie mécanique");
  });

  it("compte SÉPARÉMENT pré-filtrées, écartées et illisibles — et la somme fait le tout", async () => {
    // Un seul compteur « rejetées » ne permettrait pas de choisir un remède : un
    // pré-filtre trop strict, un prédicat trop strict et un format mal lu appellent trois
    // corrections opposées.
    const flux = `<source>${OFFRE_QC}${OFFRE_ON}${job({ city: "Québec", state: "QC" })}${job({
      title: "Journalier",
      url: "https://exemple.ca/2",
      city: "Lévis",
      state: "QC",
    })}</source>`;
    const r = await lireFluxGuichet(sert(reponse(fluxDe([flux]))), {
      garder: (o) => o.ville !== "Lévis",
    });
    expect(r.vues).toBe(4);
    expect(r.preFiltrees).toBe(1);
    expect(r.illisibles).toBe(1);
    expect(r.ecartees).toBe(1);
    expect(r.retenues).toHaveLength(1);
    expect(r.preFiltrees + r.illisibles + r.ecartees + r.retenues.length).toBe(r.vues);
  });

  it("passe le bloc BRUT au prédicat — la province n'est pas dans le contrat d'offre", async () => {
    const vus: string[] = [];
    await lireFluxGuichet(sert(reponse(fluxDe([`<source>${OFFRE_QC}</source>`]))), {
      garder: (_o, brut) => {
        vus.push(brut);
        return true;
      },
    });
    expect(vus[0]).toContain("<state><![CDATA[QC]]></state>");
  });

  it("rapporte la date de reconstruction du flux — la fraîcheur de la SOURCE", async () => {
    // Sans elle, un flux figé depuis une semaine et un marché calme rendent le même « 0 ».
    const r = await lireFluxGuichet(
      sert(
        reponse(
          fluxDe([`<source><lastBuildDate>2026-08-19T13:16:05Z</lastBuildDate>${OFFRE_QC}</source>`]),
        ),
      ),
    );
    expect(r.construitLe).toBe("2026-08-19");
  });

  it("rend `null` — jamais une date inventée — quand le flux n'en porte pas", async () => {
    const r = await lireFluxGuichet(sert(reponse(fluxDe([`<source>${OFFRE_QC}</source>`]))));
    expect(r.construitLe).toBeNull();
  });

  it("recense sur un ÉCHANTILLON BORNÉ, et dit combien d'offres il a vues", async () => {
    // Sans `balisesEchantillon`, un compte ne veut rien dire : « city: 12 » ne se lit pas
    // sans savoir si l'échantillon en portait 12 ou 2000.
    const flux = `<source>${OFFRE_QC.repeat(6)}</source>`;
    const r = await lireFluxGuichet(sert(reponse(fluxDe([flux]))), { maxRetenues: 10 });
    expect(r.vues).toBe(6);
    expect(r.balisesEchantillon).toBe(6);
    expect(r.balisesVues["company"]).toBe(6);
    expect(r.champsRenseignes["city"]).toBe(6);
  });

  it("DISCRIMINE « champ absent du format » de « champ absent de ces offres-là »", async () => {
    // ⚠️ LA LEÇON DU PREMIER PASSAGE RÉEL. La version précédente rendait un ENSEMBLE de
    // noms sur vingt offres : `city` n'y était pas, et j'en ai conclu que le format n'avait
    // pas de ville — alors qu'il en a une. Un ensemble confond les deux absences ; un
    // compte les sépare. Ici `state` est sur toutes les offres, `workterm` sur une seule,
    // et `salary` sur aucune : trois situations, trois nombres.
    const avecTerme = job({ title: "T", url: "https://x.ca", state: "QC", workterm: "Permanent" });
    const sansTerme = job({ title: "T", url: "https://x.ca", state: "QC" });
    const flux = `<source>${avecTerme}${sansTerme}${sansTerme}</source>`;
    const r = await lireFluxGuichet(sert(reponse(fluxDe([flux]))), { maxRetenues: 10 });
    expect(r.balisesVues["state"]).toBe(3);
    expect(r.balisesVues["workterm"]).toBe(1);
    expect(r.balisesVues["salary"]).toBeUndefined();
  });
});

describe("inventaire — savoir qu'une balise existe ne dit pas ce qu'elle PORTE", () => {
  it("compte les VALEURS, pas seulement la présence du champ", async () => {
    // La faute du recensement en ensemble, d'un cran plus loin : `noc2021` sur 100 % des
    // offres ne dit pas si la valeur est un code, un libellé ou une chaîne vide déguisée.
    const flux = `<source>${job({ title: "A", url: "https://x.ca/1", jobtype: "Permanent" })}${job({
      title: "B",
      url: "https://x.ca/2",
      jobtype: "Permanent",
    })}${job({ title: "C", url: "https://x.ca/3", jobtype: "Temporaire" })}</source>`;
    const r = await lireFluxGuichet(sert(reponse(fluxDe([flux]))), {
      maxRetenues: 10,
      inventaire: [{ nom: "jobtype", champ: "jobtype" }],
    });
    expect(r.inventaire["jobtype"]).toEqual({ Permanent: 2, Temporaire: 1 });
  });

  it("applique `classer` — une cardinalité brute ne s'interprète pas", () => {
    // Dix mille codes postaux distincts n'apprennent rien ; six régions de tri décident.
    return lireFluxGuichet(
      sert(
        reponse(
          fluxDe([
            `<source>${job({ title: "A", url: "https://x.ca/1", postalcode: "G1V 4M6" })}${job({
              title: "B",
              url: "https://x.ca/2",
              postalcode: "G1R 2B5",
            })}${job({ title: "C", url: "https://x.ca/3", postalcode: "H3A 1A1" })}</source>`,
          ]),
        ),
      ),
      {
        maxRetenues: 10,
        inventaire: [
          { nom: "fsa", champ: "postalcode", classer: (v) => v.replace(/\s+/g, "").slice(0, 3) },
        ],
      },
    ).then((r) => {
      expect(r.inventaire["fsa"]).toEqual({ G1V: 1, G1R: 1, H3A: 1 });
    });
  });

  it("rend `(vide)` plutôt que d'omettre — « absent » et « présent mais vide » diffèrent", async () => {
    const flux = `<source>${job({ title: "A", url: "https://x.ca/1", salary: "" })}</source>`;
    const r = await lireFluxGuichet(sert(reponse(fluxDe([flux]))), {
      maxRetenues: 10,
      inventaire: [{ nom: "salary", champ: "salary" }],
    });
    expect(r.inventaire["salary"]).toEqual({ "(vide)": 1 });
  });

  it("BORNE les classes distinctes, et DIT ce qu'elle a regroupé", async () => {
    // Un champ de texte libre peut porter autant de valeurs distinctes que d'offres : sans
    // borne, l'inventaire reconstruirait en mémoire ce que ce module existe pour ne pas
    // accumuler. Un inventaire tronqué qui se présenterait comme complet ferait conclure
    // sur un préfixe — la faute déjà payée avec le plafond de retenues.
    const offres = Array.from({ length: MAX_CLASSES + 5 }, (_, i) =>
      job({ title: "T", url: `https://x.ca/${i}`, salary: `${i} $ / h` }),
    ).join("");
    const r = await lireFluxGuichet(sert(reponse(fluxDe([`<source>${offres}</source>`]))), {
      maxRetenues: MAX_CLASSES + 50,
      inventaire: [{ nom: "salary", champ: "salary" }],
    });
    const seau = r.inventaire["salary"] ?? {};
    expect(Object.keys(seau)).toHaveLength(MAX_CLASSES + 1);
    expect(seau["(autres)"]).toBe(5);
  });

  it("CONTINUE de compter une classe DÉJÀ connue une fois la borne atteinte", async () => {
    // La borne ne doit rendre l'inventaire qu'INCOMPLET, jamais FAUX : rabattre une classe
    // connue sur « (autres) » ferait mentir son compte, ce qui est pire que de l'ignorer.
    const distinctes = Array.from({ length: MAX_CLASSES }, (_, i) =>
      job({ title: "T", url: `https://x.ca/d${i}`, salary: `${i} $ / h` }),
    ).join("");
    const repetee = job({ title: "T", url: "https://x.ca/r", salary: "0 $ / h" });
    const r = await lireFluxGuichet(
      sert(reponse(fluxDe([`<source>${distinctes}${repetee}${repetee}</source>`]))),
      { maxRetenues: MAX_CLASSES + 50, inventaire: [{ nom: "salary", champ: "salary" }] },
    );
    expect(r.inventaire["salary"]?.["0 $ / h"]).toBe(3);
    expect(r.inventaire["salary"]?.["(autres)"]).toBeUndefined();
  });

  it("n'inventorie RIEN quand on ne lui demande rien", async () => {
    const r = await lireFluxGuichet(sert(reponse(fluxDe([`<source>${OFFRE_QC}</source>`]))));
    expect(r.inventaire).toEqual({});
  });
});

describe("lireFluxGuichet — les quatre façons de s'arrêter se distinguent", () => {
  it("« flux-termine » est la SEULE fin qui autorise à conclure", async () => {
    const r = await lireFluxGuichet(sert(reponse(fluxDe([`<source>${OFFRE_QC}</source>`]))));
    expect(r.fin).toBe("flux-termine");
  });

  it("s'arrête au plafond de retenues, et le DIT comme une passe partielle", async () => {
    const r = await lireFluxGuichet(sert(reponse(fluxDe([`<source>${OFFRE_QC.repeat(10)}</source>`]))), {
      maxRetenues: 3,
    });
    expect(r.fin).toBe("plafond-retenues");
    expect(r.retenues).toHaveLength(3);
  });

  it("s'arrête au budget de temps, et garde ce qu'il a déjà lu", async () => {
    const morceaux = Array.from({ length: 5 }, () => OFFRE_QC);
    const r = await lireFluxGuichet(sert(reponse(fluxDe(morceaux))), {
      budgetMs: 10,
      maintenant: horloge(6),
    });
    expect(r.fin).toBe("budget-depasse");
    expect(r.retenues.length).toBeGreaterThan(0);
    expect(r.retenues.length).toBeLessThan(5);
  });

  it("DÉBORDE plutôt que de reconstruire un flux malformé en mémoire", async () => {
    // Une balise renommée, une page d'erreur servie à la place : aucun `</job>` n'arrive.
    // Sans cette borne, on rassemblerait les 134 Mo un morceau à la fois — la panne même
    // que ce module existe pour empêcher.
    const bloc = "x".repeat(1024 * 1024);
    const morceaux = ["<source><job>", bloc, bloc, bloc, bloc, bloc];
    const r = await lireFluxGuichet(sert(reponse(fluxDe(morceaux))));
    expect(r.fin).toBe("tampon-deborde");
    expect(r.octetsLus).toBeLessThanOrEqual(TAMPON_MAX + 2 * 1024 * 1024);
    expect(r.retenues).toHaveLength(0);
  });

  it("ANNULE un flux qui COULE ENCORE — borner la mémoire ne borne pas le réseau", async () => {
    // Sortir de la boucle sans annuler laisserait les Mo restants continuer d'arriver : le
    // budget qu'on croit respecter serait dépensé à ne rien lire.
    //
    // ⚠️ LE FLUX NE DOIT PAS SE FERMER TOUT SEUL, SINON LE TEST NE DISCRIMINE RIEN.
    // `cancel()` sur un flux déjà clos ne rappelle jamais la source : ma première version
    // passait avec ET sans l'annulation. Le vrai flux fait 134 Mo et coule encore quand on
    // s'arrête — c'est cet état-là qu'il faut reproduire.
    const suivi: { annule?: boolean } = {};
    const sansFin = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(enc.encode(OFFRE_QC));
      },
      cancel() {
        suivi.annule = true;
      },
    });
    await lireFluxGuichet(sert(reponse(sansFin)), { maxRetenues: 2 });
    expect(suivi.annule).toBe(true);
  });
});

describe("lireFluxGuichet — une panne ne se déguise JAMAIS en journée calme", () => {
  it("LÈVE sur un non-2xx au lieu de rendre un rapport vide", async () => {
    // « 0 offre régionale » et « la source n'a pas répondu » se ressemblent à l'arrivée.
    // Les confondre est ce qui a laissé la veille muette trois jours durant.
    await expect(lireFluxGuichet(sert(reponse(null, { status: 503 })))).rejects.toThrow("HTTP 503");
  });

  it("LÈVE sur une réponse sans corps", async () => {
    await expect(lireFluxGuichet(sert(reponse(null)))).rejects.toThrow("flux sans corps");
  });

  it("laisse remonter une erreur de lecture qui n'est PAS notre minuteur", async () => {
    const flux = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error("connexion coupée");
      },
    });
    await expect(lireFluxGuichet(sert(reponse(flux)))).rejects.toThrow("connexion coupée");
  });

  it("traite l'abandon de NOTRE minuteur comme un budget épuisé, pas comme une panne", async () => {
    let premier = true;
    const flux = new ReadableStream<Uint8Array>({
      pull(c) {
        if (premier) {
          premier = false;
          c.enqueue(enc.encode(`<source>${OFFRE_QC}`));
          return;
        }
        const err = new Error("The operation was aborted.");
        err.name = "AbortError";
        throw err;
      },
    });
    const r = await lireFluxGuichet(sert(reponse(flux)));
    expect(r.fin).toBe("budget-depasse");
    expect(r.retenues).toHaveLength(1);
  });
});

describe("les constantes disent ce qu'elles bornent", () => {
  it("vise le flux officiel, l'exception nommée du garde-fou n°4", () => {
    expect(URL_FLUX_GUICHET).toBe("https://www.jobbank.gc.ca/xmlfeed/jobbank.xml");
  });

  it("recense sur un échantillon assez GRAND pour qu'un zéro veuille dire zéro", () => {
    // ⚠️ VINGT NE SUFFISAIT PAS, et le premier passage réel l'a prouvé : `city` était absent
    // du recensement alors que le flux le porte. Un recensement dont l'absence n'est pas
    // concluante ne recense rien.
    expect(ECHANTILLON_BALISES).toBeGreaterThanOrEqual(1000);
  });

  it("laisse du budget au reste de la passe", () => {
    // Le lecteur partage un mur d'environ 60 s avec le tri, l'écriture et le géocodage :
    // un lecteur qui prend tout rapporte des offres que personne n'a le temps d'écrire.
    expect(BUDGET_MS_DEFAUT).toBeLessThan(30_000);
  });
});
