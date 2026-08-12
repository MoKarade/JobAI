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
/**
 * Combien de candidats demander pour une ENTREPRISE.
 *
 * ⚠️ C'EST LA CAUSE DU MAUVAIS RATIO, MESURÉE À L'ÉCRAN : « 8 à leur adresse, 44 au
 * centre-ville ». Avec `limit=1`, on ne voit que le MEILLEUR résultat selon Nominatim —
 * et pour une requête en texte libre dont le nom d'entreprise n'est pas un lieu connu,
 * c'est très souvent la MUNICIPALITÉ elle-même. Elle est rejetée à raison (classe
 * `place`), et faute d'autre candidat on se replie au centre-ville. L'entreprise réelle
 * était peut-être en deuxième position : on ne l'a jamais regardée.
 *
 * Cinq : au-delà, Nominatim rend des correspondances de plus en plus lâches, et chaque
 * candidat supplémentaire est une occasion d'accepter le mauvais.
 */
export const NB_CANDIDATS_ENTREPRISE = 5;

export function urlRechercheEntreprise(nom: string, ville: string): string {
  const p = new URLSearchParams({
    q: `${nom}, ${ville}, Québec, Canada`,
    format: "json",
    limit: String(NB_CANDIDATS_ENTREPRISE),
    countrycodes: "ca",
  });
  return `https://nominatim.openstreetmap.org/search?${p.toString()}`;
}

/**
 * L'URL pour chercher une ADRESSE CIVIQUE.
 *
 * ⚠️ C'EST UNE QUESTION D'UNE AUTRE NATURE QUE LE NOM D'ENTREPRISE, et bien plus forte.
 * « Laserax, Québec » demande à Nominatim de reconnaître une marque — la plupart des PME
 * n'y sont pas, d'où les dizaines d'épingles au centre-ville. « 2707 Cazeneuve, Lévis »
 * demande une adresse : c'est le cœur de métier d'un géocodeur, et le registre des
 * entreprises nous en donne une, déclarée par l'entreprise elle-même.
 *
 * Le pays et la province cadrent comme ailleurs ; le reste de la chaîne vient du registre.
 */
export function urlRechercheAdresse(adresse: string): string {
  const p = new URLSearchParams({
    q: `${adresse}, Québec, Canada`,
    format: "json",
    limit: String(NB_CANDIDATS_ENTREPRISE),
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
  return lireElement(charge[0]);
}

/** Lit UN résultat Nominatim. Extrait de `lireReponse` pour servir aussi aux candidats. */
function lireElement(element: unknown): Coordonnees | null {
  const e = element as { lat?: unknown; lon?: unknown; display_name?: unknown };
  const lat = Number(e?.lat);
  const lon = Number(e?.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < BORNES.latMin || lat > BORNES.latMax) return null;
  if (lon < BORNES.lonMin || lon > BORNES.lonMax) return null;

  // L'adresse est BORNÉE : `display_name` peut être très long (Nominatim empile le pays,
  // la région, le code postal…), et rien ne garantit sa forme. Une chaîne vide vaut
  // absence — on ne stocke pas du vide qui aurait l'air d'une adresse.
  const brute = typeof e?.display_name === "string" ? e.display_name.trim() : "";
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
 * Mots qui ne DÉSIGNENT rien : présents dans un nom sur deux, ils ne prouvent aucune
 * correspondance. « Groupe » apparie « Groupe Robert » à « Groupe Sani-Tech ».
 */
const MOTS_NON_DISCRIMINANTS = new Set([
  "groupe", "inc", "ltee", "ltd", "enr", "senc", "sencrl", "cie", "compagnie",
  "les", "des", "societe", "entreprise", "entreprises", "industries", "industrie",
  "canada", "quebec", "service", "services", "produits", "solutions", "internationale",
  "international", "corporation", "corp", "limitee", "division", "atelier", "ateliers",
  // Types de VOIE : la même règle sert à vérifier qu'un résultat porte bien la rue
  // demandée, et « boul » apparierait n'importe quel boulevard de la ville. Ils ne
  // désignent rien dans un nom d'entreprise non plus — un mot qui figure partout ne
  // prouve jamais une correspondance, quel que soit le côté où on le lit.
  "rue", "boul", "boulevard", "avenue", "chemin", "route", "montee", "cote", "place",
  "rang", "impasse", "terrasse", "croissant", "autoroute", "parc",
]);

/** Minuscules, sans accents, sans ponctuation — pour comparer des noms, pas des styles. */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Le résultat porte-t-il vraiment le nom cherché ?
 *
 * ⚠️ SANS CE CONTRÔLE, REGARDER PLUS DE CANDIDATS ROUVRIRAIT LE TROU DES HOMONYMES — cette
 * fois DANS la ville, là où la validation par la distance (30 km) ne voit rien. Nominatim
 * répond en texte libre : demander « Laserax, Québec » et prendre le 3ᵉ résultat peut très
 * bien rendre un commerce sans rapport du même quartier. Le nom est le seul discriminant
 * qui reste à cette échelle.
 *
 * Un mot d'au moins quatre lettres et qui DÉSIGNE quelque chose suffit ; un nom qui n'en
 * contient aucun (sigle court, « ACE ») doit apparaître en ENTIER. Exporté pour être
 * testé : c'est la pièce qui décide qu'une position est celle de l'employeur.
 */
export function nomEchoDansResultat(nom: string, resultat: string): boolean {
  const cible = normaliser(resultat);
  if (cible === "") return false;

  const n = normaliser(nom);
  if (n === "") return false;

  const significatifs = n
    .split(" ")
    .filter((m) => m.length >= 4 && !MOTS_NON_DISCRIMINANTS.has(m));

  // Aucun mot porteur : on exige le nom complet. Un sigle de trois lettres apparié par
  // sous-chaîne attraperait n'importe quoi (« ace » dans « place », « surface »…).
  if (significatifs.length === 0) {
    return new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(cible);
  }

  return significatifs.some((m) => cible.includes(m));
}

/**
 * Choisit, parmi les candidats rendus par Nominatim, le premier qui peut être CETTE
 * entreprise : dans les bornes régionales, d'une classe possible pour un commerce, et
 * portant le nom cherché. `null` = aucun — l'appelant se replie au centre-ville en le
 * DISANT, jamais une fausse position étiquetée exacte.
 */
export function choisirCandidatEntreprise(charge: unknown, nom: string): Coordonnees | null {
  if (!Array.isArray(charge)) return null;

  for (const element of charge.slice(0, NB_CANDIDATS_ENTREPRISE)) {
    const c = lireElement(element);
    if (c === null) continue;

    const e = element as { class?: unknown; display_name?: unknown; name?: unknown };
    if (typeof e?.class === "string" && CLASSES_NON_ENTREPRISE.has(e.class)) continue;

    // `name` quand Nominatim le donne (le nom PROPRE du lieu), sinon `display_name` — qui
    // le contient, noyé dans l'adresse complète.
    const libelle = typeof e?.name === "string" && e.name !== "" ? e.name : (c.adresse ?? "");
    if (!nomEchoDansResultat(nom, libelle)) continue;

    return c;
  }
  return null;
}

/**
 * Lit une réponse Nominatim pour une ENTREPRISE : mêmes bornes que `lireReponse`, plus le
 * rejet des classes non ponctuelles ET l'exigence que le nom réponde. Un rejet rend `null`
 * (introuvable → repli ville DIT), jamais une fausse position étiquetée exacte.
 */
export function lireReponseEntreprise(charge: unknown, nom: string): Coordonnees | null {
  return choisirCandidatEntreprise(charge, nom);
}

/**
 * Sépare le NUMÉRO CIVIQUE de la VOIE dans une adresse du registre.
 *
 * Le registre écrit deux formes, vues toutes les deux dans le fichier réel : le numéro et
 * la voie séparés par une virgule (`2707, CAZENEUVE`), ou d'un seul tenant — exemple
 * factice : `123 RUE PRINCIPALE`. La chaîne stockée y ajoute la ville et le code postal
 * (`adresseLisible`), qu'il faut EXCLURE de la voie — sinon la vérification ci-dessous
 * serait satisfaite par le seul nom de la ville, qui figure dans tous les résultats de la
 * ville. Une vérification qu'on peut satisfaire sans rien prouver ne vérifie rien.
 *
 * `null` quand il n'y a pas de numéro : sans numéro, on ne saurait pas distinguer
 * « l'adresse trouvée » de « la rue trouvée », et une rue fait parfois deux kilomètres.
 */
export function decomposerAdresse(adresse: string): { numero: string; voie: string } | null {
  const segments = adresse
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const premier = segments[0] ?? "";

  // Le numéro ouvre l'adresse. La lettre facultative couvre les « 123A ».
  const m = premier.match(/^(\d+\s*[A-Za-z]?)\b\s*(.*)$/);
  if (m === null) return null;

  const numero = (m[1] ?? "").replace(/\s+/g, "");
  // La voie suit le numéro dans le même segment, ou occupe le suivant (`2707, CAZENEUVE`).
  const voie = (m[2] ?? "").trim() !== "" ? (m[2] ?? "").trim() : (segments[1] ?? "");
  if (numero === "" || voie.trim() === "") return null;

  return { numero, voie: voie.trim() };
}

/**
 * Ce résultat porte-t-il bien LE numéro civique demandé ?
 *
 * ⚠️ C'EST LE DISCRIMINANT DU CHEMIN « ADRESSE », l'équivalent de `nomEchoDansResultat`
 * pour le chemin « nom ». Sans lui, une adresse que Nominatim ne connaît pas ferait
 * remonter la RUE, voire la MUNICIPALITÉ — laquelle est à 0 km du centre-ville et
 * passerait donc la validation par la distance sans broncher, pour s'inscrire en base
 * comme une position « exacte ». Ce serait le garde-fou n°3 violé de la pire façon : non
 * pas une donnée manquante, mais une donnée fausse qui a l'air juste.
 *
 * Comparaison sur un MOT ENTIER : « 27 » ne doit pas être satisfait par « 2707 ».
 */
export function numeroEchoDansResultat(numero: string, resultat: string): boolean {
  const n = normaliser(numero);
  if (n === "") return false;
  return new RegExp(`(^| )${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`).test(
    normaliser(resultat),
  );
}

/**
 * Choisit le candidat qui est vraiment CETTE adresse : le numéro civique ET la voie
 * doivent répondre. Les deux, parce que le numéro seul apparierait deux adresses portant
 * le même numéro dans des rues différentes (exemple : la même façade numérotée sur une rue
 * et sur un boulevard) — un numéro civique se retrouve dans toutes les rues d'une ville.
 *
 * `null` = on n'a pas trouvé l'adresse. L'appelant laisse alors l'épingle au centre-ville
 * en le DISANT, ce qui reste honnête : l'adresse affichée, elle, vient du registre et
 * demeure vraie — c'est la POSITION qu'on ne sait pas préciser.
 */
export function choisirCandidatAdresse(charge: unknown, adresse: string): Coordonnees | null {
  const parts = decomposerAdresse(adresse);
  if (parts === null) return null;
  if (!Array.isArray(charge)) return null;

  for (const element of charge.slice(0, NB_CANDIDATS_ENTREPRISE)) {
    const c = lireElement(element);
    if (c === null) continue;

    // `display_name` et non `name` : ici on cherche une adresse, et c'est `display_name`
    // qui porte le numéro et la rue. Le `name` d'un bâtiment ne les contient pas.
    const libelle = c.adresse ?? "";
    if (!numeroEchoDansResultat(parts.numero, libelle)) continue;
    if (!nomEchoDansResultat(parts.voie, libelle)) continue;

    return c;
  }
  return null;
}

/**
 * L'URL Google Maps Geocoding pour une ENTREPRISE.
 *
 * [CARTE-03], 2026-08-12 : repli quand Nominatim ne reconnaît pas la raison sociale — son
 * cœur de métier, contrairement à Nominatim (communautaire, sparse sur les PME).
 * `components=country:CA` restreint DUR au Canada (pas un simple biais comme le `region=`
 * de l'API) — même esprit que `countrycodes=ca` côté Nominatim. Ça ne dispense PAS de
 * revalider par la distance ensuite : le pays seul n'exclut pas un homonyme à Montréal.
 */
export function urlRechercheGoogle(nom: string, ville: string, cle: string): string {
  const p = new URLSearchParams({
    address: `${nom}, ${ville}, Québec, Canada`,
    components: "country:CA",
    key: cle,
  });
  return `https://maps.googleapis.com/maps/api/geocode/json?${p.toString()}`;
}

/**
 * Une résolution Google Maps Geocoding, avec le `place_id` que Google rend gratuitement
 * dans la même réponse. [CARTE-03-PLACES], 2026-08-12 : c'est cet identifiant qui permet
 * ensuite d'enrichir la fiche (site, téléphone, horaires) sans repayer une recherche.
 */
export interface CoordonneesGoogle extends Coordonnees {
  placeId: string | null;
}

/**
 * Lit une réponse Google Maps Geocoding, ou rend `null` (introuvable, pas une panne).
 *
 * `status` distingue ce que Nominatim exprime par la présence/absence d'un résultat :
 * `ZERO_RESULTS` = Google ne connaît pas cette PME sous ce nom, un fait à enregistrer,
 * pas une erreur. `OK` = au moins un résultat, à revalider comme les autres (bornes
 * régionales). Tout le reste (`OVER_QUERY_LIMIT`, `REQUEST_DENIED`, `INVALID_REQUEST`,
 * `UNKNOWN_ERROR`) est une PANNE de plateforme — LÈVE, pour être réessayée plus tard,
 * jamais confondue avec « cette entreprise n'existe pas ».
 */
export function lireReponseGoogle(charge: unknown): CoordonneesGoogle | null {
  const c = charge as { status?: unknown; results?: unknown[]; error_message?: unknown };
  if (c?.status === "ZERO_RESULTS") return null;
  if (c?.status !== "OK") {
    const detail = typeof c?.error_message === "string" ? ` (${c.error_message})` : "";
    throw new Error(`Google Maps Geocoding a répondu ${String(c?.status)}${detail}`);
  }

  const resultat = Array.isArray(c.results) ? c.results[0] : undefined;
  const r = resultat as
    | {
        geometry?: { location?: { lat?: unknown; lng?: unknown } };
        formatted_address?: unknown;
        place_id?: unknown;
      }
    | undefined;
  const lat = Number(r?.geometry?.location?.lat);
  const lon = Number(r?.geometry?.location?.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < BORNES.latMin || lat > BORNES.latMax) return null;
  if (lon < BORNES.lonMin || lon > BORNES.lonMax) return null;

  const brute = typeof r?.formatted_address === "string" ? r.formatted_address.trim() : "";
  const placeId = typeof r?.place_id === "string" && r.place_id !== "" ? r.place_id : null;
  return { lat, lon, adresse: brute === "" ? null : brute.slice(0, 300), placeId };
}

/**
 * Géocode UNE entreprise via Google Maps Geocoding.
 *
 * ⚠️ MÊME GARDE QUE NOMINATIM, ET C'EST DÉLIBÉRÉ : `nomEchoDansResultat` sur l'adresse
 * rendue. Google est meilleur pour RECONNAÎTRE une raison sociale, mais ça ne veut pas dire
 * qu'il ne se trompe jamais — un géocodeur qui approxime silencieusement vers l'adresse la
 * plus proche plutôt que de rendre `ZERO_RESULTS` est le même risque d'homonyme que
 * Nominatim, avec une garde-fou n°3 qui ne fait pas d'exception pour un fournisseur payant.
 * Pas de délai imposé entre requêtes : ce n'est pas un service communautaire à ménager, et
 * l'appelant reste libre de les enchaîner (sous le même budget de temps que le reste).
 */
export async function geocoderEntrepriseGoogle(
  nom: string,
  ville: string,
  cle: string,
  outils: Pick<OutilsGeocodage, "recuperer">,
): Promise<CoordonneesGoogle | null> {
  const reponse = await outils.recuperer(urlRechercheGoogle(nom, ville, cle), {
    signal: AbortSignal.timeout(DELAI_MAX_REQUETE_MS),
  });
  if (!reponse.ok) {
    throw new Error(`Google Maps Geocoding a répondu HTTP ${reponse.status} pour « ${nom} »`);
  }

  const c = lireReponseGoogle(await reponse.json());
  if (c === null) return null;

  const libelle = c.adresse ?? "";
  if (!nomEchoDansResultat(nom, libelle)) return null;

  return c;
}

/**
 * Une suggestion d'entreprise rendue par Google Places Autocomplete (New).
 *
 * [CARTE-03-PLACES], 2026-08-12 : demande de Marc, « utilise les autres API aussi » —
 * clarifiée en « autocomplétion à l'ajout d'une entreprise ». Le texte suffit : c'est ce
 * que Marc choisit dans une liste, pas une donnée qu'on stocke.
 */
export interface SuggestionEntreprise {
  texte: string;
}

/**
 * Lit une réponse Google Places Autocomplete (New).
 *
 * La forme diffère radicalement de Geocoding : `suggestions[].placePrediction.text.text`,
 * pas `results[]`. Une entrée sans texte exploitable, ou en double, est ignorée plutôt que
 * de faire échouer toute la liste — une suggestion perdue n'est pas une panne.
 */
export function lireReponseAutocomplete(charge: unknown): SuggestionEntreprise[] {
  const c = charge as { suggestions?: unknown[] };
  if (!Array.isArray(c?.suggestions)) return [];

  const vues = new Set<string>();
  const suggestions: SuggestionEntreprise[] = [];
  for (const s of c.suggestions) {
    const p = (s as { placePrediction?: { text?: { text?: unknown } } } | undefined)
      ?.placePrediction;
    const texte = typeof p?.text?.text === "string" ? p.text.text.trim() : "";
    if (texte === "" || vues.has(texte)) continue;
    vues.add(texte);
    suggestions.push({ texte });
  }
  return suggestions;
}

/**
 * Cherche des entreprises par préfixe via Google Places Autocomplete (New).
 *
 * `includedRegionCodes`/`locationBias` cadrent sur le Canada puis la grande région de
 * Québec — même esprit que les bornes régionales du reste du fichier, pour ne pas proposer
 * une entreprise de Vancouver pendant que Marc tape. `includedPrimaryTypes:
 * ["establishment"]` exclut les adresses et les villes : on cherche un COMMERCE.
 */
export async function chercherEntreprisesGoogle(
  saisie: string,
  cle: string,
  outils: Pick<OutilsGeocodage, "recuperer">,
): Promise<SuggestionEntreprise[]> {
  const reponse = await outils.recuperer("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": cle,
      "X-Goog-FieldMask": "suggestions.placePrediction.text",
    },
    body: JSON.stringify({
      input: saisie,
      includedRegionCodes: ["ca"],
      includedPrimaryTypes: ["establishment"],
      locationBias: { circle: { center: { latitude: 46.8, longitude: -71.2 }, radius: 60_000 } },
    }),
    signal: AbortSignal.timeout(DELAI_MAX_REQUETE_MS),
  });
  if (!reponse.ok) {
    throw new Error(`Google Places Autocomplete a répondu HTTP ${reponse.status}`);
  }
  return lireReponseAutocomplete(await reponse.json());
}

/**
 * Ce que Google Place Details publie pour enrichir une fiche entreprise.
 *
 * [CARTE-03-PLACES], 2026-08-12 : demande de Marc, « enrichir les fiches entreprise ».
 * Trois champs, tous optionnels côté Google — `null` = Google ne le publie pas, pas une
 * absence de mesure (voir migration 0016 pour la distinction à trois états en base).
 */
export interface DetailsEntreprise {
  siteWeb: string | null;
  telephone: string | null;
  horaires: string[] | null;
}

/** Lit une réponse Google Place Details (New). */
export function lireReponseDetails(charge: unknown): DetailsEntreprise {
  const c = charge as {
    websiteUri?: unknown;
    internationalPhoneNumber?: unknown;
    regularOpeningHours?: { weekdayDescriptions?: unknown };
  };
  const horaires = Array.isArray(c?.regularOpeningHours?.weekdayDescriptions)
    ? c.regularOpeningHours.weekdayDescriptions.filter(
        (l): l is string => typeof l === "string" && l.trim() !== "",
      )
    : null;
  return {
    siteWeb: typeof c?.websiteUri === "string" && c.websiteUri !== "" ? c.websiteUri : null,
    telephone:
      typeof c?.internationalPhoneNumber === "string" && c.internationalPhoneNumber !== ""
        ? c.internationalPhoneNumber
        : null,
    horaires: horaires && horaires.length > 0 ? horaires : null,
  };
}

/**
 * Récupère les détails d'un lieu (site, téléphone, horaires) via son `place_id`.
 *
 * Scopé aux entreprises déjà résolues par Google Maps Geocoding (`geocoderEntrepriseGoogle`) :
 * c'est cette résolution qui fournit gratuitement le `place_id`, sans recherche Places
 * séparée. Une entreprise résolue par Nominatim n'a pas de `place_id` — pas enrichie ici.
 */
export async function detailsEntrepriseGoogle(
  placeId: string,
  cle: string,
  outils: Pick<OutilsGeocodage, "recuperer">,
): Promise<DetailsEntreprise> {
  const reponse = await outils.recuperer(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": cle,
        "X-Goog-FieldMask": "websiteUri,internationalPhoneNumber,regularOpeningHours",
      },
      signal: AbortSignal.timeout(DELAI_MAX_REQUETE_MS),
    },
  );
  if (!reponse.ok) {
    throw new Error(
      `Google Place Details a répondu HTTP ${reponse.status} pour « ${placeId} »`,
    );
  }
  return lireReponseDetails(await reponse.json());
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
 *
 * ⚠️ ELLE REND AUSSI LA SOURCE DE L'ADRESSE, et c'est délibéré : c'est la SEULE fonction
 * qui décide qu'une adresse est gardée. La faire porter la source rend impossible qu'un
 * chemin d'écriture l'oublie — or ce dépôt a déjà perdu une colonne quatre fois parce que
 * chaque chemin d'insertion la renseignait dans son coin. Ici, `osm` est la vérité par
 * construction : cette fonction ne voit que des résolutions Nominatim/OpenStreetMap.
 */
export function deciderPrecision(
  resolution: (Point & { adresse?: string | null }) | null,
  centreVille: Point,
): {
  lat: number;
  lon: number;
  precision: "exacte" | "ville";
  adresse: string | null;
  adresseSource: "osm" | null;
} {
  if (resolution !== null && distanceKm(resolution, centreVille) <= RAYON_VALIDATION_KM) {
    return {
      lat: resolution.lat,
      lon: resolution.lon,
      precision: "exacte",
      adresse: resolution.adresse ?? null,
      // La source suit l'adresse — présente avec elle, absente sans elle. La base refuse
      // toute autre combinaison, et c'est ce qui donne son sens à la colonne.
      adresseSource: resolution.adresse ? "osm" : null,
    };
  }
  // ⚠️ `adresse: null` sur un REPLI, et c'est le point important : l'adresse rendue par
  // Nominatim serait alors celle du CENTRE-VILLE. La garder reviendrait à publier
  // « 2 rue de l'Hôtel-de-Ville » comme adresse d'une usine — précisément le genre de
  // chiffre plausible et faux qu'interdit le garde-fou n°3.
  return {
    lat: centreVille.lat,
    lon: centreVille.lon,
    precision: "ville",
    adresse: null,
    // Pas d'adresse, donc pas de source. Le typage a refusé de laisser passer ce chemin
    // sans le dire — c'est exactement ce qu'on lui demande sur une donnée qui doit rester
    // cohérente à deux champs.
    adresseSource: null,
  };
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
      // Le nom est CAPTURÉ ici : le lecteur en a besoin pour vérifier que le candidat
      // porte bien ce nom-là, et `geocoderSerie` n'a pas à connaître ce détail.
      lire: (charge: unknown) => lireReponseEntreprise(charge, e.nom),
    })),
    outils,
    budgetMs,
  );
}

/**
 * Géocode une série de lieux en posant à CHACUN la meilleure question dont on dispose :
 * son ADRESSE quand on en a une, son NOM sinon.
 *
 * ⚠️ C'EST LE LEVIER SUR LE RATIO « à leur adresse / au centre-ville ». Interroger un nom
 * de PME échoue le plus souvent — OpenStreetMap ne cartographie pas les raisons sociales,
 * et c'est de là que viennent les dizaines d'épingles au centre-ville. Interroger une
 * adresse civique réussit presque toujours, et le registre des entreprises nous en fournit
 * une pour chaque établissement retrouvé. La position devient alors celle de l'adresse
 * DÉCLARÉE par l'entreprise : ce n'est pas un objet cartographié à sa position, mais c'est
 * très au-dessus du centre-ville — et la source reste dite à l'écran.
 *
 * ⚠️ UNE SEULE SÉRIE, ET C'EST LA RAISON D'ÊTRE DE CETTE FONCTION. Appeler deux séries à
 * la suite — les adresses puis les noms — repartirait à zéro sur le garde-temps ET sur le
 * plafond par passe : deux budgets au lieu d'un, donc le mur de la fonction Vercel, donc
 * la page tuée avant d'enregistrer quoi que ce soit. C'est exactement ce qui est arrivé le
 * 2026-08-05. La cadence, le plafond et le budget se partagent parce qu'ils protègent le
 * MÊME service et la MÊME invocation.
 *
 * La clé du résultat reste le NOM : c'est lui qui désigne la ligne à mettre à jour.
 */
export async function geocoderLieux(
  lieux: readonly { nom: string; ville: string; adresse: string | null }[],
  outils: OutilsGeocodage,
  budgetMs: number | null = null,
): Promise<ResultatPasse> {
  return geocoderSerie(
    lieux.map((l) => {
      const adresse = l.adresse;
      if (adresse !== null) {
        return {
          nom: l.nom,
          url: urlRechercheAdresse(adresse),
          lire: (charge: unknown) => choisirCandidatAdresse(charge, adresse),
        };
      }
      return {
        nom: l.nom,
        url: urlRechercheEntreprise(l.nom, l.ville),
        lire: (charge: unknown) => lireReponseEntreprise(charge, l.nom),
      };
    }),
    outils,
    budgetMs,
  );
}
