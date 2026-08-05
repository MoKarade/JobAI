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
import { registreEtablissements, registreNoms } from "../lib/db/schema";
import {
  cleNom,
  decouperCsv,
  indicesColonnes,
  lireEtablissement,
  type Etablissement,
} from "../lib/registre";

/** Les deux fichiers lus. Nommés ici pour qu'on voie tout de suite ce qu'on ouvre. */
const FICHIER_ETABLISSEMENTS = "Etablissements.csv";

/**
 * Le fichier des DÉNOMINATIONS (274,8 Mo).
 *
 * ⚠️ IL EST NÉCESSAIRE, ET LA MESURE LE DIT. Sans lui, on ne cherchait que dans `NOM_ETAB`
 * — le nom de l'ÉTABLISSEMENT — et le résultat réel du 2026-08-05 était « registre=11/73 ·
 * 61 absentes ». Le nom d'un établissement n'est souvent pas celui sous lequel on connaît
 * l'entreprise. `Nom.csv` porte toutes ses dénominations, noms commerciaux compris.
 *
 * On ne garde que les NEQ dont un établissement a DÉJÀ été retenu : le fichier couvre tout
 * le Québec, la région n'en est qu'une fraction, et filtrer ainsi évite de charger des
 * millions de lignes pour rien.
 */
const FICHIER_NOMS = "Nom.csv";

/** Les colonnes lues dans `Nom.csv`, par leur nom exact. */
const COLONNES_NOM = ["NEQ", "NOM_ASSUJ", "DAT_FIN_NOM_ASSUJ"] as const;

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

  const chemin = join(resolve(dossier), FICHIER_ETABLISSEMENTS);
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
  /** Les NEQ retenus — ils bornent la lecture du fichier des dénominations. */
  const neqRetenus = new Set<string>();

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
      neqRetenus.add(e.neq);
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

  await importerNoms(resolve(dossier), neqRetenus);

  console.log("\nC'est fini. L'app peut maintenant chercher une adresse dans le registre");
  console.log("sans aucun accès réseau — et elle indiquera « registre » comme source.");
}

/**
 * Charge les dénominations des entreprises RETENUES.
 *
 * Le fichier couvre tout le Québec ; on ne garde que les NEQ dont un établissement de la
 * région a déjà été retenu. C'est ce filtre qui rend une lecture de 274 Mo supportable —
 * et qui garde la table à une taille utile.
 */
async function importerNoms(dossier: string, neqRetenus: Set<string>): Promise<void> {
  const chemin = join(dossier, FICHIER_NOMS);
  console.log(`\nLecture de ${chemin}`);
  console.log("Seules les dénominations des entreprises déjà retenues sont gardées.\n");

  const flux = createInterface({
    input: createReadStream(chemin, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let indices: Record<string, number> | null = null;
  let lues = 0;
  let ecrites = 0;
  let lot: { neq: string; nom: string; nomCle: string }[] = [];

  const ecrireLot = async (): Promise<void> => {
    if (lot.length === 0) return;
    await db.insert(registreNoms).values(lot);
    ecrites += lot.length;
    lot = [];
  };

  for await (const ligne of flux) {
    if (indices === null) {
      indices = indicesColonnes(ligne, COLONNES_NOM);
      if (indices === null) {
        console.error("L'entête de Nom.csv ne porte pas les colonnes attendues — ignoré.");
        console.error(`Entête lue : ${ligne.slice(0, 300)}`);
        return;
      }
      await db.delete(registreNoms);
      continue;
    }

    lues++;
    const champs = decouperCsv(ligne);
    const neq = (champs[indices.NEQ ?? -1] ?? "").trim();
    if (!neqRetenus.has(neq)) continue;

    // ⚠️ ON NE GARDE QUE LES NOMS ENCORE EN VIGUEUR. Une date de fin signifie que
    // l'entreprise ne porte plus ce nom : le garder ferait retrouver une entreprise sous une
    // dénomination abandonnée, et lui attribuer l'adresse d'aujourd'hui sous un nom d'hier.
    if ((champs[indices.DAT_FIN_NOM_ASSUJ ?? -1] ?? "").trim() !== "") continue;

    const nom = (champs[indices.NOM_ASSUJ ?? -1] ?? "").trim();
    const cle = cleNom(nom);
    if (nom === "" || cle === "") continue;

    lot.push({ neq, nom, nomCle: cle });
    if (lot.length >= LOT) await ecrireLot();

    if (lues % 500_000 === 0) {
      console.log(`   ${lues.toLocaleString("fr-CA")} lignes lues · ${ecrites} gardées`);
    }
  }

  await ecrireLot();
  console.log(`${lues.toLocaleString("fr-CA")} lignes lues.`);
  console.log(`${ecrites.toLocaleString("fr-CA")} dénominations gardées.`);
}

void principal();
