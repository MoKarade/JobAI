// app/carte/page.tsx — où sont les entreprises, et leurs offres.
//
// Server Component : il lit la base, garde la session, et confie le reste à
// `CarteFiltrable` (client) — le filtrage doit être instantané et surtout IDENTIQUE à celui
// de la liste, ce qu'un aller-retour serveur par clic ne donnerait pas.
//
// Il envoie donc au navigateur les offres COMPLÈTES (`notes`, `userNote` comprises), que la
// recherche libre parcourt. Même session, même navigateur, et l'accueil le fait déjà : ce
// n'est pas une exposition nouvelle — mais c'est à dire, pas à taire.
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
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { entreprisesLieux } from "@/lib/db/schema";
import { lireOffres } from "@/lib/donnees";
import type { PositionEntreprise } from "@/lib/carte";
import { ENTREPRISES_CIBLES } from "@/lib/reference";
import { SEUIL_PALIER_A, SEUIL_PALIER_B } from "@/lib/scoring";
import { classerPanne, type Panne } from "@/lib/panne";
import { Cadre } from "@/components/Cadre";
import { CarteFiltrable } from "@/components/CarteFiltrable";
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
        lignes.map((l) => [
          l.nom,
          {
            lat: l.lat,
            lon: l.lon,
            precision: l.precision,
            adresse: l.adresse,
            // `bornesLe` NULL = jamais interrogé. C'est ce qui distingue « on ne sait
            // pas » de « il n'y en a aucune », et les deux se disent différemment.
            bornes:
              l.bornesLe === null
                ? null
                : {
                    nombre: l.bornesM === null ? 0 : 1,
                    plusProcheM: l.bornesM,
                    nom: l.bornesNom,
                  },
          },
        ]),
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

  return (
    <Cadre actif="/carte" titre="Carte des offres">
      <p className="intro-section">
        Chaque cercle plein est une <strong>entreprise</strong> à son emplacement ; un cercle
        en <strong>pointillé</strong> regroupe celles qu’OpenStreetMap ne connaît pas, posées
        au centre de leur ville — la position est alors approximative, et la fiche le dit.
        Clique une épingle pour l’entreprise, ses offres et le trajet.
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

      {/* Le filtrage et l'assemblage des épingles vivent côté client : c'est ce qui rend
          les filtres instantanés ET identiques à ceux de la liste (`construireVue` est
          pure, elle tourne aussi bien ici que sur le serveur). */}
      <CarteFiltrable
        offres={offres}
        cibles={[...ENTREPRISES_CIBLES]}
        positions={[...positions.entries()]}
        ciblesManquantes={ciblesManquantes}
      />
    </Cadre>
  );
}
