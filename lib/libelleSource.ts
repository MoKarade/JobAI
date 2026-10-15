// lib/libelleSource.ts — noms de sources lisibles pour le rapport de veille.
//
// L'identifiant technique (« guichet-flux ») ne dit rien à Marc : on affiche le nom que
// connaît le public. Un identifiant inconnu reste tel quel (jamais un nom inventé).

const NOMS: Readonly<Record<string, string>> = {
  "guichet-flux": "Guichet-Emplois",
};

export function nomSource(id: string): string {
  return NOMS[id] ?? id;
}

/** Phrase simple pour les sources en échec : jamais le message technique brut. */
export function phraseEchecSources(ids: readonly string[]): string {
  const noms = ids.map(nomSource);
  if (noms.length === 0) return "";
  if (noms.length === 1) return `${noms[0]} n’a pas répondu à cette passe.`;
  return `${noms.join(", ")} n’ont pas répondu à cette passe.`;
}
