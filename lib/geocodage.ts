// lib/geocodage.ts — situer une municipalité, une seule fois.
//
// C'est le SEUL fichier de l'app autorisé à appeler Nominatim, comme `lib/ingest/` sera le
// seul à appeler une source d'offres (garde-fou n°4). Tout le reste de l'app lit la table
// `villes`, jamais le réseau.
//
// CE QU'ON GÉOCODE, ET CE QU'ON NE GÉOCODE PAS
// On géocode des VILLES (« Lévis ») et des ENTREPRISES CIBLES (« Laserax, Québec ») — des
// données PUBLIQUES. Jamais le domicile de Marc ni un lieu personnel : ils ne sortent pas
// des variables `DOMICILE_LAT` / `DOMICILE_LON` et ne partent vers aucun service tiers.
// *(Frontière élargie aux entreprises le 2026-07-29, [UX-09] : les épingles par ville
// étaient jugées inutilisables — voir CLAUDE.md §2.4.)*
//
// PRÉCISION ASSUMÉE
// Le point rendu est le centre de la municipalité. Ce n'est PAS la position de l'employeur,
// et l'interface le dit. La distance exacte de chaque offre existe déjà et vient d'ailleurs
// (`offers.km`, mesurée) : la carte sert à voir la répartition, pas à mesurer.
//
// LE `fetch` EST INJECTÉ
// Pas pour l'élégance : pour que la logique — construction de requête, validation, rejet
// d'une réponse aberrante — soit testable sans réseau. C'est d'autant plus nécessaire que
// la session de développement n'a PAS accès à Nominatim ; sans injection, tout ce fichier
// serait livré sans une seule vérification.

/** Bornes larges de la grande région de Québec, alignées sur les CHECK de la table. */
export const BORNES = { latMin: 45, latMax: 49, lonMin: -75, lonMax: -68 } as const;

/** Nominatim exige un intervalle d'au moins une seconde entre deux requêtes. */
export const DELAI_ENTRE_REQUETES_MS = 1_100;

/**
 * Plafond par exécution. Le géocodage est un traitement de fond : mieux vaut plusieurs
 * passes courtes qu'une longue qui dépasse le temps d'exécution d'une Server Action.
 */
export const MAX_VILLES_PAR_PASSE = 8;

/**
 * Nominatim REFUSE les requêtes sans identification et peut bannir l'appelant.
 * L'adresse de contact vient de l'environnement — ce n'est pas un secret, mais c'est une
 * donnée personnelle, et le garde-fou n°1 la garde hors du code.
 */
export function entete(courriel: string | undefined): Record<string, string> {
  const contact = courriel?.trim();
  return {
    "User-Agent": contact
      ? `JobAI/1.0 (+https://emploi.hubperso.com; ${contact})`
      : "JobAI/1.0 (+https://emploi.hubperso.com)",
    "Accept-Language": "fr-CA,fr",
  };
}

/**
 * Réduit un libellé de référence à un nom géocodable.
 *
 * `ENTREPRISES_CIBLES` écrit « Québec (Beauport) » ou « Québec (parc technologique) » : la
 * parenthèse précise un secteur, parfois une municipalité fusionnée, parfois un lieu-dit
 * qu'aucun géocodeur ne connaît. On garde la ville de base — approximation assumée et
 * DITE à l'écran, plutôt qu'une épingle absente ou fantaisiste.
 */
export function villeGeocodable(libelle: string): string | null {
  const base = libelle.split("(")[0]?.trim() ?? "";
  return base.length === 0 ? null : base;
}

/** L'URL interrogée. Fonction pure : c'est ce qui permet de vérifier l'encodage. */
export function urlRecherche(ville: string): string {
  const p = new URLSearchParams({
    q: `${ville}, Québec, Canada`,
    format: "json",
    limit: "1",
    countrycodes: "ca",
  });
  return `https://nominatim.openstreetmap.org/search?${p.toString()}`;
}

/**
 * L'URL pour chercher une ENTREPRISE. Le nom seul serait ambigu (« Labatt » existe
 * partout) : la ville et la province cadrent la recherche, les mêmes bornes régionales
 * rejettent le reste.
 */
export function urlRechercheEntreprise(nom: string, ville: string): string {
  const p = new URLSearchParams({
    q: `${nom}, ${ville}, Québec, Canada`,
    format: "json",
    limit: "1",
    countrycodes: "ca",
  });
  return `https://nominatim.openstreetmap.org/search?${p.toString()}`;
}

/** Un point, sans plus : c'est tout ce qu'il faut pour mesurer ou cadrer. */
export interface Point {
  lat: number;
  lon: number;
}

export interface Coordonnees extends Point {
  /**
   * L'adresse telle qu'OpenStreetMap la donne (`display_name`), ou `null`.
   *
   * ⚠️ Elle ne vaut QUE si la résolution est jugée « exacte » ensuite
   * (`deciderPrecision`) : sur un repli au centre-ville, c'est l'adresse de la MAIRIE
   * qu'on tiendrait pour celle de l'employeur. C'est l'appelant qui décide de la garder ou
   * non — ici on se contente de ne pas jeter ce que la source a dit.
   */
  adresse: string | null;
}

/**
 * Lit une réponse Nominatim, ou rend `null`.
 *
 * `null` signifie « pas de résultat exploitable », jamais « erreur avalée » : l'appelant
 * distingue les deux parce qu'une panne réseau LÈVE avant d'arriver ici.
 *
 * Le contrôle de bornes n'est pas de la paranoïa : « Québec » existe aussi en
 * Colombie-Britannique, et une inversion de signe placerait l'épingle en Asie centrale.
 * Une coordonnée hors région est un résultat FAUX, pas une coordonnée lointaine — la
 * refuser vaut mieux qu'une carte qui a l'air cassée sans qu'on sache pourquoi.
 */
export function lireReponse(charge: unknown): Coordonnees | null {
  if (!Array.isArray(charge) || charge.length === 0) return null;

  const premier = charge[0] as { lat?: unknown; lon?: unknown; display_name?: unknown };
  const lat = Number(premier?.lat);
  const lon = Number(premier?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < BORNES.latMin || lat > BORNES.latMax) return null;
  if (lon < BORNES.lonMin || lon > BORNES.lonMax) return null;

  // L'adresse est BORNÉE : `display_name` peut être très long (Nominatim empile le pays,
  // la région, le code postal…), et rien ne garantit sa forme. Une chaîne vide vaut
  // absence — on ne stocke pas du vide qui aurait l'air d'une adresse.
  const brute = typeof premier?.display_name === "string" ? premier.display_name.trim() : "";
  return { lat, lon, adresse: brute === "" ? null : brute.slice(0, 300) };
}

/**
 * Délai maximal d'UNE requête Nominatim. Sans lui, une requête qui pend suspend toute la
 * passe jusqu'au mur de la Server Action (30 s) — qui tue le processus AVANT
 * l'enregistrement de l'acquis. Un échec à 4 s est une panne propre ; un mur à 30 s est
 * une perte silencieuse.
 */
export const DELAI_MAX_REQUETE_MS = 4_000;

/** Ce que l'appelant doit fournir : de quoi appeler le réseau, et de quoi attendre. */
export interface OutilsGeocodage {
  recuperer: typeof fetch;
  courrielContact?: string | undefined;
  /** Injecté pour que les tests ne dorment pas réellement. */
  attendre?: (ms: number) => Promise<void>;
  /** L'horloge, injectable : sans elle, le garde-temps ne serait pas testable. */
  maintenant?: () => number;
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Géocode UNE ville.
 *
 * LÈVE en cas de panne de plateforme (réseau, 429, 5xx) et rend `null` quand la ville est
 * simplement introuvable. La distinction est le cœur du contrat : une ville introuvable est
 * un fait à enregistrer et à ne plus redemander ; une panne est transitoire et doit être
 * réessayée. Les confondre, c'est soit marteler le service, soit condamner une ville à vie.
 */
export async function geocoderVille(
  ville: string,
  outils: OutilsGeocodage,
): Promise<Coordonnees | null> {
  const reponse = await outils.recuperer(urlRecherche(ville), {
    headers: entete(outils.courrielContact),
  });

  if (!reponse.ok) {
    throw new Error(`Nominatim a répondu ${reponse.status} pour « ${ville} »`);
  }

  return lireReponse(await reponse.json());
}

export interface ResultatPasse {
  trouvees: { nom: string; lat: number; lon: number; adresse: string | null }[];
  introuvables: string[];
  panne: string | null;
}

/**
 * Géocode une série de requêtes en respectant la cadence, et rend ce qui a été trouvé.
 *
 * UNE seule mécanique pour les villes et les entreprises : cadence, plafond par passe,
 * distinction introuvable/panne. Deux copies de cette boucle divergeraient — c'est la
 * classe de bug qui a déjà coûté deux incidents à ce projet.
 *
 * Une panne interrompt la passe et remonte : ce qui est déjà obtenu est rendu quand même,
 * pour que l'appelant l'enregistre plutôt que de tout perdre. Un traitement de fond qui
 * jette son travail à la première erreur ne finit jamais.
 */
async function geocoderSerie(
  requetes: readonly { nom: string; url: string; lire?: (charge: unknown) => Coordonnees | null }[],
  outils: OutilsGeocodage,
  budgetMs: number | null = null,
): Promise<ResultatPasse> {
  const attendre = outils.attendre ?? dormir;
  const maintenant = outils.maintenant ?? (() => Date.now());
  const debut = maintenant();
  const trouvees: ResultatPasse["trouvees"] = [];
  const introuvables: string[] = [];

  const aTraiter = requetes.slice(0, MAX_VILLES_PAR_PASSE);

  for (const [i, r] of aTraiter.entries()) {
    // GARDE-TEMPS — la boucle s'arrête d'elle-même avant le mur de l'appelant.
    //
    // Le plafond en NOMBRE ne borne pas la DURÉE : chaque requête peut aller jusqu'à
    // `DELAI_MAX_REQUETE_MS`, donc huit requêtes valent ~40 s dans le pire cas, et deux
    // séries enchaînées dépassent les 60 s d'une fonction Vercel. Un mur atteint tue le
    // processus AVANT l'enregistrement de l'acquis et sans exécuter le moindre `catch` :
    // pas de trace, et le travail déjà fait est perdu pour rien. Ce qui n'a pas été
    // traité n'est ni « trouvé » ni « introuvable » — il reste simplement à situer, et la
    // passe suivante le reprendra.
    if (budgetMs !== null && maintenant() - debut >= budgetMs) break;

    // Cadence AVANT la requête, sauf pour la première : ne jamais attendre pour rien.
    if (i > 0) await attendre(DELAI_ENTRE_REQUETES_MS);

    try {
      const reponse = await outils.recuperer(r.url, {
        headers: entete(outils.courrielContact),
        signal: AbortSignal.timeout(DELAI_MAX_REQUETE_MS),
      });
      if (!reponse.ok) {
        throw new Error(`Nominatim a répondu ${reponse.status} pour « ${r.nom} »`);
      }
      const c = (r.lire ?? lireReponse)(await reponse.json());
      if (c) trouvees.push({ nom: r.nom, ...c });
      else introuvables.push(r.nom);
    } catch (err) {
      return {
        trouvees,
        introuvables,
        panne: err instanceof Error ? err.message : "Panne inconnue du géocodeur.",
      };
    }
  }

  return { trouvees, introuvables, panne: null };
}

/**
 * Classes Nominatim qui ne peuvent PAS être une entreprise.
 *
 * ⚠️ Trouvé par la revue adversariale (2026-07-29, sonde exécutée) : « Labatt, Québec » peut
 * résoudre une RUE Labatt ou la MUNICIPALITÉ elle-même — dans les bornes régionales, donc
 * accepté, inscrit « precision: exacte » À VIE et affiché comme l'adresse de l'entreprise.
 * Une ville se résout légitimement en `place`/`boundary` ; une entreprise, jamais.
 */
const CLASSES_NON_ENTREPRISE = new Set(["place", "boundary", "highway"]);

/**
 * Lit une réponse Nominatim pour une ENTREPRISE : mêmes bornes que `lireReponse`, plus le
 * rejet des classes non ponctuelles. Un rejet rend `null` (introuvable → repli ville DIT),
 * jamais une fausse position étiquetée exacte.
 */
export function lireReponseEntreprise(charge: unknown): Coordonnees | null {
  const c = lireReponse(charge);
  if (c === null) return null;

  const premier = (charge as unknown[])[0] as { class?: unknown };
  if (typeof premier?.class === "string" && CLASSES_NON_ENTREPRISE.has(premier.class)) {
    return null;
  }
  return c;
}

/**
 * Distance à vol d'oiseau entre deux points, en km (haversine).
 * Sert à VALIDER une résolution d'entreprise contre le centre de sa ville attendue.
 */
export function distanceKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const R = 6_371;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Rayon de VALIDATION d'une résolution d'entreprise : au-delà de cette distance du centre
 * de sa ville attendue, le résultat est un HOMONYME d'ailleurs (la brasserie Labatt de
 * Montréal est à ~247 km de celle de Québec — et DANS les bornes régionales), pas
 * l'entreprise. Large exprès : une usine en périphérie reste dans le rayon de sa ville.
 */
export const RAYON_VALIDATION_KM = 30;

/**
 * Décide ce qu'une résolution d'entreprise VAUT, connaissant le centre de sa ville.
 *
 * PURE — c'est la pièce qu'il ne faut pas se tromper, donc celle qu'on teste : exacte
 * seulement si Nominatim a rendu un lieu ponctuel plausible À DISTANCE PLAUSIBLE de la
 * ville attendue ; sinon le centre-ville, en le disant. Jamais de troisième état.
 */
export function deciderPrecision(
  resolution: (Point & { adresse?: string | null }) | null,
  centreVille: Point,
): { lat: number; lon: number; precision: "exacte" | "ville"; adresse: string | null } {
  if (resolution !== null && distanceKm(resolution, centreVille) <= RAYON_VALIDATION_KM) {
    return {
      lat: resolution.lat,
      lon: resolution.lon,
      precision: "exacte",
      adresse: resolution.adresse ?? null,
    };
  }
  // ⚠️ `adresse: null` sur un REPLI, et c'est le point important : l'adresse rendue par
  // Nominatim serait alors celle du CENTRE-VILLE. La garder reviendrait à publier
  // « 2 rue de l'Hôtel-de-Ville » comme adresse d'une usine — précisément le genre de
  // chiffre plausible et faux qu'interdit le garde-fou n°3.
  return { lat: centreVille.lat, lon: centreVille.lon, precision: "ville", adresse: null };
}

/** Géocode une série de VILLES. */
export async function geocoderPlusieurs(
  villes: readonly string[],
  outils: OutilsGeocodage,
  budgetMs: number | null = null,
): Promise<ResultatPasse> {
  return geocoderSerie(
    villes.map((nom) => ({ nom, url: urlRecherche(nom) })),
    outils,
    budgetMs,
  );
}

/**
 * Géocode une série d'ENTREPRISES (nom + ville).
 *
 * Une entreprise « introuvable » n'est PAS une erreur : beaucoup de PME n'existent pas
 * dans OpenStreetMap. C'est l'appelant qui décide du repli — chez nous, le centre de sa
 * municipalité, en le DISANT (`precision: "ville"`), jamais présenté comme son adresse.
 */
export async function geocoderEntreprises(
  entreprises: readonly { nom: string; ville: string }[],
  outils: OutilsGeocodage,
  budgetMs: number | null = null,
): Promise<ResultatPasse> {
  return geocoderSerie(
    entreprises.map((e) => ({
      nom: e.nom,
      url: urlRechercheEntreprise(e.nom, e.ville),
      lire: lireReponseEntreprise,
    })),
    outils,
    budgetMs,
  );
}
