// tests/annonceUnique.test.ts — une annonce du Guichet est UNE offre, même quand l'employeur change de nom (JobAI#195).
//
// Données FICTIVES : aucun vrai employeur, aucun vrai numéro d'annonce.

import { describe, it, expect } from "vitest";
import { copiesParAnnonce, representante, touchee, unePourChaqueAnnonce } from "../lib/doublonsAnnonce";
import { chercherOffres, FiltresSchema } from "../lib/mcp/lecture.spec";
import { signauxDe, signauxParEmployeur } from "../lib/signauxEmployeur";
import { brutesParIdStocke, idOffre, trier } from "../lib/ingest/pipeline";
import type { OffreBrute } from "../lib/ingest/types";
import type { Offre } from "../lib/types";
import type { JournalVeille } from "../lib/veille";

const GUICHET = "https://www.qc.guichetemplois.gc.ca/jobsearch/jobposting";
const FERMEE = "2026-10-10T12:00:00.000Z";

function offre(id: string, reste: Partial<Offre> = {}): Offre {
  return {
    id,
    source: "jobbank",
    dateReperage: "2026-09-01",
    entreprise: "Enseigne Fictive",
    poste: "aide de cuisine",
    lien: "",
    km: null,
    noc: null,
    ville: null,
    salaireAffiche: null,
    priorite: "Moyenne",
    statut: "Identifiee",
    dateEnvoi: "",
    score: 60,
    scoreSource: "calcule",
    raisons: [],
    notes: "",
    userNote: "",
    histo: false,
    perimeeLe: null,
    ...reste,
  };
}

/** L'annonce 10000001 sous deux noms : la copie de septembre, périmée, et celle d'octobre, ouverte. */
const ancienne = offre("fictive-aide", { lien: `${GUICHET}/10000001`, dateReperage: "2026-09-19", perimeeLe: FERMEE });
const recente = offre("fictive-2538-aide", {
  entreprise: "Enseigne Fictive 2538",
  lien: `${GUICHET}/10000001`,
  dateReperage: "2026-09-26",
});
const autre = offre("fictive-2789-gerant", {
  entreprise: "Enseigne Fictive 2789",
  poste: "gérant",
  lien: `${GUICHET}/10000002`,
});

describe("regroupement par annonce", () => {
  it("réunit les copies d'un même numéro et laisse seule une offre sans numéro", () => {
    const sansLien = offre("sans-lien");
    const groupes = copiesParAnnonce([ancienne, sansLien, recente, autre]);
    expect(groupes.map((g) => g.map((o) => o.id))).toEqual([
      ["fictive-aide", "fictive-2538-aide"],
      ["sans-lien"],
      ["fictive-2789-gerant"],
    ]);
  });

  it("la représentante est l'offre ouverte, puis la plus récente, puis l'id", () => {
    expect(representante([ancienne, recente]).id).toBe("fictive-2538-aide");
    const a = offre("a", { dateReperage: "2026-10-01" });
    const b = offre("b", { dateReperage: "2026-10-05" });
    expect(representante([a, b]).id).toBe("b");
    expect(representante([offre("z"), offre("m")]).id).toBe("m");
  });

  it("touchée = statut, date d'envoi ou note de Marc", () => {
    expect(touchee(offre("x"))).toBe(false);
    expect(touchee(offre("x", { statut: "CVenvoye" }))).toBe(true);
    expect(touchee(offre("x", { dateEnvoi: "2026-10-01" }))).toBe(true);
    expect(touchee(offre("x", { userNote: "appelé" }))).toBe(true);
  });

  it("garde l'offre que Marc a touchée, même si l'autre copie est ouverte", () => {
    const { offres, masquees } = unePourChaqueAnnonce([
      offre("a", { lien: `${GUICHET}/10000009`, statut: "CVenvoye", perimeeLe: FERMEE }),
      offre("b", { lien: `${GUICHET}/10000009` }),
    ]);
    expect(offres.map((o) => o.id)).toEqual(["a"]);
    expect(masquees).toBe(1);
  });

  it("⚠️ ne cache RIEN quand deux copies portent chacune une décision de Marc", () => {
    const { offres, masquees } = unePourChaqueAnnonce([
      offre("a", { lien: `${GUICHET}/10000009`, statut: "CVenvoye" }),
      offre("b", { lien: `${GUICHET}/10000009`, userNote: "à relancer" }),
    ]);
    expect(offres.map((o) => o.id)).toEqual(["a", "b"]);
    expect(masquees).toBe(0);
  });
});

describe("chercher_offres — une annonce, une offre", () => {
  const tout = [ancienne, recente, autre];

  it("avec les périmées, la même annonce ne revient pas deux fois", () => {
    const r = chercherOffres(tout, FiltresSchema.parse({ texte: "fictive", inclurePerimees: true }));
    const liens = r.offres.map((o) => o.lien);
    expect(new Set(liens).size).toBe(liens.length);
    expect(r.offres.map((o) => o.id).sort()).toEqual(["fictive-2538-aide", "fictive-2789-gerant"]);
    expect(r.correspondances).toBe(2);
    expect(r.copiesMasquees).toBe(1);
  });

  it("sans copie en double, rien n'est masqué", () => {
    const r = chercherOffres([autre], FiltresSchema.parse({}));
    expect(r.copiesMasquees).toBe(0);
    expect(r.offres).toHaveLength(1);
  });

  it("les champs de Marc de l'offre rendue sont ceux du suivi, intacts", () => {
    const touchee = offre("t", { lien: `${GUICHET}/10000003`, statut: "Relance", userNote: "rappeler", dateEnvoi: "2026-10-02" });
    const r = chercherOffres([touchee, offre("u", { lien: `${GUICHET}/10000003` })], FiltresSchema.parse({}));
    expect(r.offres).toHaveLength(1);
    expect(r.offres[0]).toMatchObject({ id: "t", statut: "Relance", userNote: "rappeler", dateEnvoi: "2026-10-02" });
  });
});

describe("signaux d'employeur — une annonce compte pour une offre", () => {
  const journal: JournalVeille = {
    "fictive-aide": { premiereVue: "2026-09-19", derniereVue: "2026-09-27", absences: 3 },
    "fictive-2538-aide": { premiereVue: "2026-09-26", derniereVue: "2026-10-16", absences: 0 },
  };

  it("deux copies d'une annonce font une offre ouverte, pas une ouverte et une fermée", () => {
    const s = signauxDe([ancienne, recente], journal);
    expect(s.offres).toBe(1);
    expect(s.ouvertes).toBe(1);
    expect(s.fermees).toBe(0);
    // Du premier jour vu (09-19) au dernier (10-16) : 27 jours, pas 20 ni 8.
    expect(s.plusAncienneOuverte).toEqual({ jours: 27, repereeLe: "2026-09-19" });
    // L'annonce n'est pas un « intitulé repris » : c'est une seule annonce.
    expect(s.intitulesReprisTotal).toBe(0);
  });

  it("deux annonces distinctes au même intitulé restent un intitulé repris", () => {
    const s = signauxDe([recente, offre("fictive-autre-aide", { lien: `${GUICHET}/10000077` })], {});
    expect(s.offres).toBe(2);
    expect(s.intitulesReprisTotal).toBe(1);
  });

  it("les succursales d'une enseigne portent les mêmes signaux", () => {
    const r = signauxParEmployeur([ancienne, recente, autre], journal);
    expect(Object.keys(r)).toEqual(["enseigne fictive"]);
    expect(r["enseigne fictive"]?.offres).toBe(2);
    expect(r["enseigne fictive"]?.ouvertes).toBe(2);
  });
});

describe("ingestion — l'annonce déjà suivie n'entre pas sous un autre nom", () => {
  const brute = (champs: Partial<OffreBrute> = {}): OffreBrute => ({
    refSource: "1",
    titre: "aide de cuisine",
    entreprise: "Enseigne Fictive 2538",
    ville: "Québec, QC",
    lien: `${GUICHET}/10000001`,
    description: "Préparer les aliments, nettoyer la cuisine et servir les clients.",
    publieeLe: "2026-10-01",
    ...champs,
  });

  it("trier écarte une annonce dont le numéro est déjà suivi, mais pas une annonce nouvelle", () => {
    const sans = trier([brute()], new Set(), "2026-10-21");
    const avec = trier([brute()], new Set(), "2026-10-21", new Map(), [], undefined, new Set(["10000001"]));
    expect(avec.doublons).toBe(1);
    expect(avec.retenues).toHaveLength(0);
    expect(avec.refusees).toEqual([
      { entreprise: "Enseigne Fictive 2538", titre: "aide de cuisine", ville: "Québec, QC", motif: "doublon" },
    ]);
    // Contrôle : sans la liste d'annonces connues, la même brute n'est pas un doublon.
    expect(sans.doublons).toBe(0);
    const autreNumero = trier(
      [brute({ lien: `${GUICHET}/10000555` })],
      new Set(),
      "2026-10-21",
      new Map(),
      [],
      undefined,
      new Set(["10000001"]),
    );
    expect(autreNumero.doublons).toBe(0);
  });

  it("deux brutes du même numéro dans un lot, sous deux noms : une seule entre", () => {
    const t = trier(
      [brute({ entreprise: "Enseigne Fictive" }), brute({ entreprise: "Enseigne Fictive 2538", refSource: "2" })],
      new Set(),
      "2026-10-21",
    );
    expect(t.retenues.length + t.souslePlancher + t.doublons).toBe(2);
    expect(t.doublons).toBe(1);
  });

  it("le marquage « vue » retrouve l'offre stockée par son numéro d'annonce", () => {
    const stockee = { id: idOffre("Enseigne Fictive", "aide de cuisine"), entreprise: "Enseigne Fictive", poste: "aide de cuisine", lien: `${GUICHET}/10000001` };
    const vues = brutesParIdStocke([brute()], [stockee]);
    expect([...vues.keys()]).toEqual([stockee.id]);
  });

  it("sans lien lisible, la résolution d'avant ne change pas", () => {
    const stockee = { id: idOffre("Enseigne Fictive", "aide de cuisine"), entreprise: "Enseigne Fictive", poste: "aide de cuisine" };
    expect(brutesParIdStocke([brute({ lien: "https://exemple.test/1" })], [stockee]).size).toBe(0);
  });
});
