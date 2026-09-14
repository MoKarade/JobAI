// lib/veille.ts — décider ce qu'un balayage quotidien change au suivi.
//
// Le balayage lui-même (interroger une source d'offres) ne vit PAS ici : il est fait par
// une session de travail, avec le connecteur Indeed, et ne tourne jamais dans l'app
// déployée (garde-fou n°4). Ce fichier ne contient que la DÉCISION, pure et testable :
// qu'est-ce qui est nouveau, qu'est-ce qui a disparu, et à partir de quand une
// disparition vaut une péremption.
//
// LE PIÈGE CENTRAL — « absente d'un balayage » ne veut PAS dire « fermée »
// Une offre peut manquer à une passe pour des raisons qui n'ont rien à voir avec sa
// fermeture : le classement de la source, un mot-clé qui ne matche pas ce jour-là, une
// requête qui a rendu dix résultats au lieu de douze. Périmer à la première absence
// remplirait le suivi d'offres ouvertes marquées mortes — l'inverse exact du service
// rendu, et un mensonge que Marc ne peut pas détecter sans rouvrir chaque lien.
// D'où le SEUIL d'absences consécutives, et la RÉSURRECTION automatique : une offre
// revue redevient active, parce qu'un faux positif ne doit jamais être définitif.
//
// CE QUE LA VEILLE NE TOUCHE JAMAIS
//   - les champs de Marc (garde-fou n°2) : elle n'écrit que `perimeeLe` ;
//   - les offres qu'elle n'a jamais vues. Les 23 offres relevées à la main ne viennent pas
//     d'un balayage : leur absence d'une requête Indeed ne prouve rien du tout, et les
//     périmer sur ce silence détruirait le travail le plus fiable du jeu.

import type { Offre } from "./types";

/**
 * Nombre de JOURS consécutifs sans voir une offre avant de la déclarer périmée.
 *
 * Pas un : une absence isolée est du bruit de source (voir l'en-tête). Plusieurs jours de
 * silence sur une offre que la même requête voyait la veille, c'est un signal. Le compte
 * est visible dans le journal, donc contestable.
 *
 * ⚠️ 3 → 5 LE 2026-08-17, ET CE N'EST PAS UN ASSOUPLISSEMENT : C'EST UNE CORRECTION.
 *
 * Le seuil valait trois quand la veille interrogeait les MÊMES huit termes chaque jour :
 * l'observation quotidienne était alors comparable d'un jour à l'autre, et une offre absente
 * trois jours de suite l'était vraiment. Le bassin de termes est passé à ~36, tirés douze
 * par jour EN ROTATION — l'observation est devenue PARTIELLE et TOURNANTE.
 *
 * Conséquence que le seuil de trois n'aurait pas supportée : une offre trouvée par un terme
 * n'est plus revue tant que ce terme n'est pas retiré, soit jusqu'à trois jours plus tard.
 * Elle accumulait donc des absences alors qu'elle était OUVERTE, et se serait périmée pile
 * au moment où son terme revenait. La rotation aurait fabriqué des faux positifs — le bug
 * même que ce seuil existe pour éviter.
 *
 * La valeur se DÉRIVE donc du cycle de rotation : `ceil(bassin / termes par jour)` jours
 * pour que chaque terme repasse, plus deux jours de marge pour le bruit de source. Le lien
 * est verrouillé par `tests/profil.test.ts` — agrandir le bassin sans toucher au seuil fait
 * tomber le test, au lieu de périmer des offres vivantes en silence.
 */
export const SEUIL_ABSENCES_PEREMPTION = 5;

/**
 * Le même seuil, quand la passe a balayé TOUT le bassin de termes.
 *
 * ⚠️ DEUX SEUILS PARCE QU'IL Y A DEUX QUALITÉS D'OBSERVATION, et c'est ce qui rend la
 * demande de Marc (2026-09-14 : « je veux que ça recheck toutes les offres à chaque
 * passe ») sûre au lieu d'être un simple abaissement de garde.
 *
 * Le seuil de cinq ci-dessus paie la ROTATION : quand la passe ne tire que 18 termes sur 48,
 * une offre qu'un seul terme trouve peut manquer trois jours d'affilée en étant parfaitement
 * ouverte. Le seuil devait couvrir ce cycle, plus une marge de bruit.
 *
 * Quand la passe balaie tout, ce cycle n'existe plus : une offre absente l'a été de la
 * requête qui l'avait trouvée. Deux jours de silence suffisent alors — et c'est un vrai
 * gain, pas un raccourci : la fermeture est datée trois jours plus tôt, donc la durée de vie
 * mesurée (`lib/dureeVie.ts`) est trois jours plus juste.
 *
 * ⚠️ MAIS CE SEUIL NE S'APPLIQUE QU'AUX ABSENCES CONSTATÉES SOUS COUVERTURE COMPLÈTE, et la
 * distinction n'est pas théorique : le quota Indeed se referme en s'aggravant (mesuré : 14 s,
 * puis 42, puis 51 d'attente annoncée), donc une passe PEUT s'arrêter au milieu du bassin.
 * Compter ces absences-là au seuil bas périmerait en deux jours tout un pan du suivi, sur un
 * empêchement d'infrastructure — exactement le faux positif que tout ce mécanisme existe
 * pour éviter. D'où un compteur SÉPARÉ : une absence ne vaut au seuil bas que si la passe
 * qui l'a constatée a prouvé sa couverture.
 */
export const SEUIL_ABSENCES_COUVERTURE_COMPLETE = 2;

/** Ce que la veille retient d'une offre, entre deux passages. */
export interface SuiviVeille {
  /** Premier balayage qui l'a vue (AAAA-MM-JJ). */
  premiereVue: string;
  /** Dernier balayage qui l'a vue (AAAA-MM-JJ). */
  derniereVue: string;
  /**
   * JOURS consécutifs sans la voir. Remis à zéro dès qu'elle réapparaît.
   *
   * ⚠️ DES JOURS, PAS DES PASSAGES — et c'est tout ce qui sépare « je peux relancer quand je
   * veux » de « relancer détruit mes données ». Le compteur montait à CHAQUE passe : deux
   * passes le même jour vieillissaient le stock de deux crans, trois le périmaient en une
   * journée. C'est ce qui a produit le « −16 » du 16 août, et c'est ce qui a forcé le verrou
   * de vingt heures — un verrou qui EMPÊCHAIT Marc de relancer sa propre veille.
   *
   * Le seuil a toujours voulu dire « trois jours de silence » : il le dit maintenant.
   */
  absences: number;
  /**
   * Le jour où la dernière absence a été comptée (AAAA-MM-JJ).
   *
   * Additif et optionnel : un journal écrit avant ce champ se relit sans migration — sa
   * prochaine absence sera comptée une fois, puis datée. Sans lui, rien ne distingue « déjà
   * compté aujourd'hui » de « jamais compté », et le compteur remonterait à chaque passe.
   */
  derniereAbsence?: string;
  /**
   * Parmi ces absences, combien ont été constatées par une passe qui a balayé TOUT le
   * bassin. Remis à zéro dès que l'offre réapparaît, comme `absences`.
   *
   * ⚠️ UN COMPTEUR SÉPARÉ, PAS UN DRAPEAU SUR LA PASSE. Les absences s'accumulent sur
   * plusieurs jours, et rien ne garantit que toutes les passes d'une même série aient eu la
   * même couverture : une journée où le quota Indeed se referme au milieu du bassin produit
   * une absence qui ne prouve rien. Ne compter ici que les absences PROUVÉES permet
   * d'appliquer le seuil bas sans jamais l'appliquer à une observation partielle.
   *
   * Additif et optionnel : un journal écrit avant ce champ se relit sans migration, et ses
   * offres restent simplement sous l'ancien seuil jusqu'à leur prochaine absence.
   */
  absencesCompletes?: number;
}

/** L'état de la veille, par identifiant d'offre. Sérialisé en JSON entre deux passages. */
export type JournalVeille = Record<string, SuiviVeille>;

export interface ResultatBalayage {
  /** Les offres après application du balayage : ajouts, péremptions, résurrections. */
  offres: Offre[];
  journal: JournalVeille;
  /** Identifiants entrés dans le suivi à ce balayage. */
  nouvelles: string[];
  /** Identifiants passés en périmé à ce balayage (et non ceux qui l'étaient déjà). */
  perimees: string[];
  /** Identifiants qui étaient périmés et que ce balayage a revus : ils redeviennent actifs. */
  revenues: string[];
  /** Suivies par la veille, absentes de ce balayage, pas encore périmées. */
  enSursis: { id: string; absences: number }[];
}

/** Une offre historique est une trace de 2025 : aucun balayage ne la concerne. */
function estSousVeille(o: Offre): boolean {
  return !o.histo;
}

/**
 * Cette série d'absences suffit-elle à périmer ? PURE.
 *
 * DEUX chemins, et le plus court gagne :
 *   · deux absences constatées par des passes qui ont balayé TOUT le bassin ;
 *   · cinq absences quelle que soit la couverture — le filet d'avant, qui reste.
 *
 * ⚠️ UNE SEULE FONCTION, APPELÉE AUX DEUX ENDROITS QUI EN DÉPENDENT (le « en sursis » et la
 * péremption elle-même). Écrite deux fois, elle aurait fini par dire qu'une offre est encore
 * en sursis au moment même où l'autre exemplaire la périme — un écran qui contredit ce que
 * la base vient d'écrire, et rien pour le signaler.
 */
export function estPerimable(etat: { absences: number; absencesCompletes?: number }): boolean {
  if ((etat.absencesCompletes ?? 0) >= SEUIL_ABSENCES_COUVERTURE_COMPLETE) return true;
  return etat.absences >= SEUIL_ABSENCES_PEREMPTION;
}

/**
 * Applique un balayage au suivi.
 *
 * `aujourdhui` est un PARAMÈTRE (AAAA-MM-JJ, dans le fuseau de Marc) : la fonction ne lit
 * jamais l'horloge, sans quoi le passage de minuit serait intestable et Vercel — qui
 * tourne en UTC — daterait du lendemain tout ce qui est produit après 20 h locale.
 *
 * @param connues     Le suivi actuel, offres historiques comprises.
 * @param vues        Ce que le balayage a réellement trouvé, converti au format d'offre.
 * @param journal     L'état de la veille au passage précédent.
 * @param aujourdhui  La date du balayage, AAAA-MM-JJ.
 */
export function appliquerBalayage(
  connues: readonly Offre[],
  vues: readonly Offre[],
  journal: JournalVeille,
  aujourdhui: string,
  /**
   * La passe a-t-elle balayé TOUT le bassin de termes ?
   *
   * ⚠️ DÉFAUT À `false`, ET C'EST L'ÉCHEC FERMÉ. Une passe qui ne dit rien de sa couverture
   * n'en a pas prouvé : elle tombe sous l'ancien seuil, plus prudent. L'inverse — supposer
   * complet faute d'information — périmerait des offres vivantes au premier lot déposé par
   * un outil qui ne connaît pas encore ce champ.
   */
  couvertureComplete = false,
): ResultatBalayage {
  const idsVues = new Set(vues.map((o) => o.id));
  const parId = new Map(connues.map((o) => [o.id, o]));

  const suivant: JournalVeille = {};
  const nouvelles: string[] = [];
  const perimees: string[] = [];
  const revenues: string[] = [];
  const enSursis: { id: string; absences: number }[] = [];

  // 1) Ce que le balayage a vu : le journal l'enregistre, et une offre périmée revient.
  for (const vue of vues) {
    const precedent = journal[vue.id];
    suivant[vue.id] = {
      premiereVue: precedent?.premiereVue ?? aujourdhui,
      derniereVue: aujourdhui,
      // LES DEUX compteurs repartent de zéro : une offre revue n'a plus aucune absence, ni
      // ordinaire ni prouvée. L'écrire explicitement plutôt que de compter sur l'écrasement
      // de l'objet — le jour où quelqu'un remplacera ceci par un `{ ...precedent, … }`, un
      // compteur oublié périmerait une offre parfaitement vivante.
      absences: 0,
      absencesCompletes: 0,
    };
    if (!precedent && !parId.has(vue.id)) nouvelles.push(vue.id);
  }

  // 2) Les offres déjà suivies PAR LA VEILLE et absentes de ce balayage.
  //    Une offre jamais vue par la veille n'entre pas ici : son absence ne prouve rien.
  for (const [id, precedent] of Object.entries(journal)) {
    if (idsVues.has(id)) continue;
    // ⚠️ UNE ABSENCE PAR JOUR, PAS PAR PASSE. Une offre déjà comptée absente aujourd'hui ne
    // vieillit pas une seconde fois parce qu'on a relancé la veille : son compteur reste où
    // il est. C'est ce qui rend le balayage IDEMPOTENT dans la journée — donc relançable
    // autant de fois qu'on veut, ce qui était impossible tant que chaque passe ajoutait un
    // cran (trois clics de suite périmaient tout le stock).
    const dejaCompteAujourdhui = precedent.derniereAbsence === aujourdhui;
    const absences = dejaCompteAujourdhui ? precedent.absences : precedent.absences + 1;
    // Le compteur des absences PROUVÉES suit la même règle d'idempotence : une seule par
    // jour, et seulement quand la passe a montré qu'elle avait tout balayé.
    const dejaCompletes = precedent.absencesCompletes ?? 0;
    const absencesCompletes =
      dejaCompteAujourdhui || !couvertureComplete ? dejaCompletes : dejaCompletes + 1;
    suivant[id] = { ...precedent, absences, absencesCompletes, derniereAbsence: aujourdhui };
    const offre = parId.get(id);
    // Une offre disparue du suivi (supprimée à la main) n'a plus à être comptée.
    if (!offre) continue;
    if (!estPerimable({ absences, absencesCompletes })) {
      enSursis.push({ id, absences });
    }
  }

  // 3) Application aux offres : péremption, résurrection, ajouts.
  const offres: Offre[] = connues.map((o) => {
    if (!estSousVeille(o)) return o;

    const etat = suivant[o.id];
    if (!etat) return o; // hors veille : intouchée

    if (idsVues.has(o.id)) {
      // Revue aujourd'hui. Si elle était périmée, c'est que la péremption était fausse —
      // ou que l'employeur a republié. Dans les deux cas elle est ouverte : on la rouvre.
      if (o.perimeeLe !== null) {
        revenues.push(o.id);
        return { ...o, perimeeLe: null };
      }
      return o;
    }

    if (o.perimeeLe === null && estPerimable(etat)) {
      perimees.push(o.id);
      // Date du CONSTAT, pas de la fermeture : on ne sait pas quand l'offre a fermé, on
      // sait quand on a cessé de la voir. `perimeeLe` est un instant ISO (schéma).
      return { ...o, perimeeLe: `${aujourdhui}T00:00:00.000Z` };
    }

    return o;
  });

  // 4) Les offres réellement nouvelles s'ajoutent à la fin, dans l'ordre du balayage.
  for (const vue of vues) {
    if (!parId.has(vue.id)) offres.push(vue);
  }

  return { offres, journal: suivant, nouvelles, perimees, revenues, enSursis };
}

/**
 * Résume un balayage en une ligne lisible, pour le message de commit et le HANDOVER.
 *
 * Un traitement automatique qui ne rend pas compte de ce qu'il a fait devient un
 * traitement qu'on ne relit plus — et le jour où il se trompe, personne ne le voit.
 */
export function resumerBalayage(r: ResultatBalayage): string {
  const bouts: string[] = [];
  bouts.push(`${r.nouvelles.length} nouvelle${r.nouvelles.length > 1 ? "s" : ""}`);
  if (r.perimees.length > 0) {
    bouts.push(`${r.perimees.length} périmée${r.perimees.length > 1 ? "s" : ""}`);
  }
  if (r.revenues.length > 0) {
    bouts.push(`${r.revenues.length} revenue${r.revenues.length > 1 ? "s" : ""}`);
  }
  if (r.enSursis.length > 0) {
    bouts.push(`${r.enSursis.length} en sursis`);
  }
  return bouts.join(", ");
}
