// lib/migrations.ts — appliquer les migrations sans commande à taper.
//
// Demande de Marc, 2026-07-31 : « je veux plus jamais avoir à faire run db migrate, je veux
// full auto ». Chaque migration lui coûtait un aller-retour vers son poste, et une colonne
// ajoutée ici restait invisible en production jusqu'à ce qu'il y pense.
//
// COMMENT ÇA MARCHE, ET POURQUOI C'EST SÛR
// Drizzle tient lui-même une table `__drizzle_migrations` : chaque fichier SQL n'est appliqué
// qu'une fois, et il sait lesquels. Rejouer cette fonction n'a donc aucun effet quand tout
// est à jour — c'est ce qui permet de l'appeler à chaque démarrage sans y penser.
//
// UNE SEULE FOIS PAR PROCESSUS
// La promesse est mémorisée : dix requêtes simultanées au démarrage d'une instance froide
// ne déclenchent qu'une application. Entre INSTANCES, c'est Drizzle qui arbitre — deux
// serveurs qui démarrent ensemble ne peuvent pas appliquer deux fois le même fichier.
//
// UN ÉCHEC NE DOIT PAS ÉTEINDRE L'APP
// Si les migrations échouent, les pages continuent de s'afficher avec ce que la base a
// déjà. Une table manquante donnera un écran honnête (« schéma absent », `lib/panne.ts`)
// plutôt qu'une page blanche. L'erreur est journalisée, jamais avalée.

import { migrate } from "drizzle-orm/neon-http/migrator";
import { resolve } from "node:path";
import { db } from "./db";

let enCours: Promise<void> | null = null;
let derniereErreur: string | null = null;

/** Ce que la dernière tentative a donné — pour le diagnostic, jamais pour décider. */
export function etatMigrations(): { tentee: boolean; erreur: string | null } {
  return { tentee: enCours !== null, erreur: derniereErreur };
}

/**
 * Applique les migrations en attente. Sans effet si tout est à jour.
 *
 * N'échoue JAMAIS vers l'appelant : l'affichage prime sur la mise à niveau. Un appelant qui
 * devrait gérer cette erreur finirait par l'avaler pour ne pas casser sa page — autant le
 * faire ici, une fois, en le disant.
 */
export async function assurerMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  if (enCours) return enCours;

  enCours = (async () => {
    try {
      // Le dossier est résolu depuis la racine du projet : `process.cwd()` est stable sur
      // Vercel comme en local, contrairement à un chemin relatif au module compilé.
      await migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
      derniereErreur = null;
    } catch (err) {
      derniereErreur = err instanceof Error ? err.message : String(err);
      console.error("[migrations] application impossible", err);
      // On ne relance pas : la page doit s'afficher. Mais la prochaine instance réessaiera,
      // et une table réellement manquante se verra à l'écran plutôt que de passer inaperçue.
    }
  })();

  return enCours;
}
