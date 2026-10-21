// lib/apercuBareme.ts — ce que le nouveau barème ferait aux notes, AVANT de l'appliquer (ADR-0032).
//
// ── POURQUOI CE MODULE EXISTE (JobAI#152) ───────────────────────────────────────────
//
// Changer les poids déplace toutes les notes. La tâche exige que Marc voie l'écart avant, sur des offres
// qu'il connaît, et qu'il décide : trois bonnes qui montent, deux mauvaises qui descendent. Ce module
// rend ces chiffres sans rien écrire.
//
// ⚠️ TROIS NOTES PAR OFFRE, ET ELLES NE SE CONFONDENT PAS :
//   · `avant`   — la note ENREGISTRÉE, celle que Marc voit aujourd'hui ;
//   · `ancien`  — la même offre recalculée avec le barème ACTIF : elle dit si `avant` est à jour (le
//     suivi garde des notes écrites par d'anciens régimes, ADR-0025) ;
//   · `apres`   — recalculée avec le nouveau barème.
// L'écart du barème SEUL est `apres − ancien` ; l'écart que Marc VERRA est `apres − avant`.
//
// ⚠️ LES EXEMPLES SONT CHOISIS PARMI LES OFFRES DONT `avant` = `ancien`, tant qu'il y en a assez : sur
// elles, tout le mouvement vient du barème et d'aucun vieux régime. Les notes MANUELLES ne figurent pas
// dans l'aperçu : elles ne bougent pas, et le plan de re-notation le dit en les comptant.
//
// ⚠️ LECTURE SEULE ET PURE. Le nom de l'entreprise sort dans les exemples (pour Marc, via le connecteur
// et `/profil`) : jamais dans un commentaire de dépôt public.

import { distribution, arrondi, type DistributionNotes } from "./diagnosticBareme";
import { appliquerNouveauBareme, dejaApplique } from "./nouveauBareme";
import { noterOffre } from "./noteOffre";
import { palier } from "./scoring";
import type { NiveauDomaine } from "./nocProfession";
import type { Profil } from "./profil";
import type { Offre } from "./types";

const AXES = ["fitRole", "distance", "seniorite", "salaire", "immigration", "conditions"] as const;
type Axe = (typeof AXES)[number];

export interface ExempleApercu {
  id: string;
  entreprise: string;
  poste: string;
  avant: number;
  ancien: number;
  apres: number;
  /** `apres − avant` : ce que Marc verra changer. */
  ecart: number;
  salaireAnnuel: number | null;
  /** Les points de chaque axe avec le NOUVEAU barème. */
  partsApres: Record<Axe, number>;
}

export interface ApercuBareme {
  /** Vrai si le profil actif a déjà le nouveau barème : l'aperçu ne montre alors aucun mouvement. */
  dejaApplique: boolean;
  versionActuelle: number;
  versionNouvelle: number;
  poids: { avant: Profil["ponderation"]; apres: Profil["ponderation"] };
  /** Les plafonds du domaine gradué que le nouveau barème poserait (ADR-0038). */
  plafondsDomaine: { voisin: number; autre: number };
  population: {
    /** Offres ouvertes avec une note CALCULÉE : celles que l'aperçu mesure. */
    calculees: number;
    /**
     * Offres historiques ou périmées à note calculée (ou sans note) : l'application les re-notera
     * AUSSI, mais l'aperçu ne les mesure pas — on le dit plutôt que de laisser croire que le compte
     * de l'écran est celui des écritures.
     */
    autresRenotees: number;
    /** Offres ouvertes à note MANUELLE : jamais touchées. */
    manuellesPreservees: number;
    /** Parmi les calculées, celles dont l'offre porte un salaire annuel lu. */
    avecSalaireAnnuel: number;
    /** Parmi les calculées, celles dont la note enregistrée est celle que le barème actif donnerait. */
    avantEgalAncien: number;
  };
  distribution: { avant: DistributionNotes; ancien: DistributionNotes; apres: DistributionNotes };
  /**
   * Offres dont la note est ARRÊTÉE par le plafond des notes calculées, avant et après.
   *
   * ⚠️ LE PLAFOND (85) N'EST PAS MIS À L'ÉCHELLE : sur une très bonne offre, il écrase l'effet du
   * salaire (72, 85 et 95 k$ donnent tous 85). Le compte dit combien d'offres sont dans ce cas.
   */
  auPlafond: { avant: number; apres: number };
  /** Offres par palier A (≥ 80) / B (≥ 65) / C, avant et après. */
  paliers: { avant: Record<string, number>; apres: Record<string, number> };
  mouvement: {
    /** `apres − avant` : monte / baisse / inchangée. */
    montent: number;
    baissent: number;
    inchangees: number;
    ecartMoyen: number | null;
    /** `apres − ancien` : l'effet du barème seul. */
    ecartMoyenBaremeSeul: number | null;
  };
  moyenneParts: { ancien: Record<Axe, number | null>; apres: Record<Axe, number | null> };
  /**
   * Le domaine gradué (ADR-0038, JobAI#151) : ce que le nouveau barème en fait.
   *
   * ⚠️ LE HAUT DE LA LISTE EST CE QUE MARC LIT. « Aucun métier hors domaine dans les 30 premières offres » se
   * juge sur ces comptes : `hautDeListe.apres.retenu` doit être le total, et chaque offre voisine ou d'un autre
   * domaine qui reste dans le haut de la liste est à regarder. Le niveau vient du code de profession seul.
   */
  domaine: {
    /** Toutes les calculées, par niveau (le niveau ne dépend pas du barème, seulement des métiers retenus). */
    niveaux: Record<NiveauDomaine, number>;
    /** Calculées dont le plafond de domaine abaisse la note du nouveau barème. */
    plafonnees: number;
    /** Les 30 premières offres, avant (notes enregistrées) et après (nouveau barème), par niveau. */
    hautDeListe: {
      taille: number;
      avant: Record<NiveauDomaine, number>;
      apres: Record<NiveauDomaine, number>;
    };
  };
  exemples: { montent: ExempleApercu[]; descendent: ExempleApercu[] };
}

/** Les premières offres que Marc lit (ADR-0038). */
const TAILLE_HAUT_DE_LISTE = 30;

function compteNiveaux(niveaux: readonly NiveauDomaine[]): Record<NiveauDomaine, number> {
  const r: Record<NiveauDomaine, number> = { retenu: 0, voisin: 0, autre: 0, inconnu: 0 };
  for (const n of niveaux) r[n] += 1;
  return r;
}

const NB_MONTENT = 3;
const NB_DESCENDENT = 2;

function comptePaliers(notes: readonly number[]): Record<string, number> {
  const r: Record<string, number> = { A: 0, B: 0, C: 0 };
  for (const n of notes) r[palier(n)] = (r[palier(n)] ?? 0) + 1;
  return r;
}

function moyennes(lignes: readonly Record<Axe, number>[]): Record<Axe, number | null> {
  return Object.fromEntries(
    AXES.map((a) => [a, lignes.length === 0 ? null : arrondi(lignes.reduce((s, p) => s + p[a], 0) / lignes.length)]),
  ) as Record<Axe, number | null>;
}

/**
 * Compare le barème actif au nouveau sur les offres ouvertes. PURE.
 *
 * `etabliLe` est la date que porterait le nouveau profil ; elle n'influe pas sur les notes.
 */
export function apercuNouveauBareme(
  offres: readonly Offre[],
  profil: Profil,
  metiers: readonly string[],
  etabliLe: string,
): ApercuBareme {
  const nouveau = appliquerNouveauBareme(profil, etabliLe);
  const ouvertes = offres.filter((o) => !o.histo && o.perimeeLe === null && o.score !== null);
  const manuelles = ouvertes.filter((o) => o.scoreSource === "manuel").length;
  const calculees = ouvertes.filter((o) => o.scoreSource !== "manuel");

  const lignes = calculees.map((o) => {
    const ancien = noterOffre(o, profil, metiers);
    const apres = noterOffre(o, nouveau, metiers);
    return { o, avant: o.score as number, ancien, apres };
  });

  const ecarts = lignes.map((l) => l.apres.total - l.avant);
  const ecartsSeuls = lignes.map((l) => l.apres.total - l.ancien.total);
  const moy = (xs: readonly number[]) =>
    xs.length === 0 ? null : arrondi(xs.reduce((s, x) => s + x, 0) / xs.length);

  const coherentes = lignes.filter((l) => l.avant === l.ancien.total);
  // Assez d'offres cohérentes pour tirer cinq exemples ? Sinon on prend toutes les calculées.
  const reservoir = coherentes.length >= NB_MONTENT + NB_DESCENDENT ? coherentes : lignes;
  const enExemple = (l: (typeof lignes)[number]): ExempleApercu => ({
    id: l.o.id,
    entreprise: l.o.entreprise,
    poste: l.o.poste,
    avant: l.avant,
    ancien: l.ancien.total,
    apres: l.apres.total,
    ecart: l.apres.total - l.avant,
    salaireAnnuel: l.o.salaireAnnuel ?? null,
    partsApres: l.apres.parts,
  });
  const montent = reservoir
    .filter((l) => l.apres.total > l.avant)
    .sort((a, b) => b.apres.total - b.avant - (a.apres.total - a.avant))
    .slice(0, NB_MONTENT)
    .map(enExemple);
  const descendent = reservoir
    .filter((l) => l.apres.total < l.avant)
    .sort((a, b) => a.apres.total - a.avant - (b.apres.total - b.avant))
    .slice(0, NB_DESCENDENT)
    .map(enExemple);

  return {
    dejaApplique: dejaApplique(profil),
    versionActuelle: profil.version,
    versionNouvelle: nouveau.version,
    poids: { avant: profil.ponderation, apres: nouveau.ponderation },
    plafondsDomaine: { voisin: nouveau.plafondVoisin, autre: nouveau.plafondHorsDomaine },
    population: {
      calculees: calculees.length,
      autresRenotees: offres.filter(
        (o) => o.scoreSource !== "manuel" && (o.histo || o.perimeeLe !== null),
      ).length,
      manuellesPreservees: manuelles,
      avecSalaireAnnuel: calculees.filter((o) => (o.salaireAnnuel ?? null) !== null).length,
      avantEgalAncien: coherentes.length,
    },
    distribution: {
      avant: distribution(lignes.map((l) => l.avant)),
      ancien: distribution(lignes.map((l) => l.ancien.total)),
      apres: distribution(lignes.map((l) => l.apres.total)),
    },
    auPlafond: {
      avant: lignes.filter((l) => l.ancien.total >= profil.plafondNoteCalculee).length,
      apres: lignes.filter((l) => l.apres.total >= nouveau.plafondNoteCalculee).length,
    },
    paliers: {
      avant: comptePaliers(lignes.map((l) => l.avant)),
      apres: comptePaliers(lignes.map((l) => l.apres.total)),
    },
    mouvement: {
      montent: ecarts.filter((e) => e > 0).length,
      baissent: ecarts.filter((e) => e < 0).length,
      inchangees: ecarts.filter((e) => e === 0).length,
      ecartMoyen: moy(ecarts),
      ecartMoyenBaremeSeul: moy(ecartsSeuls),
    },
    moyenneParts: {
      ancien: moyennes(lignes.map((l) => l.ancien.parts)),
      apres: moyennes(lignes.map((l) => l.apres.parts)),
    },
    domaine: {
      niveaux: compteNiveaux(lignes.map((l) => l.apres.niveauDomaine)),
      plafonnees: lignes.filter(
        (l) =>
          l.apres.plafondDomaine !== null &&
          Math.min(l.apres.brut, nouveau.plafondNoteCalculee) > l.apres.plafondDomaine,
      ).length,
      hautDeListe: {
        taille: Math.min(TAILLE_HAUT_DE_LISTE, lignes.length),
        avant: compteNiveaux(hautDeListe(lignes, (l) => l.avant).map((l) => l.apres.niveauDomaine)),
        apres: compteNiveaux(hautDeListe(lignes, (l) => l.apres.total).map((l) => l.apres.niveauDomaine)),
      },
    },
    exemples: { montent, descendent },
  };
}

/** Les premières offres par note décroissante ; à note égale, l'ordre de l'identifiant (le résultat se refait). */
function hautDeListe<T extends { o: Offre }>(lignes: readonly T[], note: (l: T) => number): T[] {
  return [...lignes]
    .sort((a, b) => note(b) - note(a) || (a.o.id < b.o.id ? -1 : 1))
    .slice(0, TAILLE_HAUT_DE_LISTE);
}
