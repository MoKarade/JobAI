// tests/cvSurface.test.ts — une action qui n'est appelée par rien n'existe pas.
//
// POURQUOI CE FICHIER (`[FERMETURE-03]`, énième récidive)
//
// `reanalyserCv` était écrite, correcte, testée — et appelée par AUCUN composant. Pendant ce
// temps l'écran `/profil` demandait à Marc de s'en servir, à DEUX endroits : la liste affiche
// la raison de l'échec d'extraction (« sans ça, il re-téléverse le même fichier en boucle »),
// et le bloc « À valider » écrit « Relance l'analyse de ce CV ». Aucun bouton nulle part. Le
// seul chemin restant était celui que le premier commentaire voulait éviter.
//
// Les tests de `tests/cvActions.test.ts` passaient tous : ils prouvent que l'action FAIT ce
// qu'elle dit. Ils ne peuvent pas voir qu'elle n'est ATTEIGNABLE par personne — c'est un fait
// sur le reste du dépôt, pas sur le module.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Actions sans appelant, ASSUMÉES, avec leur date et leur raison.
 *
 * ⚠️ C'EST UN INVENTAIRE DE DETTE, PAS UNE LISTE BLANCHE. Il doit DÉCROÎTRE. Une entrée dit
 * « on sait, et voici pourquoi ce n'est pas encore branché » — jamais « cette action a le
 * droit d'être morte ». Un test plus bas interdit qu'elle grandisse.
 */
const SANS_APPELANT_ASSUME: Record<string, string> = {
  // 2026-09-17 : l'écran liste les CV sans offrir de les retirer. Brancher un bouton de
  // SUPPRESSION demande une décision d'interface (confirmation ? annulation ?) que Marc n'a
  // pas prise, et une suppression ne se rejoue pas. Signalé, non branché de ma seule
  // initiative.
  retirerCv: "aucun bouton de suppression sur /profil — décision d'interface en attente",
};

function fichiersDe(dossier: string): string[] {
  const racine = resolve(process.cwd(), dossier);
  const sortie: string[] = [];
  const marcher = (d: string): void => {
    for (const e of readdirSync(d)) {
      const p = resolve(d, e);
      if (statSync(p).isDirectory()) marcher(p);
      else if (/\.(ts|tsx)$/.test(e)) sortie.push(p);
    }
  };
  marcher(racine);
  return sortie;
}

const ACTIONS = readFileSync(resolve(process.cwd(), "lib/cv/actions.ts"), "utf8");
const NOMS = [...ACTIONS.matchAll(/^export async function (\w+)\(/gm)].map((m) => m[1]!);

/** Le fichier existant derrière un chemin `@/…`, quelle que soit son extension. */
function resoudre(chemin: string): string | null {
  for (const suffixe of [".ts", ".tsx", "/index.ts", "/index.tsx", ""]) {
    const p = resolve(process.cwd(), chemin + suffixe);
    try {
      if (statSync(p).isFile()) return p;
    } catch {
      // Chemin inexistant sous cette extension : on essaie la suivante.
    }
  }
  return null;
}

/**
 * Les fichiers ATTEIGNABLES depuis un écran, en suivant les imports `@/…`.
 *
 * ⚠️ « APPELÉ QUELQUE PART » N'EST PAS « ATTEIGNABLE », et ma première version confondait les
 * deux. Elle cherchait l'action dans tout `app/`, `components/` et `lib/` — donc un composant
 * ORPHELIN qui l'appelle la faisait passer pour branchée. Prouvé par mutation : j'ai retiré le
 * bouton de `/profil` et le test est resté VERT, parce que `components/ReanalyseCv.tsx`
 * existait toujours et appelait l'action. Une garde qui ne rougit pas sur le défaut qu'elle
 * décrit est une décoration.
 *
 * On part donc des ÉCRANS (`app/`) et on descend par les imports : un composant que plus
 * personne ne monte n'est pas dans l'ensemble, et l'action qu'il appelle redevient orpheline.
 */
function atteignablesDepuisLesEcrans(): string[] {
  const vus = new Set<string>();
  const file = fichiersDe("app");
  while (file.length > 0) {
    const f = file.pop()!;
    if (vus.has(f)) continue;
    vus.add(f);
    const source = readFileSync(f, "utf8");
    for (const m of source.matchAll(/from "@\/([^"]+)"/g)) {
      const cible = resoudre(m[1]!);
      if (cible !== null && !vus.has(cible)) file.push(cible);
    }
  }
  return [...vus];
}

const ATTEIGNABLES = atteignablesDepuisLesEcrans();
const APPELANTS = ATTEIGNABLES.filter((f) => !f.endsWith("lib/cv/actions.ts"))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

describe("les actions du chantier CV sont ATTEIGNABLES", () => {
  it("le relevé des actions n'est pas vide — sinon tout ce fichier est vacueux", () => {
    // Anti-vacuité : si le motif cessait de reconnaître les déclarations, la boucle
    // ci-dessous tournerait à vide et ce fichier passerait au vert en ne mesurant rien.
    expect(NOMS.length).toBeGreaterThanOrEqual(4);
    expect(NOMS).toContain("reanalyserCv");
  });

  it("le graphe d'atteignabilité couvre vraiment le dépôt — seconde anti-vacuité", () => {
    // Si la résolution des imports cassait, l'ensemble se réduirait aux fichiers d'`app/` et
    // TOUTES les actions paraîtraient orphelines — bruyant, donc visible. L'inverse est le
    // vrai danger : un ensemble qui gonfle jusqu'à tout contenir redonnerait la garde molle
    // d'origine. On vérifie donc qu'il descend hors d'`app/` SANS avaler tout `lib/`.
    expect(ATTEIGNABLES.some((f) => f.includes("/components/"))).toBe(true);
    expect(ATTEIGNABLES.some((f) => f.endsWith("lib/cv/actions.ts"))).toBe(true);
    expect(ATTEIGNABLES.length).toBeLessThan(fichiersDe("app").length + fichiersDe("lib").length + fichiersDe("components").length);
  });

  it("chacune est appelée par un écran, ou inscrite à la dette avec sa raison", () => {
    const orphelines = NOMS.filter(
      (n) => !new RegExp(`\\b${n}\\s*\\(`).test(APPELANTS) && !(n in SANS_APPELANT_ASSUME),
    );
    expect(orphelines).toEqual([]);
  });

  it("⚠️ la dette ne GRANDIT pas — une entrée se retire, elle ne s'ajoute pas", () => {
    // Le mode de panne de cet inventaire est qu'il serve d'échappatoire : on ajoute une ligne
    // plutôt qu'un bouton, et la garde reste verte en certifiant le défaut qu'elle surveille.
    expect(Object.keys(SANS_APPELANT_ASSUME)).toEqual(["retirerCv"]);
  });

  it("⚠️ une entrée de dette décrit une action qui EXISTE encore", () => {
    // Une dette fantôme — l'entrée survit à l'action qu'elle excusait — se lit comme un
    // constat au présent et fausse tout inventaire futur.
    for (const n of Object.keys(SANS_APPELANT_ASSUME)) expect(NOMS).toContain(n);
  });
});
