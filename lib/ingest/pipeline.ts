// lib/ingest/pipeline.ts — de ce que les sources ont dit à ce qui entre dans le suivi.
//
// Fonctions PURES. Ce fichier ne contacte rien : il reçoit les récoltes, les met en forme,
// les dédoublonne, les note, et décide de ce qui mérite d'être suivi.
//
// TROIS DÉCISIONS, TOUTES RÉVERSIBLES ET TOUTES COMPTÉES
//   1. Dédoublonnage — la même offre paraît sur plusieurs sources ; une seule doit entrer.
//   2. Note — calculée par le barème existant, jamais estimée à l'œil.
//   3. Seuil — sous une note plancher, l'offre n'entre pas dans le suivi (décision de Marc,
//      2026-07-30). Elle est COMPTÉE et son motif est dit : une liste qui rétrécit sans
//      explication est pire qu'une liste longue.

import { computeScore } from "../scoring";
import { situer } from "./region";
import type { Offre } from "../types";
import type { OffreBrute } from "./types";

/**
 * Plancher d'ADÉQUATION AU RÔLE — la composante `fitRole` du barème, sur 40.
 *
 * ⚠️ POURQUOI PAS UN PLANCHER SUR LA NOTE TOTALE
 * Parce qu'il ne filtrerait rien. Mesuré : « Caissier », « Commis d'entrepôt » et
 * « Préposé à l'entretien ménager » notent tous 48 sur 100 — au-dessus d'un plancher à 45.
 * Les points accordés aux INCONNUES (distance non mesurée 10/20, salaire non affiché 9/15,
 * aucune exigence détectée 11/15) s'accumulent quel que soit le métier, et une offre sans
 * le moindre rapport avec le profil part déjà avec 40 points. Seul `fitRole` mesure
 * réellement l'adéquation.
 *
 * 14 sur 40 = au moins UN signal de rôle : du contenu technique, ou de la coordination.
 * C'est exactement la note d'un poste de technicien technique — le plancher de ce qui
 * mérite un regard. En dessous (8), il n'y a plus aucun signal.
 */
export const FIT_ROLE_PLANCHER = 14;

/** Ce qu'une passe a fait de chaque offre trouvée. */
export interface Tri {
  /** Prêtes à entrer dans le suivi : dédoublonnées, notées, au-dessus du plancher. */
  retenues: Offre[];
  /** Écartées faute de note. Comptées, pour que le rétrécissement soit visible. */
  souslePlancher: number;
  /** Doublons entre sources ou avec le suivi existant. */
  doublons: number;
  /** Écartées parce que trop loin — un compte DISTINCT du plancher. */
  horsRegion: number;
  /** Écartées faute de lieu exploitable. Distinct de « trop loin » : si ce compte
   *  explose, c'est qu'une source a cessé d'indiquer les villes, pas que le marché
   *  s'est éloigné. */
  lieuInconnu: number;
  /**
   * CE QUI A ÉTÉ ÉCARTÉ, NOMMÉMENT.
   *
   * Un compte seul ne se vérifie pas : « 5 écartées » ne dit pas si le filtre a bien
   * travaillé ou s'il vient de jeter la meilleure offre du jour. Le déposant l'a signalé
   * dès le premier vrai lot — il ne pouvait pas dire laquelle était dans quelle catégorie.
   * Chaque refus porte donc son motif, et le compte reste pour la lecture rapide.
   */
  refusees: { entreprise: string; titre: string; motif: MotifRefus }[];
}

/** Pourquoi une offre n'est pas entrée. */
export type MotifRefus = "hors-region" | "lieu-inconnu" | "sous-le-plancher" | "doublon";

/**
 * Identifiant stable et lisible, dérivé de l'entreprise et du titre.
 *
 * Pas la référence de la source : la MÊME offre a des références différentes chez Lever et
 * au Guichet-Emplois, et elle entrerait deux fois. Pas l'URL non plus, pour la même raison.
 */
export function idOffre(entreprise: string, titre: string): string {
  const propre = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const base = `${propre(entreprise)}-${propre(titre)}`.slice(0, 80).replace(/-+$/g, "");
  // Le schéma exige au moins un caractère : un titre entièrement non latin ne doit pas
  // produire un identifiant vide, qui ferait échouer l'insertion sans rien expliquer.
  return base || `offre-${propre(titre).slice(0, 20) || "sans-titre"}`;
}

/** Clé de rapprochement : deux annonces du même poste chez le même employeur. */
function cleDoublon(entreprise: string, titre: string): string {
  return idOffre(entreprise, titre);
}

/**
 * Met en forme, dédoublonne, note et filtre.
 *
 * @param recoltes   Ce que les sources ont rendu, dans l'ordre de priorité : la PREMIÈRE
 *                   occurrence d'un doublon gagne, donc placer les sources les plus fiables
 *                   en tête.
 * @param dejaSuivies Identifiants déjà dans le suivi — une offre connue ne se recrée pas.
 * @param aujourdhui  Date du balayage (AAAA-MM-JJ). Paramètre, jamais l'horloge.
 */
export function trier(
  recoltes: readonly OffreBrute[],
  dejaSuivies: ReadonlySet<string>,
  aujourdhui: string,
): Tri {
  const retenues: Offre[] = [];
  const vues = new Set<string>();
  let souslePlancher = 0;
  let doublons = 0;
  let horsRegion = 0;
  let lieuInconnu = 0;
  const refusees: Tri["refusees"] = [];

  for (const brute of recoltes) {
    const entreprise = brute.entreprise.trim() || "Employeur non nommé";
    const cle = cleDoublon(entreprise, brute.titre);

    if (vues.has(cle) || dejaSuivies.has(cle)) {
      doublons++;
      refusees.push({ entreprise, titre: brute.titre, motif: "doublon" });
      continue;
    }
    vues.add(cle);

    // LE LIEU D'ABORD, avant même de noter. Le barème ne peut pas trancher ça : il
    // pénalise une distance INCONNUE de 10 points sur 20, ce qui laisse de quoi passer
    // un seuil — « inconnue » et « à 2 000 km » y sont traitées pareil. C'est ainsi
    // qu'un poste de campement minier au Manitoba est entré à 68/100 lors de la
    // première sonde sur les vraies sources.
    const lieu = situer(brute.ville, brute.description);
    if (lieu === "hors-region") {
      horsRegion++;
      refusees.push({ entreprise, titre: brute.titre, motif: "hors-region" });
      continue;
    }
    if (lieu === "lieu-inconnu") {
      lieuInconnu++;
      refusees.push({ entreprise, titre: brute.titre, motif: "lieu-inconnu" });
      continue;
    }

    // La note vient du barème, avec `km: null` : la distance ne se déduit pas d'un nom de
    // ville, elle se mesure. Le barème sait déjà traiter l'inconnu (10 points sur 20).
    const note = computeScore({ titre: brute.titre, description: brute.description, km: null });
    if (note.parts.fitRole < FIT_ROLE_PLANCHER) {
      souslePlancher++;
      refusees.push({ entreprise, titre: brute.titre, motif: "sous-le-plancher" });
      continue;
    }

    retenues.push({
      id: cle,
      source: "jobbank",
      dateReperage: aujourdhui,
      entreprise,
      poste: brute.titre,
      lien: brute.lien,
      km: null,
      // La ville est CONSERVÉE : sans elle, un employeur hors des cibles ne peut pas être
      // géocodé plus tard, et sa distance — le critère n°1 — resterait inconnue à vie.
      ville: brute.ville.trim() || null,
      salaireAffiche: null,
      priorite: "Moyenne",
      statut: "Identifiee",
      dateEnvoi: "",
      score: note.total,
      scoreSource: "calcule",
      raisons: raisonsAutomatiques(brute, note.total),
      notes: noteDeProvenance(brute, aujourdhui),
      userNote: "",
      histo: false,
      perimeeLe: null,
    });
  }

  return { retenues, souslePlancher, doublons, horsRegion, lieuInconnu, refusees };
}

/**
 * Justifications d'une offre trouvée automatiquement.
 *
 * Elles disent d'où vient la note et CE QU'ON NE SAIT PAS. Une offre ingérée n'a pas été
 * lue par un humain : le taire la ferait passer pour une offre vérifiée, alors que les
 * notes manuelles de Marc, elles, viennent d'une vraie lecture.
 */
function raisonsAutomatiques(brute: OffreBrute, note: number): Offre["raisons"] {
  const r: Offre["raisons"] = [
    {
      ton: "reserve",
      texte:
        "Trouvée automatiquement : la note vient du seul titre et du texte de l'annonce, sans lecture humaine. À relire avant de postuler.",
    },
  ];
  if (brute.ville.trim() !== "") {
    r.push({
      ton: "reserve",
      texte: `Annoncée à ${brute.ville.trim()} — la distance reste à mesurer, elle n'est pas déduite du nom de la ville.`,
    });
  }
  if (note >= 70) {
    r.push({
      ton: "atout",
      texte: "Le titre et l'annonce portent à la fois de la coordination et du contenu technique.",
    });
  }
  return r;
}

function noteDeProvenance(brute: OffreBrute, aujourdhui: string): string {
  const publiee = brute.publieeLe ? ` Publiée le ${brute.publieeLe}.` : "";
  return `Trouvée le ${aujourdhui} par la veille automatique.${publiee} Note calculée, jamais lue par un humain.`.slice(
    0,
    600,
  );
}
