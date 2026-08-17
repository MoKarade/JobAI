// lib/ingest/decouverteAts.ts — QUI essayer aujourd'hui, et quand y revenir.
//
// POURQUOI CE FICHIER EXISTE
// Les analyseurs d'ATS (Greenhouse, Lever, Recruitee, Workable, SmartRecruiters), `sourceAts`
// et `jetonProbable` existent depuis longtemps. Rien ne produit pourtant la moindre offre :
// la liste d'entreprises résolues (`veille-ats`) vaut `[]` depuis le premier jour, et aucun
// code ne la remplit. C'est ce qui explique le `sources=1` de chaque trace de passe.
//
// Remplir cette liste demande de DEVINER un jeton par entreprise et par famille d'ATS, puis
// de le vérifier. Deviner coûte un aller-retour réseau à chaque essai : une centaine
// d'entreprises par cinq familles font cinq cents requêtes, ce qu'aucune passe ne peut ni ne
// doit tenter. D'où ce module : il ne contacte RIEN, il décide seulement quoi tenter
// aujourd'hui, et il se souvient de ce qui a déjà été essayé pour ne pas le repayer demain.
//
// CE QU'IL NE FAIT PAS : juger. Le verdict vient de `verifierAts`, qui confronte le contenu
// à la région. Ici on ne fait qu'ordonner et borner.

import type { AtsEntreprise, FamilleAts } from "./types";

/** Ce qu'on retient d'un essai, pour ne pas le refaire à l'aveugle. */
export interface EssaiAts {
  entreprise: string;
  famille: FamilleAts;
  /** Le verdict rendu par `verifierAts`, hors « confirme » — celui-là quitte cette liste. */
  verdict: "refute" | "indecis" | "absent";
  /** Le jour de l'essai, AAAA-MM-JJ dans le fuseau de Marc. */
  le: string;
  /** Ce qui a été vu. Un rejet sans motif ne se vérifie pas. */
  raison?: string;
  /**
   * Combien de RÉFUTATIONS d'affilée sur cette paire. Absent = une seule (ou aucune).
   *
   * C'est ce compteur qui fait monter le délai de retente : une réfutation isolée ne prouve
   * pas qu'un jeton appartient à quelqu'un d'autre — voir `PALIERS_REFUTE_JOURS`. Il se
   * remet à zéro dès qu'un autre verdict tombe, parce que la série est alors rompue.
   *
   * Optionnel et additif : l'état déjà en base (une liste vide, puis des essais écrits avant
   * ce champ) se relit sans migration, et une entrée sans compteur vaut « première ».
   */
  refus?: number;
}

/**
 * Combien de jours avant de retenter, selon ce qu'on a appris.
 *
 * ⚠️ CES TROIS DÉLAIS ENCODENT TROIS QUESTIONS DIFFÉRENTES, et c'est pour ça qu'ils
 * diffèrent. La leçon est déjà écrite en §7 : « un délai de retente encode une PRÉMISSE ».
 *
 * · `indecis` — « cette entreprise a-t-elle un poste ouvert ? » La réponse change souvent,
 *   donc on revient vite. C'est le seul état qui doit CONVERGER : sans retente rapprochée,
 *   une entreprise réelle resterait indéfiniment non résolue parce qu'elle n'embauchait pas
 *   le jour où on a regardé.
 *
 * · `absent` — « cette entreprise utilise-t-elle cet ATS ? » La réponse ne change presque
 *   jamais, mais elle CHANGE : une entreprise adopte un ATS. Quatorze jours, c'est environ
 *   la durée d'un balayage complet (mesuré : 180 paires à 12 essais/passe = 15 jours), donc
 *   une adoption est repérée au balayage suivant sans jamais doubler le coût.
 *
 * · `refute` — voir `PALIERS_REFUTE_JOURS` : ce délai-là n'est pas fixe, parce que la
 *   question qu'il encode n'a pas une seule réponse possible.
 *
 * ⚠️ RÉDUIRE UN DÉLAI N'ACCÉLÈRE RIEN TANT QUE LA FILE DE NEUFS N'EST PAS VIDE (mesuré le
 * 2026-08-17, demande de Marc). Les retentes passent APRÈS les jamais-essayées : avec 180
 * paires à explorer, ramener `indecis` à un jour n'aurait produit aucun essai de plus. Le
 * frein était le budget par passe, pas la patience. C'est lui qui a été corrigé.
 */
export const DELAIS_RETENTE_JOURS = {
  indecis: 3,
  absent: 14,
} as const;

/**
 * Le délai de retente d'un RÉFUTÉ, selon le nombre de réfutations d'affilée.
 *
 * ⚠️ POURQUOI CE DÉLAI ESCALADE AU LIEU D'ÊTRE FIXE — décision Marc, 2026-08-17.
 *
 * `verifierAts` rend `refute` sur une seule constatation : « il y a des offres, aucune dans
 * la région ». Or cette constatation recouvre DEUX situations que rien ne distingue dans la
 * réponse elle-même :
 *
 * · un HOMONYME — `recruitee/ace` et `recruitee/robert` répondent avec des postes à
 *   Amsterdam. Le jeton appartient à quelqu'un d'autre, et ça ne changera pas.
 * · un BOARD MONDIAL LÉGITIME — `alstom`, `honeywell`, `domtar`, `labatt`, `dexterra`. Le
 *   jeton désigne la BONNE entreprise ; elle n'affichait simplement aucun poste au Québec
 *   ce jour-là. Elle en affichera un le mois prochain (Honeywell publie bien ici : il y en
 *   a une dans le suivi).
 *
 * Un délai fixe de soixante jours était calibré sur la première situation SEULE. Appliqué à
 * la seconde, il mettait deux mois de côté les plus gros employeurs de la liste — c'est-à-dire
 * exactement ceux qu'on veut surveiller. La leçon de la §7 (« un délai de retente encode une
 * PRÉMISSE : quand elle tombe, le délai doit tomber avec ») s'appliquait à une prémisse qui
 * n'était vraie que la moitié du temps.
 *
 * L'asymétrie des coûts tranche : une retente inutile coûte UNE requête ; un board mondial
 * mis à l'étagère coûte deux mois sans une cible majeure. On revient donc vite au premier
 * refus, et on ne s'éloigne qu'à mesure que la série confirme l'hypothèse de l'homonyme.
 *
 * Trois réfutations d'affilée, c'est plus de deux mois d'observation (7 + 21) : à ce
 * moment-là, « aucune offre régionale » n'est plus un hasard de calendrier.
 */
export const PALIERS_REFUTE_JOURS: readonly number[] = [7, 21, 60];

/**
 * Le délai avant de retenter cette paire, d'après ce qu'on a appris.
 *
 * PURE. Le seul endroit qui traduit un essai en délai — `planifierDecouverte` l'appelle,
 * les tests aussi, et personne ne recopie la table.
 */
export function delaiRetenteJours(essai: Pick<EssaiAts, "verdict" | "refus">): number {
  if (essai.verdict !== "refute") return DELAIS_RETENTE_JOURS[essai.verdict];
  // Une entrée sans compteur est une PREMIÈRE réfutation : c'est le cas des essais écrits
  // avant l'existence du champ, et celui d'un état vide. Jamais le palier le plus long.
  const rang = Math.max(1, essai.refus ?? 1);
  return PALIERS_REFUTE_JOURS[Math.min(rang, PALIERS_REFUTE_JOURS.length) - 1]!;
}

/**
 * Plafond d'essais par passe.
 *
 * Douze, dérivé du bassin réel : 36 entreprises cibles × 5 familles = 180 paires, donc un
 * premier balayage complet en 15 jours. À six, il fallait un MOIS pour découvrir la
 * première page carrières — trop lent pour une recherche d'emploi.
 *
 * ⚠️ CE N'EST PAS CE PLAFOND-CI QUI BORNE LE TEMPS. Voir `MAX_ESSAIS_PAR_FAMILLE` : c'est
 * lui la borne réelle, parce que le coût se paie par HÔTE. Monter celui-ci sans monter
 * l'autre n'ajoute aucun essai (leçon `[CARTE-03]` : un plafond « configurable » rendu
 * inopérant par un cap plus bas en aval — mesuré ici, pas supposé).
 */
export const MAX_ESSAIS_PAR_PASSE = 12;

/**
 * Plafond d'essais sur UNE MÊME famille d'ATS par passe — et c'est LUI la vraie borne.
 *
 * ⚠️ CE NOMBRE EST UN CALCUL, PAS UN GOÛT. Les cinq familles sont cinq services distincts :
 * on peut les interroger en parallèle entre eux, mais on reste en série chez chacun, par
 * politesse envers un service qui ne nous doit rien. Le pire cas d'une passe est donc
 * `MAX_ESSAIS_PAR_FAMILLE × DELAI_MAX_MS`, soit 3 × 8 s = 24 s — sous le mur de 60 s de la
 * fonction, en laissant la place à l'ingestion, aux distances et aux bornes qui partagent
 * la même passe.
 *
 * Sans ce plafond, la borne ne serait qu'ACCIDENTELLE : le jour où seule une famille aurait
 * du travail en attente, les douze essais tomberaient sur le même hôte — 96 s en série,
 * bien au-delà du mur, et la passe entière mourrait sans écrire son état. C'est exactement
 * la panne « Task timed out » déjà vécue sur `/carte`.
 *
 * Monter `MAX_ESSAIS_PAR_PASSE` sans monter celui-ci ne sert donc à rien : c'est le produit
 * `familles × MAX_ESSAIS_PAR_FAMILLE` qui plafonne réellement (ici 15).
 */
export const MAX_ESSAIS_PAR_FAMILLE = 3;

/** Une tentative à faire : une entreprise, une famille d'ATS. */
export interface EssaiAFaire {
  entreprise: string;
  famille: FamilleAts;
}

function joursEcoules(depuis: string, aujourdhui: string): number {
  const a = Date.parse(`${depuis}T00:00:00Z`);
  const b = Date.parse(`${aujourdhui}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.floor((b - a) / 86_400_000);
}

/**
 * Que tenter aujourd'hui ?
 *
 * PURE. Elle ne sait ni ce qui répondra, ni ce qui existe : elle ordonne des essais.
 *
 * L'ordre n'est pas arbitraire — les entreprises JAMAIS essayées passent avant les retentes.
 * Sans cette priorité, une poignée d'`indecis` qui reviennent tous les trois jours
 * mangeraient tout le budget et le reste de la liste ne serait jamais exploré : le même
 * piège de famine que la veille a déjà connu entre ses étapes.
 *
 * @param entreprises  Les noms à résoudre (cibles + employeurs déjà vus en offre).
 * @param familles     Les familles d'ATS à tenter.
 * @param essais       Ce qu'on a déjà appris.
 * @param dejaResolues Les entreprises déjà inscrites : on ne les retente jamais.
 * @param aujourdhui   AAAA-MM-JJ, dans le fuseau de Marc — un PARAMÈTRE, jamais l'horloge.
 * @param max          Plafond d'essais pour la passe.
 * @param maxParFamille Plafond d'essais sur un même hôte — la borne de temps réelle.
 */
export function planifierDecouverte(
  entreprises: readonly string[],
  familles: readonly FamilleAts[],
  essais: readonly EssaiAts[],
  dejaResolues: readonly string[],
  aujourdhui: string,
  max: number = MAX_ESSAIS_PAR_PASSE,
  maxParFamille: number = MAX_ESSAIS_PAR_FAMILLE,
): EssaiAFaire[] {
  const resolues = new Set(dejaResolues.map((n) => n.toLowerCase()));
  const parCle = new Map(essais.map((e) => [`${e.entreprise.toLowerCase()}|${e.famille}`, e]));

  // ⚠️ LES NOMS ARRIVENT EN DOUBLE, ET UN DOUBLON COÛTE UNE REQUÊTE RÉELLE.
  //
  // L'appelant compose sa liste en concaténant les cibles de Marc et les employeurs croisés
  // en offre ; le second lot est dédoublonné, mais rien ne l'est ENTRE les deux — et les
  // deux se recoupent forcément, puisqu'une cible qui embauche finit par publier une offre.
  // Sans cette ligne, « Laserax » présent des deux côtés planifiait dix essais pour cinq
  // paires distinctes (mesuré) : cinq requêtes en double vers des services qui ne nous
  // doivent rien, prises sur les douze essais du jour.
  //
  // Dédoublonner ICI plutôt que chez l'appelant : c'est cette fonction qui a la charge
  // d'ORDONNER et de BORNER, elle le fait déjà contre `dejaResolues` et contre les essais
  // connus, et le faire ici couvre tout appelant présent ou futur. La casse est ignorée,
  // comme partout ailleurs dans ce fichier. La PREMIÈRE graphie l'emporte — donc celle des
  // cibles, qui portent l'orthographe de référence, sur celle rapportée par une annonce.
  const vus = new Set<string>();
  const aExplorer = entreprises.filter((n) => {
    const cle = n.toLowerCase();
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });

  const neufs: EssaiAFaire[] = [];
  const retentes: { essai: EssaiAFaire; anciennete: number }[] = [];

  for (const entreprise of aExplorer) {
    // Une entreprise déjà résolue chez UNE famille n'a plus rien à donner : on ne cherche
    // pas ses éventuelles autres pages carrières, ce serait payer pour un doublon.
    if (resolues.has(entreprise.toLowerCase())) continue;

    for (const famille of familles) {
      const connu = parCle.get(`${entreprise.toLowerCase()}|${famille}`);
      if (connu === undefined) {
        neufs.push({ entreprise, famille });
        continue;
      }
      const ecoules = joursEcoules(connu.le, aujourdhui);
      if (ecoules >= delaiRetenteJours(connu)) {
        retentes.push({ essai: { entreprise, famille }, anciennete: ecoules });
      }
    }
  }

  // Parmi les retentes, les plus anciennes d'abord : c'est ce qui garantit qu'aucune ne
  // reste au fond de la file indéfiniment.
  retentes.sort((a, b) => b.anciennete - a.anciennete);

  // Le plafond par FAMILLE s'applique à l'ordre déjà établi : on garde la priorité
  // (neufs d'abord, puis retentes les plus anciennes) et on écarte ce qui ferait déborder
  // un hôte. Écarter ici plutôt que trier autrement préserve l'anti-famine.
  const parFamille = new Map<FamilleAts, number>();
  const retenus: EssaiAFaire[] = [];
  for (const essai of [...neufs, ...retentes.map((r) => r.essai)]) {
    if (retenus.length >= Math.max(0, max)) break;
    const dejaVus = parFamille.get(essai.famille) ?? 0;
    if (dejaVus >= maxParFamille) continue;
    parFamille.set(essai.famille, dejaVus + 1);
    retenus.push(essai);
  }
  return retenus;
}

/**
 * Inscrit ce qu'un essai a appris.
 *
 * Rend une NOUVELLE liste : la mémoire d'essais est une donnée d'état, et la muter en place
 * rendrait intestable l'ordre des écritures.
 *
 * ⚠️ `confirme` RETIRE l'entrée au lieu d'en poser une : l'entreprise passe dans
 * `veille-ats` et n'a plus rien à faire dans la mémoire des échecs. La laisser des deux
 * côtés ferait diverger les deux listes au premier oubli.
 */
export function appliquerVerdict(
  essais: readonly EssaiAts[],
  entreprise: string,
  famille: FamilleAts,
  verdict: "confirme" | "refute" | "indecis" | "absent",
  jour: string,
  raison?: string,
): EssaiAts[] {
  const memePaire = (e: EssaiAts) =>
    e.entreprise.toLowerCase() === entreprise.toLowerCase() && e.famille === famille;
  const precedent = essais.find(memePaire);
  const autres = essais.filter((e) => !memePaire(e));
  if (verdict === "confirme") return autres;

  // ⚠️ LA SÉRIE SE COMPTE, ET ELLE SE ROMPT. Le compteur ne monte que sur des réfutations
  // CONSÉCUTIVES : si la paire a rendu autre chose entre-temps (l'entreprise a publié, le
  // service a cessé de répondre), l'hypothèse « ce jeton est à quelqu'un d'autre » n'est
  // plus étayée par la série et on repart du palier le plus court. Sans cette remise à
  // zéro, une paire finirait au palier de soixante jours par accumulation d'accidents.
  const refus =
    verdict === "refute" ? (precedent?.verdict === "refute" ? (precedent.refus ?? 1) + 1 : 1) : 0;

  return [
    ...autres,
    {
      entreprise,
      famille,
      verdict,
      le: jour,
      ...(raison ? { raison } : {}),
      ...(verdict === "refute" ? { refus } : {}),
    },
  ];
}

/**
 * Budget de temps de la découverte DANS la passe.
 *
 * ⚠️ CE N'EST PAS UNE PRÉCAUTION, C'EST UNE ADDITION. La passe partage un mur de fonction de
 * 60 s. La localisation en réserve déjà 25 s (`BUDGET_GEOCODAGE_CRON_MS`), l'ingestion prend
 * le sien, et le pire cas théorique de la découverte est de 24 s (3 essais × 8 s sur l'hôte
 * le plus chargé). 24 + 25 + l'ingestion dépasse le mur : la passe mourrait sans écrire son
 * état, et c'est l'intake de Marc qui en pâtirait, pas la découverte.
 *
 * Dix secondes, donc, vérifiées ENTRE les essais. En pratique un ATS répond en moins d'une
 * seconde et le budget ne mord jamais ; il n'existe que pour le jour où l'un d'eux traîne.
 * Et quand il mord, il le DIT (`sautes` dans le compte) — un plafond tu se lirait comme une
 * couverture complète.
 */
export const BUDGET_DECOUVERTE_MS = 10_000;

/** Ce qu'une passe de découverte a produit. Chaque nombre sert à un diagnostic différent. */
export interface CompteDecouverte {
  essais: number;
  confirmees: number;
  refutees: number;
  indecis: number;
  absentes: number;
  /** Essais planifiés mais NON tentés, faute de budget. Zéro en régime normal. */
  sautes: number;
}

/**
 * Exécute les essais planifiés et rend le nouvel état.
 *
 * ⚠️ PARALLÈLE ENTRE FAMILLES, SÉRIE CHEZ CHACUNE. C'est ce qui rend le pire cas tenable
 * (`MAX_ESSAIS_PAR_FAMILLE × DELAI_MAX_MS`) tout en restant poli avec chaque service : on
 * n'ouvre jamais deux requêtes simultanées vers le même hôte. Tout mettre en parallèle
 * serait plus rapide et impoli ; tout mettre en série tiendrait 96 s et tuerait la passe.
 *
 * Elle ne LÈVE jamais : un service tiers indisponible ne doit pas emporter l'ingestion.
 * Un essai qui échoue rend `absent`, ce qui est déjà le comportement de `verifierAts`.
 *
 * @param verifier Injecté pour que cette fonction s'éprouve sans réseau.
 */
export async function executerDecouverte(
  aFaire: readonly EssaiAFaire[],
  essaisConnus: readonly EssaiAts[],
  atsResolus: readonly AtsEntreprise[],
  jour: string,
  verifier: (
    famille: FamilleAts,
    jeton: string,
    entreprise: string,
  ) => Promise<{ verdict: "confirme" | "refute" | "indecis" | "absent"; raison?: string }>,
  jeton: (nom: string) => string,
  budgetMs: number = BUDGET_DECOUVERTE_MS,
  maintenant: () => number = Date.now,
): Promise<{ ats: AtsEntreprise[]; essais: EssaiAts[]; compte: CompteDecouverte }> {
  const echeance = maintenant() + budgetMs;
  const parFamille = new Map<FamilleAts, EssaiAFaire[]>();
  for (const e of aFaire) {
    const liste = parFamille.get(e.famille) ?? [];
    liste.push(e);
    parFamille.set(e.famille, liste);
  }

  const resultats = await Promise.all(
    [...parFamille.entries()].map(async ([famille, liste]) => {
      const sortie: { essai: EssaiAFaire; verdict: string; raison?: string }[] = [];
      // En SÉRIE ici : une seule requête à la fois vers cet hôte.
      for (const essai of liste) {
        // Le budget se vérifie AVANT de lancer, jamais après : une fois la requête partie,
        // on paie son délai quoi qu'il arrive.
        if (maintenant() >= echeance) break;
        const r = await verifier(famille, jeton(essai.entreprise), essai.entreprise);
        sortie.push({ essai, verdict: r.verdict, raison: r.raison });
      }
      return sortie;
    }),
  );

  let essais = [...essaisConnus];
  const ats = [...atsResolus];
  const compte: CompteDecouverte = {
    essais: aFaire.length,
    confirmees: 0,
    refutees: 0,
    indecis: 0,
    absentes: 0,
    sautes: 0,
  };

  for (const { essai, verdict, raison } of resultats.flat()) {
    const v = verdict as "confirme" | "refute" | "indecis" | "absent";
    essais = appliquerVerdict(essais, essai.entreprise, essai.famille, v, jour, raison);
    if (v === "confirme") {
      compte.confirmees += 1;
      // L'inscription est ce qui fait entrer l'entreprise dans la veille quotidienne.
      ats.push({
        entreprise: essai.entreprise,
        famille: essai.famille,
        jeton: jeton(essai.entreprise),
      });
    } else if (v === "refute") compte.refutees += 1;
    else if (v === "indecis") compte.indecis += 1;
    else compte.absentes += 1;
  }

  compte.sautes =
    aFaire.length - (compte.confirmees + compte.refutees + compte.indecis + compte.absentes);

  return { ats, essais, compte };
}
