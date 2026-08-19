// app/api/diagnostic/flux-guichet/route.ts — LIRE le flux du Guichet une fois, pour de vrai.
//
// POURQUOI CETTE ROUTE EXISTE, ET POURQUOI ELLE PRÉCÈDE LE BRANCHEMENT
// `lib/ingest/guichetFlux.ts` sait lire le flux sans le charger, et ses tests le prouvent
// sur des flux fabriqués. Mais le NOM de ses champs est une HYPOTHÈSE : la session qui l'a
// écrit ne pouvait pas joindre `jobbank.gc.ca` (passerelle fermée, onze refus sur onze le
// 2026-08-19), et l'échantillon dont vient le format était tronqué en plein milieu.
//
// Brancher un analyseur non vérifié sur la passe quotidienne, c'est se préparer à un
// « 0 offre » qui ressemblerait à un marché calme — la panne exacte que ce projet a déjà
// payée trois jours durant. Cette route fait donc la mesure D'ABORD, depuis Vercel, là où
// le code tournera : elle rend le RECENSEMENT DES BALISES réellement rencontrées, les
// comptes de chaque motif de rejet, et un échantillon d'offres pour l'œil humain — la
// seule vérification qu'aucun code ne remplace.
//
// ⚠️ ELLE N'ÉCRIT RIEN. Aucune offre n'entre en base par ce chemin. C'est une lecture
// bornée (budget, plafond de retenues, tampon), suivie d'un compte rendu.
//
// GARDÉE, ET DEUX FOIS — la middleware, puis la session revérifiée ici. Même raison que la
// sonde voisine : un point d'entrée qui déclenche une lecture de plusieurs dizaines de Mo
// vers un service tiers n'a rien à faire au bout d'une route anonyme.

import { NextResponse } from "next/server";
import { exigerSession } from "@/lib/session";
import { expurgerPII } from "@/lib/ingest/expurger";
import { lireFluxGuichet } from "@/lib/ingest/guichetFlux";
import { situer, type VerdictRegion } from "@/lib/ingest/region";
import type { OffreBrute } from "@/lib/ingest/types";

export const dynamic = "force-dynamic";
/** Une lecture longue d'un flux de ~134 Mo. Le budget interne borne, ceci est le mur. */
export const maxDuration = 300;

/** Budget de lecture. Bien au-delà d'une passe : ici on cherche à VOIR, pas à produire. */
const BUDGET_MS = 120_000;

/** Offres régionales gardées. Assez pour juger, trop peu pour peser en mémoire. */
const MAX_RETENUES = 500;

/** Offres montrées à l'œil humain. */
const TAILLE_ECHANTILLON = 15;

/** Caractères de description montrés. Une annonce entière ne se lit pas dans un JSON. */
const EXTRAIT_MAX = 300;

export async function GET() {
  try {
    await exigerSession();
  } catch {
    return NextResponse.json(
      { ok: false, erreur: "non autorisé" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Ce que le prédicat compte au passage. Sans ce tableau, une lecture qui ne retient rien
  // ne dirait pas POURQUOI : « le flux ne porte aucune offre régionale » et « nos listes
  // ne connaissent aucun de ses noms de ville » appellent deux corrections opposées.
  const verdicts: Record<VerdictRegion, number> = {
    "dans-la-region": 0,
    "hors-region": 0,
    "lieu-inconnu": 0,
  };
  /** Les villes que le flux nomme et que nos listes ne savent pas placer. */
  const inconnues = new Map<string, number>();

  try {
    const rapport = await lireFluxGuichet(fetch, {
      budgetMs: BUDGET_MS,
      maxRetenues: MAX_RETENUES,
      garder: (o: OffreBrute) => {
        const v = situer(o.ville, o.description);
        verdicts[v] += 1;
        if (v === "lieu-inconnu") {
          const nom = o.ville.trim() === "" ? "(vide)" : o.ville.trim();
          inconnues.set(nom, (inconnues.get(nom) ?? 0) + 1);
        }
        return v === "dans-la-region";
      },
    });

    return NextResponse.json(
      {
        ok: true,
        // ⚠️ SEUL `flux-termine` autorise à conclure. Les trois autres fins décrivent une
        // lecture PARTIELLE : un « 0 régionale » sous `budget-depasse` ne dit rien du flux.
        fin: rapport.fin,
        construitLe: rapport.construitLe,
        vues: rapport.vues,
        preFiltrees: rapport.preFiltrees,
        illisibles: rapport.illisibles,
        ecartees: rapport.ecartees,
        retenues: rapport.retenues.length,
        megaoctetsLus: Math.round((rapport.octetsLus / (1024 * 1024)) * 10) / 10,
        secondes: Math.round(rapport.ms / 100) / 10,
        // LE champ qui corrige mes hypothèses : si `title`, `city` ou `url` n'y sont pas,
        // c'est l'analyseur qu'il faut reprendre, pas la source qu'il faut abandonner.
        balisesVues: rapport.balisesVues,
        verdicts,
        // Groupées et triées par fréquence : quarante-sept lignes ne se lisent pas, trois
        // lignes comptées désignent le correctif.
        villesInconnues: [...inconnues.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 25)
          .map(([nom, n]) => ({ nom, n })),
        // L'échantillon pour l'œil humain. Le texte des annonces est écrit par des tiers :
        // il passe par l'expurgateur avant de sortir d'ici, comme partout ailleurs.
        echantillon: rapport.retenues.slice(0, TAILLE_ECHANTILLON).map((o) => ({
          titre: o.titre,
          entreprise: o.entreprise,
          ville: o.ville,
          lien: o.lien,
          publieeLe: o.publieeLe,
          longueurDescription: o.description.length,
          extrait: expurgerPII(o.description).texte.slice(0, EXTRAIT_MAX),
        })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    // Une source injoignable ne se déguise pas en journée calme : le module LÈVE, et
    // l'échec porte son nom jusqu'ici.
    return NextResponse.json(
      { ok: false, erreur: err instanceof Error ? err.message : String(err) },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
