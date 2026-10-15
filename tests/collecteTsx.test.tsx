// Verrou : vitest collecte bien les fichiers `.test.tsx` et compile leur JSX.
// Sans `.tsx` dans `include`, un test de composant n'était jamais exécuté (et ne disait rien).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

describe("collecte des tests .tsx", () => {
  it("exécute un test .tsx et compile son JSX", () => {
    expect(renderToStaticMarkup(<p className="x">bonjour</p>)).toBe('<p class="x">bonjour</p>');
  });
});
