// lib/hubToken.ts
// Vérifie le header x-hub-token du hub en temps constant (via digests de longueur fixe :
// timingSafeEqual exige des buffers de même taille — la longueur du secret ne fuite pas).
//
// LES DEUX CÔTÉS SONT NETTOYÉS DES ESPACES DE BORD, et c'est nécessaire, pas cosmétique :
// le hub applique déjà `.trim()` à son jeton (`Hubperso/lib/sources.ts`). Sans le même
// traitement ici, un espace ou un retour à la ligne collé par erreur dans une variable
// d'environnement produit un 401 permanent, avec deux valeurs qui paraissent IDENTIQUES à
// l'écran. C'est un piège coûteux : le symptôme accuse le jeton, la cause est un caractère
// invisible.
//
// Ce n'est pas un assouplissement de la comparaison : un jeton reste comparé en entier et
// en temps constant. On retire seulement ce qu'aucune interface ne montre.

import { createHash, timingSafeEqual } from "node:crypto";

export function hubTokenValid(provided: string | null, expected: string): boolean {
  const recu = provided?.trim() ?? "";
  const attendu = expected.trim();
  // Échec fermé : un jeton attendu vide n'autorise rien, même face à un envoi vide.
  if (!recu || !attendu) return false;

  const a = createHash("sha256").update(recu).digest();
  const b = createHash("sha256").update(attendu).digest();
  return timingSafeEqual(a, b);
}
