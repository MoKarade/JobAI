// lib/nouveauBareme.ts — le barème où le salaire passe en premier (ADR-0032, JobAI#152).
//
// ── CE QUE FAIT CE MODULE ───────────────────────────────────────────────────────────
//
// Il transforme un profil en un autre : mêmes seuils, mêmes mots, mêmes faits, mais les POINTS de
// chaque axe remis à l'échelle de nouveaux poids, le salaire lu et le domaine gradué (ADR-0038). Il
// n'écrit rien et ne lit rien : l'aperçu (`lib/apercuBareme.ts`) et l'action de `/profil` s'en servent
// chacun de leur côté.
//
// ⚠️ UNE MISE À L'ÉCHELLE PROPORTIONNELLE, PAS UNE RÉINVENTION. Chaque valeur d'un axe est multipliée
// par `poids cible / poids actuel` puis arrondie. Le haut de chaque table retombe donc exactement sur
// le poids de l'axe, l'ordre des paliers est conservé (l'arrondi est monotone) et les SEUILS — km,
// années, dollars — ne bougent pas : ils sont des arbitrages de Marc, pas des points.
//
// ⚠️ ELLE PART DU PROFIL EN COURS, pas du défaut. Le barème de Marc est enregistré en base avec les
// paliers de séniorité que son CV a produits ; repartir du défaut les écraserait. Appliquer deux fois
// ne change plus rien : le facteur vaut alors 1 (`dejaApplique`).

import { ProfilSchema, type Profil } from "./profil";

type Axe = keyof Profil["ponderation"];

/** Les poids du nouveau barème (JobAI#152). Somme 100 — vérifié par test. */
export const POIDS_NOUVEAU_BAREME: Readonly<Record<Axe, number>> = {
  salaire: 32,
  fitRole: 28,
  distance: 20,
  seniorite: 10,
  immigration: 5,
  conditions: 5,
};

/** Le barème est-il déjà celui de l'ADR-0032 ? Alors il n'y a rien à appliquer. */
export function dejaApplique(profil: Profil): boolean {
  return (
    profil.salaireDansLaNote &&
    profil.domaineGradue &&
    (Object.keys(POIDS_NOUVEAU_BAREME) as Axe[]).every(
      (a) => profil.ponderation[a] === POIDS_NOUVEAU_BAREME[a],
    )
  );
}

/** Le facteur d'un axe. Un poids actuel nul n'a rien à mettre à l'échelle : 1. */
function facteur(profil: Profil, axe: Axe): number {
  const actuel = profil.ponderation[axe];
  return actuel > 0 ? POIDS_NOUVEAU_BAREME[axe] / actuel : 1;
}

/**
 * Le profil après application du nouveau barème. PURE.
 *
 * `version` + 1 et `etabliLe` : une note retient la version qui l'a produite, et deux barèmes ne
 * portent jamais le même numéro. La date est un paramètre — une fonction pure se teste, une
 * fonction qui lit l'horloge se devine.
 */
export function appliquerNouveauBareme(profil: Profil, etabliLe: string): Profil {
  if (dejaApplique(profil)) return profil;

  const mise = (axe: Axe) => {
    const f = facteur(profil, axe);
    return (n: number) => Math.round(n * f);
  };
  const role = mise("fitRole");
  const dist = mise("distance");
  const seni = mise("seniorite");
  const sala = mise("salaire");
  const immi = mise("immigration");
  const cond = mise("conditions");

  const p = profil.pointsRole;
  const c = profil.pointsConditions;

  return ProfilSchema.parse({
    ...structuredClone(profil),
    version: profil.version + 1,
    etabliLe,
    ponderation: { ...POIDS_NOUVEAU_BAREME },
    salaireDansLaNote: true,
    // Le domaine devient gradué avec le même geste (ADR-0038, JobAI#151) : Marc voit UN aperçu, valide UN barème.
    domaineGradue: true,

    pointsRole: {
      combinaison: role(p.combinaison),
      coordination: role(p.coordination),
      technique: role(p.technique),
      technicien: role(p.technicien),
      horsSujet: role(p.horsSujet),
    },
    paliersDistanceKm: profil.paliersDistanceKm.map((x) => ({ max: x.max, points: dist(x.points) })),
    distanceInconnue: dist(profil.distanceInconnue),
    distancePlancher: dist(profil.distancePlancher),
    paliersSeniorite: profil.paliersSeniorite.map((x) => ({ max: x.max, points: seni(x.points) })),
    senioriteNonPrecisee: seni(profil.senioriteNonPrecisee),
    senioritePlancher: seni(profil.senioritePlancher),
    paliersSalaire: profil.paliersSalaire.map((x) => ({ min: x.min, points: sala(x.points) })),
    salaireNonAffiche: sala(profil.salaireNonAffiche),
    salairePlancher: sala(profil.salairePlancher),
    immigrationLibre: immi(profil.immigrationLibre),
    immigrationOrdre: immi(profil.immigrationOrdre),
    pointsConditions: {
      ideal: cond(c.ideal),
      partiel: cond(c.partiel),
      precaire: cond(c.precaire),
      nonPublie: cond(c.nonPublie),
    },
  });
}
