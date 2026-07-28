// app/page.tsx — le tracker.
//
// Server Component : les données ne transitent jamais par une API publique, elles sont
// lues côté serveur et rendues. La session est REVÉRIFIÉE ici même si le middleware garde
// déjà la route — défense en profondeur, comme le fait le hub : si un jour le matcher du
// middleware change, cette page ne se retrouve pas ouverte en silence.

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { lireOffres } from "@/lib/donnees";
import { resumer } from "@/lib/suivi";
import { prochainesActions } from "@/lib/aFaire";
import { aujourdhui } from "@/lib/ajout";
import type { Offre } from "@/lib/types";
import { TableauBord } from "@/components/TableauBord";
import { ListeOffres } from "@/components/ListeOffres";
import { FormulaireAjout } from "@/components/FormulaireAjout";
import { AFaire } from "@/components/AFaire";
import { Cadre } from "@/components/Cadre";

// Le suivi change à chaque geste de Marc : jamais de page mise en cache.
export const dynamic = "force-dynamic";

export default async function Accueil() {
  const session = await auth();
  if (!session) redirect("/connexion");

  // La lecture peut échouer pour une raison qui a un REMÈDE (schéma pas appliqué,
  // identifiants faux). Sans ce filet, Next rend son écran d'erreur générique avec un
  // simple digest : l'app a l'air cassée alors qu'il manque une commande à lancer.
  // Même patron que la route du hub — l'erreur est journalisée ET expliquée à l'écran.
  let offres: Offre[] | null = null;
  let panne: "schema-absent" | "base-injoignable" | null = null;

  try {
    offres = await lireOffres();
  } catch (err) {
    console.error("[page] lecture des offres impossible", err);
    // Postgres 42P01 = « undefined_table ». C'est le cas le plus probable au premier
    // déploiement : la base répond, mais `npm run db:migrate` n'a pas encore tourné.
    const code = (err as { cause?: { code?: string }; code?: string })?.cause?.code
      ?? (err as { code?: string })?.code;
    panne = code === "42P01" ? "schema-absent" : "base-injoignable";
  }

  return (
    <Cadre actif="/" titre="Suivi des offres">
      {panne === "schema-absent" ? (
        <div className="etat">
          <h2>Tables absentes de la base</h2>
          <p>
            La base répond, mais son schéma n’a pas encore été appliqué — la table
            <code> offer_reasons </code> n’existe pas.
          </p>
          <p className="etat__aide">
            Depuis le dépôt, sur ton poste : <code>npm run db:migrate</code> pour créer les
            tables, puis <code>npm run db:seed</code> pour charger le suivi. Les deux ont
            besoin de <code>DATABASE_URL</code> — voir <code>docs/DEPLOIEMENT.md</code>,
            étape 4.
          </p>
        </div>
      ) : panne === "base-injoignable" ? (
        <div className="etat">
          <h2>Base de données injoignable</h2>
          <p>
            La connexion a échoué. Le détail est dans les journaux du serveur — l’app ne
            l’affiche pas ici, car un message d’erreur de base peut contenir des
            identifiants.
          </p>
          <p className="etat__aide">
            À vérifier en premier : la valeur de <code>DATABASE_URL</code> dans les variables
            d’environnement, et que le mot de passe n’a pas été régénéré depuis.
          </p>
        </div>
      ) : offres === null ? (
        // Base non configurée. On le DIT, au lieu d'afficher une liste vide qui enverrait
        // chercher un bug dans les données au lieu de la configuration.
        <div className="etat">
          <h2>Base de données non configurée</h2>
          <p>
            La variable <code>DATABASE_URL</code> n’est pas définie : aucune offre ne peut
            être lue. Ce n’est pas une liste vide, c’est une connexion absente.
          </p>
          <p className="etat__aide">
            Une fois l’instance Neon créée : appliquer la migration avec{" "}
            <code>npm run db:migrate</code>, puis charger le suivi avec{" "}
            <code>npx tsx scripts/charger-seed.ts</code>.
          </p>
        </div>
      ) : offres.length === 0 ? (
        // La base répond : le formulaire d'ajout a donc sa place ici aussi. C'est même le
        // moment où il sert le plus — sans lui, un suivi vide n'offrirait aucune issue
        // depuis l'interface.
        <>
          <div className="etat">
            <h2>Aucune offre enregistrée</h2>
            <p>
              La base répond, mais elle est vide. Charger le jeu de départ avec{" "}
              <code>npx tsx scripts/charger-seed.ts</code> — ou ajouter une première offre
              à la main ci-dessous.
            </p>
          </div>
          <FormulaireAjout />
        </>
      ) : (
        <>
          {/* « Quoi faire » avant « où on en est » : c'est la question qu'on se pose en
              ouvrant l'app. La date vient du serveur, dans le fuseau de Marc. */}
          <AFaire actions={prochainesActions(offres, aujourdhui(new Date()))} />
          <TableauBord resume={resumer(offres)} />
          <FormulaireAjout />
          <ListeOffres offres={offres} />
        </>
      )}
    </Cadre>
  );
}
