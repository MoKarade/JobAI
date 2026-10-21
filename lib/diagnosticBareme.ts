// lib/diagnosticBareme.ts — mesurer le barème tel qu'il note VRAIMENT, sans rien changer.
//
// ── POURQUOI CE MODULE EXISTE (JobAI#148) ───────────────────────────────────────────
//
// Après la validation d'un CV, les notes de tout le suivi ont baissé et le meilleur résultat
// plafonne à 77. Trois hypothèses tiennent sur le papier — le facteur de domaine perdu au
// recalcul, l'axe du salaire inerte, le vocabulaire du CV qui s'ajoute au barème — et AUCUNE
// n'est mesurée. Changer le barème sur une cause supposée, c'est le rendre plus compliqué
// sans savoir s'il est meilleur. Ce module rend les chiffres qui permettent de trancher.
//
// ⚠️ LECTURE SEULE ET PURE. Il reçoit des offres, un profil et des métiers ; il ne lit pas la
// base et n'écrit rien. La lecture est injectée par la route MCP (lib/mcp/serveur.ts).
//
// ⚠️ TROIS RECALCULS. L'app avait trois façons de noter la même offre (depuis l'ADR-0025 elle n'en a
// plus qu'une, `lib/noteOffre.ts`) ; le diagnostic garde les trois SCÉNARIOS pour mesurer ce que
// chacun donnait sur les offres en base, dont les notes stockées viennent encore de l'ancien régime :
//   · `renotation`  — le profil ACTIF, sans code de profession ni métiers : ce que fait la
//     re-notation après une validation de CV (`lib/cv/renotation.ts`) ;
//   · `complet`     — le profil ACTIF AVEC code de profession et métiers : ce que donnerait le
//     barème si le facteur de domaine survivait au recalcul ;
//   · `ingestion`   — le profil PAR DÉFAUT avec code et métiers : ce que fait l'ingestion
//     (`lib/ingest/pipeline.ts`).
// L'écart entre ces trois lignes est la mesure de l'incohérence ; il ne se discute pas.
//
// ⚠️ AUCUNE DONNÉE PERSONNELLE EN SORTIE AGRÉGÉE. Les compteurs et les moyennes sont publiables
// tels quels. Seul `meilleures` nomme des offres (entreprise, poste) : c'est pour Claude et
// Marc via le connecteur, pas pour un commentaire de dépôt public.

import { computeScore, facteurDomaine, motsTechniqueDe, normaliserTitre, type DetailNote } from "./scoring";
import { PROFIL_DEFAUT, type Profil } from "./profil";
import { lireCodeNoc } from "./nocProfession";
import type { Offre } from "./types";

const AXES = ["fitRole", "distance", "seniorite", "salaire", "immigration", "conditions"] as const;
type Axe = (typeof AXES)[number];

/** Les tranches de note, de la plus basse à la plus haute. */
const TRANCHES: readonly { etiquette: string; min: number }[] = [
  { etiquette: "<40", min: 0 },
  { etiquette: "40-49", min: 40 },
  { etiquette: "50-59", min: 50 },
  { etiquette: "60-64", min: 60 },
  { etiquette: "65-69", min: 65 },
  { etiquette: "70-74", min: 70 },
  { etiquette: "75-79", min: 75 },
  { etiquette: "80+", min: 80 },
];

export interface DistributionNotes {
  n: number;
  min: number | null;
  mediane: number | null;
  max: number | null;
  moyenne: number | null;
  tranches: Record<string, number>;
}

export interface RecalculResume {
  distribution: DistributionNotes;
  /** Moyenne des points de chaque axe (`null` si aucune offre). */
  moyenneParts: Record<Axe, number | null>;
  /** Offres dont la note recalculée diffère de la note enregistrée. */
  differentesDuStocke: number;
  /** Écart moyen (recalculé − enregistré) sur ces offres, `null` s'il n'y en a aucune. */
  ecartMoyenDuStocke: number | null;
  /** Offres hors des métiers retenus (voisines ou d'un autre domaine). */
  horsDomaine: number;
}

export interface OffreMesuree {
  id: string;
  entreprise: string;
  poste: string;
  noc: string | null;
  km: number | null;
  stockee: number | null;
  scoreSource: Offre["scoreSource"];
  /** Les parts du recalcul `complet`. */
  parts: Record<Axe, number>;
  facteurDomaine: number;
  /** Retenu, voisin, autre ou inconnu (ADR-0038) : c'est ce qui se lit sur le haut de la liste. */
  niveauDomaine: DetailNote["niveauDomaine"];
  totalComplet: number;
  /** Les mots du vocabulaire du profil retrouvés dans le titre + les notes. */
  motsCoordinationTrouves: string[];
  motsTechniqueTrouves: string[];
}

export interface DiagnosticBareme {
  population: {
    /** Offres du suivi, historiques et périmées comprises. */
    total: number;
    /** Offres ouvertes (ni historiques ni périmées) : la population mesurée. */
    ouvertes: number;
    /** Ouvertes avec une note. */
    notees: number;
    /** Ouvertes dont la note a été posée à la main (jamais recalculées). */
    manuelles: number;
    /** Ouvertes avec un code de profession. */
    avecNoc: number;
    /** Ouvertes avec un code de profession dans les métiers retenus. */
    nocRetenu: number;
    /** Ouvertes avec un code de profession HORS métiers retenus. */
    nocHorsMetiers: number;
    /** Ouvertes avec un salaire affiché (texte). */
    avecSalaireAffiche: number;
    /** Ouvertes avec une distance connue. */
    avecKm: number;
  };
  profil: {
    version: number;
    origine: Profil["origine"];
    etabliLe: string;
    anneesExperience: number | null;
    /** Mots de vocabulaire ajoutés au défaut (coordination / technique). */
    motsCoordinationAjoutes: string[];
    motsTechniqueAjoutes: string[];
    ponderation: Profil["ponderation"];
    facteurHorsDomaine: number;
    domaineGradue: boolean;
    plafondVoisin: number;
    plafondHorsDomaine: number;
    plafondNoteCalculee: number;
  };
  metiersRetenus: string[];
  /** Les notes enregistrées en base (ce que Marc voit). */
  enregistree: DistributionNotes;
  /** Les trois recalculs : voir l'en-tête du module. */
  renotation: RecalculResume;
  complet: RecalculResume;
  ingestion: RecalculResume;
  /** Les meilleures offres selon la note enregistrée, avec leurs parts. */
  meilleures: OffreMesuree[];
}

export function arrondi(x: number): number {
  return Math.round(x * 10) / 10;
}

export function distribution(notes: readonly number[]): DistributionNotes {
  const tranches: Record<string, number> = {};
  for (const t of TRANCHES) tranches[t.etiquette] = 0;
  for (const n of notes) {
    const tranche = [...TRANCHES].reverse().find((t) => n >= t.min);
    if (tranche) tranches[tranche.etiquette] = (tranches[tranche.etiquette] ?? 0) + 1;
  }
  const tri = [...notes].sort((a, b) => a - b);
  const premier = tri[0];
  const dernier = tri[tri.length - 1];
  if (premier === undefined || dernier === undefined) {
    return { n: 0, min: null, mediane: null, max: null, moyenne: null, tranches };
  }
  const milieu = Math.floor(tri.length / 2);
  const haut = tri[milieu] ?? premier;
  const bas = tri[milieu - 1] ?? haut;
  return {
    n: tri.length,
    min: premier,
    mediane: tri.length % 2 === 1 ? haut : (bas + haut) / 2,
    max: dernier,
    moyenne: arrondi(tri.reduce((x, y) => x + y, 0) / tri.length),
    tranches,
  };
}

function recalculer(
  offres: readonly Offre[],
  profil: Profil,
  metiers: readonly string[],
  avecNoc: boolean,
): { resume: RecalculResume; details: Map<string, DetailNote> } {
  const details = new Map<string, DetailNote>();
  const totaux: number[] = [];
  const sommes: Record<Axe, number> = {
    fitRole: 0,
    distance: 0,
    seniorite: 0,
    salaire: 0,
    immigration: 0,
    conditions: 0,
  };
  let differentes = 0;
  let sommeEcarts = 0;
  let horsDomaine = 0;

  for (const o of offres) {
    const d = computeScore(
      {
        titre: o.poste,
        description: o.notes,
        km: o.km,
        noc: avecNoc ? (o.noc ?? null) : null,
      },
      profil,
      avecNoc ? metiers : [],
    );
    details.set(o.id, d);
    totaux.push(d.total);
    for (const a of AXES) sommes[a] += d.parts[a];
    // Voisin ou autre = hors des métiers retenus. Le niveau, et non le facteur : un profil au domaine gradué
    // (ADR-0038) laisse le facteur à 1 et pose un plafond à la place.
    if (d.niveauDomaine === "voisin" || d.niveauDomaine === "autre") horsDomaine++;
    if (o.score !== null && d.total !== o.score) {
      differentes++;
      sommeEcarts += d.total - o.score;
    }
  }

  const n = offres.length;
  const moyenneParts = Object.fromEntries(
    AXES.map((a) => [a, n === 0 ? null : arrondi(sommes[a] / n)]),
  ) as Record<Axe, number | null>;

  return {
    resume: {
      distribution: distribution(totaux),
      moyenneParts,
      differentesDuStocke: differentes,
      ecartMoyenDuStocke: differentes === 0 ? null : arrondi(sommeEcarts / differentes),
      horsDomaine,
    },
    details,
  };
}

function motsAjoutes(actuels: readonly string[], defaut: readonly string[]): string[] {
  const connus = new Set(defaut.map(normaliserTitre));
  return actuels.filter((m) => !connus.has(normaliserTitre(m)));
}

function motsTrouves(texte: string, mots: readonly string[]): string[] {
  const t = normaliserTitre(texte);
  return mots.filter((m) => t.includes(normaliserTitre(m)));
}

/**
 * Mesure le barème sur les offres ouvertes. PURE.
 *
 * `limiteMeilleures` borne la liste nominative ; les agrégats portent toujours sur TOUTES les
 * offres ouvertes notées.
 */
export function diagnostiquerBareme(
  offres: readonly Offre[],
  profil: Profil,
  metiers: readonly string[],
  limiteMeilleures = 30,
): DiagnosticBareme {
  const ouvertes = offres.filter((o) => !o.histo && o.perimeeLe === null);
  const notees = ouvertes.filter((o) => o.score !== null);

  const avecNoc = ouvertes.filter((o) => lireCodeNoc(o.noc) !== null);
  const nocRetenu = avecNoc.filter((o) => facteurDomaine(o.noc, metiers, profil) === 1).length;

  const renotation = recalculer(notees, profil, metiers, false);
  const complet = recalculer(notees, profil, metiers, true);
  const ingestion = recalculer(notees, PROFIL_DEFAUT, metiers, true);

  const meilleures: OffreMesuree[] = [...notees]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, Math.max(0, limiteMeilleures))
    .map((o) => {
      // `complet.details` contient toujours l'identifiant : il est construit sur `notees`.
      const d = complet.details.get(o.id) as DetailNote;
      const texte = `${o.poste} ${o.notes}`;
      return {
        id: o.id,
        entreprise: o.entreprise,
        poste: o.poste,
        noc: o.noc ?? null,
        km: o.km,
        stockee: o.score,
        scoreSource: o.scoreSource,
        parts: d.parts,
        facteurDomaine: d.facteurDomaine,
        niveauDomaine: d.niveauDomaine,
        totalComplet: d.total,
        motsCoordinationTrouves: motsTrouves(texte, profil.motsCoordination),
        motsTechniqueTrouves: motsTechniqueDe(texte, profil),
      };
    });

  return {
    population: {
      total: offres.length,
      ouvertes: ouvertes.length,
      notees: notees.length,
      manuelles: notees.filter((o) => o.scoreSource === "manuel").length,
      avecNoc: avecNoc.length,
      nocRetenu,
      nocHorsMetiers: avecNoc.length - nocRetenu,
      avecSalaireAffiche: ouvertes.filter((o) => o.salaireAffiche !== null).length,
      avecKm: ouvertes.filter((o) => o.km !== null).length,
    },
    profil: {
      version: profil.version,
      origine: profil.origine,
      etabliLe: profil.etabliLe,
      anneesExperience: profil.faits.anneesExperience ?? null,
      motsCoordinationAjoutes: motsAjoutes(profil.motsCoordination, PROFIL_DEFAUT.motsCoordination),
      motsTechniqueAjoutes: motsAjoutes(profil.motsTechnique, PROFIL_DEFAUT.motsTechnique),
      ponderation: profil.ponderation,
      facteurHorsDomaine: profil.facteurHorsDomaine,
      domaineGradue: profil.domaineGradue,
      plafondVoisin: profil.plafondVoisin,
      plafondHorsDomaine: profil.plafondHorsDomaine,
      plafondNoteCalculee: profil.plafondNoteCalculee,
    },
    metiersRetenus: [...metiers],
    enregistree: distribution(notees.map((o) => o.score as number)),
    renotation: renotation.resume,
    complet: complet.resume,
    ingestion: ingestion.resume,
    meilleures,
  };
}
