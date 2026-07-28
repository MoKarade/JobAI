import { defineConfig } from "drizzle-kit";
import { AIDE_URL_MANQUANTE, chargerEnvLocal, urlBaseDeDonnees } from "./lib/chargerEnv";

// `drizzle-kit` tourne HORS de Next.js : il ne lit donc pas `.env.local` tout seul. Sans
// cette ligne, `npm run db:migrate` échoue sur « url: '' » alors que la chaîne de connexion
// est dans le fichier juste à côté — et le seul contournement est de recoller un secret
// dans le terminal à chaque nouvelle fenêtre. Vécu le 2026-07-28.
chargerEnvLocal();

const url = urlBaseDeDonnees();

// Un AVERTISSEMENT, pas une exception : `db:generate` n'a pas besoin de la base (il compare
// le schéma TypeScript aux migrations committées) et doit continuer à fonctionner sans
// connexion. Lever ici casserait la génération de migrations sur une machine sans `.env`.
if (url === null) {
  console.warn(`\n${AIDE_URL_MANQUANTE}\n`);
}

// Les migrations sont générées ici (`npm run db:generate`) et committées, puis appliquées
// À LA MAIN (`npm run db:migrate`) — jamais pendant un build. Une migration qui part toute
// seule au déploiement, c'est une modification de données qu'on ne relit pas avant qu'elle
// s'exécute.
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: url ?? "" },
});
