// lib/sentryConfig.ts — réglages Sentry communs au serveur et au navigateur (JobAI#117).
//
// Pur et sans effet de bord : ne lit aucun environnement, ne démarre rien. Le DSN arrive en
// paramètre, et SANS DSN Sentry reste éteint (l'app démarre et se construit sans erreur).
//
// ⚠️ DONNÉE PERSONNELLE. JobAI porte le domicile de Marc, son statut migratoire et des noms de
// tiers (garde-fou n°1), et le message d'une erreur de base ou de réseau peut en contenir un
// morceau. Décision de Marc du 15/10/2026 : aucune donnée perso en ligne. Donc, en plus de ce
// que fait le modèle `app-template` (requête, cookies, en-têtes, utilisateur) :
//   - pas de fil d'Ariane (`maxBreadcrumbs: 0`) : il garderait les URL et les journaux de console ;
//   - pas de `extra`, pas de nom de machine ;
//   - l'adresse de la page perd sa chaîne de requête et son ancre ;
//   - tout texte libre (message, valeur d'exception) est expurgé (courriel, adresse web, numéro
//     de téléphone, code postal, longue suite de chiffres) puis tronqué à 300 caractères.
// On garde le type d'erreur, la pile et le chemin : c'est ce qui sert à réparer.
// Verrou : `tests/sentryConfig.test.ts`.

/** Le sous-ensemble d'un événement Sentry que l'on nettoie (types structurels, aucun import). */
export interface EvenementNettoyable {
  message?: string;
  logentry?: { message?: string };
  exception?: { values?: Array<{ value?: string }> };
  request?: {
    url?: string;
    data?: unknown;
    cookies?: unknown;
    headers?: unknown;
    query_string?: unknown;
  };
  user?: unknown;
  extra?: unknown;
  breadcrumbs?: unknown;
  server_name?: unknown;
}

/** Longueur maximale d'un texte libre envoyé à Sentry. */
const LONGUEUR_MAX = 300;

/** Formes de données personnelles retirées d'un texte libre, du plus large au plus étroit. */
const MOTIFS: ReadonlyArray<readonly [RegExp, string]> = [
  // Adresse web (une chaîne de connexion à la base y passe aussi, mot de passe compris).
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi, "[adresse retirée]"],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[courriel retiré]"],
  [/\+?\d[\d\s().-]{7,}\d/g, "[numéro retiré]"],
  [/\b[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d\b/g, "[code postal retiré]"],
  [/\d{6,}/g, "[nombre retiré]"],
];

/** Expurge un texte libre et le tronque. */
export function expurgerTexte(texte: string): string {
  let sortie = texte;
  for (const [motif, remplacement] of MOTIFS) sortie = sortie.replace(motif, remplacement);
  return sortie.length > LONGUEUR_MAX ? `${sortie.slice(0, LONGUEUR_MAX)}…` : sortie;
}

/** Retire tout ce qui peut identifier une personne ; garde le type, la pile et le chemin. */
export function retirerDonneesPersonnelles<T extends EvenementNettoyable>(evenement: T): T {
  if (evenement.request) {
    delete evenement.request.data;
    delete evenement.request.cookies;
    delete evenement.request.headers;
    delete evenement.request.query_string;
    if (typeof evenement.request.url === "string") {
      evenement.request.url = evenement.request.url.split(/[?#]/)[0];
    }
  }
  delete evenement.user;
  delete evenement.extra;
  delete evenement.breadcrumbs;
  delete evenement.server_name;

  if (typeof evenement.message === "string") evenement.message = expurgerTexte(evenement.message);
  if (typeof evenement.logentry?.message === "string") {
    evenement.logentry.message = expurgerTexte(evenement.logentry.message);
  }
  for (const exception of evenement.exception?.values ?? []) {
    if (typeof exception.value === "string") exception.value = expurgerTexte(exception.value);
  }
  return evenement;
}

export interface OptionsSentry {
  dsn: string | undefined;
  enabled: boolean;
  sendDefaultPii: false;
  tracesSampleRate: 0;
  maxBreadcrumbs: 0;
  beforeSend: typeof retirerDonneesPersonnelles;
}

/**
 * Options de `Sentry.init`. `dsn` vide ou absent = éteint : aucun événement ne part.
 * Pas de traces de performance (`tracesSampleRate` à 0) : le besoin est de voir les ERREURS.
 */
export function optionsSentry(dsn: string | undefined): OptionsSentry {
  const propre = dsn?.trim() ? dsn.trim() : undefined;
  return {
    dsn: propre,
    enabled: propre !== undefined,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    beforeSend: retirerDonneesPersonnelles,
  };
}
