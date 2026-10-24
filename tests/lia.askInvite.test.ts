// tests/lia.askInvite.test.ts — mode invité de LIA : sans session, `ask` refuse AVANT tout réseau.

import { describe, expect, it, vi } from "vitest";
import { creerAskInvite, creerIndicateurSession } from "@/lib/lia/askInvite";

const signal = new AbortController().signal;
const reponse = { reponse: "Bonjour" } as never;

describe("creerIndicateurSession", () => {
  it("part à faux, monte à vrai, ne redescend pas", () => {
    const s = creerIndicateurSession();
    expect(s.actif()).toBe(false);
    s.activer();
    expect(s.actif()).toBe(true);
    s.activer();
    expect(s.actif()).toBe(true);
  });

  it("deux indicateurs sont indépendants", () => {
    const a = creerIndicateurSession();
    const b = creerIndicateurSession();
    a.activer();
    expect(b.actif()).toBe(false);
  });
});

describe("creerAskInvite", () => {
  it("sans session : rejette sans appeler ask (aucun réseau), pour que LIA dise « indisponible »", async () => {
    const ask = vi.fn().mockResolvedValue(reponse);
    const garde = creerAskInvite(creerIndicateurSession(), ask);
    await expect(garde("Salut ?", signal)).rejects.toThrow("pas de session");
    expect(ask).not.toHaveBeenCalled();
  });

  it("avec session : délègue question et signal tels quels, rend la réponse", async () => {
    const ask = vi.fn().mockResolvedValue(reponse);
    const session = creerIndicateurSession();
    session.activer();
    const garde = creerAskInvite(session, ask);
    await expect(garde("Salut ?", signal)).resolves.toBe(reponse);
    expect(ask).toHaveBeenCalledWith("Salut ?", signal);
  });

  it("le drapeau est relu à chaque appel : une session vue après coup ouvre ask", async () => {
    const ask = vi.fn().mockResolvedValue(reponse);
    const session = creerIndicateurSession();
    const garde = creerAskInvite(session, ask);
    await expect(garde("1", signal)).rejects.toThrow();
    session.activer();
    await expect(garde("2", signal)).resolves.toBe(reponse);
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("une erreur d'ask connecté est propagée (échec fermé, jamais avalée)", async () => {
    const session = creerIndicateurSession();
    session.activer();
    const garde = creerAskInvite(session, vi.fn().mockRejectedValue(new Error("LIA indisponible (503)")));
    await expect(garde("?", signal)).rejects.toThrow("503");
  });
});
