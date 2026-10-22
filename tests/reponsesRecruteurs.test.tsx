// tests/reponsesRecruteurs.test.tsx — le bloc « Réponses de recruteurs » de l'accueil (JobAI#219, ADR-0043).
//
// Ce qu'on verrouille : (1) la liste à confirmer est dérivée de l'état gardé SANS jamais inventer ni écrire ; (2) « Confirmer » écrit le statut
// que le SERVEUR a gardé, par `modifierOffre`, et rien d'autre ; (3) « Écarter » n'écrit rien dans le suivi ; (4) le suivi d'une offre non
// confirmée reste identique ; (5) Gmail n'est jamais lu dans le chemin d'affichage de l'accueil. Des données FICTIVES (dépôt public).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { Offre } from "../lib/types";
import {
  ajouterTraitee,
  lirePropositionsGardees,
  lireTraitees,
  reponsesAConfirmer,
  type PropositionGardee,
  type PropositionsGardees,
  type Traitee,
} from "../lib/gmail/reponses";

const etat = vi.hoisted(() => ({
  session: true,
  gardees: null as unknown,
  traitees: [] as unknown[],
  offre: null as unknown,
  ecritures: [] as unknown[][],
  traiteesEcrites: [] as unknown[],
}));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("../lib/session", () => ({
  exigerSession: async () => {
    if (!etat.session) throw new Error("non autorisé");
    return { user: {} };
  },
}));
vi.mock("../lib/actions", () => ({
  modifierOffre: async (id: string, patch: unknown) => {
    etat.ecritures.push([id, patch]);
    return { ok: true };
  },
}));
vi.mock("../lib/donnees", () => ({ lireOffre: async () => etat.offre }));
vi.mock("../lib/gmail/reponsesStore", () => ({
  lireGardees: async () => etat.gardees,
  lireTraiteesGardees: async () => etat.traitees,
  ecrireTraitees: async (liste: unknown) => {
    etat.traiteesEcrites.push(liste);
  },
}));

const { confirmerReponse, ecarterReponse } = await import("../lib/actionsReponses");
const { ReponsesRecruteurs } = await import("../components/ReponsesRecruteurs");

const OFFRE: Offre = {
  id: "zorbex-coordonnateur",
  source: "jobbank",
  dateReperage: "2026-10-01",
  entreprise: "Zorbex inc.",
  poste: "Coordonnateur de projets",
  lien: "https://exemple.test/o",
  km: 12,
  ville: "Québec",
  salaireAffiche: null,
  statut: "CVenvoye",
  priorite: "Moyenne",
  dateEnvoi: "2026-10-05",
  userNote: "",
  score: 70,
  scoreSource: "calcule",
  raisons: [],
  notes: "",
  histo: false,
  perimeeLe: null,
};
const offre = (p: Partial<Offre> = {}): Offre => ({ ...OFFRE, ...p });

const proposition = (p: Partial<PropositionGardee> = {}): PropositionGardee => ({
  courrielId: "m1",
  recuLe: "2026-10-20T15:00:00.000Z",
  offreId: OFFRE.id,
  statutPropose: "Entrevue",
  sens: "entrevue",
  phrase: "Nous aimerions vous rencontrer pour une entrevue.",
  sujet: "Votre candidature",
  expediteur: "Zorbex Talents",
  ...p,
});
const gardees = (ps: PropositionGardee[]): PropositionsGardees => ({ luLe: "2026-10-21T20:00:00.000Z", courrielsLus: ps.length, propositions: ps });

beforeEach(() => {
  etat.session = true;
  etat.gardees = gardees([proposition()]);
  etat.traitees = [];
  etat.offre = offre();
  etat.ecritures = [];
  etat.traiteesEcrites = [];
});

describe("reponsesAConfirmer : la liste dérivée de l'état gardé", () => {
  it("montre une réponse repérée avec le statut ACTUEL de l'offre et le statut proposé", () => {
    const l = reponsesAConfirmer(gardees([proposition()]), [], [offre()]);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ offreId: OFFRE.id, entreprise: "Zorbex inc.", statutActuel: "CVenvoye", statutPropose: "Entrevue", expediteur: "Zorbex Talents" });
  });

  it("ne montre rien sans état gardé : pas de proposition inventée", () => {
    expect(reponsesAConfirmer(null, [], [offre()])).toEqual([]);
    expect(reponsesAConfirmer(gardees([]), [], [offre()])).toEqual([]);
  });

  it("écarte un courriel déjà traité, une offre disparue et un statut déjà avancé à la main", () => {
    const traitees: Traitee[] = [{ courrielId: "m1", action: "ecartee", le: "2026-10-21T20:10:00.000Z" }];
    expect(reponsesAConfirmer(gardees([proposition()]), traitees, [offre()])).toEqual([]);
    expect(reponsesAConfirmer(gardees([proposition()]), [], [])).toEqual([]);
    expect(reponsesAConfirmer(gardees([proposition()]), [], [offre({ statut: "Entrevue" })])).toEqual([]);
    expect(reponsesAConfirmer(gardees([proposition()]), [], [offre({ statut: "Refusee" })])).toEqual([]);
  });

  it("trie du plus récent au plus ancien", () => {
    const l = reponsesAConfirmer(
      gardees([proposition({ courrielId: "a", recuLe: "2026-10-10T10:00:00.000Z" }), proposition({ courrielId: "b", recuLe: "2026-10-20T10:00:00.000Z" })]),
      [],
      [offre()],
    );
    expect(l.map((r) => r.courrielId)).toEqual(["b", "a"]);
  });

  it("valide l'état gardé à la frontière : une forme inattendue vaut « rien »", () => {
    expect(lirePropositionsGardees({ luLe: "x" })).toBeNull();
    expect(lirePropositionsGardees(null)).toBeNull();
    expect(lirePropositionsGardees(gardees([proposition({ statutPropose: "Inconnu" as never })]))).toBeNull();
    expect(lireTraitees("n'importe quoi")).toEqual([]);
  });

  it("ajouterTraitee garde une entrée par courriel et borne la liste", () => {
    const un = ajouterTraitee([], { courrielId: "m1", action: "ecartee", le: "a" });
    expect(ajouterTraitee(un, { courrielId: "m1", action: "confirmee", le: "b" })).toEqual([{ courrielId: "m1", action: "confirmee", le: "b" }]);
    let liste: Traitee[] = [];
    for (let i = 0; i < 350; i++) liste = ajouterTraitee(liste, { courrielId: `m${i}`, action: "ecartee", le: "x" });
    expect(liste).toHaveLength(300);
    expect(liste.at(-1)?.courrielId).toBe("m349");
  });
});

describe("« Confirmer » écrit, « Écarter » n'écrit rien dans le suivi", () => {
  it("confirmer pose le statut GARDÉ par le serveur, par modifierOffre, et note le courriel comme traité", async () => {
    expect(await confirmerReponse("m1")).toEqual({ ok: true });
    expect(etat.ecritures).toEqual([[OFFRE.id, { statut: "Entrevue" }]]);
    expect(etat.traiteesEcrites).toHaveLength(1);
    expect((etat.traiteesEcrites[0] as Traitee[])[0]).toMatchObject({ courrielId: "m1", action: "confirmee" });
  });

  it("écarter n'appelle JAMAIS modifierOffre : le suivi de l'offre reste identique", async () => {
    expect(await ecarterReponse("m1")).toEqual({ ok: true });
    expect(etat.ecritures).toEqual([]);
    expect((etat.traiteesEcrites[0] as Traitee[])[0]).toMatchObject({ courrielId: "m1", action: "ecartee" });
  });

  it("un courriel inconnu du serveur n'écrit rien (aucun statut venu du client)", async () => {
    const r = await confirmerReponse("forge");
    expect(r.ok).toBe(false);
    expect(etat.ecritures).toEqual([]);
  });

  it("n'écrit pas par-dessus un statut que Marc a déjà avancé à la main", async () => {
    etat.offre = offre({ statut: "Entrevue" });
    const r = await confirmerReponse("m1");
    expect(r).toEqual({ ok: false, erreur: "Le statut de l'offre a changé depuis : rien n'est écrit." });
    expect(etat.ecritures).toEqual([]);
  });

  it("un courriel déjà traité n'écrit pas deux fois", async () => {
    etat.traitees = [{ courrielId: "m1", action: "confirmee", le: "x" }];
    expect(await confirmerReponse("m1")).toEqual({ ok: true });
    expect(etat.ecritures).toEqual([]);
  });

  it("sans session, ni l'une ni l'autre n'écrit quoi que ce soit", async () => {
    etat.session = false;
    expect(await confirmerReponse("m1")).toEqual({ ok: false, erreur: "Authentification requise." });
    expect(await ecarterReponse("m1")).toEqual({ ok: false, erreur: "Authentification requise." });
    expect(etat.ecritures).toEqual([]);
    expect(etat.traiteesEcrites).toEqual([]);
  });
});

describe("le composant", () => {
  const reponse = reponsesAConfirmer(gardees([proposition()]), [], [offre()]);

  it("montre l'offre, le statut actuel, le statut proposé, la phrase source et les deux gestes", () => {
    const html = renderToStaticMarkup(<ReponsesRecruteurs reponses={reponse} />);
    expect(html).toContain("Réponses de recruteurs");
    expect(html).toContain("Zorbex inc. — Coordonnateur de projets");
    expect(html).toContain("Statut actuel : CV envoyé");
    expect(html).toContain("Entrevue</strong>");
    expect(html).toContain("Nous aimerions vous rencontrer pour une entrevue.");
    expect(html).toContain("Confirmer : Entrevue");
    expect(html).toContain("Écarter");
    expect(html).toContain("Rien n’est changé tant que tu");
  });

  it("n'affiche rien quand il n'y a rien à confirmer", () => {
    expect(renderToStaticMarkup(<ReponsesRecruteurs reponses={[]} />)).toBe("");
  });

  it("le texte d'un courriel est affiché comme du texte, jamais comme du balisage", () => {
    const piege = reponsesAConfirmer(gardees([proposition({ phrase: "<img src=x onerror=alert(1)> Merci" })]), [], [offre()]);
    const html = renderToStaticMarkup(<ReponsesRecruteurs reponses={piege} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("l'accueil et la feuille de style", () => {
  it("l'accueil ne lit JAMAIS Gmail dans le chemin d'affichage : la relecture part dans after()", () => {
    const page = readFileSync("app/page.tsx", "utf8");
    expect(page).not.toContain("lireCourrielsRecus");
    expect(page).toMatch(/after\(\(\) => actualiserSiPerime\(/);
  });

  it("les boutons du bloc gardent la cible tactile du socle", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/\.bouton\s*\{[^}]*min-height:\s*var\(--touche\)/);
    expect(css).toMatch(/\.reponses__actions\s*\{/);
  });
});
