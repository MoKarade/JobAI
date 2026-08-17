// lib/overpass.ts — demander à OpenStreetMap où sont les bornes de recharge.
//
// ⚠️ TROISIÈME FRONTIÈRE RÉSEAU DE L'APP, et elle est déclarée ici comme les deux autres :
// `lib/ingest/` parle aux sources d'offres, `lib/geocodage.ts` parle à Nominatim, ce fichier
// parle à Overpass. Aucun autre module n'a le droit de sortir. Overpass sert la MÊME base
// de données qu'OpenStreetMap — celle qui nous donne déjà les positions — par une autre
// porte : elle répond à « qu'y a-t-il dans ce rectangle ? » là où Nominatim répond à « où
// est ce nom ? ».
//
// ⚠️ CE SERVICE TOMBE, ET IL FAUT COMPTER AVEC
// Mesuré le 2026-08-05 sur un runner au réseau ouvert : `overpass-api.de` a répondu
// **HTTP 504** à la première interrogation. Ce n'est pas un refus — c'est une instance
// bénévole saturée. Toute la conception en découle :
//   · plusieurs instances, essayées l'une après l'autre ;
//   · un échec n'est JAMAIS une réponse « aucune borne » — les deux ne se disent pas pareil
//     à l'écran, et les confondre ferait passer un lieu non mesuré pour un lieu sans borne ;
//   · le résultat se GARDE en base, pour ne pas redemander ce qu'on sait déjà.
//
// USAGE PARCIMONIEUX, comme pour Nominatim : ce sont des bénévoles qui paient la facture.
// Une entreprise n'est interrogée qu'une fois, et rien n'est demandé au chargement d'une
// page.

import { boiteAutour, type Borne } from "./bornes";

/**
 * Les instances publiques, dans l'ordre d'essai.
 *
 * Plusieurs, parce qu'une seule est un point unique de panne — et qu'on en a eu la preuve
 * avant même d'écrire ce fichier. On s'arrête à la PREMIÈRE qui répond : ce n'est pas une
 * répartition de charge, c'est un repli.
 */
export const INSTANCES_OVERPASS: readonly string[] = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
];

/**
 * Au-delà, on abandonne : une requête qui pend bloquerait toute la passe.
 *
 * ⚠️ CE DÉLAI N'EST PLUS PAYÉ PAR INSTANCE (2026-08-17). Les trois instances sont désormais
 * interrogées EN PARALLÈLE : le pire cas d'une passe est donc UN délai, pas trois. C'est ce
 * qui permet de le rendre patient sans reprendre le budget en otage — 15 s en parallèle
 * coûtent moins que les 24 s que la série pouvait consommer.
 *
 * ⚠️ ET IL DOIT EXCÉDER `DELAI_SERVEUR_S` DE PLUS D'UNE SECONDE. C'est le défaut qui a gelé
 * la mesure du 15 au 17 août : le client abandonnait à 8 s pendant que le serveur avait
 * droit à 7 — une seconde pour la connexion, le transfert, ET la file d'attente. Or les
 * instances publiques Overpass FONT LA QUEUE, et `[timeout:N]` ne gouverne que l'exécution,
 * jamais l'attente. Sous charge, les trois expiraient identiquement (« aborted due to
 * timeout » ×2, « fetch failed » ×1) alors que la même requête rendait 68 bornes le 14.
 *
 * La boîte interrogée couvre TOUTE la région (une seule requête pour le lot entier, voir
 * `boiteEnglobante`), mais `amenity=charging_station` est un jeu minuscule : Overpass le
 * sert par son index spatial, et l'étendue pèse beaucoup moins que le nombre de requêtes.
 */
export const DELAI_MAX_MS = 15_000;

/**
 * Le rayon d'une requête RÉGIONALE, en degrés de latitude approximatifs.
 *
 * Garde-fou contre une boîte absurde : si un jour une position aberrante se glissait dans
 * la table, la boîte englobante couvrirait un continent et la requête ramènerait des
 * milliers de bornes — ou expirerait.
 *
 * ⚠️ 3 ET NON PLUS 2, depuis que la portée de recherche est passée de 350 m à 15 km
 * (`PORTEE_RECHERCHE_M`). Cette marge s'ajoute DES DEUX CÔTÉS de la boîte : elle coûte
 * ~0,27° en latitude et ~0,40° en longitude sous nos latitudes. Un lot d'employeurs étalé
 * sur 1,6° d'est en ouest — parfaitement normal entre Portneuf et Charlevoix — arrivait à
 * 1,99° et frôlait le refus. Un garde-fou qui rejette le cas nominal ne protège plus, il
 * casse : la mesure ne se serait simplement jamais faite, sans autre trace qu'une ligne
 * d'erreur. 3° laisse la marge tout en attrapant encore une position d'un autre continent.
 */
export const ETENDUE_MAX_DEG = 3;

/** Ce qu'une interrogation a donné — l'échec est DIT, jamais confondu avec un vide. */
export type ResultatBornes =
  | { ok: true; bornes: Borne[] }
  | { ok: false; raison: string };

/**
 * La requête Overpass QL pour les bornes d'un rectangle.
 *
 * `node` ET `way` : une borne est parfois cartographiée comme un point, parfois comme la
 * surface d'une station. N'interroger que les points en manquerait une partie — et « aucune
 * borne » serait alors faux.
 */
/**
 * Délai accordé au SERVEUR, en secondes. Il DOIT rester sous le nôtre.
 *
 * ⚠️ IL ÉTAIT À 12 ALORS QU'ON RACCROCHE À 8, et c'est un défaut à part entière : toute
 * requête mettant entre 8 et 12 secondes était abandonnée par nous pendant que le serveur
 * la traitait encore. Elle comptait comme un échec d'instance, on passait à la suivante, et
 * le travail déjà fait par la première était jeté. Donner à un service plus de temps qu'on
 * n'est prêt à en attendre, c'est se garantir des échecs qui n'en sont pas.
 */
export const DELAI_SERVEUR_S = 12;

export function requeteBornes(boite: {
  latMin: number;
  lonMin: number;
  latMax: number;
  lonMax: number;
}): string {
  const b = `${boite.latMin},${boite.lonMin},${boite.latMax},${boite.lonMax}`;
  const cible = `["amenity"="charging_station"](${b})`;
  return `[out:json][timeout:${DELAI_SERVEUR_S}];(node${cible};way${cible};);out center;`;
}

/**
 * Overpass a-t-il signalé qu'il n'a PAS pu répondre ?
 *
 * ⚠️ C'EST LE DÉFAUT QUI A GELÉ TOUTE LA FONCTIONNALITÉ, et c'est la leçon maison appliquée
 * à un service de plus : un HTTP 200 ne prouve rien tant qu'on n'a pas lu ce qu'il contient.
 *
 * Quand sa requête dépasse le temps imparti, Overpass ne répond pas par une erreur HTTP :
 * il rend **200**, un corps JSON parfaitement valide, `elements: []` — et un champ `remark`
 * qui dit que la requête a expiré. Sans le lire, « le service n'a pas pu chercher » devient
 * « il n'y a aucune borne » : l'app inscrit alors « aucune borne » pour TOUTES les
 * entreprises, et comme la date de mesure est posée du même coup, elles ne sont plus jamais
 * réinterrogées. Un échec transitoire se fige en fait permanent.
 */
export function remarqueOverpass(charge: unknown): string | null {
  if (typeof charge !== "object" || charge === null) return null;
  const r = (charge as { remark?: unknown }).remark;
  return typeof r === "string" && r.trim() !== "" ? r.trim() : null;
}

/** Une chaîne de tag non vide, ou `null`. */
function texte(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/**
 * À partir de quelle puissance une borne est « rapide », en kW.
 *
 * 25 : au Québec, une borne de niveau 2 monte à 7,2 kW (et jamais au-delà de 19,2 kW, la
 * limite du courant alternatif domestique). La recharge rapide commence à 24 kW et se fait
 * couramment à 50. Le seuil est donc posé dans le creux entre les deux familles — pas au
 * milieu d'une plage réelle, où une borne changerait de catégorie pour un demi-kilowatt.
 */
export const SEUIL_RAPIDE_KW = 25;

/**
 * Une puissance annoncée par OpenStreetMap, en kW. `null` si elle n'est pas lisible.
 *
 * Les contributeurs écrivent « 50 kW », « 50 », « 62.5 kW », parfois « 50000 » en watts. Le
 * tag `maxpower` n'a pas d'unité obligatoire : à défaut, une valeur au-dessus de 1000 ne
 * peut être que des watts (aucune borne au monde ne fait 50 000 kW), en dessous ce sont des
 * kilowatts. C'est une convention de lecture, et elle est écrite ici plutôt que devinée
 * trois fois.
 */
export function puissanceKw(brut: unknown): number | null {
  const s = texte(brut);
  if (s === null) return null;
  const m = s.match(/^(\d+(?:[.,]\d+)?)\s*(kw|w)?\b/i);
  if (!m) return null;
  const n = Number((m[1] ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unite = (m[2] ?? "").toLowerCase();
  if (unite === "w") return n / 1000;
  if (unite === "kw") return n;
  return n > 1000 ? n / 1000 : n;
}

/** Les prises à COURANT CONTINU — leur seule présence signe une borne rapide. */
const PRISES_RAPIDES = [
  "socket:chademo",
  "socket:type2_combo",
  "socket:type1_combo",
  "socket:ccs",
  "socket:tesla_supercharger",
  "socket:tesla_supercharger_ccs",
] as const;

/** Les prises à courant alternatif — au mieux du niveau 2, jamais de la recharge rapide. */
const PRISES_LENTES = ["socket:type1", "socket:type2", "socket:schuko", "socket:typee"] as const;

/**
 * Un tag de prise qui vaut « il y en a » (OSM y met un nombre, ou `yes`).
 *
 * ⚠️ LE `null` SE TESTE AVANT LE `?.`, ET PAS APRÈS. Écrit `texte(v)?.toLowerCase()` puis
 * comparé à `null`, ce prédicat rendait TRUE sur un tag ABSENT — l'optionnel produit
 * `undefined`, qui n'est pas `null`. Toute borne était donc « rapide », y compris celles qui
 * déclarent explicitement ne pas l'être. Attrapé par le test des prises alternatives.
 */
function prisePresente(v: unknown): boolean {
  const s = texte(v);
  if (s === null) return false;
  const bas = s.toLowerCase();
  return bas !== "no" && bas !== "0";
}

/**
 * Cette borne est-elle une RAPIDE ? `null` quand les tags ne permettent pas de trancher.
 *
 * ⚠️ TROIS ÉTATS, PAS DEUX, et c'est le garde-fou n°3 appliqué à un booléen. OpenStreetMap
 * est renseigné par des bénévoles : beaucoup de bornes n'ont ni prise ni puissance déclarée.
 * Rendre `false` par défaut afficherait « standard » sur une borne dont on ne sait rien —
 * un fait inventé, présenté avec l'aplomb d'une mesure.
 *
 * L'ordre suit la fiabilité de ce qu'on lit : une déclaration explicite d'abord, le type de
 * prise ensuite (physique, non ambigu), la puissance en dernier (sujette aux fautes de
 * frappe et d'unité).
 */
export function estRapide(tags: Record<string, unknown>): boolean | null {
  const declare = texte(tags.fast_charge)?.toLowerCase();
  if (declare === "yes") return true;
  if (declare === "no") return false;

  if (PRISES_RAPIDES.some((p) => prisePresente(tags[p]))) return true;

  // La puissance MAXIMALE annoncée, quel que soit le tag qui la porte — y compris les
  // `socket:<type>:output`, où vit souvent la seule valeur renseignée.
  let maxKw: number | null = null;
  for (const [cle, valeur] of Object.entries(tags)) {
    if (cle !== "charging_station:output" && cle !== "maxpower" && !cle.endsWith(":output")) {
      continue;
    }
    const kw = puissanceKw(valeur);
    if (kw !== null && (maxKw === null || kw > maxKw)) maxKw = kw;
  }
  if (maxKw !== null) return maxKw >= SEUIL_RAPIDE_KW;

  // Que des prises alternatives déclarées : la borne ne peut pas être rapide.
  if (PRISES_LENTES.some((p) => prisePresente(tags[p]))) return false;

  return null;
}

/**
 * Le tarif TEL QUE PUBLIÉ, ou `null`.
 *
 * ⚠️ CE N'EST PAS UN PRIX MOYEN, et il ne faut pas faire semblant. Marc a demandé « quel
 * prix moyen » ; OpenStreetMap ne porte pas ça. Ce qu'il porte : `fee` (payant ou non) et,
 * plus rarement, `charge` — le tarif que le contributeur a lu SUR la borne. On rend cette
 * chaîne telle quelle. Fabriquer une moyenne à partir de tarifs de catalogue trouvés
 * ailleurs donnerait un chiffre crédible que personne n'a relevé à cet endroit.
 */
export function tarifPublie(tags: Record<string, unknown>): string | null {
  const affiche = texte(tags.charge);
  if (affiche) return affiche.slice(0, 60);
  const paye = texte(tags.fee)?.toLowerCase();
  if (paye === "no") return "gratuite";
  if (paye === "yes") return "payante, tarif non publié";
  return null;
}

/** Lit une réponse Overpass. PURE : c'est ce qui la rend testable sans réseau. */
export function lireBornes(charge: unknown): Borne[] {
  if (typeof charge !== "object" || charge === null) return [];
  const elements = (charge as { elements?: unknown }).elements;
  if (!Array.isArray(elements)) return [];

  const bornes: Borne[] = [];
  for (const e of elements as Record<string, unknown>[]) {
    // `center` pour les surfaces (`way`), `lat`/`lon` pour les points (`node`).
    const centre = e.center as { lat?: unknown; lon?: unknown } | undefined;
    const lat = Number(centre?.lat ?? e.lat);
    const lon = Number(centre?.lon ?? e.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const tags = (e.tags ?? {}) as Record<string, unknown>;

    // ⚠️ LE RÉSEAU AVANT LE NOM (« quelle marque », demande du 2026-08-06). `name` porte
    // souvent le lieu d'accueil — « Stationnement Place Fleur de Lys » — quand `network`
    // porte l'enseigne qu'on cherche : « Circuit électrique », « FLO », « Tesla ». Lire le
    // nom d'abord donnait le lieu au lieu de la marque, ce qui répond à une autre question.
    const marque = [tags.network, tags.brand, tags.operator, tags.name]
      .map(texte)
      .find((v): v is string => v !== null);

    bornes.push({
      id: Number(e.id) || 0,
      lat,
      lon,
      // Borné : un nom d'exploitant est court, et cette chaîne finit à l'écran.
      nom: marque ? marque.slice(0, 60) : null,
      rapide: estRapide(tags),
      tarif: tarifPublie(tags),
    });
  }
  return bornes;
}

/** De quoi appeler le réseau — injecté, donc testable. */
export interface OutilsOverpass {
  recuperer?: typeof fetch;
  instances?: readonly string[];
}

/**
 * Les bornes autour d'un point.
 *
 * Essaie les instances l'une après l'autre et s'arrête à la première qui RÉPOND. Un échec
 * de toutes rend `ok: false` avec sa raison — jamais une liste vide, qui se lirait comme
 * « aucune borne ici » alors qu'on n'a rien pu mesurer.
 */
export async function chercherBornes(
  lieu: { lat: number; lon: number },
  rayonM: number,
  outils: OutilsOverpass = {},
): Promise<ResultatBornes> {
  return chercherBornesBoite(boiteAutour(lieu, rayonM), outils);
}

/**
 * Les bornes d'une BOÎTE — une seule requête, quel que soit le nombre de lieux.
 *
 * ⚠️ C'EST LA FORME QU'IL FAUT UTILISER POUR PLUSIEURS LIEUX. Une requête par entreprise
 * coûte un aller-retour chacune, et quand elle échoue elle coûte le délai × les trois
 * instances de repli : mesuré en production le 2026-08-05, trois entreprises non mesurées
 * avaient à elles seules épuisé tout le budget de la passe. Une boîte qui les englobe
 * toutes ramène les bornes en UNE fois, et la proximité se calcule ensuite en local.
 *
 * Essaie les instances l'une après l'autre et s'arrête à la première qui RÉPOND. Un échec
 * de toutes rend `ok: false` avec sa raison — jamais une liste vide, qui se lirait comme
 * « aucune borne ici » alors qu'on n'a rien pu mesurer.
 */
export async function chercherBornesBoite(
  boite: { latMin: number; lonMin: number; latMax: number; lonMax: number },
  outils: OutilsOverpass = {},
): Promise<ResultatBornes> {
  const recuperer = outils.recuperer ?? fetch;
  const instances = outils.instances ?? INSTANCES_OVERPASS;
  const corps = requeteBornes(boite);
  const echecs: string[] = [];

  // ⚠️ EN PARALLÈLE, PAS EN SÉRIE — et c'est ce qui change tout sous charge.
  //
  // En série, une instance saturée coûtait son délai entier AVANT qu'on essaie la suivante :
  // trois échecs faisaient 24 s et ne rendaient rien. En parallèle, le pire cas est UN délai,
  // ce qui permet de le rendre patient (15 s) au lieu de le rogner.
  //
  // C'est aussi PLUS POLI qu'il n'y paraît : dès qu'une instance répond, les autres sont
  // ABANDONNÉES (`ctrl.abort()`), donc elles cessent de calculer pour rien. Une retente en
  // série, elle, laissait la première instance terminer notre requête sans que personne ne
  // lise sa réponse. Une petite requête par instance et par jour reste négligeable pour un
  // service bénévole ; la gâcher ne l'était pas.
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), DELAI_MAX_MS);

  const tentatives = instances.map(async (url) => {
    const r = await recuperer(url, {
      method: "POST",
      body: new URLSearchParams({ data: corps }),
      headers: {
        // Se présenter : Overpass refuse les appelants anonymes trop insistants, et
        // c'est la moindre des politesses envers un service bénévole.
        "User-Agent": "JobAI/1.0 (recherche d'emploi personnelle)",
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });

    // 504 mesuré en vrai : l'instance est saturée, pas en panne. Rejeter ici laisse la
    // course continuer avec les autres, au lieu d'emporter tout le lot.
    if (!r.ok) throw new Error(`${hote(url)} → HTTP ${r.status}`);

    const charge = await r.json();

    // Le corps DIT quand le service a renoncé, même sous un 200. Le confondre avec
    // « aucune borne » gèlerait la mesure de tout le lot (voir `remarqueOverpass`).
    const remarque = remarqueOverpass(charge);
    if (remarque !== null) throw new Error(`${hote(url)} → ${remarque}`);

    return lireBornes(charge);
  });

  try {
    const bornes = await Promise.any(tentatives);
    return { ok: true, bornes };
  } catch (err) {
    // `Promise.any` ne rejette que si TOUTES ont échoué : on rend alors chaque motif, parce
    // que « saturé », « injoignable » et « a renoncé » appellent trois lectures différentes.
    const causes =
      err instanceof AggregateError
        ? err.errors.map((e) => (e instanceof Error ? e.message : String(e)))
        : [err instanceof Error ? err.message : String(err)];
    echecs.push(...causes);
  } finally {
    // Libère les perdantes dans TOUS les cas — succès comme échec.
    clearTimeout(minuteur);
    ctrl.abort();
  }

  return { ok: false, raison: echecs.join(" · ") || "aucune instance interrogée" };
}

/** L'hôte seul, pour un message d'erreur lisible sans étaler l'URL entière. */
function hote(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
