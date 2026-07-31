// scripts/sonder-quebec.ts — les sites d'emploi québécois offrent-ils un flux officiel ?
//
//   npx tsx scripts/sonder-quebec.ts
//
// POURQUOI CETTE SONDE
// Les sources « officielles » nord-américaines (Guichet-Emplois, ATS américains) ne
// couvrent pas le marché de Québec — mesuré le 2026-07-31 : zéro offre locale sur 106
// ramenées. Les employeurs de la région publient ailleurs. Reste à savoir si CES sites-là
// offrent un flux destiné à être lu, ou seulement une page web.
//
// L'ORDRE DES QUESTIONS COMPTE, ET IL N'EST PAS NÉGOCIABLE
//   1. Que dit le `robots.txt` ? Un site qui interdit l'accès automatisé n'est pas une
//      source, quelle que soit la facilité technique de le lire. On lit sa réponse AVANT de
//      chercher un flux, pas après.
//   2. Existe-t-il un flux (RSS, JSON) à une adresse publique ?
//   3. Ce flux contient-il des offres exploitables ?
//
// Une réponse NON à la première question clôt le sujet pour ce site. C'est la décision de
// Marc du 2026-07-30 — sources officielles seulement — appliquée à la lettre.
//
// LECTURE SEULE. Aucune écriture, aucun secret, relançable sans risque.

import { entetes } from "../lib/ingest/sources";
import { analyserRss } from "../lib/ingest/analyseurs";

const DELAI_MS = 12_000;

interface Site {
  nom: string;
  hote: string;
  /** Adresses de flux à essayer, dans l'ordre de préférence. */
  candidates: { nom: string; url: string }[];
}

const RECHERCHE = "coordonnateur";
const q = encodeURIComponent(RECHERCHE);

const SITES: Site[] = [
  {
    nom: "Jobillico",
    hote: "https://www.jobillico.com",
    candidates: [
      { nom: "rss recherche", url: `https://www.jobillico.com/rss/recherche-emploi?skwd=${q}` },
      { nom: "fr/rss", url: `https://www.jobillico.com/fr/rss?skwd=${q}` },
      { nom: "recherche?rss=1", url: `https://www.jobillico.com/recherche-emploi?skwd=${q}&rss=1` },
      { nom: "api offres", url: `https://www.jobillico.com/api/jobs?keyword=${q}` },
      { nom: "sitemap", url: "https://www.jobillico.com/sitemap.xml" },
    ],
  },
  {
    nom: "Québec emploi (gouv. QC)",
    hote: "https://www.quebec.ca",
    candidates: [
      { nom: "placement rss", url: `https://placement.emploiquebec.gouv.qc.ca/mbe/ut/rechroffr/rss.asp?mtcle=${q}` },
      { nom: "quebecemploi rss", url: `https://www.quebecemploi.gouv.qc.ca/rss?mots=${q}` },
    ],
  },
  {
    nom: "Espresso-Jobs",
    hote: "https://espresso-jobs.com",
    candidates: [
      { nom: "rss", url: `https://espresso-jobs.com/rss` },
      { nom: "rss recherche", url: `https://espresso-jobs.com/emplois/rss?q=${q}` },
    ],
  },
  {
    nom: "Isarta",
    hote: "https://isarta.com",
    candidates: [{ nom: "rss emplois", url: "https://isarta.com/emplois/feed/" }],
  },
];

async function lire(url: string): Promise<{ corps: string; statut: number }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DELAI_MS);
  try {
    const r = await fetch(url, { headers: entetes(), signal: ctrl.signal, redirect: "follow" });
    return { corps: await r.text(), statut: r.status };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Ce que le robots.txt dit de NOTRE agent.
 *
 * Analyse volontairement PRUDENTE : on ne cherche pas une permission, on cherche une
 * interdiction. Un `Disallow: /` sous `User-agent: *` clôt le sujet. Le doute profite au
 * site, jamais à nous.
 */
function verdictRobots(txt: string): { verdict: string; extrait: string } {
  const lignes = txt.split(/\r?\n/).map((l) => l.trim());
  let dansEtoile = false;
  const interdits: string[] = [];

  for (const l of lignes) {
    const ua = /^user-agent:\s*(.+)$/i.exec(l);
    if (ua) {
      dansEtoile = (ua[1] ?? "").trim() === "*";
      continue;
    }
    if (!dansEtoile) continue;
    const dis = /^disallow:\s*(.*)$/i.exec(l);
    if (dis) {
      const chemin = (dis[1] ?? "").trim();
      if (chemin !== "") interdits.push(chemin);
    }
  }

  if (interdits.includes("/")) {
    return { verdict: "TOUT INTERDIT aux agents automatisés", extrait: "Disallow: /" };
  }
  if (interdits.length === 0) {
    return { verdict: "aucune interdiction générale", extrait: "(aucun Disallow sous *)" };
  }
  return {
    verdict: `${interdits.length} chemin(s) interdit(s)`,
    extrait: interdits.slice(0, 6).join(" · "),
  };
}

async function sonderSite(site: Site): Promise<void> {
  console.log(`\n═══ ${site.nom} ═══\n`);

  // 1. Ce que le site autorise — AVANT de chercher quoi que ce soit.
  try {
    const { corps, statut } = await lire(`${site.hote}/robots.txt`);
    if (statut !== 200) {
      console.log(`  robots.txt : HTTP ${statut} — introuvable, on ne présume rien.`);
    } else {
      const r = verdictRobots(corps);
      console.log(`  robots.txt : ${r.verdict}`);
      console.log(`               ${r.extrait}`);
      if (r.verdict.startsWith("TOUT INTERDIT")) {
        console.log("\n  → Sujet CLOS pour ce site. Un site qui refuse les agents");
        console.log("    automatisés n'est pas une source, quelle que soit la facilité");
        console.log("    technique de le lire.");
        return;
      }
    }
  } catch (err) {
    console.log(`  robots.txt : illisible (${err instanceof Error ? err.message : String(err)})`);
  }

  // 2. Existe-t-il un flux ?
  console.log("");
  for (const c of site.candidates) {
    try {
      const { corps, statut } = await lire(c.url);
      const debut = corps.slice(0, 500);
      const estXml = /<rss|<feed|<\?xml/i.test(debut);
      const estJson = /^\s*[[{]/.test(debut);
      const offres = estXml ? analyserRss(corps).length : 0;
      const forme = estXml ? "XML " : estJson ? "JSON" : "HTML";
      console.log(`  ${statut}  ${forme}  ${offres.toString().padStart(3)} offres  ${c.nom}`);
      if (statut === 200 && estXml && offres > 0) {
        const ex = analyserRss(corps)[0]!;
        console.log(`        ↳ ex. : ${ex.titre} — ${ex.entreprise || "?"} (${ex.ville || "ville ?"})`);
      } else if (statut === 200 && !estXml) {
        console.log(`        ↳ ${corps.replace(/\s+/g, " ").slice(0, 120)}`);
      }
    } catch (err) {
      console.log(`  ÉCHEC       ${c.nom} : ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function main() {
  console.log("SONDE DES SOURCES QUÉBÉCOISES — lecture seule\n");
  console.log("Ordre des questions : (1) le site autorise-t-il ? (2) y a-t-il un flux ?");
  console.log("(3) contient-il des offres ? Un NON à la première clôt le sujet.\n");

  for (const site of SITES) await sonderSite(site);

  console.log("\n═══ CE QU'IL FAUT EN CONCLURE ═══\n");
  console.log("  Une ligne « TOUT INTERDIT » = ce site ne sera pas une source, point.");
  console.log("  Une ligne « XML » avec des offres = piste réelle, à brancher.");
  console.log("  Que du « HTML » = le site n'expose pas de flux : lire ses pages serait du");
  console.log("  moissonnage, écarté par la décision du 2026-07-30.");
}

main().catch((err) => {
  console.error("Sonde impossible :", err);
  process.exit(1);
});
