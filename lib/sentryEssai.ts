// lib/sentryEssai.ts — pièces pures de l'essai Sentry (JobAI#117), sans réseau ni environnement.
//
// L'essai envoie UNE erreur volontaire à Sentry par son API d'enveloppes, sans le SDK : le DSN n'est
// pas un secret (il est écrit dans les scripts client de la production), donc ni secret de dépôt
// ni dépendance de plus. Le nettoyage (`retirerDonneesPersonnelles` de `lib/sentryConfig.ts`) est
// passé en paramètre par le script : ce fichier n'importe rien, car Node lit le .ts tel quel.
// Verrou : `tests/sentryEssai.test.ts`.

/** Nettoyeur d'événement : celui de l'app, `retirerDonneesPersonnelles`. */
export type Nettoyeur = (evenement: Record<string, unknown>) => Record<string, unknown>;

/** Forme d'un DSN : https://<clé>@<hôte>/<projet>. */
const MOTIF_DSN = /https:\/\/([a-f0-9]+)@([a-z0-9.-]+\.sentry\.io)\/(\d+)/;

export interface DsnLu {
  cle: string;
  hote: string;
  projet: string;
}

/** Premier DSN trouvé dans une suite de textes (scripts client d'une page), ou null. */
export function trouverDsn(textes: readonly string[]): DsnLu | null {
  for (const texte of textes) {
    const m = MOTIF_DSN.exec(texte);
    const [, cle, hote, projet] = m ?? [];
    if (cle && hote && projet) return { cle, hote, projet };
  }
  return null;
}

/** Lit un DSN donné tel quel (variable d'environnement) ; null s'il n'a pas la bonne forme. */
export function lireDsn(dsn: string): DsnLu | null {
  return trouverDsn([dsn.trim()]);
}

/** Adresse de dépôt des enveloppes ; la clé publique passe en paramètre, jamais affichée. */
export function urlEnveloppe(dsn: DsnLu): string {
  return `https://${dsn.hote}/api/${dsn.projet}/envelope/?sentry_version=7&sentry_client=jobai-essai%2F1&sentry_key=${dsn.cle}`;
}

/** Même adresse sans la clé : seule forme à écrire dans un journal. */
export function urlSansCle(dsn: DsnLu): string {
  return `https://${dsn.hote}/api/${dsn.projet}/envelope/`;
}

/** Enveloppe Sentry (trois lignes JSON) portant une erreur d'essai nettoyée. */
export function construireEnveloppe(identifiant: string, maintenant: Date, nettoyer: Nettoyeur): string {
  const evenement = nettoyer({
    event_id: identifiant,
    timestamp: maintenant.getTime() / 1000,
    platform: "node",
    level: "error",
    environment: "essai",
    exception: {
      values: [
        {
          type: "Error",
          value: "Erreur d'essai volontaire (JobAI#117, workflow « Essai Sentry ») : aucune panne réelle.",
        },
      ],
    },
  });
  return [
    JSON.stringify({ event_id: identifiant, sent_at: maintenant.toISOString() }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(evenement),
  ].join("\n");
}
