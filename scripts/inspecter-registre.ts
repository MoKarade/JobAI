// scripts/inspecter-registre.ts — REGARDER le registre avant d'écrire quoi que ce soit.
//
//   npm run registre:inspecter -- "C:\\Users\\Marc\\Downloads\\registre"
//
// POURQUOI CETTE ÉTAPE EXISTE, ET POURQUOI ELLE PASSE AVANT L'IMPORT
// Le fichier de données ouvertes du Registraire est inatteignable depuis la CI : Cloudflare
// refuse l'adresse des runners GitHub (mesuré trois fois, Ray ID à l'appui), et le datastore
// de Données Québec ne contient qu'une page d'erreur — leur propre moissonneur s'est heurté
// au même mur. Marc, lui, y accède depuis chez lui. C'est donc lui qui l'apporte.
//
// Mais je n'ai JAMAIS vu ce fichier. Écrire l'import maintenant reviendrait à deviner ses
// noms de colonnes, son séparateur et son encodage — et j'ai fabriqué quatre faux verdicts
// aujourd'hui en devinant à la place de mesurer. Ce script ne fait donc RIEN d'autre que
// décrire ce qu'il trouve, pour que l'import soit écrit sur du réel.
//
// CE QU'IL NE FAIT PAS : aucun réseau, aucune base, aucune écriture. Il lit et il raconte.
//
// ⚠️ GARDE-FOU N°1 — il n'OUVRE PAS les fichiers de personnes. Le registre contient les
// administrateurs et actionnaires : des données de tiers, qu'on n'a aucune raison de lire
// ni de rapatrier. Ils sont listés (pour qu'on sache qu'ils existent) mais jamais ouverts.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, join, extname } from "node:path";

/** Fichiers dont le nom trahit un contenu de PERSONNES : listés, jamais ouverts. */
const PERSONNES = /(administrateur|actionnaire|personne|physique|dirigeant|associe)/i;

/** Ce qui vaut la peine d'être ouvert : du texte, pas un PDF ni une image. */
const TEXTE = new Set([".csv", ".txt", ".tsv", ".dat", ".xml", ".json"]);

function humain(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1)} Ko`;
  return `${(octets / 1024 / 1024).toFixed(1)} Mo`;
}

/**
 * Devine le séparateur d'une ligne d'entête.
 *
 * On ne « détecte » pas au sens fort : on compte les candidats et on rend le plus fréquent.
 * C'est suffisant pour DÉCRIRE, et l'import vrai sera écrit une fois qu'on aura vu la ligne.
 */
function separateur(ligne: string): string {
  const candidats: [string, string][] = [
    ["point-virgule", ";"],
    ["virgule", ","],
    ["tabulation", "\t"],
    ["barre verticale", "|"],
  ];
  let meilleur = "(indéterminé)";
  let max = 0;
  for (const [nom, car] of candidats) {
    const n = ligne.split(car).length - 1;
    if (n > max) {
      max = n;
      meilleur = `${nom} (${n} occurrences)`;
    }
  }
  return meilleur;
}

/** Les premiers octets disent l'encodage mieux qu'une supposition. */
function encodage(tampon: Buffer): string {
  if (tampon[0] === 0xef && tampon[1] === 0xbb && tampon[2] === 0xbf) return "UTF-8 avec BOM";
  if (tampon[0] === 0xff && tampon[1] === 0xfe) return "UTF-16 LE";
  if (tampon[0] === 0xfe && tampon[1] === 0xff) return "UTF-16 BE";
  // Un octet ≥ 0x80 isolé sans suite valide UTF-8 sent le Latin-1 (fréquent au Québec).
  const texte = tampon.subarray(0, 4096).toString("utf8");
  if (texte.includes("\uFFFD")) return "probablement Latin-1 / Windows-1252 (accents cassés en UTF-8)";
  return "UTF-8 (sans BOM)";
}

function decrire(chemin: string, nom: string): void {
  const taille = statSync(chemin).size;
  const estPersonne = PERSONNES.test(nom);
  const ext = extname(nom).toLowerCase();

  console.log(`\n── ${nom}  (${humain(taille)})`);

  if (estPersonne) {
    console.log("   ⛔ NON OUVERT — nom évoquant des données de PERSONNES (garde-fou n°1).");
    console.log("      Il est listé pour qu'on sache qu'il existe, pas pour être lu.");
    return;
  }
  if (!TEXTE.has(ext)) {
    console.log(`   (extension ${ext || "sans"} — pas un fichier texte, non ouvert)`);
    return;
  }

  // On ne lit que le DÉBUT : le fichier peut faire des centaines de Mo, et deux lignes
  // suffisent à décrire sa forme.
  const tampon = Buffer.alloc(Math.min(taille, 64 * 1024));
  const fd = readFileSync(chemin).subarray(0, tampon.length);
  fd.copy(tampon);

  console.log(`   encodage : ${encodage(tampon)}`);
  const lignes = tampon.toString("utf8").split(/\r?\n/).slice(0, 3);
  const entete = lignes[0] ?? "";
  console.log(`   séparateur probable : ${separateur(entete)}`);
  console.log(`   ENTÊTE  : ${entete.slice(0, 700)}`);
  if (lignes[1]) console.log(`   ligne 1 : ${lignes[1].slice(0, 700)}`);
  if (lignes[2]) console.log(`   ligne 2 : ${lignes[2].slice(0, 700)}`);
}

function principal(): void {
  const dossier = process.argv[2];
  if (!dossier) {
    console.error("Il manque le dossier. Exemple :");
    console.error('  npm run registre:inspecter -- "C:\\\\Users\\\\Marc\\\\Downloads\\\\registre"');
    console.error("\n(le dossier est celui obtenu en EXTRAYANT le .zip téléchargé)");
    process.exit(1);
  }

  const racine = resolve(dossier);
  let entrees: string[];
  try {
    entrees = readdirSync(racine);
  } catch {
    console.error(`Dossier introuvable ou illisible : ${racine}`);
    console.error("Vérifie le chemin — et qu'il s'agit bien du dossier EXTRAIT, pas du .zip.");
    process.exit(1);
  }

  console.log(`INSPECTION DU REGISTRE — ${racine}`);
  console.log(`${entrees.length} entrée(s). Rien n'est modifié, rien n'est envoyé.\n`);
  console.log("Ce qu'on cherche : le fichier qui porte les NOMS d'entreprises, et celui qui");
  console.log("porte les ADRESSES — avec leurs colonnes exactes.");

  for (const nom of entrees.sort()) {
    const chemin = join(racine, nom);
    if (statSync(chemin).isDirectory()) {
      console.log(`\n── ${nom}/  (dossier)`);
      for (const sous of readdirSync(chemin).sort()) {
        decrire(join(chemin, sous), `${nom}/${sous}`);
      }
      continue;
    }
    decrire(chemin, nom);
  }

  console.log("\n──────────────────────────────────────────────");
  console.log("COPIE-COLLE TOUT CE QUI PRÉCÈDE dans le chat. C'est à partir de ces");
  console.log("colonnes-là que l'import sera écrit — pas à partir d'une supposition.");
}

principal();
