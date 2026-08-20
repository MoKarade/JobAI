# JobAI

Suivi de recherche d'emploi dans la région de Québec : offres notées selon un barème pondéré
par le profil, distance depuis le domicile, carte des lieux, statuts de candidature et suivi
des relances.

App de l'écosystème hub perso, aux côtés de FinanceAI, DriveAI, BatchChef et CarAI.
Destination : **`emploi.hubperso.com`**. Widget publié au hub via
[`@mokarade/hub-contract`](https://github.com/MoKarade/hub-contract).

> ⚠️ **Dépôt PUBLIC — donc aucune donnée personnelle, jamais.** Ce paragraphe a longtemps
> annoncé l'inverse (« dépôt privé, et ce n'est pas négociable ») alors que le dépôt est
> public depuis le premier jour. C'est la pire erreur qu'une doc puisse faire : annoncer un
> filet qui n'existe pas. Marc a tranché en connaissance de cause le 2026-08-14 — **il reste
> public**.
>
> Ce que ça change : les données de suivi contiennent l'adresse du domicile, le statut
> migratoire, l'historique de candidatures et des noms de personnes tierces. En privé, une
> PII commitée par erreur se rattrapait entre nous. En public, elle est **lisible du monde
> entier à la seconde du push**, et un commit correctif ne la retire pas — l'historique, les
> forks et les miroirs la gardent.
>
> `tests/piiGuard.test.ts` n'est donc pas une ceinture, c'est **le mur, et le seul**. Voir le
> garde-fou n°1 du [`CLAUDE.md`](./CLAUDE.md), qui est à jour.

## État

**En service, avec des données réelles.** Base Neon branchée, migrations appliquées
automatiquement au démarrage, interface livrée. Côté auth, JobAI n'émet plus de session :
elle **lit** celle que le hub pose sur `.hubperso.com` (`auth.ts`, `providers: []`), et
demande au hub qui a le droit d'entrer (`lib/accesHub.ts`). Le premier lot réel
de la veille est arrivé le 2026-07-31 (45 offres reçues, 40 ajoutées).

L'état courant fait foi dans **[`HANDOVER.md`](./HANDOVER.md)** — à lire en premier, il est
plus fin et plus à jour que ce README. Les tâches sont dans [`BACKLOG.md`](./BACKLOG.md),
les décisions dans [`docs/adr/`](./docs/adr/).

## Ce qui est branché aujourd'hui

- **Suivi des offres** — notation pondérée par le profil, statuts de candidature, filtres,
  export. Interface : accueil (`/`), fiche d'offre (`/offre/[id]`), carte (`/carte`),
  références (`/references`).
- **Veille** — `POST /api/ingest/depot` reçoit des lots d'offres (une Routine claude.ai
  envoie, l'app trie : filtre régional, plancher de score, dédoublonnage). Le cron
  `/api/cron/veille` applique les mêmes règles. ⏱️ **L'ordre des deux compte** : la Routine
  part à 11:00 UTC et met jusqu'à trois heures (mesuré le 2026-08-12 : 11:06 → 13:55, la
  lecture des annonces domine), puis le déploiement suit. Le cron est donc à **15:00 UTC**
  pour lire le dépôt du JOUR. Aux deux à 11:00, il lisait celui de la veille. Rien n'était
  perdu — `fichiersDansLaFenetre` couvre 7 jours — mais les offres arrivaient un jour tard. ⚠️ Les sources automatiques sont mortes
  (Guichet-Emplois 404, ATS américains sans employeur local, pas de flux chez Jobillico /
  Québec emploi / Isarta) — le dépôt est aujourd'hui le vrai chemin d'entrée.
- **Distance et carte** — domicile géocodé une fois et conservé en base, mesure automatique
  après réponse, bornée à une passe / 5 min. Deux crons de géocodage (`vercel.json`) :
  `/api/cron/veille` (15:00 UTC, ingestion + géocodage) et `/api/cron/geocodage` (03:00 UTC,
  géocodage seul — [CARTE-03], `BACKLOG.md`). Le plafond par passe (8 requêtes Nominatim,
  `MAX_VILLES_PAR_PASSE`) est une limite de SÉCURITÉ dérivée du mur de 60 s d'une fonction
  Vercel dans le pire cas — l'augmenter accélérerait le géocodage mais exigerait de
  re-dériver ce calcul ; le second cron double le débit sans y toucher. **Google Maps
  Geocoding** (ADR-0007) complète Nominatim et le registre du Québec en troisième repli,
  seulement pour ce que les deux premiers ratent — optionnel (`GOOGLE_MAPS_API_KEY`, voir
  `.env.example`), inactif sans clé posée.
- **Google Places** (ADR-0007, extension `[CARTE-03-PLACES]`), même clé optionnelle, deux
  usages : autocomplétion du nom d'entreprise à l'ajout d'une offre, et fiches enrichies
  (site, téléphone, horaires) pour les entreprises déjà résolues par Google Maps Geocoding.
- **Migrations automatiques** (`lib/migrations.ts`) — appliquées au démarrage, mémorisées par
  processus. Aucune commande à lancer à la main après un déploiement.
- **Endpoint hub** (`app/api/hub/summary/route.ts`) — jeton `x-hub-token` vérifié en temps
  constant, `Cache-Control: no-store`, summary honnêtement `building` tant qu'aucune donnée
  réelle n'existe.
- TypeScript strict, suite Vitest complète, summary validé contre le **vrai** schéma du
  contrat.

  *(Le nombre exact de tests était écrit ici — « 813 » — et se trompait de ~400 : il avait
  vieilli sans que rien ne le signale. Un compteur au présent dans une liste de
  caractéristiques rote à chaque PR. Le vrai chiffre se lit dans la CI, qui ne ment jamais ;
  s'il faut le citer, c'est dans un récit daté, pas dans une affirmation permanente.)*

### Ce que coûte l'app, et comment on le sait

Ce README a affirmé pendant des semaines qu'« il n'y a aucun appel LLM dans l'app », et en
tirait que l'absence de bloc `usage` au contrat du hub était honnête. **C'était faux depuis
le module CV** : `lib/cv/extraction.ts` appelle Anthropic (Haiku 4.5) pour lire un CV. Ce
n'était donc plus une absence, c'était un **trou** — le total affiché par le hub ignorait ce
que JobAI dépense.

C'est le seul appel de modèle du dépôt (`lib/cv/proposition.ts`, `lib/cv/renotation.ts` et la
notation des offres sont déterministes). Il est désormais compté au moment où il est facturé,
accumulé dans l'état, converti en dollars US et publié :

| | où |
|---|---|
| les prix, le cumul, la règle de publication (PUR) | `lib/coutLlm.ts` |
| lire et écrire le compteur | `lib/coutLlmStore.ts` |
| le bloc `usage` du summary | `lib/hubSummary.ts` (`blocUsage`) |

⚠️ **Tant qu'aucun appel n'a eu lieu, il n'y a PAS de bloc `usage` — surtout pas `amount: 0`.**
C'est le garde-fou n°3 appliqué à l'argent : « 0,00 $ » affirme que l'app ne coûte rien,
l'absence de bloc admet qu'on ne suit rien. La distinction est entre **zéro appel** (pas de
bloc) et **des appels dont le coût arrondi tombe à 0,00 $** (bloc présent, montant 0) — le
premier est une absence de mesure, le second est une mesure.

La période publiée est `total` (cumul depuis toujours), comme FinanceAI, BatchChef et DriveAI :
le hub somme **par période** et refuse de fusionner « cumulé » avec « ce mois-ci ». Une app qui
publierait `mois` se retrouverait seule dans sa colonne et casserait le total pour tout le
monde. La devise est `USD` — ce qu'Anthropic facture ; le hub convertit lui-même en CAD.

### Ce qui n'existe PAS encore

Pas d'analyse d'offre par IA, pas de rédaction de lettre : la notation reste un barème
déterministe.

Le suivi des relances (`lib/relances.ts`, seuils 14 j / 45 j) est **codé et testé mais pas
branché à l'interface** : la logique existe, rien ne l'affiche encore.

## Contrat d'échec du endpoint

| Situation | Réponse |
|---|---|
| `HUB_TOKEN` absent côté serveur | **503** — l'app marche, l'intégration n'est pas branchée |
| `x-hub-token` absent ou invalide | **401** — échec fermé |
| Méthode ≠ GET | **405** |
| Nominal | **200**, summary conforme au contrat, `no-store` |

⚠️ Cette route reste **hors du middleware d'authentification utilisateur** : elle porte sa
propre auth. L'y inclure renverrait au hub une redirection HTML au lieu du JSON, et le widget
afficherait « injoignable » en permanence.

## Développement

```bash
npm install
npm run dev        # http://localhost:3000
npm run test       # vitest
npm run typecheck  # tsc --noEmit
npm run build
npm run lint

# tester le endpoint hub en local
HUB_TOKEN=dev npm run dev
curl -s -H "x-hub-token: dev" http://localhost:3000/api/hub/summary
```

Avant chaque commit : `npm run typecheck && npm run test && npm run build && npm run lint`.

## Configuration

Voir [`.env.example`](./.env.example). Le jeton hub se génère avec :

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

La **même** valeur doit être posée dans `HUB_TOKEN` (côté JobAI) et `HUB_TOKEN_JOBAI`
(côté hub). L'app est déjà déclarée dans `lib/sources.ts` du dépôt Hubperso — c'est du **code**,
donc toute modification exige un redéploiement du hub, pas seulement une variable d'environnement.

### Version du contrat

`@mokarade/hub-contract` est épinglé sur un **SHA de commit**, pas sur un tag : le tag `v1.1.0`
n'a jamais pu être poussé (le proxy git de l'environnement d'exécution refuse les push de tags,
403). Les quatre apps du hub épinglent donc le **même** SHA `2d37a61…` — c'est le contenu de
la v1.1.0 (bloc `usage` additif). Ne pas revenir à `#v1.0.0` : cette version ignore le bloc
`usage` et une app qui la consomme ne peut pas publier ses coûts le jour où elle en a.

## CORS : rien à faire

Le hub interroge l'endpoint **côté serveur**. Aucun header CORS à configurer — si le besoin
apparaît, c'est le signe que le fetch est parti côté client.
