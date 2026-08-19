// lib/ingest/guichetFlux.ts — lire le flux du Guichet-Emplois SANS jamais le charger.
//
// POURQUOI CE FICHIER EXISTE
// Le flux officiel (`jobbank.gc.ca/xmlfeed/jobbank.xml`) pèse ~134 Mo et porte les offres de
// tout le Canada. Mesuré le 2026-08-19 : 200, `application/xml`, reconstruit deux heures plus
// tôt. C'est l'exception que le garde-fou n°4 nomme, donc la source la plus légitime dont
// dispose ce projet — et la seule qui couvre la région sans partenariat.
//
// ⚠️ SA TAILLE COMMANDE TOUTE LA CONCEPTION, ET CE N'EST PAS UNE PRÉCAUTION THÉORIQUE.
// La sonde a fait `await r.text()` dessus à son premier passage : elle a chargé 134 Mo dans
// une fonction serverless pour n'en garder que 400 caractères. Ça a marché, et un flux deux
// fois plus gros aurait tué la fonction. Ici, RIEN n'accumule : on lit par morceaux, on
// découpe dès qu'une offre est complète, on la juge, et on la jette si elle ne concerne pas
// la région. Le pic mémoire doit dépendre de la taille d'UNE offre, jamais du flux.
//
// FORMAT — le format de syndication XML d'Indeed, que le Guichet publie (constaté le
// 2026-08-19 : `<source><publisher>…<job><title>…<jobtype>…<workterm>…`). Les champs standard
// sont `title`, `date`, `referencenumber`, `url`, `company`, `city`, `state`, `country`,
// `description`, `salary`, `jobtype`. Le Guichet en ajoute (`workterm`, et d'autres que
// l'échantillon de la sonde coupait en plein milieu).
//
// ⚠️ C'EST POURQUOI L'ANALYSEUR EST AUTO-DESCRIPTIF. Je n'ai pas pu lire le flux depuis cette
// session (la passerelle refuse l'hôte), donc la liste exacte des champs est une HYPOTHÈSE
// tirée d'un échantillon tronqué. `recenserBalises` rapporte les noms réellement rencontrés :
// le premier passage réel dit le schéma au lieu que je le devine, et un champ que j'aurais
// mal nommé se voit dans le recensement au lieu de disparaître en silence.

import type { OffreBrute } from "./types";
import { texteSimple } from "./analyseurs";
import { entetes } from "./sources";

/** L'adresse du flux, constatée le 2026-08-19 (200, `application/xml`). */
export const URL_FLUX_GUICHET = "https://www.jobbank.gc.ca/xmlfeed/jobbank.xml";

/**
 * Taille maximale du tampon d'assemblage, en caractères.
 *
 * ⚠️ CE N'EST PAS UN RÉGLAGE DE PERFORMANCE, C'EST UN FILET ANTI-EXPLOSION. Le tampon ne
 * garde que le FRAGMENT d'offre à cheval sur deux morceaux réseau — quelques kilo-octets.
 * S'il dépasse ce seuil, c'est qu'aucun `</job>` n'arrive : flux malformé, balise renommée,
 * ou page d'erreur servie à la place. Sans cette borne, on reconstruirait les 134 Mo en
 * mémoire un morceau à la fois, exactement ce que ce module existe pour éviter.
 */
export const TAMPON_MAX = 4 * 1024 * 1024;

/** Pourquoi la lecture s'est arrêtée. Jamais « terminé » quand elle ne l'est pas. */
export type FinLecture =
  /** Le flux est allé jusqu'au bout. C'est la seule fin qui autorise à conclure. */
  | "flux-termine"
  /** Le budget de temps est épuisé — passe PARTIELLE. */
  | "budget-depasse"
  /** Le plafond d'offres retenues est atteint — passe PARTIELLE. */
  | "plafond-retenues"
  /** Le tampon a débordé : flux malformé ou balise inattendue. PANNE, pas un vide. */
  | "tampon-deborde";

export interface RapportFlux {
  fin: FinLecture;
  /** Offres vues dans le flux, toutes régions confondues. */
  vues: number;
  /** Offres retenues par le prédicat. */
  retenues: OffreBrute[];
  /** Offres écartées par le pré-filtre bon marché, sans être analysées. */
  preFiltrees: number;
  /** Offres analysées mais écartées par le prédicat. */
  ecartees: number;
  /** Offres dont l'analyse n'a rien rendu d'exploitable (ni titre, ni lien). */
  illisibles: number;
  octetsLus: number;
  ms: number;
  /** Offres passées au recensement. Sans lui, un compte ne veut rien dire. */
  balisesEchantillon: number;
  /**
   * Combien d'offres de l'échantillon portaient chaque balise.
   *
   * ⚠️ DES COMPTES, PAS UN ENSEMBLE — ET C'EST UNE LEÇON PAYÉE. La première version rendait
   * la LISTE des noms vus sur vingt offres. Au premier passage réel, `city` et `state` n'y
   * étaient pas… alors que les offres retenues portaient bien une ville. Un ensemble sur un
   * petit échantillon ne distingue pas « ce champ n'existe pas dans le format » de « ces
   * offres-là ne l'avaient pas » : les deux rendent la même absence, et l'une des deux
   * conclusions est fausse. Un compte tranche — `city: 0` et `city: 1987` ne se confondent
   * plus.
   */
  balisesVues: Record<string, number>;
  /**
   * Ce que les champs CONTIENNENT vraiment, par classe et par compte.
   *
   * ⚠️ SAVOIR QU'UNE BALISE EXISTE NE DIT RIEN DE CE QU'ELLE PORTE, et c'est la même faute
   * que celle du recensement en ensemble, d'un cran plus loin. Le flux écrit `noc2021` sur
   * toutes ses offres : ça ne dit pas si la valeur est un code à cinq chiffres, un libellé,
   * ou une chaîne vide déguisée. Un filtre bâti sur une valeur supposée se tromperait en
   * silence, comme le pré-filtre. On compte donc les valeurs AVANT de s'en servir.
   */
  inventaireVues: Record<string, Record<string, number>>;
  /**
   * Le même inventaire, mais sur les offres RETENUES.
   *
   * ⚠️ C'EST CELUI QUI DÉCIDE, ET LE PREMIER PASSAGE A MONTRÉ POURQUOI. `inventaireVues`
   * porte sur les premières offres du flux, qui couvrent tout le Canada : sur deux mille,
   * 223 seulement étaient québécoises. Ses distributions décrivent donc le Canada
   * (« English 1726 », des codes postaux de Surrey et de Calgary), pas ce qu'on ingérerait.
   * Lire l'un pour l'autre, c'est conclure sur un préfixe non représentatif — la même faute
   * que le recensement sur vingt offres, une population plus loin.
   */
  inventaireRetenues: Record<string, Record<string, number>>;
  /**
   * Quelques valeurs d'exemple par classe, sur les offres RETENUES seulement.
   *
   * Sur la population qui décide, jamais sur le préfixe du flux : un exemple tiré du Canada
   * entier illustrerait une classe qu'on n'ingérera pas.
   */
  exemplesRetenues: Record<string, Record<string, string[]>>;
  /**
   * Les blocs XML BRUTS des premières offres retenues.
   *
   * Pour que l'œil humain puisse apparier un code à son titre — c'est la seule façon de
   * vérifier qu'un code de profession dit bien ce que la norme prétend, plutôt que de le
   * supposer.
   */
  brutsRetenus: string[];
  /**
   * Combien d'offres de l'échantillon ont rendu une valeur NON VIDE pour chaque champ que
   * l'analyseur lit vraiment.
   *
   * C'est la MESURE JUMELLE de `balisesVues`, et elles se vérifient l'une l'autre : la
   * première dit ce que le flux écrit, la seconde ce que mon code en tire. Un écart entre
   * les deux (une balise présente dont le champ reste vide, ou l'inverse) désigne le défaut
   * sans qu'on ait à deviner de quel côté il est.
   */
  champsRenseignes: Record<string, number>;
  /**
   * Le jour où le Guichet a RECONSTRUIT le flux (`lastBuildDate`), ou `null`.
   *
   * ⚠️ C'EST LA FRAÎCHEUR DE LA SOURCE, PAS CELLE DES OFFRES. Sans lui, un flux figé depuis
   * une semaine et un marché calme rendent le même « 0 nouvelle » — la panne exacte qui a
   * laissé le cron de la veille muet trois jours durant sans qu'un voyant ne change.
   */
  construitLe: string | null;
}

/**
 * Découpe un tampon en offres COMPLÈTES, et rend ce qui reste.
 *
 * PURE, et c'est la primitive de tout le module. Une offre coupée en deux par une frontière
 * de morceau réseau n'est PAS rendue : elle repart dans `reste` et sera complétée au morceau
 * suivant. La découper ici produirait une offre tronquée — un titre sans lien, une
 * description à moitié — qui passerait les contrôles et entrerait en base amputée.
 */
export function extraireJobs(tampon: string): { jobs: string[]; reste: string } {
  const jobs: string[] = [];
  let depuis = 0;
  for (;;) {
    const debut = tampon.indexOf("<job>", depuis);
    if (debut === -1) break;
    const fin = tampon.indexOf("</job>", debut);
    if (fin === -1) break;
    jobs.push(tampon.slice(debut, fin + "</job>".length));
    depuis = fin + "</job>".length;
  }
  // Tout ce qui précède la dernière offre complète est jeté : c'est l'en-tête du flux ou
  // des offres déjà rendues. Garder le tampon entier ferait croître la mémoire sans fin.
  return { jobs, reste: tampon.slice(depuis) };
}

/**
 * Le contenu d'une balise, CDATA compris. PURE.
 *
 * Exportée sous `lireChamp` : la route de diagnostic doit pouvoir tirer d'une offre
 * n'importe quel champ du flux — y compris ceux que l'analyseur n'utilise pas encore — sans
 * que ce module décide d'avance lesquels méritent d'être regardés.
 */
function champ(bloc: string, balise: string): string {
  const cdata = new RegExp(`<${balise}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${balise}>`, "i");
  const brut = new RegExp(`<${balise}[^>]*>([\\s\\S]*?)</${balise}>`, "i");
  const m = cdata.exec(bloc) ?? brut.exec(bloc);
  return m ? texteSimple(m[1] ?? "").trim() : "";
}

export { champ as lireChamp };

/**
 * Les noms de balises DU FLUX présents dans une offre. PURE.
 *
 * ⚠️ LE CONTENU DES CDATA EST RETIRÉ D'ABORD. Les descriptions du Guichet sont du HTML :
 * sans cette coupe, le recensement rend `ul`, `li` et `h2` au milieu des champs du flux, et
 * la seule question qu'il sert à trancher — « mes noms de champs sont-ils les bons ? » — se
 * noie dans le balisage des annonces.
 */
export function recenserBalises(job: string): string[] {
  const sansCdata = job.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const noms = new Set<string>();
  for (const m of sansCdata.matchAll(/<([a-z][\w.-]*)\s*\/?>/gi)) {
    const nom = m[1]?.toLowerCase();
    if (nom !== undefined && nom !== "job") noms.add(nom);
  }
  return [...noms].sort();
}

/**
 * Les champs que l'analyseur lit VRAIMENT.
 *
 * Ils sont nommés ici plutôt qu'écrits en dur dans `analyserJobGuichet` pour que le
 * recensement porte exactement sur eux : une liste recopiée à côté finirait par décrire un
 * autre analyseur que celui qui tourne.
 */
export const CHAMPS_ANALYSES = [
  "title",
  "url",
  "company",
  "city",
  "state",
  "referencenumber",
  "date",
  "description",
] as const;

/** Ceux de ces champs qui portent une valeur non vide dans cette offre. PURE. */
export function champsRenseignes(job: string): string[] {
  return CHAMPS_ANALYSES.filter((c) => champ(job, c) !== "");
}

/** Une date `AAAA-MM-JJ` tirée d'un champ de date, ou `null`. PURE. */
function jourDe(valeur: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(valeur.trim());
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const t = Date.parse(valeur);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Une offre du flux, mise à la forme du pipeline. PURE.
 *
 * Rend `null` quand il manque le titre ou un lien http(s) : le reste du pipeline s'appuie
 * sur ces deux champs, et une offre sans eux n'est pas une offre incomplète — c'est du bruit
 * qu'on compterait comme une trouvaille.
 */
export function analyserJobGuichet(job: string): OffreBrute | null {
  const titre = champ(job, "title");
  const lien = champ(job, "url");
  if (titre === "" || !/^https?:\/\//i.test(lien)) return null;

  // La ville seule ne suffit pas à situer : « Saint-Georges » existe en Beauce ET en
  // Mauricie. On garde la province à côté pour que `situer` puisse trancher plus tard.
  const ville = champ(job, "city");

  return {
    refSource: champ(job, "referencenumber") || lien,
    titre,
    entreprise: champ(job, "company"),
    ville,
    lien,
    description: champ(job, "description"),
    publieeLe: jourDe(champ(job, "date")),
  };
}

/**
 * Le pré-filtre bon marché : cette offre mérite-t-elle d'être analysée ?
 *
 * PURE. Le flux couvre tout le Canada ; analyser à fond ~67 000 offres pour n'en garder que
 * la région serait du travail jeté. On teste donc la province sur le texte BRUT du bloc,
 * avant toute expression régulière coûteuse.
 *
 * ⚠️ UN PRÉ-FILTRE FAUX NE SE VOIT PAS — IL REND SIMPLEMENT ZÉRO. C'est pourquoi
 * `lireFluxGuichet` compte séparément ce qu'il écarte (`preFiltrees`) : si le champ de
 * province ne s'écrit pas comme je le suppose, le compte des pré-filtrées sera égal au
 * compte des vues, et le rapport le criera au lieu de rendre une source « vide ».
 */
export function estPeutEtreQuebec(job: string): boolean {
  return /\bQC\b|Qu[ée]bec/i.test(job);
}

/**
 * Budget de temps par défaut, en millisecondes.
 *
 * Une passe partage un mur d'environ 60 s avec le tri, l'écriture et le géocodage. Vingt
 * secondes de lecture laissent de quoi faire quelque chose de ce qu'on a lu — un lecteur
 * qui consomme tout le budget rapporterait des offres que personne n'aurait le temps
 * d'écrire.
 */
export const BUDGET_MS_DEFAUT = 20_000;

/**
 * Plafond d'offres retenues par lecture.
 *
 * Il ne borne PAS le flux (c'est le budget qui le fait) : il borne ce qu'on rapporte à
 * l'appelant, donc la mémoire du rapport. Atteint, il se dit — `plafond-retenues` est une
 * passe partielle, pas une lecture complète.
 */
export const MAX_RETENUES_DEFAUT = 400;

/**
 * Offres passées au recensement.
 *
 * ⚠️ VINGT NE SUFFISAIT PAS, ET LE PREMIER PASSAGE RÉEL L'A PROUVÉ. Sur vingt offres, `city`
 * et `state` étaient absents du recensement alors que le flux les porte — assez pour me
 * faire conclure que le format n'a pas de ville. Un recensement dont l'absence n'est pas
 * concluante ne recense rien. Deux mille offres coûtent quelques expressions régulières sur
 * du texte déjà en mémoire : c'est le prix pour qu'un zéro veuille dire zéro.
 */
export const ECHANTILLON_BALISES = 2000;

/** Caractères de tête examinés pour y trouver `lastBuildDate`. */
const ENTETE_MAX = 16 * 1024;

/**
 * Le prédicat de rétention.
 *
 * ⚠️ IL REÇOIT AUSSI LE BLOC BRUT, ET C'EST DÉLIBÉRÉ. `OffreBrute` est un contrat fermé :
 * il ne porte ni la province, ni le type de poste, ni les champs que le Guichet ajoute et
 * que je n'ai pas pu lire. Passer le bloc laisse l'appelant décider avec ce que la source
 * dit VRAIMENT, au lieu de me faire deviner aujourd'hui la forme que devra avoir le
 * contrat demain.
 */
export type Garder = (offre: OffreBrute, brut: string) => boolean;

/**
 * Un champ dont on veut connaître les VALEURS, pas seulement l'existence.
 *
 * `classer` ramène une valeur à sa classe — les trois premiers caractères d'un code postal,
 * le niveau d'un code de profession — parce qu'un inventaire de valeurs BRUTES à forte
 * cardinalité ne s'interprète pas : dix mille salaires distincts n'apprennent rien, six
 * classes de salaire décident.
 */
export interface Inventaire {
  /** Clé de sortie. Distincte du champ, pour inventorier deux fois le même sous deux angles. */
  nom: string;
  /** La balise lue. */
  champ: string;
  /** Défaut : la valeur telle quelle. */
  classer?: (valeur: string) => string;
  /**
   * Un champ dont on garde quelques valeurs PAR CLASSE, pour l'œil humain.
   *
   * ⚠️ UN COMPTE NE SE VÉRIFIE PAS TOUT SEUL. « 63200 : 123 offres » ne dit pas si 63200 est
   * un métier qui concerne Marc ; « 63200 : 123 offres — cuisinier, aide-cuisinier, chef de
   * partie » se tranche d'un coup d'œil. C'est la même règle que pour les refus d'ingestion :
   * compter ne suffit pas, il faut NOMMER l'objet.
   */
  exemplesDe?: string;
}

/**
 * Classes distinctes retenues par champ.
 *
 * ⚠️ FILET ANTI-EXPLOSION, PAS UN RÉGLAGE. Un champ de texte libre (le salaire) peut porter
 * autant de valeurs distinctes que d'offres : sans borne, l'inventaire d'un flux de
 * quarante mille annonces reconstruirait en mémoire ce que ce module existe pour ne pas
 * accumuler. Au-delà, les nouvelles classes sont comptées ensemble sous `(autres)` — dit,
 * jamais silencieux : un inventaire tronqué qui se présenterait comme complet ferait
 * conclure sur un préfixe, la faute déjà payée avec le plafond de retenues.
 */
export const MAX_CLASSES = 400;

/** Offres retenues dont on garde le bloc brut. Assez pour l'œil, trop peu pour peser. */
export const MAX_BRUTS_RETENUS = 15;

/** Exemples gardés par classe. Trois suffisent à reconnaître un métier, mille ne se lisent pas. */
export const MAX_EXEMPLES_PAR_CLASSE = 3;

export interface OptionsFlux {
  url?: string;
  budgetMs?: number;
  maxRetenues?: number;
  garder?: Garder;
  /** Les champs dont on veut connaître les valeurs. Vide = on n'inventorie rien. */
  inventaire?: readonly Inventaire[];
  /** L'horloge, injectée : sans elle, le budget ne se teste qu'en attendant vraiment. */
  maintenant?: () => number;
}

/**
 * Lit le flux et rend ce qu'il faut en penser.
 *
 * ⚠️ LÈVE sur une réponse non-2xx ou sans corps, et ne rend JAMAIS un rapport vide dans ce
 * cas. Un flux injoignable et un flux sans offre régionale se ressemblent à l'arrivée —
 * l'un est une panne, l'autre une journée calme — et les confondre est exactement ce qui a
 * laissé la veille muette trois jours durant. L'appelant transforme l'exception en
 * `ResultatSource { ok: false }` ; c'est là que l'échec porte son nom.
 *
 * ⚠️ LE FLUX EST ANNULÉ DANS TOUS LES CAS (`finally`). Sortir de la boucle sans annuler
 * bornerait la MÉMOIRE sans borner le RÉSEAU : les Mo restants continueraient d'arriver,
 * et le budget qu'on croit avoir respecté serait dépensé à ne rien lire.
 */
export async function lireFluxGuichet(
  recuperer: typeof fetch = fetch,
  options: OptionsFlux = {},
): Promise<RapportFlux> {
  const {
    url = URL_FLUX_GUICHET,
    budgetMs = BUDGET_MS_DEFAUT,
    maxRetenues = MAX_RETENUES_DEFAUT,
    garder = () => true,
    inventaire = [],
    maintenant = () => Date.now(),
  } = options;

  const debut = maintenant();
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), budgetMs);

  const retenues: OffreBrute[] = [];
  const balises: Record<string, number> = {};
  const champsVus: Record<string, number> = {};
  const valeursVues: Record<string, Record<string, number>> = {};
  const valeursRetenues: Record<string, Record<string, number>> = {};
  const brutsRetenus: string[] = [];
  const exemples: Record<string, Record<string, string[]>> = {};
  let balisesEchantillon = 0;
  let vues = 0;
  let preFiltrees = 0;
  let ecartees = 0;
  let illisibles = 0;
  let octetsLus = 0;
  let construitLe: string | null = null;

  try {
    const r = await recuperer(url, {
      headers: entetes(),
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (r.body === null) throw new Error("flux sans corps");

    const lecteur = r.body.getReader();
    const decodeur = new TextDecoder();
    let tampon = "";
    /** L'en-tête, tant qu'on le collecte. `null` une fois qu'on l'a jugé. */
    let entete: string | null = "";
    let fin: FinLecture = "flux-termine";

    /** Garde quelques exemples par classe, sur les offres retenues seulement. */
    const illustrer = (nom: string, classe: string, bloc: string, champExemple: string): void => {
      const par = (exemples[nom] ??= {});
      const liste = (par[classe] ??= []);
      if (liste.length >= MAX_EXEMPLES_PAR_CLASSE) return;
      const valeur = champ(bloc, champExemple);
      // Un exemple répété n'illustre rien de plus : on garde des valeurs DISTINCTES, sinon
      // trois annonces du même employeur occuperaient toute la place.
      if (valeur !== "" && !liste.includes(valeur)) liste.push(valeur);
    };

    /** Compte les valeurs d'une offre dans l'accumulateur donné. */
    const inventorier = (
      seaux: Record<string, Record<string, number>>,
      bloc: string,
      avecExemples = false,
    ): void => {
      for (const inv of inventaire) {
        const brut = champ(bloc, inv.champ);
        const classe = brut === "" ? "(vide)" : (inv.classer?.(brut) ?? brut);
        if (avecExemples && inv.exemplesDe !== undefined) {
          illustrer(inv.nom, classe, bloc, inv.exemplesDe);
        }
        const seau = (seaux[inv.nom] ??= {});
        // La borne ne s'applique qu'aux classes NOUVELLES : une classe déjà connue continue
        // de se compter, sinon les comptes deviendraient faux au lieu d'être seulement
        // incomplets.
        const cle =
          seau[classe] !== undefined || Object.keys(seau).length < MAX_CLASSES
            ? classe
            : "(autres)";
        seau[cle] = (seau[cle] ?? 0) + 1;
      }
    };

    /** Traite les offres complètes du tampon. Rend `true` si le plafond est atteint. */
    const consommer = (): boolean => {
      const decoupe = extraireJobs(tampon);
      tampon = decoupe.reste;
      for (const bloc of decoupe.jobs) {
        vues += 1;
        if (vues <= ECHANTILLON_BALISES) {
          balisesEchantillon += 1;
          for (const nom of recenserBalises(bloc)) balises[nom] = (balises[nom] ?? 0) + 1;
          for (const c of champsRenseignes(bloc)) champsVus[c] = (champsVus[c] ?? 0) + 1;
          inventorier(valeursVues, bloc);
        }
        if (!estPeutEtreQuebec(bloc)) {
          preFiltrees += 1;
          continue;
        }
        const offre = analyserJobGuichet(bloc);
        if (offre === null) {
          illisibles += 1;
          continue;
        }
        if (!garder(offre, bloc)) {
          ecartees += 1;
          continue;
        }
        retenues.push(offre);
        inventorier(valeursRetenues, bloc, true);
        if (brutsRetenus.length < MAX_BRUTS_RETENUS) brutsRetenus.push(bloc);
        if (retenues.length >= maxRetenues) return true;
      }
      return false;
    };

    try {
      for (;;) {
        const { done, value } = await lecteur.read();
        if (done) {
          // Vide le décodeur : un caractère à cheval sur le dernier morceau se perdrait
          // sans ce dernier appel, et c'est le genre de perte qui ne se voit jamais.
          tampon += decodeur.decode();
          consommer();
          break;
        }
        octetsLus += value.byteLength;
        const texte = decodeur.decode(value, { stream: true });
        tampon += texte;

        if (entete !== null) {
          entete += texte;
          const debutOffres = entete.indexOf("<job>");
          if (debutOffres !== -1 || entete.length >= ENTETE_MAX) {
            const zone = debutOffres === -1 ? entete : entete.slice(0, debutOffres);
            construitLe = jourDe(champ(zone, "lastBuildDate"));
            entete = null;
          }
        }

        if (consommer()) {
          fin = "plafond-retenues";
          break;
        }
        if (tampon.length > TAMPON_MAX) {
          fin = "tampon-deborde";
          break;
        }
        if (maintenant() - debut >= budgetMs) {
          fin = "budget-depasse";
          break;
        }
      }
    } catch (err) {
      // Notre PROPRE minuteur a coupé la lecture : par construction, c'est le budget qui
      // est épuisé, pas le flux qui est en panne. On garde ce qui a été lu et on le dit
      // comme une passe partielle. Toute autre erreur remonte : une lecture qui casse ne
      // doit jamais se déguiser en lecture incomplète.
      if (!(err instanceof Error) || err.name !== "AbortError") throw err;
      fin = "budget-depasse";
    } finally {
      await lecteur.cancel().catch(() => undefined);
    }

    return {
      fin,
      vues,
      retenues,
      preFiltrees,
      ecartees,
      illisibles,
      octetsLus,
      ms: maintenant() - debut,
      balisesEchantillon,
      balisesVues: balises,
      champsRenseignes: champsVus,
      inventaireVues: valeursVues,
      inventaireRetenues: valeursRetenues,
      exemplesRetenues: exemples,
      brutsRetenus,
      construitLe,
    };
  } finally {
    clearTimeout(minuteur);
  }
}
