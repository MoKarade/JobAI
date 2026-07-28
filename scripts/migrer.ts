// scripts/migrer.ts — appliquer les migrations, et le PROUVER.
//
// POURQUOI CE SCRIPT REMPLACE `drizzle-kit migrate` (incident du 2026-07-28).
//
// `drizzle-kit migrate` choisit le pilote `@neondatabase/serverless` dès qu'il est
// installé, et ce pilote exige un WEBSOCKET pour migrer — qu'il faut lui configurer soi-même
// en Node (`neonConfig.webSocketConstructor`). Sans ça, la connexion n'aboutit pas et
// `drizzle-kit` **sort sans rien appliquer et sans rien dire** : code de retour 0, aucune
// erreur, aucune table créée. Marc l'a lancé deux fois en croyant que c'était fait ; seuls
// les journaux de production ont révélé que la table manquait toujours.
//
// L'app, elle, parle à Neon en HTTP (`drizzle-orm/neon-http`) et fonctionne depuis le
// premier jour. On emprunte donc EXACTEMENT ce chemin-là plutôt que d'ajouter une
// dépendance ou de configurer un websocket pour un usage ponctuel.
//
// ET SURTOUT : ce script VÉRIFIE le résultat au lieu de l'annoncer. Un migrateur qui dit
// « terminé » sans regarder la base est précisément ce qui a coûté cette heure-ci.

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import { sql } from "drizzle-orm";
import { AIDE_URL_MANQUANTE, chargerEnvLocal, urlBaseDeDonnees } from "../lib/chargerEnv";

/** Les tables que le schéma doit avoir créées. Le script échoue si l'une manque. */
const TABLES_ATTENDUES = ["offers", "offer_reasons", "villes"] as const;

async function main() {
  chargerEnvLocal();

  const url = urlBaseDeDonnees();
  if (url === null) {
    console.error(AIDE_URL_MANQUANTE);
    process.exit(1);
  }

  const db = drizzle(neon(url));

  console.log("Application des migrations depuis ./drizzle …");
  await migrate(db, { migrationsFolder: "./drizzle" });

  // VÉRIFICATION INDÉPENDANTE. On ne se fie pas au fait que `migrate` n'ait pas levé : on
  // demande à la base ce qu'elle contient réellement.
  const presentes = await db.execute<{ table_name: string }>(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  const noms = presentes.rows.map((r) => r.table_name);

  const manquantes = TABLES_ATTENDUES.filter((t) => !noms.includes(t));

  if (manquantes.length > 0) {
    console.error("\nÉCHEC : des tables attendues sont absentes après migration.");
    console.error(`  attendues : ${TABLES_ATTENDUES.join(", ")}`);
    console.error(`  présentes : ${noms.join(", ") || "(aucune)"}`);
    console.error(`  MANQUANTES : ${manquantes.join(", ")}`);
    // Sortie en échec : un script de migration qui rend 0 sans avoir migré est exactement
    // le piège qu'on ferme ici.
    process.exit(1);
  }

  console.log(`\nTerminé. Tables présentes : ${noms.join(", ")}.`);
}

main().catch((err) => {
  console.error("\nÉCHEC de la migration :", err instanceof Error ? err.message : err);
  process.exit(1);
});
