// components/ListeArchives.tsx — ce qui est fermé, et combien de temps ça a tenu.
//
// Demande de Marc (2026-09-14) : « archive celles plus actives ». Une offre disparue était
// déjà marquée périmée et sortait de la liste courante — mais elle n'était consultable que
// par une case à cocher au milieu des filtres de l'accueil, mélangée aux offres vivantes.
// « Archivé » n'est pas un drapeau : c'est un endroit où l'on va, quand on veut savoir ce
// qui s'est passé.
//
// ⚠️ CE N'EST PAS UNE SUPPRESSION, ET L'ÉCRAN DOIT LE MONTRER : chaque ligne garde son lien
// vers la fiche complète, où l'offre se rouvre d'un bouton. Le suivi n'efface rien — une
// péremption est un CONSTAT (« on ne la voit plus »), pas un verdict, et un faux positif ne
// doit jamais être définitif.

import Link from "next/link";
import type { Offre } from "@/lib/types";
import type { Observation } from "@/lib/dureeVie";

/** « 12 jours », « 1 jour », « vue une seule fois » — jamais « 0 jour ». */
function duree(jours: number): string {
  if (jours === 0) return "vue une seule fois";
  return jours === 1 ? "1 jour" : `${jours} jours`;
}

export function ListeArchives({
  offres,
  observations,
}: {
  /** Les offres fermées, les plus récemment constatées en premier. */
  offres: readonly Offre[];
  /** Les durées observées, par identifiant d'offre. */
  observations: ReadonlyMap<string, Observation>;
}) {
  if (offres.length === 0) {
    return (
      <p className="vide">
        Aucune offre archivée. Une offre y arrive quand plusieurs passes de veille d’affilée
        cessent de la voir.
      </p>
    );
  }

  return (
    <ul className="archives">
      {offres.map((o) => {
        const obs = observations.get(o.id);
        return (
          <li key={o.id} className="archives__ligne">
            <Link href={`/offre/${o.id}`} className="archives__lien">
              <span className="archives__entreprise">{o.entreprise}</span>
              <span className="archives__poste">{o.poste}</span>
            </Link>
            <p className="archives__faits">
              {/* ⚠️ « En ligne » et non « a duré » : on mesure la fenêtre pendant laquelle la
                  veille l'a VUE, et l'offre existait avant qu'on la trouve. Une offre sans
                  observation (jamais vue par un balayage — saisie à la main, par exemple)
                  n'affiche RIEN plutôt qu'un zéro qui se lirait comme une mesure. */}
              {obs ? (
                <span className="archives__duree">en ligne {duree(obs.jours)} au moins</span>
              ) : (
                <span className="archives__duree archives__duree--absente">durée non mesurée</span>
              )}
              {o.perimeeLe ? (
                <span className="archives__date">fermée le {o.perimeeLe.slice(0, 10)}</span>
              ) : null}
              {o.score !== null ? <span className="archives__note">{o.score}/100</span> : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
