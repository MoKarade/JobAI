"use client";

// app/error.tsx — la page d'erreur générale, en français.
//
// ⚠️ Le message de l'erreur n'est JAMAIS affiché : une erreur de base peut contenir des
// identifiants. Le détail reste dans les journaux du serveur ; ici, une phrase simple.

export default function Erreur({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="etat" role="alert">
      <h1>Une erreur est survenue</h1>
      <p>Quelque chose n’a pas fonctionné. Vous pouvez réessayer dans un instant.</p>
      <button type="button" onClick={() => reset()}>
        Réessayer
      </button>
    </main>
  );
}
