// components/Icone.tsx — les pictogrammes des faits mesurés.
//
// Demande de Marc (2026-08-06) : « beaucoup moins de texte, pas des phrases complètes,
// mais reste compréhensible » et « une icône pour dire borne élec ou distance ou distance
// à pied ».
//
// ⚠️ UNE ICÔNE NE REMPLACE DU TEXTE QUE SI ELLE EN PORTE LE SENS AILLEURS.
// « 11 km » à côté d'un pictogramme de voiture se lit d'un coup d'œil — à condition de
// voir le pictogramme. Au lecteur d'écran, une icône décorative ne dit rien : « 11 km »
// devient une mesure sans objet, et « 3 min » à côté est indistinguable. Chaque icône
// porte donc un `title` (infobulle au survol) ET un texte hors écran qui la nomme.
// C'est ce qui permet de couper la phrase sans couper l'information.
//
// Dessinées à la main plutôt qu'importées : quatre traits chacune, elles suivent
// `currentColor` — donc la couleur du texte, où qu'elles soient posées, sans fichier à charger
// ni bibliothèque à tenir à jour.

type Genre = "route" | "marche" | "borne" | "lieu";

/**
 * Les pictogrammes de la BARRE DE NAVIGATION (refonte téléphone, 2026-09-13).
 *
 * ⚠️ ILS NE REMPLACENT PAS LE LIBELLÉ, ILS L'ACCOMPAGNENT. Une barre d'onglets en icônes
 * seules oblige à apprendre un vocabulaire ; sur une app qu'on ouvre une fois par jour,
 * personne ne l'apprend. Le libellé reste sous l'icône — c'est l'icône qui rend la cible
 * repérable d'un coup d'œil, pas qui porte le sens.
 *
 * Ils vivent ICI et non dans la barre : c'est déjà le lieu des pictogrammes de l'app, et
 * deux jeux de traits dessinés dans deux fichiers finissent par ne plus se ressembler.
 */
const NAVIGATION = {
  // Des lignes empilées : la liste du suivi.
  suivi: ["M4 6h16", "M4 12h16", "M4 18h10"],
  // Une épingle : le plan.
  carte: ["M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z", "M12 10.5v.01"],
  // Trois points : le reste.
  plus: ["M6 12h.01", "M12 12h.01", "M18 12h.01"],
  // Un livre ouvert : les références.
  references: ["M4 5h6a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z", "M20 5h-6a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h6z"],
  // Une silhouette : le profil.
  profil: ["M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", "M5 20a7 7 0 0 1 14 0"],
  // Des ondes : les sources qui alimentent le suivi.
  sources: ["M5 19h.01", "M5 14a5 5 0 0 1 5 5", "M5 9a10 10 0 0 1 10 10", "M5 4a15 15 0 0 1 15 15"],
} as const;

export type GenreNav = keyof typeof NAVIGATION;

/** Le pictogramme d'un onglet. Décoratif : le libellé juste à côté nomme la destination. */
export function IconeNav({ genre }: { genre: GenreNav }) {
  return (
    <svg
      className="barre__icone"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {NAVIGATION[genre].map((trait) => (
        <path key={trait} d={trait} />
      ))}
    </svg>
  );
}

const CHEMINS: Record<Genre, { d: readonly string[]; nom: string }> = {
  // Une épingle de carte : la distance par la route.
  route: {
    d: ["M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z", "M12 10.5v.01"],
    nom: "distance par la route",
  },
  // Une silhouette qui marche : le temps à pied.
  marche: {
    d: ["M13 4.5v.01", "M11 21l2-6-2.5-2.5L9 16", "M10.5 8.5 14 10l2 3", "M10.5 8.5 8 11"],
    nom: "à pied",
  },
  // Un éclair : la borne de recharge.
  borne: {
    d: ["M13 3 5 14h6l-1 7 8-11h-6l1-7z"],
    nom: "borne de recharge",
  },
  // Un bâtiment : le lieu de l'entreprise.
  lieu: {
    d: ["M4 21V7l8-4 8 4v14", "M9 21v-5h6v5", "M9 11h.01", "M15 11h.01"],
    nom: "adresse",
  },
};

/**
 * Un pictogramme suivi de sa valeur.
 *
 * `children` porte la MESURE (« 11 km »), l'icône porte ce qu'on mesure. Les deux sont
 * indissociables : c'est pour ça qu'ils vivent dans le même composant plutôt que d'être
 * assemblés à la main à chaque endroit — un appel qui oublierait le nom accessible
 * fabriquerait une mesure anonyme.
 */
export function Fait({
  genre,
  children,
  discret = false,
}: {
  genre: Genre;
  children: React.ReactNode;
  /** Une mesure absente ou nulle recule visuellement, sans disparaître. */
  discret?: boolean;
}) {
  const { d, nom } = CHEMINS[genre];

  return (
    <span className={`fait${discret ? " fait--discret" : ""}`}>
      <svg
        className="fait__icone"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {d.map((trait) => (
          <path key={trait} d={trait} />
        ))}
      </svg>
      {/* Le nom de la mesure sort du rendu visuel SANS sortir de l'arbre d'accessibilité :
          à l'écran on lit « 11 km », au lecteur d'écran « distance par la route 11 km ». */}
      <span className="hors-ecran">{nom} </span>
      <span className="fait__valeur">{children}</span>
    </span>
  );
}
