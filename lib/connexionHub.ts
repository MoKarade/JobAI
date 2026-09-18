// lib/connexionHub.ts — où envoyer quelqu'un qui n'a pas de session.
//
// ── CE QUI A CHANGÉ, ET POURQUOI ────────────────────────────────────────────────────
//
// JobAI ne parle plus à Google (ADR 0001 de Hubperso). Elle ne fabrique plus de session :
// elle LIT celle que le hub a posée sur `.hubperso.com`. Quand il n'y en a pas, elle
// n'affiche donc plus de bouton « Se connecter avec Google » — elle renvoie au hub, qui
// est devenu la porte d'entrée unique de l'écosystème.
//
// Le gain n'est pas cosmétique : le `client_secret` Google n'existe plus dans cet
// environnement. Une copie de moins à faire tourner le jour d'un incident, et une app de
// moins qui peut casser sa propre authentification.

/** Le hub. Surchargeable pour un déploiement de test, jamais écrit en dur ailleurs. */
export const URL_HUB = process.env.NEXT_PUBLIC_HUB_URL?.trim() || "https://hubperso.com";

/**
 * Le chemin interne demandé, ou `/` si on ne peut pas lui faire confiance.
 *
 * ⚠️ On n'accepte QUE des chemins internes. Une URL absolue venue de l'extérieur ferait
 * de JobAI un tremplin : `?retour=https://evil.com` renverrait la personne sur un site
 * tiers APRÈS une connexion réussie, donc en confiance. Et `//evil.com` ressemble à un
 * chemin sans en être un — le navigateur y voit une autre origine.
 */
/**
 * Origine jetable qui sert de RÉFÉRENT au contrôle. `.invalid` est un domaine réservé par la
 * RFC 2606 : il ne résout nulle part, et rien n'est jamais requêté ici — on ne fait que
 * demander à l'analyseur d'URL où MÈNERAIT ce chemin.
 */
const ORIGINE_TEMOIN = "https://temoin.invalid";

export function cheminInterne(retour: string | null | undefined): string {
  const valeur = retour?.trim();
  if (!valeur) return "/";
  if (!valeur.startsWith("/")) return "/";

  // ⚠️ ON NORMALISE AVANT DE JUGER, ET C'EST LE CORRECTIF (`[REDIR-01]`, 2026-09-18).
  //
  // La version précédente refusait `//evil.com` par comparaison de TEXTE. Or l'analyseur
  // d'URL (norme WHATWG) traduit l'antislash en barre oblique pour les schémas spéciaux :
  // `/\evil.com` et `/\/evil.com` passaient donc la garde textuelle intacts, PUIS
  // devenaient `//evil.com` au moment où l'appelant construisait l'URL. Mesuré : le
  // `callbackUrl` produit avait pour origine `https://evil.com`.
  //
  // Demander à l'analyseur lui-même « où ça mène ? » ferme la CLASSE au lieu d'ajouter une
  // troisième forme à une liste qui en oubliera une quatrième. C'est la règle §9 n°128 —
  // un contrôle de sécurité se juge sur ce que la plateforme FAIT, pas sur ce que la chaîne
  // a l'air d'être.
  try {
    if (new URL(valeur, ORIGINE_TEMOIN).origin !== ORIGINE_TEMOIN) return "/";
  } catch {
    // Un chemin que l'analyseur refuse est un chemin qu'on ne sait pas juger : on refuse.
    return "/";
  }

  // La valeur part TELLE QUELLE, pas normalisée : le contrôle répond « interne ou pas », il
  // ne réécrit pas la demande. L'appelant compose ensuite avec l'origine RÉELLE, et cette
  // composition ne peut plus changer d'origine — c'est ce qu'on vient de vérifier.
  return valeur;
}

/**
 * L'URL de connexion du hub, avec de quoi revenir ici ensuite.
 *
 * `origine` est l'origine de CETTE app, telle que la requête l'a vue — pas une constante :
 * JobAI répond aussi bien sur son domaine que sur une préversion Vercel, et coder l'un
 * empêcherait l'autre de fonctionner.
 *
 * ⚠️ CE COMMENTAIRE A AFFIRMÉ UN SECOND VERROU QUI N'EXISTE PAS, jusqu'au 2026-09-18. Il
 * disait : « le hub valide cette destination de son côté (`lib/retour.ts`) : il n'accepte que
 * les sous-domaines de `hubperso.com` ». **Il n'y a aucun `lib/retour.ts` dans Hubperso**
 * (vérifié sur `b401f6a`) : `app/login/page.tsx` passe `callbackUrl` directement à
 * `signIn("google", { redirectTo: … })`. Une promesse de verrou n'est pas un verrou — et
 * celle-ci rendait la garde ci-dessus moins relue qu'elle n'aurait dû l'être.
 *
 * Ce qui reste VRAI : Auth.js applique par défaut un `redirect` qui refuse une origine
 * étrangère, et le hub ne le surcharge pas. Mais ce filet appartient à une dépendance du hub,
 * il n'a jamais été exercé ici, et la sécurité de JobAI ne peut pas reposer dessus. La garde
 * de `cheminInterne` est donc le verrou, pas un doublon de courtoisie.
 */
export function urlConnexionHub(origine: string, retour: string | null | undefined): string {
  const url = new URL("/login", URL_HUB);
  url.searchParams.set("callbackUrl", new URL(cheminInterne(retour), origine).toString());
  return url.toString();
}
