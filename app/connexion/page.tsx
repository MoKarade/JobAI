// app/connexion/page.tsx — l'écran de connexion, seule page publique qui affiche quelque
// chose. Elle ne révèle RIEN du suivi : ni compteur, ni nom d'entreprise, ni statut.
// Un écran de connexion qui laisse fuir un chiffre annule l'intérêt de la porte.

import { signIn } from "@/auth";

export const metadata = { title: "Connexion — JobAI" };

export default async function Connexion({
  searchParams,
}: {
  searchParams: Promise<{ retour?: string; error?: string }>;
}) {
  const { retour, error } = await searchParams;

  return (
    <main className="shell">
      <div className="card">
        <p className="eyebrow">emploi.hubperso.com</p>
        <h1>JobAI</h1>
        <p className="lead">
          Suivi de recherche d’emploi. L’accès est réservé à un seul compte.
        </p>

        {error ? (
          <p className="hint" role="alert">
            Connexion refusée. Ce compte n’est pas autorisé à accéder à cette application.
          </p>
        ) : null}

        <form
          action={async () => {
            "use server";
            // On ne fait confiance qu'à un chemin interne : une URL de retour fournie par
            // l'extérieur pourrait renvoyer ailleurs après connexion (redirection ouverte).
            const cible = retour && retour.startsWith("/") && !retour.startsWith("//")
              ? retour
              : "/";
            await signIn("google", { redirectTo: cible });
          }}
        >
          <button type="submit" className="bouton">
            Se connecter avec Google
          </button>
        </form>
      </div>
    </main>
  );
}
