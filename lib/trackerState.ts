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
import { assurerMigrations } from "./migrations";
import { resumer } from "./suivi";
import { aujourdhui } from "./ajout";
import type { ResumeSuivi } from "./types";

export async function getTrackerState(): Promise<ResumeSuivi | null> {
  // Pas de base configurée : l'app tourne, l'intégration n'a rien à dire. Pas une erreur.
  if (!process.env.DATABASE_URL) return null;

  // ⚠️ AVANT DE LIRE, GARANTIR LE SCHÉMA — comme `lireOffres`, et pour la même raison.
  //
  // C'était le seul chemin de lecture qui ne le faisait pas, et rien ne le signalait :
  // les colonnes qu'il sélectionne datent toutes de la première migration, donc ça
  // marchait par CHANCE. Deux conséquences, l'une déjà réelle, l'autre en embuscade.
  //
  // Réelle : sur une base neuve, une instance froide dont la PREMIÈRE requête est le
  // sondage du hub lève « table offers absente » — le hub afficherait une PANNE là où la
  // réponse honnête est « en construction » (§6 bis : `null` = pas branché, `throw` =
  // panne ; les confondre est exactement ce que le garde-fou n°3 interdit).
  //
  // En embuscade : le jour où l'on publiera une métrique portée par une colonne récente,
  // la lecture échouerait sur les instances créées par un sondage du hub et réussirait
  // sur celles créées par une visite de Marc. Un défaut qui dépend de QUI a réveillé
  // l'instance ne se reproduit pas, donc ne se corrige pas.
  //
  // Sûr : la fonction ne lève jamais, ne fait rien quand tout est à jour, et n'applique
  // que les fichiers du dépôt déployé — l'appelant ne choisit rien.
  await assurerMigrations();

  const lignes = await db
    .select({
      histo: offers.histo,
      score: offers.score,
      statut: offers.statut,
      entreprise: offers.entreprise,
      poste: offers.poste,
      perimeeLe: offers.perimeeLe,
      dateReperage: offers.dateReperage,
    })
    .from(offers);

  // Base branchée mais vide : le suivi n'a pas encore été importé. « En construction »
  // reste la réponse honnête — publier « 0 offre suivie » affirmerait quelque chose de faux.
  if (lignes.length === 0) return null;

  // `Date` en base, chaîne ISO côté application — même conversion que `lireOffres`.
  // Le résumé ne teste que la nullité, mais laisser deux représentations coexister
  // finirait par produire une comparaison qui échoue silencieusement.
  // La date est calculée DANS le fuseau de Marc, pas en UTC : sinon, passé 20 h locale,
  // « aujourd'hui » serait déjà demain et la fenêtre des nouveautés glisserait d'un jour.
  return resumer(
    lignes.map((l) => ({ ...l, perimeeLe: l.perimeeLe ? l.perimeeLe.toISOString() : null })),
    aujourdhui(new Date()),
  );
}
