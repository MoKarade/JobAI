import { defineConfig } from "drizzle-kit";

// Les migrations sont générées ici (`npm run db:generate`) et committées, puis appliquées
// À LA MAIN (`npm run db:migrate`) — jamais pendant un build. Une migration qui part toute
// seule au déploiement, c'est une modification de données qu'on ne relit pas avant qu'elle
// s'exécute.
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
