# ADR-0032 — Le salaire passe en premier dans la note, appliqué après un aperçu avant/après

**Date** : 2026-10-17 · **Statut** : Proposé — tâche JobAI#152 (mission JobAI#146, plan « refonte de la note »,
étape 4). Les poids viennent de la tâche ; l'application attend l'accord de Marc sur cinq offres exemples. Aucun coût IA.

## Contexte

Le salaire est le critère n°1 de Marc et c'est l'axe qui pèse le moins : 10 points sur 100, dernier ex æquo avec le
statut migratoire, et **inerte** — aucun appelant ne lui passait de montant (ADR-0026 décision 7). Depuis JobAI#150,
l'offre porte `salaire_annuel` (73 offres sur 8 673 suivies au 17/10/2026, toutes arrivées depuis cette tâche).

Barème actuellement actif (profil v7, lu par `diagnostic_bareme`) : rôle 40, distance 20, séniorité 15, salaire 10,
immigration 10, conditions 5.

## Décision

1. **Nouveaux poids** (somme 100) : salaire 32, rôle/domaine 28, distance 20, séniorité 10, immigration 5, conditions 5.
   « Domaine » de la tâche = l'axe `fitRole` (titre + annonce + plancher du code de profession) [Probable : la tâche ne
   définit pas d'autre axe de domaine ; le facteur ×0,5 hors métiers reste un multiplicateur, il n'a pas de points].
2. **Mise à l'échelle proportionnelle de chaque table de points** (`lib/nouveauBareme.ts`, pure) : chaque valeur de
   l'axe est multipliée par `poids cible / poids actuel` puis arrondie. Le haut de chaque table retombe exactement sur
   son poids ; l'ordre des paliers est conservé ; les seuils (distance, salaire, années) ne bougent pas. Exemple pour le
   salaire (×3,2) : 90 000 $ → 32 · 80 000 → 29 · 70 000 → 26 · 60 000 → 19 · sous 60 000 → 10 · non affiché → 19
   (le même 60 % neutre qu'avant, ADR-0014).
3. **Le salaire entre dans la note** : `noterOffre` passe `salaireAnnuel` de l'offre à `computeScore`, **seulement si
   le profil le demande** (`salaireDansLaNote`, faux par défaut, vrai après l'application). Un profil qui ne l'a pas
   demandé note exactement comme hier : l'ajout du code ne déplace aucune note avant le geste de Marc.
4. **Aperçu d'abord** : `apercuNouveauBareme` (pure) recalcule toutes les offres avec le barème actif et avec le nouveau
   et rend les distributions, l'écart moyen et des exemples (trois qui montent, deux qui descendent). Il est servi par
   l'outil MCP `diagnostic_bareme` (paramètre `apercu`) et affiché sur `/profil`.
5. **Application = geste de Marc** : un bouton sur `/profil` (Server Action, session revérifiée) écrit le nouveau profil
   (version + 1, `etabliLe` du jour), puis re-note toutes les offres calculées (ouvertes, historiques et périmées ; l'aperçu mesure les ouvertes et dit le nombre
   des autres). Les notes manuelles ne bougent pas (`planifierRenotation`), le plafond des notes calculées reste 85.
   Relancer le bouton après une coupure est sûr : sur un profil déjà appliqué, l'action saute l'activation et n'écrit que
   les notes qui diffèrent.
6. **Une validation de CV ne défait pas le barème** : `paliersSenioriteDepuisAnnees` reprenait 15/13/9 en dur ; il
   reprend désormais l'échelle du profil en cours. Sinon la première validation de CV après l'application aurait remis
   la séniorité à 15 points sur un total de 10.

## Impact coût LLM

Nul : arithmétique pure, aucun appel.

## Risques

- **R1 — le salaire non affiché compresse l'écart de rôle.** 99 % des offres n'affichent rien : elles reçoivent toutes
  19 points neutres. Le rôle perd 12 points de portée (40 → 28) ; une offre de rôle plein perd donc en moyenne ~8 points
  nets, une offre hors sujet en gagne ~2 (voir l'audit). Les paliers A (≥ 80) et B (≥ 65) sont inchangés : sans salaire
  affiché, le A devient très difficile à atteindre. L'aperçu chiffre cet effet (voir l'audit : sur le seed, les offres
  calculées en B passent en C). Si Marc le juge trop fort, les leviers sont `salaireNonAffiche` (le neutre, aujourd'hui
  60 % du maximum) ou les seuils de palier A/B — des nombres, pas une structure. [À trancher par Marc sur l'aperçu]
- **R1 bis — le plancher de rôle de l'ingestion est une proportion.** `FIT_ROLE_PLANCHER` (14 sur 40) suit désormais le
  poids du rôle (`plancherFitRole` : 14 sur 40, 10 sur 28). Avec les points actuels le tri est identique (technique 18,
  hors sujet 6) ; c'est une précaution de proportion, pas un correctif d'un défaut mesuré.
- **R1 ter — le plafond des notes calculées (85) n'est pas mis à l'échelle.** Sur une très bonne offre il écrase l'effet
  du salaire (72, 85 et 95 k$ donnent tous 85 pour une offre de rôle plein, proche, permanente). L'aperçu compte les
  offres arrêtées au plafond avant et après (`auPlafond`). Monter le plafond avec le salaire est une décision de Marc,
  non prise ici. Les paliers A et B pilotent aussi le compte « 80+ » du suivi et la sévérité du résumé du hub : ils
  changeront dès l'application.
- **R5 — le rayon réglé n'entre pas dans l'aperçu ni dans l'action** (`profilActif()` brut, comme `validerProfil`) ;
  aperçu et action utilisent la même voie, donc ils s'accordent entre eux.
- **R6 — volume.** ~8 600 notes à écrire : l'action les groupe par valeur de note (au plus ~100 UPDATE de 500
  identifiants) et `/profil` borne sa durée à 60 s.
- **R2 — l'annuel est une conversion** (2 080 h, borne basse, ADR-0026) : sous-estime les fourchettes « à négocier ».
- **R3 — seuils de salaire hérités** (60/70/80/90 k$) : non revus ici, ils viennent des repères du barème d'origine.
- **R4 — l'application n'est pas atomique** (pas de transaction sur `neon-http`) : même régime que la validation d'un
  CV — le nombre d'échecs est remonté, relancer est sans danger.

## Méthode de test

`tests/nouveauBareme.test.ts` : somme des poids 100 ; le sommet de chaque table égale le poids de son axe ; paliers
monotones ; seuils intacts ; idempotence (appliquer deux fois ne change rien, version comprise) ; notes manuelles
préservées ; un profil sans `salaireDansLaNote` note comme avant (même total sur tout le seed) ; l'aperçu choisit
trois hausses et deux baisses ; `paliersSenioriteDepuisAnnees` suit l'échelle du profil. Audit sur le seed et sur les
offres de production : section suivante.

## Audit (protocole §11)

**Seed** (`lib/seed.ts`, 53 offres : 23 notes manuelles, 15 calculées ouvertes, 15 historiques), barème d'origine mis à
l'échelle, métiers 21/22/70/92, `npx tsx` sur `apercuNouveauBareme` le 2026-10-17. Aucune offre du seed ne porte de salaire
annuel : l'audit mesure donc l'effet du REDÉPLOIEMENT des poids, pas celui des montants.

| Mesure (15 offres calculées ouvertes) | Enregistré | Barème d'origine recalculé | Nouveau barème |
|---|---|---|---|
| Note moyenne | 62,9 | 65,7 | 62,3 |
| Paliers A / B / C | 0 / 8 / 7 | — | 0 / 0 / 15 |
| Points moyens : rôle / séniorité / salaire / immigration | — | 26 / 11 / 6 / 9,7 | 18,4 / 7 / 19 / 4,9 |

Mouvement sur les 53 offres (calculées, manuelles et historiques recalculées pour mesurer ; les manuelles ne seront pas
touchées) : écart moyen −3,0, de −8 à +2 ; 40 offres perdent 4 points, 9 en gagnent 2 (les notes basses, dont le rôle ne
valait presque rien). **Les 23 notes manuelles restent ce qu'elles sont** (test sur le plan de re-notation).

Sensibilité au salaire, une offre type du seed (note 68 au barème d'origine, 64 au nouveau sans salaire) :

| Salaire annuel lu | Barème d'origine (axe inerte) | Nouveau barème |
|---|---|---|
| non affiché | 68 | 64 |
| 45 000 $ / 55 000 $ | 68 | 55 |
| 62 000 $ | 68 | 64 |
| 72 000 $ | 68 | 71 |
| 85 000 $ | 68 | 74 |
| 95 000 $ | 68 | 77 |

**Lecture** : le nouveau barème trie par salaire quand l'offre l'affiche (22 points d'écart entre 45 k$ et 95 k$ au lieu
de 0). Mais sans salaire affiché — 99 % des offres — une offre type perd 4 points, et le palier B (≥ 65) ne s'atteint plus
qu'avec un salaire lu d'environ 70 000 $ ou plus : sur le seed, les huit offres calculées en B passent toutes en C.
C'est la conséquence arithmétique de R1, pas un bug : elle est à valider par Marc sur l'aperçu avant d'appliquer.
**Production** (`diagnostic_bareme`, 17/10/2026 après le déploiement de #184, agrégats seulement) :

- Le profil enregistré (v7, issu d'un CV) porte un poids de salaire de **15**, pas 10 : la somme de ses poids fait 105
  (le défaut d'origine avait remis le salaire à 10 pour financer les conditions ; le document enregistré avait gardé
  15). La mise à l'échelle part des poids RÉELS du profil (32 / 15 pour le salaire) et le ramène à 100.
- 6 519 offres ouvertes, toutes à note calculée (aucune manuelle), dont 73 avec un salaire affiché. 6 196 sont
  hors des métiers retenus.
- Les notes enregistrées (moyenne 46, maximum 77) ne sont pas celles que le barème actuel donne aujourd'hui avec le code de
  profession et les métiers (moyenne 26,1) : **6 191 offres sur 6 519 diffèrent** (écart moyen −20,9). C'est l'héritage
  des anciens régimes de notation (ADR-0025), pas du nouveau barème : appliquer ce barème re-note TOUT avec la méthode
  unique, donc ces offres baisseront aussi. L'aperçu sépare les deux (`ecartMoyenBaremeSeul` = nouveau barème contre
  recalcul actuel ; `/profil` l'affiche à part).
- L'aperçu lui-même (`apercu: true`) n'a pas pu être lu depuis la session de travail : le schéma d'outil du connecteur y
  est resté celui d'avant le déploiement, et il envoie le paramètre sous forme de texte. Il se lit sur `/profil` ou
  depuis une session de connecteur neuve.

## Alternatives rejetées

- **Changer `PROFIL_DEFAUT` seul** : le profil de Marc est stocké en base (v7), le défaut ne le touche pas — l'effet
  serait nul là où ça compte, et le tripwire `tests/profil.test.ts` tomberait.
- **Brancher le salaire pour tous dès le déploiement** : déplacerait des notes avant que Marc ait vu l'écart.
- **Poids saisis à la main sur `/profil`** : hors périmètre ; la tâche fixe les poids.

## Retour arrière

Le profil précédent n'est pas supprimé tant qu'on n'écrase pas la version : revalider un CV repart du profil actif.
Pour revenir, réécrire les poids d'avant (rôle 40, salaire 10, séniorité 15, immigration 10) avec une nouvelle version et
`salaireDansLaNote` faux ; les notes se recalculent par la même action.
