// tests/messagesCarteSimples.test.ts — cartes 15 et 16 : la carte parle en phrases simples,
// sans « géocodage » ni nom de variable d'environnement à l'écran.
//
// Verrou de source : vitest ne collecte pas les `.tsx`.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lire = (chemin: string) => readFileSync(chemin, "utf8");

describe("messages de la carte en phrases simples", () => {
  it("carte vide : pas de « géocodage » dans le texte affiché", () => {
    const src = lire("components/CarteGoogle.tsx");
    expect(src).not.toContain("le géocodage n’est pas encore passé");
    expect(src).toContain("Aucun lieu à afficher pour le moment.");
  });

  it("fond de carte : pas de nom de variable dans le texte affiché", () => {
    const src = lire("components/CarteFiltrable.tsx");
    expect(src).not.toContain("<code>NEXT_PUBLIC_GOOGLE_MAPS_CLIENT_KEY</code>");
    expect(src).toContain("La carte Google n’est pas disponible pour le moment");
  });
});
