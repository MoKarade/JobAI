# ADR-0013 — Le domaine pondère la note, et le flux entre en entier

**Statut** : Proposé — décisions Marc du 2026-08-20 (« multiplicateur de domaine », « toutes
en base, triées par note »)
**Relève du** : §8 du CLAUDE.md (protocole de précision — modification de `lib/scoring.ts`)
**Révise** : ADR-0012, qui réservait le NOC à un filtre d'ingestion et écartait explicitement
la composante de note. Ce chantier séparé est celui-là.

## Le problème, mesuré le 2026-08-20

Le barème actuel ne peut pas lire les offres du Guichet. `scoreFitRole` décide par des listes
de mots français (`motsCoordination` contient « superviseur », pas « supervisor ») et les
titres du flux sont en anglais. Il rend donc `horsSujet` — **8 points sur 40, constamment**.

Mesure sur des titres réels du flux, barème actuel, distances et salaires réels :

| Offre | rôle | dist | séni | sal | immi | **note** |
|---|---|---|---|---|---|---|
| `supervisor - retail` | 8 | 18 | 11 | 12 | 10 | **59** |
| `car washer` | 8 | 20 | 11 | 5 | 10 | **54** |
| `construction project coordinator` | 8 | 15 | 11 | 9 | 10 | **53** |
| `production supervisor - food and beverage` | 8 | 11 | 11 | 9 | 10 | **49** |

Le barème classe un superviseur de commerce de détail **au-dessus** d'un coordonnateur de
projet en construction, et un laveur de voitures au-dessus des deux offres de construction.
Ce n'est pas un réglage à ajuster : **40 % du barème est inerte** sur cette population, et le
classement est décidé par ce qui reste — la distance et le salaire.

S'y ajoute un plancher structurel. Quatre axes rendent une valeur NEUTRE quand l'information
manque, et ces neutres s'additionnent : 8 (rôle hors sujet) + 11 (séniorité non précisée) +
9 (salaire non affiché) + 10 (immigration libre) = **38 points garantis à n'importe quelle
offre**, avant même la distance. Chaque neutre est juste isolément ; leur somme ne l'est pas.

## Les décisions

### D1 — Un facteur de domaine multiplie la note

Le code `noc2021` est présent sur 100 % des offres du flux (mesuré, ADR-0012) et il est
**indépendant de la langue**. Il devient un facteur appliqué au total :

| Situation | Facteur |
|---|---|
| Code NOC présent, retenu par la liste de Marc | **×1** |
| Code NOC présent, hors de la liste | **×0,5** (`facteurHorsDomaine`, réglable au profil) |
| **Aucun code NOC** (dépôt Indeed, API d'entreprise, saisie manuelle) | **×1** |
| **Liste de métiers vide** | **×1 partout** |

⚠️ **Les deux dernières lignes sont la décision, pas un détail d'implémentation.** L'absence
de code n'est pas un hors-domaine : c'est une ignorance, et la traiter comme un refus
pénaliserait exactement les offres que le barème sait DÉJÀ lire — le dépôt de la Routine,
mesuré à ~64 % portant une dimension coordination ou technique. C'est la règle déjà tenue par
`scoreDistance` (« distance inconnue : note NEUTRE, jamais 0 — un 0 dirait *c'est loin*, or
on ne sait pas »), appliquée au domaine. Et une liste vide laisse le mécanisme **inerte**,
comme la source l'est aujourd'hui : tant que Marc n'a pas choisi, rien ne change.

### D2 — Le NOC pose aussi un PLANCHER de rôle

Le facteur seul corrige le classement mais laisse les vraies correspondances basses : un
`construction project coordinator` reste à 53 parce que `scoreFitRole` ne sait toujours pas
lire son titre. Marc conclurait que le Guichet ne porte rien, alors que c'est le barème qui
ne sait pas le lire — l'erreur que l'ADR-0012 nommait déjà.

Donc : **quand le code NOC est retenu par la liste, `scoreFitRole` ne peut pas rendre moins
que `pointsRole.coordination`.** Le NOC est une donnée officielle sur le métier ; il vaut au
moins ce qu'un mot-clé trouvé dans un titre. Le plancher ne fait que RELEVER, jamais abaisser :
une offre dont le titre porte la combinaison recherchée garde ses 40 points.

⚠️ D2 est séparé de D1 exprès. Marc a arbitré le facteur ; le plancher est ma proposition et
se refuse indépendamment — D1 tient sans lui.

### D3 — Le flux entre en entier, la note fait le tri

La liste de métiers cesse d'être un **filtre d'ingestion** pour devenir la **définition du
domaine**. Trois états explicites remplacent le binaire vide/remplie d'aujourd'hui, où
« vide » voulait dire « source éteinte » et jamais « tout » :

| Mode | Ingestion | Facteur de domaine |
|---|---|---|
| `eteint` (défaut, comportement actuel) | source non construite | inactif |
| `domaine` | filtrée par la liste | actif |
| `tout` (choix de Marc) | **toute la région**, ~1 300/passe | actif |

### D4 — Le vocabulaire de rôle cesse d'être monolingue

⚠️ **Ce volet a été ajouté APRÈS l'audit, parce que l'audit l'a rendu obligatoire.**

`scoreFitRole` rend `horsSujet` sur **15 des 53 offres du seed** — 28 %. Ce ne sont pas des
offres marginales : ce sont `Project Manager` chez ABB, CAE, Baker Hughes, Robotiq, Cognex,
`Project Engineering Manager` chez Alstom. Le cœur de cible, noté 48. La cause est la même
qu'au Guichet : `motsCoordination` est **entièrement français** et ces titres sont anglais.

Treize de ces quinze n'ont **aucune note manuelle** (`score: null`) — donc les relever ne
contredit aucun jugement de Marc. La quatorzième, `AMETEK — Expert Technique`, est notée
**66 à la main contre 56 calculée** : le barème sous-note son propre domaine de 10 points.

Sans D4, D1 et D2 CRÉERAIENT une inversion nouvelle : un `construction general
superintendent` du Guichet passerait à 73 pendant qu'un `Project Manager` chez Robotiq
resterait à 48. Corriger une distorsion en en fabriquant la symétrique n'est pas un progrès.

`motsCoordination` reçoit donc ses équivalents anglais. ⚠️ **Des expressions, pas des mots
isolés** : « manager » nu retiendrait « assistant manager, restaurant ». Le NOC protège la
population du Guichet, mais pas celle d'Indeed — là, la précision du terme est la seule garde.

⚠️ **Contrairement à D1 et D2, D4 FAIT BOUGER des notes existantes.** Son audit est donc un
vrai avant/après, pas une preuve d'immobilité, et il doit vérifier deux choses : qu'aucune
note calculée ne dépasse une note vérifiée à la main (§8 étape 3), et qu'aucun titre
hors-domaine du Guichet ne remonte par le nouveau vocabulaire.

## Impact quotas et coût

**Aucun appel LLM** : le NOC est lu dans le flux, la note est arithmétique. Le coût est en
volume et en temps de fonction, et il est réel :

- `MAX_RETENUES_FLUX` (200) borne la passe bien en dessous des 1 300 attendues — à relever.
- `maxDuration` du cron (60 s) est le vrai mur. Les routes de diagnostic tournent déjà à
  300 s : le plan le permet.
- L'ingestion insère **une offre par aller-retour** (`for … await db.insert`). À 1 300 offres
  ce seul point peut dépasser le budget — l'insertion doit passer par lots.
- Le géocodage de ~1 300 employeurs à 1,1 s vers Nominatim ne tient dans aucune passe : il
  reste borné et s'étale sur plusieurs jours. C'est déjà le cas, et c'est dit à l'écran.

## Analyse de risques

| # | Risque | Traitement |
|---|---|---|
| R1 | Marc retient un code trop étroit ⇒ son domaine passe à ×0,5 | La liste vide est inerte ; `/sources` affiche chaque code avec son compte ET des titres réels |
| R2 | Un employeur code mal son offre ⇒ ×0,5 injustifié | **Assumé.** Le facteur n'efface pas : contrairement au filtre, l'offre reste en base et visible |
| R3 | 1 300 offres noient le tableau | C'est le choix de Marc ; le tri par note est la réponse, et R2 garantit que rien ne disparaît |
| R4 | Le changement de barème re-note tout l'existant | `profilVersion` est bumpée ; ADR-0009 prévoit la re-notation |
| R5 | Le facteur fuit sur les offres sans NOC | **C'est ce que l'audit doit réfuter** : écart attendu EXACTEMENT nul sur les 38 |

## Méthode de test

1. **Audit §8 sur les 38 offres du seed**, table [entreprise | poste | avant | après | écart]
   rendue AVANT de modifier le pipeline. Aucune ne porte de code NOC : **l'écart attendu est
   exactement zéro**. Ce n'est pas une formalité — c'est le test discriminant de R5, et le
   moindre mouvement signale que le facteur s'applique là où il ne doit pas.
2. **Fonctions pures** pour le facteur et le plancher, avec les quatre cas du tableau D1 plus
   la liste vide.
3. **Non-régression du plafond** : le facteur ne peut qu'abaisser, le plancher qu'élever, et
   `plafondNoteCalculee` (85) reste au-dessus de tout. Une note calculée ne doit jamais passer
   devant une note vérifiée à la main.
4. **Discrimination prouvée par mutation** — chaque test doit échouer sur le code d'avant.
5. **Re-mesure de la table du problème** : l'inversion mesurée plus haut doit être renversée,
   et le tableau après/avant publié.

## Résultat de l'audit (2026-08-20, avant toute modification du pipeline)

**D1 + D2 — écart EXACTEMENT nul sur les 53 offres du seed.** ⚠️ Le §8 dit « 38 offres » ;
le seed en porte **53** aujourd'hui. Le protocole a été mis à jour plutôt que l'audit
restreint — un compte périmé dans un protocole le fait sous-spécifier en silence.

L'audit a tourné dans la configuration RISQUÉE : liste de métiers NON vide (`70, 92, 22, 21`)
et offres SANS code NOC. **0 / 53 bougent.** Discrimination prouvée par mutation : en faisant
rendre `facteurHorsDomaine` au code absent, **53 / 53 bougent** (−24 points typiques). L'audit
départage donc bien, R5 est réfuté.

Effet sur la population du Guichet, sur le VRAI chemin du pipeline (ni description ni
`salaireAnnuel` — aucun appelant n'en passe, cf. `renotation.ts`) :

| Titre | NOC | avant | après |
|---|---|---|---|
| `computer network technician` | 22220 | 56 | **76** |
| `construction project coordinator` | 70010 | 53 | **73** |
| `production supervisor - food and beverage` | 92010 | 49 | **69** |
| `car washer` | 65311 | 58 | **29** |
| `supervisor - retail` | 62010 | 56 | **28** |
| `sod layer` | 85121 | 43 | **22** |

L'inversion mesurée en tête d'ADR est renversée, avec un écart net entre les deux groupes.

**D4 — 7 offres du seed bougent, toutes des `Project Manager` (48 → 68).** Zéro note calculée
ne dépasse une note vérifiée à la main (§8 étape 3 : 0 dépassement). Zéro faux positif sur huit
titres hors domaine du Guichet.

⚠️ **L'audit a corrigé la décision.** Le premier vocabulaire proposé contenait « supervisor »
nu : il faisait remonter `supervisor - retail` de 56 à **76**. Le facteur NOC l'aurait rabattu
sur le Guichet, mais une offre Indeed « Retail Supervisor » n'aurait eu aucune garde. Les
termes ont été qualifiés (`production supervisor`, `general superintendent`, …). C'est
exactement ce que l'étape 2 du §8 est censée attraper, et elle l'a attrapé avant toute ligne
de code.

⚠️ **Ce que l'audit NE corrige PAS, et qu'il faut dire** : `Project Engineer`, `Mechanical
Engineer`, `Ingénieur intégrateur` et `Young Graduate` restent à 48. C'est CORRECT — un poste
d'ingénieur n'est pas un poste de coordination — mais ça signifie que le barème reste muet sur
une partie du seed, par construction et non par oubli.

## Conséquences

**Positif** — une offre hors domaine ne peut plus remonter par la distance et le salaire ; le
Guichet devient exploitable sans lexique bilingue à maintenir ; le tri repose sur un
classement officiel plutôt que sur les mots choisis par un employeur.

**Négatif** — deux mécanismes décident désormais du rôle (mots-clés et NOC), donc une note est
plus longue à expliquer ; `DetailNote` doit rendre le facteur appliqué, sans quoi « pourquoi
30 ? » n'a pas de réponse.

**Risques acceptés** — R2 (offre mal codée) et R3 (volume). Aucun des deux ne fait disparaître
d'offre, ce qui est la condition pour les accepter.

## Alternatives rejetées

- **Plafond dur par le NOC** (hors domaine ⇒ note ≤ 40) : plus tranchant, mais supprime toute
  hiérarchie entre les hors-domaine et rend une offre mal codée invisible. Proposé à Marc,
  écarté par lui au profit du multiplicateur.
- **Deux listes séparées, sans note hors domaine** : perd les offres mal codées, sans gain sur
  le problème posé.
- **Enrichir `motsCoordination` en anglais** : ne règle qu'à moitié — il faudrait maintenir un
  lexique bilingue à la main, à côté d'un classement officiel déjà présent sur 100 % des
  offres. Ça reste `[VEILLE-32]`, qui garde sa valeur pour les sources francophones SANS NOC.
- **Garder le filtre d'ingestion d'ADR-0012** : contredit la demande explicite de Marc de voir
  toutes les offres disponibles.

## Réversibilité

Totale et graduée. Le facteur et le plancher sont des fonctions PURES : les neutraliser, c'est
rendre 1 et 0. Sans même toucher au code, **vider la liste de métiers rend le mécanisme
inerte** et repasser le mode à `eteint` retire le flux. La bascule est une donnée d'état, pas
un déploiement.
