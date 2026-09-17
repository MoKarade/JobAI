# ADR-0017 — Le barème cesse de buter sur un accent

**Statut** : Accepté — demande de Marc du 2026-09-17 (« fais tout à la suite », après l'audit
du backlog qui a re-confirmé `[VEILLE-34]`)
**Relève du** : §11 du CLAUDE.md (protocole de précision — modification de `lib/scoring.ts`)
**Ne révise rien** : ADR-0013 et ADR-0015 gardent leurs effets, la comparaison change, pas le
barème.

## Le problème, dans le code

`normaliserTitre` (lib/scoring.ts) replie la casse, les marques d'écriture inclusive et les
espaces — **pas les accents**. Or `scoreFitRole` compare le titre replié aux listes de mots du
PROFIL, et cinq de ces mots portent un accent :

| Mot du barème | Sa forme sans accent |
|---|---|
| `chef d'équipe` | `chef d'equipe` |
| `chargé de projet` | `charge de projet` |
| `chargée de projet` | `chargee de projet` |
| `mécatronique` | `mecatronique` |
| `électromécanique` | `electromecanique` |

Un titre écrit « Charge de projet » ou « Electromecanicien » ne peut donc pas les atteindre : il
tombe à `horsSujet`, 8 points sur 40 — la note d'un métier sans rapport. C'est la sœur exacte de
la correction déjà faite pour l'écriture inclusive (« Chargé(e) de projets » ne matchait pas
« chargé de projet »), sur le même mécanisme, laissée à moitié.

## ⚠️ Le gain MESURÉ aujourd'hui est NUL, et il faut le dire ici

`[VEILLE-34]` annonçait « 4 offres du lot du 18 août passent de `fitRole` 8 à 28 », en citant
Davie, Solution SFT et TEHORA. **Re-mesuré le 2026-09-17, sur la base réelle** :

| Population mesurée | Offres | Dont sans accent |
|---|---|---|
| Suivi entier, titres contenant « charge de projet » (périmées et historiques comprises) | 33 | **0** |
| Suivi entier, titres contenant « electromeca » | 2 | **0** |
| `SEED` complet, composante RÔLE avant/après | 53 | **0 bougent** |

Les trois offres nommées par le ticket sont en base **avec** leurs accents (« Chargé de projet,
maintenance » chez Davie) et notent **76**, pas 8. Le chiffre du ticket ne se reproduit pas : il
a été mesuré quand ZipRecruiter était une source, et ZipRecruiter n'en est plus une.

**On livre quand même, et pour une raison qui n'est pas le gain d'aujourd'hui.** Les listes de
mots sont **éditées par Marc depuis `/profil`** : le jour où il y ajoute « Ingénieur », « Chargé
d'affaires » ou « Opérateur », une moitié des annonces cessera de matcher **en silence** — aucune
erreur, aucun test rouge, juste des notes basses qui ont l'air d'un jugement. Le défaut n'est pas
dans les données d'aujourd'hui, il est dans le MÉCANISME, et il se déclenche à la prochaine
saisie.

## La décision

Replier les accents **DANS `normaliserTitre`**, et appliquer cette même fonction **aux mots du
barème au moment de la comparaison** — jamais d'un seul côté. Un repli asymétrique serait pire
que l'absence de repli : il ferait cesser de matcher les titres accentués, qui sont aujourd'hui
la totalité du corpus.

## Trade-offs

- **Ce qu'on perd** : la capacité de distinguer deux mots qui ne diffèrent que par un accent.
  Aucun couple de ce genre n'existe dans les listes, et aucun n'a de sens en recherche d'emploi.
- **Ce qu'on ne fait pas** : toucher aux points, aux seuils ou au plafond. Le barème est
  inchangé ; seule la façon de reconnaître un mot change.
- **Alternative écartée** : écrire les variantes sans accent dans les listes. Ça double la
  maintenance, ça laisse le piège intact pour le mot suivant, et ça le laisse à la charge de
  Marc — c'est-à-dire exactement le silence qu'on veut fermer.

## Méthode de test (§11)

1. Audit AVANT toute ligne de code, sur `SEED` entier (53) : **0 offre ne bouge** — la
   non-régression est mesurée, pas supposée.
2. Non-régression verrouillée : un titre accentué continue de matcher un mot accentué.
3. Discrimination prouvée par mutation : replier d'un SEUL côté doit faire rougir.
4. Le cas que ça ferme : un titre sans accent atteint désormais un mot accentué.
