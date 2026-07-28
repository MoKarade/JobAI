# JobAI

Suivi et analyse de recherche d'emploi dans la région de Québec : offres notées selon un
barème pondéré par le profil, statuts de candidature, détection des réponses de recruteurs,
et assistance IA pour l'analyse d'offres et la rédaction de CV et lettres ciblés.

App de l'écosystème hub perso, aux côtés de FinanceAI, DriveAI et BatchChef.
Destination : **`emploi.hubperso.com`**. Widget publié au hub via
[`@mokarade/hub-contract`](https://github.com/MoKarade/hub-contract).

> **Dépôt privé, et ce n'est pas négociable** : les données de suivi contiennent l'adresse du
> domicile, le statut migratoire, l'historique de candidatures et des noms de personnes
> tierces. Voir le garde-fou n°1 du [`CLAUDE.md`](./CLAUDE.md).

## État

**Chantier #00 — bootstrap.** Le fork est personnalisé et l'endpoint hub répond, mais rien
n'est déployé : ni base de données, ni auth utilisateur, ni interface. Le suivi vit encore
dans un artifact HTML autonome, hors du dépôt.

L'état courant fait foi dans **[`HANDOVER.md`](./HANDOVER.md)** — à lire en premier.
Les tâches sont dans [`BACKLOG.md`](./BACKLOG.md), les décisions dans [`docs/adr/`](./docs/adr/).

## Ce qui est branché aujourd'hui

- **`app/api/hub/summary/route.ts`** — endpoint consommé par le hub. Vérifie `x-hub-token` en
  temps constant, répond en `Cache-Control: no-store`, et renvoie un summary honnêtement
  `building` tant qu'aucune donnée réelle n'existe.
- **`lib/hubToken.ts`** — comparaison de jeton en temps constant (SHA-256 + `timingSafeEqual`).
- TypeScript strict, tests Vitest validés contre le **vrai** schéma du contrat.

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
(côté hub). Déclarer aussi l'app dans `lib/sources.ts` du dépôt Hubperso — c'est du **code**,
donc ça exige un redéploiement du hub, pas seulement une variable d'environnement.

## CORS : rien à faire

Le hub interroge l'endpoint **côté serveur**. Aucun header CORS à configurer — si le besoin
apparaît, c'est le signe que le fetch est parti côté client.
