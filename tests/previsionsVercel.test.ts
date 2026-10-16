// tests/previsionsVercel.test.ts — seule la branche principale se déploie (JobAI#115).
//
// POURQUOI CE VERROU. Le quota de déploiement Vercel est partagé entre les six apps. Sans règle,
// Vercel crée une préversion pour CHAQUE branche poussée. La première forme (`claude/*`, `*/**`)
// coupait les branches à préfixe mais laissait passer une branche à un seul segment (`test`,
// `jules-…`) : constaté dans Hubperso, où une telle branche a créé une préversion.
//
// FORME ACTUELLE, commune à app-template et Hubperso : `**` et `*` coupent tout, `main: true`
// rouvre la seule porte voulue. `*` seul ne couvre pas `claude/x` (pas de `/`), et `**` seul
// couperait aussi `main`.
//
// SÉMANTIQUE (doc Vercel, « Git configuration ») : `git.deploymentEnabled` associe des motifs
// minimatch de branche à un booléen ; une branche non citée se déploie ; une branche qui
// correspond à plusieurs règles se déploie si AU MOINS UNE vaut `true`.
//
// ⚠️ LE DANGER EST DANS L'AUTRE SENS : si la règle visait aussi `main`, la production cesserait
// de se déployer, sans rien de rouge nulle part. D'où les tests « le garde discrimine » : ils
// prouvent que le modèle n'est pas vert à vide, et la vérification d'un déploiement de
// production READY après la fusion fait le reste.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Regles = Record<string, boolean>;

const vercel = JSON.parse(readFileSync(resolve(__dirname, "..", "vercel.json"), "utf8")) as {
  git?: { deploymentEnabled?: Regles | boolean };
  ignoreCommand?: string;
};
const regles = vercel.git?.deploymentEnabled;

/** Motif minimatch réduit à ce que `vercel.json` emploie ici : `**`, `*`, littéral. */
function correspond(motif: string, branche: string): boolean {
  const source = motif
    .split("**")
    .map((morceau) =>
      morceau
        .split("*")
        .map((m) => m.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*"),
    )
    .join(".*");
  return new RegExp(`^${source}$`).test(branche);
}

/** Pur : la règle de la doc Vercel. Défaut `true` ; au moins une règle vraie suffit. */
function sedeploie(branche: string, r: Regles): boolean {
  const applicables = Object.entries(r).filter(([motif]) => correspond(motif, branche));
  if (applicables.length === 0) return true;
  return applicables.some(([, actif]) => actif);
}

function sans(r: Regles, motif: string): Regles {
  return Object.fromEntries(Object.entries(r).filter(([m]) => m !== motif));
}

describe("préversions Vercel — seule la branche principale se déploie", () => {
  it("déclare des règles par branche (pas un booléen global, qui couperait aussi la production)", () => {
    expect(typeof regles, "git.deploymentEnabled doit être un objet de motifs").toBe("object");
  });

  it("déploie `main`", () => {
    expect(sedeploie("main", regles as Regles)).toBe(true);
  });

  it.each([
    "claude/socle-visuel",
    "claude/a/b",
    "agence/session/sujet",
    "feature/essai",
    "dependabot/npm_and_yarn/next-16.4.0",
    "mergify/merge-queue/abc123",
    "test",
    "jules-correctif",
    "main-bis",
    "Main",
  ])("ne déploie pas la branche `%s`", (branche) => {
    expect(sedeploie(branche, regles as Regles)).toBe(false);
  });

  it("le garde discrimine : sans `main: true`, la production serait coupée", () => {
    expect(sedeploie("main", sans(regles as Regles, "main"))).toBe(false);
  });

  it("le garde discrimine : sans `**`, une branche imbriquée se déploierait", () => {
    expect(sedeploie("claude/socle-visuel", sans(regles as Regles, "**"))).toBe(true);
  });

  it("garde `*` en plus de `**`, comme app-template et Hubperso", () => {
    // Ceinture : dans le modèle ci-dessus `**` couvre déjà une branche à un seul segment ; `*`
    // reste posée pour que la règle soit la même, mot pour mot, dans les trois dépôts.
    expect((regles as Regles)["*"]).toBe(false);
  });

  it("garde l'ignoreCommand existant (docs seules : pas de build)", () => {
    expect(vercel.ignoreCommand).toBe("bash scripts/build-necessaire.sh");
  });
});
