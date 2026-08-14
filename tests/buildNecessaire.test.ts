// tests/buildNecessaire.test.ts — le script qui décide si un commit se déploie.
//
// ⚠️ CE SCRIPT PEUT FIGER LA PRODUCTION SANS RIEN DIRE, et c'est pour ça qu'il est testé.
//
// La convention Vercel est contre-intuitive : sortir avec 0 IGNORE le build, sortir avec 1
// le LANCE. Une inversion ne produirait pas « un déploiement de trop » — elle les
// supprimerait TOUS, la production resterait sur un commit ancien, et rien ne le signalerait :
// la CI serait verte, le site répondrait, et le code poussé ne serait nulle part. Ce dépôt
// connaît déjà cette panne sous une autre forme (« Redeploy rejoue le commit du déploiement
// existant », « CI verte ≠ code en production »).
//
// Le test exécute le VRAI script sur de VRAIS dépôts git jetables. Un test qui simulerait
// `git diff` validerait mes suppositions sur git, pas git.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";

/**
 * Ces cas montent un VRAI dépôt git (init, add, commit) puis exécutent le script en bash.
 * Le défaut de vitest est de 5 s, et on l'a frôlé puis dépassé (7,5 s mesurées sur une
 * machine chargée) : un test qui lance des processus n'a pas à hériter d'un défaut pensé
 * pour des fonctions pures. Sans borne explicite, il devient rouge selon l'humeur de la
 * machine — et un rouge qui n'accuse pas le code est exactement ce qui apprend à ignorer
 * la CI. La valeur est dimensionnée sur ce que le test FAIT, pas sur sa durée du jour.
 */
const TIMEOUT_GIT = 30_000;

let atelier: string;

/** Un dépôt jetable avec un premier commit, prêt à recevoir le commit à juger. */
function depot(): string {
  const d = mkdtempSync(resolve(atelier, "depot-"));
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: d, stdio: "pipe" });
  };
  git("init", "-q");
  git("config", "user.email", "essai@exemple.invalide");
  git("config", "user.name", "Essai");
  writeFileSync(resolve(d, "socle.txt"), "socle\n");
  // ⚠️ LE SCRIPT ENTRE DANS LE SOCLE, PAS DANS LE COMMIT JUGÉ.
  //
  // Copié après le premier commit, il se retrouvait dans le `git add -A` du commit à
  // juger — donc dans le diff. Le cas « documentation seule » construisait alors à cause
  // du script lui-même, et les cas « CONSTRUIT » passaient en partie pour cette mauvaise
  // raison : verts, mais sans prouver ce qu'ils annonçaient. Un harnais qui contamine son
  // propre sujet ne teste que lui-même.
  cpSync(
    resolve(process.cwd(), "scripts/build-necessaire.sh"),
    resolve(d, "build-necessaire.sh"),
  );
  git("add", "-A");
  git("commit", "-qm", "socle");
  return d;
}

/** Committe les fichiers donnés, puis rend le code de sortie du script. */
function jugerApres(fichiers: string[]): number {
  const d = depot();
  for (const f of fichiers) {
    const chemin = resolve(d, f);
    mkdirSync(dirname(chemin), { recursive: true });
    writeFileSync(chemin, "contenu\n");
  }
  execFileSync("git", ["add", "-A"], { cwd: d, stdio: "pipe" });
  execFileSync("git", ["commit", "-qm", "a juger"], { cwd: d, stdio: "pipe" });

  try {
    execFileSync("bash", ["build-necessaire.sh"], { cwd: d, stdio: "pipe" });
    return 0;
  } catch (err) {
    return (err as { status?: number }).status ?? -1;
  }
}

const IGNORE = 0;
const CONSTRUIT = 1;

beforeAll(() => {
  atelier = mkdtempSync(resolve(tmpdir(), "jobai-build-"));
});

afterAll(() => {
  rmSync(atelier, { recursive: true, force: true });
});

describe("ce commit change-t-il ce que le site sert ?", () => {
  it("CONSTRUIT dès qu'un fichier de code est touché", () => {
    // Le sens qui compte le plus : rater ce cas fige la production en silence.
    expect(jugerApres(["lib/actions.ts"])).toBe(CONSTRUIT);
    expect(jugerApres(["components/Carte.tsx"])).toBe(CONSTRUIT);
    expect(jugerApres(["package.json"])).toBe(CONSTRUIT);
    expect(jugerApres(["drizzle/0011_x.sql"])).toBe(CONSTRUIT);
  }, TIMEOUT_GIT);

  it("CONSTRUIT si UN SEUL fichier de code accompagne de la documentation", () => {
    // Le piège d'un « tous les fichiers sont exemptés » mal écrit : un lot mixte est un lot
    // de code. La liste des exemptions est fermée, celle de ce qui construit est ouverte.
    expect(jugerApres(["CLAUDE.md", "docs/note.md", "lib/actions.ts"])).toBe(CONSTRUIT);
  }, TIMEOUT_GIT);

  it("IGNORE un commit qui ne touche que documentation et tests", () => {
    // Le cas qui a épuisé le quota : douze déploiements en deux heures, dont plusieurs pour
    // des `.md` et des tests — c'est-à-dire rien de ce que le site sert.
    expect(jugerApres(["CLAUDE.md"])).toBe(IGNORE);
    expect(jugerApres(["HANDOVER.md", "docs/LESSONS.md"])).toBe(IGNORE);
    expect(jugerApres(["tests/carte.test.ts", "BACKLOG.md"])).toBe(IGNORE);
    expect(jugerApres([".github/workflows/ci.yml"])).toBe(IGNORE);
  }, TIMEOUT_GIT);

  it("CONSTRUIT quand il n'y a pas d'historique à comparer", () => {
    // Le clone de Vercel est superficiel : `HEAD^` peut manquer. C'est un cas NORMAL, et
    // il doit se résoudre en construisant — l'incertitude ne justifie jamais un silence.
    const d = mkdtempSync(resolve(atelier, "orphelin-"));
    execFileSync("git", ["init", "-q"], { cwd: d, stdio: "pipe" });
    execFileSync("git", ["config", "user.email", "essai@exemple.invalide"], { cwd: d });
    execFileSync("git", ["config", "user.name", "Essai"], { cwd: d });
    writeFileSync(resolve(d, "seul.ts"), "export const A = 1;\n");
    execFileSync("git", ["add", "-A"], { cwd: d, stdio: "pipe" });
    execFileSync("git", ["commit", "-qm", "premier"], { cwd: d, stdio: "pipe" });
    cpSync(resolve(process.cwd(), "scripts/build-necessaire.sh"), resolve(d, "s.sh"));

    let code = 0;
    try {
      execFileSync("bash", ["s.sh"], { cwd: d, stdio: "pipe" });
    } catch (err) {
      code = (err as { status?: number }).status ?? -1;
    }
    expect(code).toBe(CONSTRUIT);
  }, TIMEOUT_GIT);
});

describe("le câblage", () => {
  it("vercel.json désigne bien ce script", () => {
    // Un script parfait que rien n'appelle ne protège de rien — et l'inverse (un
    // `ignoreCommand` qui pointe vers un fichier absent) fait échouer chaque déploiement.
    const vercel = JSON.parse(
      execFileSync("cat", ["vercel.json"], { cwd: process.cwd(), encoding: "utf8" }),
    ) as { ignoreCommand?: string };
    expect(vercel.ignoreCommand).toContain("scripts/build-necessaire.sh");
  });
});
