# ADR-0014 — La note suit le profil : distance re-calibrée, conditions lues, carrière

**Statut** : Proposé — réponses de Marc du 2026-08-20
**Relève du** : §8 du CLAUDE.md (protocole de précision — modification de `lib/scoring.ts`)
**Suite de** : ADR-0013, qui a rendu le barème lisible sur l'anglais et pondéré par le domaine.

## Ce que Marc a répondu, et ce que ça implique

| Question | Réponse | Conséquence |
|---|---|---|
| Ce qui doit peser | rôle, distance, conditions d'emploi, **et le CV** | trois volets, plus un quatrième bloqué |
| Distance | « ~50 km, au-delà ça chute vite » | les paliers actuels ne peuvent PAS l'exprimer |
| Hors domaine | garder la pénalité ×0,5 | ADR-0013 D1 est confirmé, rien à changer |
| Conditions | permanent > temporaire, temps plein | deux champs du flux, non transportés aujourd'hui |
| Carrière | « tout ça » (monter, approfondir, mieux, gestion de projet) | aucune direction unique à privilégier |
| CV dans l'app | **non, pas encore** | le volet carrière ne peut pas être validé |

## D1 — Les paliers de distance descendent jusqu'à 300 km

**Le défaut est mesurable aujourd'hui** : les paliers s'arrêtent à 35 km et tout ce qui est
au-delà tombe sur `distancePlancher` (5 points). Depuis que le rayon est passé à 300 km
(2026-08-20), **une offre à 40 km et une offre à 250 km valent exactement pareil**. La
question « est-ce loin ? » a cessé d'avoir une réponse graduée au moment même où l'espace
qu'elle devait juger a quadruplé.

Nouveaux paliers, calibrés sur la réponse « ~50 km, au-delà ça chute vite » :

| ≤ km | 5 | 10 | 15 | 25 | 35 | **50** | 80 | 150 | au-delà |
|---|---|---|---|---|---|---|---|---|---|
| points | 20 | 18 | 15 | 11 | 8 | **6** | 3 | 2 | 1 |

La cassure est à 50 km (6 → 3), et la queue continue de descendre : 80 km et 250 km ne se
valent plus. `distancePlancher` passe de 5 à 1 — dans un rayon de 300 km, « au bout du
rayon » ne mérite plus le cinquième des points d'une offre à 5 km.

## D2 — Les conditions d'emploi entrent dans la note

Le flux publie `jobtype` et `workterm` sur ses offres ; l'app ne les transporte pas. Comme
le code de profession avant ADR-0013, ils sont lus puis jetés.

**Permanent** et **temps plein** valent des points ; temporaire, saisonnier ou temps partiel
en valent moins. ⚠️ **Une condition NON PUBLIÉE reste neutre**, jamais pénalisée : c'est la
règle déjà tenue pour la distance inconnue, le salaire non affiché et le code de profession
absent. Les sources hors Guichet ne publient pas ces champs — les pénaliser reviendrait à
noter la politique de diffusion de l'employeur, pas le poste.

⚠️ **Ces points sont PRIS sur l'existant, pas ajoutés.** La somme des pondérations fait 100
et un test le vérifie. Gonfler le total à 110 rendrait toutes les notes historiques
incomparables aux nouvelles sans qu'aucun écran ne le dise.

**Ils sont pris sur le SALAIRE (15 → 10), et c'est une mesure qui le décide.** Aucun appelant
de `computeScore` ne passe `salaireAnnuel` — ni `distances.ts`, ni `pipeline.ts`, ni
`renotation.ts`, qui explique même pourquoi (`salaireAffiche` est du texte libre). L'axe rend
donc `salaireNonAffiche` pour TOUTES les offres : quinze points qui ne départagent rien. En
retirer cinq ne coûte aucune discrimination.

⚠️ **Pas sur l'immigration**, bien qu'elle soit le candidat évident à dix points. Elle
DISCRIMINE, et précisément dans la situation de Marc : une annonce qui exige l'Ordre des
ingénieurs du Québec est un délai réel pour un ingénieur formé en France. Réduire son poids
rendrait la note moins juste exactement là où elle le concerne.

Les paliers de salaire sont remis à l'échelle dans le même rapport (15/14/12/9 → 10/9/8/6,
non affiché 9 → 6, plancher 5 → 3), et la valeur neutre des conditions est fixée à 3 sur 5 —
le même 60 % que le salaire non affiché. Une offre sans condition publiée ne bouge donc
d'AUCUN point : −3 sur le salaire, +3 sur les conditions. C'est ce que l'audit doit montrer.

**Une découverte à ne pas enterrer** : les quinze points du salaire sont inertes depuis
toujours. Le flux du Guichet publie pourtant un salaire sur une bonne part de ses offres
(« $36.00 hourly »). Le lire vaudrait mieux que le laisser constant — ticket séparé, hors de
ce lot.

## D3 — Le volet CARRIÈRE est cadré ici, mais PAS livré

Marc veut que la note reflète ce qui est « bien pour la suite de carrière », et il a répondu
« tout ça » aux quatre directions proposées — monter en responsabilité, approfondir la
technique, viser un meilleur employeur, basculer vers la gestion de projet. Aucune direction
n'est donc à privilégier : le barème doit RÉCOMPENSER ce qu'il sait détecter dans chacune,
sans pénaliser les autres.

**Ce volet n'est pas implémenté dans ce lot, et c'est une décision, pas un oubli.**

Le CV de Marc n'est pas dans l'app. Le §8 exige d'exécuter la nouvelle logique sur du réel
avant de modifier le pipeline ; un scoreur de progression de carrière construit sans CV ne
peut être audité sur rien. Le livrer quand même produirait exactement ce que ce dépôt a déjà
payé deux fois cette semaine : un mécanisme branché, inerte, et dont rien ne dit qu'il l'est.

**Ce qui débloque le volet** : Marc dépose son CV dans l'app. Le module d'extraction rend
déjà `anneesExperience`, `titresOccupes`, `outils`, `diplomes`, `forces`, `manques` — la
matière est là, elle attend son entrée. Le volet aura son propre ADR et son propre audit.

## Impact quotas et coût

**Aucun appel LLM.** Les paliers sont arithmétiques, les conditions sont deux champs XML
déjà lus par le flux. Le seul coût est le transport de deux chaînes de plus par offre.

## Analyse de risques

| # | Risque | Traitement |
|---|---|---|
| R1 | La re-calibration change TOUTES les notes existantes | Attendu et voulu : le rayon a changé. `profilVersion` bumpée ; l'audit rend l'avant/après |
| R2 | Une note calculée dépasse une note vérifiée à la main | §8 étape 3 : vérifié sur le seed, plafond 85 inchangé |
| R3 | Une source sans `jobtype` est pénalisée | **C'est ce que l'audit doit réfuter** : neutre exigé, écart nul attendu sur le seed |
| R4 | Les points des conditions gonflent le total au-delà de 100 | Test existant sur la somme des pondérations ; ils sont PRIS, pas ajoutés |

## Méthode de test

1. **Audit §8 sur TOUTES les offres du seed**, tableau avant/après rendu avant modification
   du pipeline. Les offres du seed n'ont ni `jobtype` ni `workterm` : leur écart doit venir
   UNIQUEMENT de la distance. C'est le test discriminant de R3.
2. **Fonctions pures** pour les conditions, avec le cas « champ absent ⇒ neutre ».
3. **Monotonie de la distance** : la note ne doit jamais REMONTER quand la distance augmente.
   Un palier mal ordonné produirait un barème où s'éloigner rapporte, sans erreur visible.
4. **Somme des pondérations = 100**, vérifiée par le test existant.
5. **Discrimination prouvée par mutation.**

## Résultat de l'audit (2026-08-20, avant modification du pipeline)

**D1 — une seule offre du seed bouge**, et elle bouge dans le bon sens : `Superviseur de la
maintenance`, à 51,7 km, passe de 75 à 73. Toutes les autres sont à moins de 35 km ou sans
distance mesurée, donc sur des paliers inchangés. La courbe est **monotone** (vérifiée km par
km de 0 à 320) et discrimine à nouveau : 40 km > 100 km > 250 km, là où les trois valaient 5.

Discrimination prouvée par deux mutations : un palier qui remonte (3 tests rouges), un retour
aux paliers courts (2 tests rouges).

⚠️ **CE QUE L'AUDIT A TROUVÉ ET QUI N'EST PAS DE CE LOT.** Le §8 étape 3 dit qu'« une note
calculée qui dépasse une note vérifiée à la main est un bug ». La règle est **déjà violée sur
huit offres du seed**, AVANT ce changement :

| note manuelle | calculée avant | après |
|---|---|---|
| 68 | 85 | 85 |
| 63 | 66 | 66 |
| 62 | 64 | 64 |
| 60 | 64 | 64 |
| 57 | 75 | **73** |
| 55 | 85 | 85 |

Ce lot ne la cause pas et en réduit un cas. Mais le constat mérite d'être posé : soit le
plafond de 85 est le seul mécanisme voulu (et la phrase du §8 promet plus qu'elle ne tient),
soit huit notes calculées contredisent le jugement de Marc sans que rien ne le signale. Les
notes AFFICHÉES de ces offres sont les manuelles — il n'y a donc pas de chiffre faux à
l'écran — mais le classement, lui, mêle les deux échelles. À trancher séparément.

## Conséquences

**Positif** — une offre à 250 km cesse de valoir une offre à 40 km ; deux champs publiés sur
toutes les offres du Guichet cessent d'être jetés.

**Négatif** — le barème compte une composante de plus, donc une note demande une ligne de
plus pour s'expliquer. `DetailNote` la rend, comme le facteur de domaine.

**Risques acceptés** — R1 : toutes les notes bougent. C'est la conséquence directe d'un rayon
qui a quadruplé, pas un effet de bord.

## Alternatives rejetées

- **Garder `distancePlancher` pour tout au-delà de 35 km** : c'est l'état actuel, et il rend
  la distance muette sur les cinq sixièmes du rayon.
- **Livrer le volet carrière sans CV** : invérifiable, donc contraire au §8. Voir D3.
- **Ajouter les conditions en points SUPPLÉMENTAIRES** (total 110) : rendrait les notes
  historiques incomparables aux nouvelles.

## Réversibilité

Les paliers et les points de conditions sont des données du profil, pas du code : les
remettre aux valeurs d'avant est un changement de constante. Le transport de `jobtype` et
`workterm` est additif — les offres sans ces champs se comportent exactement comme avant.
