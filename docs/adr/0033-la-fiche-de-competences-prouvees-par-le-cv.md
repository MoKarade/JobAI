# ADR-0033 — La fiche de compétences prouvées par le CV, en vocabulaire fermé

**Date** : 2026-10-18 · **Statut** : Proposé — tâche JobAI#155 (mission JobAI#147, plan « analyse du CV et dossier
employeur », étape A2). Coût IA : aucun appel de plus (la fiche se rend dans l'appel d'analyse qui existe déjà).

## Contexte

Les outils lus dans le CV entraient tels quels dans `motsTechnique`, le vocabulaire qui décide si un poste est
« technique ». Une offre était comparée à ce vocabulaire **par morceaux de mots** (`texte.includes(mot)`).

Mesuré en production le 17/10/2026 (`diagnostic_bareme`, agrégats seulement) : le profil enregistré (v7) porte 29 termes
ajoutés depuis le CV, dont `ros` et `unity`. La meilleure note enregistrée (77) était une offre de prothésiste dentaire :
`ros` se trouve dans « p**ros**thesis », donc le poste était lu comme technique (rôle 26 sur 40, au lieu de 8). Une offre
de direction de services communautaires était deuxième pour la même raison (`unity` dans « comm**unity** »).

Ce n'est pas un cas isolé : tout terme court ajouté depuis un CV (`ros`, `agv`, `iot`, `java`…) peut se retrouver dans un
mot sans rapport (« across », « process », « patriot »).

## Décision

1. **Un vocabulaire fermé** (`lib/competences.ts`, 25 compétences). Le modèle ne propose plus un texte libre : il choisit
   un identifiant du vocabulaire (le schéma d'outil le lui impose), un niveau (`notions`, `pratique`, `maitrise`) et pour
   chaque ligne **une phrase du CV recopiée et le poste où elle se lit**.
2. **Aucune ligne sans source, vérifiée par le code et non par la consigne.** `verifierCompetences` écarte toute ligne
   dont : l'identifiant n'est pas au vocabulaire ; le niveau est inconnu ; la phrase (8 à 200 caractères) ne se retrouve
   pas dans le texte du CV que le modèle a lu (mots contigus ; casse, accents, ligatures, caractères invisibles,
   ponctuation et mots coupés en fin de ligne ignorés) ; la phrase **ne nomme pas la compétence** (chaque entrée du
   vocabulaire porte ses `indices`, écrits à la main : sans cela une phrase quelconque « prouverait » SCADA) ; le poste ne
   contient aucun titre du parcours. Le poste écrit sur la ligne est **le titre du parcours**, jamais le texte du
   modèle. Une compétence citée deux fois garde son niveau le plus haut. Chaque refus a sa raison ; l'écran donne le
   nombre et la répartition par raison, et le journal serveur la liste. Une réponse coupée par la limite de sortie est un
   échec dit, pas une fiche vide.
3. **La fiche est un fait avec preuve** : un écart « Compétences prouvées » de la revue du CV, coché d'avance
   (ADR-0028), chaque ligne montrant sa phrase et son poste. Elle est écrite dans `faits.competences` du profil.
4. **Les outils du CV n'entrent plus dans `motsTechnique`.** L'écart « Vocabulaire technique du barème » (conséquence)
   disparaît. La liste libre `faits.outils` reste, pour l'affichage seul.
5. **La fiche règle la note par ses propres expressions, écrites une fois dans le vocabulaire, comparées par mots
   entiers.** Seules les compétences marquées `reglaNote` (le cœur de cible : automates, SCADA, robotique, ROS, vision
   industrielle, robots mobiles, mécatronique, instrumentation, mise en service, schémas électriques) et prouvées au
   moins en `pratique` rendent un poste technique. Les langages de programmation, la soudure, la bureautique, les outils
   de gestion de projet figurent sur la fiche (utiles en entrevue) sans déplacer une note : sinon tout poste de
   développeur deviendrait « technique ».
6. **Deux régimes de comparaison dans `scoreFitRole`.** Le vocabulaire d'origine du barème (expressions écrites à la
   main, ADR-0013) garde la comparaison par sous-chaîne, pour que « robotic » trouve toujours « robotics » : rien ne
   bouge pour lui. Tout autre terme de `motsTechnique` (ceux ajoutés depuis un CV) et les expressions de la fiche se
   comparent par **mots entiers** (`contientMot` : frontière lettre/chiffre de chaque côté ; trait d'union = espace ;
   pluriel simple pour un terme de plus de 3 lettres, version collée « ROS2 » pour un terme court, jamais « Ross »).
   C'est ce qui règle le profil v7 déjà enregistré sans migration ni geste de Marc.
7. Le diagnostic (`diagnostic_bareme`) utilise la même fonction (`motsTechniqueDe`) : il ne peut pas décrire une
   comparaison que la note n'applique pas.

## Impact coût LLM

Même appel, même modèle (Haiku). La sortie grandit d'au plus 25 lignes de moins de 200 caractères (~1 500 jetons, soit
de l'ordre de 0,01 $ par analyse) ; `max_tokens` passe de 2 000 à 5 000 pour que la fiche ne coupe pas la réponse.
L'analyse d'un CV se fait à chaque dépôt ou ré-analyse, pas à chaque offre.

## Risques

- **R1 — le vocabulaire est fermé, donc incomplet.** Une compétence réelle absente de la liste n'apparaît pas sur la
  fiche. C'est voulu (l'ajouter est une ligne dans `VOCABULAIRE_COMPETENCES`), et c'est ce qui empêche un outil libre de
  régler une note.
- **R2 — la vérification est stricte.** Un modèle qui reformule la phrase au lieu de la recopier la voit écartée. La
  perte est dite à l'écran et coûte une ré-analyse, jamais une fausse ligne.
- **R3 — la preuve vérifie que la phrase est dans le CV, qu'elle nomme la compétence et que le poste est un titre du
  parcours, pas que la phrase se lit dans CE poste.** Une phrase d'une section « compétences » rattachée à un poste du
  parcours passe. [Probable] acceptable : la phrase reste citée telle quelle et Marc la relit à l'écran. Un CV sans
  parcours (aucun poste daté) n'obtient aucune ligne : le refus est dit, il n'est pas contourné.
- **R4 — des termes courts non préfixés par le vocabulaire d'origine changent de régime.** Un terme ajouté depuis un
  CV qui comptait sur la sous-chaîne (« robotiques » pour « robotique ») ne trouve plus que le mot entier. [Probable] sans
  conséquence ici : les termes composés du profil v7 (« robotiques », « conception de cellules »…) s'écrivent tels quels
  dans les offres, et les fragments (`ros`, `unity`) étaient justement la faute. La ré-notation le dira (rubrique
  `renotation` du diagnostic).
- **R5 — les notes déjà enregistrées ne bougent pas toutes seules.** Elles changent à la prochaine re-notation (celle de
  l'application du nouveau barème, JobAI#152, ou d'une validation de CV). Avant ce geste, `diagnostic_bareme` montre déjà
  ce que le code actuel donnerait (rubrique `renotation` / `complet`).
- **R6 — les 29 termes déjà ajoutés restent dans le profil v7**, désormais comparés à mots entiers. Les retirer est une
  modification du profil de Marc : proposée, jamais faite ici.

## Méthode de test

`tests/competences.test.ts` : vocabulaire (identifiants uniques, expressions repliées, `reglaNote` ⇔ expressions) ;
`verifierCompetences` (phrase retrouvée malgré coupures de ligne et accents ; phrase inventée, poste hors parcours,
identifiant ou niveau inconnu, phrase d'un mot, entrée n'importe quoi : écartés avec leur raison ; doublon : niveau le
plus haut) ; `contientMot` (`ros` ≠ `prosthesis`, `unity` ≠ `community`, pluriel, chiffre collé) ; **le cas du
laboratoire dentaire** avec un profil portant `ros` et `unity` ; la fiche règle la note en `pratique` et pas en
`notions` ni pour un langage ; non-régression du vocabulaire d'origine sur les 53 offres du seed.
`tests/cvCompetences.test.ts` : l'extraction ne garde que les lignes prouvées et dit les autres, expurge le numéro de
téléphone d'une phrase, supporte l'absence de compétences, et le schéma d'outil porte l'énumération et le plafond.
`tests/cvProposition.test.ts` : la fiche est un fait avec preuve coché d'avance, sans écart si identique, jamais effacée
par une fiche vide ; plus aucun écart sur `motsTechnique`.

## Audit (protocole §11)

Seed (`lib/seed.ts`, 53 offres) au 2026-10-18, rôle de chaque offre calculé avec l'ancienne comparaison et la nouvelle :

| Profil | Offres dont le rôle change | Écart de note |
|---|---|---|
| Défaut (vocabulaire d'origine) | 0 sur 53 | 0 |
| Défaut + les 29 termes ajoutés au profil v7 (simulé) | 0 sur 53 | 0 |

Le seed ne contient aucune offre qui reproduit le cas (aucun mot ne porte un fragment collisionnant) : le test dédié le
reproduit avec les intitulés de l'offre réelle, sans nom d'entreprise. **Production** : à lire avec `diagnostic_bareme`
après déploiement (rubrique `meilleures`, offre de prothésiste : `motsTechniqueTrouves` vide et rôle 8 au lieu de 26 dans
`parts` de la re-notation). La fiche elle-même n'existe qu'après une ré-analyse du CV par Marc.

## Alternatives rejetées

- **Garder les outils libres et seulement durcir la comparaison** : règle le cas des fragments, pas la demande de la
  tâche (une fiche où chaque ligne cite sa preuve, dans un vocabulaire fermé).
- **Comparer tout `motsTechnique` par mots entiers, vocabulaire d'origine compris** : « robotic » ne trouverait plus
  « robotics » et des notes bougeraient sans mesure.
- **Retirer d'office les 29 termes du profil v7** : modifier le profil de Marc sans son geste.
- **Demander au modèle de classer le niveau sur une échelle numérique** : un niveau en trois mots se relit ; un
  chiffre se discute.

## Retour arrière

`faits.competences` est vide par défaut et ignoré quand il l'est : un profil sans fiche note exactement comme avant,
sauf pour les termes ajoutés depuis un CV, qui restent à mots entiers. Revenir à la sous-chaîne pour eux = retirer la
branche `sousChaine: false` de `termesTechniques` (`lib/scoring.ts`).
