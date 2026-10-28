// Verrou : le bandeau de résumé de l'accueil affiche trois chiffres, et « à relancer »
// ne vire à l'alerte que s'il n'est pas nul.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BandeauResume } from "@/components/BandeauResume";

const rendre = (suivies: number, aRelancer: number, notees80Plus: number) =>
  renderToStaticMarkup(<BandeauResume suivies={suivies} aRelancer={aRelancer} notees80Plus={notees80Plus} />);

const nombres = (html: string) => [...html.matchAll(/<span class="resume__n">([^<]*)<\/span>/g)].map((m) => m[1]);
const nbAlertes = (html: string) => html.split("resume__case--alerte").length - 1;

describe("BandeauResume", () => {
  it("affiche le groupe, les trois libellés dans l'ordre et les trois nombres, sans alerte", () => {
    const html = rendre(12, 0, 3);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Résumé du suivi"');
    const i1 = html.indexOf("suivies</span>");
    const i2 = html.indexOf("à relancer</span>");
    const i3 = html.indexOf("notées 80+</span>");
    expect(i1).toBeGreaterThan(-1);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
    expect(nombres(html)).toEqual(["12", "0", "3"]);
    expect(html).not.toContain("resume__case--alerte");
  });

  it("signale seulement la case « à relancer » quand elle n'est pas nulle", () => {
    const html = rendre(12, 2, 3);
    expect(nbAlertes(html)).toBe(1);
    expect(html).toMatch(/resume__case--alerte"><span class="resume__n">2<\/span><span class="resume__l">à relancer<\/span>/);
  });

  it("affiche trois zéros sans alerte", () => {
    const html = rendre(0, 0, 0);
    expect(nombres(html)).toEqual(["0", "0", "0"]);
    expect(html).not.toContain("resume__case--alerte");
  });

  it("écrit un grand nombre tel quel, sans formatage", () => {
    const html = rendre(6514, 0, 0);
    expect(nombres(html)[0]).toBe("6514");
  });
});
