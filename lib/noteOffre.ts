// lib/noteOffre.ts — LA façon de noter une offre. Une seule, pour tous les chemins.
//
// ── POURQUOI CE MODULE EXISTE (JobAI#149, ADR-0025) ─────────────────────────────────
//
// La note d'une offre se calculait de trois façons qui ne s'accordaient pas : l'ingestion avec le
// profil PAR DÉFAUT, le code de profession et les conditions d'emploi ; la re-notation après une
// validation de CV avec le profil de Marc mais SANS code ni conditions ; la mesure de distance
// avec le profil par défaut, sans code non plus. La même offre pouvait donc valoir 56, 41 ou
// 29 selon le moment, et la mesure du 16/10 (JobAI#148) a montré que l'écart n'était pas un cas
// limite.
//
// ⚠️ UNE FONCTION, DES ENTRÉES QUI VIENNENT DE L'OFFRE. Tout ce que le barème lit est dans
// `EntreeNote`, et tout y est ENREGISTRÉ avec l'offre : titre, code de profession, type de poste,
// durée d'emploi, extrait d'annonce. L'ingestion note l'offre qu'elle va écrire, avec les mêmes
// champs que ceux qui seront relus plus tard — c'est ce qui rend l'égalité vraie par
// construction, pas par discipline.
//
// ⚠️ LE PROFIL ET LES MÉTIERS SONT DES PARAMÈTRES REQUIS, sans défaut. Un défaut permissif est
// exactement ce qui a fait diverger les chemins : chacun a pris le sien sans que rien ne le dise.

import { expurgerPII } from "./ingest/expurger";
import { computeScore, type DetailNote } from "./scoring";
import type { Profil } from "./profil";
import type { Offre } from "./types";

/**
 * La longueur de l'extrait d'annonce gardé avec l'offre.
 *
 * ⚠️ BORNÉE, PARCE QUE LE TEXTE N'A PAS À RESTER. La note lit des mots-clés, des années
 * d'expérience et des mentions de statut, qui se trouvent dans le début d'une annonce. 2 000
 * caractères × ~6 500 offres ≈ 13 Mo en base ; sans borne, le volume ne se contrôlerait plus.
 */
export const LONGUEUR_EXTRAIT_NOTE = 2000;

/**
 * L'extrait d'annonce que la note lira, à garder avec l'offre. PURE.
 *
 * ⚠️ NETTOYÉ AVANT D'ÊTRE GARDÉ (garde-fou n°1) : les noms et coordonnées de tiers qu'une
 * annonce mentionne sont retirés par `expurgerPII`, comme partout où ce texte est lu. Les
 * espaces sont repliés, pour que la borne compte du texte et non des sauts de ligne.
 */
export function extraitPourNote(description: string): string {
  const propre = expurgerPII(description).texte.replace(/\s+/g, " ").trim();
  return propre.length <= LONGUEUR_EXTRAIT_NOTE ? propre : propre.slice(0, LONGUEUR_EXTRAIT_NOTE);
}

/**
 * Le barème complet : le profil de Marc ET les métiers qu'il retient. Les deux ensemble, parce
 * que l'un sans l'autre note autrement (sans métiers, le domaine ne pèse rien).
 */
export interface Bareme {
  profil: Profil;
  metiers: readonly string[];
}

/** Ce que le barème lit d'une offre. Un sous-ensemble de `Offre`, pour que toute offre convienne. */
export type EntreeNote = Pick<Offre, "poste" | "km"> &
  Partial<Pick<Offre, "noc" | "typePoste" | "dureeEmploi" | "texteNote" | "notes">>;

/**
 * Le texte que le barème lit en plus du titre.
 *
 * L'extrait d'annonce quand l'offre en a un. Sinon — les offres écrites avant l'ADR-0025, la
 * saisie manuelle — sa note de provenance, et rien d'autre. Un seul repli pour tous les chemins.
 *
 * ⚠️ JAMAIS LES JUSTIFICATIONS (`raisons`). La mesure de distance les lisait ; elles sont pourtant
 * écrites APRÈS la note, à partir d'elle : l'ingestion y met « le titre et l'annonce portent à la
 * fois de la coordination et du contenu technique » dès que la note atteint 70. Les relire comme
 * du texte d'annonce fait voir « coordination » et « technique » partout où la note était déjà
 * haute — une note qui se justifie elle-même, et qui ne redescend plus.
 */
export function texteDeNotation(o: EntreeNote): string {
  // `!= null` et non « truthy » : un extrait VIDE est un extrait (annonce sans texte), pas une
  // absence — le traiter en absence ferait relire le repli à la re-notation et diverger.
  if (o.texteNote != null) return o.texteNote;
  return (o.notes ?? "").trim();
}

/**
 * Note une offre. PURE.
 *
 * `km` s'ajoute à l'entrée parce que la mesure de distance note l'offre AVEC la distance qu'elle
 * vient de calculer, avant qu'elle soit écrite ; les autres chemins passent celle de l'offre.
 */
export function noterOffre(
  o: EntreeNote,
  profil: Profil,
  metiers: readonly string[],
  km: number | null = o.km,
): DetailNote {
  return computeScore(
    {
      titre: o.poste,
      description: texteDeNotation(o),
      km,
      noc: o.noc ?? null,
      typePoste: o.typePoste ?? null,
      dureeEmploi: o.dureeEmploi ?? null,
    },
    profil,
    metiers,
  );
}
