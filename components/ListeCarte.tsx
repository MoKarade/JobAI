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
import { couleurNote, encreSurNote } from "@/lib/couleurNote";
import { Fait } from "./Icone";
import { libelleBorne, libelleDistanceBorne } from "@/lib/bornes";
import { ADRESSE_ABSENTE, mentionSource } from "@/lib/adresse";

/**
 * N'accepte un lien QUE s'il est http/https — même garde que `lienSur` (`CarteOffre.tsx`,
 * `app/offre/[id]/page.tsx`, `CarteOffres.tsx`) : `x.siteWeb` vient de Google Place
 * Details, pas d'une saisie de Marc, mais rien n'exige que Google ne publie jamais autre
 * chose qu'une URL propre.
 */
function lienSur(brut: string): string | null {
  try {
    const u = new URL(brut);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

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
                {/* LA BORNE LA PLUS PROCHE, sans plafond (demande de Marc, 2026-08-06).
                    Ce qu'on en sait — rapide, marque, tarif — suit la distance quand
                    OpenStreetMap le publie, et rien ne s'écrit à sa place quand il ne le
                    publie pas : une borne sans puissance déclarée n'est pas « standard ». */}
                <Fait genre="borne" discret={x.bornes === null || x.bornes.plusProcheM === null}>
                  {x.bornes === null
                    ? "non mesuré"
                    : x.bornes.plusProcheM === null
                      ? "aucune trouvée"
                      : libelleDistanceBorne(x.bornes.plusProcheM)}
                </Fait>
                {x.bornes && x.bornes.plusProcheM !== null && libelleBorne(x.bornes) ? (
                  <span className="carte-liste__bornes">{libelleBorne(x.bornes)}</span>
                ) : null}
              </p>
              {/* Fiche enrichie par Google Places — [CARTE-03-PLACES]. Même contenu que la
                  fenêtre de l'épingle (`CarteOffres.tsx`) : les trois champs sont
                  indépendants, `null` = pas de `placeGoogleId` ou pas encore interrogé. */}
              {x.siteWeb && lienSur(x.siteWeb) ? (
                <p className="carte-liste__site">
                  <a href={lienSur(x.siteWeb)!} target="_blank" rel="noopener noreferrer">
                    Site web ↗
                  </a>
                </p>
              ) : null}
              {x.telephone ? <p className="carte-liste__telephone">{x.telephone}</p> : null}
              {x.horaires && x.horaires.length > 0 ? (
                <ul className="carte-liste__horaires">
                  {x.horaires.map((j) => (
                    <li key={j}>{j}</li>
                  ))}
                </ul>
              ) : null}
              {x.lecture ? <p className="carte-liste__lecture">{x.lecture}</p> : null}
              {x.offres.length > 0 ? (
                <ul>
                  {x.offres.map((o) => (
                    <li
                      key={o.id}
                      className={`carte-liste__offre carte-liste__offre--${palier(o.score)}`}
                    >
                      {/* ⚠️ LE SCORE SE VOIT ICI AUSSI (demande de Marc, 2026-08-06 :
                          « je veux voir le score dans la carte ET sur le côté »). Même
                          pastille, même échelle de couleur que le plan et que la liste
                          d'offres : un score doit se dire d'une seule façon, sinon on
                          apprend trois codes pour une seule information. */}
                      <span
                        className="carte-liste__note"
                        style={{ background: couleurNote(o.score), color: encreSurNote() }}
                        title={o.score === null ? "Jamais notée" : `${o.score} sur 100`}
                      >
                        {o.score ?? "–"}
                      </span>
                      <Link href={`/offre/${o.id}`}>{o.poste}</Link>
                      <span className="carte-liste__faits">
                        {o.km === null ? "" : `${String(o.km).replace(".", ",")} km`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
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
