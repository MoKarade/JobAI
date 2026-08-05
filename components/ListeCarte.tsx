// components/ListeCarte.tsx — la carte, LISIBLE AU CLAVIER ET AU LECTEUR D'ÉCRAN.
//
// Une carte de tuiles ne s'explore pas autrement. Sans cette liste, la page serait
// inutilisable pour qui n'utilise pas la souris — ce n'est donc pas un doublon de la carte,
// c'est son second accès, et il porte TOUT ce que la fenêtre d'une épingle porte (distance
// de référence, lecture, offres, trajet). Un résumé appauvri ferait de l'accessibilité un
// affichage de seconde classe.
//
// Extraite de `app/carte/page.tsx` quand la carte est passée côté client pour ses filtres :
// la laisser dans la page aurait obligé à la recopier, et une copie diverge.

import Link from "next/link";
import type { Epingle } from "@/lib/carte";
import { lienTrajetGoogleMaps } from "@/lib/lienTrajet";
import { palier } from "@/lib/scoring";
import { RAYON_5_MIN_M, minutesAPied } from "@/lib/bornes";

/** Le seuil, dit en toutes lettres — dérivé de la constante, jamais recopié. */
const MINUTES_LIBELLE = `${minutesAPied(RAYON_5_MIN_M)} min`;

export function ListeCarte({ epingles }: { epingles: readonly Epingle[] }) {
  return (
    <ul className="carte-liste">
      {epingles.flatMap((e) =>
        e.entreprises.map((x) => {
          // La ville de l'entreprise est connue ici : elle rend le lien Maps sans ambiguïté.
          const trajet = lienTrajetGoogleMaps(x.nom, undefined, x.ville);
          return (
            <li key={x.nom} className="carte-liste__ville">
              <h2 className="carte-liste__titre">
                {x.nom}{" "}
                <span className="carte-liste__n">
                  {x.ville}
                  {e.precision === "ville" ? " · position approximative" : ""}
                </span>
              </h2>
              {/* L'ADRESSE d'abord : c'est ce qu'on cherche quand on prépare un
                  déplacement ou une candidature. Absente, on le DIT — une entreprise posée
                  au centre de sa ville n'a pas d'adresse connue, et en afficher une
                  plausible serait pire que le silence. */}
              <p className="carte-liste__adresse">
                {x.adresse ??
                  "Adresse non publiée dans OpenStreetMap — le lien Maps ci-dessous la retrouve par le nom."}
              </p>
              <p className="carte-liste__faits">
                {x.km === null
                  ? "distance non mesurée"
                  : `${String(x.km).replace(".", ",")} km du domicile (mesuré)`}
              </p>
              {/* BORNES DE RECHARGE — trois états, trois phrases. « Pas encore regardé »
                  n'est pas « aucune borne » : le second est une information, le premier
                  une absence de mesure, et les confondre serait affirmer ce qu'on ignore. */}
              <p className="carte-liste__bornes">
                {x.bornes === null
                  ? "Bornes de recharge : pas encore regardé."
                  : x.bornes.plusProcheM === null
                    ? `Aucune borne de recharge à moins de ${MINUTES_LIBELLE} à pied.`
                    : `Borne de recharge à ~${minutesAPied(x.bornes.plusProcheM)} min à pied` +
                      `${x.bornes.nom ? ` (${x.bornes.nom})` : ""} — ${x.bornes.plusProcheM} m à vol d’oiseau.`}
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
  );
}
