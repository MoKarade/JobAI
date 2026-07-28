// app/carte/page.tsx — où sont les offres.
//
// Server Component : il lit la base, assemble la vue avec `construireVue` (pure et testée)
// et n'envoie au navigateur que des épingles de municipalités.
//
// GARDE-FOU N°1 : le domicile de Marc n'entre JAMAIS dans cette page. Ni en props, ni dans
// le cadrage — qui se déduit des seules offres. `DOMICILE_LAT` / `DOMICILE_LON` restent des
// variables serveur au service du calcul de distance, et rien d'autre. La carte montre où
// sont les offres, pas où habite quelqu'un.
//
// La distance affichée est celle de `offers.km`, MESURÉE. Elle n'est pas recalculée depuis
// la position de l'épingle, qui n'est qu'un centre de municipalité : deux nombres pour la
// même grandeur finiraient par diverger, et c'est l'affichage qu'on accuserait.

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { villes as tableVilles } from "@/lib/db/schema";
import { lireOffres } from "@/lib/donnees";
import { cadrage, construireVue, villesNecessaires } from "@/lib/carte";
import { ENTREPRISES_CIBLES } from "@/lib/reference";
import { palier } from "@/lib/scoring";
import { Cadre } from "@/components/Cadre";
import { CarteOffres } from "@/components/CarteOffres";
import { BoutonGeocoder } from "@/components/BoutonGeocoder";

export const dynamic = "force-dynamic";
export const metadata = { title: "Carte — JobAI" };

export default async function PageCarte() {
  const session = await auth();
  if (!session) redirect("/connexion");

  let offres = null;
  let coordonnees = new Map<string, { lat: number; lon: number }>();
  let panne = false;

  try {
    offres = await lireOffres();
    if (offres !== null) {
      const lignes = await db.select().from(tableVilles);
      coordonnees = new Map(lignes.map((v) => [v.nom, { lat: v.lat, lon: v.lon }]));
    }
  } catch (err) {
    // Même principe que partout ailleurs : une panne se DIT. Une carte vide sans
    // explication envoie chercher un problème de données là où la base ne répond pas.
    console.error("[carte] lecture impossible", err);
    panne = true;
  }

  if (panne || offres === null) {
    return (
      <Cadre actif="/carte" titre="Carte des offres">
        <div className="etat">
          <h2>{panne ? "Données illisibles" : "Base de données non configurée"}</h2>
          <p>
            {panne
              ? "La base n’a pas répondu. Le détail est dans les journaux du serveur."
              : "La variable DATABASE_URL n’est pas définie : aucune offre ne peut être lue."}
          </p>
        </div>
      </Cadre>
    );
  }

  const vue = construireVue(offres, ENTREPRISES_CIBLES, coordonnees);
  const cadre = cadrage(vue.epingles);
  const situees = vue.epingles.reduce((n, e) => n + e.offres.length, 0);
  const vivantes = offres.filter((o) => !o.histo && o.perimeeLe === null).length;
  const restantes = villesNecessaires(offres, ENTREPRISES_CIBLES).filter(
    (v) => !coordonnees.has(v),
  ).length;

  return (
    <Cadre actif="/carte" titre="Carte des offres">
      <p className="intro-section">
        Chaque épingle est une <strong>municipalité</strong>, pas un employeur : la position
        est le centre de la ville. La distance affichée, elle, est celle du suivi — mesurée,
        jamais déduite de l’épingle.
      </p>

      {/* Le compte AVANT la carte : savoir que 4 offres sur 23 sont situées change
          complètement la lecture de ce qu'on regarde. */}
      <p className="carte__compte">
        {situees} offre{situees > 1 ? "s" : ""} située{situees > 1 ? "s" : ""} sur {vivantes}{" "}
        active{vivantes > 1 ? "s" : ""}.
      </p>

      <BoutonGeocoder restantes={restantes} />

      <CarteOffres epingles={vue.epingles} cadre={cadre} />

      {vue.epingles.length === 0 ? (
        <div className="etat">
          <h2>Aucune offre située pour l’instant</h2>
          <p>
            {restantes > 0
              ? "Les villes des offres ne sont pas encore localisées. Le bouton ci-dessus lance une passe."
              : "Aucune offre active ne correspond à une entreprise dont la ville est connue."}
          </p>
        </div>
      ) : (
        // La même information que la carte, mais LISIBLE AU CLAVIER ET AU LECTEUR D'ÉCRAN.
        // Une carte de tuiles n'est pas explorable autrement ; sans cette liste, la page
        // serait inutilisable pour qui n'utilise pas la souris.
        <ul className="carte-liste">
          {vue.epingles.map((e) => (
            <li key={e.ville} className="carte-liste__ville">
              <h2 className="carte-liste__titre">
                {e.ville} <span className="carte-liste__n">{e.offres.length}</span>
              </h2>
              <ul>
                {e.offres.map((o) => (
                  <li key={o.id} className={`carte-liste__offre carte-liste__offre--${palier(o.score)}`}>
                    <Link href={`/offre/${o.id}`}>{o.entreprise}</Link> — {o.poste}
                    <span className="carte-liste__faits">
                      {o.score === null ? "note –" : `${o.score}/100`}
                      {o.km === null ? "" : ` · ${String(o.km).replace(".", ",")} km`}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {vue.sansVille.length > 0 ? (
        <p className="carte__manquants">
          Sans ville connue, donc absent{vue.sansVille.length > 1 ? "es" : "e"} de la carte :{" "}
          {vue.sansVille.join(", ")}. Ces employeurs ne figurent pas dans les entreprises
          cibles de l’onglet Références.
        </p>
      ) : null}
    </Cadre>
  );
}
