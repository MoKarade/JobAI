// scripts/sonder-sources.ts — interroger les vraies sources, et ne rien écrire.
//
//   npx tsx scripts/sonder-sources.ts
//
// POURQUOI CE SCRIPT EXISTE
// La session qui a écrit l'ingestion n'a AUCUN accès sortant (proxy fermé, vérifié sur
// example.com comme sur les sources). Les analyseurs ont donc été testés sur les formats
// documentés, jamais sur une vraie réponse. Ce script comble exactement ce trou : il tourne
// là où le réseau est ouvert — un runner GitHub Actions — et confronte le code au réel.
//
// IL N'ÉCRIT RIEN, NULLE PART
// Ni base, ni fichier, ni secret. Il lit et il rapporte.
//
// CE QUE LA PREMIÈRE PASSE A APPRIS (2026-07-31)
//   - le flux RSS du Guichet-Emplois répond 404 : l'URL était fausse. D'où le banc d'essai
//     d'URL candidates ci-dessous, qui cherche la bonne au lieu de la deviner ;
//   - « 36 pages carrières trouvées » était un MENSONGE : le code prenait un HTTP 200 pour
//     une preuve, alors que SmartRecruiters répond 200 avec une liste vide pour n'importe
//     quel nom. D'où le TÉMOIN NÉGATIF : on interroge un nom d'entreprise absurde, et si
//     l'ATS répond pareil que pour une vraie, c'est que sa réponse ne prouve rien.

import { RECHERCHES_GUICHET, entetes, jetonProbable, urlAts } from "../lib/ingest/sources";
import { analyseurAts } from "../lib/ingest/sources";
import { analyserRss } from "../lib/ingest/analyseurs";
import { FAMILLES_ATS, type FamilleAts } from "../lib/ingest/types";
import { ENTREPRISES_CIBLES } from "../lib/reference";
import { trier } from "../lib/ingest/pipeline";
import { situer } from "../lib/ingest/region";
import type { OffreBrute } from "../lib/ingest/types";

const DELAI_MS = 12_000;

/** Un nom qu'aucune entreprise ne porte. Sa réponse est l'étalon du « rien trouvé ». */
const TEMOIN_NEGATIF = "zzqxwnexistepasdutout9137";

async function lire(url: string): Promise<{ corps: string; statut: number }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DELAI_MS);
  try {
    const r = await fetch(url, { headers: entetes(), signal: ctrl.signal });
    return { corps: await r.text(), statut: r.status };
  } finally {
    clearTimeout(t);
  }
}

function apercu(s: string, n = 160): string {
  return s.replace(/\s+/g, " ").slice(0, n);
}

/**
 * Banc d'essai d'URL pour le Guichet-Emplois.
 *
 * L'adresse du flux ne se devine pas : la première sonde a prouvé que celle que j'avais
 * écrite n'existe pas. On teste donc plusieurs formes documentées ou plausibles, et on
 * regarde laquelle rend du XML — plutôt que d'en choisir une et d'espérer.
 */
function urlsCandidatesGuichet(recherche: string): { nom: string; url: string }[] {
  const q = encodeURIComponent(recherche);
  const lieu = encodeURIComponent("Quebec, QC");
  return [
    { nom: "jobsearch/rss (actuelle)", url: `https://www.jobbank.gc.ca/jobsearch/rss?searchstring=${q}&locationstring=${lieu}` },
    { nom: "jobsearch/jobsearch?fsrc=32", url: `https://www.jobbank.gc.ca/jobsearch/jobsearch?fsrc=32&searchstring=${q}&locationstring=${lieu}` },
    { nom: "guichetemplois rechercheemploi/rss", url: `https://www.guichetemplois.gc.ca/rechercheemploi/rss?motcle=${q}&lieu=${lieu}` },
    { nom: "jobbank /rss?", url: `https://www.jobbank.gc.ca/rss?searchstring=${q}` },
    { nom: "jobsearch/jobsearch (page)", url: `https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring=${q}&locationstring=${lieu}` },
  ];
}

async function bancEssaiGuichet(): Promise<void> {
  console.log("\n═══ BANC D'ESSAI — quelle URL du Guichet-Emplois répond ? ═══\n");
  const recherche = RECHERCHES_GUICHET[0]!;

  for (const c of urlsCandidatesGuichet(recherche)) {
    try {
      const { corps, statut } = await lire(c.url);
      const estXml = /<rss|<feed|<\?xml/i.test(corps.slice(0, 400));
      const offres = estXml ? analyserRss(corps).length : 0;
      console.log(`  ${statut}  ${estXml ? "XML" : "   "}  ${offres.toString().padStart(3)} offres  ${c.nom}`);
      if (statut === 200 && !estXml) console.log(`        ↳ ${apercu(corps)}`);
    } catch (err) {
      console.log(`  ÉCHEC        ${c.nom} : ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

async function temoinsNegatifs(): Promise<Set<FamilleAts>> {
  console.log("\n═══ TÉMOINS NÉGATIFS — quelles réponses d'ATS prouvent quelque chose ? ═══\n");
  console.log(`  Nom interrogé : « ${TEMOIN_NEGATIF} » (aucune entreprise ne le porte)\n`);

  const fiables = new Set<FamilleAts>();
  for (const famille of FAMILLES_ATS) {
    try {
      const { corps, statut } = await lire(urlAts(famille, TEMOIN_NEGATIF));
      let offres = -1;
      try {
        offres = analyseurAts(famille)(corps, "Témoin").length;
      } catch {
        offres = -1; // corps illisible : c'est un refus, donc un signal exploitable
      }
      const verdict =
        statut !== 200 || offres < 0
          ? "FIABLE — un nom inconnu est REFUSÉ"
          : "TROMPEUR — répond 200 même pour un nom inventé";
      if (statut !== 200 || offres < 0) fiables.add(famille);
      console.log(`  ${famille.padEnd(16)} ${statut}  ${verdict}`);
    } catch {
      fiables.add(famille);
      console.log(`  ${famille.padEnd(16)} ---  FIABLE — connexion refusée`);
    }
  }

  console.log(`\n  → ${fiables.size}/${FAMILLES_ATS.length} familles dont la réponse est exploitable.`);
  console.log("    Pour les autres, un 200 ne dit RIEN : seules des offres réelles comptent.");
  return fiables;
}

async function sonderAts(fiables: Set<FamilleAts>): Promise<OffreBrute[]> {
  console.log("\n═══ PAGES CARRIÈRES (API d'ATS) ═══\n");

  const toutes: OffreBrute[] = [];
  const trouves: string[] = [];

  for (const cible of ENTREPRISES_CIBLES) {
    const jeton = jetonProbable(cible.nom);
    if (jeton.length < 3) continue;

    for (const famille of FAMILLES_ATS) {
      try {
        const { corps, statut } = await lire(urlAts(famille, jeton));
        if (statut !== 200) continue;
        const offres = analyseurAts(famille)(corps, cible.nom);

        // Une famille TROMPEUSE (200 pour n'importe quoi) ne prouve rien sans offres.
        // Sans cette règle, on inscrit 36 « pages carrières » qui sont des coquilles vides.
        if (offres.length === 0 && !fiables.has(famille)) continue;

        trouves.push(`${cible.nom} → ${famille}/${jeton} (${offres.length} offre(s))`);
        toutes.push(...offres);
        break;
      } catch {
        // Ni JSON exploitable, ni réponse : cette famille n'est pas la bonne.
      }
    }
  }

  if (trouves.length === 0) {
    console.log("  Aucune page carrières VÉRIFIÉE.");
    console.log("  La plupart des PME de la région n'utilisent pas ces ATS, ou sous un");
    console.log("  identifiant qui ne se déduit pas de leur nom.");
  } else {
    console.log(`  ${trouves.length} page(s) carrières vérifiée(s) :`);
    for (const t of trouves) console.log(`    ✓ ${t}`);
  }
  return toutes;
}

async function main() {
  console.log("SONDE DES SOURCES — lecture seule, aucune écriture\n");

  await bancEssaiGuichet();
  const fiables = await temoinsNegatifs();
  const brutes = await sonderAts(fiables);

  console.log("\n═══ CE QUI ENTRERAIT DANS LE SUIVI ═══\n");
  const jour = new Date().toISOString().slice(0, 10);
  const tri = trier(brutes, new Set(), jour);

  console.log(`  ${brutes.length} offres brutes ramenées`);
  console.log(`  ${tri.doublons} doublons`);
  console.log(`  ${tri.horsRegion} hors région`);
  console.log(`  ${tri.lieuInconnu} sans lieu exploitable`);
  console.log(`  ${tri.souslePlancher} sous le plancher d'adéquation`);
  console.log(`  ${tri.retenues.length} RETENUES\n`);

  for (const o of tri.retenues.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 25)) {
    console.log(`  ${String(o.score).padStart(3)}  ${o.entreprise} — ${o.poste}`);
  }

  // Ce que le filtre géographique a écarté : utile pour vérifier qu'il ne coupe pas trop.
  const horsRegion = brutes.filter((b) => situer(b.ville, b.description) !== "dans-la-region");
  if (horsRegion.length > 0) {
    console.log(`\n  Échantillon des lieux écartés (${horsRegion.length}) :`);
    for (const b of horsRegion.slice(0, 8)) {
      console.log(`    · « ${b.ville || "(vide)"} » — ${b.titre.slice(0, 60)}`);
    }
  }
}

main().catch((err) => {
  console.error("Sonde impossible :", err);
  process.exit(1);
});
