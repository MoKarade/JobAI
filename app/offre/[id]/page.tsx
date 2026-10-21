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
import { lireOffre, lireOffresDuMemeDebutDeNom, rangParNote } from "@/lib/donnees";
import { palier } from "@/lib/scoring";
import { ControlesOffre } from "@/components/ControlesOffre";
import { BrouillonCandidature } from "@/components/BrouillonCandidature";
import { ComparaisonOffre } from "@/components/ComparaisonOffre";
import { eligibiliteComparaison } from "@/lib/comparaisonOffre";
import { profilActif } from "@/lib/cv/depot";
import { lienTrajetGoogleMaps } from "@/lib/lienTrajet";
import { lienDeOffre } from "@/lib/lienOffre";
import { kmVirgule } from "@/lib/kmVirgule";
import { fraicheurOffre } from "@/lib/fraicheur";
import { raisonsAffichables } from "@/lib/raisons";
import { aujourdhui } from "@/lib/ajout";
import { lireEtat } from "@/lib/etat";
import { CLE_JOURNAL } from "@/lib/veilleComplete";
import type { JournalVeille } from "@/lib/veille";
import { Cadre } from "@/components/Cadre";
import { dateLisible } from "@/lib/dateLisible";
import { titreOffre } from "@/lib/titreOffre";
import { DossierEmployeur } from "@/components/DossierEmployeur";
import { dossierEmployeur } from "@/lib/dossierEmployeur";
import { cleEnseigne } from "@/lib/enseigne";
import { signauxParEmployeur } from "@/lib/signauxEmployeur";

export const dynamic = "force-dynamic";

// La Server Action de comparaison (JobAI#157) tourne avec la durée de CETTE page : un appel au modèle de 40 s au plus.
export const maxDuration = 60;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const offre = await lireOffre(id);
  // Le titre d'onglet ne doit pas fuir le contenu si la page est inaccessible.
  return { title: titreOffre(offre) };
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
  // La comparaison à la fiche est réservée aux 100 meilleures offres, avec une fiche et un texte d'annonce. Le refus
  // se DIT à l'écran (jamais un bouton qui échoue) ; l'action serveur recalcule la même règle. Une panne de lecture
  // du rang ou du profil se dit aussi : elle ne doit pas emporter la fiche de l'offre.
  const refusComparaison = await (async (): Promise<string | null> => {
    try {
      const [rang, profil] = await Promise.all([rangParNote(offre), profilActif()]);
      const e = eligibiliteComparaison({
        fiche: profil.faits.competences,
        texteNote: offre.texteNote,
        score: offre.score,
        histo: offre.histo,
        perimeeLe: offre.perimeeLe,
        rang,
      });
      return e.ok ? null : e.raison;
    } catch (err) {
      console.error("[offre] éligibilité de la comparaison illisible", { id: offre.id, err });
      return "La comparaison n’a pas pu être préparée (la base ou le profil n’a pas répondu). Voir les journaux.";
    }
  })();
  // Genre et adresse du MÊME appel — voir `lib/lienOffre.ts` : deux règles séparées
  // finiraient par se contredire à l'écran.
  const lien = lienDeOffre(offre.lien, offre.entreprise, offre.poste);
  const trajet = lienTrajetGoogleMaps(offre.entreprise);
  // Le journal de veille dit si un balayage a déjà CONFIRMÉ cette offre. Son absence n'est
  // pas un vide : c'est l'aveu que personne ne l'a revue depuis son repérage. Lu après
  // l'offre — une panne de lecture d'état ne doit pas emporter la fiche, d'où le repli.
  const journal = await lireEtat<JournalVeille>(CLE_JOURNAL, {}).catch(() => ({}) as JournalVeille);
  const fraicheur = fraicheurOffre(offre, journal[offre.id], aujourdhui(new Date()));
  // Le dossier de l'employeur (JobAI#161) : calculé sur toutes les offres de son enseigne, jamais sur cette seule offre. Une
  // panne de lecture des offres se dit dans les journaux et le bloc disparaît : « inconnu » serait une affirmation, et l'absence n'en est pas une.
  const dossier = await (async () => {
    try {
      const toutes = await lireOffresDuMemeDebutDeNom(offre.entreprise);
      if (toutes === null) return null;
      const cle = cleEnseigne(offre.entreprise, offre.id);
      const siennes = toutes.filter((o) => cleEnseigne(o.entreprise, o.id) === cle);
      // La requête borne par le premier mot : l'offre affichée y est toujours, même quand son nom est trop court pour borner.
      if (!siennes.some((o) => o.id === offre.id)) siennes.push(offre);
      return dossierEmployeur(signauxParEmployeur(siennes, journal)[cle]);
    } catch (err) {
      console.error("[offre] dossier de l'employeur illisible", { id: offre.id, err });
      return null;
    }
  })();
  // ⚠️ `raisonsAffichables`, PAS `offre.raisons` (`[LIEN-04]`). C'est SUR CETTE FICHE que le
  // défaut a été vu : `km: 81.2` et « Annoncée à Thetford Mines — la distance reste à
  // mesurer » côte à côte. La règle vit dans `lib/raisons.ts`, avec l'écriture et la
  // relecture de la même phrase.
  const vues = raisonsAffichables(offre.raisons, offre.km);
  const atouts = vues.filter((r) => r.ton === "atout");
  const reserves = vues.filter((r) => r.ton === "reserve");

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
            {/* Le libellé dit la DESTINATION : « l'offre » quand le lien mène à l'annonce,
                « le site » quand il mène à une page d'accueil ou à une liste d'emplois,
                « lien Indeed » pour un jeton de redirection qui peut ne plus rien ouvrir.
                Mesuré le 2026-09-14 : 18 des 32 offres ouvertes les mieux notées sont dans
                l'un de ces deux derniers cas. */}
            {lien.href ? (
              <a
                href={lien.href}
                target="_blank"
                rel="noopener noreferrer"
                className="detail__lien"
              >
                Ouvrir {lien.libelle} ↗
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
            {/* Le second chemin, toujours là quand le premier ne mène pas à l'annonce :
                Marc a demandé « juste cliquer pour avoir l'offre ». */}
            {lien.recherche ? (
              <a
                href={lien.recherche}
                target="_blank"
                rel="noopener noreferrer"
                className="detail__lien detail__lien--recherche"
              >
                Chercher l’annonce sur le web ↗
              </a>
            ) : null}
            {fraicheur ? <p className="detail__doute">{fraicheur.libelle}</p> : null}
          </div>
        </header>

        <dl className="detail__faits">
          <div>
            <dt>Distance</dt>
            <dd>
              {offre.km === null ? "inconnue" : kmVirgule(offre.km, offre.kmSource === "postale")}
            </dd>
          </div>
          <div>
            <dt>Salaire affiché</dt>
            <dd>{offre.salaireAffiche ?? "non affiché"}</dd>
          </div>
          <div>
            <dt>Repérée le</dt>
            <dd>{dateLisible(offre.dateReperage)}</dd>
          </div>
          <div>
            <dt>CV envoyé le</dt>
            <dd>{offre.dateEnvoi ? dateLisible(offre.dateEnvoi) : "—"}</dd>
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

        {dossier ? <DossierEmployeur dossier={dossier} /> : null}

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
          <h2>Ce que l’offre exige</h2>
          <ComparaisonOffre idOffre={offre.id} refus={refusComparaison} />
        </section>

        <section className="detail__bloc">
          <h2>Suivi</h2>
          <ControlesOffre offre={offre} />
        </section>

        <section className="detail__bloc">
          <h2>Candidature</h2>
          <BrouillonCandidature idOffre={offre.id} />
        </section>
      </article>
    </Cadre>
  );
}
