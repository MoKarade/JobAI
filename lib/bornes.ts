// lib/bornes.ts — y a-t-il une borne de recharge à cinq minutes à pied ?
//
// POURQUOI CE FICHIER EXISTE
// Demande de Marc, 2026-08-05 : « pour tout, check s'il y a une borne de recharge à moins
// de 5 min à pied ». Pour qui roule à l'électrique, une journée de travail sans borne à
// proximité change le calcul d'un emploi autant que le salaire — et ça ne se voit sur
// aucune offre.
//
// FONCTIONS PURES. Le réseau vit dans `lib/overpass.ts` ; ici on décide, on ne cherche pas.
//
// ⚠️ CE QUE « CINQ MINUTES À PIED » VEUT DIRE ICI, ET CE QUE ÇA NE VEUT PAS DIRE
// On mesure une distance À VOL D'OISEAU, pas un trajet piéton. Un vrai parcours contourne
// les bâtiments, les stationnements et les autoroutes : il est TOUJOURS plus long, parfois
// du double. Le rayon est donc choisi PRUDENT (350 m pour « 5 minutes »), et l'interface
// dit « à environ N minutes » — jamais un temps de marche affirmé. Promettre un temps de
// trajet qu'on n'a pas calculé serait exactement le genre de chiffre plausible et faux que
// le garde-fou n°3 interdit.

/** Une borne, telle qu'OpenStreetMap la publie. */
export interface Borne {
  /** Identifiant OSM — sert à dédoublonner, jamais affiché. */
  id: number;
  lat: number;
  lon: number;
  /** Nom du réseau ou de l'exploitant, quand il est renseigné. */
  nom: string | null;
}

/**
 * Vitesse de marche retenue, en km/h.
 *
 * 4,8 km/h est la vitesse d'un adulte sur trottoir plat — la valeur qu'emploient les
 * calculateurs d'itinéraire piéton. Ce n'est PAS une moyenne optimiste : en hiver
 * québécois, sur un trottoir enneigé, elle tombe nettement plus bas. Raison de plus pour
 * garder le rayon prudent.
 */
export const VITESSE_MARCHE_KMH = 4.8;

/**
 * Le rayon, en mètres, pour « cinq minutes à pied ».
 *
 * À 4,8 km/h, cinq minutes valent 400 m DE PARCOURS. On retient 350 m à VOL D'OISEAU :
 * l'écart couvre le détour qu'impose toute rue réelle. Choisir 400 reviendrait à compter
 * le trajet en ligne droite, donc à annoncer cinq minutes là où il en faut sept.
 */
export const RAYON_5_MIN_M = 350;

/**
 * Au-delà de cette étendue, un lot revenu VIDE est un échec, pas une réponse.
 *
 * Dix kilomètres : plus grand qu'un quartier. Sur une telle boîte, « aucune borne de
 * recharge » n'est pas une information plausible dans la région de Québec — c'est la
 * signature d'un service qui n'a pas pu chercher. En dessous, un vide est crédible et
 * s'inscrit normalement.
 */
export const ETENDUE_VIDE_SUSPECTE_KM = 10;

/** Distance à vol d'oiseau entre deux points, en MÈTRES (haversine). */
export function distanceM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ce qu'on sait des bornes autour d'un employeur. */
export interface ProximiteBorne {
  /** Combien de bornes dans le rayon. */
  nombre: number;
  /** Distance de la plus proche, en mètres. `null` s'il n'y en a aucune. */
  plusProcheM: number | null;
  /** Son nom, quand OpenStreetMap le donne. */
  nom: string | null;
}

/**
 * La borne la plus proche d'un point, et combien il y en a dans le rayon.
 *
 * Rend un objet à ZÉRO plutôt que `null` quand il n'y a rien : « aucune borne à moins de
 * 5 minutes » est une RÉPONSE, et une réponse utile — pas une absence de mesure. Les deux
 * ne se disent pas pareil à l'écran, et les confondre ferait passer un lieu non mesuré pour
 * un lieu sans borne.
 */
export function proximiteBorne(
  lieu: { lat: number; lon: number },
  bornes: readonly Borne[],
  rayonM: number = RAYON_5_MIN_M,
): ProximiteBorne {
  let nombre = 0;
  let plusProcheM: number | null = null;
  let nom: string | null = null;

  for (const b of bornes) {
    const d = distanceM(lieu, b);
    if (d > rayonM) continue;
    nombre++;
    if (plusProcheM === null || d < plusProcheM) {
      plusProcheM = d;
      nom = b.nom;
    }
  }

  return { nombre, plusProcheM: plusProcheM === null ? null : Math.round(plusProcheM), nom };
}

/**
 * Le temps de marche approximatif, en minutes, pour une distance à vol d'oiseau.
 *
 * MAJORÉ d'un quart : aucune rue ne va tout droit. C'est une approximation ASSUMÉE, et
 * l'interface doit le dire (« environ »). Arrondi à la minute supérieure — annoncer « 4 min »
 * pour 4 min 50 s serait optimiste au mauvais endroit.
 */
export function minutesAPied(distanceMetres: number): number {
  const parcours = distanceMetres * 1.25;
  const minutes = (parcours / 1000 / VITESSE_MARCHE_KMH) * 60;
  return Math.max(1, Math.ceil(minutes));
}

/** La boîte englobante à interroger autour d'un point, avec une marge. */
export function boiteAutour(
  lieu: { lat: number; lon: number },
  rayonM: number = RAYON_5_MIN_M,
): { latMin: number; lonMin: number; latMax: number; lonMax: number } {
  // Un degré de latitude vaut ~111 km partout ; un degré de longitude rétrécit vers les
  // pôles, d'où le cosinus. À la latitude de Québec (~46,8°), un degré de longitude vaut
  // environ 76 km — ignorer ce facteur donnerait une boîte trop étroite d'un tiers.
  const dLat = rayonM / 111_320;
  const dLon = rayonM / (111_320 * Math.cos((lieu.lat * Math.PI) / 180));
  return {
    latMin: lieu.lat - dLat,
    lonMin: lieu.lon - dLon,
    latMax: lieu.lat + dLat,
    lonMax: lieu.lon + dLon,
  };
}

/**
 * La boîte qui englobe TOUS les lieux donnés, avec une marge.
 *
 * ⚠️ ELLE REMPLACE SIX REQUÊTES PAR UNE. Interroger Overpass autour de chaque entreprise
 * coûtait un aller-retour par lieu — et quand il échoue, il coûte le délai × le nombre
 * d'instances de repli. Mesuré en production le 2026-08-05 : trois entreprises non mesurées,
 * chacune ayant épuisé les trois instances, et le budget de la passe entièrement consommé.
 *
 * Les employeurs tiennent tous dans la région de Québec : une seule interrogation couvre
 * l'ensemble, et la proximité se calcule ensuite EN LOCAL, pour tout le monde d'un coup.
 * C'est aussi ce qui rend la mesure des bornes indépendante du nombre d'entreprises.
 *
 * La marge est le rayon cherché : sans elle, une borne située juste au-delà du dernier
 * employeur du lot sortirait de la boîte et « aucune borne » serait faux pour lui.
 */
export function boiteEnglobante(
  lieux: readonly { lat: number; lon: number }[],
  margeM = RAYON_5_MIN_M,
): { latMin: number; lonMin: number; latMax: number; lonMax: number } | null {
  if (lieux.length === 0) return null;

  let latMin = Infinity;
  let latMax = -Infinity;
  let lonMin = Infinity;
  let lonMax = -Infinity;
  for (const l of lieux) {
    if (l.lat < latMin) latMin = l.lat;
    if (l.lat > latMax) latMax = l.lat;
    if (l.lon < lonMin) lonMin = l.lon;
    if (l.lon > lonMax) lonMax = l.lon;
  }

  // Même conversion que `boiteAutour` : un degré de longitude rétrécit avec la latitude,
  // et l'ignorer donnerait une marge trop étroite d'est en ouest.
  const dLat = margeM / 111_320;
  const latMoyenne = ((latMin + latMax) / 2) * (Math.PI / 180);
  const dLon = margeM / (111_320 * Math.max(Math.cos(latMoyenne), 0.01));

  return {
    latMin: latMin - dLat,
    lonMin: lonMin - dLon,
    latMax: latMax + dLat,
    lonMax: lonMax + dLon,
  };
}
