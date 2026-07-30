// scripts/charger-seed.ts — charge le jeu de départ dans la base, à la main.
//
//   npm run db:seed   (la chaîne de connexion est lue depuis `.env.local`)
//
// CE SCRIPT N'EST PLUS NÉCESSAIRE AU QUOTIDIEN : depuis le 2026-07-30, l'app applique
// elle-même le jeu de départ au premier affichage qui suit un déploiement
// (`lib/synchro.ts`, `assurerSeedAJour`). Il reste utile pour deux choses — amorcer une
// base neuve avant toute visite, et forcer l'application sans attendre.
//
// IDEMPOTENT et NON DESTRUCTIF : il applique exactement la règle du garde-fou n°2. Les
// champs qui appartiennent à Marc (statut, priorité, date d'envoi, note personnelle) sont
// PRÉSERVÉS ; seuls les champs de recherche sont rafraîchis.
//
// Il appelle LE MÊME code que l'app (`appliquerSeed`) : une deuxième implémentation de
// l'upsert finirait par diverger, et c'est le suivi de Marc qui en paierait le prix.

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { syncState } from "../lib/db/schema";
import { CLE_SEED, appliquerSeed, empreinteSeed } from "../lib/synchro";
import { chargerEnvLocal, diagnostiquerUrl } from "../lib/chargerEnv";

async function main() {
  // `tsx` tourne hors de Next.js : `.env.local` ne se charge pas tout seul. Même correctif
  // que `drizzle.config.ts` — sans lui, il faut recoller la chaîne de connexion dans le
  // terminal à chaque nouvelle fenêtre.
  chargerEnvLocal();

  const etat = diagnostiquerUrl();
  if (!etat.ok) {
    console.error(etat.message);
    process.exit(1);
  }

  const db = drizzle(neon(etat.url), { schema });
  const { crees, majs } = await appliquerSeed(db);

  // La même empreinte que celle de l'app : sans cette mise à jour, la première visite
  // referait tout le travail que ce script vient de faire.
  const cible = empreinteSeed();
  const maj = await db
    .update(syncState)
    .set({ valeur: cible, majLe: new Date() })
    .where(eq(syncState.cle, CLE_SEED))
    .returning();
  if (maj.length === 0) {
    await db.insert(syncState).values({ cle: CLE_SEED, valeur: cible }).onConflictDoNothing();
  }

  console.log(`Jeu de départ chargé : ${crees} offre(s) créée(s), ${majs} rafraîchie(s).`);
  console.log("Le suivi (statut, priorité, date d'envoi, note perso) a été préservé.");
  console.log(`Empreinte enregistrée : ${cible}`);
}

main().catch((err) => {
  console.error("Chargement impossible :", err);
  process.exit(1);
});
