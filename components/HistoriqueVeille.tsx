// components/HistoriqueVeille.tsx — comment la veille s'est comportée, passe après passe.
//
// ⚠️ UNE LISTE VIDE SE DIT, elle ne se rend pas comme un tableau sans lignes. « Aucune passe
// enregistrée » et « la veille ne trouve plus rien » s'afficheraient pareil, et ce sont les
// deux hypothèses opposées qu'on vient justement départager ici.

import type { EntreeHistorique } from "@/lib/historiqueVeille";

/** L'heure locale d'une fin de passe, ou rien si l'horodatage est absent. */
function heure(fini: string): string {
  if (!fini) return "";
  const d = new Date(fini);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: "America/Toronto",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function HistoriqueVeilleVue({ entrees }: { entrees: readonly EntreeHistorique[] }) {
  if (entrees.length === 0) {
    return (
      <p className="vide">
        Aucune passe enregistrée pour l’instant. L’historique se remplit à partir de la
        prochaine — celles d’avant n’ont pas été tracées.
      </p>
    );
  }

  return (
    <div className="histo">
      <table className="histo__table">
        <caption className="hors-ecran">
          Historique des passes de veille, de la plus récente à la plus ancienne
        </caption>
        <thead>
          <tr>
            <th scope="col">Passe</th>
            <th scope="col" className="histo__num">Vues</th>
            <th scope="col" className="histo__num">Nouvelles</th>
            <th scope="col" className="histo__num">Note moy.</th>
            <th scope="col" className="histo__num">Périmées</th>
            <th scope="col" className="histo__num">Suivies</th>
          </tr>
        </thead>
        <tbody>
          {entrees.map((e) => (
            <tr key={`${e.jour}-${e.fini}`}>
              <th scope="row" className="histo__quand">
                {e.jour}
                {heure(e.fini) ? <span className="histo__heure"> {heure(e.fini)}</span> : null}
                <span className="histo__par"> · {e.declencheur}</span>
              </th>
              <td className="histo__num">{e.trouvees}</td>
              <td className="histo__num">{e.nouvelles}</td>
              {/* ⚠️ Un tiret, jamais 0 : une passe sans nouvelle offre n'a pas une note
                  moyenne de zéro, elle n'en a pas. */}
              <td className="histo__num">{e.noteMoyenneNouvelles ?? "—"}</td>
              <td className="histo__num">{e.perimees}</td>
              <td className="histo__num">{e.suivies}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
