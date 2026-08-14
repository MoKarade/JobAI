// app/connexion/page.tsx — la porte, devenue un couloir.
//
// JobAI ne se connecte plus à Google elle-même (ADR 0001 de Hubperso) : le hub est la
// porte d'entrée unique. Cette page ne propose donc plus de bouton, elle REDIRIGE vers
// `hubperso.com/login` en emportant de quoi revenir ici.
//
// Elle reste la seule page publique, et elle ne révèle toujours RIEN du suivi : ni
// compteur, ni nom d'entreprise, ni statut. Un écran de connexion qui laisse fuir un
// chiffre annule l'intérêt de la porte.

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { URL_HUB, urlConnexionHub } from "@/lib/connexionHub";
import { diagnostiquerConfiguration } from "@/lib/diagnostic";

export const metadata = { title: "Connexion — JobAI" };

/**
 * L'origine de cette app, vue de la requête.
 *
 * Pas une constante : JobAI répond sur son domaine ET sur les préversions Vercel. Coder
 * `emploi.hubperso.com` en dur ferait revenir toutes les préversions en production après
 * connexion — le genre de bogue qu'on met une soirée à croire.
 */
async function origineDeLaRequete(): Promise<string> {
  const h = await headers();
  const hote = h.get("x-forwarded-host") ?? h.get("host") ?? "emploi.hubperso.com";
  const protocole = h.get("x-forwarded-proto") ?? "https";
  return `${protocole}://${hote}`;
}

export default async function Connexion({
  searchParams,
}: {
  searchParams: Promise<{ retour?: string; error?: string }>;
}) {
  const { retour, error } = await searchParams;

  // Chemin normal : on ne s'attarde pas, on envoie au hub.
  if (!error) {
    redirect(urlConnexionHub(await origineDeLaRequete(), retour));
  }

  // Chemin d'échec : on s'arrête pour DIRE quelque chose. Rediriger ici produirait une
  // boucle silencieuse entre les deux apps, et personne ne saurait pourquoi.
  return (
    <main className="shell">
      <div className="card">
        <p className="eyebrow">emploi.hubperso.com</p>
        <h1>JobAI</h1>
        <p className="lead">
          La connexion se fait sur le hub, pas ici. Quelque chose l’a empêchée.
        </p>

        <p className="hint" role="alert">
          {/* Les erreurs d'OAuth n'arrivent plus jusqu'ici — JobAI ne parle plus à Google.
              Ce qui reste possible : une session refusée parce que l'adresse n'est pas
              celle admise, ou une variable manquante côté serveur. */}
          Session refusée. Soit ce compte Google n’est pas celui autorisé pour cette
          application, soit une variable manque côté serveur — la liste ci-dessous le dit.
        </p>

        {/* Des BOOLÉENS, jamais des valeurs. Voir lib/diagnostic.ts. */}
        <details className="diagnostic">
          <summary>Variables configurées côté serveur</summary>
          <ul>
            {diagnostiquerConfiguration().map((v) => (
              <li key={v.nom} className={v.presente ? "ok" : "absente"}>
                <code>{v.nom}</code> {v.presente ? "présente" : "ABSENTE"}
                <span className="diagnostic__role"> — {v.role}</span>
              </li>
            ))}
          </ul>
          <p className="diagnostic__note">
            Aucune valeur n’est affichée, seulement leur présence. Une variable ajoutée dans
            Vercel n’est prise en compte qu’au redéploiement suivant.
          </p>
        </details>

        <p className="hint">
          <a className="bouton" href={URL_HUB}>
            Aller au hub
          </a>
        </p>
      </div>
    </main>
  );
}
