// scripts/sentry-essai.mjs — envoie UNE erreur volontaire à Sentry et dit si elle est partie (JobAI#117).
//
// Lancé par `npm run sentry:essai` ou par le workflow manuel « Essai Sentry ». Le DSN vient de
// `SENTRY_DSN` si elle est définie, sinon des scripts client de la production (`URL_PAGE`, par
// défaut la page de connexion) : un DSN n'est pas un secret, c'est exactement ce que lit le
// navigateur. Pas de SDK : l'enveloppe est bâtie par `lib/sentryEssai.ts` et nettoyée par `retirerDonneesPersonnelles`, comme celle de l'app.
//
// Échec fermé : sans DSN, ou si Sentry ne répond pas 2xx, le script sort en erreur. Il n'affiche
// jamais la clé du DSN.

import { randomUUID } from "node:crypto";
// Node 24 lit les .ts directement (retrait des types) ; ces fichiers n'importent que des .ts.
import { retirerDonneesPersonnelles } from "../lib/sentryConfig.ts";
import { construireEnveloppe, lireDsn, trouverDsn, urlEnveloppe, urlSansCle } from "../lib/sentryEssai.ts";

const PAGE = process.env.URL_PAGE ?? "https://emploi.hubperso.com/connexion";

async function dsnDeLaProduction() {
  const reponse = await fetch(PAGE, { signal: AbortSignal.timeout(20_000) });
  const html = await reponse.text();
  const scripts = [...html.matchAll(/(?:src|href)="([^"]*\/_next\/static\/[^"]*\.js)"/g)].map((m) => m[1]);
  const textes = [];
  for (const chemin of new Set(scripts)) {
    const r = await fetch(new URL(chemin, PAGE), { signal: AbortSignal.timeout(20_000) });
    textes.push(await r.text());
  }
  console.log(`Scripts client lus : ${textes.length} (${PAGE})`);
  return trouverDsn(textes);
}

const dsn = process.env.SENTRY_DSN ? lireDsn(process.env.SENTRY_DSN) : await dsnDeLaProduction();
if (!dsn) {
  console.error("Aucun DSN Sentry (variable absente ou mal formée, ou rien dans les scripts client) : rien envoyé.");
  process.exit(1);
}

const identifiant = randomUUID().replaceAll("-", "");
const reponse = await fetch(urlEnveloppe(dsn), {
  method: "POST",
  headers: { "content-type": "application/x-sentry-envelope" },
  body: construireEnveloppe(identifiant, new Date(), retirerDonneesPersonnelles),
  signal: AbortSignal.timeout(20_000),
});

console.log(`Projet Sentry : ${dsn.projet} (${urlSansCle(dsn)})`);
console.log(`Identifiant d'événement : ${identifiant}`);
console.log(`Réponse HTTP de Sentry : ${reponse.status}`);
const livre = reponse.status >= 200 && reponse.status < 300;
console.log(`Livraison accusée par Sentry : ${livre ? "oui" : "non"}`);
process.exit(livre ? 0 : 1);
