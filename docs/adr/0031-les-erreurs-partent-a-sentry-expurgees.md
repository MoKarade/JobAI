# ADR-0031 — Les erreurs partent à Sentry, expurgées, et seulement si un DSN est posé

**Date** : 2026-10-16 · **Statut** : Proposé — tâche JobAI#117 (plan de standardisation du 15/10/2026, décision 11 ;
même base que app-template#40). Aucun coût IA.

## Contexte

Les erreurs de production ne remontaient nulle part. JobAI est pourtant le dépôt le plus sensible de l'écosystème : il
porte le domicile de Marc, son statut migratoire et des noms de tiers (garde-fou n°1), et le message d'une erreur de base
ou de réseau peut en contenir un morceau. Décision de Marc du 15/10/2026 : aucune donnée personnelle en ligne.

## Décision

`@sentry/nextjs` est branché comme dans app-template (`instrumentation.ts` côté serveur, `instrumentation-client.ts`
dans le navigateur, `app/global-error.tsx` et `app/error.tsx` pour le rendu), avec les mêmes réglages posés en UN seul
endroit, `lib/sentryConfig.ts` (pur) :

- **Éteint sans `SENTRY_DSN`** : aucun événement ne part, l'app démarre et se construit comme avant. Poser la variable
  dans Vercel est un geste de Marc (« on laisse » pour l'instant) ; tant qu'elle manque, la production n'envoie rien.
- `sendDefaultPii` faux, pas de traces de performance, **pas de fil d'Ariane** (il garderait les URL et la console).
- Avant l'envoi (`beforeSend`) : requête (corps, cookies, en-têtes, chaîne de requête), utilisateur, `extra` et nom de
  machine retirés ; l'adresse de la page perd sa chaîne de requête et son ancre ; tout texte libre (message, valeur
  d'exception) est expurgé — courriel, adresse web (une chaîne de connexion à la base comprise), téléphone, code postal,
  longue suite de chiffres — puis tronqué à 300 caractères. On garde le type d'erreur, la pile et le chemin.
- La CSP (encore en rapport seul) autorise `https://*.sentry.io` en `connect-src`, sinon le navigateur ne pourrait pas
  livrer.

## Ce que cela ne fait pas

- Pas de source maps téléversées, pas de traces de performance, pas de rejeu de session.
- L'expurgation est faite à la main sur des formes connues : un nom propre dans un message d'erreur n'est pas reconnu.
  Le réglage Sentry « ne pas stocker les adresses IP » est un réglage du projet Sentry [À vérifier côté Sentry].

## Méthode de test

`tests/sentryConfig.test.ts` : éteint sans DSN, expurgation de chaque forme, troncature, requête et utilisateur retirés,
aucune réactivation de `sendDefaultPii`, serveur et navigateur passent par `optionsSentry`, CSP.

## Conséquences

- Positif : les erreurs de production deviennent visibles sans qu'une donnée personnelle ne quitte l'app.
- Négatif : un SDK de plus (poids du paquet navigateur).
- Risque accepté : un message d'erreur qui contiendrait une donnée perso d'une forme non prévue.

## Alternatives rejetées

- Envoyer les messages tels quels, comme le modèle : trop risqué pour ce dépôt.
- N'envoyer ni message ni valeur d'exception : on perdrait la cause, donc l'intérêt de l'outil.
