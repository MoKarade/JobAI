import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Introuvable from "@/app/not-found";

describe("page introuvable", () => {
  it("parle français et propose de revenir aux offres", () => {
    const html = renderToStaticMarkup(<Introuvable />);
    expect(html).toContain("Page introuvable");
    expect(html).toContain("Toutes les offres");
    expect(html).toContain('href="/"');
    expect(html).not.toMatch(/not found|404/i);
  });
});
