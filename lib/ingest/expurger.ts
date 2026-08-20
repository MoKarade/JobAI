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
// Il ne détecte pas un nom de personne ISOLÉ, c'est-à-dire sans civilité devant. C'est
// délibéré et c'est déjà écrit dans `tests/piiGuard.test.ts` : un motif générique de patronyme
// est inutilisable en français (mesuré : il attrapait « Machines-Outils », « Saint-Damien »,
// « garde-fou »). On retire donc ce qui a une FORME reconnaissable — courriel nominatif,
// profil personnel, téléphone, adresse civique, et nom PRÉCÉDÉ D'UNE CIVILITÉ — et on laisse
// à la relecture ce qui n'en a pas.
//
// ⚠️ Et la civilité se compte en FRANÇAIS COMME EN ANGLAIS. Ce module n'en connaissait aucune
// jusqu'au 2026-08-19 ; la garde, elle, n'en connaissait que les formes françaises. Une
// annonce rédigée en anglais (« Ms. … ») a donc traversé les deux et s'est retrouvée dans un
// dépôt PUBLIC. Les annonces de la région sont bilingues : toute règle écrite ici doit l'être
// aussi, sans quoi c'est le plus restrictif des deux vocabulaires qui décide en silence.

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
    // PERSONNE NOMMÉE par une civilité : une civilité (française ou anglaise) suivie d'un
    // prénom, et éventuellement d'un nom de famille.
    //
    // ⚠️ AUCUN EXEMPLE COMPLET N'EST ÉCRIT ICI, ET C'EST VOULU. Un commentaire qui cite la
    // valeur fautive la REPUBLIE — et le garde, qui ne distingue pas une explication de la
    // chose expliquée, la refuse à raison. Les exemples vivent dans `tests/expurger.test.ts`,
    // assemblés à l'exécution.
    //
    // ⚠️ CE MOTIF EST NÉ D'UNE FUITE RÉELLE, PAS D'UNE PRÉCAUTION. Le 2026-08-19, une annonce
    // ELEM disait « Please send your application to the attention of Ms. … at rh@elem.global ».
    // Le courriel de rôle a survécu (c'est voulu), le NOM est passé — et il était DÉJÀ dans
    // `data/depot/2026-08-18.json`, donc dans un dépôt PUBLIC, depuis la veille. Ni l'outil
    // (aucun motif de civilité ici) ni la garde (qui n'en connaissait que les formes
    // FRANÇAISES) ne l'ont vu. C'est la même classe de défaut que le barème monolingue :
    // les annonces de la région sont bilingues, la règle ne l'était pas.
    //
    // Ce qu'il ne mord PAS, prouvé dans les tests : « Suite MS Office » (casse différente),
    // « M. Sc. en génie » (le second jeton doit faire au moins trois lettres), « Madame,
    // Monsieur, » (formule d'appel, suivie d'une virgule), « Mission » (pas d'espace).
    // Le second nom est optionnel : une civilité suivie du seul patronyme se retire aussi
    // bien qu'une civilité suivie du prénom ET du patronyme.
    categorie: "personne nommée",
    regex:
      /\b(?:M\.|Mme|Mlle|Monsieur|Madame|Mademoiselle|Ms\.|Mrs\.|Mr\.|Dr\.)\s+\p{Lu}[\p{L}'’-]{2,}(?:\s+\p{Lu}[\p{L}'’-]{2,})?/gu,
    remplacement: "[personne nommée retirée]",
  },
  {
    // Adresse civique EN PROSE. Elle n'est pas retirée parce qu'elle serait secrète — une
    // adresse d'employeur est publique, et le dépôt a un champ `adresse` fait pour elle.
    // Elle est retirée d'ICI parce que l'exemption de `piiGuard` ne couvre QUE cette clé :
    // la même adresse répétée dans la description fait échouer le gate (vécu le 2026-08-12).
    categorie: "adresse civique en prose",
    // ⚠️ `(?![\p{L}\d])` ET NON `\b`, ET C'EST UN CORRECTIF, PAS UN GOÛT (mesuré le
    // 2026-08-20 sur une vraie annonce dont le lieu s'écrivait avec l'abréviation `Av.`).
    //
    // Un `\b` après cette alternation ne peut PAS matcher quand la graphie se termine par un
    // point : entre `.` et l'espace qui suit, il n'y a aucune frontière de mot — les deux
    // sont des non-mots. Les formes abrégées `av.` et `ch.` étaient donc INERTES depuis
    // toujours, silencieusement. `boul.` survivait par accident, son `?` la ramenant à
    // `boul`, ce qui masquait le défaut sur un troisième cas.
    //
    // Conséquence concrète : l'outil ratait ce que `piiGuard` bloque, et le gate refusait le
    // dépôt du jour. Un outil et sa garde doivent nommer la MÊME chose, sinon la garde
    // devient un mur qu'on finit par contourner.
    //
    // La négation garde la protection contre les faux positifs (« 12 ruelles » n'est pas une
    // adresse : `rue` y est suivi d'une lettre), tout en acceptant une fin de graphie
    // ponctuée. Chaque graphie est verrouillée une par une par le test — une seule variante
    // éprouvée fait croire que le motif entier est couvert.
    regex:
      /\b\d{1,5}[,\s]+(?:rue|avenue|av\.|boul\.?|boulevard|chemin|ch\.|route|rang|place|montée|côte)(?![\p{L}\d])[^.;\n]*/giu,
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
