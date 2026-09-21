// lib/bornes.ts — la borne de recharge la plus proche d'un employeur.
//
// POURQUOI CE FICHIER EXISTE
// Demande de Marc, 2026-08-05 : « pour tout, check s'il y a une borne de recharge ». Pour
// qui roule à l'électrique, une journée de travail sans borne à proximité change le calcul
// d'un emploi autant que le salaire — et ça ne se voit sur aucune offre.
//
// ⚠️ LE PLAFOND DE CINQ MINUTES A ÉTÉ RETIRÉ (demande de Marc, 2026-08-06 : « je veux plus
// à 5 min à pied, je veux la plus proche »). Il rendait la fonctionnalité inutile : à 350 m
// près, presque aucun employeur industriel de la région n'a de borne, si bien que l'écran
// affichait « aucune » partout. La réponse était exacte et sans valeur — savoir qu'il n'y a
// rien à trois coins de rue n'aide pas à décider, savoir que la plus proche est à 1,2 km,
// que c'est une rapide du Circuit électrique, oui.
//
// FONCTIONS PURES. Le réseau vit dans `lib/overpass.ts` ; ici on décide, on ne cherche pas.
//
// ⚠️ CE QU'ON MESURE, ET CE QU'ON NE MESURE PAS
// Une distance À VOL D'OISEAU, pas un trajet. Un vrai parcours contourne les bâtiments, les
// stationnements et les autoroutes : il est TOUJOURS plus long, parfois du double. D'où le
// « ~ » devant chaque durée affichée, et la majoration d'un quart dans `minutesAPied`.
// Promettre un temps de trajet qu'on n'a pas calculé serait exactement le genre de chiffre
// plausible et faux que le garde-fou n°3 interdit.

/** Une borne, telle qu'OpenStreetMap la publie. */
export interface Borne {
  /** Identifiant OSM — sert à dédoublonner, jamais affiché. */
  id: number;
  lat: number;
  lon: number;
  /**
   * LA MARQUE : réseau, exploitant ou enseigne (« Circuit électrique », « FLO », « Tesla »).
   * `null` quand OpenStreetMap ne la donne pas.
   */
  nom: string | null;
  /**
   * Charge RAPIDE (courant continu) ? `true`, `false`, ou `null` quand les tags ne
   * permettent pas de trancher.
   *
   * Les trois états comptent : une borne dont on ignore la puissance ne doit pas être
   * affichée comme lente — ce serait un fait inventé (garde-fou n°3).
   */
  rapide: boolean | null;
  /**
   * Le tarif TEL QUE PUBLIÉ par OpenStreetMap, ou `null`.
   *
   * ⚠️ IL N'Y A PAS DE « PRIX MOYEN » DANS OPENSTREETMAP, et il ne faut pas en fabriquer un.
   * Marc a demandé « quel prix moyen » ; la base ne porte que ce que des contributeurs ont
   * relevé sur place : `fee=no` (gratuite), parfois un tag `charge` avec le prix affiché sur
   * la borne. Calculer une moyenne régionale à partir de rien, ou reprendre un tarif de
   * catalogue trouvé ailleurs, donnerait un chiffre crédible que personne n'a mesuré. On
   * rend donc ce qui est publié, et « tarif non publié » quand ça ne l'est pas.
   */
  tarif: string | null;
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
 * Jusqu'où on cherche, en mètres.
 *
 * Ce n'est PLUS un seuil de réponse — c'est la portée de la question. La borne la plus
 * proche est rendue quelle que soit sa distance ; ce nombre dit seulement l'étendue qu'on
 * demande à OpenStreetMap autour du lot d'employeurs, parce qu'une requête sans limite
 * n'existe pas.
 *
 * 15 km : à l'échelle de la région de Québec, c'est plus loin que le trajet quotidien de
 * n'importe quel employeur vers n'importe quel village voisin. Si vraiment rien n'est
 * trouvé dans ce rayon, « aucune borne à moins de 15 km » est une réponse honnête et
 * remarquable — pas un silence.
 */
export const PORTEE_RECHERCHE_M = 15_000;

/**
 * Au-delà, on ne marche plus, on roule — et l'écran doit le dire autrement.
 *
 * 1,5 km, c'est vingt bonnes minutes de marche. Annoncer « ~63 min à pied » pour une borne
 * à 4 km serait exact et absurde : personne ne fait ce calcul, et la durée noierait la
 * seule chose utile, la distance. En dessous du seuil on donne la durée (elle décide),
 * au-dessus on donne les kilomètres (ils décident).
 */
export const MARCHE_PLAUSIBLE_M = 1_500;

/**
 * Au-delà de cette étendue, un lot revenu VIDE est un échec, pas une réponse.
 *
 * Dix kilomètres : plus grand qu'un quartier. Sur une telle boîte, « aucune borne de
 * recharge » n'est pas une information plausible dans la région de Québec — c'est la
 * signature d'un service qui n'a pas pu chercher. En dessous, un vide est crédible et
 * s'inscrit normalement.
 *
 * ⚠️ DEPUIS QUE LA MARGE EST DE 15 km, CE SEUIL EST TOUJOURS FRANCHI : même un employeur
 * isolé donne une boîte de 30 km. Un lot vide est donc désormais TOUJOURS traité comme un
 * échec, et repassera indéfiniment. C'est le bon comportement — il n'existe pas de rectangle
 * de 30 km sans borne dans cette région — mais c'est un choix, pas un effet de bord : la
 * ligne d'erreur du journal est ce qui le rend visible si jamais il se trompait.
 */
export const ETENDUE_VIDE_SUSPECTE_KM = 10;

/**
 * Le rayon terrestre moyen, en mètres — le SEUL modèle de Terre du fichier.
 *
 * ⚠️ IL EST PARTAGÉ, ET CE N'EST PAS DE LA COQUETTERIE. Les boîtes se calculaient avec
 * 111 320 m par degré (la valeur WGS84 à l'équateur) pendant que `distanceM` mesurait sur
 * une sphère de 6 371 km, soit 111 195 m par degré. La boîte était donc 0,11 % plus PETITE
 * que le rayon demandé, mesurée par la fonction même qui sert ensuite à filtrer : 17 m de
 * manque sur 15 km. Invisible à 350 m, ça devient une bande où une borne existe, se trouve
 * dans la portée annoncée, et sort quand même de la requête. Deux modèles pour une même
 * grandeur finissent toujours par diverger là où on ne regarde pas.
 */
const RAYON_TERRE_M = 6_371_000;

/** Mètres par degré de latitude, dérivés du même modèle — jamais recopiés. */
const METRES_PAR_DEGRE_LAT = (2 * Math.PI * RAYON_TERRE_M) / 360;

/** Distance à vol d'oiseau entre deux points, en MÈTRES (haversine). */
export function distanceM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const R = RAYON_TERRE_M;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Ce qu'on sait de la borne la plus proche d'un employeur. */
export interface ProximiteBorne {
  /** Distance de la plus proche, en mètres. `null` = aucune trouvée dans la portée. */
  plusProcheM: number | null;
  /** Sa marque — réseau, exploitant ou enseigne — quand OpenStreetMap la donne. */
  nom: string | null;
  /** Est-ce une rapide ? `null` quand les tags ne permettent pas de trancher. */
  rapide: boolean | null;
  /** Le tarif publié, ou `null`. Jamais une moyenne fabriquée (voir `Borne.tarif`). */
  tarif: string | null;
}

/**
 * La borne la PLUS PROCHE d'un point, sans plafond de distance.
 *
 * ⚠️ ELLE NE FILTRE PLUS (demande de Marc, 2026-08-06). L'ancienne version ne retenait que
 * les bornes à moins de 350 m et rendait un compte : en production, ça donnait « aucune »
 * pour la quasi-totalité des employeurs — une réponse exacte dont on ne pouvait rien faire.
 * Ici la seule limite est celle de la question posée à OpenStreetMap (`PORTEE_RECHERCHE_M`),
 * et l'écran affiche la distance réelle, quelle qu'elle soit.
 *
 * `plusProcheM: null` reste une RÉPONSE — « rien trouvé dans la portée » — et non une
 * absence de mesure. C'est la date en base qui porte cette distinction, jamais ce champ.
 */
export function proximiteBorne(
  lieu: { lat: number; lon: number },
  bornes: readonly Borne[],
): ProximiteBorne {
  let plusProcheM: number | null = null;
  let proche: Borne | null = null;

  for (const b of bornes) {
    const d = distanceM(lieu, b);
    if (plusProcheM === null || d < plusProcheM) {
      plusProcheM = d;
      proche = b;
    }
  }

  return {
    plusProcheM: plusProcheM === null ? null : Math.round(plusProcheM),
    nom: proche?.nom ?? null,
    rapide: proche?.rapide ?? null,
    tarif: proche?.tarif ?? null,
  };
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

/**
 * Comment se dit une distance de borne — l'unité suit ce qui décide.
 *
 * Sous le seuil de marche, la DURÉE : c'est elle qui dit si on peut y aller à midi. Au-delà,
 * les KILOMÈTRES : la durée à pied n'y veut plus rien dire, et un « ~63 min » chasserait le
 * seul chiffre utile. Le « ~ » est là dans les deux cas parce que la mesure est à vol
 * d'oiseau — il n'est pas décoratif.
 */
export function libelleDistanceBorne(metres: number): string {
  if (metres < MARCHE_PLAUSIBLE_M) return `~${minutesAPied(metres)} min à pied`;
  const km = metres / 1000;
  return `${(km < 10 ? km.toFixed(1) : Math.round(km).toString()).replace(".", ",")} km`;
}

/**
 * Ce qu'on sait de la borne, en une ligne — la marque, la vitesse, le tarif.
 *
 * Chaque élément n'apparaît QUE s'il est connu : une borne sans marque relevée ne devient
 * pas « borne inconnue », elle se dit par sa seule distance. Ajouter un mot pour combler un
 * trou reviendrait à écrire ce qu'on ignore.
 */
export function libelleBorne(b: {
  nom: string | null;
  rapide: boolean | null;
  tarif: string | null;
}): string {
  const bouts: string[] = [];
  if (b.rapide === true) bouts.push("rapide");
  else if (b.rapide === false) bouts.push("standard");
  if (b.nom) bouts.push(b.nom);
  if (b.tarif) bouts.push(b.tarif);
  return bouts.join(" · ");
}

/** La boîte englobante à interroger autour d'un point, avec une marge. */
export function boiteAutour(
  lieu: { lat: number; lon: number },
  rayonM: number = PORTEE_RECHERCHE_M,
): { latMin: number; lonMin: number; latMax: number; lonMax: number } {
  // Un degré de latitude vaut ~111 km partout ; un degré de longitude rétrécit vers les
  // pôles, d'où le cosinus. À la latitude de Québec (~46,8°), un degré de longitude vaut
  // environ 76 km — ignorer ce facteur donnerait une boîte trop étroite d'un tiers.
  const dLat = rayonM / METRES_PAR_DEGRE_LAT;
  const dLon = rayonM / (METRES_PAR_DEGRE_LAT * Math.cos((lieu.lat * Math.PI) / 180));
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
 * La marge est la portée cherchée : sans elle, une borne située juste au-delà du dernier
 * employeur du lot sortirait de la boîte et « aucune borne » serait faux pour lui. Elle est
 * passée de 350 m à 15 km avec le retrait du plafond de cinq minutes — c'est exactement ce
 * que « la plus proche, où qu'elle soit » coûte en étendue de requête.
 */
export function boiteEnglobante(
  lieux: readonly { lat: number; lon: number }[],
  margeM = PORTEE_RECHERCHE_M,
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
  const dLat = margeM / METRES_PAR_DEGRE_LAT;
  const latMoyenne = ((latMin + latMax) / 2) * (Math.PI / 180);
  const dLon = margeM / (METRES_PAR_DEGRE_LAT * Math.max(Math.cos(latMoyenne), 0.01));

  return {
    latMin: latMin - dLat,
    lonMin: lonMin - dLon,
    latMax: latMax + dLat,
    lonMax: lonMax + dLon,
  };
}

/** Une grappe de lieux voisins, et la boîte qui les couvre tous. */
export interface GrappeBornes<T> {
  lieux: T[];
  boite: { latMin: number; lonMin: number; latMax: number; lonMax: number };
}

/**
 * Découpe un lot de lieux en grappes dont la boîte tient sous la garde d'étendue. PURE.
 *
 * ── LA PANNE QUE ÇA RÉPARE ───────────────────────────────────────────────────────────
 *
 * Journaux du 2026-09-14 : « boîte englobante anormalement large — interrogation annulée »,
 * puis `bornes=0/1293 (1293 en échec)`. UNE boîte pour tout le lot, UNE garde d'étendue, et
 * le lot entier refusé — **définitivement**, puisqu'un échec ne marque rien et que le lot
 * suivant contiendra exactement les mêmes lignes, donc la même boîte. Un seul lieu mal
 * géocodé (un homonyme à l'autre bout du monde) suffit à geler la mesure de 1 292 autres,
 * pour toujours, avec une ligne d'erreur par jour pour seule trace.
 *
 * ⚠️ LA GARDE N'ÉTAIT PAS FAUSSE, SON EFFET L'ÉTAIT. Refuser une requête qui ramènerait un
 * continent est juste. Ce qui ne l'est pas, c'est de faire payer ce refus à tout le lot : la
 * bonne réponse à « ces points sont trop éloignés pour UNE requête » n'est pas « aucune
 * requête », c'est « plusieurs requêtes ». La garde décide désormais du DÉCOUPAGE, plus de
 * l'abandon.
 *
 * ── POURQUOI UNE CROISSANCE GLOUTONNE, ET PAS UNE GRILLE ─────────────────────────────
 *
 * Une grille demanderait de choisir une taille de cellule — donc d'inventer un nombre, et de
 * supposer une latitude pour convertir la marge en degrés de longitude. Ici on ne suppose
 * rien : on fait grossir une grappe tant que SA VRAIE BOÎTE, marge comprise, respecte la
 * garde. La contrainte se vérifie sur l'objet réel, jamais sur une approximation.
 *
 * Le tri par latitude puis longitude n'est pas un optimum de regroupement, et il n'a pas
 * besoin de l'être : sur la forme réelle des données — un amas régional dense plus quelques
 * points isolés — il rend une grappe pour l'amas et une par isolé. Ce qui compte est que le
 * découpage soit DÉTERMINISTE (deux passes identiques donnent les mêmes grappes) et que
 * chaque boîte soit valide par construction.
 *
 * ── ET CE QUI NE PEUT PAS ÊTRE COUVERT EST NOMMÉ, PAS AVALÉ ──────────────────────────
 *
 * Un lieu dont la boîte À LUI SEUL dépasse la garde ne peut tenir dans aucune grappe (il
 * faudrait une marge plus petite que celle qu'on cherche). Il sort en `aberrants` avec son
 * objet, pour que l'appelant le NOMME : « 1 293 en échec » ne se vérifie pas, « Machin inc.
 * est à 48,8 N 2,3 E » se corrige.
 */
export function grapperPourBornes<T extends { lat: number; lon: number }>(
  lieux: readonly T[],
  etendueMaxDeg: number,
  margeM = PORTEE_RECHERCHE_M,
): { grappes: GrappeBornes<T>[]; aberrants: T[] } {
  const grappes: GrappeBornes<T>[] = [];
  const aberrants: T[] = [];

  const tient = (boite: { latMin: number; lonMin: number; latMax: number; lonMax: number }) =>
    boite.latMax - boite.latMin <= etendueMaxDeg && boite.lonMax - boite.lonMin <= etendueMaxDeg;

  const ordonnes = [...lieux].sort((a, b) => a.lat - b.lat || a.lon - b.lon);

  let courants: T[] = [];
  let boiteCourante: GrappeBornes<T>["boite"] | null = null;

  const fermer = () => {
    if (boiteCourante !== null && courants.length > 0) {
      grappes.push({ lieux: courants, boite: boiteCourante });
    }
    courants = [];
    boiteCourante = null;
  };

  for (const l of ordonnes) {
    const seul = boiteEnglobante([l], margeM);
    // Un lieu que la marge seule fait déborder n'entrera dans aucune grappe : le dire tout
    // de suite évite de le traîner et de fermer une grappe pour rien.
    if (seul === null || !tient(seul)) {
      aberrants.push(l);
      continue;
    }

    const elargie = boiteEnglobante([...courants, l], margeM);
    if (elargie !== null && tient(elargie)) {
      courants.push(l);
      boiteCourante = elargie;
      continue;
    }

    fermer();
    courants = [l];
    boiteCourante = seul;
  }
  fermer();

  return { grappes, aberrants };
}

/**
 * Le nombre de fois qu'une grappe en échec peut être coupée en deux avant qu'on renonce.
 *
 * ⚠️ IL FAUT UNE BORNE, ET PAS SEULEMENT POUR LA FORME. Sans elle, une PANNE d'Overpass —
 * par opposition à une surcharge — ferait doubler le nombre de requêtes à chaque tour : on
 * brûlerait tout le budget de la passe à découper un lot que rien ne pouvait mesurer, et le
 * journal montrerait des centaines d'échecs là où il en fallait un seul, nommé.
 *
 * Trois, parce que c'est ce que le cas réel demande : la grappe qui a échoué le 2026-09-21
 * couvrait ~168 km, et trois coupes la ramènent autour de 21 km — sous les 30 km qui avaient
 * répondu la veille. ⚠️ Ce n'est pas une mesure du seuil d'Overpass : ce seuil dépend de la
 * DENSITÉ de bornes autant que de la surface (cent kilomètres autour de Montréal ne coûtent
 * pas cent kilomètres en Gaspésie), et aucune valeur fixe ne pourrait le capturer. C'est
 * précisément pourquoi le remède est de COUPER jusqu'à ce que ça passe plutôt que de choisir
 * une étendue « assez petite » — la borne ci-dessous dit seulement quand cesser d'essayer.
 */
export const MAX_SCISSIONS_GRAPPE = 3;

/**
 * Coupe une grappe en deux, par sa dimension la plus longue. PURE.
 *
 * ⚠️ POURQUOI COUPER PLUTÔT QUE RESSERRER LA GARDE D'ÉTENDUE. `ETENDUE_MAX_DEG` existe pour
 * attraper une position ABERRANTE (un homonyme géocodé sur un autre continent) ; elle vaut 3°
 * et c'est juste pour ça. Le coût d'une requête Overpass, lui, ne dépend pas que de la
 * surface : il dépend de ce qu'il y a DEDANS. Une même boîte de cent kilomètres coûte un
 * aller-retour tranquille en Gaspésie et un HTTP 504 sur l'île de Montréal. Aucun seuil
 * d'étendue ne peut donc être « le bon », et en chercher un reviendrait à inventer un nombre
 * que la réalité démentirait au premier déplacement du lot.
 *
 * Couper sur échec ne suppose rien : la requête qui passe DIT que la grappe était assez
 * petite, celle qui échoue dit le contraire, et on n'a plus qu'à écouter.
 *
 * ⚠️ ET ÇA RÉPARE AUSSI LE VIDE SUSPECT. Une réponse vide sur une boîte plus grande qu'un
 * quartier est traitée comme un échec — à raison : l'inscrire figerait « aucune borne » sur
 * toute la grappe. Mais sans scission, cette grappe « repassait » chaque jour à l'identique,
 * pour échouer pareil. Coupée, elle finit par tenir sous `ETENDUE_VIDE_SUSPECTE_KM`, où un
 * vide devient crédible et s'inscrit enfin.
 *
 * Rend `null` quand il n'y a rien à couper — une grappe d'un seul lieu qui échoue est un
 * échec pour de bon, et l'appelant doit le NOMMER plutôt que de recommencer.
 */
export function scinderGrappe<T extends { lat: number; lon: number }>(
  grappe: GrappeBornes<T>,
  margeM = PORTEE_RECHERCHE_M,
): [GrappeBornes<T>, GrappeBornes<T>] | null {
  if (grappe.lieux.length < 2) return null;

  // La dimension la plus longue, en DEGRÉS de la boîte réelle — marge comprise, donc la
  // même grandeur que celle qui a fait échouer la requête. Couper l'autre dimension
  // laisserait la plus coûteuse intacte.
  const surLaLatitude =
    grappe.boite.latMax - grappe.boite.latMin >= grappe.boite.lonMax - grappe.boite.lonMin;

  // Tri déterministe : deux passes identiques donnent les mêmes moitiés, comme pour le
  // découpage initial. Le second critère départage les points alignés sur le premier.
  const ordonnes = [...grappe.lieux].sort((a, b) =>
    surLaLatitude ? a.lat - b.lat || a.lon - b.lon : a.lon - b.lon || a.lat - b.lat,
  );

  const milieu = Math.floor(ordonnes.length / 2);
  const basse = ordonnes.slice(0, milieu);
  const haute = ordonnes.slice(milieu);

  const boiteBasse = boiteEnglobante(basse, margeM);
  const boiteHaute = boiteEnglobante(haute, margeM);
  // Les deux moitiés sont non vides par construction (length >= 2), donc les boîtes existent.
  // On le vérifie quand même : `boiteEnglobante` rend `null` sur une liste vide, et une
  // affirmation non vérifiée sur un invariant est exactement ce qui se périme en silence.
  if (boiteBasse === null || boiteHaute === null) return null;

  return [
    { lieux: basse, boite: boiteBasse },
    { lieux: haute, boite: boiteHaute },
  ];
}
