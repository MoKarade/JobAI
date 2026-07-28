// tests/hubSummaryErreur.test.ts — le chemin de PANNE de l'endpoint du hub.
//
// Fichier séparé parce que `vi.mock` est hissé au niveau du module : mocker l'état ici
// n'affecte pas les autres tests, qui exercent le chemin nominal.
//
// Ce chemin est le plus facile à laisser pourrir : il ne s'exécute jamais en développement,
// et son échec ressemble à un problème de réseau. D'où le test.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HUB_TOKEN_HEADER, validateSummary } from "@mokarade/hub-contract";

vi.mock("../lib/trackerState", () => ({
  getTrackerState: vi.fn(async () => {
    throw new Error("base injoignable");
  }),
}));

const { GET } = await import("../app/api/hub/summary/route");

const JETON = "jeton-de-test-jobai-0123456789abcdef";

function req(): Request {
  return new Request("https://emploi.hubperso.com/api/hub/summary", {
    headers: { [HUB_TOKEN_HEADER]: JETON },
  });
}

beforeEach(() => {
  process.env.HUB_TOKEN = JETON;
  // La panne est attendue : on tait le journal pour ne pas polluer la sortie des tests,
  // tout en vérifiant plus bas qu'elle a bien été TRACÉE.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.HUB_TOKEN;
  vi.restoreAllMocks();
});

describe("état illisible", () => {
  it("répond 200 avec status « error », jamais un 500 muet", async () => {
    // Un 500 se confondrait, côté hub, avec une app injoignable — donc avec un problème
    // de réseau. Le 200 + status « error » dit explicitement : l'app répond, son état ne
    // se lit pas.
    const res = await GET(req());
    expect(res.status).toBe(200);

    const summary = validateSummary(await res.json());
    expect(summary.status).toBe("error");
  });

  it("explique la panne dans une alerte de sévérité « alert »", async () => {
    const summary = validateSummary(await (await GET(req())).json());
    expect(summary.alerts).toHaveLength(1);
    expect(summary.alerts[0]?.severity).toBe("alert");
    expect(summary.alerts[0]?.label.length).toBeGreaterThan(0);
  });

  it("ne publie AUCUNE métrique en cas de panne", async () => {
    // Le piège serait de servir de vieux chiffres ou des zéros : on ne sait rien, on ne
    // dit rien. Un zéro affirmerait « recherche à l'arrêt ».
    const summary = validateSummary(await (await GET(req())).json());
    expect(summary.metrics).toEqual([]);
  });

  it("garde no-store et l'identité de l'app même en panne", async () => {
    const res = await GET(req());
    expect(res.headers.get("cache-control")).toBe("no-store");
    const summary = validateSummary(await res.json());
    expect(summary.app.id).toBe("jobai");
  });

  it("trace la panne — une erreur avalée en silence serait pire que la panne", async () => {
    await GET(req());
    expect(console.error).toHaveBeenCalled();
  });

  it("refuse toujours un jeton invalide, même quand l'état est en panne", async () => {
    // L'ordre compte : l'authentification passe AVANT la lecture de l'état, sinon une
    // panne deviendrait un canal d'information pour un appelant non authentifié.
    const res = await GET(
      new Request("https://emploi.hubperso.com/api/hub/summary", {
        headers: { [HUB_TOKEN_HEADER]: "mauvais" },
      }),
    );
    expect(res.status).toBe(401);
  });
});
