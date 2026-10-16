// tests/theme.test.ts — verrou du socle visuel commun, version SOMBRE SEUL (JobAI#116).
//
// Repris de app-template (`tests/theme.test.ts`, tâche #39) et de BatchChef : les couleurs vivent
// dans `app/globals.css`, en variables hexadécimales, et NULLE PART ailleurs. Ce qui change ici :
//   · sombre seul (ADR-0008, décision de Marc du 16/10/2026) : pas de bloc `@media` à comparer ;
//   · JobAI garde ses noms propres pour `.carte`, `.pastille` et `.etiquette` (voir EXCEPTIONS) ;
//   · quelques fichiers TypeScript ont une raison NOMMÉE de porter une couleur (EXCEPTIONS_TS).
//
// Pourquoi un test et pas une relecture — incident BatchChef du 14/08/2026 : une passe de refonte avait
// laissé 21 `bg-white` figés sous un texte clair hérité. Une couleur figée est parfaitement lisible
// dans le thème pour lequel on l'a écrite : aucune relecture ne la voit, aucune erreur ne se lève.
// `tests/styles.test.ts` garde, lui, les classes orphelines et l'absence de thème clair.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const RACINE = process.cwd();

/** PÉRIMÈTRE POSITIF : les dossiers qui produisent du balisage ou une couleur. */
const DOSSIERS_RENDUS = ["app", "components", "lib"];

function fichiersDe(dossier: string): string[] {
  const absolu = join(RACINE, dossier);
  try {
    statSync(absolu);
  } catch {
    return [];
  }
  return readdirSync(absolu, { recursive: true, encoding: "utf8" })
    .map((f) => join(dossier, f).split("\\").join("/"))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
}

const FICHIERS = DOSSIERS_RENDUS.flatMap(fichiersDe).sort();

function lire(chemin: string): string {
  return readFileSync(join(RACINE, chemin), "utf8");
}

/** Retire les commentaires (une couleur citée dans un commentaire n'est pas une couleur rendue). */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

const CSS_BRUT = lire("app/globals.css");
const CSS = sansCommentaires(CSS_BRUT);

/** Corps de chaque bloc `:root { … }` (les jetons y sont à plat : aucune accolade imbriquée). */
const BLOCS_ROOT = [...CSS.matchAll(/:root\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");
const ROOT = BLOCS_ROOT.join("\n");
const HORS_ROOT = CSS.replace(/:root\s*\{[^}]*\}/g, "");

/** `--nom: #rrggbb;` ou `#rrggbbaa;` — les couleurs sont en hexadécimal, ce qui les rend mesurables. */
function couleurs(source: string): [string, string][] {
  return [...source.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})(?:[0-9a-f]{2})?\s*;/gim)].map(
    (m) => [m[1] ?? "", (m[2] ?? "").toLowerCase()] as [string, string],
  );
}
const JETONS = Object.fromEntries(couleurs(ROOT)) as Record<string, string>;

describe("socle visuel — aucune couleur hors des jetons", () => {
  it("voit bien les fichiers de rendu et la feuille (sinon le garde est vert à vide)", () => {
    expect(FICHIERS.length).toBeGreaterThan(20);
    expect(FICHIERS).toContain("app/page.tsx");
    expect(FICHIERS).toContain("app/connexion/page.tsx");
    expect(CSS_BRUT.length).toBeGreaterThan(20_000);
    expect(BLOCS_ROOT.length).toBeGreaterThanOrEqual(2);
  });

  it("aucune classe de palette Tailwind (JobAI n'en utilise pas : une seule suffirait à trahir le sombre)", () => {
    const palettes =
      "white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
    const proprietes =
      "bg|text|border|placeholder|ring|from|to|via|divide|decoration|outline|accent|caret|fill|stroke|shadow";
    const motif = new RegExp(`\\b(?:${proprietes})-(?:${palettes})(?:-\\d{2,3})?(?:/\\d{1,3})?\\b`, "g");
    const fautes = FICHIERS.filter((f) => f.endsWith(".tsx")).flatMap((f) =>
      [...sansCommentaires(lire(f)).matchAll(/className=("[^"]*"|\{`[^`]*`\})/g)]
        .flatMap((m) => m[1]?.match(motif) ?? [])
        .map((x) => `${f} — ${x}`),
    );
    expect(fautes, `Couleurs figées :\n${fautes.join("\n")}`).toEqual([]);
  });

  it("aucune valeur de couleur (#hex, oklch, hsl…) dans un fichier TypeScript, sauf exception nommée", () => {
    // Chaque exception a son fichier ET sa raison. Un fichier absent de cette liste ne porte aucune couleur.
    const EXCEPTIONS_TS: Record<string, string> = {
      "lib/hubSummary.ts":
        "`app.color` est un champ du CONTRAT du hub (couleur d'accent du widget), pas une couleur de l'interface",
      "lib/couleurNote.ts":
        "l'échelle de couleur d'une note est CALCULÉE (une teinte par note) : aucun jeton ne peut la porter",
      "components/CarteGoogle.tsx":
        "l'API Google Maps prend des chaînes de couleur en JavaScript (tracés, marqueur) : elle ne lit pas var(--…)",
      "components/CarteOffres.tsx": "teinte d'un marqueur de carte passée à l'API de carte (même raison)",
      "app/manifest.ts": "le manifeste est du JSON servi à l'OS : égalité avec `--fond` vérifiée plus bas",
      "app/layout.tsx": "`viewport.themeColor` : même raison, même vérification",
    };
    const motif =
      /(?<![\w&])#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b|(?<![\w&])#[0-9a-fA-F]{3}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/g;
    const fautes = FICHIERS.filter((f) => !(f in EXCEPTIONS_TS)).flatMap((f) =>
      sansCommentaires(lire(f))
        .split("\n")
        .flatMap((ligne, i) => (ligne.match(motif) ?? []).map((x) => `${f}:${i + 1} — ${x}`)),
    );
    expect(fautes, `Couleurs en dur (déclare un jeton dans globals.css) :\n${fautes.join("\n")}`).toEqual([]);
    // Non-vacuité : chaque exception existe bel et bien (sinon la liste vieillit en silence).
    for (const f of Object.keys(EXCEPTIONS_TS)) expect(FICHIERS, `exception périmée : ${f}`).toContain(f);
  });

  it("dans la feuille, aucune couleur écrite hors des blocs `:root` (hormis l'ombre noire translucide)", () => {
    const sansOmbre = HORS_ROOT.replace(/rgb\(\s*0\s+0\s+0\s*\/\s*[\d.]+\s*\)/g, "");
    const fautes = [
      ...(sansOmbre.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []),
      ...(sansOmbre.match(/\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/g) ?? []),
    ];
    expect(fautes, "déclare un jeton dans `:root` plutôt qu'une valeur dans une règle").toEqual([]);
  });

  it("chaque `var(--jeton)` cité est défini dans globals.css", () => {
    // Un nom mal orthographié ne lève rien : la propriété devient invalide et la couleur est
    // simplement héritée. Le 2026-09-13, `.relances__resume` écrivait `var(--texte-doux)` pour un
    // jeton qui s'appelait encore `--text-soft` : silencieux, et joli dans le thème où on l'a écrit.
    const definis = new Set([...CSS.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
    const citations = [
      ...[...CSS.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => ["app/globals.css", m[1] ?? ""] as const),
      ...FICHIERS.flatMap((f) =>
        [...sansCommentaires(lire(f)).matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => [f, m[1] ?? ""] as const),
      ),
    ];
    // Les variables posées par `next/font` (app/layout.tsx) ne sont pas dans la feuille.
    const deNextFont = new Set(["--police-texte", "--police-mesure"]);
    const fautes = citations
      .filter(([, nom]) => !definis.has(nom) && !deNextFont.has(nom))
      .map(([f, nom]) => `${f} — ${nom}`);
    expect(citations.length).toBeGreaterThan(200);
    expect(fautes, `Jetons inexistants :\n${fautes.join("\n")}`).toEqual([]);
  });

  it("le manifeste et la barre système prennent la couleur de `--fond` (une seule source)", () => {
    // Avant JobAI#116, `manifest.ts` et `viewport.themeColor` valaient #141209 — la teinte CHAUDE d'avant
    // la refonte du 2026-09-13 : une bande brune au-dessus d'un écran charbon froid, sur l'app installée.
    const fond = JETONS["--fond"];
    expect(fond).toMatch(/^#[0-9a-f]{6}$/);
    expect(lire("app/manifest.ts")).toContain(`background_color: "${fond}"`);
    expect(lire("app/manifest.ts")).toContain(`theme_color: "${fond}"`);
    expect(lire("app/layout.tsx")).toContain(`themeColor: "${fond}"`);
  });
});

describe("socle visuel — jetons et vocabulaire communs", () => {
  it("chaque couleur est définie une seule fois", () => {
    const noms = couleurs(ROOT).map(([n]) => n);
    expect(noms.length, "trop peu de jetons lus, le garde serait vide").toBeGreaterThan(40);
    const doublons = noms.filter((n, i) => noms.indexOf(n) !== i);
    expect(doublons, "jetons définis deux fois").toEqual([]);
  });

  it("porte les jetons du socle (un renommage casserait les forks en silence)", () => {
    for (const requis of [
      "--fond", "--surface", "--surface-douce", "--bordure", "--bordure-champ",
      "--texte", "--texte-doux", "--accent", "--accent-fonce", "--sur-accent",
      "--repere", "--repere-doux",
      "--succes-fond", "--succes-texte", "--alerte-fond", "--alerte-texte",
      "--erreur-fond", "--erreur-texte",
    ]) {
      expect(Object.keys(JETONS), `jeton manquant : ${requis}`).toContain(requis);
    }
  });

  it("déclare le sombre au navigateur et ne suit pas le système", () => {
    expect(ROOT).toMatch(/color-scheme:\s*dark\s*;/);
    expect(CSS).not.toMatch(/prefers-color-scheme/);
  });

  it("porte le vocabulaire commun, hors les noms que JobAI a déjà pris", () => {
    // Ces trois noms existent DÉJÀ ici avec un autre sens (voir le commentaire de globals.css,
    // « Le vocabulaire commun du socle ») : on ne les redéfinit pas, on le dit.
    const PRIS_AILLEURS: Record<string, string> = {
      carte: "la carte d'OFFRE (grille à trois colonnes), pas la surface générique du socle",
      pastille: "la pastille de STATUT d'une candidature",
    };
    const classes = new Set([...CSS.matchAll(/\.([a-z][a-z0-9-]*)/gi)].map((m) => m[1]));
    for (const requise of [
      "bouton", "bouton-principal", "bouton-second", "bouton-danger", "champ",
      "doux", "succes", "alerte", "erreur", "texte-succes", "texte-erreur", "bandeau", "surtitre",
    ]) {
      expect(classes, `classe manquante : .${requise}`).toContain(requise);
    }
    for (const nom of Object.keys(PRIS_AILLEURS)) expect(classes, `.${nom} a disparu`).toContain(nom);
  });
});

describe("socle visuel — contrastes (sombre)", () => {
  const lin = (c: number): number => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const lum = (hex: string): number => {
    const n = parseInt(hex.slice(1), 16);
    return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  };
  const ratio = (a: string, b: string): number => {
    const [x = 0, y = 0] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  it("les couples texte/fond passent le WCAG (texte 4,5:1 ; contour et accent 3:1)", () => {
    // [premier plan, arrière-plan, minimum]. 4,5 = texte ; 3 = composant d'interface (1.4.11).
    const couples: [string, string, number][] = [
      ["--texte", "--fond", 4.5],
      ["--texte", "--surface", 4.5],
      ["--texte", "--surface-douce", 4.5],
      ["--texte-doux", "--fond", 4.5],
      ["--texte-doux", "--surface", 4.5],
      ["--texte-doux", "--surface-douce", 4.5],
      ["--sur-accent", "--accent", 4.5],
      ["--sur-accent", "--accent-fonce", 4.5],
      ["--repere", "--fond", 4.5],
      ["--repere", "--surface", 4.5],
      ["--repere", "--repere-doux", 4.5],
      ["--ambre-texte", "--surface", 4.5],
      ["--bleu-texte", "--surface", 4.5],
      ["--succes-texte", "--succes-fond", 4.5],
      ["--alerte-texte", "--alerte-fond", 4.5],
      ["--erreur-texte", "--erreur-fond", 4.5],
      ["--erreur-texte", "--surface", 4.5],
      ["--bordure-champ", "--surface", 3],
      ["--bordure-champ", "--fond", 3],
      ["--accent", "--fond", 3],
      // La carte Google : encre foncée sur son fond blanc imposé (les fiches) et sur les bandes.
      ["--carte-encre", "--carte-bleu-fond", 4.5],
      ["--carte-encre-douce", "--carte-bleu-fond", 4.5],
      ["--carte-lien", "--carte-bleu-fond", 4.5],
      ["--carte-ambre-texte", "--carte-ambre-fond", 4.5],
      ["--carte-bleu-texte", "--carte-bleu-fond", 4.5],
      ["--carte-gris-texte", "--carte-gris-fond", 4.5],
      ["--bande-1-texte", "--bande-1-fond", 4.5],
      ["--bande-2-texte", "--bande-2-fond", 4.5],
      ["--bande-3-texte", "--bande-3-fond", 4.5],
      ["--bande-4-texte", "--bande-4-fond", 4.5],
    ];
    const tropBas: string[] = [];
    for (const [a, b, min] of couples) {
      const fa = JETONS[a];
      const fb = JETONS[b];
      if (!fa || !fb) {
        tropBas.push(`${a} / ${b} : jeton introuvable`);
        continue;
      }
      const r = ratio(fa, fb);
      if (r < min) tropBas.push(`${a} ${fa} / ${b} ${fb} : ${r.toFixed(2)}:1 < ${min}:1`);
    }
    expect(tropBas, `Contrastes insuffisants :\n${tropBas.join("\n")}`).toEqual([]);
  });
});

describe("socle visuel — cibles tactiles et champs", () => {
  /** Corps de la règle `.classe { … }` (la première, hors pseudo-classes). */
  function regle(classe: string): string {
    const m = CSS.match(new RegExp(`(?:^|\\})\\s*\\.${classe}\\s*\\{([^}]*)\\}`));
    expect(m, `règle .${classe} introuvable`).not.toBeNull();
    return m?.[1] ?? "";
  }
  const REM = 16;

  it("`.bouton` et `.champ` font au moins 44 px de haut", () => {
    // `.bouton` lit `--touche` (3 rem, 48 px : « gros boutons », demande de Marc) ; `.champ` l'écrit en rem.
    const touche = ROOT.match(/--touche:\s*([\d.]+)rem/);
    expect(touche, "--touche en rem attendu").not.toBeNull();
    expect(Number(touche?.[1]) * REM, "--touche en px").toBeGreaterThanOrEqual(44);
    expect(regle("bouton")).toMatch(/min-height:\s*var\(--touche\)/);
    const champ = regle("champ").match(/min-height:\s*([\d.]+)rem/);
    expect(champ, ".champ : min-height en rem attendu").not.toBeNull();
    expect(Number(champ?.[1]) * REM, ".champ : hauteur minimale en px").toBeGreaterThanOrEqual(44);
  });

  it("`.champ` est à 16 px au moins (en dessous, iOS zoome tout seul)", () => {
    const m = regle("champ").match(/font-size:\s*([\d.]+)rem/);
    expect(m, ".champ : font-size en rem attendu").not.toBeNull();
    expect(Number(m?.[1]) * REM).toBeGreaterThanOrEqual(16);
  });
});
