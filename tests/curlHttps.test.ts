// tests/curlHttps.test.ts — tout `curl` du dépôt refuse un passage en HTTP (tâche #98).
//
// `curl -L` suit les redirections, et une redirection peut rétrograder en HTTP : l'URL de
// départ en https ne dit rien de là où le serveur envoie ensuite. `--proto '=https'` borne
// la première requête, `--proto-redir '=https'` borne les suivantes. Sans le second, un
// téléchargement dont on vérifie l'empreinte (gitleaks) ou dont on lit le contenu (registre)
// peut transiter en clair sans qu'aucune étape ne le signale.
//
// Le garde lit les fichiers qui LANCENT des commandes : workflows, scripts, hooks. Un curl
// ajouté demain sans les deux drapeaux rougit ici, au lieu d'attendre qu'un analyseur le dise.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RACINE = process.cwd();
const DOSSIERS = [".github", "scripts"];
const EXTENSIONS = [".yml", ".yaml", ".sh", ".bash"];

function fichiers(dossier: string): string[] {
  const absolu = join(RACINE, dossier);
  try {
    statSync(absolu);
  } catch {
    return [];
  }
  return readdirSync(absolu, { recursive: true, encoding: "utf8" })
    .map((f) => join(dossier, f).split("\\").join("/"))
    .filter((f) => EXTENSIONS.some((e) => f.endsWith(e)));
}

/** Les commandes `curl` d'un fichier, continuations `\` recollées, commentaires écartés. */
function commandesCurl(source: string): string[] {
  const recollees = source.replace(/\\\r?\n\s*/g, " ");
  return recollees
    .split(/\r?\n/)
    .filter((ligne) => !ligne.trim().startsWith("#"))
    .filter((ligne) => /(^|[\s;&|(`'"])curl\s/.test(ligne));
}

const A_TESTER = DOSSIERS.flatMap(fichiers).sort();

describe("curl — HTTPS seulement, redirections comprises", () => {
  it("voit bien les fichiers et au moins un curl (sinon le garde est vert à vide)", () => {
    expect(A_TESTER).toContain(".github/workflows/ci.yml");
    expect(A_TESTER).toContain(".github/workflows/sonde-registre.yml");
    const total = A_TESTER.flatMap((f) => commandesCurl(readFileSync(join(RACINE, f), "utf8")));
    expect(total.length).toBeGreaterThanOrEqual(2);
  });

  it("chaque curl porte --proto '=https' ET --proto-redir '=https'", () => {
    const fautes: string[] = [];
    for (const f of A_TESTER) {
      for (const cmd of commandesCurl(readFileSync(join(RACINE, f), "utf8"))) {
        const ok =
          /--proto\s+'=https'/.test(cmd) && /--proto-redir\s+'=https'/.test(cmd);
        if (!ok) fautes.push(`${f} — ${cmd.trim().slice(0, 100)}`);
      }
    }
    expect(fautes, `curl sans les deux drapeaux :\n${fautes.join("\n")}`).toEqual([]);
  });

  describe("l'analyse elle-même", () => {
    it("recolle une commande sur plusieurs lignes", () => {
      const src = "run: |\n  curl -sL --max-time 9 \\\n    \"$URL\" -o x\n";
      const cmds = commandesCurl(src);
      expect(cmds).toHaveLength(1);
      expect(cmds[0]).toContain("$URL");
    });

    it("ignore un commentaire qui parle de curl", () => {
      expect(commandesCurl("# curl suit les redirections\n  # curl -L\n")).toEqual([]);
    });

    it("repère un curl nu, que le garde doit alors refuser", () => {
      expect(commandesCurl("      curl -sSfL https://exemple.invalide/x")).toHaveLength(1);
    });
  });
});
