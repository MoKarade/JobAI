// lib/lienOffre.ts — ce qu'un lien d'offre ATTEINT vraiment, et quoi proposer sinon.
//
// Demande de Marc (2026-09-14) : « les liens marchent pas forcément, je veux juste cliquer
// pour avoir l'offre ».
//
// MESURÉ le 2026-09-14 sur les 32 offres du suivi notées 60 et plus, réputées ouvertes :
//   · 14 mènent à une vraie annonce (`jobbank.gc.ca/jobsearch/jobposting/NNNNN`) ;
//   · 10 sont des jetons `to.indeed.com/<jeton>` ;
//   ·  4 sont des LISTES d'emplois d'un employeur (jobillico, « voir-liste-emplois ») ;
//   ·  4 sont des pages d'ACCUEIL (robotiq.com, emplois.ca.indeed.com, jobillico.com).
//
// ⚠️ LES 18 LIENS FAIBLES SONT EXACTEMENT LES 18 OFFRES DU JEU DE DÉPART présentes dans
// cette liste ; les 14 offres ingérées portent toutes une vraie annonce. Ce n'est donc pas
// une panne du jour : c'est ce que ces liens CONTIENNENT depuis leur saisie. Et les jetons
// Indeed sont forgés par RÉSULTAT DE RECHERCHE — ce dépôt l'a mesuré deux fois (deux jetons
// différents pour la même offre demandée deux fois), donc rien ne garantit qu'un jeton
// d'avril ouvre encore quoi que ce soit en septembre.
//
// ⚠️ CE MODULE NE TESTE PAS LE LIEN, et ne le testera jamais. Une requête vers Indeed ou
// Jobillico depuis l'app serait une requête vers une source d'offres, que le garde-fou n°4
// réserve à `lib/ingest/` — et elle ne dirait de toute façon rien de fiable (un site répond
// volontiers 200 sur une annonce retirée). On classe ce que le lien EST, jamais ce qu'il
// rend. C'est une information plus faible, et c'est la seule qui soit honnête sans réseau.
//
// ⚠️ LE DÉFAUT EST OPTIMISTE, ET C'EST DÉLIBÉRÉ. Une adresse qu'on ne sait pas classer est
// rendue « offre » : c'est le comportement d'aujourd'hui, et le seul risque est un libellé
// qui promet un peu trop. Pencher dans l'autre sens — « dans le doute, ce n'est pas une
// annonce » — collerait un avertissement sur les 14 liens qui marchent, et Marc cesserait
// de lire l'avertissement. On ne classe donc « pas une annonce » que sur une CERTITUDE
// structurelle : un chemin vide ne désigne rien, un dernier segment qui NOMME une liste
// n'est pas une annonce.

/** Ce vers quoi un lien mène RÉELLEMENT. */
export type GenreLien =
  /** Une annonce précise — ou du moins, rien ne prouve le contraire. */
  | "offre"
  /** Un site ou une page « emplois » : l'annonce est à retrouver dedans, si elle y est. */
  | "liste"
  /** Un jeton de redirection d'agrégateur : peut ouvrir l'annonce, ou plus rien. */
  | "redirection"
  /** Aucun lien, ou un lien qu'on refuse de rendre cliquable. */
  | "aucun";

/**
 * Derniers segments d'URL qui NOMMENT une liste d'emplois.
 *
 * ⚠️ LA RÈGLE PORTE SUR LE DERNIER SEGMENT, jamais sur la présence du mot quelque part.
 * « /jobs » est une liste, « /jobs/1234-coordonnateur » est une annonce : c'est le segment
 * SUIVANT qui tranche. Un motif qui cherche « emplois » n'importe où enverrait chercher sur
 * le web des liens parfaitement précis.
 *
 * Mesurée en production : seul `voir-liste-emplois` apparaît aujourd'hui. Les autres sont
 * les formes courantes du même geste. La liste est forcément incomplète — c'est pour ça que
 * le défaut reste « offre » : ce qu'elle rate garde le comportement d'avant.
 */
const SEGMENTS_DE_LISTE = new Set([
  "voir-liste-emplois",
  "emplois",
  "emploi",
  "offres-demploi",
  "offres-d-emploi",
  "jobs",
  "careers",
  "carriere",
  "carrieres",
  "carrière",
  "carrières",
]);

/** Hôtes dont les liens courts sont des jetons de redirection, pas des adresses d'annonce. */
const HOTES_DE_REDIRECTION = new Set(["to.indeed.com"]);

/**
 * Ce vers quoi ce lien mène. PURE.
 *
 * Un lien non http(s) est « aucun » : même règle que `lienSur` dans les composants et que le
 * hub — un `javascript:` ou un `data:` dans un champ de données ne devient jamais cliquable.
 */
export function classerLien(brut: string): GenreLien {
  if (!brut.trim()) return "aucun";

  let u: URL;
  try {
    u = new URL(brut);
  } catch {
    return "aucun";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "aucun";

  if (HOTES_DE_REDIRECTION.has(u.hostname.toLowerCase())) return "redirection";

  const segments = u.pathname.split("/").filter((s) => s !== "");
  // Chemin vide : une page d'accueil ne désigne aucune annonce.
  if (segments.length === 0) return "liste";

  const dernier = decodeURIComponent(segments[segments.length - 1] ?? "").toLowerCase();
  if (SEGMENTS_DE_LISTE.has(dernier)) return "liste";

  return "offre";
}

/**
 * Ce qu'on écrit SUR le lien, pour qu'il ne promette pas plus qu'il ne donne.
 *
 * Le libellé dit la DESTINATION, pas une qualité : « le site » ne veut pas dire « mauvais
 * lien », il veut dire « tu arriveras sur le site, pas sur l'annonce ». C'est ce qui permet
 * à Marc de choisir son clic au lieu de le découvrir après.
 */
export const LIBELLE_LIEN: Readonly<Record<GenreLien, string>> = {
  offre: "l’offre",
  liste: "le site",
  redirection: "lien Indeed",
  aucun: "",
};

/**
 * Faut-il proposer un second chemin ? PURE.
 *
 * Oui dès que le lien ne mène pas à une annonce précise — y compris pour une redirection,
 * qui peut très bien fonctionner. Le but n'est pas de remplacer le lien, c'est qu'il y ait
 * TOUJOURS un chemin qui aboutit : Marc a demandé « juste cliquer pour avoir l'offre », et
 * un lien qui marche une fois sur deux ne répond pas à ça.
 */
export function proposerRecherche(genre: GenreLien): boolean {
  return genre !== "offre";
}

/**
 * Une recherche web qui retrouve l'annonce, quand le lien ne la donne pas. PURE.
 *
 * ⚠️ UNE RECHERCHE, PAS UNE ADRESSE DEVINÉE. Fabriquer une URL d'annonce à partir du nom de
 * l'employeur produirait un lien qui a l'air juste et qui tombe en 404 — ce dépôt a déjà payé
 * cette erreur sur les identifiants d'ATS devinés, qui trouvaient des homonymes d'Amsterdam.
 * Une recherche ne ment pas : elle rend ce qu'elle trouve, et Marc voit tout de suite si
 * l'annonce existe encore.
 *
 * Google plutôt qu'un autre moteur pour une raison de PRODUIT, pas de goût : il indexe les
 * données structurées `JobPosting` que publient le Guichet-Emplois et Jobillico, donc une
 * annonce encore en ligne y remonte sous son titre exact.
 *
 * Les guillemets autour de l'employeur : sans eux, « Groupe Robert » rend des pages sur
 * Robert tout court. Le poste reste libre — un titre d'annonce est rarement recopié à
 * l'identique d'un site à l'autre.
 */
export function rechercheWeb(entreprise: string, poste: string): string {
  const nom = entreprise.trim();
  const requete = `${nom ? `"${nom}" ` : ""}${poste.trim()}`.trim();
  return `https://www.google.com/search?q=${encodeURIComponent(requete)}`;
}

/** Tout ce qu'un écran doit savoir pour rendre le lien d'une offre. */
export interface LienOffre {
  genre: GenreLien;
  /** L'adresse à mettre dans le `href`, ou `null` si rien ne doit devenir cliquable. */
  href: string | null;
  /** Ce qu'on écrit sur ce lien. Vide quand `href` est `null`. */
  libelle: string;
  /** Le second chemin, ou `null` quand le lien mène déjà à l'annonce. */
  recherche: string | null;
}

/**
 * Le lien d'une offre, classé et accompagné. PURE.
 *
 * ⚠️ UN SEUL APPEL POUR LE GENRE ET POUR L'ADRESSE. Écrits séparément — un `classerLien`
 * ici, un `lienSur` là — les deux règles finiraient par diverger : l'écran afficherait
 * « le site » sur un lien qu'il a refusé de rendre cliquable, ou l'inverse. Ce dépôt a déjà
 * payé cette exacte divergence sur la classification des pannes de base de données.
 */
export function lienDeOffre(brut: string, entreprise: string, poste: string): LienOffre {
  const genre = classerLien(brut);
  const recherche = proposerRecherche(genre) ? rechercheWeb(entreprise, poste) : null;
  if (genre === "aucun") return { genre, href: null, libelle: "", recherche };
  // `new URL(...).href` normalise ce que le champ contient ; le parse a déjà réussi dans
  // `classerLien`, sinon le genre serait « aucun ».
  return { genre, href: new URL(brut).href, libelle: LIBELLE_LIEN[genre], recherche };
}
