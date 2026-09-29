# Copies du modèle auto-merge (Atelier)

Profil : complet

Généré par `node modeles/auto-merge/verifier-copies.mjs --ecrire-copies .` : ne pas modifier à la main. Chaque ligne atteste qu'une copie était FIDÈLE au modèle à la version indiquée ;
`node modeles/auto-merge/verifier-copies.mjs .` la revérifie contre le manifeste de l'Atelier.

| chemin | sha256 (fins de ligne LF) | version du modèle |
|---|---|---|
| modeles/auto-merge/autoMerge.mjs | 0696a5f5b7d2ef049f923db3f2bb2fe42e615e61857883c6d5636ab523f3bab5 | 1.10.0 |
| modeles/auto-merge/autoMerge.d.mts | 8698c0bad5acc4093f04b2518e94a7439742862e9c6c39a43880817d323a4a51 | 1.10.0 |
| modeles/auto-merge/chemins-interdits-base.json | ee2b611dc507134eb36f297f48f6e06dff02f1ab75b5295502f12ea94eff9327 | 1.10.0 |
| modeles/auto-merge/fusionner.mjs | 5aa67cc0d42f813b0f0aa56811ce35943abdedca38dc367264314f7512c8feb0 | 1.10.0 |
| modeles/auto-merge/armer.mjs | b6854ab994f144c6f4a541da87735dd2192de38ea54777a6dfce4545b0a4528e | 1.10.0 |
| modeles/auto-merge/labels.mjs | 23b0585c4d8032d3b7ee1c224ce02ac9eddc818d0fd07916685452ece779df0c | 1.10.0 |
| modeles/auto-merge/codes-raison.mjs | 4ec6274146cb00cf038691ccdaa53417f557992a55e9ad1fbf8267ddffbe16c6 | 1.10.0 |
| modeles/auto-merge/verifier-copies.mjs | 3737ad2e08fd7de090d5b7630d4b655e6bbded6756efc8260f9011ebc295e174 | 1.10.0 |
| modeles/auto-merge/surblocage.mjs | 095636145b44cd849cc7c205a709c2ac03a90f9ab64e52f05c304de10366a827 | 1.10.0 |
| .github/workflows/armement-auto-merge.yml | 455d424b79b2b4d102cf07fccf3a6bb226d5c4c06b6f1bdbc81c8dc76109b32c | 1.10.0 |
| modeles/auto-merge/LISEZMOI.md | f8e780b445438364f929c24537a18fb14b1c809da960ae04a895bdbd196664a7 | 1.10.0 |

## Source et écarts JobAI (déclarés un à un)

- Kit d'auto-merge de l'Atelier **1.9.1** (tag `kit-1.9.1`), profil **complet** (dépôt PUBLIC : armement natif conservé). Adoption depuis zéro (agence/atelier-git, 2026-09-28).
- **Fichiers `.github/**` NON inclus dans cette PR** (chemin protégé, posés à part sur consigne du gérant) : `.github/auto-merge.json`, `.github/workflows/armement-auto-merge.yml` (copie EXACTE du gabarit, SHA-256 ci-dessus) et `.github/workflows/auto-merge.yml` (gabarit événementiel ADAPTÉ de deux valeurs : `workflows: [CI]` et `node-version-file: '.nvmrc'`, donc hors tableau). Tant qu'ils ne sont pas posés, la ligne `armement-auto-merge.yml` du tableau est en avance sur le dépôt.
- **Hors lot, non copiés** : `scripts/hooks/commit-gate.mjs`, `scripts/hooks/lib/analyseCommande.mjs`, `.github/workflows/ci-reutilisable.yml`, `.github/ci/*` (gabarits d'un AUTRE lot : « CI réutilisable / portes qualité »). Ce lot n'est pas traité ici et reste en attente d'une revue de sécurité séparée (pôle-sécurité) pour les hooks avant toute pose.
- **ESLint / knip** : les 6 copies exécutables sont ignorées par liste NOMINATIVE dans `eslint.config.mjs` et par `modeles/auto-merge/**` dans `knip.json` (copies à empreinte épinglée : les retoucher casserait l'attestation).
- **`.github/workflows/fusion-auto.yml` (ancien, `on: pull_request`)** : NON touché par ce lot (consigne : décision du gérant). Il est `disabled_manually` ; à retirer par le gérant une fois le kit actif.
- **Mise à jour 1.9.1 → 1.10.0 (agence/gerant, 2026-09-28)** : resync des fichiers déjà copiés (hachages et version bumped ; `chemins-interdits-base.json`, `codes-raison.mjs` et `armement-auto-merge.yml` sont inchangés d'un octet entre 1.9.1 et 1.10.0, seule l'étiquette de version bouge) + ajout de `modeles/auto-merge/labels.mjs` (nouveau fichier du manifeste 1.10.0, importé statiquement par `verifier-copies.mjs` : son absence casserait l'outil). Fait à la main (méthode identique à l'adoption initiale), pas via `verifier-copies.mjs --ecrire-copies .`, qui toucherait aussi les 4 fichiers hors-lot déjà déclarés ci-dessus.
- **Frein visuel ajouté** (même patch) : clé `chemins_validation_visuelle` posée dans `.github/auto-merge.json` (mesurée par `surblocage.mjs --champ chemins_validation_visuelle`, voir `C:\dev\_pc-local\agence\rapports\frein-visuel\jobai.json` — 2,9 PR/mois freinées (18 % des PR fusionnées), sous le plafond mesuré). Aucune autre clé de `auto-merge.json` n'a été touchée.
