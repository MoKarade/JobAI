import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Erreur from "@/app/error";
import Chargement from "@/app/loading";

describe("page d'erreur générale", () => {
  it("dit la panne en français, sans détail technique, avec un bouton Réessayer", () => {
    const err = Object.assign(new Error("secret interne de la base"), { digest: "abc" });
    const html = renderToStaticMarkup(createElement(Erreur, { error: err, reset: () => {} }));
    expect(html).toContain("Une erreur est survenue");
    expect(html).toContain("Réessayer");
    expect(html).not.toContain("secret interne");
  });
});

describe("page de chargement", () => {
  it("dit « Chargement… » et s'annonce aux lecteurs d'écran", () => {
    const html = renderToStaticMarkup(createElement(Chargement));
    expect(html).toContain("Chargement…");
    expect(html).toContain('role="status"');
  });
});
