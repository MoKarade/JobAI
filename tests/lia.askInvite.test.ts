// tests/lia.askInvite.test.ts — mode invité de LIA : sans session, `ask` refuse AVANT tout réseau.

import { describe, expect, it, vi } from "vitest";
import { creerAskInvite, creerEtatInvite, creerIndicateurSession } from "@/lib/lia/askInvite";

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

describe("attendre : la page dit si la session est admise", () => {
  it("déjà admise : vrai tout de suite", async () => {
    const s = creerIndicateurSession();
    s.activer();
    await expect(s.attendre(10_000)).resolves.toBe(true);
  });

  it("admise pendant l'attente : vrai, sans attendre la fin du délai", async () => {
    vi.useFakeTimers();
    const s = creerIndicateurSession();
    const attente = s.attendre(3_000);
    await vi.advanceTimersByTimeAsync(500);
    s.activer();
    await expect(attente).resolves.toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });

  it("jamais admise : faux à la fin du délai (la page est celle d'un invité)", async () => {
    vi.useFakeTimers();
    const attente = creerIndicateurSession().attendre(3_000);
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(attente).resolves.toBe(false);
    vi.useRealTimers();
  });
});

describe("creerEtatInvite : un invité n'appelle jamais /api/lia/etat", () => {
  const etat = { version: 1 } as never;
  const hote = () => ({ lire: vi.fn().mockResolvedValue(etat), ecrire: vi.fn().mockResolvedValue(etat) });

  it("invité : lecture et écriture rendent null sans aucun appel", async () => {
    vi.useFakeTimers();
    const h = hote();
    const garde = creerEtatInvite(creerIndicateurSession(), h, 3_000);
    const lecture = garde.lire();
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(lecture).resolves.toBeNull();
    await expect(garde.ecrire(etat)).resolves.toBeNull();
    expect(h.lire).not.toHaveBeenCalled();
    expect(h.ecrire).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("connecté : délègue tel quel ; la première lecture attend la session vue après coup", async () => {
    vi.useFakeTimers();
    const h = hote();
    const session = creerIndicateurSession();
    const garde = creerEtatInvite(session, h, 3_000);
    const lecture = garde.lire();
    await vi.advanceTimersByTimeAsync(200);
    expect(h.lire).not.toHaveBeenCalled();
    session.activer();
    await expect(lecture).resolves.toBe(etat);
    await expect(garde.ecrire(etat)).resolves.toBe(etat);
    expect(h.lire).toHaveBeenCalledTimes(1);
    expect(h.ecrire).toHaveBeenCalledWith(etat);
    vi.useRealTimers();
  });
});
