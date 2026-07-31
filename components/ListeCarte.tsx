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

export function ListeCarte({ epingles }: { epingles: readonly Epingle[] }) {
  return (
    <ul className="carte-liste">
      {epingles.flatMap((e) =>
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
  );
}
