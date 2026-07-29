// app/offre/[id]/page.tsx — la vue détaillée d'une offre.
//
// La carte de la liste montre l'essentiel ; ici on montre TOUT, sans troncature : la
// justification complète, les notes de recherche, la note personnelle, les dates. C'est la
// page qu'on ouvre avant de décider de postuler.
//
// Session revérifiée comme sur l'accueil : le middleware garde déjà la route, mais si son
// matcher change un jour, cette page ne doit pas se retrouver ouverte en silence.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { lireOffre } from "@/lib/donnees";
import { palier } from "@/lib/scoring";
import { ControlesOffre } from "@/components/ControlesOffre";
import { lienTrajetGoogleMaps } from "@/lib/lienTrajet";
import { Cadre } from "@/components/Cadre";

export const dynamic = "force-dynamic";

/** Un lien n'est rendu cliquable qu'en http(s) — même règle que le hub et la carte. */
function lienSur(brut: string): string | null {
  if (!brut) return null;
  try {
    const u = new URL(brut);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offre = await lireOffre(id);
  // Le titre d'onglet ne doit pas fuir le contenu si la page est inaccessible.
  return { title: offre ? `${offre.entreprise} — JobAI` : "Offre — JobAI" };
}

export default async function DetailOffre({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/connexion");

  const { id } = await params;

  let offre;
  try {
    offre = await lireOffre(id);
  } catch (err) {
    // Même principe que l'accueil : une panne se dit, elle ne devient pas un 404 trompeur
    // qui enverrait chercher une offre supprimée alors que la base ne répond pas.
    console.error("[offre] lecture impossible", { id, err });
    return (
      <Cadre actif={null}>
        <Link href="/" className="retour">
          ← Toutes les offres
        </Link>
        <div className="etat">
          <h2>Offre illisible</h2>
          <p>
            La base n’a pas répondu. Le détail est dans les journaux du serveur — il n’est
            pas affiché ici, un message d’erreur de base pouvant contenir des identifiants.
          </p>
        </div>
      </Cadre>
    );
  }

  if (!offre) notFound();

  const p = palier(offre.score);
  const href = lienSur(offre.lien);
  const trajet = lienTrajetGoogleMaps(offre.entreprise);
  const atouts = offre.raisons.filter((r) => r.ton === "atout");
  const reserves = offre.raisons.filter((r) => r.ton === "reserve");

  return (
    <Cadre actif={null}>
      <Link href="/" className="retour">
        ← Toutes les offres
      </Link>

      <article className={`detail detail--${p}`}>
        <header className="detail__tete">
          <div className={`note note--${p}`}>
            {offre.score ?? "–"}
            <small>{offre.score === null ? "histo" : "/100"}</small>
          </div>
          <div>
            <h1>{offre.entreprise}</h1>
            <p className="detail__poste">{offre.poste}</p>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="detail__lien">
                Ouvrir l’offre ↗
              </a>
            ) : (
              <p className="detail__sans-lien">Aucun lien enregistré pour cette offre.</p>
            )}
            {/* Le trajet s'ouvre DANS Google Maps : Marc y est connecté à son compte, donc
                il y voit sa maison, ses endroits enregistrés et la durée réelle avec trafic.
                Le lien ne porte que la DESTINATION — jamais l'origine (garde-fou n°1). */}
            {trajet ? (
              <a
                href={trajet}
                target="_blank"
                rel="noopener noreferrer"
                className="detail__lien detail__lien--trajet"
              >
                Trajet dans Google Maps ↗
              </a>
            ) : null}
          </div>
        </header>

        <dl className="detail__faits">
          <div>
            <dt>Distance</dt>
            <dd>
              {offre.km === null ? "inconnue" : `${offre.km.toString().replace(".", ",")} km`}
            </dd>
          </div>
          <div>
            <dt>Salaire affiché</dt>
            <dd>{offre.salaireAffiche ?? "non affiché"}</dd>
          </div>
          <div>
            <dt>Repérée le</dt>
            <dd>{offre.dateReperage}</dd>
          </div>
          <div>
            <dt>CV envoyé le</dt>
            <dd>{offre.dateEnvoi || "—"}</dd>
          </div>
          <div>
            <dt>Note</dt>
            {/* D'où vient la note : une note calculée n'a pas la même valeur qu'une note
                issue de la lecture réelle de l'offre. */}
            <dd>
              {offre.scoreSource === "manuel"
                ? "vérifiée à la main"
                : offre.scoreSource === "calcule"
                  ? "calculée (plafonnée)"
                  : "non évaluée"}
            </dd>
          </div>
          <div>
            <dt>Provenance</dt>
            <dd>
              {offre.source === "seed"
                ? "recherche manuelle"
                : offre.source === "jobbank"
                  ? "Guichet-Emplois"
                  : "ajout manuel"}
            </dd>
          </div>
        </dl>

        {atouts.length > 0 ? (
          <section className="detail__bloc">
            <h2>Ce qui joue en faveur</h2>
            <ul className="carte__raisons">
              {atouts.map((r, i) => (
                <li key={i} className="raison raison--atout">
                  {r.texte}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {reserves.length > 0 ? (
          <section className="detail__bloc">
            <h2>Ce qui coûte des points</h2>
            <ul className="carte__raisons">
              {reserves.map((r, i) => (
                <li key={i} className="raison raison--reserve">
                  {r.texte}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {offre.notes ? (
          <section className="detail__bloc">
            <h2>Notes de recherche</h2>
            <p className="detail__texte">{offre.notes}</p>
          </section>
        ) : null}

        <section className="detail__bloc">
          <h2>Suivi</h2>
          <ControlesOffre offre={offre} />
        </section>
      </article>
    </Cadre>
  );
}
