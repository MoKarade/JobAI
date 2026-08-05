// scripts/importer-registre.ts — charger les établissements de la région en base.
//
//   npm run registre:importer -- "C:\\Users\\dessin14\\Downloads\\JeuDonnees"
//
// CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS
// Il lit `Etablissements.csv` LIGNE À LIGNE, ne garde que la région de Québec, et remplace
// en bloc le contenu de `registre_etablissements`. Il n'écrit rien d'autre : ni offres, ni
// positions, ni le moindre champ appartenant à Marc.
//
// ⚠️ IL NE LIT QUE `Etablissements.csv`. Trois raisons, et aucune n'est un détail :
//   · C'est le seul fichier qui porte À LA FOIS un nom (`NOM_ETAB`) et une adresse.
//   · Ce sont les ÉTABLISSEMENTS — les lieux où l'entreprise opère réellement. Le fichier
//     `Entreprise.csv` (615 Mo) ne donne que le domicile légal, souvent le bureau du
//     comptable : l'afficher comme « l'adresse » enverrait Marc à la mauvaise porte.
//   · Les fichiers d'administrateurs et d'actionnaires ne sont JAMAIS ouverts — données de
//     personnes tierces, garde-fou n°1.
//
// LECTURE EN FLUX, PAS EN MÉMOIRE. 34 Mo tiendraient en RAM ; 615 Mo non, et le jour où
// l'on voudra lire un autre fichier du registre, l'habitude sera prise. On lit par blocs et
// on découpe aux fins de ligne — c'est aussi ce qui permet d'annoncer une progression sur
// un fichier dont on ignore le nombre de lignes.
//
// REMPLACEMENT EN BLOC, ET C'EST SÛR ICI. `registre_etablissements` est une table de
// RÉFÉRENCE : elle ne contient aucune donnée de Marc, et la perdre ne coûte qu'un ré-import.
// Un import partiel serait pire qu'un remplacement — on ne saurait plus ce qui est à jour.

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { resolve, join } from "node:path";
import { chargerEnvLocal } from "../lib/chargerEnv";
import { db } from "../lib/db";
import { registreEtablissements } from "../lib/db/schema";
import {
  cleNom,
  indicesColonnes,
  lireEtablissement,
  type Etablissement,
} from "../lib/registre";

/** Le seul fichier lu. Nommé ici pour qu'on voie tout de suite ce qu'on ouvre. */
const FICHIER = "Etablissements.csv";

/**
 * Taille des lots d'insertion.
 *
 * Assez grand pour que l'import ne soit pas une succession d'allers-retours réseau, assez
 * petit pour rester sous la limite de paramètres d'une requête Postgres (~65 000) : huit
 * colonnes × 1 000 lignes = 8 000 paramètres, avec de la marge.
 */
const LOT = 1_000;

async function principal(): Promise<void> {
  chargerEnvLocal();

  const dossier = process.argv[2];
  if (!dossier) {
    console.error("Il manque le dossier extrait. Exemple :");
    console.error('  npm run registre:importer -- "C:\\\\Users\\\\dessin14\\\\Downloads\\\\JeuDonnees"');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL est absente.");
    console.error("Pose-la dans `.env.local` à la racine du dépôt — voir docs/DEPLOIEMENT.md.");
    process.exit(1);
  }

  const chemin = join(resolve(dossier), FICHIER);
  console.log(`Lecture de ${chemin}`);
  console.log("Seuls les établissements de la région de Québec sont retenus.\n");

  const flux = createInterface({
    input: createReadStream(chemin, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let indices: Record<string, number> | null = null;
  let lues = 0;
  let retenues = 0;
  let lot: Etablissement[] = [];
  let ecrites = 0;

  const ecrireLot = async (): Promise<void> => {
    if (lot.length === 0) return;
    await db.insert(registreEtablissements).values(
      lot.map((e) => ({
        neq: e.neq,
        nom: e.nom,
        // La clé de recherche est calculée À L'IMPORT, pas à la lecture : sinon chaque
        // requête devrait normaliser toute la table pour comparer, et l'index ne servirait
        // à rien.
        nomCle: cleNom(e.nom),
        adresse: e.adresse,
        ville: e.ville,
        codePostal: e.codePostal === "" ? null : e.codePostal,
        principal: e.principal,
      })),
    );
    ecrites += lot.length;
    lot = [];
  };

  for await (const ligne of flux) {
    if (indices === null) {
      // ⚠️ L'ENTÊTE DÉCIDE DE TOUT. Les colonnes sont lues par NOM : le registre est
      // republié deux fois par mois, et une colonne insérée décalerait un import entier
      // sans qu'aucune erreur ne se déclenche — les adresses atterriraient dans le champ
      // du nom. Si une colonne attendue manque, on s'arrête ici.
      indices = indicesColonnes(ligne);
      if (indices === null) {
        console.error("L'entête ne porte pas les colonnes attendues. Import ARRÊTÉ.");
        console.error(`Entête lue : ${ligne.slice(0, 400)}`);
        console.error("\nLe format du registre a probablement changé — relance");
        console.error("`npm run registre:inspecter` et envoie la sortie.");
        process.exit(1);
      }
      // On ne vide la table qu'une fois l'entête VALIDÉE : un format inattendu ne doit pas
      // laisser Marc avec une table vide et rien pour la remplir.
      await db.delete(registreEtablissements);
      console.log("Table vidée, entête reconnue. Import en cours…\n");
      continue;
    }

    lues++;
    const e = lireEtablissement(ligne, indices);
    if (e !== null) {
      retenues++;
      lot.push(e);
      if (lot.length >= LOT) await ecrireLot();
    }

    // Une progression toutes les 100 000 lignes : sans elle, un import de plusieurs
    // minutes ressemble à un blocage, et on l'interrompt.
    if (lues % 100_000 === 0) {
      console.log(`   ${lues.toLocaleString("fr-CA")} lignes lues · ${retenues} retenues`);
    }
  }

  await ecrireLot();

  console.log(`\n${lues.toLocaleString("fr-CA")} lignes lues.`);
  console.log(`${ecrites.toLocaleString("fr-CA")} établissements de la région écrits en base.`);

  if (ecrites === 0) {
    // Un import qui n'écrit rien mais se termine « avec succès » est le pire des résultats :
    // il ressemble à une réussite. Le dire, et dire quoi regarder.
    console.error("\n⚠️ AUCUN établissement retenu. Ce n'est pas normal.");
    console.error("À vérifier : est-ce bien le dossier du registre, et la colonne LIGN2_ADR");
    console.error("porte-t-elle des villes de la forme « Québec (Québec) » ?");
    process.exit(1);
  }

  console.log("\nC'est fini. L'app peut maintenant chercher une adresse dans le registre");
  console.log("sans aucun accès réseau — et elle indiquera « registre » comme source.");
}

void principal();
