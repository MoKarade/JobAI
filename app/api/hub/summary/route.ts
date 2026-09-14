// app/api/hub/summary/route.ts
//
// Endpoint consommé par le hub perso (hubperso.com), contrat @mokarade/hub-contract v1.
// Le hub appelle GET /api/hub/summary avec le header x-hub-token ; 401 sinon (échec fermé),
// réponse toujours en Cache-Control: no-store (un summary est un instantané).
//
// CONTRAT D'ÉCHEC (ADR-0001, figé une fois pour toutes) :
//   HUB_TOKEN absent côté serveur  → 503 « intégration hub non configurée »
//     (l'app fonctionne ; c'est l'intégration qui n'est pas branchée, pas une panne serveur)
//   x-hub-token absent ou invalide → 401
//   méthode ≠ GET                  → 405 (aucun autre verbe n'est exporté)
//   panne en lisant l'état         → 200 + status "error", jamais un 500 muet : le hub sait
//     alors afficher un widget honnête plutôt qu'un « injoignable » qui accuse le réseau.
//
// ⚠️ Cette route DOIT rester HORS du middleware d'authentification utilisateur : elle porte
// sa propre auth par jeton. L'ajouter au matcher renverrait au hub une redirection HTML vers
// la page de connexion au lieu du JSON attendu — le widget afficherait « injoignable » en
// permanence. C'était le défaut n°1 du squelette du 27/07.
//
// ── LE 503/401/405 EST DÉLÉGUÉ, LE 200-SUR-PANNE NE L'EST PAS ────────────────────────
//
// La mécanique commune (trio 503/401/405, jeton comparé en temps constant, `no-store`,
// validation avant émission) vient de `serveSummary` (`@mokarade/hub-contract/endpoint`),
// écrite une fois pour toutes les apps.
//
// MAIS `serveSummary` répond **500 si son `build` JETTE**, et ce n'est PAS le contrat de
// JobAI : l'ADR-0001 fige « panne en lisant l'état → 200 + status "error" ». C'est pourquoi
// `construireResume` ci-dessous **n'a pas le droit de jeter** — son `catch` est ce qui
// préserve le contrat. Le supprimer en croyant que le helper s'en charge transformerait un
// widget honnête (« état illisible ») en « injoignable » qui accuse le réseau.

import { buildingSummary, type HubSummary } from "@mokarade/hub-contract";
import { HUB_TOKEN_HEADER, serveSummary } from "@mokarade/hub-contract/endpoint";
import { APP, alertesCout, blocUsage, construireSummary } from "@/lib/hubSummary";
import { getTrackerState } from "@/lib/trackerState";
import { lireCoutPublie } from "@/lib/coutLlmStore";
import { alertesVeille, chargerVeillePubliee } from "@/lib/fraicheurVeille";

// Jamais de cache statique : le hub veut l'état courant à chaque appel.
export const dynamic = "force-dynamic";

/**
 * ⚠️ NE JETTE JAMAIS — voir l'en-tête. Toute panne est convertie en summary `status: "error"`.
 */
async function construireResume(): Promise<HubSummary> {
  let summary: HubSummary;
  try {
    // TROIS lectures indépendantes : l'état du suivi, la comptabilité des appels de modèle,
    // et la date de la dernière passe. Aucune ne remplace les autres — un CV analysé avant la
    // première offre suivie laisse le suivi « pas branché » alors que le coût, lui, est bien
    // réel ; et une veille qui n'a jamais abouti laisse le suivi lisible mais sans âge.
    //
    // ⚠️ `chargerVeillePubliee` NE JETTE JAMAIS (voir son en-tête) : ne pas savoir depuis
    // quand les chiffres sont vrais n'est pas une raison de refuser de les publier. Une
    // exception ici retomberait dans le `catch` ci-dessous et transformerait un suivi sain en
    // `status: "error"`.
    const [etat, cout, veille] = await Promise.all([
      getTrackerState(),
      lireCoutPublie(),
      chargerVeillePubliee(),
    ]);
    if (etat) {
      summary = construireSummary(etat, new Date().toISOString(), cout, veille);
    } else {
      // null = moteur pas encore branché. Honnête, et distinct d'une panne.
      const enConstruction = buildingSummary(APP, {
        alertLabel: "Suivi pas encore en ligne — aucune donnée à publier.",
      });
      // ⚠️ LE COÛT SURVIT AU « EN CONSTRUCTION », ET C'EST LE CAS QUI L'A FAIT ÉCRIRE.
      // Le suivi peut être vide alors qu'un CV a déjà été analysé : l'argent est dépensé
      // pour de vrai. Laisser tomber le bloc ici publierait « non suivie » sur une app qui
      // vient de payer un appel — le trou qu'on est en train de boucher, rouvert d'un cran
      // plus loin.
      // ⚠️ AUCUN `dataAsOf` SUR LA BRANCHE « EN CONSTRUCTION », et le contrat le vérifie :
      // il rejette `expectedMaxAgeSec` sans horodatage à comparer. C'est cohérent avec le
      // sens de cette branche — il n'y a pas de suivi, donc rien dont on puisse dater la
      // fraîcheur. En revanche l'alerte de veille, elle, survit : une passe illisible reste
      // une chose à regarder même quand le suivi n'est pas branché, exactement comme le coût.
      summary = {
        ...enConstruction,
        alerts: [...enConstruction.alerts, ...alertesCout(cout), ...alertesVeille(veille)]
          .slice(0, 10),
        ...blocUsage(cout),
      };
    }
  } catch (err) {
    // Une panne réelle se DIT. On répond 200 avec un statut d'erreur : le hub affiche
    // alors un widget explicite, là où un 500 se confondrait avec une app injoignable.
    console.error("[hub/summary] lecture de l'état impossible", err);
    summary = {
      ...buildingSummary(APP),
      status: "error",
      alerts: [{ label: "État du suivi illisible — voir les journaux.", severity: "alert" }],
    };
  }

  return summary;
}

export async function GET(request: Request): Promise<Response> {
  const { status, headers, body } = await serveSummary(
    { method: "GET", token: request.headers.get(HUB_TOKEN_HEADER) },
    { expectedToken: process.env.HUB_TOKEN, build: construireResume },
  );
  return new Response(body, { status, headers });
}
