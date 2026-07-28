# CLAUDE.md — app-template

Squelette d'app hub perso. Sa seule responsabilité générique : exposer
`GET /hub/summary` conforme à [`@mokarade/hub-contract`](https://github.com/MoKarade/hub-contract).
Tout le reste (l'interface, le moteur métier) se construit après le fork.

## Principes non négociables

- **Contrat d'abord.** Le endpoint `/hub/summary` respecte le contrat ; toute réponse
  passe par le schéma du contrat (ici `buildingSummary` le garantit ; au fork,
  `HubSummarySchema.parse(...)` sur un vrai summary).
- **No fake data.** Par défaut `status: "building"`, aucune métrique inventée. On ne
  publie de vrais chiffres que quand le moteur les produit réellement.
- **Auth échec fermé.** `x-hub-token` obligatoire (401 sinon), `HUB_TOKEN` obligatoire
  côté serveur (500 sinon). Comparaison en temps constant. Jamais de secret en dur.
- **no-store systématique** sur les réponses du endpoint (un summary est un instantané).

## Au fork — checklist

1. Personnaliser `APP` (id/name/url/color) dans `app/hub/summary/route.ts`.
2. Remplacer `buildingSummary(...)` par un vrai summary quand le moteur est prêt.
3. Générer + configurer `HUB_TOKEN`.
4. Déclarer l'app dans `lib/sources.ts` du hub + `HUB_TOKEN_<ID>`.

## Vérifications avant commit

```bash
npm run typecheck && npm run test && npm run build
```

## Style (hérité du CLAUDE.md global de Marc)

- Réponses, commits et docs **en français** (`feat:`, `fix:`, `docs:`, …).
- TypeScript strict, pas de `any` silencieux. Erreurs honnêtes, jamais avalées.
- Ne pas imposer le dark mode : `prefers-color-scheme` décide.
