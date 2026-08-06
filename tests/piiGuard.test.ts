// tests/piiGuard.test.ts — le verrou du garde-fou n°1.
//
// Le dépôt est privé, mais « privé » n'est pas « sans conséquence » : un dépôt change de
// visibilité en deux clics, se clone, s'exporte, et l'historique git garde tout pour
// toujours. Ce scan cherche donc, dans les fichiers RÉELLEMENT versionnés, ce qui ne doit
// jamais y entrer.
//
// PORTÉE — écrite ici plutôt que promise ailleurs :
//   - il détecte des FORMES (adresse municipale, secret assigné, coordonnées, civilité) ;
//   - il ne « comprend » rien : un nom de personne isolé lui échappe, et c'est assumé —
//     un motif générique de patronyme est inutilisable en français (mesuré : il attrapait
//     « Machines-Outils », « Saint-Damien », « garde-fou ») ;
//   - il couvre TOUS les fichiers versionnés sauf lui-même, fixtures de test comprises.
// Un garde qui promet plus qu'il ne fait est pire qu'un garde absent : on cesse de relire.
//
// C'est le SEUL garde de ce type du dépôt. La CI portait au départ deux `git grep`
// équivalents en bash ; ils ont été retirés une fois ce test écrit, parce que maintenir la
// même règle dans deux langages la fait diverger — et elle avait déjà divergé : le bash
// n'avait aucune notion d'« exemple documenté » et échouait sur la doc de `charger-seed.ts`.

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Les fichiers qui partent en ligne : ceux que git suit, ET ceux qui ne le sont pas encore.
 *
 * ⚠️ « SUIVI PAR GIT » ARRIVE UN COMMIT TROP TARD, et ça s'est payé le 2026-08-05.
 * Le scan ne listait que `git ls-files`. Un fichier NEUF n'y figure pas : il devient
 * visible du garde au moment précis où il entre dans l'historique — c'est-à-dire quand il
 * est trop tard. Le gate local était sincèrement vert avant le commit, la CI rouge juste
 * après, et le fichier fautif contenait douze adresses sous la forme surveillée. Un garde
 * qui ne voit une faute qu'une fois commise ne protège pas : il constate.
 *
 * `--others --exclude-standard` ajoute exactement les fichiers non suivis que `.gitignore`
 * ne couvre pas — donc ceux qu'un `git add -A` emporterait. Le garde regarde désormais ce
 * qui EST en ligne et ce qui est sur le point d'y aller.
 */
function fichiersVersionnes(): string[] {
  const lister = (args: string[]): string =>
    execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });

  const sortie = `${lister(["ls-files"])}\n${lister(["ls-files", "--others", "--exclude-standard"])}`;
  return [...new Set(sortie.split("\n"))]
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx|js|mjs|json|md|css|yml|yaml|sql|example)$/.test(f))
    // Le lockfile est du bruit machine. Les fichiers de test, eux, contiennent PAR NATURE
    // les motifs qu'ils vérifient — les scanner reviendrait à détecter le détecteur.
    // Le lockfile est du bruit machine. `piiGuard` s'exclut LUI-MÊME parce qu'il contient
    // par construction les motifs qu'il cherche — le scanner reviendrait à détecter le
    // détecteur. Les AUTRES fichiers de test, eux, sont scannés : ils sont versionnés comme
    // le reste, et rien ne garantit qu'une vraie valeur ne s'y glisse pas un jour.
    .filter((f) => f !== "package-lock.json" && f !== "tests/piiGuard.test.ts");
}

/**
 * Une ligne qui montre EXPLICITEMENT un exemple.
 *
 * La documentation doit pouvoir écrire à quoi ressemble une chaîne de connexion sans faire
 * échouer le scan. La règle est donc : **tout exemple porte un marqueur reconnaissable**
 * (`…`, `xxx`, `motdepasse`, `<...>`, `TON_`). Une vraie valeur, elle, n'en porte aucun —
 * un mot de passe Neon ressemble à `npg_` suivi de caractères aléatoires.
 *
 * C'est une convention, et elle est vérifiable : si quelqu'un colle une vraie valeur dans
 * la doc, elle n'aura pas de marqueur et sera détectée.
 */
function estExemple(ligne: string): boolean {
  return /…|\.\.\.|xxx|motdepasse|mot-de-passe|<[a-z-]+>|TON_|COLLE-ICI|factice|à remplir|exemple/i.test(
    ligne,
  );
}

interface Trouvaille {
  fichier: string;
  ligne: number;
  extrait: string;
}

/**
 * Neutralise la VALEUR du champ `adresse` d'un fichier de dépôt — et elle seule.
 *
 * Appliquée UNIQUEMENT aux `data/depot/*.json`, qui portent des adresses d'entreprise
 * recopiées d'annonces publiques. Le reste de la ligne, et tout le reste du fichier,
 * continuent d'être scannés normalement.
 *
 * La clé est ancrée (`"adresse"` suivi de deux-points) : `adresseSource` ou `adresse_x` ne
 * matchent pas. Une exemption qui déborde sur des clés voisines cesserait d'être une
 * exception pour devenir un trou.
 */
export function retirerAdressesDeDepot(contenu: string): string {
  return contenu.replace(/"adresse"\s*:\s*"(?:[^"\\]|\\.)*"/g, '"adresse": ""');
}

function chercher(motif: RegExp, fichiers: readonly string[]): Trouvaille[] {
  const trouvailles: Trouvaille[] = [];
  for (const f of fichiers) {
    const brut = readFileSync(resolve(process.cwd(), f), "utf8");
    // Seuls les DÉPÔTS voient leur champ `adresse` neutralisé — voir
    // `retirerAdressesDeDepot`. Partout ailleurs, le contenu est scanné tel quel.
    const contenu = f.startsWith("data/depot/") ? retirerAdressesDeDepot(brut) : brut;
    contenu.split("\n").forEach((ligne, i) => {
      if (motif.test(ligne) && !estExemple(ligne)) {
        trouvailles.push({ fichier: f, ligne: i + 1, extrait: ligne.trim().slice(0, 100) });
      }
      motif.lastIndex = 0;
    });
  }
  return trouvailles;
}

const FICHIERS = fichiersVersionnes();

describe("volume du scan", () => {
  it("lit un nombre plausible de fichiers versionnés", () => {
    // SANS cette assertion, un scan qui ne lit RIEN passerait tous les tests ci-dessous :
    // protection nulle, et silencieuse. C'est le premier piège d'un test-garde.
    expect(FICHIERS.length).toBeGreaterThan(25);
  });

  it("couvre bien les fichiers qui portent des données", () => {
    // Un filtre d'extension trop strict viderait le scan de sa substance sans rien dire.
    expect(FICHIERS).toContain("lib/seed.ts");
    expect(FICHIERS).toContain("lib/reference.ts");
    expect(FICHIERS).toContain(".env.example");
  });

  it("voit un fichier NEUF avant son premier commit", () => {
    // ⚠️ CE TEST EXISTE PARCE QUE LE GARDE A ÉCHOUÉ EXACTEMENT LÀ, le 2026-08-05.
    //
    // Le scan ne listait que `git ls-files` : un fichier neuf n'y figure pas, et devient
    // visible du garde au moment précis où il entre dans l'historique — trop tard. Le gate
    // local était sincèrement vert avant le commit, la CI rouge juste après, et le fichier
    // fautif portait douze adresses sous la forme surveillée. Un garde qui ne voit une
    // faute qu'une fois commise ne protège pas : il constate.
    //
    // La sonde ne contient AUCUNE donnée sensible — ce qu'on vérifie ici est la PORTÉE du
    // scan, pas sa détection : la faire porter une vraie forme d'adresse ferait échouer les
    // autres tests du fichier pour une raison sans rapport.
    const sonde = resolve(process.cwd(), "lib/_sonde-portee-du-scan.ts");
    try {
      writeFileSync(sonde, "export const SONDE = 1;\n", "utf8");
      expect(fichiersVersionnes()).toContain("lib/_sonde-portee-du-scan.ts");
    } finally {
      rmSync(sonde, { force: true });
    }
  });

  it("scanne AUSSI les autres fichiers de test, et pas seulement lui-même", () => {
    // Les fixtures de test sont versionnées comme le reste. Les exclure en bloc — ce que
    // faisait la première version — laissait un angle mort entier.
    expect(FICHIERS).toContain("tests/diagnostic.test.ts");
    expect(FICHIERS).toContain("tests/seed.test.ts");
    // Le détecteur, lui, reste hors du scan : il contient par construction ce qu'il cherche.
    expect(FICHIERS).not.toContain("tests/piiGuard.test.ts");
  });
});

describe("garde-fou n°1 — aucune donnée personnelle en clair", () => {
  it("aucune adresse municipale", () => {
    // Le domicile de Marc ne doit apparaître nulle part : seules les DISTANCES sont
    // committées, calculées depuis DOMICILE_LAT / DOMICILE_LON.
    const motif = /\b\d{3,5},?\s+(av\.|avenue|rue|boul\.|boulevard|ch\.|chemin)\s+\S/i;
    expect(chercher(motif, FICHIERS)).toEqual([]);
  });

  it("l'exemption des dépôts ne couvre QUE le champ `adresse`, pas leur reste", () => {
    // ⚠️ POURQUOI UNE EXEMPTION EXISTE, ET POURQUOI ELLE EST SI ÉTROITE.
    //
    // Depuis le 2026-08-06, les fichiers `data/depot/*.json` portent l'adresse civique
    // ANNONCÉE d'un employeur — recopiée d'une offre d'emploi publique. C'est une adresse
    // d'entreprise, versionnée exprès, et elle a exactement la forme que ce garde
    // surveille. Sans exemption, la fonctionnalité serait impossible ; avec une exemption
    // par FICHIER, on ouvrirait un dossier entier où n'importe quelle adresse pourrait se
    // glisser. On exempte donc la VALEUR d'une seule clé, et rien d'autre.
    //
    // Ce que ça ne met PAS en danger : le domicile de Marc ne vit que dans
    // `DOMICILE_ADRESSE`, une variable d'environnement, et aucun chemin d'ingestion ne le
    // touche. Un dépôt est écrit à partir d'annonces publiques, jamais de son profil.
    //
    // Ce test PROUVE l'étroitesse : une adresse posée AILLEURS que dans `adresse` est
    // toujours vue. Sans lui, élargir l'exemption à tout le fichier passerait inaperçu.
    const motif = /\b\d{3,5},?\s+(av\.|avenue|rue|boul\.|boulevard|ch\.|chemin)\s+\S/i;
    const numero = "1548";
    const voie = "avenue de la Test";
    expect(retirerAdressesDeDepot(`  "ville": "${numero} ${voie}"`)).toMatch(motif);
    expect(retirerAdressesDeDepot(`  "adresse": "${numero} ${voie}, Québec, QC"`)).not.toMatch(
      motif,
    );
    // Et la clé doit être celle du dépôt, pas n'importe quelle clé qui lui ressemble.
    expect(retirerAdressesDeDepot(`  "adresseSource": "${numero} ${voie}"`)).toMatch(motif);
  });

  it("aucune coordonnée géographique en dur", () => {
    // Une latitude québécoise (46-47) suivie d'une longitude (-71) reconstituerait le
    // domicile aussi sûrement qu'une adresse.
    const motif = /\b4[5-8]\.\d{4,}\s*,\s*-7[0-5]\.\d{4,}/;
    expect(chercher(motif, FICHIERS)).toEqual([]);
    // Et les variables d'environnement restent VIDES dans l'exemple.
    const affectee = /DOMICILE_(LAT|LON)\s*=\s*[-\d]/;
    expect(chercher(affectee, FICHIERS)).toEqual([]);
  });

  it("aucune personne nommée par une civilité", () => {
    const motif = /\b(M\.|Mme|Monsieur|Madame)\s+[A-ZÉÈÀ][a-zéèêàî]+/;
    expect(chercher(motif, FICHIERS)).toEqual([]);
  });

  it("aucun numéro de téléphone ni d'assurance sociale", () => {
    const tel = /\b(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/;
    expect(chercher(tel, FICHIERS)).toEqual([]);
    const nas = /\b\d{3}[-\s]\d{3}[-\s]\d{3}\b/;
    expect(chercher(nas, FICHIERS)).toEqual([]);
  });
});

describe("garde-fou n°5 — aucun secret en dur", () => {
  it("aucune variable de secret affectée à une valeur", () => {
    // `NOM=` seul (fichier d'exemple) est légitime ; `NOM=valeur` ne l'est pas.
    const motif =
      /\b(HUB_TOKEN|AUTH_SECRET|GOOGLE_CLIENT_SECRET|DATABASE_URL|ANTHROPIC_API_KEY)\s*[=:]\s*["']?[A-Za-z0-9+/_-]{8}/;
    expect(chercher(motif, FICHIERS)).toEqual([]);
  });

  it("aucune chaîne de connexion Postgres complète", () => {
    // Le vecteur le plus probable : coller une connection string dans un fichier ou un
    // commentaire « juste pour tester ».
    const motif = /postgres(ql)?:\/\/[^:\s]+:[^@\s]{6,}@/;
    expect(chercher(motif, FICHIERS)).toEqual([]);
  });

  it("aucune clé d'API au format reconnaissable", () => {
    const motif = /\b(sk-ant-[A-Za-z0-9_-]{10}|npg_[A-Za-z0-9]{10}|ghp_[A-Za-z0-9]{20})/;
    expect(chercher(motif, FICHIERS)).toEqual([]);
  });
});

describe("le scan discrimine réellement", () => {
  // Un garde qui n'a jamais rien détecté ne protège rien. On lui soumet des contenus
  // fabriqués — ce sont des chaînes de test, jamais de vraies valeurs.
  const cas: readonly { nom: string; motif: RegExp; doitDetecter: string; doitIgnorer: string }[] = [
    {
      nom: "adresse municipale",
      motif: /\b\d{3,5},?\s+(av\.|avenue|rue|boul\.|boulevard|ch\.|chemin)\s+\S/i,
      doitDetecter: "const domicile = '1548 av. de la Rosaliere';",
      doitIgnorer: "Saint-Anselme, 33 km. Publiée le 21/07/2026.",
    },
    {
      nom: "coordonnées",
      motif: /\b4[5-8]\.\d{4,}\s*,\s*-7[0-5]\.\d{4,}/,
      doitDetecter: "const centre = [46.812345, -71.234567];",
      doitIgnorer: "score de 46 sur 100, écart de -71 points",
    },
    {
      nom: "chaîne de connexion",
      motif: /postgres(ql)?:\/\/[^:\s]+:[^@\s]{6,}@/,
      doitDetecter: "postgresql://utilisateur:MotDePasseFactice@hote.neon.tech/db",
      doitIgnorer: "DATABASE_URL=  # à remplir, voir docs/DEPLOIEMENT.md",
    },
    {
      nom: "secret affecté",
      motif:
        /\b(HUB_TOKEN|AUTH_SECRET|GOOGLE_CLIENT_SECRET|DATABASE_URL|ANTHROPIC_API_KEY)\s*[=:]\s*["']?[A-Za-z0-9+/_-]{8}/,
      doitDetecter: "HUB_TOKEN=VALEURFACTICE123456",
      doitIgnorer: "HUB_TOKEN=",
    },
    {
      nom: "civilité",
      motif: /\b(M\.|Mme|Monsieur|Madame)\s+[A-ZÉÈÀ][a-zéèêàî]+/,
      doitDetecter: "Entrevue avec Mme Untel la semaine prochaine.",
      doitIgnorer: "Contact RH déjà établi, entrevue passée en mars 2025.",
    },
  ];

  for (const c of cas) {
    it(`détecte « ${c.nom} » et ignore la formulation légitime`, () => {
      expect(c.motif.test(c.doitDetecter), `aurait dû détecter : ${c.doitDetecter}`).toBe(true);
      c.motif.lastIndex = 0;
      expect(c.motif.test(c.doitIgnorer), `faux positif sur : ${c.doitIgnorer}`).toBe(false);
      c.motif.lastIndex = 0;
    });
  }

  it("l'exemption d'exemple ne laisse PAS passer une vraie valeur", () => {
    // C'est le point faible de la règle « les exemples portent un marqueur » : si elle
    // exemptait trop large, le garde deviendrait décoratif. On vérifie donc les deux sens.
    const vraieAllure =
      "DATABASE_URL=postgresql://neondb_owner:AbCd1234EfGh@ep-truc-pooler.aws.neon.tech/neondb";
    const exemple =
      "DATABASE_URL=postgresql://user:motdepasse@ep-xxx-pooler.aws.neon.tech/neondb";

    expect(estExemple(vraieAllure), "une vraie valeur ne doit pas être exemptée").toBe(false);
    expect(estExemple(exemple), "un exemple marqué doit être exempté").toBe(true);

    const motif = /postgres(ql)?:\/\/[^:\s]+:[^@\s]{6,}@/;
    expect(motif.test(vraieAllure) && !estExemple(vraieAllure)).toBe(true);
  });
});
