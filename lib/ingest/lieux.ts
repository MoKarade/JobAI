// lib/ingest/lieux.ts — juger un lieu par la MESURE, plus par la liste blanche.
//
// POURQUOI CE FICHIER EXISTE — 47 offres jetées en une passe, le 2026-08-17
//
// `situer()` (lib/ingest/region.ts) tranche par une liste blanche de municipalités : un nom
// reconnu entre, tout le reste sort en « lieu inconnu ». La liste a été écrite pour un rayon
// de 50 km, élargie à la main quand le rayon est passé à 75, et elle compte aujourd'hui plus
// de cent trente entrées. Elle reste un PARI : elle ne connaît que les noms qu'on a pensé à
// y mettre, et une ville de la région écrite d'une façon qu'on n'a pas prévue est refusée
// aussi sûrement qu'un poste à Vancouver. Le compte rendu du 17 août en a jeté quarante-sept
// d'un coup, sans que rien ne dise lesquelles.
//
// Élargir la liste une fois de plus aurait été le même pari, en plus gros. La question
// « cette ville est-elle à moins de 75 km ? » a une RÉPONSE MESURABLE, et le géocodeur qui
// la donne est déjà là, déjà borné, déjà utilisé pour les municipalités cibles.
//
// CE QUE LE REGISTRE GARANTIT
//   - Chaque nom n'est demandé QU'UNE FOIS : le verdict est conservé et relu à chaque passe.
//     Sans ça, la même centaine de chaînes repartirait vers Nominatim chaque matin.
//   - Un nom que le géocodeur ne connaît pas n'est pas condamné à vie : il est retenté, à
//     des paliers qui s'espacent. Un garde qui met un lieu hors circuit doit avoir un chemin
//     de retour, sinon un incident transitoire devient une perte définitive et silencieuse.
//   - La décision est PURE et la distance est INJECTÉE : le domicile ne traverse pas cette
//     frontière autrement que par la fonction qu'on lui passe (garde-fou n°1).
//
// CE QU'IL NE FAIT PAS
// Il ne remplace pas la liste blanche, il la COMPLÈTE. Un nom déjà reconnu ne coûte aucune
// requête — la mesure ne sert qu'aux noms sur lesquels la liste n'a rien à dire.

import type { Point } from "../geocodage";

/**
 * Ce qu'on a conclu d'un nom de lieu.
 *
 * `introuvable` n'est PAS un troisième verdict géographique : c'est l'aveu qu'on n'a pas pu
 * juger. Le confondre avec « hors région » condamnerait à vie une ville bien réelle sur une
 * panne réseau d'une matinée.
 */
export type VerdictLieu = "dans-la-region" | "hors-region" | "introuvable";

export interface LieuJuge {
  verdict: VerdictLieu;
  /** Distance mesurée du centre de ce lieu au domicile, arrondie. `null` si introuvable. */
  km: number | null;
  /** Jour du dernier jugement (AAAA-MM-JJ). */
  le: string;
  /** Combien de fois le géocodeur a été interrogé sur ce nom. Sert aux paliers de retente. */
  essais: number;
}

/** Le registre, par nom de lieu NORMALISÉ (`normaliserLieu`). */
export type RegistreLieux = Record<string, LieuJuge>;

/**
 * Marge ajoutée au rayon pour accepter une municipalité.
 *
 * ⚠️ ELLE N'EST PAS UN ASSOUPLISSEMENT, C'EST UNE CORRECTION D'ÉCHELLE. Ce qu'on mesure est
 * le CENTRE d'une municipalité ; l'employeur, lui, est quelque part DANS cette municipalité —
 * et certaines font quarante kilomètres de long. Juger au rayon exact refuserait en silence
 * les offres du bord proche d'une grande municipalité dont le centre est un peu trop loin.
 *
 * L'arbitrage est celui des coûts asymétriques : une offre refusée à tort est invisible pour
 * toujours — Marc ne saura jamais qu'elle a existé. Une offre acceptée un peu large arrive
 * dans la liste avec sa VRAIE distance, mesurée ensuite depuis la position de l'employeur, et
 * elle coûte une ligne qu'il écarte d'un coup d'œil.
 */
export const MARGE_LIEU_KM = 15;

/**
 * Paliers de retente d'un lieu INTROUVABLE, en jours, selon le nombre d'essais.
 *
 * Ils s'espacent parce que la prémisse s'affaiblit : après trois échecs, « OpenStreetMap ne
 * connaît pas ce nom » cesse d'être une hypothèse transitoire. Ils ne s'arrêtent jamais tout
 * à fait — un nom peut entrer dans la base cartographique, et une porte qui se referme pour
 * de bon est exactement ce qu'on reproche à la liste blanche.
 */
export const PALIERS_RETENTE_LIEU_JOURS = [3, 14, 60] as const;

/** Différence en jours entre deux dates AAAA-MM-JJ. Négative si `b` précède `a`. */
function joursEntre(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : 0;
}

/**
 * Faut-il (re)demander ce lieu au géocodeur ?
 *
 * Jamais pour un verdict FERME : une ville ne se rapproche pas. Uniquement pour un
 * `introuvable`, une fois son palier écoulé.
 */
export function aJuger(juge: LieuJuge | undefined, aujourdhui: string): boolean {
  if (juge === undefined) return true;
  if (juge.verdict !== "introuvable") return false;

  const palier =
    PALIERS_RETENTE_LIEU_JOURS[
      Math.min(juge.essais - 1, PALIERS_RETENTE_LIEU_JOURS.length - 1)
    ] ?? PALIERS_RETENTE_LIEU_JOURS[PALIERS_RETENTE_LIEU_JOURS.length - 1]!;
  return joursEntre(juge.le, aujourdhui) >= palier;
}

/**
 * Le verdict que porte une distance mesurée.
 *
 * PURE, et volontairement minuscule : c'est la ligne qui décide si une offre entre ou non
 * dans le suivi de Marc, donc celle qu'on veut pouvoir lire d'un coup d'œil et tester seule.
 */
export function deciderLieu(km: number, rayonMaxKm: number): VerdictLieu {
  if (!Number.isFinite(km) || km < 0) return "introuvable";
  return km <= rayonMaxKm + MARGE_LIEU_KM ? "dans-la-region" : "hors-region";
}

/**
 * Met le registre à jour à partir de ce qu'une passe de géocodage a rendu.
 *
 * PURE : `distance` est injectée, donc le domicile ne traverse pas cette frontière.
 * Ce qui n'est ni trouvé ni déclaré introuvable — une passe coupée par son budget, une
 * panne — n'est PAS touché : le registre ne doit jamais enregistrer un verdict qu'on n'a pas
 * mesuré, et la passe suivante reprendra ces noms-là intacts.
 */
export function appliquerJugements(
  registre: RegistreLieux,
  resultat: { trouvees: readonly (Point & { nom: string })[]; introuvables: readonly string[] },
  distance: (p: Point) => number,
  rayonMaxKm: number,
  aujourdhui: string,
): RegistreLieux {
  const suivant: RegistreLieux = { ...registre };

  for (const t of resultat.trouvees) {
    const km = Math.round(distance({ lat: t.lat, lon: t.lon }) * 10) / 10;
    const verdict = deciderLieu(km, rayonMaxKm);
    suivant[t.nom] = {
      verdict,
      // Une distance qu'on n'a pas su calculer ne s'écrit pas : `deciderLieu` a déjà rendu
      // « introuvable » dans ce cas, et un `km` fantaisiste à côté serait pire que rien.
      km: verdict === "introuvable" ? null : km,
      le: aujourdhui,
      essais: (registre[t.nom]?.essais ?? 0) + 1,
    };
  }

  for (const nom of resultat.introuvables) {
    suivant[nom] = {
      verdict: "introuvable",
      km: null,
      le: aujourdhui,
      essais: (registre[nom]?.essais ?? 0) + 1,
    };
  }

  return suivant;
}

/**
 * Les verdicts FERMES du registre, sous la forme que `situer` sait consulter.
 *
 * Les `introuvable` sont écartés : ils ne disent rien sur le lieu, seulement sur nous. Les
 * laisser entrer ferait passer « on n'a pas pu juger » pour « ce n'est pas dans la région »,
 * et c'est précisément la confusion que le registre existe pour éviter.
 */
export function verdictsFermes(registre: RegistreLieux): Map<string, "dans-la-region" | "hors-region"> {
  const m = new Map<string, "dans-la-region" | "hors-region">();
  for (const [nom, juge] of Object.entries(registre)) {
    if (juge.verdict === "introuvable") continue;
    m.set(nom, juge.verdict);
  }
  return m;
}
