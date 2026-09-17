// lib/jalons.ts — où est passé le budget d'une passe à étapes.
//
// POURQUOI CE MODULE EXISTE — `[DISTANCES-01]`, et une accusation sans preuve
//
// La passe de distances enchaîne neuf étapes sous un budget PARTAGÉ. L'une d'elles,
// `adressesDepuisRegistre`, n'est bornée par rien et l'assume dans son propre commentaire
// (aucun accès réseau, donc « elle comble TOUTES les adresses manquantes d'un coup »).
// L'argument tenait quand le registre était petit ; il grandit.
//
// ⚠️ LE DÉFAUT N'ÉTAIT PAS L'ÉTAPE, C'ÉTAIT L'ABSENCE DE MESURE. Une étape sans borne dans un
// budget partagé est invisible jusqu'au jour où elle le mange — et ce jour-là, le diagnostic
// se fait par déduction. Le 2026-09-17, j'ai écrit que Nominatim consommait ~17,5 s des 25 s
// partagés : c'était une DÉDUCTION à partir du reliquat, pas une mesure, et l'étape non bornée
// était juste à côté. Un `Date.now()` par étape rend la réponse certaine.
//
// PUR et sans dépendance : l'horloge est injectée, donc la mise en forme se teste sans
// attendre quoi que ce soit.

/** Ce qu'une étape a coûté. */
export interface Jalon {
  nom: string;
  ms: number;
}

export interface Chrono {
  /** Ferme l'étape courante sous ce nom et ouvre la suivante. */
  jalon: (nom: string) => void;
  /** La ligne de journal, prête à écrire. */
  ligne: () => string;
  /** Les mesures brutes, pour un test ou un appelant qui veut décider. */
  releve: () => Jalon[];
}

/**
 * Un chrono à jalons pour une passe à étapes.
 *
 * @param maintenant L'horloge, INJECTÉE. Sans elle, la mise en forme ne se testerait qu'en
 *                   attendant vraiment — et un test qui dort mesure la machine, pas le code.
 */
export function creerChrono(maintenant: () => number = () => Date.now()): Chrono {
  const jalons: Jalon[] = [];
  let dernier = maintenant();

  return {
    jalon(nom: string): void {
      const t = maintenant();
      jalons.push({ nom, ms: t - dernier });
      dernier = t;
    },
    releve: () => [...jalons],
    ligne(): string {
      // ⚠️ ORDRE CHRONOLOGIQUE, PAS TRIÉ PAR DURÉE. Ce qu'on cherche est l'étape qui mange le
      // reliquat de CELLES QUI LA SUIVENT — une relation d'ORDRE, que le tri par durée
      // détruit. Et les zéros restent affichés : « cette étape n'a rien eu à faire » et
      // « cette étape n'a pas été atteinte » ne se distinguent pas en faisant disparaître la
      // ligne, mais en la lisant à côté des comptes de la passe.
      const total = jalons.reduce((t, j) => t + j.ms, 0);
      const detail = jalons.map((j) => `${j.nom}:${j.ms}ms`).join(" ");
      // Une passe qui n'a franchi aucune étape le DIT, au lieu de rendre une ligne vide qui se
      // lirait comme une passe instantanée.
      return detail === ""
        ? "aucune étape franchie"
        : `${detail} (total ${total} ms)`;
    },
  };
}
