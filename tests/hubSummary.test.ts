// tests/hubSummary.test.ts — l'endpoint du hub et la construction du summary.
//
// Le payload est validé par le VRAI schéma du contrat (`validateSummary`), jamais par une
// copie locale : si le contrat évolue et que JobAI ne suit pas, ces tests doivent tomber.

import { describe, it, expect } from "vitest";
import {
  CONTRACT_VERSION,
  HUB_TOKEN_HEADER,
  validateSummary,
} from "@mokarade/hub-contract";
import { GET } from "../app/api/hub/summary/route";
import { APP, LIBELLE_HEROS, construireSummary } from "../lib/hubSummary";
import { resumer } from "../lib/suivi";
import { SEED } from "../lib/seed";
import type { ResumeSuivi } from "../lib/types";

const JETON = "jeton-de-test-jobai-0123456789abcdef";
const LE = "2026-07-28T12:00:00.000Z";

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://emploi.hubperso.com/api/hub/summary", { headers });
}

async function withHubToken(value: string | undefined, fn: () => Promise<void>) {
  const before = process.env.HUB_TOKEN;
  if (value === undefined) delete process.env.HUB_TOKEN;
  else process.env.HUB_TOKEN = value;
  try {
    await fn();
  } finally {
    if (before === undefined) delete process.env.HUB_TOKEN;
    else process.env.HUB_TOKEN = before;
  }
}

describe("GET /api/hub/summary", () => {
  // ADR-0001 : 503 et non 500 — l'app fonctionne, c'est l'intégration qui n'est pas branchée.
  it("503 si HUB_TOKEN non configuré, sans fuite de summary", async () => {
    await withHubToken(undefined, async () => {
      const res = await GET(req({ [HUB_TOKEN_HEADER]: JETON }));
      expect(res.status).toBe(503);
      expect(await res.text()).not.toContain("contractVersion");
    });
  });

  it("401 sans jeton et avec un jeton invalide", async () => {
    await withHubToken(JETON, async () => {
      expect((await GET(req())).status).toBe(401);
      expect((await GET(req({ [HUB_TOKEN_HEADER]: "mauvais" }))).status).toBe(401);
    });
  });

  it("200 « en construction » tant qu'aucune donnée réelle n'existe", async () => {
    // Sans DATABASE_URL, `getTrackerState` rend null : c'est « pas branché », pas une panne
    // et surtout pas des compteurs à zéro.
    await withHubToken(JETON, async () => {
      const res = await GET(req({ [HUB_TOKEN_HEADER]: JETON }));
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toBe("no-store");

      const summary = validateSummary(await res.json());
      expect(summary.contractVersion).toBe(CONTRACT_VERSION);
      expect(summary.status).toBe("building");
      expect(summary.metrics).toEqual([]);
    });
  });

  it("publie l'identité JobAI attendue par le hub", async () => {
    // L'`id` est la clé de rapprochement avec `Hubperso/lib/sources.ts` : le changer sans
    // changer l'entrée du hub casse le widget en silence.
    await withHubToken(JETON, async () => {
      const summary = validateSummary(await (await GET(req({ [HUB_TOKEN_HEADER]: JETON }))).json());
      expect(summary.app).toEqual(APP);
      expect(summary.app.id).toBe("jobai");
      expect(summary.app.color).toBe("#f2a31b");
    });
  });
});

describe("construction du summary", () => {
  const resume = resumer(SEED, "2026-08-14");

  it("produit un payload conforme au vrai schéma du contrat", () => {
    expect(() => validateSummary(construireSummary(resume, LE))).not.toThrow();
  });

  it("met l'ARRIVAGE en position 0 — le gros chiffre du widget", () => {
    // ⚠️ TEST INVERSÉ EN PLACE, il affirmait le contraire (« la meilleure offre en position
    // 0 », ADR-0001). Décision Marc du 2026-09-21, ADR-0020 : le héros est le nombre de
    // nouvelles offres. Le supprimer laisserait croire que la position 0 n'a jamais été
    // décidée — or elle l'a été deux fois, et la seconde fois pour une raison mesurable.
    const s = construireSummary(resume, LE);
    expect(s.metrics[0]?.label).toBe(LIBELLE_HEROS);
    expect(s.metrics[0]?.value).toBe(resume.nouvelles);
    expect(s.metrics[0]?.primary).toBe(true);

    // …et la meilleure offre n'a pas disparu : elle passe en métrique SECONDAIRE.
    const meilleure = s.metrics.find((m) => m.label.startsWith("Meilleure"));
    expect(meilleure?.value).toBe(92);
    expect(meilleure?.label).toContain("IEL");
    expect(meilleure?.primary).toBeUndefined();
  });

  it("le libellé du héros est FIGÉ à sa valeur exacte — le renommer jette la courbe", () => {
    // ⚠️ Sans cette assertion, toutes les autres sont AUTO-SATISFAITES : elles comparent à
    // `LIBELLE_HEROS`, donc renommer la constante les laisse toutes vertes — et pendant ce
    // temps le hub, qui indexe l'historique par le libellé PUBLIÉ, perdrait la série
    // accumulée et la carte retomberait sur « pas encore d'historique ».
    //
    // Ce n'est pas un golden qu'on re-base : c'est une clé partagée avec un autre dépôt
    // (`Hubperso/lib/historique.ts`), et la changer se décide — voir ADR-0020.
    expect(LIBELLE_HEROS).toBe("Nouvelles (7 j)");
  });

  it("le libellé du héros ne dépend PAS des données — c'est la clé de la courbe", () => {
    // ⚠️ LA GARDE QUI COMPTE, et la raison d'être du lot. Le hub indexe l'historique d'une
    // métrique par son LIBELLÉ (`serieMetrique(historique, label)`). L'ancien héros portait
    // le nom de l'entreprise : il changeait de clé à chaque changement d'offre de tête, donc
    // sa série repartait de zéro et la carte disait « pas encore d'historique ».
    //
    // DISCRIMINANT : sur le code d'avant, ces deux libellés valaient « Meilleure : IEL » et
    // « Meilleure : Autre entreprise » — le test rougit. Il rougira de nouveau si un lot
    // futur remet une part variable (entreprise, date, compte) dans le titre de la carte.
    const a = construireSummary(resume, LE);
    const b = construireSummary(
      {
        ...resume,
        nouvelles: resume.nouvelles + 7,
        meilleure: { entreprise: "Autre entreprise", poste: "Autre poste", score: 71 },
      },
      "2026-09-21T12:00:00.000Z",
    );
    const heros = (x: typeof a) => x.metrics.find((m) => m.primary)!.label;
    expect(heros(a)).toBe(heros(b));
    // Anti-vacuité : les deux résumés DIFFÈRENT bien (sinon l'égalité serait triviale).
    expect(a.metrics.find((m) => m.primary)!.value)
      .not.toBe(b.metrics.find((m) => m.primary)!.value);
    expect(a.metrics.find((m) => m.label.startsWith("Meilleure"))?.label)
      .not.toBe(b.metrics.find((m) => m.label.startsWith("Meilleure"))?.label);
  });

  it("respecte les bornes du contrat : 6 métriques au plus, libellés courts", () => {
    const s = construireSummary(resume, LE);
    expect(s.metrics.length).toBeLessThanOrEqual(6);
    for (const m of s.metrics) {
      expect(m.label.length, `libellé « ${m.label} »`).toBeLessThanOrEqual(40);
      expect(m.label.length).toBeGreaterThan(0);
    }
  });

  it("tronque un nom d'entreprise trop long au lieu d'être rejeté par le contrat", () => {
    const long: ResumeSuivi = {
      ...resume,
      meilleure: {
        entreprise: "Entreprise au nom démesurément long qui dépasse la borne du contrat",
        poste: "Poste",
        score: 88,
      },
    };
    const s = construireSummary(long, LE);
    // ⚠️ VISÉ PAR LE LIBELLÉ, plus par la position : depuis ADR-0020 la position 0 est
    // l'arrivage, dont le libellé est une constante de 15 caractères — l'assertion serait
    // devenue VRAIE sans plus rien mesurer, le pire des verts.
    const meilleure = s.metrics.find((m) => m.label.startsWith("Meilleure"));
    expect(meilleure).toBeDefined();
    expect(meilleure!.label.length).toBeLessThanOrEqual(40);
    expect(meilleure!.label.endsWith("…")).toBe(true);
    expect(() => validateSummary(s)).not.toThrow();
  });

  it("propose une action pour ouvrir l'app", () => {
    const s = construireSummary(resume, LE);
    expect(s.actions).toHaveLength(1);
    expect(s.actions[0]?.kind).toBe("link");
    expect(s.actions[0]?.href).toBe(APP.url);
  });

  it("n'invente aucune métrique quand le suivi est vide", () => {
    const vide = resumer([], "2026-08-14");
    const s = construireSummary(vide, LE);
    // « Nouvelles » est le héros dans TOUS les cas depuis ADR-0020 — ici la remarque qui
    // compte est qu'un compteur à zéro y est une information VRAIE (« rien n'est arrivé
    // cette semaine »), pas une métrique inventée : il reste publié, et mis en avant.
    expect(s.metrics[0]?.label).toBe(LIBELLE_HEROS);
    expect(s.metrics[0]?.primary).toBe(true);
    expect(s.metrics[0]?.value).toBe(0);
    // ⚠️ Et la moyenne, elle, est ABSENTE : sans nouvelle à moyenner, publier un 0
    // annoncerait des offres nulles là où il n'y a pas d'offre (garde-fou n°3).
    expect(s.metrics.some((m) => m.label === "Note moyenne des nouvelles")).toBe(false);
    expect(s.alerts.some((a) => a.severity === "info")).toBe(true);
    expect(() => validateSummary(s)).not.toThrow();
  });

  it("reporte fidèlement les compteurs du résumé", () => {
    const s = construireSummary(resume, LE);
    const parLibelle = Object.fromEntries(s.metrics.map((m) => [m.label, m.value]));
    expect(parLibelle["Offres suivies"]).toBe(resume.actives);
    expect(parLibelle["Nouvelles (7 j)"]).toBe(resume.nouvelles);
    // Les deux compteurs de candidature tiennent dans UN créneau — le contrat en plafonne
    // six, et l'arbitrage est écrit dans `hubSummary.ts`. Les deux chiffres restent lisibles.
    expect(parLibelle["CV envoyés · réponses"]).toBe(
      `${resume.cvEnvoyes} · ${resume.reponses}`,
    );
  });

  /**
   * Le strict minimum que `resumer` lit — pas une `Offre` complète.
   *
   * Une fixture qui porte plus que ce que la fonction consulte finit par faire croire que
   * les champs en trop comptent : ici, la forme EST la documentation de ce qui est lu.
   */
  function pourResume(champs: { dateReperage: string; score: number | null }) {
    return {
      histo: false,
      statut: "Identifiee" as const,
      entreprise: "Entreprise",
      poste: "Poste",
      perimeeLe: null,
      ...champs,
    };
  }

  it("publie la note moyenne des nouvelles, et jamais plus de six métriques", () => {
    const avecNouvelles = resumer(
      [
        pourResume({ dateReperage: "2026-08-14", score: 82 }),
        pourResume({ dateReperage: "2026-08-14", score: 60 }),
      ],
      "2026-08-14",
    );
    const s = construireSummary(avecNouvelles, LE);
    const parLibelle = Object.fromEntries(s.metrics.map((m) => [m.label, m.value]));
    expect(parLibelle["Nouvelles (7 j)"]).toBe(2);
    expect(parLibelle["Note moyenne des nouvelles"]).toBe(71);
    // Le plafond du contrat est une contrainte DURE : le dépasser ferait échouer la
    // validation chez le hub, c'est-à-dire un widget cassé plutôt qu'une métrique en trop.
    expect(s.metrics.length).toBeLessThanOrEqual(6);
    expect(() => validateSummary(s)).not.toThrow();
  });

  it("horodate avec la date fournie, sans lire l'horloge", () => {
    expect(construireSummary(resume, LE).generatedAt).toBe(LE);
  });
});
