// components/TableauBord.tsx — où en est la recherche, en un coup d'œil.
//
// Ils viennent tous de `resumer` (fonction pure testée) : aucun compte n'est recalculé
// ici. Deux chiffres calculés à deux endroits finissent toujours par diverger, et c'est
// l'affichage qu'on accuse.
//
// ⚠️ ENTONNOIR, PLUS UNE RANGÉE DE CHIFFRES (ADR-0008). Cinq nombres alignés se lisent un
// par un et ne disent rien de leur RAPPORT : que 8 CV pour 38 offres suivies, c'est la
// vraie information, et elle n'apparaissait nulle part. Des barres proportionnelles la
// donnent sans qu'on ait à faire la division.
//
// Les quatre étages sont un vrai entonnoir — chacun est un sous-ensemble du précédent.
// `notees80Plus` n'en est PAS un (c'est une mesure de qualité du vivier, pas une étape) :
// il est donc rendu à part, et pas comme un cinquième étage qui mentirait sur la forme.

import type { ResumeSuivi } from "@/lib/types";

export function TableauBord({ resume }: { resume: ResumeSuivi }) {
  const etages: readonly { libelle: string; valeur: number; but?: boolean }[] = [
    { libelle: "Offres suivies", valeur: resume.actives },
    { libelle: "CV envoyés", valeur: resume.cvEnvoyes },
    { libelle: "Réponses", valeur: resume.reponses },
    { libelle: "Entrevues", valeur: resume.entrevues, but: true },
  ];

  // La base de comparaison est le premier étage. `Math.max(…, 1)` évite la division par
  // zéro d'un suivi vide : sans offre active, toutes les barres valent leur largeur
  // minimale, ce qui est exact — il n'y a rien à comparer.
  const base = Math.max(resume.actives, 1);

  return (
    <div className="bord">
      <div className="bord__fort">
        <span className="bord__n">{resume.notees80Plus}</span>
        <span className="bord__l">
          {resume.notees80Plus > 1 ? "offres notées 80+" : "offre notée 80+"}
        </span>
      </div>

      <div className="entonnoir">
        {etages.map((e) => (
          <div key={e.libelle} className="etage">
            <span className="etage__l">{e.libelle}</span>
            <span className="etage__piste">
              {/* La largeur PORTE la proportion, le nombre la dit. La couleur seule ne
                  porte jamais l'information (WCAG 1.4.1) : le chiffre est écrit dans la
                  barre, et le libellé la nomme. */}
              <span
                className={`etage__barre${e.but ? " etage__barre--but" : ""}`}
                style={{ width: `calc(${((e.valeur / base) * 100).toFixed(1)}% + 2.75rem)` }}
              >
                {e.valeur}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
