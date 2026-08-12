// lib/ingest/expurger.ts — retirer la PII de tiers du texte d'une annonce.
//
// POURQUOI CE FICHIER EXISTE
// Le 2026-08-12, la veille a lu 44 annonces pour la première fois. L'une d'elles (Randstad)
// portait le NOM, le COURRIEL et le PROFIL LINKEDIN PERSONNELS d'un recruteur, en clair, dans
// le corps du texte. Le garde-fou n°1 interdit tout nom de tiers dans un fichier versionné —
// et AUCUN motif de `piiGuard` ne l'aurait attrapé. Je l'ai retiré à la main.
//
// « À la main » n'est pas une garde : c'est une intention qui tient tant que quelqu'un y pense.
// Une exécution automatique de la veille commettrait la PII sans broncher. Ce module est ce qui
// transforme « Claude fait attention » en « le code refuse ».
//
// FONCTION PURE. Aucun I/O : elle prend un texte, elle en rend un autre, et elle DIT ce qu'elle
// a retiré — par CATÉGORIE, jamais par valeur (journaliser la valeur recréerait la fuite qu'on
// vient de fermer).
//
// ⚠️ CE QUE CE MODULE NE FAIT PAS
// Il ne détecte pas un nom de personne isolé. C'est délibéré et c'est déjà écrit dans
// `tests/piiGuard.test.ts` : un motif générique de patronyme est inutilisable en français
// (mesuré : il attrapait « Machines-Outils », « Saint-Damien », « garde-fou »). On retire donc
// ce qui a une FORME reconnaissable — courriel nominatif, profil personnel, téléphone, adresse
// civique — et on laisse à la relecture ce qui n'en a pas.

/** Ce qu'une passe d'expurgement a retiré, par catégorie. Jamais la valeur elle-même. */
export interface RapportExpurgement {
  texte: string;
  /** Catégories retirées, dédoublonnées et triées. Vide = rien trouvé. */
  retires: string[];
}

interface Motif {
  categorie: string;
  regex: RegExp;
  remplacement: string;
}

/**
 * Les formes retirées, et pourquoi chacune s'arrête où elle s'arrête.
 *
 * Chaque motif est écrit pour DISCRIMINER : il doit attraper la PII d'un tiers sans mordre sur
 * ce qu'une annonce légitime contient. Les cas de survie sont prouvés un par un dans
 * `tests/expurger.test.ts` — un motif qui mordrait trop large ferait échouer le gate sur des
 * annonces normales, et on prendrait l'habitude de le contourner.
 */
const MOTIFS: readonly Motif[] = [
  {
    // Courriel NOMINATIF : « prenom.nom@… ». Le point dans la partie locale est le
    // discriminant — une boîte de rôle (`carriere@`, `rh@`, `emplois@`, `info@`) n'en a pas,
    // et elle doit survivre : c'est l'adresse à laquelle Marc postule.
    categorie: "courriel nominatif",
    regex: /\b[\p{L}][\p{L}'-]*\.[\p{L}][\p{L}'-]*@[\p{L}\d.-]+\.[a-z]{2,}\b/giu,
    remplacement: "[courriel nominatif retiré]",
  },
  {
    // Profil LinkedIn PERSONNEL (`/in/`). Une page d'ENTREPRISE (`/company/`) est publique et
    // utile : elle reste.
    categorie: "profil personnel",
    regex: /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^\s)"'<>]+/gi,
    remplacement: "[profil personnel retiré]",
  },
  {
    // Téléphone nord-américain, avec ou sans indicatif, séparateurs usuels.
    // Il exige DIX chiffres groupés 3-3-4 : un montant (« 110 000 $ »), une superficie
    // (« 1 200 000 pieds carrés ») ou une année ne les fournit pas dans cette forme.
    categorie: "téléphone",
    regex: /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g,
    remplacement: "[téléphone retiré]",
  },
  {
    // Adresse civique EN PROSE. Elle n'est pas retirée parce qu'elle serait secrète — une
    // adresse d'employeur est publique, et le dépôt a un champ `adresse` fait pour elle.
    // Elle est retirée d'ICI parce que l'exemption de `piiGuard` ne couvre QUE cette clé :
    // la même adresse répétée dans la description fait échouer le gate (vécu le 2026-08-12).
    categorie: "adresse civique en prose",
    regex:
      /\b\d{1,5}[,\s]+(?:rue|avenue|av\.|boul\.?|boulevard|chemin|ch\.|route|rang|place|montée|côte)\b[^.;\n]*/giu,
    remplacement: "[adresse en prose retirée — voir le champ `adresse`]",
  },
];

/**
 * Retire du texte les formes de PII de tiers, et dit lesquelles.
 *
 * Le texte rendu reste lisible : chaque retrait laisse un marqueur explicite plutôt qu'un trou.
 * Un lecteur (Marc, ou le barème) voit qu'il manque quelque chose et pourquoi — un silence
 * ferait croire que l'annonce ne portait rien.
 */
export function expurgerPII(texte: string): RapportExpurgement {
  let sortie = texte;
  const retires = new Set<string>();

  for (const { categorie, regex, remplacement } of MOTIFS) {
    // `replace` avec un motif global consomme `lastIndex` : on repart d'une instance neuve à
    // chaque appel pour que la fonction reste PURE d'un appel à l'autre.
    const motif = new RegExp(regex.source, regex.flags);
    if (motif.test(sortie)) {
      retires.add(categorie);
      sortie = sortie.replace(new RegExp(regex.source, regex.flags), remplacement);
    }
  }

  return { texte: sortie, retires: [...retires].sort() };
}

/**
 * Expurge toutes les descriptions d'un lot de dépôt, et rend le compte de ce qui a été retiré.
 *
 * ⚠️ Le champ `adresse` n'est PAS touché : c'est le seul endroit où une adresse civique a le
 * droit d'exister dans un fichier versionné (exemption de `piiGuard`, ancrée sur cette clé).
 * Expurger ici détruirait la donnée même que la veille cherche.
 */
export function expurgerLot<T extends { description: string }>(
  offres: readonly T[],
): { offres: T[]; retires: string[]; touchees: number } {
  const retires = new Set<string>();
  let touchees = 0;

  const sorties = offres.map((o) => {
    const r = expurgerPII(o.description);
    if (r.retires.length > 0) {
      touchees += 1;
      r.retires.forEach((c) => retires.add(c));
    }
    return { ...o, description: r.texte };
  });

  return { offres: sorties, retires: [...retires].sort(), touchees };
}
