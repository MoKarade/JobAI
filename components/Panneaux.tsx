// components/Panneaux.tsx — les sections repliables sous la liste : barème, entreprises,
// salaires, SWOT.
//
// Chacune est un `<details>` natif : repliable sans JavaScript, accessible au clavier par
// construction, et l'état ouvert/fermé est géré par le navigateur. Un accordéon fait main
// coûterait du code et de l'accessibilité pour le même résultat.

import {
  PLAFOND_NOTE_CALCULEE,
  PONDERATION,
  RAYON_MAX_KM,
} from "@/lib/scoring";
import { ENTREPRISES_CIBLES, SALAIRES_MARCHE } from "@/lib/reference";
import { PROFIL_DEFAUT, type Profil, type QuadrantSwot } from "@/lib/profil";

/**
 * Explication de chaque composante du barème.
 *
 * Les POINTS ne sont pas écrits ici : ils sont lus depuis `PONDERATION`. Une valeur
 * re-copiée dans un texte explicatif dérive silencieusement dès qu'on ajuste le barème, et
 * l'explication se met alors à mentir sans que rien ne le signale.
 */
const COMPOSANTES: readonly { cle: keyof typeof PONDERATION; titre: string; texte: string }[] = [
  {
    cle: "fitRole",
    titre: "Fit du rôle",
    texte:
      "Coordination d'équipe technique ET automatisation ou robotique. Un poste qui combine les deux monte ; un poste purement technique ou purement gestionnaire plafonne.",
  },
  {
    cle: "distance",
    titre: "Distance",
    texte: `Depuis le domicile. Moins de 5 km : plein pot. 15 km : les trois quarts. Au-delà de ${RAYON_MAX_KM} km : zéro. Critère n°1 déclaré.`,
  },
  {
    cle: "seniorite",
    titre: "Séniorité atteignable",
    texte:
      "Environ 3 ans d'expérience post-diplôme. Une exigence de 5 à 10 ans coûte des points, sans être éliminatoire.",
  },
  {
    cle: "salaire",
    titre: "Salaire",
    texte:
      "Comparé au marché régional (coordonnateur ~74 k$, spécialiste automatisation ~89 k$). Non affiché : note neutre, jamais une pénalité.",
  },
  {
    cle: "immigration",
    titre: "Statut migratoire",
    texte:
      "Pénalité si l'employeur exige la résidence permanente ou la citoyenneté, ou si le poste est régi par un ordre professionnel.",
  },
];

function Bareme() {
  return (
    <details className="panneau">
      <summary>Comment la note est calculée</summary>
      <div className="panneau__corps">
        <p className="panneau__intro">
          Note sur 100, pondérée selon <strong>ce profil</strong> et ses contraintes — ce
          n’est pas une mesure de la qualité absolue de l’offre. Une excellente offre de
          technicien à 40 km note bas ici, et c’est voulu.
        </p>
        <dl className="bareme">
          {COMPOSANTES.map((c) => (
            <div key={c.cle} className="bareme__ligne">
              <dt>
                {c.titre} <span className="bareme__pts">{PONDERATION[c.cle]} pts</span>
              </dt>
              <dd>{c.texte}</dd>
            </div>
          ))}
        </dl>
        <p className="panneau__note">
          A = 80 et plus (fonce) · B = 65 à 79 (solide) · C = moins de 65 (opportuniste).
          Une note <strong>calculée</strong> automatiquement est plafonnée à{" "}
          {PLAFOND_NOTE_CALCULEE} : elle ne lit que des champs structurés, là où une note
          manuelle vient de la lecture réelle de l’offre.
        </p>
      </div>
    </details>
  );
}

function Entreprises() {
  return (
    <details className="panneau">
      <summary>Entreprises cibles · distances réelles</summary>
      <div className="panneau__corps">
        <div className="grille-entreprises">
          {ENTREPRISES_CIBLES.map((e) => (
            <article key={e.nom} className="fiche">
              <h3>{e.nom}</h3>
              <p className="fiche__lieu">{e.ville}</p>
              {/* Une distance non mesurée se DIT. L'afficher comme « 0 km » ou la taire
                  reviendrait à laisser croire à un relevé qui n'existe pas. */}
              {e.km === null ? (
                <p className="fiche__km fiche__km--inconnue">distance non mesurée</p>
              ) : (
                <p className={`fiche__km${e.km > RAYON_MAX_KM ? " fiche__km--hors" : ""}`}>
                  {e.km.toString().replace(".", ",")} km
                  {e.km > RAYON_MAX_KM ? " — hors rayon" : ""}
                </p>
              )}
              <p className="fiche__lecture">{e.lecture}</p>
            </article>
          ))}
        </div>
      </div>
    </details>
  );
}

function Salaires() {
  return (
    <details className="panneau">
      <summary>Salaires du marché</summary>
      <div className="panneau__corps">
        <div className="table-enveloppe">
          <table className="table-marche">
            <thead>
              <tr>
                <th scope="col">Poste ou zone</th>
                <th scope="col">Fourchette</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {SALAIRES_MARCHE.map((s) => (
                <tr key={s.poste}>
                  <td>{s.poste}</td>
                  <td className="table-marche__v">{s.fourchette}</td>
                  <td className="table-marche__s">{s.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="panneau__note">
          Relevés de mai à juillet 2026. À re-vérifier avant de s’en servir comme argument de
          négociation : un repère vieilli se retourne contre celui qui le cite.
        </p>
      </div>
    </details>
  );
}

/**
 * L'analyse de position.
 *
 * ⚠️ ELLE VIENT DU PROFIL ACTIF (ADR-0009), pas d'une constante. Un CV validé peut donc
 * l'actualiser — mais seulement pour ses FAITS. Le jugement reste écrit par Marc :
 * « mobilité limitée avant la résidence permanente (permis lié à l'employeur actuel) » ne
 * sort d'aucun CV, et un SWOT régénéré automatiquement perdrait exactement ce qui fait sa
 * valeur : il a été pensé.
 *
 * La DATE du constat est affichée pour la même raison qu'un repère de salaire porte la
 * sienne : une lecture de position sans date ne se relit pas, elle se croit.
 */
function Swot({ quadrants, etabliLe }: { quadrants: readonly QuadrantSwot[]; etabliLe: string }) {
  return (
    <details className="panneau">
      <summary>Position et stratégie</summary>
      <div className="panneau__corps">
        <div className="grille-swot">
          {quadrants.map((q) => (
            <section key={q.cle} className={`quadrant quadrant--${q.cle}`}>
              <h3>{q.titre}</h3>
              <ul>
                {q.points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="panneau__note">Établie le {etabliLe}.</p>
      </div>
    </details>
  );
}

/**
 * `profil` est OPTIONNEL, et son défaut est celui du code.
 *
 * C'est ce qui permet à la page Références de s'afficher sans lire la base — elle n'a
 * jamais eu d'écran de panne, justement parce qu'elle ne dépendait de rien. Une page qui
 * exigerait le profil actif prendrait cette dépendance, et le premier incident de base
 * effacerait le barème de l'écran alors qu'il est écrit dans le code.
 */
export function Panneaux({ profil = PROFIL_DEFAUT }: { profil?: Profil }) {
  return (
    <div className="panneaux">
      <Bareme />
      <Entreprises />
      <Salaires />
      <Swot quadrants={profil.swot} etabliLe={profil.etabliLe} />
    </div>
  );
}
