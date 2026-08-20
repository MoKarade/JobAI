// tests/sourceGuichetFlux.test.ts — le flux complet du Guichet comme source de veille.
//
// CE QUE CES TESTS PROTÈGENT, ET POURQUOI ILS VALENT LEUR PLACE
//
// 1. **Le filtre ne doit pas s'auto-aveugler.** La mesure des lieux apprend les noms de
//    ville à partir des offres que les sources RAPPORTENT. Un pré-filtre régional qui
//    jetterait ici les `lieu-inconnu` empêcherait ces villes d'être mesurées un jour — donc
//    de devenir connues, donc d'entrer. L'échec serait parfaitement silencieux : la source
//    rendrait simplement moins, à jamais. C'est le test central de ce fichier.
// 2. **Une liste de métiers vide ÉTEINT la source.** Le défaut sûr d'un filtre non réglé
//    est de tout refuser, jamais de tout laisser passer : sans ce garde, le premier cron
//    après le branchement ferait entrer des milliers d'offres que personne n'a demandées.
// 3. **Un refus se compte par MOTIF et par OBJET.** « 0 offre » d'une source qui filtre
//    beaucoup est indiscernable d'une source muette ; seule la ligne de refus les sépare.

import { describe, it, expect } from "vitest";
import {
  MAX_LIEUX_INCONNUS_FLUX,
  ID_SOURCE_FLUX_GUICHET,
  resumerBilanFlux,
  sourceGuichetFlux,
  type BilanFlux,
} from "../lib/ingest/sourceGuichetFlux";
import { selectionnerSources } from "../lib/ingest/passe";
import { trier } from "../lib/ingest/pipeline";
import { normaliserLieu } from "../lib/ingest/region";
import { ID_SOURCE_DEPOT, type Recuperateur } from "../lib/ingest/types";

const enc = new TextEncoder();

function job(champs: Record<string, string>): string {
  const corps = Object.entries(champs)
    .map(([k, v]) => `<${k}><![CDATA[${v}]]></${k}>`)
    .join("");
  return `<job>${corps}</job>`;
}

/** Une offre du flux, paramétrée par ce qui décide de son sort. */
function offre(o: { ref: string; ville: string; noc?: string; titre?: string }): string {
  return job({
    title: o.titre ?? "Technicien en génie mécanique",
    date: "2026-08-18 09:12:00",
    referencenumber: o.ref,
    url: `https://www.guichetemplois.gc.ca/offre/${o.ref}`,
    company: "Employeur",
    city: o.ville,
    state: "QC",
    country: "CA",
    ...(o.noc === undefined ? {} : { noc2021: o.noc }),
    description: "Poste en usine, quart de jour.",
  });
}

function sert(corps: string): typeof fetch {
  return async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(enc.encode(corps));
          c.close();
        },
      }),
      { status: 200 },
    );
}

/** Le `Recuperateur` du contrat `Source` : la source du flux ne doit JAMAIS s'en servir. */
const recuperateurInterdit: Recuperateur = async () => {
  throw new Error("le flux ne doit pas passer par le Recuperateur (130 Mo en mémoire)");
};

async function interroger(
  corps: string,
  metiers: readonly string[],
  mode?: "domaine" | "tout",
) {
  const { source, bilan } = sourceGuichetFlux({ metiers, recuperer: sert(corps), mode });
  const r = await source.interroger(recuperateurInterdit);
  return { r, bilan: bilan() };
}

describe("sourceGuichetFlux — les trois décisions, dans l'ordre", () => {
  it("garde une offre régionale dont le code est retenu", async () => {
    const flux = `<source>${offre({ ref: "1", ville: "Québec", noc: "22301" })}</source>`;
    const { r, bilan } = await interroger(flux, ["22"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offres.map((o) => o.refSource)).toEqual(["1"]);
    expect(bilan?.regionales).toBe(1);
  });

  it("écarte une offre HORS RÉGION sans jamais lire son code", async () => {
    // L'ordre compte : compter les refus de métier sur des offres canadiennes ferait
    // décrire le Canada par une table censée décrire la région.
    const flux = `<source>${offre({ ref: "1", ville: "Toronto", noc: "22301" })}</source>`;
    const { r, bilan } = await interroger(flux, ["22"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offres).toHaveLength(0);
    expect(bilan?.horsRegion).toBe(1);
    expect(bilan?.ecarteesParCode).toEqual({});
  });

  it("écarte par MÉTIER en nommant le code — un total ne dit pas quoi corriger", async () => {
    const flux = `<source>${offre({ ref: "1", ville: "Québec", noc: "65200" })}${offre({
      ref: "2",
      ville: "Lévis",
      noc: "65200",
    })}${offre({ ref: "3", ville: "Québec", noc: "75110" })}</source>`;
    const { r, bilan } = await interroger(flux, ["22"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offres).toHaveLength(0);
    expect(bilan?.ecarteesParCode).toEqual({ "65200": 2, "75110": 1 });
  });

  it("compte un code ILLISIBLE à part : c'est un aveu, pas une décision", async () => {
    // ⚠️ Le jour où le Guichet cesserait de coder ses offres, ce compteur monterait en
    // flèche pendant que « écartées par métier » resterait à zéro. Les mélanger ferait
    // passer une panne de la source pour un tri qui fonctionne.
    const flux = `<source>${offre({ ref: "1", ville: "Québec" })}${offre({
      ref: "2",
      ville: "Québec",
      noc: "abc",
    })}</source>`;
    const { r, bilan } = await interroger(flux, ["22"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(bilan?.codeIllisible).toBe(2);
    expect(bilan?.ecarteesParCode).toEqual({});
  });

  it("une liste de métiers VIDE ne retient rien — le défaut sûr est de tout refuser", async () => {
    const flux = `<source>${offre({ ref: "1", ville: "Québec", noc: "22301" })}</source>`;
    const { r } = await interroger(flux, []);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offres).toHaveLength(0);
  });
});

describe("sourceGuichetFlux — le lieu inconnu PASSE, sinon la mesure ne l'apprend jamais", () => {
  it("rapporte une offre au lieu inconnu dont le métier est retenu", async () => {
    // ⚠️ LE TEST CENTRAL. `lieuxAMesurer` lit les noms de ville dans les offres RAPPORTÉES.
    // Jeter celles-ci ici les priverait à jamais d'une mesure : la ville resterait inconnue,
    // donc refusée, donc jamais rapportée — une boucle fermée que rien ne signale.
    // Le pipeline les refusera ensuite (`lieuInconnu`), mais leur NOM aura servi.
    const flux = `<source>${offre({
      ref: "1",
      ville: "Sainte-Bidule-des-Monts",
      noc: "22301",
    })}</source>`;
    const { r, bilan } = await interroger(flux, ["22"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offres.map((o) => o.ville)).toEqual(["Sainte-Bidule-des-Monts"]);
    expect(bilan?.lieuInconnuRapporte).toBe(1);
    expect(bilan?.regionales).toBe(0);
  });

  it("le métier est jugé AVANT le quota : un lieu inconnu hors métier ne le consomme pas", async () => {
    // Sinon le quota se remplirait de villes portées par des postes que Marc ne veut pas,
    // et la mesure travaillerait des jours pour débloquer des offres refusées ensuite.
    const flux = `<source>${offre({
      ref: "1",
      ville: "Sainte-Bidule-des-Monts",
      noc: "65200",
    })}</source>`;
    const { r, bilan } = await interroger(flux, ["22"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offres).toHaveLength(0);
    expect(bilan?.lieuInconnuRapporte).toBe(0);
    expect(bilan?.ecarteesParCode).toEqual({ "65200": 1 });
  });

  it("borne le passage, compte ce qu'il laisse en attente, et NE borne PAS les régionales", async () => {
    // Le cas se dérive de la constante, jamais de sa valeur du jour.
    const inconnus = Array.from({ length: MAX_LIEUX_INCONNUS_FLUX + 5 }, (_, i) =>
      offre({ ref: `i${i}`, ville: `Sainte-Bidule-${i}`, noc: "22301" }),
    ).join("");
    const regionales = Array.from({ length: 3 }, (_, i) =>
      offre({ ref: `q${i}`, ville: "Québec", noc: "22301" }),
    ).join("");
    const { r, bilan } = await interroger(`<source>${inconnus}${regionales}</source>`, ["22"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(bilan?.lieuInconnuRapporte).toBe(MAX_LIEUX_INCONNUS_FLUX);
    expect(bilan?.lieuInconnuIgnore).toBe(5);
    expect(bilan?.regionales).toBe(3);
    expect(r.offres).toHaveLength(MAX_LIEUX_INCONNUS_FLUX + 3);
  });

  it("le registre MESURÉ élargit le pré-filtre : une ville jugée régionale entre", async () => {
    const flux = `<source>${offre({
      ref: "1",
      ville: "Sainte-Bidule-des-Monts",
      noc: "22301",
    })}</source>`;
    const { source, bilan } = sourceGuichetFlux({
      metiers: ["22"],
      recuperer: sert(flux),
      // La clé se DÉRIVE de `normaliserLieu`, jamais recopiée à la main : le registre est
      // keyé par cette fonction, et une clé écrite au jugé ferait passer le test pour une
      // preuve alors qu'elle ne correspondrait à rien.
      verdicts: new Map([[normaliserLieu("Sainte-Bidule-des-Monts"), "dans-la-region"]]),
    });
    const r = await source.interroger(recuperateurInterdit);
    expect(r.ok).toBe(true);
    expect(bilan()?.regionales).toBe(1);
    expect(bilan()?.lieuInconnuRapporte).toBe(0);
  });
});

describe("sourceGuichetFlux — une source injoignable ne rend pas un vide", () => {
  it("rend un échec NOMMÉ quand le flux répond non-2xx", async () => {
    // Un vide se lirait « aucune offre régionale aujourd'hui » — la panne qui a laissé la
    // veille muette trois jours durant, et périmé quarante offres.
    const { source } = sourceGuichetFlux({
      metiers: ["22"],
      recuperer: async () => new Response("nope", { status: 503 }),
    });
    const r = await source.interroger(recuperateurInterdit);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.source).toBe(ID_SOURCE_FLUX_GUICHET);
    expect(r.erreur).toContain("503");
  });
});

describe("resumerBilanFlux — la ligne qui distingue « rien à prendre » de « rien laissé passer »", () => {
  const base: BilanFlux = {
    fin: "flux-termine",
    vues: 100,
    retenues: 0,
    regionales: 0,
    horsRegion: 0,
    lieuInconnuRapporte: 0,
    lieuInconnuIgnore: 0,
    ecarteesParCode: {},
    codeIllisible: 0,
  };

  it("nomme les codes les plus refusés, pas seulement leur total", () => {
    const ligne = resumerBilanFlux({
      ...base,
      ecarteesParCode: { "65200": 402, "75110": 311, "63200": 12 },
    });
    expect(ligne).toContain("725 écartées par métier");
    expect(ligne).toContain("65200 (402)");
    expect(ligne).toContain("75110 (311)");
  });

  it("DIT quand la lecture est partielle — sinon un « 0 » se lirait comme une mesure", () => {
    expect(resumerBilanFlux({ ...base, fin: "budget-depasse" })).toContain("lecture partielle");
    expect(resumerBilanFlux(base)).not.toContain("lecture partielle");
  });

  it("dit les deux comptes de lieux inconnus ensemble", () => {
    const ligne = resumerBilanFlux({
      ...base,
      lieuInconnuRapporte: 40,
      lieuInconnuIgnore: 812,
    });
    expect(ligne).toContain("40 lieux inconnus rapportés pour mesure");
    expect(ligne).toContain("+812 en attente");
  });
});

describe("selectionnerSources — le flux est construit seulement si Marc a choisi", () => {
  it("ne le construit PAS sans métiers retenus", () => {
    const sansOptions = selectionnerSources(0, "2026-08-19");
    const listeVide = selectionnerSources(0, "2026-08-19", { metiers: [] });
    for (const sources of [sansOptions, listeVide]) {
      expect(sources.map((s) => s.id)).not.toContain(ID_SOURCE_FLUX_GUICHET);
    }
  });

  it("le construit HORS ROTATION, comme le dépôt", () => {
    // Hors rotation parce qu'une source sautée un jour laisse ses offres prendre une
    // absence : trois absences périment. Le mettre en rotation périmerait par intermittence
    // ce qu'on vient d'ingérer, pour une raison d'horaire.
    for (const depart of [0, 3, 7, 13]) {
      const ids = selectionnerSources(depart, "2026-08-19", { metiers: ["22"] }).map((s) => s.id);
      expect(ids).toContain(ID_SOURCE_FLUX_GUICHET);
      expect(ids).toContain(ID_SOURCE_DEPOT);
    }
  });
});

describe("le code de profession voyage jusqu'à la note (ADR-0013)", () => {
  it("rattache le code lu à l'offre rendue", async () => {
    const flux = `<source>${offre({ ref: "1", ville: "Québec", noc: "22301" })}</source>`;
    const { r } = await interroger(flux, ["22"]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offres[0]?.noc).toBe("22301");
  });

  it("rend `null` — jamais undefined — quand l'offre n'a pas de code lisible", async () => {
    // Une source qui n'en publie pas doit donner une ABSENCE explicite : c'est ce que
    // `facteurDomaine` lit comme « domaine inconnu », donc neutre.
    const flux = `<source>${offre({ ref: "1", ville: "Québec", noc: "" })}</source>`;
    const { r } = await interroger(flux, [], "tout");
    if (!r.ok) return;
    expect(r.offres.length).toBeGreaterThan(0);
    for (const o of r.offres) expect(o.noc).toBeNull();
  });

  it("le facteur de domaine s'applique RÉELLEMENT à une offre du flux", async () => {
    // ⚠️ LE TEST QUI COMPTE. Sans ce chemin, le barème d'ADR-0013 serait branché et inerte :
    // le facteur existerait, personne ne lui passerait de code, et rien ne le dirait.
    const flux = `<source>${offre({ ref: "1", ville: "Québec", noc: "65311", titre: "car washer" })}</source>`;
    const { r } = await interroger(flux, [], "tout");
    if (!r.ok) return;
    const brute = r.offres[0];
    expect(brute?.noc).toBe("65311");

    const dansLeDomaine = trier([brute!], new Set(), "2026-08-20", new Map(), ["65"]);
    const horsDomaine = trier([brute!], new Set(), "2026-08-20", new Map(), ["70", "92"]);
    // Retenue dans les deux cas (le plancher de rôle ne dépend pas du domaine), mais notée
    // différemment — c'est le facteur qui parle.
    const noteDedans = dansLeDomaine.retenues[0]?.score ?? 0;
    const noteDehors = horsDomaine.retenues[0]?.score ?? 0;
    expect(noteDehors).toBeLessThan(noteDedans);
  });
});

describe("mode « tout » (ADR-0013, D3) — voir toute la région, laisser la note trier", () => {
  const regionale = (ref: string, noc: string, titre: string) =>
    offre({ ref, ville: "Québec", noc, titre });

  it("en mode « domaine », le hors-liste est REFUSÉ — le comportement d'origine", async () => {
    const flux = `<source>${regionale("1", "65311", "car washer")}${regionale("2", "70010", "coordo")}</source>`;
    const { r, bilan } = await interroger(flux, ["70"]);
    if (!r.ok) return;
    expect(r.offres).toHaveLength(1);
    expect(bilan?.ecarteesParCode["65311"]).toBe(1);
  });

  it("en mode « tout », le hors-liste est RETENU — et toujours COMPTÉ", async () => {
    const flux = `<source>${regionale("1", "65311", "car washer")}${regionale("2", "70010", "coordo")}</source>`;
    const { r, bilan } = await interroger(flux, ["70"], "tout");
    if (!r.ok) return;
    expect(r.offres).toHaveLength(2);
    // Le compte de ce que le filtre AURAIT retiré reste tenu : c'est lui qui sert à régler
    // la liste. Le mode change le sort de l'offre, jamais la mesure.
    expect(bilan?.ecarteesParCode["65311"]).toBe(1);
  });

  it("le défaut est « domaine » — une option non réglée n'ouvre pas les vannes", async () => {
    const flux = `<source>${regionale("1", "65311", "car washer")}</source>`;
    const { r } = await interroger(flux, ["70"]);
    if (!r.ok) return;
    expect(r.offres).toHaveLength(0);
  });
});
