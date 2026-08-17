// lib/ingest/region.ts — une offre est-elle dans la région de Marc ?
//
// POURQUOI CE FICHIER EXISTE — un trou mesuré, pas supposé
// La première sonde des vraies sources (2026-07-31) a retenu UNE offre, et c'était
// « Superviseur de l'entretien ménager — campement minier fly-in/fly-out », vraisemblablement
// au Manitoba. Notée 68 sur 100. L'ingestion n'avait AUCUN filtre géographique : le critère
// numéro un de Marc — 50 km — n'existait nulle part dans le pipeline.
//
// Le barème ne pouvait pas l'attraper : il pénalise une distance INCONNUE de 10 points sur
// 20, ce qui laisse largement de quoi passer un seuil. « Inconnue » et « à 2 000 km » y sont
// traitées pareil, parce que le barème a été écrit pour des offres déjà triées à la main.
//
// LA RÈGLE, ET SON DÉFAUT ASSUMÉ
// Une offre n'entre que si sa ville est RECONNUE comme étant de la grande région de Québec.
// Une ville absente ou inconnue est REFUSÉE — pas parce qu'elle est forcément loin, mais
// parce qu'une ingestion automatique ne doit pas parier. Le prix : on rate une offre proche
// dont la ville est écrite d'une façon qu'on ne connaît pas. Le prix inverse — laisser
// entrer des postes à l'autre bout du pays — est bien plus cher : il détruit la confiance
// dans la liste entière, et Marc ne peut le détecter qu'en ouvrant chaque lien.
//
// Les refus sont COMPTÉS et leur motif est distinct des autres : « hors région » et « sous
// le plancher » ne se mélangent pas dans un total muet.

/**
 * Municipalités de la grande région de Québec, incluant Chaudière-Appalaches et Portneuf
 * — l'aire réellement couverte par un rayon de 50 km, plus quelques marges.
 *
 * Écrites SANS accent et en minuscules : la comparaison normalise des deux côtés, sinon
 * « Lévis » et « Levis » deviennent deux villes différentes, et les sources écrivent les
 * deux. Les arrondissements sont là parce qu'une annonce dit « Sainte-Foy », pas « Québec ».
 */
const MUNICIPALITES = [
  "quebec", "levis", "sainte-foy", "ste-foy", "beauport", "charlesbourg", "sillery",
  "cap-rouge", "vanier", "loretteville", "neufchatel", "val-belair", "lac-saint-charles",
  "ancienne-lorette", "saint-augustin", "st-augustin", "saint-nicolas", "st-nicolas",
  "saint-romuald", "st-romuald", "charny", "breakeyville", "pintendre", "lauzon",
  "boischatel", "chateau-richer", "sainte-anne-de-beaupre", "beaupre", "stoneham",
  "lac-beauport", "shannon", "sainte-brigitte", "wendake", "l'ancienne-lorette",
  "saint-anselme", "st-anselme", "sainte-marie", "ste-marie", "scott", "saint-lambert-de-lauzon",
  "saint-apollinaire", "st-apollinaire", "laurier-station", "saint-agapit", "issoudun",
  "sainte-claire", "ste-claire", "saint-henri", "st-henri", "saint-charles", "beaumont",
  "saint-damien", "st-damien", "saint-raphael", "armagh", "honfleur", "saint-gervais",
  "donnacona", "pont-rouge", "portneuf", "cap-sante", "neuville", "saint-raymond",
  "sainte-catherine-de-la-jacques-cartier", "fossambault", "courcelette", "valcartier",
  "saint-bernard", "st-bernard", "saint-isidore", "st-isidore", "saint-narcisse",
  "sainte-marguerite", "ste-marguerite", "frampton", "saint-elzear", "vallee-jonction",
  "saint-joseph-de-beauce", "l'ange-gardien", "ange-gardien", "sainte-petronille",
  "saint-pierre-de-l'ile-d'orleans", "saint-laurent-de-l'ile-d'orleans", "montmagny",
  "berthier-sur-mer", "cap-saint-ignace", "saint-vallier", "saint-michel-de-bellechasse",

  // ── Élargissement du 2026-08-17, avec le rayon 50 → 75 km ────────────────────────────
  // Ces municipalités étaient DÉJÀ dans le rayon nominal une fois celui-ci porté à 75 km,
  // mais absentes de la liste — donc leurs offres étaient refusées « hors région » alors
  // qu'elles sont plus proches que Montmagny, qui y figurait. Le rayon et la liste doivent
  // décrire la MÊME aire : quand l'un bouge, l'autre le suit dans le même commit, sinon le
  // plus restrictif des deux gagne en silence et l'élargissement ne sert à rien.
  // Beauce (axe 73 sud) :
  "sainte-marie-de-beauce", "saint-elzear-de-beauce", "saint-severin", "tring-jonction",
  "saint-frederic", "saint-victor", "beauceville", "saint-odilon", "saint-jules",
  // Lotbinière et Bécancour (rive sud, axe 20 ouest) :
  "lotbiniere", "sainte-croix", "leclercville", "dosquet", "saint-flavien",
  "val-alain", "saint-janvier-de-joly", "saint-edouard-de-lotbiniere",
  // Portneuf (axe 40 ouest) :
  "saint-basile", "saint-marc-des-carrieres", "deschambault", "grondines",
  "saint-alban", "saint-casimir", "riviere-a-pierre", "saint-ubalde",
  // Charlevoix et côte de Beaupré (axe 138 est) :
  "saint-ferreol-les-neiges", "saint-tite-des-caps", "baie-saint-paul",
  "petite-riviere-saint-francois", "saint-joachim",
  // Bellechasse et Montmagny (axe 20 est) :
  "saint-jean-port-joli", "l'islet", "saint-paul-de-montminy", "buckland",
  "saint-nerée", "saint-lazare-de-bellechasse", "sainte-justine",
  // Jacques-Cartier nord :
  "saint-gabriel-de-valcartier", "tewkesbury", "sainte-christine",
] as const;

/**
 * Villes explicitement HORS de portée, malgré leur présence au Québec ou au Canada.
 *
 * Nommées plutôt que déduites : « Montréal » est à 250 km, mais rien dans son nom ne le dit.
 * Sans cette liste, une offre montréalaise dont la ville n'est pas reconnue serait refusée
 * pour la bonne raison mais par hasard — et le jour où on assouplirait la règle des villes
 * inconnues, elle passerait.
 */
const HORS_PORTEE = [
  "montreal", "laval", "longueuil", "gatineau", "ottawa", "sherbrooke", "trois-rivieres",
  "saguenay", "chicoutimi", "jonquiere", "rimouski", "sept-iles", "val-d'or", "rouyn",
  "drummondville", "granby", "saint-hyacinthe", "sorel", "joliette", "repentigny",
  "terrebonne", "brossard", "toronto", "vancouver", "calgary", "edmonton", "winnipeg",
  "halifax", "moncton", "regina", "saskatoon", "manitoba", "ontario", "alberta",
  "british columbia", "colombie-britannique", "nouveau-brunswick", "nova scotia",
  "nouvelle-ecosse", "saskatchewan", "terre-neuve", "newfoundland", "yukon", "nunavut",
] as const;

/** Sans accent, en minuscules, ponctuation ramenée à des espaces. */
export function normaliserLieu(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[,;()/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type VerdictRegion = "dans-la-region" | "hors-region" | "lieu-inconnu";

/**
 * Où se trouve cette offre ?
 *
 * Trois réponses, pas deux : « hors région » et « lieu inconnu » sont des situations
 * différentes, et les confondre empêcherait de voir qu'une source a cessé d'indiquer les
 * villes — un cas où la veille se tairait pour une raison qui n'a rien à voir avec le marché.
 */
export function situer(
  ville: string,
  texteAppoint = "",
  /**
   * Les lieux déjà JUGÉS PAR LA MESURE, par nom normalisé (`lib/ingest/lieux.ts`).
   *
   * ⚠️ C'EST LA SORTIE DU PARI. Les deux listes ci-dessus ne connaissent que les noms qu'on
   * a pensé à y écrire : le 2026-08-17, quarante-sept offres ont été jetées « lieu inconnu »
   * en une passe, sans qu'on sache si elles étaient à vingt kilomètres ou à trois mille.
   * Le registre porte la réponse MESURÉE — la distance réelle du centre de ce lieu au
   * domicile — pour les noms sur lesquels les listes n'ont rien à dire.
   *
   * Il est consulté APRÈS elles, jamais avant : quand un nom est déjà connu, la mesure ne
   * peut rien ajouter et coûterait une requête. Un défaut vide garde le comportement exact
   * d'avant, ce qui laisse tous les appelants — et tous les tests — inchangés.
   */
  resolus: ReadonlyMap<string, "dans-la-region" | "hors-region"> = new Map(),
): VerdictRegion {
  const lieu = normaliserLieu(ville);
  if (lieu === "") return "lieu-inconnu";

  // Le rejet passe AVANT l'acceptation : « Québec » apparaît dans « Montréal, Québec »
  // (la province), et sans cette priorité toute offre montréalaise entrerait.
  if (HORS_PORTEE.some((h) => lieu.includes(h))) return "hors-region";
  if (MUNICIPALITES.some((m) => lieu.includes(m))) return "dans-la-region";

  // Ce que la MESURE a tranché pour ce nom exact. Correspondance stricte, pas par
  // sous-chaîne comme les listes : le registre est keyé sur la chaîne normalisée complète,
  // et un `includes` y ferait passer « saint-georges » pour « saint-georges-de-beauce ».
  const mesure = resolus.get(lieu);
  if (mesure !== undefined) return mesure;

  // Dernier recours : la description mentionne parfois la ville quand le champ est vague
  // (« Canada », « Remote »). On ne s'en sert QUE pour accepter, jamais pour rejeter.
  const appoint = normaliserLieu(texteAppoint);
  if (appoint !== "" && MUNICIPALITES.some((m) => appoint.includes(m))) {
    if (!HORS_PORTEE.some((h) => appoint.includes(h))) return "dans-la-region";
  }

  return "lieu-inconnu";
}

/** Raccourci : une offre entre-t-elle, du seul point de vue du lieu ? */
export function estDansLaRegion(ville: string, texteAppoint = ""): boolean {
  return situer(ville, texteAppoint) === "dans-la-region";
}
