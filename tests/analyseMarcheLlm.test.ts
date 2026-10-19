// tests/analyseMarcheLlm.test.ts — l'appel des tendances de la veille, avec un faux SDK (JobAI#158, ADR-0035).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PASSES_MINIMUM, calculerTendances } from "@/lib/analyseMarche";
import type { EntreeHistorique } from "@/lib/historiqueVeille";

let envoi: Record<string, unknown> = {};
let contenuRendu: unknown[] = [];
let arretRendu = "end_turn";
const usageRendu = { input_tokens: 800, output_tokens: 200 };

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async (args: Record<string, unknown>) => {
        envoi = args;
        return { stop_reason: arretRendu, content: contenuRendu, usage: usageRendu };
      },
    };
  },
}));

const { analyserMarche } = await import("@/lib/analyseMarcheLlm");

const passe = (jour: string, nouvelles: number, note: number | null): EntreeHistorique => ({
  jour,
  fini: `${jour}T11:05:00.000Z`,
  declencheur: "cron-veille",
  trouvees: 1500,
  nouvelles,
  perimees: 2,
  revenues: 0,
  enSursis: 3,
  noteMoyenneNouvelles: note,
  suivies: 200 + nouvelles,
});

function tendances() {
  const t = calculerTendances(
    Array.from({ length: PASSES_MINIMUM }, (_, i) => passe(`2026-08-${String(20 - i).padStart(2, "0")}`, 10 + i, 60 + i)),
  );
  if (!t.ok) throw new Error("série de test invalide");
  return t.tendances;
}

describe("analyserMarche — l'appel à Haiku 5.5", () => {
  const comptabiliser = vi.fn(async (_usage: unknown, _modele: string) => {});

  beforeEach(() => {
    envoi = {};
    arretRendu = "end_turn";
    contenuRendu = [{ type: "text", text: "Le marché est stable." }];
    comptabiliser.mockClear();
  });

  it("appelle claude-haiku-5-5, compte l'usage sous ce nom, sans réglage d'échantillonnage", async () => {
    const r = await analyserMarche(tendances(), { cle: "k", comptabiliser });
    expect(r).toEqual({ ok: true, texte: "Le marché est stable.", tronquee: false });
    expect(envoi.model).toBe("claude-haiku-5-5");
    expect(comptabiliser).toHaveBeenCalledWith(usageRendu, "claude-haiku-5-5");
    // Haiku 5.5 rend 400 sur tout temperature / top_p / top_k non défaut : on n'en envoie aucun.
    for (const cle of ["temperature", "top_p", "top_k"]) expect(envoi).not.toHaveProperty(cle);
  });

  it("l'effort est « low » : quatre phrases sur des chiffres donnés ne demandent pas de pensée", async () => {
    await analyserMarche(tendances(), { cle: "k", comptabiliser });
    expect(envoi.output_config).toEqual({ effort: "low" });
    // Le plafond laisse de la place à la pensée et au tokenizer plus gourmand (700 avant Haiku 5.5).
    expect(envoi.max_tokens).toBe(1200);
  });

  it("lit les blocs par type : un bloc de pensée en tête ne devient pas l'analyse", async () => {
    contenuRendu = [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: "Trois nouvelles offres par passe." },
    ];
    const r = await analyserMarche(tendances(), { cle: "k", comptabiliser });
    expect(r).toEqual({ ok: true, texte: "Trois nouvelles offres par passe.", tronquee: false });
  });

  it("une réponse coupée par max_tokens se DIT, et une pensée seule n'est pas une analyse", async () => {
    arretRendu = "max_tokens";
    const coupee = await analyserMarche(tendances(), { cle: "k", comptabiliser });
    expect(coupee).toMatchObject({ ok: true, tronquee: true });

    contenuRendu = [{ type: "thinking", thinking: "", signature: "sig" }];
    const vide = await analyserMarche(tendances(), { cle: "k", comptabiliser });
    expect(vide).toEqual({ ok: false, raison: "Le modèle n'a rien rendu de lisible." });
    // L'appel est facturé même quand rien n'est lisible.
    expect(comptabiliser).toHaveBeenCalledTimes(2);
  });
});
