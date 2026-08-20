// lib/ingest/passe.ts — la passe quotidienne, de bout en bout.
//
// Enchaîne : interroger les sources → trier (dédoublonner, noter, filtrer) → écrire les
// nouvelles offres → appliquer la péremption. C'est ce que le cron appelle chaque jour.
//
// CE QUI EST BORNÉ, ET POURQUOI
// Une fonction serverless a une durée de vie courte. La passe interroge donc un nombre
// PLAFONNÉ de sources par exécution, et reprend où elle s'est arrêtée le lendemain. Mieux
// vaut une passe complète tous les deux jours qu'une passe tuée en plein milieu, qui
// n'écrirait rien et recommencerait à l'identique le lendemain.
//
// LA PÉREMPTION RÉUTILISE `lib/veille.ts`
// Aucune règle de péremption n'est réécrite ici : seuil de trois absences, résurrection,
// et protection des offres jamais vues par un balayage. Une seconde implémentation
// divergerait, et c'est le jeu de données qui en paierait le prix.

import { appliquerBalayage, resumerBalayage, type JournalVeille } from "../veille";
import type { Offre } from "../types";
import { cleCanonique, idsStockesVus, lieuxAMesurer, trier, villesACompleter, type Tri, type VilleACompleter } from "./pipeline";
import { verdictsFermes, type RegistreLieux } from "./lieux";
import { RECHERCHES_GUICHET, sourceGuichet } from "./sources";
import { sourceDepotFichier } from "./depotFichier";
import { sourceGuichetFlux, type OptionsSourceFlux } from "./sourceGuichetFlux";
import { villeCoherente } from "./depotSchema";
import type { OffreBrute, Recuperateur, ResultatSource, Source } from "./types";

/** Sources interrogées par exécution. Au-delà, on dépasse la durée d'une fonction. */
export const MAX_SOURCES_PAR_PASSE = 14;

/**
 * Noms de lieu MESURÉS par passe, au maximum.
 *
 * ⚠️ C'EST UNE DÉPENSE PRISE SUR LE MÊME MUR DE 60 s QUE L'INGESTION. Chaque nom coûte une
 * requête Nominatim précédée de 1,1 s de cadence : six, c'est ~8 s dans le pire cas, avant
 * le tri. Elle s'ÉTEINT d'elle-même — un nom mesuré ne se redemande jamais, et les sources
 * répètent les mêmes villes tous les jours — donc en régime établi cette étape ne coûte
 * rien du tout. Ce qui n'entre pas dans une passe entre dans la suivante : la liste de
 * travail est triée par fréquence pour que le budget serve d'abord aux noms qui débloquent
 * le plus d'offres.
 */
export const MAX_LIEUX_PAR_PASSE = 6;

/**
 * Ce que la passe a fait des lieux qu'elle ne savait pas situer.
 *
 * Comptés et rendus, même à zéro : « aucun lieu à mesurer » et « six mesurés, zéro retenu »
 * sont deux situations opposées, et un journal qui ne parle que de ses échecs ne permet pas
 * de les distinguer.
 */
export interface MesureLieux {
  /** Noms soumis au géocodeur pendant cette passe. */
  demandes: number;
  /** Noms qui ont reçu un verdict ferme, dans la région ou hors d'elle. */
  juges: number;
  /** Noms que le géocodeur ne connaît pas — retentés plus tard, jamais condamnés. */
  introuvables: number;
  /** Le registre après la passe, prêt à écrire. Inchangé si rien n'a été mesuré. */
  registre: RegistreLieux;
}

/** Le compte rendu d'une passe. Tout y est dit, y compris ce qui a échoué. */
/** Une adresse trouvée pour un employeur, avec ce qui permet de la juger. */
export interface AdresseAnnoncee {
  entreprise: string;
  adresse: string;
  /** `offre` = écrite dans l'annonce ; `recherche` = trouvée sur le web, donc à vérifier. */
  source: "offre" | "recherche";
}

export interface RapportPasse {
  /** Ce que chaque source a rendu, succès comme échec. */
  sources: {
    id: string;
    ok: boolean;
    offres: number;
    erreur?: string;
    dernierJour?: string;
    /** Ce que la source a refusé, en une ligne. Voir `ResultatSource.note`. */
    note?: string;
  }[];
  trouvees: number;
  tri: Omit<Tri, "retenues">;
  nouvelles: string[];
  perimees: string[];
  revenues: string[];
  enSursis: number;
  /**
   * Villes manquantes que cette passe permet de rattraper sur des offres DÉJÀ suivies.
   *
   * Une offre connue est comptée « doublon » et le tri n'en fait plus rien — juste tant
   * que la source n'apporte rien de neuf. Mais une offre entrée avant que la ville soit
   * écrite n'est pas géocodable, donc reste sans distance et hors de la carte : la source
   * qui la republie porte pourtant l'information. Le point de dépôt faisait déjà ce
   * rattrapage ; ne pas le faire ici laissait la veille quotidienne aveugle au même
   * manque, pour la seule raison qu'on l'avait codé ailleurs.
   */
  villesACompleter: VilleACompleter[];
  /** Le suivi après la passe, prêt à écrire. */
  offres: Offre[];
  journal: JournalVeille;
  resume: string;
  /**
   * Les adresses que les ANNONCES elles-mêmes ont données, par employeur.
   *
   * ⚠️ ELLES NE VIVENT PAS SUR L'OFFRE, ET C'EST DÉLIBÉRÉ. Une adresse répond à « où est
   * cet employeur ? », question à laquelle `entreprises_lieux` répond déjà — la porter sur
   * `offers` aurait dupliqué la même information sur chaque poste du même site, avec le
   * risque que les copies divergent. La passe la RAPPORTE, `lib/actions.ts` l'écrit là où
   * elle sert, et seulement quand la ligne n'en a pas.
   *
   * Déjà filtrées par `adresseUtilisable` : ce qui arrive ici a la forme d'une adresse
   * civique, pas « En présentiel ».
   */
  adresses: AdresseAnnoncee[];
  /** Ce que la mesure des lieux inconnus a donné, et le registre à écrire. */
  lieux: MesureLieux;
}

/**
 * Les sources d'une exécution.
 *
 * `depart` fait tourner la sélection d'un jour à l'autre : sans lui, les mêmes sources
 * seraient interrogées chaque jour et les dernières de la liste ne le seraient JAMAIS.
 */
export function selectionnerSources(
  depart: number,
  aujourdhui: string,
  /**
   * De quoi construire la source du flux complet, ou `undefined` pour ne pas la construire.
   *
   * ⚠️ UNE LISTE DE MÉTIERS VIDE ÉTEINT LA SOURCE, elle ne la rend pas permissive. Sans ce
   * garde, le jour où le module est branché, la première passe lirait ~130 Mo et ferait
   * entrer des milliers d'offres que personne n'a demandées. Le défaut sûr d'un filtre qui
   * n'a pas encore été réglé est de tout refuser, pas de tout laisser passer.
   */
  flux?: OptionsSourceFlux,
): Source[] {
  // ⚠️ LE DÉPÔT DE FICHIERS EST HORS ROTATION, ET C'EST TOUT L'INTÉRÊT. La rotation existe
  // pour ne pas dépasser la durée d'une fonction en interrogeant douze sources RÉSEAU. Le
  // dépôt ne fait aucune requête : il lit un fichier du projet. Le mettre dans la rotation
  // le ferait sauter certains jours — donc les offres qu'il porte ne seraient pas « revues »
  // ce jour-là, et la péremption les ferait disparaître alors qu'elles sont bien là.
  const depot = sourceDepotFichier(aujourdhui);

  // ⚠️ LE FLUX COMPLET EST HORS ROTATION POUR LA MÊME RAISON QUE LE DÉPÔT, et elle est
  // encore plus impérieuse ici : il est en passe de devenir la source PRINCIPALE. Une source
  // sautée un jour sur deux voit ses offres prendre une absence ce jour-là, et trois
  // absences périment. Le mettre dans la rotation reviendrait à périmer par intermittence
  // ce qu'on vient d'ingérer — un faux positif de péremption dont la cause serait l'horaire.
  const hors: Source[] = [depot];
  // ⚠️ LA LISTE DE MÉTIERS N'ALLUME PLUS RIEN (décision Marc 2026-08-20). Elle ne filtre
  // plus l'ingestion, elle pondère la NOTE — donc une liste vide n'éteint plus la source,
  // elle rend seulement toutes les offres équivalentes au regard du domaine. Le flux est lu
  // dès qu'on le demande, et c'est l'appelant qui décide de le demander.
  if (flux !== undefined) {
    hors.push(sourceGuichetFlux(flux).source);
  }

  const reseau = RECHERCHES_GUICHET.map((r) => sourceGuichet(r));
  if (reseau.length <= MAX_SOURCES_PAR_PASSE) return [...hors, ...reseau];

  const debut = ((depart % reseau.length) + reseau.length) % reseau.length;
  const choisies: typeof reseau = [];
  for (let i = 0; i < MAX_SOURCES_PAR_PASSE; i++) {
    choisies.push(reseau[(debut + i) % reseau.length]!);
  }
  return [...hors, ...choisies];
}

/**
 * Exécute une passe complète.
 *
 * @param connues     Le suivi actuel.
 * @param journal     L'état de la veille au passage précédent.
 * @param depart      Curseur de rotation des sources.
 * @param aujourdhui  Date du balayage (AAAA-MM-JJ). Paramètre, jamais l'horloge.
 * @param rec         L'accès réseau, injecté.
 * @param lieux       Le registre des lieux déjà jugés par la mesure, et de quoi en juger
 *                    de nouveaux. Optionnel : sans lui, la passe se comporte exactement
 *                    comme avant — `situer` retombe sur sa seule liste blanche.
 */
export async function executerPasse(
  connues: readonly Offre[],
  journal: JournalVeille,
  depart: number,
  aujourdhui: string,
  rec: Recuperateur,
  lieux?: {
    registre: RegistreLieux;
    /**
     * Mesure une poignée de noms de lieu et rend le registre à jour.
     *
     * INJECTÉE, pour deux raisons qui comptent autant l'une que l'autre : le domicile ne
     * traverse pas cette frontière (garde-fou n°1 — seule la fonction qui calcule la
     * distance le connaît), et la passe reste testable sans réseau.
     */
    mesurer: (
      noms: readonly string[],
      registre: RegistreLieux,
    ) => Promise<{ registre: RegistreLieux; juges: number; introuvables: number }>;
  },
  /**
   * Le flux complet du Guichet, si Marc l'a allumé.
   *
   * Séparé de `lieux` parce que ce sont deux décisions indépendantes : on peut mesurer les
   * lieux sans lire le flux, et l'inverse. Optionnel : sans lui, la passe se comporte
   * exactement comme avant.
   *
   * ⚠️ `metiers` ne FILTRE PLUS l'ingestion : il définit le domaine pour la NOTE. Toutes les
   * offres régionales entrent, et le facteur de domaine les range. Ce qu'un filtre aurait
   * retiré reste COMPTÉ et part à l'écran — c'est ce compte qui sert à juger la liste.
   */
  flux?: { metiers: readonly string[]; recuperer?: typeof fetch },
): Promise<RapportPasse> {
  // ⚠️ LE PRÉ-FILTRE RÉGIONAL DU FLUX VOIT LE REGISTRE D'AVANT LA MESURE, ET C'EST INHÉRENT.
  // Les sources sont interrogées AVANT que la mesure des lieux n'ait tourné (elle apprend
  // ses noms de ce que les sources rapportent). Le flux juge donc les villes avec les
  // verdicts de la veille — ce qui n'a qu'une conséquence, bornée et qui se résorbe : une
  // ville tout juste mesurée entre à la passe SUIVANTE, pas à celle-ci. Vouloir corriger ça
  // en mesurant d'abord n'est pas possible : on ne saurait pas quoi mesurer.
  const sources = selectionnerSources(
    depart,
    aujourdhui,
    flux === undefined
      ? undefined
      : { ...flux, verdicts: verdictsFermes(lieux?.registre ?? {}) },
  );

  // En parallèle : les sources sont indépendantes, et les enchaîner ferait dépasser la
  // durée de la fonction bien avant d'avoir tout interrogé.
  const resultats: ResultatSource[] = await Promise.all(
    sources.map((s) => s.interroger(rec as Recuperateur)),
  );

  const brutes: OffreBrute[] = [];
  const compte: RapportPasse["sources"] = [];
  for (const r of resultats) {
    if (r.ok) {
      brutes.push(...r.offres);
      compte.push({
        id: r.source,
        ok: true,
        offres: r.offres.length,
        dernierJour: r.dernierJour,
        note: r.note,
      });
    } else {
      compte.push({ id: r.source, ok: false, offres: 0, erreur: r.erreur });
    }
  }

  // ⚠️ DEUX CLÉS PAR OFFRE CONNUE (ADR-0006). L'`id` est l'identité écrite en base ; la clé
  // canonique reconnaît le même employeur écrit autrement par une AUTRE source. Elle se
  // dérive des champs stockés (`entreprise`, `poste`), jamais de l'`id` — sans quoi il
  // faudrait migrer la clé primaire de toutes les offres, et le rattachement des champs qui
  // appartiennent à Marc (garde-fou n°2) se perdrait au premier balayage.
  const dejaSuivies = new Set([
    ...connues.map((o) => o.id),
    ...connues.map((o) => cleCanonique(o.entreprise, o.poste)),
  ]);

  // ⚠️ MESURER LES LIEUX INCONNUS AVANT DE TRIER, ET NON APRÈS.
  //
  // C'est ce qui distingue une correction d'un pansement. Placée après, la mesure ne
  // servirait qu'à la passe SUIVANTE : les offres du jour seraient quand même jetées, et
  // celles qui disparaissent de la source en vingt-quatre heures le seraient pour de bon.
  // Placée avant, le verdict s'applique au lot qu'on est en train de trier.
  //
  // La dépense est bornée (`MAX_LIEUX_PAR_PASSE`) et s'éteint : les sources répètent les
  // mêmes villes chaque jour, et un nom mesuré ne se redemande jamais. C'est la seule
  // raison pour laquelle cette étape peut se permettre d'être en amont de l'intake plutôt
  // qu'en aval — si son coût grandissait avec le volume, elle devrait passer après.
  let mesure: MesureLieux = {
    demandes: 0,
    juges: 0,
    introuvables: 0,
    registre: lieux?.registre ?? {},
  };
  if (lieux !== undefined) {
    const aMesurer = lieuxAMesurer(brutes, lieux.registre, aujourdhui).slice(
      0,
      MAX_LIEUX_PAR_PASSE,
    );
    if (aMesurer.length > 0) {
      try {
        const r = await lieux.mesurer(aMesurer, lieux.registre);
        mesure = {
          demandes: aMesurer.length,
          juges: r.juges,
          introuvables: r.introuvables,
          registre: r.registre,
        };
      } catch (err) {
        // Une panne du géocodeur ne doit jamais coûter l'intake : le tri repart sur le
        // registre d'avant, donc sur le comportement de liste blanche. On refuse quelques
        // offres de plus aujourd'hui, on n'en perd aucune de celles qu'on savait déjà lire.
        console.warn(`[lieux] mesure impossible (sans effet sur l'intake) : ${String(err)}`);
      }
    }
  }

  const tri = trier(
    brutes,
    dejaSuivies,
    aujourdhui,
    verdictsFermes(mesure.registre),
    flux?.metiers ?? [],
  );

  // Ce que le balayage a VU : les nouvelles retenues, et les offres déjà suivies qu'une
  // source vient de re-publier. Les secondes sont le signal qui remet leur compteur
  // d'absences à zéro — sans elles, une offre bien vivante se périmerait en trois jours.
  //
  // L'identifiant se calcule DIRECTEMENT, sans repasser par le filtre : une offre que Marc
  // suit peut porter un titre qui note sous le plancher (le plancher juge une offre
  // INCONNUE, pas une offre qu'il a déjà jugée digne d'intérêt). La faire passer par
  // `trier` l'écarterait, elle ne serait jamais marquée vue, et elle se périmerait au
  // troisième jour alors qu'elle est publiée sous nos yeux.
  // `idsStockesVus` résout chaque brute vers l'ID STOCKÉ, variantes de raison sociale
  // comprises — le calcul « id de la brute » d'avant laissait une offre suivie prendre des
  // absences pendant qu'une autre source la re-publiait sous « X » au lieu de « X inc. ».
  const idsVus = new Set(tri.retenues.map((o) => o.id));
  for (const id of idsStockesVus(brutes, connues)) idsVus.add(id);

  const apresAjout = [...connues, ...tri.retenues];
  const vues = apresAjout.filter((o) => idsVus.has(o.id));

  // ⚠️ UN BALAYAGE QUI N'A RIEN PU VOIR NE COMPTE PAS D'ABSENCES. Incident du 2026-08-12 :
  // le bundle prod n'embarquait pas data/depot, TOUTES les sources rendaient vide ou
  // échec, et chaque passe quotidienne ajoutait +1 absence à tout le suivi — 40 offres
  // périmées en trois jours par un empêchement d'infrastructure, pas par le marché.
  // La leçon du dépôt s'applique mot pour mot : « un mécanisme qui ne peut pas atteindre
  // sa source doit le DIRE, pas rendre un résultat vide ». Ici : aucune source en succès
  // ⇒ le journal ne bouge pas, et le résumé nomme la suspension.
  const aucuneSourceEnSucces = compte.every((c) => !c.ok);
  const balayage: ReturnType<typeof appliquerBalayage> = aucuneSourceEnSucces
    ? { offres: apresAjout, journal, nouvelles: [], perimees: [], revenues: [], enSursis: [] }
    : appliquerBalayage(apresAjout, vues, journal, aujourdhui);

  return {
    sources: compte,
    trouvees: brutes.length,
    tri: {
      souslePlancher: tri.souslePlancher,
      doublons: tri.doublons,
      horsRegion: tri.horsRegion,
      lieuInconnu: tri.lieuInconnu,
      refusees: tri.refusees,
    },
    nouvelles: tri.retenues.map((o) => o.id),
    villesACompleter: villesACompleter(brutes, connues),
    perimees: balayage.perimees,
    revenues: balayage.revenues,
    enSursis: balayage.enSursis.length,
    offres: balayage.offres,
    journal: balayage.journal,
    resume: aucuneSourceEnSucces
      ? "balayage suspendu : aucune source n'a répondu — compteurs d'absences inchangés"
      : `${tri.retenues.length} nouvelle${tri.retenues.length > 1 ? "s" : ""}, ${resumerBalayage(balayage)}`,
    adresses: adressesAnnoncees(brutes),
    lieux: mesure,
  };
}

/**
 * Les adresses exploitables d'un lot, une par employeur.
 *
 * PURE. Une seule adresse par employeur : la PREMIÈRE rencontrée. Prendre la dernière, ou
 * les accumuler, reviendrait à faire dépendre l'adresse écrite de l'ordre des sources —
 * c'est-à-dire du hasard. Un employeur qui a réellement deux sites reste un cas que la
 * table des lieux ne modélise pas ; le dire ici vaut mieux que de le résoudre au tirage.
 */
export function adressesAnnoncees(brutes: readonly OffreBrute[]): AdresseAnnoncee[] {
  const par = new Map<string, AdresseAnnoncee>();

  for (const b of brutes) {
    const entreprise = b.entreprise.trim();
    const adresse = (b.adresse ?? "").trim();
    if (entreprise === "") continue;

    // ⚠️ LA GARDE DE COHÉRENCE S'APPLIQUE AUX DEUX ORIGINES, pas seulement à la recherche
    // web. Une annonce dont l'adresse contredit sa propre ville se trompe quelque part, et
    // on ne sait pas où : la refuser coûte une épingle, la prendre envoie à la mauvaise
    // porte. Une seule règle, appliquée partout, plutôt qu'une exception à retenir.
    if (!villeCoherente(adresse, b.ville)) continue;

    // ⚠️ UNE ADRESSE DE RECHERCHE SANS SA PAGE EST REFUSÉE. Sans provenance, elle est
    // invérifiable — ni Marc ni une session future ne peuvent la contrôler — et elle prend
    // pourtant l'autorité d'un fait mesuré. L'URL est ce qui distingue une trouvaille d'une
    // invention ; l'exiger est le prix d'admission de cette source.
    const cherchee = b.adresseSource === "recherche";
    if (cherchee && !(b.adresseUrl ?? "").trim()) continue;

    const trouvee: AdresseAnnoncee = {
      entreprise,
      adresse,
      source: cherchee ? "recherche" : "offre",
    };

    // L'ANNONCE L'EMPORTE SUR LA RECHERCHE, quel que soit l'ordre d'arrivée. L'employeur
    // qui écrit où est son poste bat une page trouvée sur le web — et faire dépendre ce
    // choix de l'ordre des offres reviendrait à le tirer au sort.
    const dejaLa = par.get(entreprise);
    if (dejaLa === undefined || (dejaLa.source === "recherche" && trouvee.source === "offre")) {
      par.set(entreprise, trouvee);
    }
  }

  return [...par.values()];
}
