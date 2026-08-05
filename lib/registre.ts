// lib/registre.ts — lire le Registre des entreprises du Québec. Fonctions PURES.
//
// CE QUE LE REGISTRE CONTIENT VRAIMENT, MESURÉ LE 2026-08-05
// Marc a téléchargé le fichier depuis chez lui (l'IP des runners GitHub est refusée par
// Cloudflare, et le datastore de Données Québec ne contient qu'une page d'erreur — leur
// propre moissonneur s'est heurté au même mur). L'inspection a montré six fichiers, dont
// deux qui nous intéressent :
//
//   · `Etablissements.csv` (33,7 Mo) — NEQ, NOM_ETAB, LIGN1_ADR..LIGN4_ADR.
//   · `Nom.csv` (274,8 Mo) — NEQ, NOM_ASSUJ : les dénominations de l'entreprise.
//
// ⚠️ LA BONNE SURPRISE, ET ELLE CHANGE LA RÉSERVE QUE J'AVAIS ANNONCÉE.
// Je prévenais que le registre ne donnerait que le DOMICILE LÉGAL — potentiellement le
// bureau du comptable plutôt que l'usine. C'est vrai de `Entreprise.csv`
// (`ADR_DOMCL_*`). Mais `Etablissements.csv` porte l'adresse des ÉTABLISSEMENTS : les
// lieux où l'entreprise opère RÉELLEMENT, avec un indicateur d'établissement principal.
// C'est exactement ce qu'on cherche, et c'est meilleur que ce que j'annonçais. On lit donc
// les établissements, JAMAIS les domiciles.
//
// ⚠️ LE SÉPARATEUR EST UNE VIRGULE, ET LES CHAMPS EN CONTIENNENT.
// Vu dans le fichier réel : `"2707, CAZENEUVE"`. Un `split(",")` couperait cette adresse
// en deux et décalerait TOUTES les colonnes suivantes de la ligne — les adresses seraient
// silencieusement fausses, ce qui est pire que pas d'adresse (garde-fou n°3). D'où un vrai
// analyseur qui respecte les guillemets, testé sur ce cas précis.
//
// GARDE-FOU N°1 : on ne lit ni administrateurs ni actionnaires. Ce module ne connaît que
// des noms d'entreprises et des adresses d'établissements — des données publiques.

import { estDansLaRegion, normaliserLieu } from "./ingest/region";

/**
 * Découpe une ligne CSV en respectant les guillemets.
 *
 * Règles du format : un champ entouré de `"` peut contenir le séparateur ; deux guillemets
 * consécutifs à l'intérieur valent un guillemet littéral. Rien d'exotique — mais s'en
 * passer suffit à décaler toutes les colonnes d'une ligne sur `"2707, CAZENEUVE"`.
 */
export function decouperCsv(ligne: string, separateur = ","): string[] {
  const champs: string[] = [];
  let courant = "";
  let dansGuillemets = false;

  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];

    if (dansGuillemets) {
      if (c === '"') {
        // `""` à l'intérieur d'un champ cité = un guillemet littéral.
        if (ligne[i + 1] === '"') {
          courant += '"';
          i++;
        } else {
          dansGuillemets = false;
        }
      } else {
        courant += c;
      }
      continue;
    }

    if (c === '"') {
      dansGuillemets = true;
    } else if (c === separateur) {
      champs.push(courant);
      courant = "";
    } else {
      courant += c;
    }
  }
  champs.push(courant);
  return champs;
}

/**
 * Retire la marque d'ordre des octets en tête de fichier.
 *
 * Le registre est publié en « UTF-8 avec BOM ». Sans ce retrait, le premier nom de colonne
 * devient `﻿NEQ` et ne correspond plus à `NEQ` — l'entête paraît juste, la recherche
 * de colonne échoue, et rien ne l'explique. Même piège que `.env.local` sous Windows,
 * déjà payé par ce projet.
 */
export function retirerBom(texte: string): string {
  return texte.charCodeAt(0) === 0xfeff ? texte.slice(1) : texte;
}

/**
 * Extrait la municipalité de la ligne 2 d'une adresse du registre.
 *
 * Le format observé est `Ville (Québec)` : « Lévis (Québec) », « SAINT-LAURENT (QUÉBEC) »,
 * « Saguenay (Québec) ». La parenthèse porte la province, pas un secteur — la garder
 * ferait échouer toute comparaison avec nos municipalités.
 */
export function villeDeLigneAdresse(ligne2: string): string {
  const sansProvince = ligne2.split("(")[0] ?? "";
  return sansProvince.trim();
}

/** Un établissement retenu : le strict nécessaire, rien de plus. */
export interface Etablissement {
  neq: string;
  nom: string;
  adresse: string;
  ville: string;
  codePostal: string;
  /** L'établissement PRINCIPAL de l'entreprise, quand le registre le dit. */
  principal: boolean;
}

/** Les colonnes qu'on lit dans `Etablissements.csv`, par leur nom exact. */
export const COLONNES_ETABLISSEMENT = [
  "NEQ",
  "IND_ETAB_PRINC",
  "LIGN1_ADR",
  "LIGN2_ADR",
  "LIGN3_ADR",
  "LIGN4_ADR",
  "NOM_ETAB",
] as const;

/**
 * Associe chaque colonne attendue à son indice dans l'entête RÉELLE.
 *
 * ⚠️ On lit par NOM, jamais par position. Le registre est republié deux fois par mois ; une
 * colonne insérée décalerait tout un import silencieux — les adresses se retrouveraient
 * dans le champ du nom sans qu'aucune erreur ne se déclenche. Une colonne manquante rend
 * `null` : l'appelant s'arrête, il ne devine pas.
 */
export function indicesColonnes(
  entete: string,
  attendues: readonly string[] = COLONNES_ETABLISSEMENT,
): Record<string, number> | null {
  const noms = decouperCsv(retirerBom(entete)).map((n) => n.trim());
  const indices: Record<string, number> = {};
  for (const col of attendues) {
    const i = noms.indexOf(col);
    if (i === -1) return null;
    indices[col] = i;
  }
  return indices;
}

/**
 * Transforme une ligne en établissement RETENU, ou rend `null`.
 *
 * `null` couvre trois cas distincts, et c'est voulu qu'ils se ressemblent ici : ligne
 * malformée, hors de la région, ou sans adresse exploitable. Aucun n'est une erreur — le
 * registre couvre tout le Québec, et l'immense majorité des lignes ne nous concerne pas.
 */
export function lireEtablissement(
  ligne: string,
  indices: Record<string, number>,
): Etablissement | null {
  const champs = decouperCsv(ligne);
  const at = (col: string): string => (champs[indices[col] ?? -1] ?? "").trim();

  const neq = at("NEQ");
  const nom = at("NOM_ETAB");
  const adresse = at("LIGN1_ADR");
  const ville = villeDeLigneAdresse(at("LIGN2_ADR"));

  // Sans nom ni adresse, la ligne ne peut servir à rien : ni à retrouver l'entreprise, ni
  // à afficher où elle est.
  if (neq === "" || nom === "" || adresse === "" || ville === "") return null;

  // LE FILTRE QUI REND L'IMPORT POSSIBLE. Le registre entier compte des centaines de
  // milliers d'établissements ; la base Neon n'a aucune raison de les héberger. On ne garde
  // que la région, avec la MÊME règle que l'ingestion des offres (`lib/ingest/region.ts`) —
  // deux listes de municipalités finiraient par diverger.
  if (!estDansLaRegion(ville)) return null;

  return {
    neq,
    nom,
    adresse,
    ville,
    // La ligne 4 porte le code postal dans le fichier réel (`H1J1Z1`, `G6X3C7`).
    codePostal: at("LIGN4_ADR").replace(/\s+/g, "").toUpperCase(),
    principal: at("IND_ETAB_PRINC").toUpperCase() === "O",
  };
}

/**
 * Clé de rapprochement d'un nom d'entreprise.
 *
 * Elle sert à retrouver « Laserax » dans un registre qui écrit « LASERAX INC. ». Accents,
 * casse, ponctuation et formes juridiques disparaissent — ce sont exactement les
 * différences qui font échouer une comparaison littérale, et elles ne portent aucun sens.
 *
 * ⚠️ Cette clé GROUPE, elle ne DÉCIDE pas seule : deux entreprises peuvent partager une
 * clé (« Groupe Test » et « Test »). C'est l'appelant qui tranche, comme `lib/employeurs.ts`
 * sépare déjà l'appariement d'affichage de la décision d'écriture.
 */
export function cleNom(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\b(inc|ltee|ltd|enr|senc|sencrl|cie|corp|limitee|incorporee)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Mots qui ne DÉSIGNENT pas une entreprise en particulier.
 *
 * Ils servent à choisir par quoi chercher : « garoy construction » se cherche par
 * « garoy », pas par « construction » qui remonterait la moitié du registre.
 */
const MOTS_GENERIQUES = new Set([
  "groupe", "les", "des", "entreprise", "entreprises", "industries", "industrie",
  "construction", "constructions", "transport", "transports", "canada", "quebec",
  "service", "services", "solutions", "produits", "compagnie", "technologies",
]);

/**
 * Le mot par lequel CHERCHER une entreprise dans le registre, ou `null`.
 *
 * ⚠️ POUR DIAGNOSTIQUER, JAMAIS POUR DÉCIDER. Cette fonction sert à répondre à « que
 * contient le registre sous ce nom ? » quand la comparaison de clés EXACTES n'a rien
 * donné. Elle est volontairement grossière — une recherche par un seul mot ramène des
 * homonymes, et c'est acceptable tant que rien n'en est écrit. La règle du dépôt reste
 * entière : une heuristique peut grouper ce qu'on REGARDE, jamais décider ce qu'on ÉCRIT.
 *
 * On prend le PREMIER mot porteur : dans un nom d'entreprise québécois, le terme propre
 * vient presque toujours avant le terme de métier (« Garoy Construction », « Groupe
 * Mundial »). Le plus long serait un mauvais critère — « construction » bat « garoy » et
 * ne désigne rien.
 */
export function motDeRecherche(cle: string): string | null {
  const mots = cle.split(" ").filter((m) => m.length >= 4);
  return mots.find((m) => !MOTS_GENERIQUES.has(m)) ?? mots[0] ?? null;
}

/** Deux noms désignent-ils la même entreprise ? Comparaison STRICTE sur la clé. */
export function memeEntreprise(a: string, b: string): boolean {
  const ca = cleNom(a);
  const cb = cleNom(b);
  return ca !== "" && ca === cb;
}

/** Réexporté pour que l'import n'ait pas à connaître deux modules de normalisation. */
export { normaliserLieu };

/**
 * Choisit L'ÉTABLISSEMENT qui correspond, parmi ceux qui portent le même nom.
 *
 * ⚠️ UNE ENTREPRISE PEUT AVOIR PLUSIEURS ÉTABLISSEMENTS DANS LA RÉGION, et ils n'ont pas
 * la même adresse. Prendre le premier venu serait un tirage au sort inscrit en base — le
 * même défaut que le « premier candidat qui apparie » d'un `SELECT` sans `ORDER BY`, déjà
 * payé par ce dépôt. L'ordre de préférence est donc explicite :
 *
 *   1. la VILLE attendue, quand on la connaît — c'est le discriminant le plus fort ;
 *   2. l'établissement PRINCIPAL, que le registre désigne lui-même ;
 *   3. rien. On REFUSE plutôt que de choisir au hasard entre deux adresses réelles.
 *
 * Ce refus n'est pas un échec : une adresse plausible mais fausse enverrait Marc à la
 * mauvaise porte, ce que le garde-fou n°3 interdit. Mieux vaut le silence.
 */
export function choisirEtablissement(
  candidats: readonly Etablissement[],
  villeAttendue: string | null,
): Etablissement | null {
  if (candidats.length === 0) return null;
  if (candidats.length === 1) return candidats[0] ?? null;

  // 1. La ville tranche presque toujours.
  if (villeAttendue !== null && villeAttendue !== "") {
    const cible = normaliserLieu(villeAttendue);
    const memeVille = candidats.filter((c) => normaliserLieu(c.ville) === cible);
    if (memeVille.length === 1) return memeVille[0] ?? null;
    if (memeVille.length > 1) return principalUnique(memeVille);
  }

  // 2. À défaut, l'établissement que le registre déclare PRINCIPAL.
  return principalUnique(candidats);
}

/** L'unique établissement principal, ou `null` s'il n'y en a pas exactement un. */
function principalUnique(candidats: readonly Etablissement[]): Etablissement | null {
  const principaux = candidats.filter((c) => c.principal);
  return principaux.length === 1 ? (principaux[0] ?? null) : null;
}

/** L'adresse telle qu'on l'affiche : rue, ville, code postal — rien d'autre. */
export function adresseLisible(e: Etablissement): string {
  return [e.adresse, e.ville, e.codePostal].filter((p) => p !== "").join(", ");
}
