// lib/ingest/sondeSources.ts — mesurer ce que l'APP peut réellement joindre.
//
// POURQUOI CE FICHIER EXISTE
// La liste des sources accessibles ne peut pas s'écrire depuis une session Claude : sa
// passerelle refuse tout hors allowlist, et elle l'a fait onze fois sur onze le 2026-08-19
// (`CONNECT tunnel failed, response 403`). Une mesure faite là-bas ne mesure que le proxy —
// leçon déjà payée par un « 0/180 » qui ne disait rien du monde. La seule mesure qui compte
// se fait DEPUIS VERCEL, là où le code tournera.
//
// ⚠️ CE MODULE MESURE, IL N'INGÈRE RIEN. Une requête par candidat, pour caractériser une
// réponse. Aucune offre n'entre en base par ce chemin, aucune n'est collectée en volume.
// C'est la différence entre « puis-je joindre ce service ? » et « je moissonne ce service ».
//
// ⚠️ IL NE RÉUTILISE PAS `recuperer`, ET C'EST LE POINT. `recuperer` LÈVE sur un non-2xx :
// il transforme 403, 404 et 429 en une seule et même exception, ce qui est exactement
// l'information qu'une sonde cherche. Un `fetch` nu qui rend le CODE est la seule façon de
// distinguer « refusé », « inexistant » et « quota » — la leçon des 180 essais ATS.

import { analyseurAts } from "./sources";
import { FAMILLES_ATS, type FamilleAts } from "./types";

/** Combien de caractères de contenu on remonte. Assez pour VOIR, trop peu pour collecter. */
export const TAILLE_ECHANTILLON = 400;

/** Délai par candidat. Une source muette ne doit pas manger le budget des suivantes. */
export const DELAI_SONDE_MS = 10_000;

/** Pause entre deux requêtes. Contre-pression : on ne martèle pas un service tiers. */
export const PAUSE_SONDE_MS = 1_100;

/**
 * Ce qu'on sait de la VOIE LÉGALE d'une source, avant de la sonder.
 *
 * ⚠️ CE CHAMP N'EST PAS DÉCORATIF : il porte la seule question qui décide si un 200 est
 * exploitable. Une API publique et documentée qui répond 200 se consomme ; un agrégateur
 * qui répond 200 parce qu'on s'est fait passer pour un navigateur ne se consomme pas — ses
 * conditions l'interdisent, et le garde-fou n°4 avec elles. La sonde mesure les deux ; ce
 * champ dit ce qu'on a le droit de faire du résultat.
 */
export type VoieLegale =
  /** API publique et documentée, faite pour être consommée. */
  | "api-publique"
  /** Source publique officielle — l'exception nommée du garde-fou n°4. */
  | "officielle"
  /** Données ouvertes (licence ouverte). */
  | "donnees-ouvertes"
  /** Programme partenaire/éditeur : une voie existe, elle demande une inscription. */
  | "partenaire-sur-demande"
  /** Aucune voie publique connue : ingérer exigerait de réviser le garde-fou n°4. */
  | "aucune-voie-publique";

export interface Candidat {
  id: string;
  nom: string;
  url: string;
  voie: VoieLegale;
  /** La famille d'ATS, quand le corps peut être compté par un analyseur existant. */
  famille?: FamilleAts;
  /** Ce qu'on attend d'une réponse EXPLOITABLE, en une phrase lisible. */
  attendu: string;
  /** Note honnête : ce que la mesure ne dira PAS. */
  reserve?: string;
}

export interface Mesure {
  id: string;
  nom: string;
  voie: VoieLegale;
  /** `null` quand la requête n'est jamais partie (DNS, refus de tunnel, délai). */
  code: number | null;
  contentType: string | null;
  taille: number;
  /** Un extrait du corps. C'est lui qui distingue un flux VALIDE d'un flux UTILE. */
  echantillon: string;
  /**
   * Offres réellement extraites par l'analyseur de la famille, quand il y en a un.
   *
   * `null` = pas d'analyseur applicable, `0` = la réponse est valide mais ne porte AUCUNE
   * offre. Les deux se ressemblent dans un rapport et disent le contraire.
   */
  offres: number | null;
  ms: number;
  erreur?: string;
  /**
   * Les directives qui NOUS visent, quand le candidat est un `robots.txt`.
   *
   * Pas l'échantillon : le bloc qui compte est `User-agent: *`, et sur ZipRecruiter il
   * arrive après le bloc `googlebot`. Lire le début du fichier avait fait croire à un
   * `Allow: /` qui ne nous était pas adressé.
   */
  robots?: string[];
}

/** Le verdict lisible d'une mesure. PURE. */
export type Verdict =
  | "exploitable"
  | "joignable-mais-vide"
  | "refuse"
  | "introuvable"
  | "quota"
  | "injoignable";

/**
 * Traduit une mesure en verdict. PURE, et volontairement sévère.
 *
 * ⚠️ UN 200 N'EST PAS UN VERDICT. C'est la leçon du témoin négatif : SmartRecruiters répond
 * 200 à un identifiant qu'aucune entreprise ne porte, et le RSS d'Espresso-Jobs répondait
 * 200 avec vingt entrées de blogue. « Exploitable » exige donc des OFFRES comptées, pas un
 * code de succès — et quand aucun analyseur ne s'applique, on rend « joignable-mais-vide »
 * plutôt que de promettre ce qu'on n'a pas vérifié.
 */
export function verdictDe(m: Mesure): Verdict {
  if (m.code === null) return "injoignable";
  if (m.code === 429) return "quota";
  if (m.code === 404) return "introuvable";
  if (m.code === 401 || m.code === 403) return "refuse";
  if (m.code < 200 || m.code >= 300) return "refuse";
  return m.offres !== null && m.offres > 0 ? "exploitable" : "joignable-mais-vide";
}

/** Un extrait lisible : espaces resserrés, coupé net, jamais du binaire brut. */
export function echantillonner(corps: string, taille = TAILLE_ECHANTILLON): string {
  return corps.replace(/\s+/g, " ").trim().slice(0, taille);
}

/**
 * Combien d'offres ce corps porte-t-il vraiment ?
 *
 * On réutilise l'analyseur de production, jamais un compteur écrit à côté : deux façons de
 * lire la même réponse divergent, et c'est la plus optimiste qui ferait croire à une source
 * vivante. `null` quand aucune famille ne s'applique.
 */
export function compterOffres(corps: string, famille: FamilleAts | undefined): number | null {
  if (famille === undefined) return null;
  if (!FAMILLES_ATS.includes(famille)) return null;
  try {
    return analyseurAts(famille)(corps, "sonde").length;
  } catch {
    return null;
  }
}

/**
 * Les directives d'un `robots.txt` qui s'appliquent à UN agent donné.
 *
 * ⚠️ CETTE FONCTION EST NÉE D'UN DÉFAUT DE LA SONDE ELLE-MÊME. Le premier passage rendait
 * les 400 premiers caractères du fichier : sur ZipRecruiter (3 ko) on n'a vu que le bloc
 * `googlebot`, et sur LinkedIn (120 ko) que l'en-tête. Or le bloc qui nous concerne est
 * `User-agent: *`, et il est plus bas. Lire le début d'un fichier de règles et croire
 * l'avoir lu, c'est exactement l'erreur que la sonde était censée empêcher.
 *
 * PURE. Un groupe commence à une suite de lignes `User-agent:` et court jusqu'au groupe
 * suivant ; les commentaires (`#`) sont retirés — un `# Disallow: /` en commentaire
 * n'interdit rien, et le confondre avec une règle ferait renoncer à un accès permis.
 */
export function extraireBlocRobots(texte: string, agent = "*"): string[] {
  const lignes = texte
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter((l) => l !== "");

  const groupes: { agents: string[]; regles: string[] }[] = [];
  let courant: { agents: string[]; regles: string[] } | null = null;
  let dansEnTete = false;

  for (const ligne of lignes) {
    const m = /^user-agent\s*:\s*(.+)$/i.exec(ligne);
    if (m) {
      // Plusieurs `User-agent:` de suite partagent le MÊME groupe de règles.
      if (!dansEnTete || courant === null) {
        courant = { agents: [], regles: [] };
        groupes.push(courant);
        dansEnTete = true;
      }
      courant.agents.push(m[1]!.trim().toLowerCase());
      continue;
    }
    dansEnTete = false;
    if (courant !== null) courant.regles.push(ligne);
  }

  const vise = agent.toLowerCase();
  const exact = groupes.find((g) => g.agents.includes(vise));
  if (exact) return exact.regles;
  // À défaut d'un bloc nommé, c'est le bloc générique qui s'applique.
  return groupes.find((g) => g.agents.includes("*"))?.regles ?? [];
}

/** Un identifiant qu'aucune entreprise ne porte. Le TÉMOIN NÉGATIF. */
const BIDON = "nexistepasdutout999";

/**
 * Les candidats soumis à la mesure.
 *
 * ⚠️ LES CINQ ATS SONT SONDÉS AVEC LE TÉMOIN NÉGATIF, PAS AVEC DE VRAIS JETONS — et ce
 * n'est pas une timidité, c'est la question posée. On demande « l'app joint-elle cette
 * API ? », à quoi un 404 répond parfaitement (le service a reçu, compris et répondu).
 * Sonder 36 employeurs × 5 familles serait la DÉCOUVERTE que `[VEILLE-35]` a retirée :
 * 180 requêtes pour inscrire ce qui répond, avec les homonymes d'Amsterdam au bout.
 * Les vrais jetons se CONSTATENT ensuite, un par un, sur la page carrières de l'employeur.
 *
 * ⚠️ POUR LES QUATRE AGRÉGATEURS, ON LIT `robots.txt` — ET C'EST LA BONNE PREMIÈRE
 * QUESTION. Leur joignabilité n'apprend rien : ils répondent tous. Ce qu'on ignore, c'est
 * ce qu'ils AUTORISENT, et `robots.txt` le dit de leur propre main. Le lire est légitime
 * partout ; c'est même le seul geste qu'un site demande explicitement qu'on fasse avant
 * tout le reste. Un `Disallow: /jobs` y répond mieux que n'importe quelle supposition.
 */
export const CANDIDATS: readonly Candidat[] = [
  // ── API d'ATS : publiques, documentées, faites pour être consommées ────────────────
  {
    id: "ats:greenhouse",
    famille: "greenhouse",
    nom: "Greenhouse — API publique de tableau d'offres",
    url: `https://boards-api.greenhouse.io/v1/boards/${BIDON}/jobs?content=true`,
    voie: "api-publique",
    attendu: "404 sur le témoin négatif = l'API a reçu et répondu, donc elle est joignable",
  },
  {
    id: "ats:lever",
    famille: "lever",
    nom: "Lever — API publique d'offres",
    url: `https://api.lever.co/v0/postings/${BIDON}?mode=json`,
    voie: "api-publique",
    attendu: "404 sur le témoin négatif",
  },
  {
    id: "ats:recruitee",
    famille: "recruitee",
    nom: "Recruitee — API publique d'offres",
    url: `https://${BIDON}.recruitee.com/api/offers/`,
    voie: "api-publique",
    attendu: "404 ou erreur DNS sur le témoin négatif (le jeton est un sous-domaine)",
    reserve: "Le jeton étant dans le NOM D'HÔTE, un échec ici peut être un échec DNS et non un refus.",
  },
  {
    id: "ats:workable",
    famille: "workable",
    nom: "Workable — API publique de widget",
    url: `https://apply.workable.com/api/v1/widget/accounts/${BIDON}?details=true`,
    voie: "api-publique",
    attendu: "404 sur le témoin négatif",
  },
  {
    id: "ats:smartrecruiters",
    famille: "smartrecruiters",
    nom: "SmartRecruiters — API publique d'offres",
    url: `https://api.smartrecruiters.com/v1/companies/${BIDON}/postings?limit=100`,
    voie: "api-publique",
    attendu: "joignable — MAIS son 200 ne prouve rien",
    reserve:
      "MESURÉ EN JUILLET : cette API répond 200 à un identifiant qui n'existe pas. Son code " +
      "de succès est donc inutilisable comme signal de présence ; seul le COMPTE d'offres l'est.",
  },

  // ── Sources publiques officielles : l'exception NOMMÉE du garde-fou n°4 ────────────
  {
    id: "officielle:guichet-accueil",
    nom: "Guichet-Emplois — accueil",
    url: "https://www.guichetemplois.gc.ca/accueil",
    voie: "officielle",
    attendu: "200 = l'hôte est joignable depuis Vercel, ce que ma session ne peut pas dire",
    reserve:
      "Refusé au tunnel CONNECT depuis la session Claude (403), le 2026-08-17 comme le " +
      "2026-08-19. Ce refus ne vaut QUE pour cette session : c'est précisément ce que la sonde tranche.",
  },
  {
    id: "officielle:guichet-robots",
    nom: "Guichet-Emplois — robots.txt",
    url: "https://www.guichetemplois.gc.ca/robots.txt",
    voie: "officielle",
    attendu: "le texte des règles, pour savoir ce qui est permis avant d'aller plus loin",
  },
  {
    id: "ouverte:open-canada",
    nom: "Données ouvertes Canada — recherche CKAN (jeux EDSC / Guichet)",
    url: "https://open.canada.ca/data/api/3/action/package_search?q=job+bank&rows=3",
    voie: "donnees-ouvertes",
    attendu: "un JSON CKAN avec des jeux de données nommés",
    reserve:
      "NE PAS ajouter de paramètre `fl=` : il ampute la projection et fait disparaître " +
      "`organization` et `resources` — la source paraît alors vide alors que c'est la requête qui l'est.",
  },
  {
    id: "ouverte:donnees-quebec",
    nom: "Données Québec — recherche CKAN",
    url: "https://www.donneesquebec.ca/recherche/api/3/action/package_search?q=emploi&rows=3",
    voie: "donnees-ouvertes",
    attendu: "un JSON CKAN",
  },
  {
    id: "officielle:carrieres-qc",
    nom: "Carrières — gouvernement du Québec",
    url: "https://www.carrieres.gouv.qc.ca/robots.txt",
    voie: "officielle",
    attendu: "les règles du portail public d'emplois du gouvernement du Québec",
  },
  {
    id: "officielle:ville-quebec",
    nom: "Ville de Québec — emplois",
    url: "https://www.ville.quebec.qc.ca/robots.txt",
    voie: "officielle",
    attendu: "les règles du portail municipal",
  },

  // ── Guichet-Emplois : les surfaces CONSTATÉES le 2026-08-19, à vérifier ─────────────
  // ⚠️ CES TROIS URL VIENNENT DE RÉSULTATS DE RECHERCHE, PAS D'UNE VISITE. Ce projet
  // s'est déjà trompé exactement là : les formes d'URL du Guichet écrites en août venaient
  // de TITRES de résultats, et Marc a constaté que le premier lien tombait sur l'accueil.
  // « Un lien lu dans une liste de résultats n'est pas un lien vérifié » — c'est la sonde,
  // depuis Vercel, qui tranche. Elles sont ici POUR ÊTRE ÉPROUVÉES, pas parce qu'on y croit.
  {
    id: "officielle:guichet-xmlfeed",
    nom: "Guichet-Emplois — flux XML",
    url: "https://www.jobbank.gc.ca/xmlfeed/jobbank.xml",
    voie: "officielle",
    attendu: "du XML portant des offres — c'est LA surface d'ingestion recherchée",
    reserve:
      "URL lue dans un résultat de recherche, jamais visitée. Un 200 en `text/html` serait " +
      "une page d'erreur déguisée, pas un flux : c'est l'ÉCHANTILLON qui tranche, pas le code.",
  },
  {
    id: "officielle:guichet-recherche",
    nom: "Guichet-Emplois — page de recherche",
    url: "https://www.jobbank.gc.ca/jobsearch/",
    voie: "officielle",
    attendu: "la page de recherche ; leur robots.txt l'autorise avec Crawl-delay: 5",
  },
  {
    id: "officielle:guichet-employeur",
    nom: "Guichet-Emplois — offres par employeur",
    url: "https://www.jobbank.gc.ca/browsejobs/employer/Robotiq/QC",
    voie: "officielle",
    attendu: "les offres d'un employeur nommé — la voie la plus ciblée pour les 36 cibles",
    reserve: "Forme d'URL lue dans un résultat de recherche. À confirmer par l'échantillon.",
  },

  // ── Vérification d'un jeton ATS CONSTATÉ (et non deviné) ───────────────────────────
  {
    id: "jeton:robotiq-smartrecruiters",
    nom: "Robotiq — jeton SmartRecruiters constaté",
    url: "https://api.smartrecruiters.com/v1/companies/ROBOTIQInc/postings?limit=100",
    voie: "api-publique",
    famille: "smartrecruiters",
    attendu: "des offres RÉELLES — c'est la deuxième vérification, indépendante de la première",
    reserve:
      "Le jeton `ROBOTIQInc` a été CONSTATÉ dans l'URL `careers.smartrecruiters.com/ROBOTIQInc`, " +
      "pas déduit du nom. Reste la seconde vérification exigée : le contenu est-il dans la région ? " +
      "`recruitee/robert` répondait très bien — avec des postes à Amsterdam.",
  },

  // ── Oracle Cloud HCM : MESURÉ, pas branché — la voie publique n'existe pas ─────────
  // ⚠️ J'AI ANNONCÉ À MARC UNE « API REST PUBLIQUE ». C'ÉTAIT FAUX, et la doc d'Oracle le
  // dit deux fois : `recruitingCEJobRequisitions` est « only for Oracle internal use », et
  // `recruitingJobSitePostedJobs` — la ressource des offres publiées — « can only be used
  // by approved Oracle Cloud Marketplace partners ». Il n'y a donc pas d'API officielle
  // d'offres chez Oracle, et une 6ᵉ famille bâtie dessus ne tomberait PAS sous l'exception
  // « API officielles » du garde-fou n°4.
  //
  // On le SONDE quand même, parce que mesurer n'est pas ingérer et que la question « ce
  // point d'entrée répond-il seulement ? » a une réponse utile : si Davie sert ses offres
  // par là, le savoir vaut mieux que le supposer. Ce que la mesure ne rendra PAS, c'est le
  // droit de s'en servir.
  {
    // La MÊME cible que le candidat Oracle ci-dessous, par une voie que le garde-fou n°4
    // nomme explicitement. Si le Guichet porte les offres de Davie, la zone grise devient
    // inutile : on prend la source propre. C'est la question que cette paire tranche.
    id: "officielle:guichet-davie",
    nom: "Guichet-Emplois — offres de Chantier Davie",
    url: "https://www.jobbank.gc.ca/browsejobs/employer/Chantier%20Davie/QC",
    voie: "officielle",
    attendu: "les offres de Davie par la voie officielle — l'alternative propre à Oracle HCM",
    reserve:
      "La forme d'URL et le nom exact de l'employeur restent à confirmer par l'échantillon : " +
      "un 200 sur une page « aucun résultat » se lit comme un succès et ne vaut rien.",
  },
  {
    id: "oracle:davie",
    nom: "Chantier Davie — Oracle Cloud HCM (point d'entrée du site carrières)",
    url:
      "https://fa-ewde-saasfaprod1.fa.ocs.oraclecloud.com/hcmRestApi/resources/latest/" +
      "recruitingCEJobRequisitions?onlyData=true&finder=findReqs;siteNumber=CX_1,limit=25",
    voie: "aucune-voie-publique",
    attendu: "du JSON de réquisitions — ou un refus, qui trancherait aussi",
    reserve:
      "Hôte CONSTATÉ dans l'URL du site carrières de Davie ; le reste de la forme vient de la " +
      "documentation Oracle, pas d'une visite. Et surtout : un 200 ici ne rend rien exploitable. " +
      "Oracle documente ces points d'entrée comme internes ou réservés aux partenaires — les " +
      "brancher exigerait de réviser le garde-fou n°4, ce qui est une décision de Marc.",
  },

  // ── Les quatre agrégateurs demandés par Marc — on lit d'abord ce qu'ils AUTORISENT ──
  {
    id: "agregateur:indeed",
    nom: "Indeed — robots.txt",
    url: "https://ca.indeed.com/robots.txt",
    voie: "aucune-voie-publique",
    attendu: "leurs règles, de leur propre main",
    reserve:
      "L'API Publisher est fermée aux nouveaux inscrits depuis 2024 (mesuré). Le connecteur " +
      "Indeed vit dans une session Claude, PAS dans l'app. Un 200 ici ne rend rien exploitable : " +
      "il dit seulement que l'hôte répond.",
  },
  {
    id: "agregateur:linkedin",
    nom: "LinkedIn — robots.txt",
    url: "https://www.linkedin.com/robots.txt",
    voie: "aucune-voie-publique",
    attendu: "leurs règles",
    reserve:
      "Aucune API publique d'offres ; Talent Solutions est réservée aux partenaires. " +
      "Le moissonnage est interdit par les conditions ET peut coûter le compte de Marc.",
  },
  {
    id: "agregateur:jobillico",
    nom: "Jobillico — robots.txt",
    url: "https://www.jobillico.com/robots.txt",
    voie: "partenaire-sur-demande",
    attendu: "leurs règles",
    reserve:
      "MESURÉ : leur API est une API de PUBLICATION — tout y est scopé aux entreprises " +
      "gérées par le compte, donc illisible de l'extérieur. Une voie existe côté employeur, pas côté chercheur.",
  },
  {
    id: "agregateur:ziprecruiter",
    nom: "ZipRecruiter — robots.txt",
    url: "https://www.ziprecruiter.com/robots.txt",
    voie: "partenaire-sur-demande",
    attendu: "leurs règles",
    reserve:
      "Un programme Partner/Publisher existe et demande une inscription ; l'API répond 401 " +
      "sans clé. C'est la seule des quatre dont la voie légale est à portée d'une démarche.",
  },
];

/** Une pause, pour ne pas marteler. Injectable, sinon les tests attendent pour de vrai. */
export type Dormir = (ms: number) => Promise<void>;

const dormirVrai: Dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sonde chaque candidat, en SÉRIE, et rend ce qu'il a répondu.
 *
 * ⚠️ EN SÉRIE, ET AVEC UNE PAUSE. Paralléliser doublerait le débit vers des services tiers
 * qu'on ne paie pas — et `Promise.all` sur quinze hôtes, c'est exactement la salve qui fait
 * bannir un appelant. La contre-pression n'est pas une politesse, c'est ce qui garde l'accès.
 *
 * ⚠️ UN `try` PAR CANDIDAT. Sans lui, le premier hôte injoignable emporte les quatorze
 * suivants et la sonde rend un vide qu'on lirait comme « rien n'est accessible ».
 */
export async function sonder(
  candidats: readonly Candidat[] = CANDIDATS,
  recuperer: typeof fetch = fetch,
  dormir: Dormir = dormirVrai,
): Promise<Mesure[]> {
  const mesures: Mesure[] = [];
  for (const [i, c] of candidats.entries()) {
    if (i > 0) await dormir(PAUSE_SONDE_MS);
    const debut = Date.now();
    const base = { id: c.id, nom: c.nom, voie: c.voie };
    try {
      const ctrl = new AbortController();
      const minuteur = setTimeout(() => ctrl.abort(), DELAI_SONDE_MS);
      try {
        const r = await recuperer(c.url, {
          headers: {
            "User-Agent": "JobAI/1.0 (veille personnelle; https://github.com/MoKarade/JobAI)",
            Accept: "application/json, text/plain, application/xml;q=0.9, */*;q=0.8",
          },
          signal: ctrl.signal,
          cache: "no-store",
        });
        const corps = await r.text();
        const estRobots = c.url.endsWith("/robots.txt");
        mesures.push({
          ...base,
          ...(estRobots ? { robots: extraireBlocRobots(corps, "*") } : {}),
          code: r.status,
          contentType: r.headers.get("content-type"),
          taille: corps.length,
          echantillon: echantillonner(corps),
          offres: compterOffres(corps, c.famille),
          ms: Date.now() - debut,
        });
      } finally {
        clearTimeout(minuteur);
      }
    } catch (e) {
      // `code: null` DIT que la requête n'est jamais partie — un refus de tunnel, un DNS
      // mort ou un délai dépassé. C'est une situation OPPOSÉE à un 403, qui prouve au
      // contraire que l'hôte a été atteint. Les confondre, c'est le « 0/180 » de juillet.
      mesures.push({
        ...base,
        code: null,
        contentType: null,
        taille: 0,
        echantillon: "",
        offres: null,
        ms: Date.now() - debut,
        erreur: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return mesures;
}
