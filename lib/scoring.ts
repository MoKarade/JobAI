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
import { codeRetenu, lireCodeNoc } from "./nocProfession";

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
    .replace(/\((?:e|s|es|ne|nes|trice|trices|ice|ices|euse|euses|rice|rices)\)/g, "")
    .replace(/\s+/g, " ");
}

/** 40 pts — le poste combine-t-il coordination d'équipe ET contenu technique ? */
export function scoreFitRole(titre: string, description = "", profil: Profil = PROFIL_DEFAUT): number {
  const t = normaliserTitre(`${titre} ${description}`);
  const coord = profil.motsCoordination.some((m) => t.includes(m));
  const tech = profil.motsTechnique.some((m) => t.includes(m));
  // « technicien » sans encadrement = recul hiérarchique par rapport au poste actuel.
  const technicien = /\btechnicien/.test(t) && !coord;

  const p = profil.pointsRole;
  if (coord && tech) return p.combinaison; // la combinaison recherchée
  if (coord) return p.coordination; // encadrement sans contenu technique
  if (tech && !technicien) return p.technique; // technique sans encadrement
  if (technicien) return p.technicien;
  return p.horsSujet;
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

/** 15 pts — l'exigence de séniorité est-elle atteignable avec l'expérience de Marc ? */
export function scoreSeniorite(description = "", profil: Profil = PROFIL_DEFAUT): number {
  // « 5 ans d'expérience », « 5-10 ans d'expérience », « 2 à 3 années d'expérience ».
  const m = description.match(/(\d+)\s*(?:à|-|a)?\s*\d*\s*an(?:s|nées)?\s+d['’]exp/i);
  if (!m) return profil.senioriteNonPrecisee; // non précisé : l'absence d'exigence n'est pas un obstacle
  const min = Number.parseInt(m[1] ?? "", 10);
  if (!Number.isFinite(min)) return profil.senioriteNonPrecisee;
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
    seniorite: scoreSeniorite(input.description, profil),
    salaire: scoreSalaire(input.salaireAnnuel ?? null, profil),
    immigration: scoreImmigration(input.description, profil),
    conditions: scoreConditions(input.typePoste, input.dureeEmploi, profil),
  };
  const brut = Object.values(parts).reduce((a, b) => a + b, 0);
  const facteur = facteurDomaine(input.noc, metiers, profil);
  // ⚠️ ARRONDI AVANT LE PLAFOND, et une seule fois : `brut` reste la somme des parts (il
  // sert à expliquer un écrêtage), c'est le TOTAL qui porte le facteur. Les afficher tous
  // deux évite la question « pourquoi 29 alors que ça fait 58 ».
  return {
    total: Math.min(Math.round(brut * facteur), profil.plafondNoteCalculee),
    brut,
    parts,
    facteurDomaine: facteur,
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
