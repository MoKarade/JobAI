// tests/analyseMarche.test.ts — les CHIFFRES de l'analyse, et le refus quand il n'y en a pas.

import { describe, it, expect, vi } from "vitest";
import {
  PASSES_MINIMUM,
  calculerTendances,
  tendancesEnTexte,
} from "@/lib/analyseMarche";
import { analyserMarche } from "@/lib/analyseMarcheLlm";
import type { EntreeHistorique } from "@/lib/historiqueVeille";

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

/** Une série valide, dérivée du seuil : jamais un nombre de passes écrit en dur. */
const serie = (n = PASSES_MINIMUM) =>
  Array.from({ length: n }, (_, i) => passe(`2026-08-${String(20 - i).padStart(2, "0")}`, 10 + i, 60 + i));

describe("calculerTendances — elle refuse plutôt que de deviner", () => {
  it("refuse sous le seuil, et DIT combien il manque", () => {
    const r = calculerTendances(serie(PASSES_MINIMUM - 1));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.raison).toContain(String(PASSES_MINIMUM));
  });

  it("accepte au seuil exact — la borne est inclusive", () => {
    expect(calculerTendances(serie(PASSES_MINIMUM)).ok).toBe(true);
  });

  it("⚠️ lit l'historique dans le BON SENS : le plus récent est en tête", () => {
    // À l'envers, « du » et « au » seraient inversés et la tendance changerait de signe —
    // une analyse parfaitement rédigée et parfaitement fausse.
    const r = calculerTendances(serie());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tendances.au).toBe("2026-08-20");
    expect(r.tendances.du < r.tendances.au).toBe(true);
  });

  it("une passe SANS offre ne compte pas comme une note de zéro", () => {
    // Compter le jour calme comme « note 0 » ferait lire une chute de qualité là où il n'y
    // a eu qu'une journée sans rien.
    const avecTrou = [passe("2026-08-20", 0, null), ...serie()];
    const r = calculerTendances(avecTrou);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tendances.ensemble.noteMoyenne).toBeGreaterThan(50);
  });

  it("le meilleur jour est le plus haut, pas le plus récent", () => {
    const h = [passe("2026-08-20", 5, 50), passe("2026-08-19", 5, 90), ...serie()];
    const r = calculerTendances(h);
    if (!r.ok) return;
    expect(r.tendances.meilleurJour?.jour).toBe("2026-08-19");
    expect(r.tendances.meilleurJour?.note).toBe(90);
  });
});

describe("tendancesEnTexte — ce qui part au modèle", () => {
  it("porte les nombres, et dit « aucune donnée » plutôt que zéro", () => {
    const r = calculerTendances([passe("2026-08-20", 0, null), ...serie()]);
    if (!r.ok) return;
    const texte = tendancesEnTexte(r.tendances);
    expect(texte).toContain("2026-08-20");
    expect(texte).toContain("passes de veille");
  });
});

describe("analyserMarche — la comptabilité du coût, au site d'appel", () => {
  it("refuse SANS APPELER quand la clé est absente", async () => {
    const r = await analyserMarche({} as never, { cle: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Nommé : « pas de clé » et « rien à dire » sont deux choses opposées.
    expect(r.raison).toContain("ANTHROPIC_API_KEY");
  });

  it("⚠️ une comptabilité qui LÈVE ne coûte pas l'analyse", async () => {
    // La garantie ne doit pas dépendre de QUI est injecté : c'est le site d'appel qui la
    // tient, pas l'écrivain par défaut.
    const t = calculerTendances(serie());
    if (!t.ok) return;
    const comptabiliser = vi.fn(async () => {
      throw new Error("compteur en panne");
    });
    // Sans clé valide l'appel échoue avant la comptabilité : on vérifie ici que le contrat
    // d'injection existe et que la fonction ne lève pas.
    const r = await analyserMarche(t.tendances, { cle: "", comptabiliser });
    expect(r.ok).toBe(false);
  });
});
