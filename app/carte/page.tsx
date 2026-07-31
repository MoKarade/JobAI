// app/carte/page.tsx — où sont les entreprises, et leurs offres.
//
// Server Component : il lit la base, assemble la vue avec `construireVue` (pure et testée)
// et n'envoie au navigateur que des entreprises et leurs offres.
//
// GARDE-FOU N°1 : le domicile de Marc n'entre JAMAIS dans cette page. Ni en props, ni dans
// le cadrage — qui se déduit des seules entreprises. Le TRAJET passe par un lien Google
// Maps qui ne porte que la destination (`lib/lienTrajet.ts`) : l'origine est proposée par
// Google, côté compte de Marc, jamais par l'app.
//
// HONNÊTETÉ DES POSITIONS : une épingle pleine est l'entreprise elle-même (trouvée dans
// OpenStreetMap) ; une épingle en pointillé est un REPLI au centre de sa ville, et la page
// le dit — en légende, dans la fenêtre, et dans la liste. La distance affichée reste celle
// du suivi, MESURÉE, jamais recalculée depuis l'épingle.

import { after } from "next/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { entreprisesLieux } from "@/lib/db/schema";
import { lireOffres } from "@/lib/donnees";
import { cadrage, construireVue, type PositionEntreprise } from "@/lib/carte";
import { ENTREPRISES_CIBLES } from "@/lib/reference";
import { lienTrajetGoogleMaps } from "@/lib/lienTrajet";
import { SEUIL_PALIER_A, SEUIL_PALIER_B, palier } from "@/lib/scoring";
import { classerPanne, type Panne } from "@/lib/panne";
import { Cadre } from "@/components/Cadre";
import { CarteOffres } from "@/components/CarteOffres";
import { BoutonSituer } from "@/components/BoutonSituer";
import { mesurerDistances, passeGeocodage } from "@/lib/actions";
import {
  CLE_DISTANCES,
  CLE_GEOCODAGE,
  DELAI_MESURE_AUTO_MS,
  DELAI_PASSE_AUTO_MS,
  reserverPasse,
} from "@/lib/synchro";

export const dynamic = "force-dynamic";
// La passe de localisation enchaîne des requêtes Nominatim à ~1,1 s d'intervalle : la
// Server Action a besoin de plus que la durée par défaut.
export const maxDuration = 30;
export const metadata = { title: "Carte — JobAI" };

export default async function PageCarte() {
  const session = await auth();
  if (!session) redirect("/connexion");

  let offres = null;
  let positions = new Map<string, PositionEntreprise>();
  let panne: Panne | null = null;

  try {
    offres = await lireOffres();
    if (offres !== null) {
      const lignes = await db.select().from(entreprisesLieux);
      positions = new Map(
        lignes.map((l) => [l.nom, { lat: l.lat, lon: l.lon, precision: l.precision }]),
      );
    }
  } catch (err) {
    console.error("[carte] lecture impossible", err);
    // La MÊME classification que l'accueil (`lib/panne.ts`) : écrite à part, elle a déjà
    // divergé une fois, et l'écran s'est mis à mentir.
    panne = classerPanne(err);
  }

  // Situer les entreprises qui manquent, sans que Marc ait à cliquer (demande du
  // 2026-07-30 : « je veux pas avoir à faire des commandes »).
  //
  // APRÈS la réponse, jamais pendant : la passe enchaîne des requêtes Nominatim espacées
  // de 1,1 s, et la faire dans le rendu ajouterait ces secondes à CHAQUE affichage de la
  // carte. `after()` la déplace hors du chemin critique — la page s'affiche à sa vitesse
  // normale et se complète au rechargement suivant.
  //
  // Bornée par `reserverPasse` : une passe toutes les cinq minutes au plus, quel que soit
  // le nombre de rechargements. Nominatim est gratuit et bannit les appelants insistants ;
  // supprimer le clic ne doit pas revenir à marteler le service à sa place.
  const ciblesManquantes = ENTREPRISES_CIBLES.filter((c) => !positions.has(c.nom)).length;

  if (offres !== null && panne === null) {
    // `passeGeocodage` ne situe QUE les entreprises cibles. Depuis que la carte part des
    // offres, un employeur apporté par l'ingestion doit l'être aussi — c'est
    // `mesurerDistances` qui sait le faire (elle géocode `offre.entreprise` à partir de la
    // ville de l'offre, puis mesure). Sans ce second travail, ces employeurs resteraient
    // « à situer » indéfiniment sur la page qui les montre.
    // ⚠️ LE CRITÈRE EST LA DISTANCE MANQUANTE, PAS L'ABSENCE DE POSITION.
    //
    // `!positions.has(o.entreprise)` semblait plus direct, mais il ne CONVERGE PAS : la
    // position d'un employeur peut être inscrite sous un autre nom que celui de l'offre
    // (« Laserax » côté cible, « Laserax inc. » côté annonce). `construireVue` sait
    // rapprocher les deux, cette comparaison littérale non — le gate resterait donc vrai à
    // vie et relancerait une passe de fond à chaque affichage, sans que rien ne progresse.
    // `km === null` s'éteint dès que la mesure a réussi, quel que soit le nom. C'est aussi
    // le critère de l'accueil : deux pages qui déclenchent le même travail doivent le
    // déclencher sur la même condition.
    const employeursNonSitues = offres.some(
      (o) => !o.histo && o.perimeeLe === null && o.km === null,
    );

    // ⚠️ UN SEUL `after()`, ET LES DEUX TRAVAUX EN SÉRIE.
    //
    // Deux `after()` distincts s'exécuteraient EN PARALLÈLE : la file de Next est créée
    // sans limite de concurrence (mesuré — `p-queue` par défaut = `Infinity`). Chacun
    // respecterait sa cadence de 1,1 s dans son coin, mais Nominatim verrait deux flux
    // simultanés — ce que sa politique interdit, et le bannissement coûterait la carte
    // entière. Les deux réservations restent SÉPARÉES (chacune borne son propre travail,
    // et l'accueil déclenche la mesure de son côté) ; c'est l'EXÉCUTION qui est sérialisée.
    if (ciblesManquantes > 0 || employeursNonSitues) {
      after(async () => {
        if (ciblesManquantes > 0) {
          try {
            if (await reserverPasse(db, CLE_GEOCODAGE, DELAI_PASSE_AUTO_MS, new Date())) {
              const r = await passeGeocodage();
              if (!r.ok) console.error("[carte] passe automatique refusée :", r.erreur);
              else if (r.panne) console.error("[carte] passe automatique dégradée :", r.panne);
            }
          } catch (err) {
            // Le fond ne doit jamais faire échouer une réponse déjà envoyée — mais il ne
            // doit pas non plus disparaître sans laisser de trace. Et l'échec du premier
            // travail ne doit pas emporter le second : d'où deux `try` et non un seul.
            console.error("[carte] passe automatique impossible", err);
          }
        }

        if (employeursNonSitues) {
          try {
            if (await reserverPasse(db, CLE_DISTANCES, DELAI_MESURE_AUTO_MS, new Date())) {
              const r = await mesurerDistances();
              if (!r.ok) console.error("[carte] mesure des distances refusée :", r.erreur);
            }
          } catch (err) {
            console.error("[carte] mesure des distances impossible", err);
          }
        }
      });
    }
  }

  if (panne === "schema-absent") {
    return (
      <Cadre actif="/carte" titre="Carte des offres">
        <div className="etat">
          <h2>Tables de la carte absentes</h2>
          <p>
            La base répond, mais le schéma de la carte (table{" "}
            <code>entreprises_lieux</code>) n’est pas encore appliqué. Ce n’est pas une panne.
          </p>
          <p className="etat__aide">
            Depuis le dépôt, sur ton poste : <code>npm run db:migrate</code> — le script
            vérifie lui-même que les tables existent après coup. Puis reviens ici et lance
            la localisation.
          </p>
        </div>
      </Cadre>
    );
  }

  if (panne !== null || offres === null) {
    return (
      <Cadre actif="/carte" titre="Carte des offres">
        <div className="etat">
          <h2>{panne ? "Base de données injoignable" : "Base de données non configurée"}</h2>
          <p>
            {panne
              ? "La connexion a échoué. Le détail est dans les journaux du serveur — il n’est pas affiché ici, un message d’erreur de base pouvant contenir des identifiants."
              : "La variable DATABASE_URL n’est pas définie : aucune offre ne peut être lue."}
          </p>
        </div>
      </Cadre>
    );
  }

  const vue = construireVue(offres, ENTREPRISES_CIBLES, positions);
  const cadre = cadrage(vue.epingles);
  const situees = vue.epingles.reduce((n, e) => n + e.entreprises.length, 0);
  const exactes = vue.epingles
    .filter((e) => e.precision === "exacte")
    .reduce((n, e) => n + e.entreprises.length, 0);
  const offresAffichees = vue.epingles.reduce(
    (n, e) => n + e.entreprises.reduce((m, x) => m + x.offres.length, 0),
    0,
  );
  // Le DÉNOMINATEUR : les offres vivantes que la carte ne montre pas encore (cibles à
  // situer, employeurs hors cibles) doivent se compter — la revue a montré que le compte
  // sans dénominateur masquait jusqu'à 5 offres actives sans aucun signal.
  const offresVivantes = offres.filter((o) => !o.histo && o.perimeeLe === null).length;

  return (
    <Cadre actif="/carte" titre="Carte des offres">
      <p className="intro-section">
        Chaque cercle plein est une <strong>entreprise</strong> à son emplacement ; un cercle
        en <strong>pointillé</strong> regroupe celles qu’OpenStreetMap ne connaît pas, posées
        au centre de leur ville — la position est alors approximative, et la fiche le dit.
        Clique une épingle pour l’entreprise, ses offres et le trajet.
      </p>

      {/* Le compte AVANT la carte : savoir ce qui est précis, approximatif et manquant
          change la lecture de ce qu'on regarde. */}
      <p className="carte__compte">
        {situees} entreprise{situees > 1 ? "s" : ""} sur la carte ({exactes} précise
        {exactes > 1 ? "s" : ""}, {situees - exactes} au centre-ville) ·{" "}
        {offresAffichees} offre{offresAffichees > 1 ? "s" : ""} active
        {offresAffichees > 1 ? "s" : ""} rattachée{offresAffichees > 1 ? "s" : ""} sur{" "}
        {offresVivantes}.
      </p>

      {/* Les couleurs des cercles portent le palier : la légende le DIT, avec les seuils
          LUS depuis le barème — recopiés, ils mentiraient au premier ajustement. */}
      <p className="carte-legende">
        <span>
          <span className="carte-legende__pastille" style={{ background: "#7c5cff" }} />
          {SEUIL_PALIER_A}+ (fonce)
        </span>
        <span>
          <span className="carte-legende__pastille" style={{ background: "#2f9e6d" }} />
          {SEUIL_PALIER_B}–{SEUIL_PALIER_A - 1} (solide)
        </span>
        <span>
          <span className="carte-legende__pastille" style={{ background: "#c98a1b" }} />
          sous {SEUIL_PALIER_B}
        </span>
        <span>
          <span className="carte-legende__pastille" style={{ background: "#7a8194" }} />
          sans offre active
        </span>
        <span>pointillé = position approximative</span>
      </p>

      {/* Le compte du bouton est celui des CIBLES, pas de `vue.aSituer` : le clic appelle
          `passeGeocodage`, qui ne traite que les entreprises cibles. Annoncer 37 pour une
          action qui n'en résout que 36 ferait attendre un effet qui ne viendra pas — les
          employeurs venus de l'ingestion se situent par la mesure des distances, en fond.
          Ce qu'il reste est dit sous la carte, avec le bon remède. */}
      <BoutonSituer restantes={ciblesManquantes} />

      <CarteOffres epingles={vue.epingles} cadre={cadre} />

      {vue.epingles.length === 0 ? (
        <div className="etat">
          <h2>Aucune entreprise située pour l’instant</h2>
          <p>
            {vue.aSituer.length > 0
              ? "Les entreprises n’ont pas encore été localisées. Le bouton ci-dessus lance une passe."
              : "Aucune entreprise cible n’est définie dans les Références."}
          </p>
        </div>
      ) : (
        // La même information que la carte, LISIBLE AU CLAVIER ET AU LECTEUR D'ÉCRAN. Une
        // carte de tuiles n'est pas explorable autrement ; sans cette liste, la page serait
        // inutilisable pour qui n'utilise pas la souris.
        <ul className="carte-liste">
          {vue.epingles.flatMap((e) =>
            e.entreprises.map((x) => {
              const trajet = lienTrajetGoogleMaps(x.nom);
              return (
                <li key={x.nom} className="carte-liste__ville">
                  <h2 className="carte-liste__titre">
                    {x.nom}{" "}
                    <span className="carte-liste__n">
                      {x.ville}
                      {e.precision === "ville" ? " · position approximative" : ""}
                    </span>
                  </h2>
                  {/* La liste porte TOUT ce que la fenêtre de la carte porte — distance
                      de référence et lecture comprises : c'est elle, l'accès clavier et
                      lecteur d'écran, pas un résumé appauvri. */}
                  <p className="carte-liste__faits">
                    {x.km === null
                      ? "distance non mesurée"
                      : `${String(x.km).replace(".", ",")} km du domicile (mesuré)`}
                  </p>
                  {x.lecture ? <p className="carte-liste__lecture">{x.lecture}</p> : null}
                  {x.offres.length > 0 ? (
                    <ul>
                      {x.offres.map((o) => (
                        <li
                          key={o.id}
                          className={`carte-liste__offre carte-liste__offre--${palier(o.score)}`}
                        >
                          <Link href={`/offre/${o.id}`}>{o.poste}</Link>
                          <span className="carte-liste__faits">
                            {o.score === null ? "note –" : `${o.score}/100`}
                            {o.km === null ? "" : ` · ${String(o.km).replace(".", ",")} km`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="carte-liste__faits">Aucune offre active repérée.</p>
                  )}
                  {trajet ? (
                    <a
                      href={trajet}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="carte-liste__trajet"
                      aria-label={`Trajet vers ${x.nom} dans Google Maps`}
                    >
                      Trajet dans Google Maps ↗
                    </a>
                  ) : null}
                </li>
              );
            }),
          )}
        </ul>
      )}

      {vue.aSituer.length > 0 ? (
        <p className="carte__manquants">
          Pas encore situé{vue.aSituer.length > 1 ? "es" : "e"} — la prochaine passe de
          localisation s’en charge : {vue.aSituer.join(", ")}.
        </p>
      ) : null}

      {vue.sansLieu.length > 0 ? (
        <p className="carte__manquants">
          Hors de la carte faute de ville annoncée par la source :{" "}
          {vue.sansLieu.join(", ")}. Aucune passe n’y changera rien — la ville doit venir de
          l’offre.
        </p>
      ) : null}
    </Cadre>
  );
}
