// lib/trackerState.ts — LE point de bascule « no fake data ».
//
// C'est le seul endroit qui décide si JobAI a quelque chose de RÉEL à publier au hub.
// Trois issues, et une seule sémantique par issue :
//
//   null   → le moteur n'est pas branché (pas de base configurée, ou base encore vide).
//            Le hub affichera « en construction ». Ce n'est PAS une erreur.
//   objet  → des données réelles existent. Le hub affichera « ok ».
//   throw  → panne réelle (base injoignable, requête en échec). L'appelant doit le dire,
//            jamais le convertir en zéro ni en « en construction ».
//
// La confusion entre ces trois cas est exactement ce que le garde-fou n°3 interdit : un
// compteur à zéro se lit « recherche à l'arrêt », une absence se lit « pas encore branché »,
// et une panne se lit « quelque chose ne va pas ». Les trois messages sont différents.
//
// RÈGLE DE MAINTENANCE (CLAUDE.md §6 bis) : à chaque phase qui rend une métrique réellement
// disponible, on la branche ICI. Tant que rien n'est disponible, on renvoie null — jamais
// un chiffre fabriqué pour faire joli sur le tableau de bord.

import { db } from "./db";
import { offers } from "./db/schema";
import { resumer } from "./suivi";
import type { ResumeSuivi } from "./types";

export async function getTrackerState(): Promise<ResumeSuivi | null> {
  // Pas de base configurée : l'app tourne, l'intégration n'a rien à dire. Pas une erreur.
  if (!process.env.DATABASE_URL) return null;

  const lignes = await db
    .select({
      histo: offers.histo,
      score: offers.score,
      statut: offers.statut,
      entreprise: offers.entreprise,
      poste: offers.poste,
    })
    .from(offers);

  // Base branchée mais vide : le suivi n'a pas encore été importé. « En construction »
  // reste la réponse honnête — publier « 0 offre suivie » affirmerait quelque chose de faux.
  if (lignes.length === 0) return null;

  return resumer(lignes);
}
