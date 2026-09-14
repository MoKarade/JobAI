// components/DureeVieVue.tsx — à quelle vitesse le marché se referme.
//
// Demande de Marc (2026-09-14) : « une historique pour estimer genre combien de temps une
// offre reste en ligne », et parmi les deux lectures possibles il a choisi celle-ci — « le
// marché bouge à quelle vitesse ? » plutôt qu'un repère posé sur chaque offre.
//
// ⚠️ CHAQUE CHIFFRE SORT D'ICI AVEC SA PORTÉE, et ce n'est pas de la prudence décorative.
// Le calcul (`lib/dureeVie.ts`) mesure la durée VISIBLE — depuis le jour où une de nos
// requêtes a trouvé l'offre, jamais depuis sa publication. Écrire « les offres restent 12
// jours en ligne » serait faux : elles restent AU MOINS douze jours après qu'on les a
// repérées. Un écran qui perd cette nuance transforme une borne inférieure en mesure, ce
// que le garde-fou n°3 interdit — et personne ne pourra plus la retrouver ensuite.

import type { RapportDureeVie, SurvieNommee } from "@/lib/dureeVie";
import { MINIMUM_GROUPE } from "@/lib/dureeVie";
import { CATEGORIE_LIBELLES, type Categorie } from "@/lib/categorie";

/** « 12 jours », ou la phrase qui dit pourquoi il n'y a pas de chiffre. */
function mediane(s: { medianeJours: number | null }): string {
  if (s.medianeJours === null) return "—";
  return s.medianeJours === 1 ? "1 jour" : `${s.medianeJours} jours`;
}

function Tableau({
  titre,
  groupes,
  ecartes,
  libelle,
}: {
  titre: string;
  groupes: readonly SurvieNommee[];
  ecartes: number;
  /** Comment nommer une ligne — la catégorie a des libellés, l'employeur est son propre nom. */
  libelle?: (nom: string) => string;
}) {
  if (groupes.length === 0) {
    return (
      <div className="duree__bloc">
        <h3 className="duree__titre">{titre}</h3>
        <p className="duree__note">
          Aucun groupe n’atteint {MINIMUM_GROUPE} offres observées — pas assez pour une
          médiane qui veuille dire quelque chose.
        </p>
      </div>
    );
  }

  return (
    <div className="duree__bloc">
      <h3 className="duree__titre">{titre}</h3>
      <ul className="duree__liste">
        {groupes.map((g) => (
          <li key={g.nom} className="duree__ligne">
            <span className="duree__nom">{libelle ? libelle(g.nom) : g.nom}</span>
            <span className="duree__valeur">{mediane(g)}</span>
            {/* L'effectif à côté du chiffre, toujours : une médiane sur huit offres et une
                médiane sur deux cents ne se lisent pas pareil, et rien d'autre à l'écran ne
                permet de les distinguer. */}
            <span className="duree__n">
              {g.fermees}/{g.total} fermées
            </span>
          </li>
        ))}
      </ul>
      {ecartes > 0 ? (
        <p className="duree__note">
          {ecartes} groupe{ecartes > 1 ? "s" : ""} écarté{ecartes > 1 ? "s" : ""} : moins de{" "}
          {MINIMUM_GROUPE} offres observées.
        </p>
      ) : null}
    </div>
  );
}

export function DureeVieVue({ rapport }: { rapport: RapportDureeVie }) {
  const { ensemble } = rapport;

  if (ensemble.total === 0) {
    return (
      <section className="duree" aria-labelledby="duree-titre">
        <h2 id="duree-titre" className="cadre-section__titre">
          Vitesse du marché
        </h2>
        <p className="duree__note">
          Aucune offre n’a encore été vue par deux passes de veille : il n’y a rien à
          mesurer. Ce n’est pas un marché immobile, c’est une observation qui commence.
        </p>
      </section>
    );
  }

  return (
    <section className="duree" aria-labelledby="duree-titre">
      <h2 id="duree-titre" className="cadre-section__titre">
        Vitesse du marché
      </h2>

      <p className="duree__phare">
        {ensemble.medianeJours === null ? (
          <>
            Plus de la <strong>moitié</strong> des offres suivies sont encore en ligne : pas
            encore de médiane.
          </>
        ) : (
          <>
            La moitié des offres disparaît en{" "}
            <strong className="duree__phare-n">{mediane(ensemble)}</strong>
          </>
        )}
      </p>

      {/* ⚠️ LA PHRASE QUI TIENT TOUT LE RESTE. Sans elle, le chiffre ci-dessus se lit comme
          la durée de vie d'une annonce ; il ne mesure que la partie qu'on a VUE. */}
      <p className="duree__note">
        Mesuré à partir du jour où la veille a repéré l’offre — pas de sa publication, qu’on
        ne connaît pas. Les durées sont donc des minimums. {ensemble.fermees} offres fermées
        observées sur {ensemble.total} suivies ; celles encore en ligne comptent aussi, sans
        être traitées comme fermées.
        {rapport.horsVeille > 0 ? (
          <>
            {" "}
            {rapport.horsVeille} offre{rapport.horsVeille > 1 ? "s" : ""} du suivi
            {rapport.horsVeille > 1 ? " sont" : " est"} hors de cette mesure : aucun balayage
            ne {rapport.horsVeille > 1 ? "les" : "l’"}a vue{rapport.horsVeille > 1 ? "s" : ""}
            .
          </>
        ) : null}
      </p>

      <Tableau
        titre="Par type de poste"
        groupes={rapport.parCategorie}
        ecartes={rapport.ecartes.categories}
        libelle={(nom) => CATEGORIE_LIBELLES[nom as Categorie] ?? nom}
      />
      <Tableau
        titre="Par employeur"
        groupes={rapport.parEmployeur}
        ecartes={rapport.ecartes.employeurs}
      />
    </section>
  );
}
