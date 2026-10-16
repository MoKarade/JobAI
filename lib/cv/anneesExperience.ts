// lib/cv/anneesExperience.ts — les années d'expérience se CALCULENT depuis les dates du CV.
//
// ── POURQUOI CE MODULE EXISTE (JobAI#154, ADR-0027) ─────────────────────────────────
//
// Avant, le modèle estimait « les années d'expérience pertinente » et ce nombre réglait la
// séniorité de TOUTES les offres (`paliersSenioriteDepuisAnnees`). Un nombre estimé par un
// modèle ne se refait pas à la main : si Marc trouve 9 là où le CV en montre 11, il n'a aucun
// moyen de dire d'où vient l'écart. Désormais le modèle ne fait que RECOPIER les dates de
// chaque poste (il sait lire, pas compter), et ce code compte : chevauchements compris, et en
// montrant chaque ligne du calcul.
//
// ⚠️ UNE DATE ILLISIBLE N'EST JAMAIS DEVINÉE. Un poste sans début, sans fin ou dont la date
// ne se lit pas est EXCLU du total, et le détail le dit en toutes lettres. Compter ce qu'on ne
// peut pas lire reviendrait à fabriquer un nombre qui déplace toutes les notes (garde-fou
// n°3) ; l'exclure sous-estime, et une sous-estimation se voit et se corrige au CV.
//
// ⚠️ UNE ANNÉE SEULE (« 2023 ») N'EST PAS UN MOIS. Elle est lue comme JUILLET — le milieu de
// l'année, qui rend l'erreur symétrique (au plus 6 mois dans un sens ou dans l'autre) — et la
// ligne est marquée « année seule » pour que l'approximation ne passe pas pour une mesure.
//
// ⚠️ LE TOTAL EST CELUI DE L'EXPÉRIENCE PROFESSIONNELLE, hors stages. Le modèle n'est plus
// juge de ce qui est « pertinent » : c'était l'opinion qu'on ne pouvait pas vérifier.
//
// Fonctions PURES : l'horloge est un paramètre.

/** Un poste tel que l'extraction le rend : les dates restent du texte, telles qu'écrites. */
export interface PosteCv {
  titre: string;
  debut: string;
  fin: string;
  /** Un stage ne compte pas dans l'expérience professionnelle. */
  estStage?: boolean;
}

/** Un mois, compté depuis l'an 0 : `année × 12 + (mois − 1)`. */
type IndexMois = number;

interface DateLue {
  index: IndexMois;
  /** `true` quand le CV ne donne que l'année. */
  anneeSeule: boolean;
}

/** Le mois par lequel une année seule est lue : juillet (indice 7). */
const MOIS_ANNEE_SEULE = 7;

const MOIS: Readonly<Record<string, number>> = {
  janvier: 1, janv: 1, jan: 1, january: 1,
  fevrier: 2, fev: 2, feb: 2, february: 2,
  mars: 3, mar: 3, march: 3,
  avril: 4, avr: 4, apr: 4, april: 4,
  mai: 5, may: 5,
  juin: 6, jun: 6, june: 6,
  juillet: 7, juil: 7, jul: 7, july: 7,
  aout: 8, aou: 8, aug: 8, august: 8,
  septembre: 9, sept: 9, sep: 9, september: 9,
  octobre: 10, oct: 10, october: 10,
  novembre: 11, nov: 11, november: 11,
  decembre: 12, dec: 12, december: 12,
};

const ABREVIATIONS = [
  "janv.", "févr.", "mars", "avr.", "mai", "juin",
  "juil.", "août", "sept.", "oct.", "nov.", "déc.",
] as const;

/** Les formules qui veulent dire « jusqu'à aujourd'hui ». Valables pour la FIN seulement. */
const PRESENT =
  /^(present|aujourd ?hui|actuel|actuelle|actuellement|en cours|a ce jour|ce jour|current|currently|now|ongoing|to date)$/;

function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/[.,;()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lit une date de CV. `null` = illisible (jamais « je suppose »).
 *
 * Formes lues : « Avril 2023 », « avr. 2023 », « April 2023 », « 2023-04 », « 04/2023 »,
 * « 2023 ». Une saison (« été 2023 ») ou un jour (« 14 avril 2023 », où le jour est ignoré
 * puisque seul le mois compte) : le jour est toléré, la saison ne l'est pas.
 */
export function lireDateCv(texte: string): DateLue | null {
  const t = normaliser(texte);
  if (t === "") return null;

  // 2023-04 · 2023/04 · 04/2023 · 04-2023
  const num = /^(\d{4})[-/ ](\d{1,2})$/.exec(t) ?? /^(\d{1,2})[-/ ](\d{4})$/.exec(t);
  if (num) {
    const [a, b] = [Number(num[1]), Number(num[2])];
    const annee = a > 31 ? a : b;
    const mois = a > 31 ? b : a;
    return annee >= 1950 && annee <= 2100 && mois >= 1 && mois <= 12
      ? { index: annee * 12 + (mois - 1), anneeSeule: false }
      : null;
  }

  const annee = /\b(19[5-9]\d|20\d\d)\b/.exec(t);
  if (!annee) return null;
  const sansAnnee = t.replace(annee[0], " ").trim();

  // Une année seule : rien d'autre que, au plus, un mot de liaison.
  if (sansAnnee === "") {
    return { index: Number(annee[1]) * 12 + (MOIS_ANNEE_SEULE - 1), anneeSeule: true };
  }

  const mots = sansAnnee.split(" ").filter((m) => m !== "" && !/^\d{1,2}(er)?$/.test(m));
  const moisTrouves = mots.map((m) => MOIS[m]).filter((m): m is number => m !== undefined);
  // Un seul mois, et aucun autre mot : « avril 2023 » (le jour « 14 » a été retiré plus haut).
  if (moisTrouves.length === 1 && mots.length === 1) {
    return { index: Number(annee[1]) * 12 + (moisTrouves[0]! - 1), anneeSeule: false };
  }
  return null;
}

/** La fin d'un poste : une date, ou « présent » (= le mois de `aujourdhui`). */
function lireFin(texte: string, aujourdhui: IndexMois): DateLue | null {
  const t = normaliser(texte);
  if (PRESENT.test(t)) return { index: aujourdhui, anneeSeule: false };
  return lireDateCv(texte);
}

function nommerMois(index: IndexMois): string {
  return `${ABREVIATIONS[index % 12]} ${Math.floor(index / 12)}`;
}

type StatutLigne = "compte" | "exclu";

interface LigneCalcul {
  titre: string;
  statut: StatutLigne;
  /** Pourquoi le poste est exclu. Vide quand il compte. */
  raison: string;
  /** Mois comptés pour ce poste, début et fin INCLUS. 0 si exclu. */
  mois: number;
  /** Au moins une des deux dates est une année seule. */
  approximatif: boolean;
  /** Le texte du calcul de cette ligne, tel qu'affiché. */
  texte: string;
}

export interface CalculAnnees {
  /** Années, à une décimale. `null` = aucun poste n'a pu être compté (jamais « zéro »). */
  annees: number | null;
  /** Mois distincts, chevauchements retirés. */
  mois: number;
  /** Somme des mois de chaque poste, avant retrait des chevauchements. */
  moisBruts: number;
  chevauchementMois: number;
  lignes: LigneCalcul[];
  /** Le détail complet, en une seule ligne, prêt à servir de provenance. */
  detail: string;
}

/** Longueur maximale du détail gardé comme provenance. */
export const LONGUEUR_MAX_DETAIL = 1500;

const court = (s: string, n = 40) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

/**
 * Compte les années d'expérience professionnelle d'un parcours. PURE.
 *
 * Règle de comptage : un poste va du mois de début au mois de fin, les DEUX inclus
 * (« avril 2023 – mars 2024 » = 12 mois). Les mois couverts par deux postes à la fois ne
 * comptent qu'une fois.
 */
export function calculerAnnees(parcours: readonly PosteCv[], aujourdhui: Date): CalculAnnees {
  const maintenant: IndexMois = aujourdhui.getUTCFullYear() * 12 + aujourdhui.getUTCMonth();
  const lignes: LigneCalcul[] = [];
  const intervalles: { de: IndexMois; a: IndexMois }[] = [];

  for (const poste of parcours) {
    const titre = court(poste.titre.trim() || "poste sans titre");
    const exclure = (raison: string): void => {
      lignes.push({
        titre,
        statut: "exclu",
        raison,
        mois: 0,
        approximatif: false,
        texte: `${titre} : exclu (${raison})`,
      });
    };

    if (poste.estStage === true) {
      exclure("stage");
      continue;
    }
    const debut = lireDateCv(poste.debut);
    if (debut === null) {
      exclure(poste.debut.trim() === "" ? "début absent" : "début illisible");
      continue;
    }
    const fin = lireFin(poste.fin, maintenant);
    if (fin === null) {
      exclure(poste.fin.trim() === "" ? "fin absente" : "fin illisible");
      continue;
    }
    if (debut.index > maintenant) {
      exclure("début dans le futur");
      continue;
    }
    // Une fin postérieure à aujourd'hui (fin de contrat annoncée) n'a pas encore été travaillée.
    const finRetenue = Math.min(fin.index, maintenant);
    if (finRetenue < debut.index) {
      exclure("fin avant le début");
      continue;
    }

    const mois = finRetenue - debut.index + 1;
    const approximatif = debut.anneeSeule || fin.anneeSeule;
    intervalles.push({ de: debut.index, a: finRetenue });
    lignes.push({
      titre,
      statut: "compte",
      raison: "",
      mois,
      approximatif,
      texte: `${titre} : ${nommerMois(debut.index)} → ${nommerMois(finRetenue)} = ${mois} mois${
        approximatif ? " (année seule, ±6 mois)" : ""
      }`,
    });
  }

  if (intervalles.length === 0) {
    const exclus = lignes.filter((l) => l.statut === "exclu").map((l) => l.texte);
    const detail =
      exclus.length === 0
        ? "Aucun poste daté dans le CV : les années d'expérience ne sont pas établies."
        : `Aucun poste n'a pu être compté : ${exclus.join(" · ")}.`;
    return {
      annees: null,
      mois: 0,
      moisBruts: 0,
      chevauchementMois: 0,
      lignes,
      detail: detail.slice(0, LONGUEUR_MAX_DETAIL),
    };
  }

  const moisBruts = intervalles.reduce((s, i) => s + (i.a - i.de + 1), 0);
  const tries = [...intervalles].sort((x, y) => x.de - y.de);
  let mois = 0;
  let courant = { ...tries[0]! };
  for (const i of tries.slice(1)) {
    if (i.de <= courant.a) {
      courant.a = Math.max(courant.a, i.a);
    } else {
      mois += courant.a - courant.de + 1;
      courant = { ...i };
    }
  }
  mois += courant.a - courant.de + 1;

  const chevauchementMois = moisBruts - mois;
  const annees = Math.round((mois / 12) * 10) / 10;
  const total = `${String(annees).replace(".", ",")} ans`;
  const parties = [
    "Calcul du code sur les dates du CV (mois de début et de fin inclus)",
    ...lignes.map((l) => l.texte),
    ...(chevauchementMois > 0 ? [`chevauchements retirés : ${chevauchementMois} mois`] : []),
    `total : ${mois} mois = ${total}`,
  ];
  return {
    annees,
    mois,
    moisBruts,
    chevauchementMois,
    lignes,
    detail: parties.join(" · ").slice(0, LONGUEUR_MAX_DETAIL),
  };
}
