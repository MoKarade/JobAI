// tests/env.test.ts — « vide » et « absente » ne sont pas la même chose (`[ENV-VIDE-01]`).
//
// LE DÉFAUT QUE CE MODULE FERME, ET POURQUOI IL EST DE CLASSE
//
// `Number("")` vaut **0**, et `Number.isFinite(0)` vaut **true**. Une variable créée puis
// laissée blanche dans l'interface Vercel donne une chaîne vide, pas une absence — donc
// `DOMICILE_LAT` blanc rendait `0`, au large de la Guinée, et TOUTES les distances partaient
// de là. Le coalescement nullish porte le même piège en miroir : `""` n'étant pas nullish,
// `A ?? B` garde `A` vide et n'essaie jamais `B`.
//
// Les deux sites du dépôt passent désormais par ce module. Le SCAN de la fin est ce qui
// empêche un troisième site d'apparaître : une règle qui ne vit que dans un document se
// reperd (règle §9 n°125).

import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { nombreEnv, texteEnv } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("texteEnv", () => {
  it("rend la valeur, débarrassée de ses espaces", () => {
    vi.stubEnv("T_EXEMPLE", "  https://exemple.test  ");
    expect(texteEnv("T_EXEMPLE")).toBe("https://exemple.test");
  });

  it("⚠️ une variable VIDE ou BLANCHE est traitée comme absente", () => {
    vi.stubEnv("T_EXEMPLE", "");
    expect(texteEnv("T_EXEMPLE")).toBeNull();
    vi.stubEnv("T_EXEMPLE", "   ");
    expect(texteEnv("T_EXEMPLE")).toBeNull();
  });

  it("⚠️ la chaîne de repli ENJAMBE une variable blanche", () => {
    // C'est précisément ce que `??` ne faisait pas : `""` n'est pas nullish, donc la
    // première variable gagnait tout en ne portant rien.
    vi.stubEnv("T_PREMIERE", "");
    vi.stubEnv("T_SECONDE", "https://repli.test");
    expect(texteEnv("T_PREMIERE", "T_SECONDE")).toBe("https://repli.test");
  });

  it("rend `null` quand aucune des variables ne porte quoi que ce soit", () => {
    vi.stubEnv("T_PREMIERE", undefined);
    vi.stubEnv("T_SECONDE", "  ");
    expect(texteEnv("T_PREMIERE", "T_SECONDE")).toBeNull();
  });
});

describe("nombreEnv", () => {
  it("convertit une valeur lisible, négatifs et décimales comprises", () => {
    vi.stubEnv("T_NOMBRE", "-71.2080");
    expect(nombreEnv("T_NOMBRE")).toBe(-71.208);
    vi.stubEnv("T_NOMBRE", "0");
    // ⚠️ Un ZÉRO ÉCRIT reste un zéro : le correctif vise la chaîne vide, pas la valeur 0.
    // Sans ce cas, on ne saurait pas distinguer « blanc rejeté » de « zéro rejeté ».
    expect(nombreEnv("T_NOMBRE")).toBe(0);
  });

  it("⚠️ une variable VIDE ou BLANCHE ne devient PAS zéro", () => {
    // Le défaut, en une ligne : `Number("")` et `Number(" ")` valent tous deux 0, et 0 est
    // fini — donc l'ancienne garde `Number.isFinite` les laissait passer.
    vi.stubEnv("T_NOMBRE", "");
    expect(nombreEnv("T_NOMBRE")).toBeNull();
    vi.stubEnv("T_NOMBRE", "   ");
    expect(nombreEnv("T_NOMBRE")).toBeNull();
  });

  it("une valeur illisible ou non finie rend `null`", () => {
    for (const v of ["pas-un-nombre", "Infinity", "NaN"]) {
      vi.stubEnv("T_NOMBRE", v);
      expect(nombreEnv("T_NOMBRE")).toBeNull();
    }
  });
});

describe("⚠️ le scan qui empêche un TROISIÈME site d'apparaître", () => {
  /** Tous les `.ts` de `lib/`, sauf le module qui PORTE la règle. */
  function sourcesLib(): { chemin: string; code: string }[] {
    const racine = resolve(process.cwd(), "lib");
    const sorties: { chemin: string; code: string }[] = [];
    const parcourir = (dossier: string) => {
      for (const e of readdirSync(dossier, { withFileTypes: true })) {
        const chemin = join(dossier, e.name);
        if (e.isDirectory()) parcourir(chemin);
        else if (e.name.endsWith(".ts")) {
          sorties.push({ chemin, code: readFileSync(chemin, "utf8") });
        }
      }
    };
    parcourir(racine);
    return sorties.filter((f) => !f.chemin.endsWith(`${"lib"}/env.ts`));
  }

  it("aucun module ne convertit une variable d'environnement en nombre par lui-même", () => {
    // ⚠️ LE MOTIF EST COMPOSÉ, ET C'EST DÉLIBÉRÉ : l'écrire en toutes lettres dans ce
    // fichier ferait matcher le scan sur sa propre explication. Le piège a été payé deux
    // fois aujourd'hui (une garde qui comptait la PROSE au lieu du code).
    const interdits = ["Number", "parseInt", "parseFloat"].map(
      (f) => new RegExp(`${f}\\(\\s*process\\.env`),
    );
    const offenders = sourcesLib()
      .filter((f) => interdits.some((r) => r.test(f.code)))
      .map((f) => f.chemin);
    expect(offenders).toEqual([]);
  });

  it("⚠️ ANTI-VACUITÉ : le scan lit bien des fichiers, et il SAIT trouver", () => {
    // Sans ce cas, « aucun offender » serait satisfait par un parcours qui ne lit rien.
    const fichiers = sourcesLib();
    expect(fichiers.length).toBeGreaterThan(50);
    const temoin = `${"Number"}(${"process"}.env.EXEMPLE)`;
    expect(new RegExp(`${"Number"}\\(\\s*process\\.env`).test(temoin)).toBe(true);
  });
});
