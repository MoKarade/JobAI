// lib/scoring.ts — le barème de fit, sur 100.
//
// La note mesure l'adéquation d'une offre AU PROFIL DE MARC, pas la qualité absolue de
// l'offre : une excellente offre de technicien à 40 km note bas ici, et c'est voulu.
// Le barème est affiché dans l'interface — une note qu'on ne peut pas expliquer ne sert
// à rien, et pire, elle inspire une confiance qu'elle n'a pas méritée.
//
// Ces fonctions sont PURES : aucune I/O, aucune dépendance à l'horloge. C'est ce qui
// permet de rejouer le barème sur les offres de référence à chaque modification.
//
// ⚠️ DEPUIS ADR-0009, LES VALEURS NE VIVENT PLUS ICI : elles viennent d'un `Profil`
// (`lib/profil.ts`), et chaque fonction en prend un en dernier paramètre, `PROFIL_DEFAUT`
// par défaut. Ce défaut porte EXACTEMENT les valeurs d'avant — `tests/profil.test.ts` le
// prouve en rejouant le jeu de référence note par note. Sans cette preuve, sortir le barème
// du code serait indistinguable d'une régression silencieuse de la notation.
//
// Les constantes historiques (`PONDERATION`, `RAYON_MAX_KM`, `PALIERS_DISTANCE_KM`,
// `PLAFOND_NOTE_CALCULEE`) restent exportées et DÉRIVENT du profil par défaut : les écrans
// qui les affichent n'ont pas eu à changer, et surtout elles ne peuvent plus diverger de ce
// que le barème applique réellement.
//
// ⚠️ NE JAMAIS APPELER CES FONCTIONS SANS PARENTHÈSES : `xs.map(scoreDistance)` passe
// (valeur, INDEX, tableau) — l'index atterrit dans le paramètre `profil`. Écrire
// `xs.map((km) => scoreDistance(km))`. Aujourd'hui la méprise LÈVE (un nombre n'a pas de
// `.paliersDistanceKm`), donc elle se voit ; le jour où un paramètre ajouté aura un défaut
// numérique plausible, elle ne lèvera plus — elle notera faux, sans rien dire.

import { PROFIL_DEFAUT, type Profil } from "./profil";
import { expressionsDeNotation } from "./competences";
import { codeRetenu, lireCodeNoc, niveauDomaine, type NiveauDomaine } from "./nocProfession";

/** Répartition des points. La somme fait 100 — vérifié par test, pas par confiance. */
export const PONDERATION = PROFIL_DEFAUT.ponderation;

/**
 * Plafond des notes CALCULÉES.
 *
 * Une note calculée ne lit que des champs structurés ; une note manuelle vient de la
 * lecture réelle de l'offre. Les plafonner en dessous du seuil A (80) serait excessif —
 * une offre calculée doit pouvoir être signalée comme excellente. Mais elles ne doivent
 * jamais passer DEVANT une offre vérifiée à la main de note maximale.
 */
export const PLAFOND_NOTE_CALCULEE = PROFIL_DEFAUT.plafondNoteCalculee;

/** Rayon au-delà duquel une offre n'est pas retenue. Critère n°1 déclaré. */
export const RAYON_MAX_KM = PROFIL_DEFAUT.rayonMaxKm;

/**
 * Retire les marques d'écriture inclusive avant toute recherche de motif.
 *
 * Sans ça, « Chargé(e) de projets » ne correspond PAS à « chargé de projet » : le `(e)`
 * coupe l'expression en deux et le poste tombe à 8 sur 40 — le score d'un métier sans
 * aucun rapport. Les mots isolés (« coordonnateur(trice) ») s'en sortaient par hasard,
 * la marque tombant après le mot ; les EXPRESSIONS, elles, étaient toutes cassées.
 * L'écriture inclusive est la norme dans les annonces québécoises : c'est le cas
 * courant, pas l'exception.
 */
export function normaliserTitre(s: string): string {
  return s
    .toLowerCase()
    // ⚠️ LES ACCENTS SE REPLIENT AUSSI (ADR-0017). Cinq mots du barème en portent
    // (`chargé de projet`, `chef d'équipe`, `électromécanique`…) : sans ce repli, un titre
    // écrit « Charge de projet » ou « Electromecanicien » ne les atteint pas et tombe à
    // `horsSujet` — 8 sur 40, la note d'un métier sans rapport. Même mécanisme que le `(e)`
    // ci-dessous, laissé à moitié corrigé.
    //
    // ⚠️ ET ELLE DOIT S'APPLIQUER DES DEUX CÔTÉS. `scoreFitRole` replie les mots du profil par
    // CETTE fonction avant de comparer. Un repli asymétrique serait PIRE que pas de repli : il
    // ferait cesser de matcher les titres accentués, qui sont aujourd'hui la totalité du
    // corpus (mesuré le 2026-09-17 : 33 offres « chargé de projet », 0 sans accent).
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\((?:e|s|es|ne|nes|trice|trices|ice|ices|euse|euses|rice|rices)\)/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Un mot entier, pas un morceau de mot (ADR-0033). `ros` n'est pas dans « prosthesis », `unity` n'est
 * pas dans « community ». Le pluriel simple passe (`s`), les chiffres et lettres voisins non.
 * Le texte et le terme arrivent déjà repliés par `normaliserTitre`.
 */
const MOTS_ENTIERS = new Map<string, RegExp>();
export function contientMot(texteReplie: string, terme: string): boolean {
  if (terme === "") return false;
  let re = MOTS_ENTIERS.get(terme);
  if (re === undefined) {
    // Un terme court n'accepte pas le pluriel (« ros » ne trouve pas « Ross ») mais accepte une
    // version collée (« ROS2 »). Un terme long accepte le pluriel simple.
    const pluriel = terme.length > 3 ? "s?" : "\\d?";
    const source = terme.replace(/[-–—]/g, " ").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = new RegExp(`(?<![a-z0-9])${source}${pluriel}(?![a-z0-9])`);
    MOTS_ENTIERS.set(terme, re);
  }
  return re.test(texteReplie.replace(/[-–—]/g, " "));
}

interface TermeTechnique {
  /** Le terme tel que le profil l'écrit (pour le diagnostic). */
  brut: string;
  /** Le terme, replié. */
  terme: string;
  /** Vrai = vocabulaire d'origine du barème, comparé comme depuis ADR-0013 (morceau de mot permis). */
  sousChaine: boolean;
}

let origineTechnique: ReadonlySet<string> | undefined;

/**
 * Tout ce qui fait d'un texte un texte « technique » pour ce profil.
 *
 * ⚠️ DEUX RÉGIMES, VOLONTAIRES. Le vocabulaire d'origine (expressions choisies à la main, ADR-0013)
 * garde sa comparaison par sous-chaîne : « robotic » doit continuer à trouver « robotics », et
 * changer cela déplacerait des notes sans mesure. Tout le reste — termes ajoutés depuis un CV avant
 * ADR-0033, expressions de la fiche de compétences — se compare par MOTS ENTIERS.
 */
function termesTechniques(profil: Profil): TermeTechnique[] {
  origineTechnique ??= new Set(PROFIL_DEFAUT.motsTechnique.map(normaliserTitre));
  const vus = new Set<string>();
  const sortie: TermeTechnique[] = [];
  const ajouter = (brut: string, origineBrut: boolean) => {
    const terme = normaliserTitre(brut);
    if (terme === "" || vus.has(terme)) return;
    vus.add(terme);
    sortie.push({ brut, terme, sousChaine: origineBrut && (origineTechnique?.has(terme) ?? false) });
  };
  for (const m of profil.motsTechnique) ajouter(m, true);
  for (const e of expressionsDeNotation(profil.faits.competences)) ajouter(e, false);
  return sortie;
}

function correspond(texteReplie: string, x: TermeTechnique): boolean {
  return x.sousChaine ? texteReplie.includes(x.terme) : contientMot(texteReplie, x.terme);
}

/** Les termes techniques d'un texte (pour le diagnostic) : ceux que `scoreFitRole` a vus. */
export function motsTechniqueDe(texte: string, profil: Profil): string[] {
  const t = normaliserTitre(texte);
  return termesTechniques(profil)
    .filter((x) => correspond(t, x))
    .map((x) => x.brut);
}

/** Le rôle que le barème lit dans un titre : une des cinq lignes de `profil.pointsRole`. */
export type RoleLu = keyof Profil["pointsRole"];

/**
 * Le rôle que les MOTS-CLÉS lisent dans un titre (et une description). PURE.
 *
 * ⚠️ UNE SEULE LECTURE : `scoreFitRole` en tire ses points, et la lecture du modèle (`lib/lectureAnnonce.ts`, ADR-0039)
 * se compare à CE rôle-là, ligne pour ligne. Deux vocabulaires finiraient par diverger.
 */
export function roleDe(titre: string, description = "", profil: Profil = PROFIL_DEFAUT): RoleLu {
  const t = normaliserTitre(`${titre} ${description}`);
  // Les mots du profil passent par LA MÊME fonction que le titre (ADR-0017) : ils sont saisis
  // par Marc depuis `/profil`, donc rien ne garantit leur graphie — et comparer une forme
  // repliée à une forme brute ne trouverait plus rien.
  const coord = profil.motsCoordination.some((m) => t.includes(normaliserTitre(m)));
  const tech = termesTechniques(profil).some((x) => correspond(t, x));
  // « technicien » sans encadrement = recul hiérarchique par rapport au poste actuel.
  const technicien = /\btechnicien/.test(t) && !coord;

  if (coord && tech) return "combinaison"; // la combinaison recherchée
  if (coord) return "coordination"; // encadrement sans contenu technique
  if (tech && !technicien) return "technique"; // technique sans encadrement
  if (technicien) return "technicien";
  return "horsSujet";
}

/** 40 pts — le poste combine-t-il coordination d'équipe ET contenu technique ? */
export function scoreFitRole(titre: string, description = "", profil: Profil = PROFIL_DEFAUT): number {
  return profil.pointsRole[roleDe(titre, description, profil)];
}

/**
 * Les paliers de distance du barème, du plus proche au plus lointain.
 *
 * ⚠️ EXPORTÉ POUR QUE L'INTERFACE LES LISE AU LIEU DE LES RECOPIER. La jauge affichée sous
 * chaque distance allume un segment par palier atteint : si elle portait sa propre liste de
 * seuils, les deux dériveraient au premier ajustement du barème et l'écran se mettrait à
 * décrire un calcul qui n'existe plus. Une règle, un exemplaire.
 */
export const PALIERS_DISTANCE_KM: readonly { readonly max: number; readonly points: number }[] =
  PROFIL_DEFAUT.paliersDistanceKm;

/** 20 pts — distance depuis le domicile. */
export function scoreDistance(km: number | null | undefined, profil: Profil = PROFIL_DEFAUT): number {
  // Distance inconnue : note NEUTRE, jamais 0. Un 0 dirait « c'est loin », or on ne sait pas.
  if (km == null) return profil.distanceInconnue;
  if (km > profil.rayonMaxKm) return 0;
  // Au-delà du dernier palier mais dans le rayon : le plancher du barème.
  return profil.paliersDistanceKm.find((p) => km <= p.max)?.points ?? profil.distancePlancher;
}

/**
 * Les années en toutes lettres (`un` à `quinze`) — ADR-0024. `un`/`une` valent 1 : le genre
 * ne change pas la quantité. Au-delà de quinze, une exigence écrite en lettres est assez
 * rare pour rester hors périmètre plutôt que d'allonger la table sans cas réel pour la
 * justifier (le seul cas connu, l'offre Dracon, s'arrête à « cinq »).
 */
const ANNEES_EN_LETTRES: Readonly<Record<string, number>> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7,
  huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15,
};
const MOT_ANNEES = Object.keys(ANNEES_EN_LETTRES).join("|");
/**
 * Deuxième essai, en toutes lettres, MÊME logique de capture que le motif chiffré : le
 * PREMIER nombre rencontré est retenu, jamais le second d'un intervalle. C'est la règle déjà
 * en place pour les intervalles chiffrés (`tests/scoring.test.ts` : « 5-10 ans » égale
 * « 5 ans ») — un intervalle en lettres suit la même convention, pas une nouvelle.
 */
const RE_ANNEES_EN_LETTRES = new RegExp(
  `\\b(${MOT_ANNEES})\\b\\s*(?:à|-|a)?\\s*(?:\\b(?:${MOT_ANNEES})\\b)?\\s*an(?:s|nées)?\\s+d['’]exp`,
  "i",
);

/**
 * Le minimum d'années exigé, lu dans le texte — chiffres d'abord, lettres ensuite. `null` si
 * rien de reconnaissable : c'est `scoreSeniorite` qui décide alors du repli neutre, pas cette
 * fonction (elle ne connaît pas le profil).
 */
function anneesMinExigees(description: string): number | null {
  // « 5 ans d'expérience », « 5-10 ans d'expérience », « 2 à 3 années d'expérience ».
  const chiffre = description.match(/(\d+)\s*(?:à|-|a)?\s*\d*\s*an(?:s|nées)?\s+d['’]exp/i);
  if (chiffre) {
    const min = Number.parseInt(chiffre[1] ?? "", 10);
    return Number.isFinite(min) ? min : null;
  }
  // « trois à cinq années d'expérience » (offre Dracon, réelle, BACKLOG.md 2026-07-29).
  const lettres = description.match(RE_ANNEES_EN_LETTRES);
  const mot = lettres?.[1];
  return mot ? (ANNEES_EN_LETTRES[mot.toLowerCase()] ?? null) : null;
}

/** 15 pts — l'exigence de séniorité est-elle atteignable avec l'expérience de Marc ? */
export function scoreSeniorite(
  description = "",
  profil: Profil = PROFIL_DEFAUT,
  /**
   * L'expérience exigée publiée par la source, en mois (ADR-0026). Quand elle existe, elle PRIME sur
   * la lecture du texte : un champ structuré ne se trompe pas de phrase. Années entières par le bas
   * (7 mois → 0 an), comme la borne basse des intervalles (ADR-0024).
   */
  experienceMois: number | null = null,
): number {
  const min = experienceMois != null ? Math.floor(experienceMois / 12) : anneesMinExigees(description);
  if (min === null) return profil.senioriteNonPrecisee; // non précisé : l'absence d'exigence n'est pas un obstacle
  return profil.paliersSeniorite.find((p) => min <= p.max)?.points ?? profil.senioritePlancher;
}

/** 15 pts — salaire annuel affiché, comparé au marché régional. */
export function scoreSalaire(salaireAnnuel: number | null, profil: Profil = PROFIL_DEFAUT): number {
  // Non affiché : neutre. La majorité des offres n'affichent rien, les pénaliser
  // reviendrait à noter la politique de communication de l'employeur, pas le poste.
  if (salaireAnnuel == null || !Number.isFinite(salaireAnnuel)) return profil.salaireNonAffiche;
  return profil.paliersSalaire.find((p) => salaireAnnuel >= p.min)?.points ?? profil.salairePlancher;
}

/** 10 pts — friction liée au statut migratoire. */
export function scoreImmigration(description = "", profil: Profil = PROFIL_DEFAUT): number {
  const t = description.toLowerCase();
  if (profil.motsDisqualifiants.some((m) => t.includes(m))) return 0;
  // Un ordre professionnel n'est pas une barrière absolue, mais un délai et une démarche.
  if (/ordre des ingénieurs|oiq|ing\.\s|membre de l['’]ordre/.test(t)) return profil.immigrationOrdre;
  return profil.immigrationLibre;
}

/**
 * Les conditions d'emploi publiées par une source (ADR-0014, D2). PURE.
 *
 * Marc a demandé que « permanent » et « temps plein » pèsent. Le flux du Guichet publie
 * `jobtype` et `workterm` ; les autres sources n'en publient aucun.
 *
 * ⚠️ RIEN DE PUBLIÉ ⇒ NEUTRE FAVORABLE, jamais zéro. C'est la règle déjà tenue par la
 * distance inconnue, le salaire non affiché et le code de profession absent : une absence
 * d'information n'est pas un défaut du POSTE. Et la mettre au maximum serait pire encore —
 * ça récompenserait le silence de l'employeur.
 *
 * La lecture est volontairement TOLÉRANTE sur la forme (français comme anglais, casse et
 * accents ignorés) : ces champs sont du texte libre chez la source, et un motif trop strict
 * rendrait « non publié » sur des valeurs parfaitement lisibles — donc un neutre là où on
 * avait l'information.
 */
export function scoreConditions(
  typePoste: string | null | undefined,
  dureeEmploi: string | null | undefined,
  profil: Profil = PROFIL_DEFAUT,
): number {
  const net = (v: string | null | undefined) =>
    typeof v === "string" ? v.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "") : "";
  const t = net(typePoste);
  const d = net(dureeEmploi);
  const p = profil.pointsConditions;

  if (t === "" && d === "") return p.nonPublie;

  // « Temps plein » se dit aussi « full time » / « full-time » dans le flux.
  const plein = /temps\s*plein|full[\s-]?time/.test(t) || /temps\s*plein|full[\s-]?time/.test(d);
  const partielHoraire = /temps\s*partiel|part[\s-]?time/.test(t) || /temps\s*partiel|part[\s-]?time/.test(d);
  const permanent = /permanent|indetermine|regulier/.test(d) || /permanent|indetermine|regulier/.test(t);
  // ⚠️ `term` EST ANCRÉ, et ce n'est pas une précaution : « indetermine » CONTIENT « term ».
  // Sans les bornes de mot, un poste permanent annoncé « Indéterminé » était classé
  // précaire — le piège de sous-chaîne que ce dépôt a déjà payé sur les symboles boursiers
  // et les noms de fonds. Attrapé par un test, pas par la relecture.
  const MOTIFS_PRECAIRE =
    /temporaire|saisonnier|contractuel|contrat|temporary|seasonal|casual|\bterm\b/;
  const precaire = MOTIFS_PRECAIRE.test(d) || MOTIFS_PRECAIRE.test(t);

  // Le précaire l'emporte sur le reste : un contrat de trois mois à temps plein reste un
  // contrat de trois mois.
  if (precaire || partielHoraire) return p.precaire;
  if (permanent && plein) return p.ideal;
  if (permanent || plein) return p.partiel;
  // Des champs publiés mais qu'on ne sait pas lire : neutre, comme s'ils étaient absents.
  return p.nonPublie;
}

/**
 * Le facteur de domaine (ADR-0013, D1). PURE.
 *
 * ⚠️ LES DEUX CAS NEUTRES SONT LA DÉCISION, PAS UNE COMMODITÉ.
 *
 * `metiers` vide ⇒ 1 : tant que Marc n'a pas choisi ses codes, le mécanisme est INERTE.
 * C'est ce qui rend le changement de barème sans effet sur l'existant, et c'est ce que
 * l'audit du 2026-08-20 a vérifié (0 offre du seed ne bouge).
 *
 * Code ABSENT ou ILLISIBLE ⇒ 1 : une offre sans code — dépôt Indeed, API d'entreprise,
 * saisie manuelle — n'est pas hors domaine, elle est de domaine INCONNU. Rendre le facteur
 * de pénalité ici diviserait par deux tout le suivi actuel, dont aucune offre ne porte de
 * code. La mutation qui fait exactement ça déplace 53 offres sur 53 : c'est le test qui
 * prouve que cette ligne travaille.
 */
export function facteurDomaine(
  noc: string | null | undefined,
  metiers: readonly string[],
  profil: Profil = PROFIL_DEFAUT,
): number {
  if (metiers.length === 0) return 1;
  const code = lireCodeNoc(noc);
  if (code === null) return 1;
  return codeRetenu(code, metiers) ? 1 : profil.facteurHorsDomaine;
}

/**
 * Le plancher de rôle posé par le code de profession (ADR-0013, D2). PURE.
 *
 * Quand le NOC dit que l'offre EST du métier de Marc, `scoreFitRole` ne peut pas rendre
 * moins que les points de coordination — même si son vocabulaire ne sait pas lire le titre.
 * Un classement officiel vaut au moins un mot-clé trouvé dans une annonce.
 *
 * ⚠️ IL NE FAIT QUE RELEVER. Une offre dont le titre porte la combinaison recherchée garde
 * ses points pleins : `Math.max`, jamais une affectation.
 */
export function plancherRoleNoc(
  role: number,
  noc: string | null | undefined,
  metiers: readonly string[],
  profil: Profil = PROFIL_DEFAUT,
): number {
  if (metiers.length === 0) return role;
  const code = lireCodeNoc(noc);
  if (code === null || !codeRetenu(code, metiers)) return role;
  return Math.max(role, profil.pointsRole.coordination);
}

/**
 * Le plafond que le domaine gradué pose à un niveau (ADR-0038). PURE.
 * `retenu` et `inconnu` n'en ont pas : un métier retenu n'est borné que par le plafond des notes calculées, et une
 * offre sans code (ou sans métier retenu) n'est pas jugée.
 */
export function plafondDuNiveau(niveau: NiveauDomaine, profil: Profil = PROFIL_DEFAUT): number | null {
  if (niveau === "voisin") return profil.plafondVoisin;
  if (niveau === "autre") return profil.plafondHorsDomaine;
  return null;
}

export interface DetailNote {
  /** Note finale, plafonnée si elle est calculée. */
  total: number;
  /** Somme des composantes AVANT plafond — utile pour expliquer un écrêtage. */
  brut: number;
  parts: Record<keyof typeof PONDERATION, number>;
  /**
   * Le facteur de domaine appliqué (ADR-0013). 1 quand rien ne l'a abaissé.
   *
   * ⚠️ SANS CE CHAMP, UNE NOTE DEVIENT INEXPLICABLE. Une offre à 29 dont les parts
   * additionnent 58 se lit comme un bug tant qu'on ne voit pas le ×0,5 — et c'est
   * précisément le cas le plus fréquent une fois le flux du Guichet branché.
   */
  facteurDomaine: number;
  /**
   * Le niveau de domaine de l'offre (ADR-0038) : `retenu`, `voisin`, `autre` ou `inconnu`.
   * Toujours calculé, même quand le profil ne gradue pas : l'aperçu s'en sert pour dire ce qui bougerait.
   */
  niveauDomaine: NiveauDomaine;
  /**
   * Le plafond posé par le domaine (domaine gradué seulement), sinon `null`.
   * ⚠️ Un plafond n'est pas une note : une offre à 38 sous un plafond de 40 n'est pas touchée.
   */
  plafondDomaine: number | null;
  /**
   * La version de profil qui a produit cette note.
   *
   * ⚠️ SANS ELLE, UNE NOTE DEVIENT INEXPLICABLE au premier changement de barème : « pourquoi
   * 71 ? » n'a de réponse que si on sait AVEC QUEL PROFIL. Marc ayant choisi la re-notation
   * immédiate à chaque validation (ADR-0009), l'app connaîtra plusieurs barèmes dans sa vie —
   * c'est ce champ qui empêche de les confondre.
   */
  profilVersion: number;
}

/**
 * Calcule la note d'une offre à partir de ses champs structurés.
 * Le résultat est PLAFONNÉ : voir `plafondNoteCalculee`.
 */
export function computeScore(
  input: {
    titre: string;
    description?: string;
    km?: number | null;
    salaireAnnuel?: number | null;
    /** Code de profession NOC 2021 de l'offre, quand la source en publie un. */
    noc?: string | null;
    /** Type de poste publié par la source (« Temps plein », « Full time »…). */
    typePoste?: string | null;
    /** Durée d'emploi publiée par la source (« Permanent », « Temporaire »…). */
    dureeEmploi?: string | null;
    /** Expérience exigée publiée par la source, en mois (ADR-0026). Prime sur le texte. */
    experienceMois?: number | null;
  },
  profil: Profil = PROFIL_DEFAUT,
  /**
   * Les codes de métier retenus par Marc. Vide par défaut ⇒ le domaine ne pèse RIEN,
   * et les ~200 appels existants gardent exactement leur note (audit du 2026-08-20).
   */
  metiers: readonly string[] = [],
): DetailNote {
  const parts = {
    fitRole: plancherRoleNoc(
      scoreFitRole(input.titre, input.description, profil),
      input.noc,
      metiers,
      profil,
    ),
    distance: scoreDistance(input.km, profil),
    seniorite: scoreSeniorite(input.description, profil, input.experienceMois ?? null),
    salaire: scoreSalaire(input.salaireAnnuel ?? null, profil),
    immigration: scoreImmigration(input.description, profil),
    conditions: scoreConditions(input.typePoste, input.dureeEmploi, profil),
  };
  const brut = Object.values(parts).reduce((a, b) => a + b, 0);
  const niveau = niveauDomaine(input.noc, metiers);
  // ⚠️ GRADUÉ OU NON, JAMAIS LES DEUX. Domaine gradué : le plafond par niveau remplace le multiplicateur (le
  // facteur affiché reste 1, sinon une offre serait pénalisée deux fois). Sinon : le barème d'avant, à l'identique.
  const facteur = profil.domaineGradue ? 1 : facteurDomaine(input.noc, metiers, profil);
  const plafondDomaine = profil.domaineGradue ? plafondDuNiveau(niveau, profil) : null;
  // ⚠️ ARRONDI AVANT LE PLAFOND, et une seule fois : `brut` reste la somme des parts (il
  // sert à expliquer un écrêtage), c'est le TOTAL qui porte le facteur. Les afficher tous
  // deux évite la question « pourquoi 29 alors que ça fait 58 ».
  const plafonne = Math.min(Math.round(brut * facteur), profil.plafondNoteCalculee);
  return {
    total: plafondDomaine === null ? plafonne : Math.min(plafonne, plafondDomaine),
    brut,
    parts,
    facteurDomaine: facteur,
    niveauDomaine: niveau,
    plafondDomaine,
    profilVersion: profil.version,
  };
}

export type Palier = "A" | "B" | "C";

/**
 * Seuils des paliers — EXPORTÉS pour que la légende de la carte les LISE au lieu de les
 * recopier : un seuil recopié dans un texte explicatif se met à mentir dès qu'on ajuste
 * le barème (même règle que les points du barème dans `Panneaux`).
 */
export const SEUIL_PALIER_A = 80;
export const SEUIL_PALIER_B = 65;

/** A = fonce · B = solide · C = opportuniste. Sans note, on ne présume pas : C. */
export function palier(score: number | null | undefined): Palier {
  if (score == null) return "C";
  if (score >= SEUIL_PALIER_A) return "A";
  if (score >= SEUIL_PALIER_B) return "B";
  return "C";
}

/** Filtre dur, appliqué AVANT la notation : hors rayon, l'offre n'entre pas. */
export function dansLeRayon(km: number | null | undefined, profil: Profil = PROFIL_DEFAUT): boolean {
  // Distance inconnue : on garde. Écarter sur une donnée absente reviendrait à décider
  // à la place de Marc sur la base de rien.
  return km == null || km <= profil.rayonMaxKm;
}
