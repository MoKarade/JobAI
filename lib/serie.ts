// lib/serie.ts — faire passer des appels asynchrones UN À LA FOIS, dans l'ordre d'arrivée. Pur, sans dépendance.
//
// ⚠️ POURQUOI : le compteur de coût des appels de modèle se met à jour par lecture-modification-écriture, non atomique
// (`lib/coutLlmStore.ts`). Tant que le seul site d'appel était l'analyse d'un CV, deux écritures simultanées étaient
// impossibles. Une lecture en lot (JobAI#109) lance plusieurs appels de front : sans file, deux relevés qui finissent
// ensemble se liraient avant de s'écrire et un appel facturé disparaîtrait du cumul, en silence.

/**
 * Enveloppe `f` pour que ses appels s'exécutent en file. Un échec n'arrête pas la file : il revient à SON appelant, les
 * suivants passent.
 */
export function enFileSerie<A extends unknown[]>(f: (...args: A) => Promise<void>): (...args: A) => Promise<void> {
  let fin: Promise<void> = Promise.resolve();
  return (...args: A) => {
    const cet = fin.then(() => f(...args));
    // La file avance même si cet appel échoue ; l'échec, lui, est rendu à l'appelant par `cet`.
    fin = cet.catch(() => undefined);
    return cet;
  };
}

/**
 * Applique `f` à chaque élément, `n` à la fois, et rend les résultats DANS L'ORDRE des éléments. `f` ne doit pas lever (un
 * échec se rend comme une valeur) : une exception interrompt le lot, ce qui est voulu pour une erreur de programmation.
 */
export async function parLots<T, R>(elements: readonly T[], n: number, f: (e: T) => Promise<R>): Promise<R[]> {
  const sortie: R[] = new Array<R>(elements.length);
  let suivant = 0;
  const ouvrier = async (): Promise<void> => {
    for (;;) {
      const i = suivant++;
      if (i >= elements.length) return;
      sortie[i] = await f(elements[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, elements.length)) }, ouvrier));
  return sortie;
}
