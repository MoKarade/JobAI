# ADR-0012 — Trier le flux du Guichet par le code de profession (NOC 2021)

**Statut** : Proposé — décision Marc « go pour le tri par noc2021 » (2026-08-19)
**Relève du** : §8 du CLAUDE.md (protocole de précision — matching offre↔profil)

## Le problème, mesuré

Le flux du Guichet porte **1 300 offres régionales par passe**. Le suivi en contient 193.
Brancher la source telle quelle noierait l'écran — et l'échantillon retenu est dominé par
*sod layer*, *car washer*, *hairstylist*, *labourer*. Le volume n'est pas le sujet : le TRI
l'est.

Le barème actuel ne peut pas faire ce tri. `scoreFitRole` décide par des listes de mots
(`motsCoordination`, `motsTechnique`) et **les titres du Guichet sont en ANGLAIS** —
« automotive body painter », « machine set-up operator ». C'est `[VEILLE-32]` en grand : un
vocabulaire monolingue noterait tout à zéro, et on conclurait que la source ne vaut rien
alors que c'est le barème qui ne sait pas la lire.

## La décision

`noc2021` est présent sur **100 % des offres** du flux (mesuré, 2000/2000) et vaut un code à
cinq chiffres — 257 valeurs distinctes sur l'échantillon. C'est un classement **normalisé,
indépendant de la langue** : il dit le métier sans passer par les mots de l'annonce.

On s'en sert comme **filtre d'INGESTION**, pas comme composante de note.

### Pourquoi un filtre et pas une note

| | Filtre d'ingestion | Composante de note |
|---|---|---|
| Ce qu'il change | quelles offres du Guichet entrent | la note de **toutes** les offres |
| Régression possible | aucune : rien en base n'a de NOC | les 38 notes du seed bougent |
| Résout le problème posé | oui — c'est le volume qui étouffe | non |

Aucune offre du suivi actuel ne porte de code NOC : elles viennent d'Indeed ou d'une saisie
manuelle. Un filtre d'ingestion **ne peut donc pas** modifier une note existante, ce qui
retire tout risque de régression sur les notes vérifiées à la main. Brancher le NOC dans
`computeScore` serait un chantier séparé, avec son ADR et son audit sur les 38 offres.

⚠️ **Adaptation ASSUMÉE du §8, étape 2.** Le protocole demande d'exécuter la nouvelle logique
sur les 38 offres du seed. Ici c'est impossible et ce serait vide de sens : **le seed n'a
aucun code NOC**. L'audit se fait donc sur les offres du GUICHET, qui sont la seule
population concernée. On ne saute pas l'étape, on la porte sur la bonne population — la
leçon d'aujourd'hui même, où un inventaire mesurait le Canada au lieu de la région.

## Ce qu'on sait, et ce qu'on ne sait PAS

**Mesuré** : le champ existe partout, il porte cinq chiffres, 257 valeurs distinctes.

**Lu dans la norme, PAS vérifié** : la structure d'un code NOC 2021 serait
`[catégorie][TEER][détail…]` — le premier chiffre pour le grand domaine (2 = sciences et
génie, 7 = métiers, 6 = vente et services…), le deuxième pour le niveau de qualification
(0 = gestion, 1 = universitaire, … 5 = aucune formation exigée). La distribution observée est
COHÉRENTE avec cette lecture — `60030` gestionnaire de restaurant, `75110` aide de
construction, `12200` technicien comptable — mais **cohérent n'est pas vérifié**.

⚠️ **Et la distribution que j'ai vue était celle du CANADA, pas de la région.** L'inventaire
portait sur les 2000 premières offres du flux (223 québécoises sur 2000). Décider une liste
de codes sur ces chiffres serait la troisième fois de la journée que je conclus depuis un
préfixe non représentatif.

## Ce qu'il faut mesurer AVANT de coder

Un appel à `/api/diagnostic/flux-guichet`, qui rend désormais :

1. `inventaireRetenues.noc2021` — la distribution des codes sur les offres **régionales**.
2. `professions` — les codes appariés à leur **titre**, pour confirmer ou démentir la lecture
   de la norme. C'est la seule façon de vérifier qu'un code dit ce qu'on croit.

Sans ces deux-là, toute liste de codes serait une supposition déguisée en règle.

## La conception

- **Fonctions PURES** dans `lib/nocProfession.ts` : lire un code, en tirer le domaine et le
  niveau, dire quand il est illisible. Aucune I/O, testable sans réseau.
- **La liste des codes retenus vit dans le PROFIL** (`lib/profil.ts`), à côté de
  `motsCoordination` — pas en dur dans le filtre. Deux raisons : c'est une décision de Marc,
  et un profil pilote déjà le barème (ADR-0009).
- **Un code illisible ou absent ne FERME pas la porte.** Une offre sans NOC exploitable est
  jugée comme aujourd'hui, par le barème. « Je ne sais pas classer » et « ce métier ne te
  concerne pas » sont deux choses différentes, et les confondre perdrait en silence les
  offres que le Guichet code mal.
- **Le rejet se COMPTE et se NOMME**, par code et par fréquence. « 1 100 écartées » ne se
  vérifie pas ; « 1 100 écartées, dont 123 en 63200 (cuisiniers) » se vérifie d'un coup d'œil
  — et c'est ce qui permettra à Marc de corriger la liste au lieu de la subir.

## Méthode de test

1. Fonctions pures, testées, avec la discrimination prouvée (un code mal lu doit faire
   tomber le test).
2. **Audit sur du réel** : le tableau [code | titre | verdict] sur les offres régionales du
   flux, rendu à Marc AVANT de brancher quoi que ce soit.
3. **Non-régression** : aucune offre existante ne change de note (aucune n'a de NOC) —
   vérifié par un test, pas supposé.
4. Revue de la flotte avant merge.

## Coût

Nul en LLM : le code vient du flux, aucune analyse n'est faite. Le gain est un coût ÉVITÉ —
chaque offre écartée est une mesure Nominatim et une ligne de suivi en moins.

## Alternative rejetée

**Traduire le vocabulaire du barème en anglais** (`[VEILLE-32]`). Utile en soi, et à faire —
mais ça ne trie pas : un « warehouse associate » bien traduit reste un poste que Marc ne veut
pas. Le vocabulaire décide de la NOTE d'une offre pertinente ; le NOC décide si elle l'est.
