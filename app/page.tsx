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
import { TableauBord } from "@/components/TableauBord";
import { ListeOffres } from "@/components/ListeOffres";
import { Panneaux } from "@/components/Panneaux";

// Le suivi change à chaque geste de Marc : jamais de page mise en cache.
export const dynamic = "force-dynamic";

export default async function Accueil() {
  const session = await auth();
  if (!session) redirect("/connexion");

  const offres = await lireOffres();

  return (
    <main className="page">
      <header className="entete">
        <h1>
          JOB<span className="entete__accent">_</span>AI
        </h1>
        <p className="entete__sous">
          Coordination technique et automatisation · rayon 50 km
        </p>
      </header>

      {offres === null ? (
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
        <div className="etat">
          <h2>Aucune offre enregistrée</h2>
          <p>
            La base répond, mais elle est vide. Charger le jeu de départ avec{" "}
            <code>npx tsx scripts/charger-seed.ts</code>.
          </p>
        </div>
      ) : (
        <>
          <TableauBord resume={resumer(offres)} />
          <ListeOffres offres={offres} />
          <Panneaux />
        </>
      )}
    </main>
  );
}
