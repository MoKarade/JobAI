// tests/carteGoogle.test.ts — les gardes du lot A d'ADR-0016.
//
// Le test central est ANTI-FUITE : la clé SERVEUR (Places/Routes/Geocoding, sans
// restriction de domaine) ne doit jamais être référencée par un composant client — elle
// serait inlinée dans la page, lisible par n'importe quel visiteur, et ses droits
// facturables avec elle.

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

const DOSSIER = resolve(process.cwd(), "components");

function fichiersClient(): { nom: string; contenu: string }[] {
  return readdirSync(DOSSIER)
    .filter((f) => f.endsWith(".tsx"))
    .map((nom) => ({ nom, contenu: readFileSync(resolve(DOSSIER, nom), "utf8") }))
    .filter((f) => f.contenu.includes('"use client"'));
}

describe("anti-fuite de la clé serveur (ADR-0016, R1)", () => {
  it("le scan a du volume — un scan vide protégerait du vide", () => {
    // La règle FISC-CONST-LINT du CLAUDE.md global : un garde qui scanne prouve son volume,
    // sinon un mauvais chemin le fait passer à vide, protection nulle et silencieuse.
    expect(fichiersClient().length).toBeGreaterThanOrEqual(10);
  });

  it("⚠️ AUCUN composant client ne référence la clé SERVEUR", () => {
    for (const f of fichiersClient()) {
      expect(
        f.contenu.includes("GOOGLE_MAPS_API_KEY") &&
          !f.contenu.includes("NEXT_PUBLIC_GOOGLE_MAPS_CLIENT_KEY"),
        `${f.nom} référence GOOGLE_MAPS_API_KEY — la clé serveur fuirait dans la page`,
      ).toBe(false);
      // Même la mention de la clé serveur SEULE est interdite ; la clé client, elle, est
      // publique par construction (préfixe NEXT_PUBLIC_) et peut apparaître.
      const sansClient = f.contenu.replaceAll("NEXT_PUBLIC_GOOGLE_MAPS_CLIENT_KEY", "");
      expect(
        sansClient.includes("GOOGLE_MAPS_API_KEY"),
        `${f.nom} référence la clé serveur GOOGLE_MAPS_API_KEY`,
      ).toBe(false);
    }
  });

  it("CarteGoogle ne lit PAS process.env — la clé arrive en prop, une seule lecture serveur", () => {
    const contenu = readFileSync(resolve(DOSSIER, "CarteGoogle.tsx"), "utf8");
    expect(contenu.includes("process.env")).toBe(false);
  });
});
