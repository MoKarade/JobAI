// scripts/charger-seed.ts — charge le jeu de départ dans la base.
//
//   npm run db:seed   (la chaîne de connexion est lue depuis `.env.local`)
//
// IDEMPOTENT et NON DESTRUCTIF : il applique exactement la règle du garde-fou n°2. Les
// champs qui appartiennent à Marc (statut, priorité, date d'envoi, note personnelle) sont
// PRÉSERVÉS sur une offre déjà présente ; seuls les champs de recherche sont rafraîchis.
// On peut donc le relancer après une mise à jour du jeu de départ sans perdre le suivi.
//
// À lancer une fois l'instance Neon créée et la migration appliquée (`npm run db:migrate`).

import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { offerReasons, offers } from "../lib/db/schema";
import { SEED } from "../lib/seed";
import { fusionner } from "../lib/suivi";
import type { Offre } from "../lib/types";
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
  const url = etat.url;

  const db = drizzle(neon(url), { schema });

  const existantes = await db.select().from(offers);
  // On ne relit que les champs que la fusion protège : le reste vient du jeu de départ.
  const suivi: Offre[] = existantes.map((l) => ({
    ...(SEED.find((s) => s.id === l.id) ?? ({} as Offre)),
    id: l.id,
    statut: l.statut,
    priorite: l.priorite,
    dateEnvoi: l.dateEnvoi,
    userNote: l.userNote,
  }));

  const aEcrire = fusionner(SEED, suivi);

  let crees = 0;
  let majs = 0;
  for (const o of aEcrire) {
    const deja = existantes.some((l) => l.id === o.id);
    const valeurs = {
      id: o.id,
      source: o.source,
      dateReperage: o.dateReperage,
      entreprise: o.entreprise,
      poste: o.poste,
      lien: o.lien,
      km: o.km,
      salaireAffiche: o.salaireAffiche,
      priorite: o.priorite,
      statut: o.statut,
      dateEnvoi: o.dateEnvoi,
      score: o.score,
      scoreSource: o.scoreSource,
      notes: o.notes,
      userNote: o.userNote,
      histo: o.histo,
      majLe: new Date(),
    };

    if (deja) {
      await db.update(offers).set(valeurs).where(eq(offers.id, o.id));
      majs++;
    } else {
      await db.insert(offers).values(valeurs);
      crees++;
    }

    // Les justifications viennent toujours du jeu de départ : Marc ne les édite pas.
    await db.delete(offerReasons).where(eq(offerReasons.offerId, o.id));
    if (o.raisons.length > 0) {
      await db.insert(offerReasons).values(
        o.raisons.map((r, i) => ({ offerId: o.id, ton: r.ton, texte: r.texte, ordre: i })),
      );
    }
  }

  console.log(`Jeu de départ chargé : ${crees} offre(s) créée(s), ${majs} rafraîchie(s).`);
  console.log("Le suivi (statut, priorité, date d'envoi, note perso) a été préservé.");
}

main().catch((err) => {
  console.error("Chargement impossible :", err);
  process.exit(1);
});
