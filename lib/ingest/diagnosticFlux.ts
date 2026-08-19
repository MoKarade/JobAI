// lib/ingest/diagnosticFlux.ts — mesurer le flux du Guichet, UNE fois, pour deux appelants.
//
// ⚠️ POURQUOI CE MODULE EXISTE PLUTÔT QU'UNE SECONDE COPIE DANS L'OUTIL MCP.
// Ce diagnostic est appelé de deux endroits : la route HTTP (Marc, depuis son navigateur) et
// un outil MCP (moi, depuis une conversation). Recopier la liste des champs inventoriés et
// la mise en forme du rapport donnerait DEUX diagnostics qui répondraient différemment à la
// même question — et le jour où l'un des deux ajouterait un champ, l'autre mesurerait autre
// chose sans que rien ne le signale. Ce dépôt a déjà payé cette classe cinq fois (quatre
// listes de colonnes, l'empreinte du seed, deux listes de tables). Une règle, un exemplaire,
// deux consommateurs.
//
// ⚠️ ET C'EST ICI QUE LE `fetch` VERS LE GUICHET DOIT VIVRE. `lib/ingest/` est le seul
// dossier autorisé à contacter une source d'offres (garde-fou n°4). L'outil MCP ne fait donc
// pas la requête lui-même : il reçoit cette fonction, injectée par la route.

import { expurgerPII } from "./expurger";
import { lireChamp, lireFluxGuichet, type Inventaire } from "./guichetFlux";
import { situer, type VerdictRegion } from "./region";
import type { OffreBrute } from "./types";

/** Budget de lecture. Bien au-delà d'une passe : ici on cherche à VOIR, pas à produire. */
export const BUDGET_MS_DIAGNOSTIC = 120_000;

/**
 * Le même diagnostic, sous le mur PLUS COURT d'un appel MCP.
 *
 * ⚠️ UN BUDGET QUI DÉPASSE LE MUR DE SA FONCTION NE BORNE RIEN. La route HTTP a 300 s, la
 * route MCP en a 60 : y passer 120 s ferait couper l'appel PAR LE DEHORS, et le client ne
 * verrait qu'un timeout — sans le `fin` qui dit si la lecture était complète. Mesuré, le
 * flux entier se lit en ~7 s ; 40 s laissent une marge large tout en restant sous le mur.
 */
export const BUDGET_MS_MCP = 40_000;

/**
 * Offres régionales gardées.
 *
 * ⚠️ RELEVÉ APRÈS LE PREMIER PASSAGE RÉEL (2026-08-19). À 500, la lecture s'arrêtait sur
 * `plafond-retenues` après ~42 % du flux — donc AUCUN de ses comptes n'était concluant.
 * La mesure a montré que le flux se lit à ~27 Mo/s : le lire ENTIER coûte quelques secondes.
 */
export const MAX_RETENUES_DIAGNOSTIC = 5000;

/** Offres montrées à l'œil humain. */
const TAILLE_ECHANTILLON = 15;

/** Caractères de description montrés. Une annonce entière ne se lit pas dans un JSON. */
const EXTRAIT_MAX = 300;

/**
 * Les champs du flux dont on veut connaître les VALEURS.
 *
 * ⚠️ CHACUN EST ICI PARCE QU'IL POURRAIT CHANGER UNE DÉCISION, PAS PAR CURIOSITÉ. Le flux
 * porte onze champs que l'analyseur n'utilise pas, tous présents sur 100 % des offres :
 *
 * - `noc2021` — le code de profession normalisé. Il classe une offre SANS passer par des
 *   mots-clés : plus de vocabulaire bilingue à tenir ([VEILLE-32]), plus d'accents à
 *   normaliser ([VEILLE-34]). ⚠️ Le deuxième caractère porterait le niveau de qualification —
 *   c'est une LECTURE DE LA NORME, pas une mesure, et c'est ce que l'inventaire par titres
 *   doit confirmer ou démentir (ADR-0012).
 * - `postalcode` — un lieu EXACT là où on géocode un nom de ville. Sa région de tri
 *   séparerait l'île de Montréal de la région de Québec sans requête ni piège d'homonyme.
 * - `salary`, `education`, `experience` — ce que le barème compte aujourd'hui comme
 *   « inconnu », et pour quoi il donne des points à ce qu'il ignore.
 */
export const INVENTAIRE_FLUX: readonly Inventaire[] = [
  { nom: "state", champ: "state" },
  { nom: "postalcode-lettre", champ: "postalcode", classer: (v) => v.trim().slice(0, 1).toUpperCase() || "(vide)" },
  { nom: "postalcode-region", champ: "postalcode", classer: (v) => v.replace(/\s+/g, "").slice(0, 3).toUpperCase() },
  // ⚠️ AVEC DES EXEMPLES DE TITRES. Un compte ne se vérifie pas tout seul : « 63200 : 123 »
  // ne dit pas si ce métier concerne Marc, « 63200 : 123 — Cook, Kitchen helper » se tranche
  // d'un coup d'œil. C'est ce qui décide de la liste des codes retenus (ADR-0012).
  { nom: "noc2021", champ: "noc2021", exemplesDe: "title" },
  { nom: "noc2021-niveau", champ: "noc2021", classer: (v) => v.trim().slice(0, 2), exemplesDe: "title" },
  { nom: "jobtype", champ: "jobtype" },
  { nom: "workterm", champ: "workterm" },
  { nom: "education", champ: "education" },
  { nom: "experience", champ: "experience" },
  { nom: "worklanguage", champ: "worklanguage" },
  { nom: "salary", champ: "salary" },
];

/** Un compte par clé, trié du plus fréquent au moins fréquent. Un JSON qui se lit. */
export function parFrequence(compte: Record<string, number>): { nom: string; n: number }[] {
  return Object.entries(compte)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([nom, n]) => ({ nom, n }));
}

/**
 * Un inventaire mis en forme : combien de classes distinctes, et les plus fréquentes.
 *
 * Le nombre de classes DISTINCTES est rendu à côté du top : sans lui, vingt lignes se
 * liraient comme un inventaire complet alors qu'il peut en manquer des centaines.
 */
function resumerInventaire(inv: Record<string, Record<string, number>>, garder: number) {
  return Object.fromEntries(
    Object.entries(inv).map(([nom, compte]) => [
      nom,
      { distinctes: Object.keys(compte).length, top: parFrequence(compte).slice(0, garder) },
    ]),
  );
}

/**
 * Lit le flux et rend ce qu'il faut en penser.
 *
 * ⚠️ LÈVE si la source est injoignable. Une source qui ne répond pas ne se déguise pas en
 * journée calme : l'appelant transforme l'exception en réponse honnête, et c'est là que
 * l'échec porte son nom.
 */
export async function diagnostiquerFlux(
  recuperer: typeof fetch = fetch,
  budgetMs = BUDGET_MS_DIAGNOSTIC,
) {
  // Ce que le prédicat compte au passage. Sans ce tableau, une lecture qui ne retient rien
  // ne dirait pas POURQUOI : « le flux ne porte aucune offre régionale » et « nos listes ne
  // connaissent aucun de ses noms de ville » appellent deux corrections opposées.
  const verdicts: Record<VerdictRegion, number> = {
    "dans-la-region": 0,
    "hors-region": 0,
    "lieu-inconnu": 0,
  };
  const inconnues = new Map<string, number>();

  const rapport = await lireFluxGuichet(recuperer, {
    budgetMs,
    maxRetenues: MAX_RETENUES_DIAGNOSTIC,
    inventaire: INVENTAIRE_FLUX,
    garder: (o: OffreBrute) => {
      const v = situer(o.ville, o.description);
      verdicts[v] = (verdicts[v] ?? 0) + 1;
      if (v === "lieu-inconnu") {
        const nom = o.ville.trim() === "" ? "(vide)" : o.ville.trim();
        inconnues.set(nom, (inconnues.get(nom) ?? 0) + 1);
      }
      return v === "dans-la-region";
    },
  });

  return {
    // ⚠️ SEUL `flux-termine` autorise à conclure. Les trois autres fins décrivent une lecture
    // PARTIELLE : un « 0 régionale » sous `budget-depasse` ne dit rien du flux.
    fin: rapport.fin,
    construitLe: rapport.construitLe,
    vues: rapport.vues,
    preFiltrees: rapport.preFiltrees,
    illisibles: rapport.illisibles,
    ecartees: rapport.ecartees,
    retenues: rapport.retenues.length,
    megaoctetsLus: Math.round((rapport.octetsLus / (1024 * 1024)) * 10) / 10,
    secondes: Math.round(rapport.ms / 100) / 10,
    // LES DEUX MESURES JUMELLES : `balisesVues` dit ce que le FLUX écrit, `champsRenseignes`
    // ce que l'ANALYSEUR en tire. L'écart désigne le défaut sans qu'on ait à deviner de quel
    // côté il est — et des COMPTES, jamais un ensemble.
    balisesEchantillon: rapport.balisesEchantillon,
    balisesVues: parFrequence(rapport.balisesVues),
    champsRenseignes: parFrequence(rapport.champsRenseignes),
    // ⚠️ DEUX INVENTAIRES, DEUX POPULATIONS. `vues` porte sur les premières offres du flux,
    // qui couvrent tout le Canada (223 québécoises sur 2000) : ses distributions décrivent le
    // Canada, pas ce qu'on ingérerait. `retenues` porte sur les offres RÉGIONALES — c'est lui
    // qui décide. Les lire l'un pour l'autre, c'est conclure sur un préfixe non représentatif.
    inventaireVues: resumerInventaire(rapport.inventaireVues, 20),
    inventaireRetenues: resumerInventaire(rapport.inventaireRetenues, 40),
    // La table qui DÉCIDE : par classe, le compte ET des titres réels, sur les régionales.
    exemplesRetenues: rapport.exemplesRetenues,
    // Le code de profession appairé à son titre : la seule façon de vérifier qu'il dit bien
    // ce que la norme prétend, au lieu de le supposer.
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
    // Groupées et triées par fréquence : quarante-sept lignes ne se lisent pas, trois lignes
    // comptées désignent le correctif.
    villesInconnues: [...inconnues.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([nom, n]) => ({ nom, n })),
    // L'échantillon pour l'œil humain. Le texte des annonces est écrit par des tiers : il
    // passe par l'expurgateur avant de sortir d'ici, comme partout ailleurs.
    echantillon: rapport.retenues.slice(0, TAILLE_ECHANTILLON).map((o) => ({
      titre: o.titre,
      entreprise: o.entreprise,
      ville: o.ville,
      lien: o.lien,
      publieeLe: o.publieeLe,
      longueurDescription: o.description.length,
      extrait: expurgerPII(o.description).texte.slice(0, EXTRAIT_MAX),
    })),
  };
}

export type RapportDiagnosticFlux = Awaited<ReturnType<typeof diagnostiquerFlux>>;
