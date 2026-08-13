// tests/aides/pdf.ts — fabriquer des PDF d'épreuve, valides et déterministes.
//
// POURQUOI FABRIQUER PLUTÔT QUE COMMITTER DES FICHIERS
//
// L'extraction a d'abord été éprouvée sur deux PDF réels trouvés sur la machine de
// développement, et c'est ce qui a révélé que la première implémentation mentait
// (cf. l'en-tête de `lib/cv/texte.ts`). Mais un test ne peut pas DÉPENDRE de ces
// fichiers : ils n'existent pas sur le serveur d'intégration — la CI est passée au rouge
// à la première tentative, sur un test qui exigeait leur présence.
//
// Les committer n'était pas une option non plus :
//   · l'un est un PDF de CAPTURES D'ÉCRAN d'un autre projet de Marc. Il montre du contenu
//     réel de son Drive : le garde-fou n°1 interdit de le faire entrer ici, et c'est
//     exactement le genre de fichier qu'on ajoute « juste pour un test » avant de
//     l'oublier dans l'historique pour toujours ;
//   · l'autre pèse 121 ko et n'a aucun rapport avec JobAI.
//
// On construit donc les deux CAS qui comptent, au format PDF, dans le test lui-même. Ce
// qui est éprouvé ici, c'est notre CÂBLAGE de `unpdf` : un PDF avec du texte doit rendre
// son texte, un PDF sans couche de texte doit échouer honnêtement. La validation contre le
// monde réel a été faite une fois, à la main, et elle est consignée — dans le commit, dans
// l'ADR-0009, et dans l'en-tête du module.
//
// ⚠️ CES OCTETS SONT LUS PAR pdf.js, PAS PAR NOTRE CODE. C'est ce qui rend l'épreuve
// honnête : si la structure produite ici était fantaisiste, pdf.js la refuserait et les
// tests tomberaient. On n'écrit pas un PDF « que notre lecteur sait lire » — on écrit un
// PDF, et un lecteur tiers en juge.

/** Assemble des objets PDF numérotés en un document complet, table `xref` comprise. */
function assembler(objets: readonly string[]): Uint8Array {
  const entete = "%PDF-1.4\n";
  let corps = "";
  const decalages: number[] = [];

  objets.forEach((o, i) => {
    decalages.push(entete.length + corps.length);
    corps += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });

  const debutXref = entete.length + corps.length;
  let xref = `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
  for (const d of decalages) xref += `${d.toString().padStart(10, "0")} 00000 n \n`;

  const fin =
    `trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${debutXref}\n%%EOF\n`;

  return new TextEncoder().encode(entete + corps + xref + fin);
}

/**
 * Un PDF d'une page portant le texte donné.
 *
 * Police standard (Helvetica), flux de contenu non compressé : c'est la forme la plus
 * simple qu'un lecteur conforme doit savoir lire.
 */
export function pdfAvecTexte(lignes: readonly string[]): Uint8Array {
  // `(` et `)` délimitent une chaîne en PDF : un texte qui en contient doit les échapper,
  // sinon le flux devient illisible — et un CV écrit « (2023-2026) » tout le temps.
  const echapper = (s: string) => s.replace(/([\\()])/g, "\\$1");
  const dessin = lignes
    .map((l, i) => `BT /F1 12 Tf 50 ${760 - i * 16} Td (${echapper(l)}) Tj ET`)
    .join("\n");

  return assembler([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${dessin.length} >>\nstream\n${dessin}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]);
}

/**
 * Un PDF d'une page SANS aucune couche de texte — le cas du document scanné.
 *
 * La page existe et le document est valide ; il n'y a simplement rien à extraire. C'est le
 * cas que la première implémentation avait transformé en 76 784 caractères de charabia
 * annoncés comme un succès.
 */
export function pdfSansTexte(): Uint8Array {
  // Un rectangle gris : de quoi remplir la page sans y poser un seul opérateur de texte.
  //
  // ⚠️ LES COORDONNÉES ÉVITENT TROIS NOMBRES DE TROIS CHIFFRES D'AFFILÉE, et ce n'est pas
  // une coquetterie. Une première version, tout en valeurs rondes à trois chiffres, a fait
  // échouer `tests/piiGuard.test.ts` : le motif du numéro d'assurance sociale y voyait un
  // NAS. Le garde a raison d'être brutal — il ne peut pas savoir que ce sont des points sur
  // une page — donc c'est le dessin qui s'adapte, jamais le garde qu'on assouplit.
  // (Le commentaire qui CITAIT la valeur fautive l'a fait échouer une seconde fois : un
  // scan de source ne distingue pas une explication de la chose expliquée.)
  // Ne pas « arrondir » ces valeurs en passant : la CI retomberait, cause introuvable.
  const dessin = "0.5 g 50 80 500 700 re f";
  return assembler([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
    `<< /Length ${dessin.length} >>\nstream\n${dessin}\nendstream`,
  ]);
}
