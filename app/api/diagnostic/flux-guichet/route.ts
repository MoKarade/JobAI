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
import { lireChamp, lireFluxGuichet, type Inventaire } from "@/lib/ingest/guichetFlux";
import { situer, type VerdictRegion } from "@/lib/ingest/region";
import type { OffreBrute } from "@/lib/ingest/types";

export const dynamic = "force-dynamic";
/** Une lecture longue d'un flux de ~134 Mo. Le budget interne borne, ceci est le mur. */
export const maxDuration = 300;

/** Budget de lecture. Bien au-delà d'une passe : ici on cherche à VOIR, pas à produire. */
const BUDGET_MS = 120_000;

/**
 * Offres régionales gardées.
 *
 * ⚠️ RELEVÉ APRÈS LE PREMIER PASSAGE RÉEL (2026-08-19). À 500, la lecture s'arrêtait sur
 * `plafond-retenues` après ~13 % du flux — donc AUCUN de ses comptes n'était concluant : ni
 * le total d'offres régionales, ni les villes inconnues, ni le recensement. Or la mesure a
 * montré que le flux se lit à ~25 Mo/s : le lire ENTIER coûte quelques secondes, pas les
 * deux minutes de budget. Le plafond n'a plus de raison de mordre avant la fin.
 */
const MAX_RETENUES = 5000;

/** Offres montrées à l'œil humain. */
const TAILLE_ECHANTILLON = 15;

/** Caractères de description montrés. Une annonce entière ne se lit pas dans un JSON. */
const EXTRAIT_MAX = 300;

/**
 * Les champs du flux dont on veut connaître les VALEURS.
 *
 * ⚠️ CHACUN EST ICI PARCE QU'IL POURRAIT CHANGER UNE DÉCISION, PAS PAR CURIOSITÉ.
 * La passe complète du 2026-08-19 a montré que le flux porte onze champs que l'analyseur
 * n'utilise pas, tous présents sur 100 % des offres. Trois d'entre eux valent le détour :
 *
 * - `noc2021` — le code de profession normalisé. S'il est bien là et bien formé, il classe
 *   une offre SANS passer par des mots-clés : plus de vocabulaire bilingue à tenir à jour
 *   ([VEILLE-32]), plus d'accents à normaliser ([VEILLE-34]). Le deuxième caractère du code
 *   porterait le niveau de qualification — d'où l'inventaire séparé de ce caractère. ⚠️ Ce
 *   dernier point est une LECTURE DE LA NORME, pas une mesure : c'est précisément ce que
 *   l'inventaire doit confirmer ou démentir.
 * - `postalcode` — un lieu EXACT là où on géocode aujourd'hui un nom de ville. Les trois
 *   premiers caractères (la région de tri) suffiraient à séparer l'île de Montréal de la
 *   région de Québec sans une seule requête Nominatim, et sans le piège des homonymes.
 * - `salary`, `education`, `experience` — les composantes que le barème compte aujourd'hui
 *   comme « inconnues », et qui lui font donner des points à ce qu'il ignore.
 *
 * ⚠️ RIEN N'EST BÂTI SUR EUX TANT QUE LEURS VALEURS N'ONT PAS ÉTÉ VUES. Savoir qu'une
 * balise existe ne dit pas ce qu'elle porte — c'est la faute du recensement en ensemble,
 * d'un cran plus loin.
 */
const INVENTAIRE: readonly Inventaire[] = [
  { nom: "state", champ: "state" },
  { nom: "postalcode-lettre", champ: "postalcode", classer: (v) => v.trim().slice(0, 1).toUpperCase() || "(vide)" },
  { nom: "postalcode-region", champ: "postalcode", classer: (v) => v.replace(/\s+/g, "").slice(0, 3).toUpperCase() },
  { nom: "noc2021", champ: "noc2021" },
  { nom: "noc2021-niveau", champ: "noc2021", classer: (v) => v.trim().slice(0, 2) },
  { nom: "jobtype", champ: "jobtype" },
  { nom: "workterm", champ: "workterm" },
  { nom: "education", champ: "education" },
  { nom: "experience", champ: "experience" },
  { nom: "worklanguage", champ: "worklanguage" },
  { nom: "salary", champ: "salary" },
];

/**
 * Un inventaire mis en forme : combien de classes distinctes, et les vingt plus fréquentes.
 *
 * Le nombre de classes DISTINCTES est rendu à côté du top : sans lui, vingt lignes se
 * liraient comme un inventaire complet alors qu'il peut en manquer des centaines.
 */
function resumerInventaire(inv: Record<string, Record<string, number>>) {
  return Object.fromEntries(
    Object.entries(inv).map(([nom, compte]) => [
      nom,
      { distinctes: Object.keys(compte).length, top: parFrequence(compte).slice(0, 20) },
    ]),
  );
}

/** Un compte par clé, trié du plus fréquent au moins fréquent. Un JSON qui se lit. */
function parFrequence(compte: Record<string, number>): { nom: string; n: number }[] {
  return Object.entries(compte)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([nom, n]) => ({ nom, n }));
}

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
      inventaire: INVENTAIRE,
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
        // LES DEUX MESURES JUMELLES, celles qui corrigent mes hypothèses. `balisesVues` dit
        // ce que le FLUX écrit ; `champsRenseignes` dit ce que mon ANALYSEUR en tire. Un
        // écart entre les deux désigne le défaut sans qu'on ait à deviner de quel côté il
        // est — et des COMPTES, jamais un ensemble : sur vingt offres, l'absence de `city`
        // m'avait fait conclure que le format n'a pas de ville. Il en a une.
        balisesEchantillon: rapport.balisesEchantillon,
        balisesVues: parFrequence(rapport.balisesVues),
        champsRenseignes: parFrequence(rapport.champsRenseignes),
        // ⚠️ DEUX INVENTAIRES, DEUX POPULATIONS — ET C'EST TOUT LE PROPOS.
        // `vues` porte sur les premières offres du flux, qui couvrent tout le Canada :
        // sur deux mille, 223 seulement étaient québécoises. Ses distributions décrivent
        // donc le Canada, pas ce qu'on ingérerait. `retenues` porte sur les offres
        // RÉGIONALES : c'est lui qui décide. Les lire l'un pour l'autre, c'est conclure sur
        // un préfixe non représentatif.
        inventaireVues: resumerInventaire(rapport.inventaireVues),
        inventaireRetenues: resumerInventaire(rapport.inventaireRetenues),
        // Le code de profession appairé à son titre : la seule façon de vérifier qu'il dit
        // bien ce que la norme prétend, au lieu de le supposer.
        professions: rapport.brutsRetenus.map((b) => ({
          titre: lireChamp(b, "title"),
          noc2021: lireChamp(b, "noc2021"),
          education: lireChamp(b, "education"),
          experience: lireChamp(b, "experience"),
          salary: lireChamp(b, "salary"),
          postalcode: lireChamp(b, "postalcode"),
          worklanguage: lireChamp(b, "worklanguage"),
        })),
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
