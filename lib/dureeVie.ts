// lib/dureeVie.ts — combien de temps une offre reste-t-elle en ligne ?
//
// Demande de Marc (2026-09-14) : « une historique pour estimer genre combien de temps une
// offre reste en ligne ». La donnée était DÉJÀ collectée — le journal de veille garde, par
// offre, le jour de la première et de la dernière observation. Ce qui manquait n'est pas la
// mesure, c'est ce qu'on en tire.
//
// ⚠️ TROIS HONNÊTETÉS, ET AUCUNE N'EST NÉGOCIABLE — sans elles, ce module publierait un
// chiffre faux avec l'autorité d'une mesure (garde-fou n°3).
//
//   1. ON MESURE LA DURÉE VISIBLE, PAS LA DURÉE DE VIE. Une offre existait avant qu'une de
//      nos requêtes ne la trouve : `premiereVue` est le jour où NOUS l'avons vue, jamais le
//      jour de sa publication. Tout ce que ce module produit est donc une borne INFÉRIEURE,
//      et chaque libellé d'écran doit dire « depuis qu'on l'a repérée ».
//
//   2. LES OFFRES ENCORE OUVERTES NE SE JETTENT PAS, ET NE SE COMPTENT PAS COMME LES AUTRES.
//      C'est le piège central. Une offre ouverte depuis 40 jours n'a pas fini sa vie : on
//      sait seulement qu'elle a duré AU MOINS 40 jours. Ne garder que les offres fermées
//      donnerait une médiane biaisée VERS LE BAS — les longues sont justement celles qui
//      durent encore, donc celles qu'on aurait écartées. Les compter comme si elles étaient
//      fermées la biaiserait aussi, dans l'autre sens. La bonne réponse à ce problème porte
//      un nom et existe depuis 1958 : l'estimateur de Kaplan-Meier, qui garde ces
//      observations CENSURÉES au dénominateur tant qu'elles sont « à risque », puis les
//      retire sans jamais les compter comme un événement. Il tient en trente lignes.
//
//   3. UNE MÉDIANE, JAMAIS UNE MOYENNE. Un employeur qui republie la même annonce pendant
//      six mois tirerait une moyenne à lui tout seul. La médiane répond exactement à la
//      question posée : « au bout de combien de jours la moitié des offres a-t-elle
//      disparu ? »
//
// ⚠️ ET LA DURÉE OBSERVÉE S'ARRÊTE À LA DERNIÈRE VUE, pas au constat de péremption. Une
// offre est déclarée périmée après `SEUIL_ABSENCES_PEREMPTION` jours de silence : compter
// jusque-là ajouterait ce délai à CHAQUE durée, donc surestimerait tout le monde d'autant.
// C'est pour cette raison que le calcul n'utilise que `premiereVue` et `derniereVue`, et
// jamais `perimeeLe` — qui ne sert qu'à savoir SI l'offre est fermée, pas QUAND.

import type { Offre } from "./types";
import type { JournalVeille } from "./veille";
import { categorieOffre, type Categorie } from "./categorie";

/** Une offre observée entre deux dates, et si sa vie est finie. */
export interface Observation {
  id: string;
  entreprise: string;
  poste: string;
  categorie: Categorie;
  /** Premier jour où une passe l'a vue (AAAA-MM-JJ). */
  premiereVue: string;
  /** Dernier jour où une passe l'a vue (AAAA-MM-JJ). */
  derniereVue: string;
  /** Jours entre les deux. Zéro pour une offre vue une seule fois — c'est une vraie valeur. */
  jours: number;
  /**
   * `true` = l'offre a disparu, la durée est DÉFINITIVE.
   * `false` = elle est encore en ligne, donc `jours` est un MINIMUM (observation censurée).
   */
  fermee: boolean;
}

/** Jours entre deux dates `AAAA-MM-JJ`. PURE, et sans fuseau : deux dates civiles. */
export function joursEntre(debut: string, fin: string): number {
  const [a1, m1, j1] = debut.split("-").map(Number);
  const [a2, m2, j2] = fin.split("-").map(Number);
  if (a1 === undefined || m1 === undefined || j1 === undefined) return 0;
  if (a2 === undefined || m2 === undefined || j2 === undefined) return 0;
  // `Date.UTC` et non `new Date(chaîne)` : on compare deux dates CIVILES, et un fuseau
  // n'a rien à faire ici — c'est ce qui rend le calcul stable où que tourne le serveur.
  const ms = Date.UTC(a2, m2 - 1, j2) - Date.UTC(a1, m1 - 1, j1);
  return Math.round(ms / 86_400_000);
}

/**
 * Les observations exploitables, tirées du suivi et du journal de veille. PURE.
 *
 * ⚠️ SEULES LES OFFRES QUE LA VEILLE A RÉELLEMENT VUES ENTRENT ICI. Une offre saisie à la
 * main ou déposée sans jamais être revue par un balayage n'a pas de « dernière vue » : sa
 * durée serait inventée. Elles sont donc ÉCARTÉES, et leur compte est rendu à part — un
 * échantillon dont on ne dit pas ce qu'il laisse dehors se lit comme un recensement.
 *
 * Les offres historiques (2025) sont hors veille par construction : aucun balayage ne les
 * concerne, donc aucune observation.
 */
export function observer(
  offres: readonly Offre[],
  journal: JournalVeille,
  metiers: readonly string[] = [],
): { observations: Observation[]; horsVeille: number } {
  const observations: Observation[] = [];
  let horsVeille = 0;

  for (const o of offres) {
    if (o.histo) continue;
    const suivi = journal[o.id];
    if (!suivi) {
      horsVeille++;
      continue;
    }
    observations.push({
      id: o.id,
      entreprise: o.entreprise,
      poste: o.poste,
      // La catégorie se dérive du MÊME barème que la note (`categorieOffre`), jamais d'un
      // calcul parallèle : deux chiffres qui se contredisent à l'écran valent moins que pas
      // de chiffre du tout. La description n'est pas persistée sur l'offre — la catégorie se
      // tire donc du titre et du code de profession, comme partout ailleurs dans l'app.
      categorie: categorieOffre(o.poste, "", o.noc ?? null, metiers),
      premiereVue: suivi.premiereVue,
      derniereVue: suivi.derniereVue,
      jours: Math.max(0, joursEntre(suivi.premiereVue, suivi.derniereVue)),
      fermee: o.perimeeLe !== null,
    });
  }

  return { observations, horsVeille };
}

/** Un point de la courbe de survie : à `jours`, quelle part des offres est encore en ligne. */
export interface PointSurvie {
  jours: number;
  /** Entre 0 et 1. */
  part: number;
}

export interface Survie {
  /** La courbe, par jours croissants. Vide s'il n'y a aucune observation. */
  courbe: PointSurvie[];
  /**
   * Jours au bout desquels la MOITIÉ des offres a disparu.
   *
   * `null` quand la courbe ne descend jamais à 0,5 — c'est-à-dire quand plus de la moitié
   * des offres sont encore en ligne. Ce n'est PAS « zéro » ni « on ne sait pas » : c'est
   * une information (« la moitié tient encore »), et l'écran doit la dire ainsi.
   */
  medianeJours: number | null;
  /** Observations retenues. */
  total: number;
  /** Combien d'entre elles ont réellement fermé. Le reste est censuré à droite. */
  fermees: number;
}

/**
 * Estimateur de Kaplan-Meier. PURE.
 *
 * À chaque jour où au moins une offre ferme, la part encore en ligne est multipliée par
 * `1 − fermetures / encore à risque`. Les offres ENCORE OUVERTES comptent dans « à risque »
 * jusqu'à leur dernier jour observé, puis sortent sans jamais compter comme une fermeture :
 * c'est exactement ce qui empêche le biais des deux méthodes naïves (jeter les ouvertes, ou
 * les traiter comme fermées).
 */
export function survie(observations: readonly Observation[]): Survie {
  const total = observations.length;
  const fermees = observations.filter((o) => o.fermee).length;
  if (total === 0) return { courbe: [], medianeJours: null, total: 0, fermees: 0 };

  // Les jours où au moins une offre ferme — les seuls où la courbe descend.
  const joursDeFermeture = [...new Set(observations.filter((o) => o.fermee).map((o) => o.jours))].sort(
    (a, b) => a - b,
  );

  const courbe: PointSurvie[] = [];
  let part = 1;

  for (const t of joursDeFermeture) {
    // « À risque » : toutes celles observées AU MOINS jusqu'à t — ouvertes comprises.
    const aRisque = observations.filter((o) => o.jours >= t).length;
    const evenements = observations.filter((o) => o.fermee && o.jours === t).length;
    if (aRisque === 0) continue;
    part *= 1 - evenements / aRisque;
    courbe.push({ jours: t, part });
  }

  const franchi = courbe.find((p) => p.part <= 0.5);
  return { courbe, medianeJours: franchi ? franchi.jours : null, total, fermees };
}

/** Une survie calculée sur un sous-ensemble nommé (une catégorie, un employeur). */
export interface SurvieNommee extends Survie {
  nom: string;
}

/**
 * Regroupe les observations par une clé, et rend une survie par groupe.
 *
 * ⚠️ UN PLANCHER D'EFFECTIF, PARCE QU'UNE MÉDIANE SUR TROIS OFFRES N'EST PAS UNE MÉDIANE.
 * Elle a la même forme qu'un vrai chiffre à l'écran et ne vaut rien : deux offres de plus la
 * déplacent de moitié. Les groupes trop maigres sont ÉCARTÉS, pas arrondis — et le compte de
 * ce qui est écarté remonte à l'appelant, sinon un tableau court se lit comme un marché
 * calme au lieu d'un échantillon insuffisant.
 */
export function survieParGroupe(
  observations: readonly Observation[],
  cle: (o: Observation) => string,
  minimum: number,
): { groupes: SurvieNommee[]; ecartes: number } {
  const paquets = new Map<string, Observation[]>();
  for (const o of observations) {
    const k = cle(o);
    const liste = paquets.get(k);
    if (liste) liste.push(o);
    else paquets.set(k, [o]);
  }

  const groupes: SurvieNommee[] = [];
  let ecartes = 0;
  for (const [nom, liste] of paquets) {
    if (liste.length < minimum) {
      ecartes++;
      continue;
    }
    groupes.push({ nom, ...survie(liste) });
  }

  // Les plus courtes d'abord : c'est l'urgence qui intéresse — où faut-il postuler vite.
  // Un groupe sans médiane (plus de la moitié encore en ligne) passe en dernier : il ne dit
  // pas « zéro jour », il dit « on ne sait pas encore ».
  groupes.sort((a, b) => {
    if (a.medianeJours === null) return b.medianeJours === null ? 0 : 1;
    if (b.medianeJours === null) return -1;
    return a.medianeJours - b.medianeJours;
  });

  return { groupes, ecartes };
}

/** Effectif minimal pour qu'une médiane de groupe soit affichée. */
export const MINIMUM_GROUPE = 8;

/** Le tableau complet, prêt pour l'écran. */
export interface RapportDureeVie {
  ensemble: Survie;
  parCategorie: SurvieNommee[];
  parEmployeur: SurvieNommee[];
  /** Groupes écartés faute d'effectif, par axe. */
  ecartes: { categories: number; employeurs: number };
  /** Offres du suivi qu'aucun balayage n'a vues : hors de cette mesure, et il faut le dire. */
  horsVeille: number;
}

export function rapportDureeVie(
  offres: readonly Offre[],
  journal: JournalVeille,
  metiers: readonly string[] = [],
): RapportDureeVie {
  const { observations, horsVeille } = observer(offres, journal, metiers);
  const categories = survieParGroupe(observations, (o) => o.categorie, MINIMUM_GROUPE);
  const employeurs = survieParGroupe(observations, (o) => o.entreprise, MINIMUM_GROUPE);

  return {
    ensemble: survie(observations),
    parCategorie: categories.groupes,
    parEmployeur: employeurs.groupes,
    ecartes: { categories: categories.ecartes, employeurs: employeurs.ecartes },
    horsVeille,
  };
}
