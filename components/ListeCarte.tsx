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
import { Fait } from "./Icone";
import { RAYON_5_MIN_M, minutesAPied } from "@/lib/bornes";
import { ADRESSE_ABSENTE, mentionSource } from "@/lib/adresse";

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
                {x.adresse ?? ADRESSE_ABSENTE}
                {/* LA SOURCE, quand il y a une adresse. Un domicile légal tiré du registre
                    n'est pas un lieu de travail : les afficher pareil enverrait Marc à la
                    mauvaise porte. Le texte vit dans `lib/adresse.ts`, une seule fois. */}
                {x.adresse && x.adresseSource ? (
                  <span className="carte-liste__source">
                    {" "}
                    ({mentionSource(x.adresseSource)})
                  </span>
                ) : null}
              </p>
              {/* ⚠️ MOINS DE TEXTE, PAS MOINS D'INFORMATION (demande de Marc, 2026-08-06).
                  « 26,4 km du domicile (mesuré) » devient une icône et « 26,4 km » : ce que
                  la phrase disait en plus — d'où on mesure, et que c'est mesuré — est vrai
                  de TOUTES les lignes, donc le répéter partout n'apprenait rien. L'icône
                  porte son nom au lecteur d'écran (`components/Icone.tsx`), sans quoi
                  couper la phrase couperait aussi le sens. */}
              <p className="carte-liste__faits">
                <Fait genre="route" discret={x.km === null}>
                  {x.km === null ? "—" : `${String(x.km).replace(".", ",")} km`}
                </Fait>
                <Fait genre="borne" discret={x.bornes === null || x.bornes.plusProcheM === null}>
                  {x.bornes === null
                    ? "non mesuré"
                    : x.bornes.plusProcheM === null
                      ? `aucune < ${MINUTES_LIBELLE}`
                      : `${minutesAPied(x.bornes.plusProcheM)} min`}
                </Fait>
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
                        {o.score === null ? "–" : o.score}
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
