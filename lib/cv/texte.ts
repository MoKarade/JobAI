// lib/cv/texte.ts — sortir du texte d'un fichier téléversé, ou dire pourquoi on n'y arrive pas.
//
// ⚠️ POURQUOI UNE BIBLIOTHÈQUE, ALORS QUE L'APP EN COMPTE SI PEU — c'est MESURÉ, pas supposé.
//
// La première version de ce fichier lisait les PDF à la main : décompression `Flate` par
// `zlib`, puis récupération des chaînes entre parenthèses des opérateurs `Tj`/`TJ`. Le
// raisonnement se tenait (un CV est un PDF simple) et le code passait ses propres tests.
//
// Éprouvé sur DEUX PDF réels, produits par des chaînes d'outils tierces, il a échoué DEUX
// fois — et l'un des deux échecs était le pire qui soit :
//
//   · un document de présentation → « aucun texte lisible, c'est un scan ». FAUX : il
//     portait 4 295 caractères de vrai texte. Le diagnostic envoyait Marc réparer un
//     problème inexistant.
//   · un PDF de captures d'écran → SUCCÈS annoncé, 76 784 caractères… de binaire d'image.
//     Le test `\bTj\b` avait matché des octets d'image dans un flux non décompressé. Ce
//     charabia serait parti vers le modèle, qui en aurait tiré un profil inventé de bout
//     en bout, présenté avec assurance.
//
// C'est exactement la faute que le garde-fou n°3 interdit : produire du contenu fabriqué
// et l'annoncer comme un résultat. `unpdf` (pdf.js empaqueté pour le serverless, sans
// dépendance native) rend le bon résultat sur les deux : le vrai texte du premier, et RIEN
// pour le second. Un fichier de moins dans le dépôt vaut mieux qu'une extraction qui ment.
//
// CE QUI RESTE NON COUVERT, et le reste : un PDF SCANNÉ ne contient aucun texte à extraire.
// Aucune bibliothèque n'y change quoi que ce soit sans reconnaissance de caractères, qui
// n'est pas branchée. La différence, c'est qu'on le sait désormais pour de bon — au lieu de
// le supposer à tort.

export type ResultatTexte = { ok: true; texte: string } | { ok: false; raison: string };

/** Formats acceptés. Vérifié sur le CONTENU, pas sur l'extension du nom de fichier. */
export const TYPES_ACCEPTES = ["application/pdf", "text/plain"] as const;

/** 8 Mo. Un CV qui pèse plus que ça porte des images, pas du texte. */
export const TAILLE_MAX_OCTETS = 8 * 1024 * 1024;

/**
 * En dessous, ce n'est pas un CV.
 *
 * Sert aussi de garde de VRAISEMBLANCE : c'est le seuil qui a rattrapé le PDF de captures
 * d'écran (2 caractères extraits). Un document qui rend trois mots n'est pas un CV maigre,
 * c'est une extraction qui n'a rien trouvé.
 */
export const LONGUEUR_MIN_TEXTE = 100;

/**
 * Détecte le type RÉEL d'un fichier par ses premiers octets.
 *
 * Le `Content-Type` d'un téléversement est déclaré par le client : il se change. On lit
 * donc la signature — un fichier qui prétend être un PDF sans commencer par `%PDF-` n'en
 * est pas un, et on refuse avant de le stocker.
 */
export function typeReel(octets: Uint8Array): "application/pdf" | "text/plain" | null {
  if (octets.length >= 5) {
    const entete = String.fromCharCode(...octets.slice(0, 5));
    if (entete === "%PDF-") return "application/pdf";
  }
  // Du texte : décodable en UTF-8 strict, sans octet de contrôle inattendu.
  try {
    const s = new TextDecoder("utf-8", { fatal: true }).decode(octets);
    if (!/[\x00-\x08\x0E-\x1F]/.test(s.slice(0, 4000))) return "text/plain";
  } catch {
    // Pas de l'UTF-8 : ce n'est ni un PDF ni du texte que l'on sache lire.
  }
  return null;
}

/** Le message d'un PDF sans couche de texte. Il doit dire QUOI FAIRE, pas seulement non. */
const RAISON_SANS_TEXTE =
  "Aucun texte lisible dans ce PDF : il ne contient que des images (document scanné, " +
  "ou export en mode image). La reconnaissance de caractères n'est pas branchée. " +
  "Ré-exporte ton CV depuis ton traitement de texte, ou dépose-le en .txt.";

async function texteDuPdf(octets: Uint8Array): Promise<ResultatTexte> {
  let texte: string;
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    // ⚠️ COPIE OBLIGATOIRE — MESURÉ : `getDocumentProxy` DÉTACHE le tampon qu'on lui passe
    // (pdf.js en prend la propriété). Le tableau de l'APPELANT tombe à 0 octet : vérifié,
    // 124 310 → 0. L'appelant, lui, a besoin des octets APRÈS l'extraction pour stocker le
    // fichier — sans cette copie, la base recevrait un CV vide, sans la moindre erreur,
    // et personne ne s'en apercevrait avant d'essayer de le ré-analyser.
    const doc = await getDocumentProxy(octets.slice());
    const extrait = await extractText(doc, { mergePages: true });
    texte = (Array.isArray(extrait.text) ? extrait.text.join("\n") : extrait.text) ?? "";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Un PDF protégé est un cas à part : Marc peut y remédier en deux clics, à condition
    // qu'on le lui dise au lieu de le ranger avec les fichiers illisibles.
    if (/password|encrypt/i.test(msg)) {
      return {
        ok: false,
        raison: "Ce PDF est protégé par un mot de passe. Enregistre-le sans protection.",
      };
    }
    return { ok: false, raison: `PDF illisible : ${msg}` };
  }

  const propre = texte.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (propre.length < LONGUEUR_MIN_TEXTE) return { ok: false, raison: RAISON_SANS_TEXTE };
  return { ok: true, texte: propre };
}

/**
 * Extrait le texte d'un fichier téléversé.
 *
 * ⚠️ RIEN N'EST AVALÉ : chaque cas d'échec dit ce qu'il est ET ce que Marc peut faire.
 * Un « ça n'a pas marché » générique le laisserait re-téléverser le même fichier en boucle.
 */
export async function extraireTexte(octets: Uint8Array): Promise<ResultatTexte> {
  if (octets.length === 0) return { ok: false, raison: "Fichier vide." };
  if (octets.length > TAILLE_MAX_OCTETS) {
    const mo = (octets.length / 1024 / 1024).toFixed(1);
    return {
      ok: false,
      raison: `Fichier trop lourd (${mo} Mo, maximum 8 Mo). Un CV de cette taille porte des images.`,
    };
  }

  const type = typeReel(octets);
  if (type === null) {
    return { ok: false, raison: "Format non reconnu. Dépose un PDF ou un fichier texte (.txt)." };
  }

  if (type === "text/plain") {
    const texte = new TextDecoder("utf-8").decode(octets).trim();
    return texte.length < LONGUEUR_MIN_TEXTE
      ? { ok: false, raison: "Le fichier texte est presque vide." }
      : { ok: true, texte };
  }

  return texteDuPdf(octets);
}
