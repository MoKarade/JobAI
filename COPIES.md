# Copies du modèle auto-merge (Atelier)

Profil : complet

Généré par `node modeles/auto-merge/verifier-copies.mjs --ecrire-copies .` : ne pas modifier à la main. Chaque ligne atteste qu'une copie était FIDÈLE au modèle à la version indiquée ;
`node modeles/auto-merge/verifier-copies.mjs .` la revérifie contre le manifeste de l'Atelier.

| chemin | sha256 (fins de ligne LF) | version du modèle |
|---|---|---|
| modeles/auto-merge/autoMerge.mjs | 49a15a70311a89341baeb90600eae2efb16c717be6efef29ce717a82e7384ee5 | 1.9.1 |
| modeles/auto-merge/autoMerge.d.mts | f8cd284186d1d51da4bc05fcf6b5b276228eb32e8ea6c26c658e5924d7e9f7b7 | 1.9.1 |
| modeles/auto-merge/chemins-interdits-base.json | ee2b611dc507134eb36f297f48f6e06dff02f1ab75b5295502f12ea94eff9327 | 1.9.1 |
| modeles/auto-merge/fusionner.mjs | 5fff63540802fe9f15afc26b68004d3ff978ff7425eb6fb7e9bcbc91c3bd2186 | 1.9.1 |
| modeles/auto-merge/armer.mjs | 46119ae1f787807bde310df46971f4d8f6c0633823f67c6e67892d16bc9e2902 | 1.9.1 |
| modeles/auto-merge/codes-raison.mjs | 4ec6274146cb00cf038691ccdaa53417f557992a55e9ad1fbf8267ddffbe16c6 | 1.9.1 |
| modeles/auto-merge/verifier-copies.mjs | f4344c70efbb59abf8ac8adbe3c66a2a05984860a9e5ada42b2d24d8f9e1ee85 | 1.9.1 |
| modeles/auto-merge/surblocage.mjs | dff24d5293c6fec61566e914343b325b81e4daad14f2ededcc20806b86e3fcc5 | 1.9.1 |
| .github/workflows/armement-auto-merge.yml | 455d424b79b2b4d102cf07fccf3a6bb226d5c4c06b6f1bdbc81c8dc76109b32c | 1.9.1 |
| modeles/auto-merge/LISEZMOI.md | 8a245763655ca36978ce4f579a9ebcd19b4bac089351dff4fd1889eba566718c | 1.9.1 |

## Source et écarts JobAI (déclarés un à un)

- Kit d'auto-merge de l'Atelier **1.9.1** (tag `kit-1.9.1`), profil **complet** (dépôt PUBLIC : armement natif conservé). Adoption depuis zéro (agence/atelier-git, 2026-09-28).
- **Fichiers `.github/**` NON inclus dans cette PR** (chemin protégé, posés à part sur consigne du gérant) : `.github/auto-merge.json`, `.github/workflows/armement-auto-merge.yml` (copie EXACTE du gabarit, SHA-256 ci-dessus) et `.github/workflows/auto-merge.yml` (gabarit événementiel ADAPTÉ de deux valeurs : `workflows: [CI]` et `node-version-file: '.nvmrc'`, donc hors tableau). Tant qu'ils ne sont pas posés, la ligne `armement-auto-merge.yml` du tableau est en avance sur le dépôt.
- **Hors lot, non copiés** : `scripts/hooks/commit-gate.mjs`, `scripts/hooks/lib/analyseCommande.mjs`, `.github/workflows/ci-reutilisable.yml`, `.github/ci/*` (gabarits d'autres lots).
- **ESLint / knip** : les 6 copies exécutables sont ignorées par liste NOMINATIVE dans `eslint.config.mjs` et par `modeles/auto-merge/**` dans `knip.json` (copies à empreinte épinglée : les retoucher casserait l'attestation).
- **`.github/workflows/fusion-auto.yml` (ancien, `on: pull_request`)** : NON touché par ce lot (consigne : décision du gérant). Il est `disabled_manually` ; à retirer par le gérant une fois le kit actif.
