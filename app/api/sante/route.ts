// app/api/sante/route.ts — santé publique, pour la vigie de l'Atelier.
//
// ⚠️ Route HORS du garde de session, SANS authentification du tout — délibérément. Elle ne
// rend jamais de donnée d'offre ni un message d'erreur brut, seulement {"ok": true|false} et le
// commit servi (voir plus bas).
// Le piège que ça évite : derrière la garde, la vigie recevrait un 401 JSON au lieu d'un
// vrai diagnostic de la base — exactement le défaut que `/api/hub/summary` évite déjà pour
// un autre appelant (voir `middleware.ts`).
//
// ── POURQUOI CETTE ROUTE EXISTE ──────────────────────────────────────────────────────
// Modèle CarAI (commit eaab5b4) : un incident où Neon dépassait son quota et la base
// refusait tout, sans qu'aucune sonde ne le voie — la page d'accueil répondait quand même
// (redirection vers /connexion), donc regarder seulement le code HTTP de l'accueil ne
// montre AUCUNE panne. Priorité 1 du recentrage de Marc : surveiller la production.
//
// ── RESPECTE LA MÉMOÏSATION DES MIGRATIONS ───────────────────────────────────────────
// `assurerMigrations()` (lib/migrations.ts) ne tente qu'une fois par processus : un appel
// horaire de la vigie ne martèle jamais une base déjà en panne. Elle n'échoue JAMAIS vers
// l'appelant — cette route n'a donc besoin d'aucun `try/catch` autour de cet appel-là.

import { sql } from "drizzle-orm";
import { baseConfiguree, db } from "@/lib/db";
import { assurerMigrations } from "@/lib/migrations";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Les 7 premiers caractères du commit que Vercel sert, ou rien. Après un retour en arrière
 * automatique, l'alias de production peut rester figé sur un ancien déploiement sans que rien
 * ne le montre (emploi.hubperso.com sur dpl_HYF1mkLv, 26/10/2026, .github#822) : le commit
 * rendu ici, comparé à celui de `main`, le dit. Public et sans secret ; une valeur qui n'est
 * pas hexadécimale n'est pas un commit, donc le champ est omis plutôt qu'inventé.
 */
function commitServi(): { commit?: string } {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() ?? "";
  return /^[0-9a-f]{7,40}$/i.test(sha) ? { commit: sha.slice(0, 7).toLowerCase() } : {};
}

export async function GET(): Promise<Response> {
  if (!baseConfiguree()) {
    return Response.json({ ok: false, cause: "base", ...commitServi() }, { status: 503, headers: NO_STORE });
  }

  await assurerMigrations();

  try {
    await db.execute(sql`SELECT 1`);
    return Response.json({ ok: true, ...commitServi() }, { headers: NO_STORE });
  } catch (err) {
    // Le motif détaillé est journalisé, JAMAIS renvoyé : la vigie n'a besoin que de
    // « ok/pas ok », et un message d'erreur brut pourrait porter des détails de connexion.
    console.error("[sante] base injoignable", err);
    return Response.json({ ok: false, cause: "base", ...commitServi() }, { status: 503, headers: NO_STORE });
  }
}
