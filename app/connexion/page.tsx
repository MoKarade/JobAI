// app/connexion/page.tsx — l'écran de connexion, seule page publique qui affiche quelque
// chose. Elle ne révèle RIEN du suivi : ni compteur, ni nom d'entreprise, ni statut.
// Un écran de connexion qui laisse fuir un chiffre annule l'intérêt de la porte.

import { signIn } from "@/auth";

export const metadata = { title: "Connexion — JobAI" };

/**
 * Les codes d'erreur d'Auth.js, traduits en quelque chose d'actionnable.
 *
 * Un « connexion refusée » générique ne dit pas s'il faut changer de compte ou corriger une
 * variable d'environnement. Ces deux situations n'ont rien à voir, et se distinguer coûte
 * une ligne. Aucun de ces messages ne révèle l'adresse autorisée : dire « ce n'est pas la
 * bonne adresse » suffit, la nommer aiderait quelqu'un qui n'a rien à faire ici.
 */
const MESSAGES: Record<string, string> = {
  // Le callback `signIn` a refusé : l'adresse Google ne correspond pas à celle admise.
  AccessDenied:
    "Ce compte Google n’est pas celui autorisé pour cette application. Vérifie que tu utilises la bonne adresse — et, côté serveur, que la variable AUTHORIZED_EMAIL est bien définie et correspond exactement.",
  // Variables manquantes ou mal formées côté serveur.
  Configuration:
    "L’authentification est mal configurée côté serveur : il manque GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET ou AUTH_SECRET, ou l’URI de redirection n’est pas déclarée dans la console Google.",
  OAuthCallback:
    "Google a refusé l’échange. L’URI de redirection déclarée dans la console Google ne correspond probablement pas exactement à celle utilisée (protocole et domaine compris).",
  Verification: "Le lien de connexion a expiré. Réessaie.",
  Default: "La connexion n’a pas abouti. Réessaie ; si ça persiste, vérifie la configuration Google.",
};

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
            {MESSAGES[error] ?? MESSAGES.Default}
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
