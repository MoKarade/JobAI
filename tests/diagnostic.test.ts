// tests/diagnostic.test.ts — le diagnostic de configuration ne doit JAMAIS fuiter de valeur.
//
// Il s'affiche sur une page PUBLIQUE (après un échec de connexion). Sa sécurité tient
// entièrement à une propriété : il ne rend que des booléens. Ce test la verrouille.

import { describe, it, expect } from "vitest";
import { diagnostiquerConfiguration } from "../lib/diagnostic";

// Toutes ces valeurs sont FACTICES. Le marqueur n'est pas décoratif : `tests/piiGuard.test.ts`
// scanne aussi ce fichier, et sa règle est qu'un exemple porte un marqueur reconnaissable.
// Une vraie valeur collée ici n'en aurait pas — et serait donc détectée.
const ENV_COMPLET = {
  AUTH_SECRET: "signature-factice-assez-longue",
  AUTHORIZED_EMAIL: "quelquun@exemple.test",
  DATABASE_URL: "postgresql://user:motdepasse@hote/db",
  HUB_TOKEN: "jeton-factice-du-hub",
};

describe("aucune fuite de valeur", () => {
  it("ne rend que des booléens et du texte fixe", () => {
    const etats = diagnostiquerConfiguration(ENV_COMPLET);
    // C'EST le test qui compte : sérialisé, le diagnostic ne doit contenir AUCUN fragment
    // des valeurs réelles. Si quelqu'un ajoute un jour un champ « aperçu » ou « longueur »,
    // il tombera ici.
    const rendu = JSON.stringify(etats);
    for (const valeur of Object.values(ENV_COMPLET)) {
      expect(rendu, `la valeur « ${valeur.slice(0, 8)}… » ne doit pas fuiter`).not.toContain(
        valeur,
      );
      // Même un fragment de 8 caractères suffirait à amorcer une attaque.
      expect(rendu).not.toContain(valeur.slice(0, 8));
    }
  });

  it("chaque entrée n'a que trois champs, dont un seul booléen d'état", () => {
    for (const e of diagnostiquerConfiguration(ENV_COMPLET)) {
      expect(Object.keys(e).sort()).toEqual(["nom", "presente", "role"]);
      expect(typeof e.presente).toBe("boolean");
    }
  });
});

describe("détection de présence", () => {
  it("voit les variables posées", () => {
    const etats = diagnostiquerConfiguration(ENV_COMPLET);
    expect(etats.every((e) => e.presente)).toBe(true);
  });

  it("voit les variables absentes", () => {
    const etats = diagnostiquerConfiguration({});
    expect(etats.every((e) => !e.presente)).toBe(true);
  });

  it("traite une variable VIDE ou blanche comme absente", () => {
    // Le piège classique du déploiement : la variable existe dans l'interface, mais sa
    // valeur est vide. « Définie » et « utilisable » ne sont pas la même chose.
    const etats = diagnostiquerConfiguration({ AUTH_SECRET: "", AUTHORIZED_EMAIL: "   " });
    expect(etats.find((e) => e.nom === "AUTH_SECRET")?.presente).toBe(false);
    expect(etats.find((e) => e.nom === "AUTHORIZED_EMAIL")?.presente).toBe(false);
  });

  it("couvre les variables réellement nécessaires à la connexion", () => {
    const noms = diagnostiquerConfiguration({}).map((e) => e.nom);
    for (const requise of [
      "AUTH_SECRET",
      "AUTHORIZED_EMAIL",
    ]) {
      expect(noms, `${requise} doit figurer au diagnostic`).toContain(requise);
    }
  });
});
