// scripts/sonder-sources.ts — interroger les vraies sources, et ne rien écrire.
//
//   npx tsx scripts/sonder-sources.ts
//
// POURQUOI CE SCRIPT EXISTE
// La session qui a écrit l'ingestion n'a AUCUN accès sortant (proxy fermé, vérifié sur
// example.com comme sur les sources). Les analyseurs ont donc été testés sur les formats
// documentés, jamais sur une vraie réponse. Ce script comble exactement ce trou : il tourne
// là où le réseau est ouvert — un runner GitHub Actions — et confronte les analyseurs au
// réel.
//
// IL N'ÉCRIT RIEN, NULLE PART
// Ni base, ni fichier, ni secret. Il lit et il rapporte. C'est ce qui permet de le lancer
// sans risque, autant de fois qu'on veut, avant de laisser la veille écrire quoi que ce
// soit dans le suivi.
//
// CE QU'IL FAUT REGARDER DANS SA SORTIE
//   - une source en ERREUR : l'URL ou le format a changé, l'analyseur est à corriger ;
//   - une source à 0 offre SANS erreur : elle répond, mais l'analyseur n'y comprend rien
//     (ou il n'y a réellement rien) — l'échantillon brut affiché tranche ;
//   - des titres qui sortent : la source est bonne de bout en bout.

import { RECHERCHES_GUICHET, entetes, jetonProbable, urlAts, urlGuichet } from "../lib/ingest/sources";
import { analyseurAts } from "../lib/ingest/sources";
import { analyserRss } from "../lib/ingest/analyseurs";
import { FAMILLES_ATS, type FamilleAts } from "../lib/ingest/types";
import { ENTREPRISES_CIBLES } from "../lib/reference";
import { trier } from "../lib/ingest/pipeline";
import type { OffreBrute } from "../lib/ingest/types";

const DELAI_MS = 10_000;

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

function apercu(s: string, n = 220): string {
  return s.replace(/\s+/g, " ").slice(0, n);
}

async function sonderGuichet(): Promise<OffreBrute[]> {
  console.log("\n═══ GUICHET-EMPLOIS (RSS officiel) ═══\n");
  const toutes: OffreBrute[] = [];

  for (const recherche of RECHERCHES_GUICHET) {
    const url = urlGuichet(recherche);
    try {
      const { corps, statut } = await lire(url);
      const offres = analyserRss(corps);
      toutes.push(...offres);
      console.log(`  ${statut}  ${offres.length.toString().padStart(3)} offres  « ${recherche} »`);
      if (offres.length === 0) {
        // Le cas le plus trompeur : une réponse valide que l'analyseur ne comprend pas.
        // Sans l'aperçu brut, impossible de distinguer « rien à trouver » de « mal lu ».
        console.log(`        ↳ réponse brute : ${apercu(corps)}`);
      } else {
        console.log(`        ↳ ex. : ${offres[0]!.titre} — ${offres[0]!.entreprise || "?"} (${offres[0]!.ville || "ville ?"})`);
      }
    } catch (err) {
      console.log(`  ÉCHEC   « ${recherche} » : ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return toutes;
}

async function sonderAts(): Promise<OffreBrute[]> {
  console.log("\n═══ PAGES CARRIÈRES (API d'ATS) ═══\n");
  console.log("Le jeton d'une entreprise chez un ATS ne se devine pas : il se VÉRIFIE.");
  console.log("Une entreprise sans ATS public n'est pas un échec, c'est une information.\n");

  const toutes: OffreBrute[] = [];
  const trouves: string[] = [];

  for (const cible of ENTREPRISES_CIBLES) {
    const jeton = jetonProbable(cible.nom);
    if (jeton.length < 3) continue;

    for (const famille of FAMILLES_ATS) {
      try {
        const { corps, statut } = await lire(urlAts(famille as FamilleAts, jeton));
        if (statut !== 200) continue;
        const offres = analyseurAts(famille as FamilleAts)(corps, cible.nom);
        trouves.push(`${cible.nom} → ${famille}/${jeton} (${offres.length} offre(s))`);
        toutes.push(...offres);
        for (const o of offres.slice(0, 3)) console.log(`      · ${o.titre}`);
        break;
      } catch {
        // Ni JSON exploitable, ni réponse : cette famille n'est pas la bonne. On continue.
      }
    }
  }

  if (trouves.length === 0) {
    console.log("  Aucune page carrières trouvée par jeton deviné.");
    console.log("  Ce n'est pas une panne : la plupart des PME de la région n'utilisent pas");
    console.log("  ces ATS, ou sous un identifiant différent de leur nom.");
  } else {
    console.log(`\n  ${trouves.length} page(s) carrières trouvée(s) :`);
    for (const t of trouves) console.log(`    ✓ ${t}`);
  }
  return toutes;
}

async function main() {
  console.log("SONDE DES SOURCES — lecture seule, aucune écriture\n");
  console.log(`${RECHERCHES_GUICHET.length} recherches Guichet-Emplois · ${ENTREPRISES_CIBLES.length} entreprises × ${FAMILLES_ATS.length} ATS\n`);

  const brutes = [...(await sonderGuichet()), ...(await sonderAts())];

  console.log("\n═══ CE QUI ENTRERAIT DANS LE SUIVI ═══\n");
  const jour = new Date().toISOString().slice(0, 10);
  const tri = trier(brutes, new Set(), jour);

  console.log(`  ${brutes.length} offres brutes ramenées`);
  console.log(`  ${tri.doublons} doublons entre sources`);
  console.log(`  ${tri.souslePlancher} écartées (adéquation au rôle sous le plancher)`);
  console.log(`  ${tri.retenues.length} RETENUES\n`);

  for (const o of tri.retenues.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 25)) {
    console.log(`  ${String(o.score).padStart(3)}  ${o.entreprise} — ${o.poste}`);
  }

  if (brutes.length === 0) {
    console.log("\n⚠️  AUCUNE offre ramenée. Lire les réponses brutes ci-dessus : soit les");
    console.log("    sources ont changé de format, soit elles refusent l'appel.");
  }
}

main().catch((err) => {
  console.error("Sonde impossible :", err);
  process.exit(1);
});
