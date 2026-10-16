"use client";

// app/global-error.tsx — dernier filet : une erreur de rendu que rien d'autre n'attrape.
// Elle est envoyée à Sentry (éteint sans DSN, expurgée : voir lib/sentryConfig.ts), puis l'écran
// dit honnêtement qu'il y a eu un problème. Aucun détail technique n'est affiché.

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function ErreurGlobale({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr-CA">
      <body>
        <main role="alert">
          <h1>Un problème est survenu</h1>
          <p>L’erreur a été signalée. Recharge la page pour réessayer.</p>
        </main>
      </body>
    </html>
  );
}
