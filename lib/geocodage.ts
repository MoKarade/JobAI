// lib/geocodage.ts — situer une municipalité, une seule fois.
//
// C'est le SEUL fichier de l'app autorisé à appeler Nominatim, comme `lib/ingest/` sera le
// seul à appeler une source d'offres (garde-fou n°4). Tout le reste de l'app lit la table
// `villes`, jamais le réseau.
//
// CE QU'ON GÉOCODE, ET CE QU'ON NE GÉOCODE PAS
// On géocode des VILLES — « Lévis », « Saint-Nicolas ». Jamais une adresse, jamais un
// employeur nommé, et évidemment jamais le domicile de Marc : il ne sort pas des variables
// `DOMICILE_LAT` / `DOMICILE_LON`, qui restent côté serveur et ne servent qu'au calcul de
// distance. Une épingle sur la carte situe une municipalité, pas une personne.
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

export interface Coordonnees {
  lat: number;
  lon: number;
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

  const premier = charge[0] as { lat?: unknown; lon?: unknown };
  const lat = Number(premier?.lat);
  const lon = Number(premier?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < BORNES.latMin || lat > BORNES.latMax) return null;
  if (lon < BORNES.lonMin || lon > BORNES.lonMax) return null;

  return { lat, lon };
}

/** Ce que l'appelant doit fournir : de quoi appeler le réseau, et de quoi attendre. */
export interface OutilsGeocodage {
  recuperer: typeof fetch;
  courrielContact?: string | undefined;
  /** Injecté pour que les tests ne dorment pas réellement. */
  attendre?: (ms: number) => Promise<void>;
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

/**
 * Géocode une série de villes en respectant la cadence, et rend ce qui a été trouvé.
 *
 * Une panne interrompt la passe et remonte : les villes déjà obtenues sont rendues quand
 * même, pour que l'appelant puisse les enregistrer plutôt que de tout perdre. Un traitement
 * de fond qui jette son travail à la première erreur ne finit jamais.
 */
export async function geocoderPlusieurs(
  villes: readonly string[],
  outils: OutilsGeocodage,
): Promise<{
  trouvees: { nom: string; lat: number; lon: number }[];
  introuvables: string[];
  panne: string | null;
}> {
  const attendre = outils.attendre ?? dormir;
  const trouvees: { nom: string; lat: number; lon: number }[] = [];
  const introuvables: string[] = [];

  const aTraiter = villes.slice(0, MAX_VILLES_PAR_PASSE);

  for (const [i, nom] of aTraiter.entries()) {
    // Cadence AVANT la requête, sauf pour la première : ne jamais attendre pour rien.
    if (i > 0) await attendre(DELAI_ENTRE_REQUETES_MS);

    try {
      const c = await geocoderVille(nom, outils);
      if (c) trouvees.push({ nom, ...c });
      else introuvables.push(nom);
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
