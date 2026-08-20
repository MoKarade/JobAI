// lib/cv/proposition.ts — de faits extraits à un profil PROPOSÉ, champ par champ.
//
// Fonctions PURES : ni base, ni réseau, ni horloge. C'est ce qui permet d'éprouver la
// mécanique la plus délicate du chantier — celle qui décide ce qu'un CV a le droit de
// changer — sans rien simuler.
//
// LE PRINCIPE, QUI VIENT DE LA DÉCISION DE MARC (ADR-0009)
//
// Rien ne s'applique sans qu'il valide. Ce module ne produit donc pas un profil : il produit
// une LISTE D'ÉCARTS, chacun avec sa valeur actuelle, sa valeur proposée et sa PROVENANCE.
// L'écran affiche ces écarts, Marc coche ceux qu'il retient, et `appliquerEcarts` reconstruit
// un profil à partir de ses seuls choix.
//
// POURQUOI UNE LISTE D'ÉCARTS PLUTÔT QU'UN PROFIL COMPLET À ACCEPTER EN BLOC :
// un « avant / après » global se valide d'un clic sans être lu. Un écart nommé (« années
// d'expérience : 3 → 5, lu dans §Expérience 2021-2026 ») se lit, et surtout se REFUSE
// individuellement. C'est la différence entre une validation et un accusé de réception.
//
// DEUX NATURES D'ÉCART, JAMAIS MÉLANGÉES :
//   · un FAIT vient du document et se vérifie ;
//   · une CONSÉQUENCE est ce que ce fait ferait au barème — c'est une déduction du code,
//     pas une lecture du CV, et elle est étiquetée comme telle.
// Marc doit pouvoir accepter « j'ai 5 ans » sans accepter « donc le barème de séniorité
// glisse de deux crans ».

import {
  PROFIL_DEFAUT,
  ProfilSchema,
  paliersSenioriteDepuisAnnees,
  type Profil,
} from "../profil";
import type { ReponseExtraction } from "./extraction";

/** La nature d'un écart — elle change ce que Marc doit vérifier avant de cocher. */
export type NatureEcart = "fait" | "consequence";

export interface Ecart {
  /** Chemin du champ dans le profil (`faits.anneesExperience`, `recherches`…). */
  cle: string;
  /** Libellé lisible, affiché tel quel. */
  libelle: string;
  nature: NatureEcart;
  /** Rendu textuel de ce que le profil porte aujourd'hui. */
  avant: string;
  /** Rendu textuel de ce que le CV propose. */
  apres: string;
  /**
   * Où ça se lit dans le document. VIDE = le modèle a supposé, et l'écran le dit —
   * un fait sans provenance ne se distingue autrement pas d'un fait vérifié.
   */
  provenance: string;
  /** La valeur à écrire dans le profil si Marc coche. */
  valeur: unknown;
}

function listeEnTexte(xs: readonly string[]): string {
  return xs.length === 0 ? "—" : xs.join(", ");
}

/** Deux listes portent-elles le même contenu, à l'ordre et à la casse près ? */
function memeListe(a: readonly string[], b: readonly string[]): boolean {
  const n = (xs: readonly string[]) => [...xs].map((x) => x.toLowerCase().trim()).sort();
  return JSON.stringify(n(a)) === JSON.stringify(n(b));
}

/**
 * Compare un profil courant à ce qu'un CV propose, et rend les écarts.
 *
 * ⚠️ AUCUN ÉCART N'EST PRODUIT QUAND LES VALEURS SE VALENT. Un écran qui listerait
 * quarante lignes dont trente-huit identiques ferait cocher « tout » sans rien lire —
 * ce serait la validation en apparence, et l'acceptation aveugle en pratique.
 */
export function calculerEcarts(courant: Profil, extraction: ReponseExtraction): Ecart[] {
  const ecarts: Ecart[] = [];
  const p = (s: string) => s.trim();

  // ── Les faits ────────────────────────────────────────────────────────────
  if (extraction.anneesExperience !== courant.faits.anneesExperience) {
    ecarts.push({
      cle: "faits.anneesExperience",
      libelle: "Années d'expérience",
      nature: "fait",
      avant: courant.faits.anneesExperience?.toString() ?? "non établi",
      apres: extraction.anneesExperience?.toString() ?? "non établi",
      provenance: p(extraction.anneesExperienceProvenance),
      valeur: extraction.anneesExperience,
    });
  }

  // ── Le parcours ──────────────────────────────────────────────────────────
  // ⚠️ COMPARÉ PAR SIGNATURE, PAS PAR ÉGALITÉ D'OBJETS. Deux extractions du même CV peuvent
  // reformuler une phrase de `faits` sans que le POSTE ait changé ; un diff sur l'objet
  // entier afficherait alors un écart à chaque analyse, et Marc finirait par cocher sans
  // lire — ce qui est la validation en apparence et l'acceptation aveugle en pratique.
  // La signature retient ce qui identifie un poste : intitulé, employeur, période.
  const signature = (e: { titre: string; employeur: string; debut: string; fin: string }) =>
    `${e.titre}|${e.employeur}|${e.debut}|${e.fin}`.toLowerCase();
  const memeParcours =
    courant.faits.parcours.length === extraction.parcours.length &&
    courant.faits.parcours.every((e, i) => signature(e) === signature(extraction.parcours[i]!));
  // Un parcours vide proposé n'efface rien, pour la même raison que les listes plus bas :
  // le modèle qui n'a rien trouvé ne prouve pas que Marc n'a rien.
  if (!memeParcours && extraction.parcours.length > 0) {
    ecarts.push({
      cle: "faits.parcours",
      libelle: "Parcours",
      nature: "fait",
      avant:
        courant.faits.parcours.length === 0
          ? "non établi"
          : `${courant.faits.parcours.length} poste(s)`,
      apres: extraction.parcours.map((e) => e.titre).join(" · "),
      provenance: "",
      valeur: extraction.parcours,
    });
  }

  const listes: readonly {
    cle: keyof Profil["faits"];
    libelle: string;
    proposees: readonly string[];
  }[] = [
    { cle: "langues", libelle: "Langues", proposees: extraction.langues },
    { cle: "diplomes", libelle: "Diplômes", proposees: extraction.diplomes },
    { cle: "outils", libelle: "Outils et méthodes", proposees: extraction.outils },
    { cle: "titresOccupes", libelle: "Postes occupés", proposees: extraction.titresOccupes },
  ];

  for (const l of listes) {
    const actuelle = courant.faits[l.cle] as readonly string[];
    if (memeListe(actuelle, l.proposees)) continue;
    // Une liste VIDE proposée n'efface rien : le modèle qui n'a rien trouvé ne prouve pas
    // que Marc n'a rien. Effacer sur une absence, c'est décider à sa place sur du vide.
    if (l.proposees.length === 0) continue;
    ecarts.push({
      cle: `faits.${l.cle}`,
      libelle: l.libelle,
      nature: "fait",
      avant: listeEnTexte(actuelle),
      apres: listeEnTexte(l.proposees),
      provenance: "",
      valeur: l.proposees,
    });
  }

  // ── Les conséquences sur le barème ───────────────────────────────────────
  // Le CV ne PROPOSE pas ces valeurs : le code les DÉDUIT des faits ci-dessus. Étiquetées
  // « conséquence » pour que Marc puisse retenir le fait sans retenir ce qu'on en tire.
  if (
    extraction.anneesExperience !== null &&
    extraction.anneesExperience !== courant.faits.anneesExperience
  ) {
    const proposes = paliersSenioriteDepuisAnnees(extraction.anneesExperience);
    const rendu = (xs: readonly { max: number; points: number }[]) =>
      xs.map((x) => `≤ ${x.max} ans : ${x.points} pts`).join(" · ");
    if (rendu(proposes) !== rendu(courant.paliersSeniorite)) {
      ecarts.push({
        cle: "paliersSeniorite",
        libelle: "Barème de séniorité",
        nature: "consequence",
        avant: rendu(courant.paliersSeniorite),
        apres: rendu(proposes),
        provenance: `Déduit de ${extraction.anneesExperience} ans d'expérience.`,
        valeur: proposes,
      });
    }
  }

  // Les termes de veille : on AJOUTE, on ne remplace pas. Une recherche qui fonctionne
  // depuis des semaines n'a pas à disparaître parce qu'un CV ne l'évoque pas.
  const nouvelles = extraction.recherchesSuggerees.filter(
    (r) => !courant.recherches.some((c) => c.toLowerCase() === r.toLowerCase()),
  );
  if (nouvelles.length > 0) {
    ecarts.push({
      cle: "recherches",
      libelle: "Termes cherchés chaque matin",
      nature: "consequence",
      avant: listeEnTexte(courant.recherches),
      apres: listeEnTexte([...courant.recherches, ...nouvelles]),
      provenance: `Ajout de ${nouvelles.length} terme(s) déduits du parcours.`,
      valeur: [...courant.recherches, ...nouvelles],
    });
  }

  // Les outils du CV enrichissent le vocabulaire technique du barème : c'est ce qui fait
  // qu'une annonce mentionnant une compétence réelle de Marc cesse d'être notée « hors
  // sujet ». Ajout seul, jamais de remplacement.
  const motsNouveaux = extraction.outils
    .map((o) => o.toLowerCase().trim())
    .filter((o) => o.length >= 3 && !courant.motsTechnique.includes(o));
  if (motsNouveaux.length > 0) {
    ecarts.push({
      cle: "motsTechnique",
      libelle: "Vocabulaire technique du barème",
      nature: "consequence",
      avant: listeEnTexte(courant.motsTechnique),
      apres: listeEnTexte([...courant.motsTechnique, ...motsNouveaux]),
      provenance: `Ajout de ${motsNouveaux.length} terme(s) tirés des outils du CV.`,
      valeur: [...courant.motsTechnique, ...motsNouveaux],
    });
  }

  // ── La position ──────────────────────────────────────────────────────────
  // Le CV nourrit les FAITS des quadrants, jamais le jugement. « Mobilité limitée avant la
  // résidence permanente (permis lié à l'employeur actuel) » ne sort d'aucun CV : un SWOT
  // régénéré automatiquement perdrait exactement ce qui fait sa valeur.
  //
  // On AJOUTE donc aux quadrants existants, on ne les remplace pas — et seulement ce que le
  // document ÉTABLIT : des forces constatées, des manques objectifs. Chaque point ajouté
  // porte sa marque d'origine, pour qu'on sache six mois plus tard ce qui a été pensé et ce
  // qui a été lu.
  const swotPropose = fusionnerSwot(courant.swot, extraction.forces, extraction.manques);
  if (swotPropose !== null) {
    const compte = (qs: readonly { points: readonly string[] }[]) =>
      qs.reduce((n, q) => n + q.points.length, 0);
    ecarts.push({
      cle: "swot",
      libelle: "Analyse de position",
      nature: "consequence",
      avant: `${compte(courant.swot)} constats`,
      apres: `${compte(swotPropose)} constats`,
      provenance:
        "Ajouts tirés du CV, marqués « (CV) ». Les constats existants sont conservés — " +
        "le jugement reste le tien.",
      valeur: swotPropose,
    });
  }

  return ecarts;
}

/**
 * Ajoute au SWOT ce que le CV établit, sans jamais retirer ce qui y était.
 *
 * Rend `null` quand il n'y a rien à ajouter — pour que l'écran ne montre pas un écart vide.
 * Les points ajoutés sont suffixés « (CV) » : dans six mois, on doit pouvoir distinguer un
 * constat pensé d'un constat lu, sinon les deux se valent et aucun ne vaut rien.
 */
function fusionnerSwot(
  courant: Profil["swot"],
  forces: readonly string[],
  manques: readonly string[],
): Profil["swot"] | null {
  const MARQUE = " (CV)";
  const dejaLa = (q: { points: readonly string[] }, p: string) =>
    q.points.some((x) => x.toLowerCase().includes(p.toLowerCase().slice(0, 40)));

  let change = false;
  const fusion = courant.map((q) => {
    const source = q.cle === "forces" ? forces : q.cle === "faiblesses" ? manques : [];
    const ajouts = source
      .filter((p) => !dejaLa(q, p))
      .map((p) => `${p}${MARQUE}`)
      // Un quadrant plafonne à 12 points (schéma) : on garde de la place pour l'existant.
      .slice(0, Math.max(0, 12 - q.points.length));
    if (ajouts.length === 0) return q;
    change = true;
    return { ...q, points: [...q.points, ...ajouts] };
  });

  return change ? fusion : null;
}

/**
 * Reconstruit un profil à partir des SEULS écarts que Marc a retenus.
 *
 * ⚠️ LA VERSION EST INCRÉMENTÉE ICI, ET NULLE PART AILLEURS. C'est ce qui permet à une note
 * de rester explicable : `DetailNote.profilVersion` dit avec quel barème elle a été
 * produite, et deux profils différents ne peuvent pas porter le même numéro.
 *
 * `etabliLe` est passé en paramètre plutôt que lu à l'horloge : une fonction pure se teste,
 * une fonction qui lit `Date.now()` se devine.
 */
export function appliquerEcarts(
  courant: Profil,
  ecarts: readonly Ecart[],
  retenus: readonly string[],
  etabliLe: string,
): Profil {
  const garde = new Set(retenus);
  const brouillon = structuredClone(courant) as Record<string, unknown> & {
    faits: Record<string, unknown>;
  };

  for (const e of ecarts) {
    if (!garde.has(e.cle)) continue;
    const [racine, feuille] = e.cle.split(".");
    if (feuille !== undefined && racine === "faits") brouillon.faits[feuille] = e.valeur;
    else if (racine !== undefined) brouillon[racine] = e.valeur;
  }

  return ProfilSchema.parse({
    ...brouillon,
    version: courant.version + 1,
    etabliLe,
    origine: "cv",
  });
}

/** Le profil de départ d'une comparaison : le validé s'il existe, sinon celui du code. */
export function profilCourantOuDefaut(profilValideJson: string | null): Profil {
  if (!profilValideJson) return PROFIL_DEFAUT;
  const analyse = ProfilSchema.safeParse(JSON.parse(profilValideJson));
  // Un profil stocké illisible NE DOIT PAS retomber en silence sur le défaut : les notes
  // changeraient sans que rien ne l'explique. On lève — l'écran dira quoi.
  if (!analyse.success) {
    throw new Error(`Profil enregistré illisible : ${analyse.error.issues[0]?.message ?? "?"}`);
  }
  return analyse.data;
}
