import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BandeauResume } from "../components/BandeauResume";

describe("BandeauResume", () => {
  it("rend les trois chiffres dans l'ordre sans alerte quand aRelancer est nul", () => {
    const html = renderToStaticMarkup(
      <BandeauResume suivies={12} aRelancer={0} notees80Plus={3} />
    );

    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Résumé du suivi"');

    const indexSuivies = html.indexOf("suivies");
    const indexARelancer = html.indexOf("à relancer");
    const indexNotees80Plus = html.indexOf("notées 80+");

    expect(indexSuivies).toBeGreaterThan(-1);
    expect(indexARelancer).toBeGreaterThan(indexSuivies);
    expect(indexNotees80Plus).toBeGreaterThan(indexARelancer);

    expect(html).toContain('<span class="resume__n">12</span>');
    expect(html).toContain('<span class="resume__n">0</span>');
    expect(html).toContain('<span class="resume__n">3</span>');

    expect(html).not.toContain("resume__case--alerte");
  });

  it("ajoute resume__case--alerte uniquement sur la case à relancer quand aRelancer > 0", () => {
    const html = renderToStaticMarkup(
      <BandeauResume suivies={10} aRelancer={2} notees80Plus={5} />
    );

    const occurrences = (html.match(/resume__case--alerte/g) || []).length;
    expect(occurrences).toBe(1);

    expect(html).toContain(
      '<div class="resume__case resume__case--alerte"><span class="resume__n">2</span><span class="resume__l">à relancer</span></div>'
    );
  });

  it("affiche 0 pour les trois cases sans alerte quand toutes les valeurs sont nulles", () => {
    const html = renderToStaticMarkup(
      <BandeauResume suivies={0} aRelancer={0} notees80Plus={0} />
    );

    const occurrencesZero = (html.match(/<span class="resume__n">0<\/span>/g) || []).length;
    expect(occurrencesZero).toBe(3);

    expect(html).not.toContain("resume__case--alerte");
  });

  it("affiche un grand nombre tel quel sans formatage", () => {
    const html = renderToStaticMarkup(
      <BandeauResume suivies={6514} aRelancer={0} notees80Plus={0} />
    );

    expect(html).toContain('<span class="resume__n">6514</span>');
  });
});
