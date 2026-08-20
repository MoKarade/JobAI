// lib/ingest/pipeline.ts — de ce que les sources ont dit à ce qui entre dans le suivi.
//
// Fonctions PURES. Ce fichier ne contacte rien : il reçoit les récoltes, les met en forme,
// les dédoublonne, les note, et décide de ce qui mérite d'être suivi.
//
// TROIS DÉCISIONS, TOUTES RÉVERSIBLES ET TOUTES COMPTÉES
//   1. Dédoublonnage — la même offre paraît sur plusieurs sources ; une seule doit entrer.
//   2. Note — calculée par le barème existant, jamais estimée à l'œil.
//   3. Seuil — sous une note plancher, l'offre n'entre pas dans le suivi (décision de Marc,
//      2026-07-30). Elle est COMPTÉE et son motif est dit : une liste qui rétrécit sans
//      explication est pire qu'une liste longue.

import { computeScore } from "../scoring";
import { normaliserLieu, situer } from "./region";
import { aJuger, verdictsFermes, type RegistreLieux } from "./lieux";
import type { Offre } from "../types";
import type { OffreBrute } from "./types";

/**
 * Plancher d'ADÉQUATION AU RÔLE — la composante `fitRole` du barème, sur 40.
 *
 * ⚠️ POURQUOI PAS UN PLANCHER SUR LA NOTE TOTALE
 * Parce qu'il ne filtrerait rien. Mesuré : « Caissier », « Commis d'entrepôt » et
 * « Préposé à l'entretien ménager » notent tous 48 sur 100 — au-dessus d'un plancher à 45.
 * Les points accordés aux INCONNUES (distance non mesurée 10/20, salaire non affiché 9/15,
 * aucune exigence détectée 11/15) s'accumulent quel que soit le métier, et une offre sans
 * le moindre rapport avec le profil part déjà avec 40 points. Seul `fitRole` mesure
 * réellement l'adéquation.
 *
 * 14 sur 40 = au moins UN signal de rôle : du contenu technique, ou de la coordination.
 * C'est exactement la note d'un poste de technicien technique — le plancher de ce qui
 * mérite un regard. En dessous (8), il n'y a plus aucun signal.
 */
export const FIT_ROLE_PLANCHER = 14;

/** Ce qu'une passe a fait de chaque offre trouvée. */
export interface Tri {
  /** Prêtes à entrer dans le suivi : dédoublonnées, notées, au-dessus du plancher. */
  retenues: Offre[];
  /** Écartées faute de note. Comptées, pour que le rétrécissement soit visible. */
  souslePlancher: number;
  /** Doublons entre sources ou avec le suivi existant. */
  doublons: number;
  /** Écartées parce que trop loin — un compte DISTINCT du plancher. */
  horsRegion: number;
  /** Écartées faute de lieu exploitable. Distinct de « trop loin » : si ce compte
   *  explose, c'est qu'une source a cessé d'indiquer les villes, pas que le marché
   *  s'est éloigné. */
  lieuInconnu: number;
  /**
   * CE QUI A ÉTÉ ÉCARTÉ, NOMMÉMENT.
   *
   * Un compte seul ne se vérifie pas : « 5 écartées » ne dit pas si le filtre a bien
   * travaillé ou s'il vient de jeter la meilleure offre du jour. Le déposant l'a signalé
   * dès le premier vrai lot — il ne pouvait pas dire laquelle était dans quelle catégorie.
   * Chaque refus porte donc son motif, et le compte reste pour la lecture rapide.
   *
   * ⚠️ `ville` AJOUTÉE LE 2026-08-17, ET C'EST LE MOTIF QUI L'EXIGEAIT DEPUIS LE DÉBUT.
   *
   * Le compte rendu du jour disait « 47 lieu inconnu » — quarante-sept offres jetées parce
   * que `situer()` ne reconnaît pas leur ville, sans qu'aucune trace ne dise LAQUELLE. Or
   * c'est exactement l'information qui décide de la suite : quarante-sept fois « Remote »
   * appelle un traitement, quarante-sept municipalités québécoises absentes de la liste
   * blanche en appellent un autre, et rien ne permettait de trancher. Le motif était nommé,
   * son OBJET ne l'était pas — la règle « compter un refus ne suffit pas, il faut le
   * NOMMER » n'était donc tenue qu'à moitié pour le seul motif qui porte sur un champ.
   */
  refusees: { entreprise: string; titre: string; ville: string; motif: MotifRefus }[];
}

/**
 * Les noms de lieu de ce lot sur lesquels ni la liste blanche, ni le registre mesuré n'ont
 * quoi que ce soit à dire — c'est-à-dire la liste de travail du géocodeur.
 *
 * PURE, et c'est ce qui permet de la borner sans rien deviner : l'appelant en prend les
 * `n` premiers, les fait mesurer, et le reste attend la passe suivante. Triée par
 * FRÉQUENCE : quand le budget ne suffit pas pour tout, il doit servir au nom qui débloque
 * le plus d'offres, pas au premier de l'ordre alphabétique.
 *
 * `aJuger` décide de l'inclusion, pour que la règle de retente vive à UN seul endroit
 * (`lib/ingest/lieux.ts`) — un lieu déjà tranché ne coûte jamais une requête, un lieu
 * introuvable en recoûte une quand son palier est écoulé.
 */
export function lieuxAMesurer(
  recoltes: readonly OffreBrute[],
  registre: RegistreLieux,
  aujourdhui: string,
): string[] {
  const compte = new Map<string, number>();
  // Calculé UNE fois : la carte des verdicts fermes ne dépend pas de l'offre courante, et
  // la reconstruire à chaque tour ferait un balayage complet du registre par offre.
  const fermes = verdictsFermes(registre);
  for (const b of recoltes) {
    // Le même filtre que `trier`, dans le même ordre : un nom que `situer` sait déjà
    // trancher — par la liste blanche OU par un verdict ferme du registre — n'a rien à
    // faire ici. Sans ce partage, la liste de travail et la décision divergeraient, et on
    // paierait des requêtes pour des noms qui ne changent rien.
    if (situer(b.ville, b.description, fermes) !== "lieu-inconnu") continue;
    const nom = normaliserLieu(b.ville);
    if (nom === "") continue;
    if (!aJuger(registre[nom], aujourdhui)) continue;
    compte.set(nom, (compte.get(nom) ?? 0) + 1);
  }
  return [...compte.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n);
}

/**
 * Les villes refusées sous un motif donné, avec leur nombre, de la plus fréquente à la
 * moins fréquente.
 *
 * PURE. Elle existe parce qu'une liste de quarante-sept lignes ne se lit pas, alors que
 * « quebec city 31 · remote 9 · saguenay 4 » se lit en une seconde et DÉSIGNE le correctif.
 * Regrouper sur la forme NORMALISÉE (celle que `situer` compare) et non sur la chaîne
 * brute : « Québec » et « Quebec, QC » sont le même problème, et les compter à part ferait
 * croire à deux cas rares là où il y en a un gros.
 */
export function villesRefusees(
  refusees: Tri["refusees"],
  motif: MotifRefus,
): { ville: string; n: number }[] {
  const par = new Map<string, number>();
  for (const r of refusees) {
    if (r.motif !== motif) continue;
    // Une ville vide est une information : la source n'a rien dit. La nommer « (vide) »
    // vaut mieux que de la fondre dans les autres — le remède n'est pas le même.
    const cle = normaliserLieu(r.ville) || "(vide)";
    par.set(cle, (par.get(cle) ?? 0) + 1);
  }
  return [...par.entries()]
    .map(([ville, n]) => ({ ville, n }))
    .sort((a, b) => b.n - a.n || a.ville.localeCompare(b.ville));
}

/** Pourquoi une offre n'est pas entrée. */
export type MotifRefus = "hors-region" | "lieu-inconnu" | "sous-le-plancher" | "doublon";

/**
 * Identifiant stable et lisible, dérivé de l'entreprise et du titre.
 *
 * Pas la référence de la source : la MÊME offre a des références différentes chez Lever et
 * au Guichet-Emplois, et elle entrerait deux fois. Pas l'URL non plus, pour la même raison.
 */
export function idOffre(entreprise: string, titre: string): string {
  const propre = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const base = `${propre(entreprise)}-${propre(titre)}`.slice(0, 80).replace(/-+$/g, "");
  // Le schéma exige au moins un caractère : un titre entièrement non latin ne doit pas
  // produire un identifiant vide, qui ferait échouer l'insertion sans rien expliquer.
  return base || `offre-${propre(titre).slice(0, 20) || "sans-titre"}`;
}

/** Clé de rapprochement : deux annonces du même poste chez le même employeur. */
function cleDoublon(entreprise: string, titre: string): string {
  return idOffre(entreprise, titre);
}

/**
 * Les suffixes juridiques qu'une raison sociale traîne — et que deux sources n'écrivent pas
 * pareil.
 *
 * Liste FERMÉE, et c'est ce qui rend le rapprochement sûr. Un suffixe juridique n'est pas une
 * heuristique : `X inc.` et `X` sont la même entité, en droit comme en fait. Tout ce qui
 * ressemblerait à du rapprochement flou (préfixe « Groupe », distance d'édition, sous-chaîne)
 * en est exclu — `apparier("Robert", "Groupe Robert")` est vrai, et fusionner ces deux-là
 * ferait entrer une offre sous le mauvais employeur, avec la mauvaise distance.
 */
const SUFFIXES_JURIDIQUES = [
  "inc", "ltee", "ltd", "ltd-a", "corporation", "corp", "enr", "senc", "sencrl", "srl", "cie",
] as const;

/**
 * Clé de comparaison INSENSIBLE aux variantes de raison sociale.
 *
 * ⚠️ CE N'EST PAS UN IDENTIFIANT, et la distinction est vitale. `idOffre` produit la clé
 * PRIMAIRE des offres en base ; la toucher changerait l'identité de tout l'existant, ferait
 * échouer le rapprochement avec `dejaSuivies`, et recréerait le suivi entier en double — en
 * perdant au passage le lien vers les champs qui appartiennent à Marc (garde-fou n°2).
 * Cette clé-ci ne sert QU'À COMPARER : rien ne l'écrit, rien ne la stocke. Voir ADR-0006.
 *
 * Née le 2026-08-12, en branchant ZipRecruiter à côté d'Indeed : le même employeur y est
 * « EllisDon Corporation » d'un côté et « Ellisdon » de l'autre. Une seule source ne pouvait
 * pas produire ce défaut.
 */
export function cleCanonique(entreprise: string, titre: string): string {
  const mots = idOffre(entreprise, "").split("-").filter(Boolean);
  // Uniquement EN FIN de raison sociale : « Corporation Untel » garde son premier mot, sans
  // quoi on fusionnerait des entreprises qui n'ont en commun qu'un mot de forme juridique.
  while (mots.length > 1 && SUFFIXES_JURIDIQUES.includes(mots[mots.length - 1] as never)) {
    mots.pop();
  }
  return idOffre(mots.join(" "), titre);
}

/**
 * Les identifiants STOCKÉS des offres suivies qu'un lot de brutes vient de re-présenter.
 *
 * ⚠️ NÉE D'UN BUG TROUVÉ PAR REVUE ADVERSARIALE LE JOUR MÊME D'ADR-0006. Le marquage
 * « vue » calculait l'id de la BRUTE et le cherchait dans `dejaSuivies` — qui contient
 * aussi les clés canoniques. Pour une brute « Ellisdon » face à une base « EllisDon
 * Corporation », le test passait (la canonique matchait) mais l'id ajouté était celui de
 * la VARIANTE : aucune offre stockée ne le porte, donc l'offre prenait +1 absence PENDANT
 * que le lot la contenait — péremption à tort en trois jours, l'exact défaut qu'ADR-0006
 * venait de fermer côté doublons. La route POST avait le même trou sous une autre forme
 * (comparaison entreprise+titre en minuscules STRICTES, aveugle aux variantes) : deux
 * copies d'une même règle, déjà divergentes — d'où CETTE fonction, partagée.
 *
 * Résout dans LES DEUX SENS : base longue/brute courte (l'id de la brute EST la canonique
 * de la stockée) et base courte/brute longue (la canonique de la brute EST l'id stocké).
 */
export function idsStockesVus(
  brutes: readonly OffreBrute[],
  connues: readonly { id: string; entreprise: string; poste: string }[],
): Set<string> {
  const idStockeParCle = new Map<string, string>();
  for (const o of connues) {
    idStockeParCle.set(o.id, o.id);
    idStockeParCle.set(cleCanonique(o.entreprise, o.poste), o.id);
  }
  const vus = new Set<string>();
  for (const b of brutes) {
    const entreprise = b.entreprise.trim() || "Employeur non nommé";
    const stocke =
      idStockeParCle.get(idOffre(entreprise, b.titre)) ??
      idStockeParCle.get(cleCanonique(entreprise, b.titre));
    if (stocke !== undefined) vus.add(stocke);
  }
  return vus;
}

/**
 * Met en forme, dédoublonne, note et filtre.
 *
 * @param recoltes   Ce que les sources ont rendu, dans l'ordre de priorité : la PREMIÈRE
 *                   occurrence d'un doublon gagne, donc placer les sources les plus fiables
 *                   en tête.
 * @param dejaSuivies Identifiants déjà dans le suivi — une offre connue ne se recrée pas.
 * @param aujourdhui  Date du balayage (AAAA-MM-JJ). Paramètre, jamais l'horloge.
 */
export function trier(
  recoltes: readonly OffreBrute[],
  dejaSuivies: ReadonlySet<string>,
  aujourdhui: string,
  /**
   * Les lieux jugés PAR LA MESURE, transmis tels quels à `situer`. Voir `lib/ingest/lieux.ts` :
   * ils remplacent le pari de liste blanche pour les noms qu'elle ne connaît pas. Défaut
   * vide = comportement d'avant, à la ligne près.
   */
  lieuxResolus: ReadonlyMap<string, "dans-la-region" | "hors-region"> = new Map(),
  /**
   * Les codes de métier retenus par Marc (ADR-0013). Vide = le domaine ne pèse rien, et le
   * tri se comporte exactement comme avant — c'est ce qui rend l'ajout non régressif.
   */
  metiers: readonly string[] = [],
): Tri {
  const retenues: Offre[] = [];
  const vues = new Set<string>();
  let souslePlancher = 0;
  let doublons = 0;
  let horsRegion = 0;
  let lieuInconnu = 0;
  const refusees: Tri["refusees"] = [];

  for (const brute of recoltes) {
    const entreprise = brute.entreprise.trim() || "Employeur non nommé";
    const cle = cleDoublon(entreprise, brute.titre);
    // ⚠️ DEUX CLÉS, PAS UNE (ADR-0006). `cle` est l'identité telle qu'elle sera ÉCRITE ;
    // `canon` ne sert qu'à reconnaître le même employeur écrit autrement par une autre
    // source (« EllisDon Corporation » chez Indeed, « Ellisdon » chez ZipRecruiter). On
    // écarte si l'UNE des deux est déjà connue, et on mémorise les DEUX — sans quoi deux
    // variantes du même poste passeraient l'une après l'autre dans le même lot.
    const canon = cleCanonique(entreprise, brute.titre);

    if (vues.has(cle) || vues.has(canon) || dejaSuivies.has(cle) || dejaSuivies.has(canon)) {
      doublons++;
      refusees.push({ entreprise, titre: brute.titre, ville: brute.ville, motif: "doublon" });
      continue;
    }
    vues.add(cle);
    vues.add(canon);

    // LE LIEU D'ABORD, avant même de noter. Le barème ne peut pas trancher ça : il
    // pénalise une distance INCONNUE de 10 points sur 20, ce qui laisse de quoi passer
    // un seuil — « inconnue » et « à 2 000 km » y sont traitées pareil. C'est ainsi
    // qu'un poste de campement minier au Manitoba est entré à 68/100 lors de la
    // première sonde sur les vraies sources.
    const lieu = situer(brute.ville, brute.description, lieuxResolus);
    if (lieu === "hors-region") {
      horsRegion++;
      refusees.push({ entreprise, titre: brute.titre, ville: brute.ville, motif: "hors-region" });
      continue;
    }
    if (lieu === "lieu-inconnu") {
      lieuInconnu++;
      refusees.push({ entreprise, titre: brute.titre, ville: brute.ville, motif: "lieu-inconnu" });
      continue;
    }

    // La note vient du barème, avec `km: null` : la distance ne se déduit pas d'un nom de
    // ville, elle se mesure. Le barème sait déjà traiter l'inconnu (10 points sur 20).
    const note = computeScore(
      { titre: brute.titre, description: brute.description, km: null, noc: brute.noc },
      undefined,
      metiers,
    );
    // ⚠️ LE PLANCHER NE S'APPLIQUE QU'AUX OFFRES SANS CODE DE PROFESSION.
    //
    // Mesuré en production le 2026-08-20 : sur une passe réelle, **1 204 offres régionales
    // sur 1 306** ont été refusées ici. Marc demandait à voir tout le flux ; il a vu 75
    // offres. Le plancher juge par MOTS-CLÉS, et les titres du Guichet sont anglais — ils
    // valent tous `horsSujet` (8/40), donc ils tombaient tous.
    //
    // La raison d'être du plancher tient toujours pour les sources SANS code : là, le
    // barème par mots-clés est le seul juge, et sans lui « Caissier » entrerait (son
    // commentaire d'origine le mesure : les points d'inconnu portent n'importe quel métier
    // à ~48). Mais une offre qui porte un `noc2021` a été classée par une nomenclature
    // OFFICIELLE, indépendante de la langue : le facteur de domaine la range déjà — un
    // hors-domaine tombe à ~28 au lieu de ~56. Le trieur, c'est la NOTE ; l'ingestion n'a
    // plus à refuser ce que la note sait déclasser.
    const jugeParLeCode = brute.noc != null && brute.noc.trim() !== "";
    if (!jugeParLeCode && note.parts.fitRole < FIT_ROLE_PLANCHER) {
      souslePlancher++;
      refusees.push({
        entreprise,
        titre: brute.titre,
        ville: brute.ville,
        motif: "sous-le-plancher",
      });
      continue;
    }

    retenues.push({
      id: cle,
      source: "jobbank",
      dateReperage: aujourdhui,
      entreprise,
      poste: brute.titre,
      lien: brute.lien,
      km: null,
      // La ville est CONSERVÉE : sans elle, un employeur hors des cibles ne peut pas être
      // géocodé plus tard, et sa distance — le critère n°1 — resterait inconnue à vie.
      ville: brute.ville.trim() || null,
      salaireAffiche: null,
      priorite: "Moyenne",
      statut: "Identifiee",
      dateEnvoi: "",
      score: note.total,
      scoreSource: "calcule",
      // Le code repart AVEC l'offre : c'est lui qui rend la catégorie affichée cohérente
      // avec la note. Sans lui en base, l'écran re-déduirait la catégorie du titre seul.
      noc: brute.noc ?? null,
      raisons: raisonsAutomatiques(brute, note.total),
      notes: noteDeProvenance(brute, aujourdhui),
      userNote: "",
      histo: false,
      perimeeLe: null,
    });
  }

  return { retenues, souslePlancher, doublons, horsRegion, lieuInconnu, refusees };
}

/**
 * Le début de la justification qui porte la ville annoncée.
 *
 * Exporté pour que `raisonsAutomatiques` l'ÉCRIVE et que `villeDepuisRaisons` la RELISE
 * depuis la même constante : deux littéraux qui doivent coïncider finissent toujours par
 * diverger, et ici la divergence serait muette (plus aucune ville relue, sans erreur).
 * Un test prouve l'aller-retour.
 */
export const PREFIXE_VILLE_ANNONCEE = "Annoncée à ";

/** La longueur qu'`OffreSchema` accepte pour `ville` — la relecture s'y tient. */
const LONGUEUR_MAX_VILLE = 120;

/**
 * La ville qu'une offre déjà suivie porte dans ses justifications.
 *
 * POURQUOI CETTE FONCTION EXISTE
 * Les 40 premières offres déposées sont entrées AVANT que la colonne `ville` soit écrite :
 * elles l'ont donc vide, et sans ville leur employeur n'est pas géocodable — pas de
 * position, pas de distance, pas d'épingle sur la carte. Mais l'information n'est pas
 * perdue : au moment du tri, on a écrit « Annoncée à Lévis — … » dans leurs justifications.
 *
 * ⚠️ CE N'EST PAS UNE DÉDUCTION. La ville n'est pas devinée depuis le nom de l'employeur ni
 * depuis le texte de l'annonce : elle est RELUE là où notre propre code l'avait recopiée
 * telle que la source l'annonçait. C'est la même donnée, à un autre endroit — pas une
 * reconstitution, et donc pas une entorse au garde-fou n°3.
 *
 * Rend `null` quand aucune justification ne porte de ville : mieux vaut une offre qui reste
 * insituable et le DIT qu'une ville approximative écrite en base.
 */
export function villeDepuisRaisons(raisons: readonly Offre["raisons"][number][]): string | null {
  for (const r of raisons) {
    if (!r.texte.startsWith(PREFIXE_VILLE_ANNONCEE)) continue;
    // Le tiret cadratin sépare la ville du reste de la phrase. Un tiret ASCII ne
    // conviendrait pas : c'est « — » que le code écrit.
    const reste = r.texte.slice(PREFIXE_VILLE_ANNONCEE.length);
    const fin = reste.indexOf(" — ");
    // BORNÉE à la longueur que le schéma accepte pour `ville`. Sans tiret cadratin, tout
    // le reste de la phrase serait pris pour un nom de lieu — et ce texte part ensuite
    // vers Nominatim. Ni la création d'offre ni le rattrapage ne repassent par
    // `OffreSchema`, donc la borne doit être ici.
    const ville = (fin === -1 ? reste : reste.slice(0, fin)).trim().slice(0, LONGUEUR_MAX_VILLE);
    if (ville !== "") return ville;
  }
  return null;
}

/** Une ville à écrire sur une offre DÉJÀ suivie qui n'en avait pas. */
export interface VilleACompleter {
  id: string;
  ville: string;
}

/**
 * Les offres dont la ville manque en base alors que leurs justifications la portent.
 *
 * C'est le rattrapage qui ne dépend de PERSONNE : ni d'un nouveau dépôt, ni d'un clic, ni
 * du réseau. L'information est déjà là, une colonne plus loin. L'historique est laissé de
 * côté — ce sont des candidatures de 2025, elles n'ont pas à être situées.
 */
export function villesARattraper(offres: readonly Offre[]): VilleACompleter[] {
  const liste: VilleACompleter[] = [];
  for (const o of offres) {
    if (o.histo || o.ville !== null) continue;
    const ville = villeDepuisRaisons(o.raisons);
    if (ville !== null) liste.push({ id: o.id, ville });
  }
  return liste;
}

/**
 * Les villes manquantes qu'un lot permet de rattraper, sur les offres DÉJÀ suivies.
 *
 * POURQUOI ÇA EXISTE
 * Une offre déjà en base est comptée « doublon » et le lot n'en fait plus rien — juste
 * tant que le dépôt n'apporte rien de neuf. Ce n'est plus vrai : les 40 premières offres
 * déposées l'ont été avant que la colonne `ville` soit écrite, et sans ville un employeur
 * hors des cibles ne peut pas être géocodé, donc reste sans distance et hors de la carte.
 * Le même dépôt rejoué porte pourtant la ville manquante.
 *
 * TROIS GARDES, ET CHACUNE A UNE RAISON
 *   1. On COMPLÈTE, on n'écrase jamais : une ville déjà connue vient d'une source
 *      antérieure et n'a pas à être remplacée par un lot plus récent.
 *   2. Un employeur NON NOMMÉ ne rattrape rien. L'appariement passe par
 *      `idOffre(entreprise, titre)` ; avec une entreprise vide, deux annonces d'agence au
 *      titre générique (« Technicien ») produisent le MÊME identifiant. Dans `trier`, une
 *      telle collision coûte une offre non ajoutée — ici elle écrirait la ville de l'un
 *      sur la fiche de l'autre, c'est-à-dire ALTÉRERAIT une donnée existante. Le refus
 *      est plus étroit que le risque, et c'est le bon sens.
 *   3. Une seule écriture par offre, même si le lot la mentionne deux fois.
 *
 * PURE et testable : c'est une décision, et les décisions de ce dépôt vivent hors des I/O.
 */
export function villesACompleter(
  brutes: readonly OffreBrute[],
  connues: readonly Offre[],
): VilleACompleter[] {
  const parId = new Map(connues.map((o) => [o.id, o]));
  const faites = new Set<string>();
  const liste: VilleACompleter[] = [];

  for (const b of brutes) {
    const ville = b.ville.trim();
    const entreprise = b.entreprise.trim();
    if (ville === "" || entreprise === "") continue;

    const id = idOffre(entreprise, b.titre);
    if (faites.has(id)) continue;

    const existante = parId.get(id);
    if (!existante || existante.ville !== null) continue;

    faites.add(id);
    liste.push({ id, ville });
  }

  return liste;
}

/**
 * Justifications d'une offre trouvée automatiquement.
 *
 * Elles disent d'où vient la note et CE QU'ON NE SAIT PAS. Une offre ingérée n'a pas été
 * lue par un humain : le taire la ferait passer pour une offre vérifiée, alors que les
 * notes manuelles de Marc, elles, viennent d'une vraie lecture.
 */
function raisonsAutomatiques(brute: OffreBrute, note: number): Offre["raisons"] {
  const r: Offre["raisons"] = [
    {
      ton: "reserve",
      texte:
        "Trouvée automatiquement : la note vient du seul titre et du texte de l'annonce, sans lecture humaine. À relire avant de postuler.",
    },
  ];
  if (brute.ville.trim() !== "") {
    r.push({
      ton: "reserve",
      // Le préfixe vient de la constante partagée : `villeDepuisRaisons` relit cette
      // phrase pour rattraper une ville manquante, et deux littéraux finiraient par
      // diverger en silence.
      texte: `${PREFIXE_VILLE_ANNONCEE}${brute.ville.trim()} — la distance reste à mesurer, elle n'est pas déduite du nom de la ville.`,
    });
  }
  if (note >= 70) {
    r.push({
      ton: "atout",
      texte: "Le titre et l'annonce portent à la fois de la coordination et du contenu technique.",
    });
  }
  return r;
}

function noteDeProvenance(brute: OffreBrute, aujourdhui: string): string {
  const publiee = brute.publieeLe ? ` Publiée le ${brute.publieeLe}.` : "";
  return `Trouvée le ${aujourdhui} par la veille automatique.${publiee} Note calculée, jamais lue par un humain.`.slice(
    0,
    600,
  );
}
