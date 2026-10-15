// tests/actionsOffrePur.test.ts — les règles pures des actions sur une offre, sans base.
// Valeurs structurelles neutres : seules comptent les formes et les cas limites.

import { describe, it, expect } from "vitest";
import {
  CODE_VIOLATION_UNICITE,
  codeErreurBase,
  dateEnvoiAEcrire,
  premierMessageParChamp,
} from "@/lib/actionsOffrePur";
import { NouvelleOffreSchema } from "@/lib/ajout";

describe("premierMessageParChamp", () => {
  it("rend un objet vide quand il n'y a aucun problème", () => {
    expect(premierMessageParChamp([])).toEqual({});
  });

  it("garde le PREMIER message d'un champ, pas les suivants", () => {
    const champs = premierMessageParChamp([
      { path: ["a"], message: "premier" },
      { path: ["a"], message: "second" },
      { path: ["b"], message: "autre" },
    ]);
    expect(champs).toEqual({ a: "premier", b: "autre" });
  });

  it("ignore un problème sans nom de champ (chemin vide ou indice)", () => {
    expect(
      premierMessageParChamp([
        { path: [], message: "global" },
        { path: [0], message: "indice" },
      ]),
    ).toEqual({});
  });

  it("n'utilise que le premier segment du chemin", () => {
    expect(premierMessageParChamp([{ path: ["a", "b"], message: "m" }])).toEqual({ a: "m" });
  });

  it("accepte les problèmes réels de Zod", () => {
    const parse = NouvelleOffreSchema.safeParse({});
    expect(parse.success).toBe(false);
    if (parse.success) return;
    const champs = premierMessageParChamp(parse.error.issues);
    expect(Object.keys(champs).length).toBeGreaterThan(0);
    for (const message of Object.values(champs)) expect(message.length).toBeGreaterThan(0);
  });
});

describe("codeErreurBase", () => {
  it("lit le code dans `cause` (erreur enveloppée par Drizzle)", () => {
    expect(codeErreurBase({ cause: { code: CODE_VIOLATION_UNICITE } })).toBe("23505");
  });

  it("lit le code directement sur l'erreur à défaut de `cause`", () => {
    expect(codeErreurBase({ code: "42P01" })).toBe("42P01");
  });

  it("`cause.code` gagne sur `code` quand les deux existent", () => {
    expect(codeErreurBase({ cause: { code: "A" }, code: "B" })).toBe("A");
  });

  it("rend undefined sans code, y compris pour une cause sans code", () => {
    expect(codeErreurBase(new Error("x"))).toBeUndefined();
    expect(codeErreurBase({ cause: {} })).toBeUndefined();
  });

  it("ne plante pas sur null, undefined ou une valeur non objet", () => {
    expect(codeErreurBase(null)).toBeUndefined();
    expect(codeErreurBase(undefined)).toBeUndefined();
    expect(codeErreurBase("texte")).toBeUndefined();
  });
});

describe("dateEnvoiAEcrire", () => {
  const jour = "2000-01-02";

  it("pose la date du jour au passage à « CV envoyé » quand aucune date n'existe", () => {
    expect(dateEnvoiAEcrire({ statut: "CVenvoye" }, null, jour)).toBe(jour);
  });

  it("traite une date fournie VIDE comme absente", () => {
    expect(dateEnvoiAEcrire({ statut: "CVenvoye", dateEnvoi: "" }, null, jour)).toBe(jour);
  });

  it("ne réécrit pas une date déjà connue en base", () => {
    expect(dateEnvoiAEcrire({ statut: "CVenvoye" }, "1999-12-31", jour)).toBeUndefined();
  });

  it("respecte la date fournie, même au passage à « CV envoyé »", () => {
    expect(dateEnvoiAEcrire({ statut: "CVenvoye", dateEnvoi: "1999-12-30" }, null, jour)).toBe(
      "1999-12-30",
    );
  });

  it("ne pose rien pour un autre statut", () => {
    expect(dateEnvoiAEcrire({ statut: "Reponse" }, null, jour)).toBeUndefined();
  });

  it("ne pose rien sans statut", () => {
    expect(dateEnvoiAEcrire({}, null, jour)).toBeUndefined();
  });

  it("rend la date fournie telle quelle pour un autre statut, chaîne vide comprise", () => {
    expect(dateEnvoiAEcrire({ dateEnvoi: "1999-12-30" }, null, jour)).toBe("1999-12-30");
    expect(dateEnvoiAEcrire({ dateEnvoi: "" }, "1999-12-31", jour)).toBe("");
  });
});
