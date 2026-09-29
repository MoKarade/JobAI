## 7. Intégration hub

JobAI expose **un seul** endpoint au hub : `GET /api/hub/summary`, contrat
`@mokarade/hub-contract` — **pinné sur le tag `v1.3.0`** depuis le 14/09/2026 (il l'était par
SHA, voir ADR-0001 ; le tag reste un point immuable, le lockfile fige le commit).

⚠️ **Re-pinner N'EST PAS optionnel pour consommer un champ neuf.** Zod STRIPPE les clés
inconnues : sur un pin antérieur, `validateSummary` retire `dataAsOf`, `expectedMaxAgeSec`,
`details` et `primary` **en silence** — et les tests passent en n'affirmant plus rien sur eux.
Un test vert sur un champ retiré est exactement le genre de vert dont on prend l'habitude.

- **Identité publiée** : `id: "jobai"`, `name: "JobAI"`, `url: "https://emploi.hubperso.com"`,
  `color: "#f2a31b"`. L'`id` doit rester identique à l'entrée de `Hubperso/lib/sources.ts`.
- **Auth** : header `x-hub-token`, comparaison en temps constant (SHA-256 + `timingSafeEqual`).
  `HUB_TOKEN` absent → **503** ; jeton absent/faux → **401** ; méthode ≠ GET → **405**.
  Réponse toujours `Cache-Control: no-store`.
- **La route hub est hors du middleware d'auth utilisateur** : elle porte sa propre
  authentification. L'ajouter au matcher renverrait une redirection HTML au hub, qui
  afficherait « injoignable » en permanence.
- **`HUB_TOKEN` sert dans LES DEUX SENS.** Entrant : le hub le présente pour lire le summary
  (ci-dessus). **Sortant** : JobAI le présente au hub sur `POST /api/acces` (`lib/accesHub.ts`)
  pour demander « cette personne a-t-elle le droit d'entrer ici ? ». C'est ce jeton qui
  IDENTIFIE JobAI côté hub, donc aucun `appId` n'est envoyé dans le corps. Sans lui, aucun
  invité n'entre (échec fermé) — seul le propriétaire passe, parce qu'il est vérifié avant,
  et sans réseau.
- **`NEXT_PUBLIC_HUB_URL` n'est pas décoratif.** `lib/connexionHub.ts` en tire `URL_HUB`, qui
  sert à la fois à la redirection de connexion ET de destination à `POST /api/acces`. La
  pointer ailleurs « pour tester » coupe l'accès de tout le monde sauf le propriétaire,
  silencieusement (échec fermé → `false`).
- **Honnêteté** : `status:"building"` tant qu'aucune donnée réelle n'est en base. Le point de
  bascule unique est `getTrackerState()` — `null` = pas encore branché, `throw` = panne.
  **Règle de maintenance** : chaque phase qui rend une métrique réellement disponible la
  branche ici et fait passer le statut à `ok`. Jamais de chiffre fabriqué.
- Le bloc `usage` (coût LLM) n'est publié que **mesuré**, jamais estimé — et **pas du tout**
  tant qu'aucun appel n'a eu lieu (`amount: 0` affirmerait « JobAI ne coûte rien »). Un seul
  site d'appel dans le dépôt : `lib/cv/extraction.ts`, qui comptabilise lui-même (deux
  appelants ; laisser chacun y penser serait « un outil qu'on peut oublier d'appeler »). Les
  prix, le cumul et la règle de publication sont PURS (`lib/coutLlm.ts`), la lecture/écriture
  du compteur est impure (`lib/coutLlmStore.ts`), et le bloc se compose en UN exemplaire
  (`blocUsage`) pour les deux consommateurs — summary complet et summary « en construction ».
  Période `total`, devise `USD` : le hub somme par période et convertit lui-même.
- **La FRAÎCHEUR se lit sur la fin d'une passe RÉUSSIE, jamais sur son début.**
  `lib/fraicheurVeille.ts` publie `dataAsOf` depuis `CLE_RAPPORT`, écrit à la fin d'une passe
  complète. Deux sources plus évidentes ont été écartées, et il ne faut pas y revenir :
  `sync_state["veille-auto"].majLe` est le jeton de RÉSERVATION, posé AVANT le travail — une
  passe qui démarre puis échoue l'avance quand même, donc le hub annoncerait une fraîcheur que
  personne n'a produite ; `CLE_HISTORIQUE` a son propre try/catch et peut rester en arrière
  d'une passe réussie. Sans `dataAsOf`, JobAI ne publiait AUCUNE fraîcheur : c'est la panne du
  12-14 août 2026, où le cron est resté muet trois jours pendant que les compteurs de la veille
  s'affichaient, inchangés, avec l'aplomb d'une mesure.
- **`dataAsOf` et `expectedMaxAgeSec` se publient ENSEMBLE ou pas du tout** (`blocFraicheur`,
  un seul objet pour qu'on n'en publie pas un par distraction). Le contrat v1.3 rejette un âge
  attendu sans horodatage à comparer : un seuil orphelin donnerait la certitude d'être
  surveillé alors que rien ne le serait. Le seuil vaut la **cadence du cron plus une marge**
  (24 h + 6 h) — pas un chiffre choisi : à la cadence nue, le moindre décalage du
  planificateur Vercel crierait « figée » chaque jour, et une alerte permanente n'est plus une
  alerte. `tests/fraicheurVeille.test.ts` lit `vercel.json` et refuse la divergence.
- **Le bloc `details` ne porte que des NOMBRES** (garde-fou n°1, dépôt PUBLIC) : la dernière
  passe (vues, retenues, périmées, revenues, inexpliquées) et l'entonnoir de candidature. Le
  rapport de passe contient, lui, l'employeur et le poste de la meilleure offre — il n'est
  **jamais republié tel quel**, `lireVeillePubliee` en extrait champ par champ, et un test
  échoue si on le recopie.

