# ADR-0039 — Un modèle lit la description d'une offre, et sa lecture est gardée sans toucher à la note

**Date** : 2026-10-21 · **Statut** : proposé (JobAI#109, mission JobAI#105). Coût IA : oui, compté dans le bloc `usage` du hub.
Première des trois tâches issues de la découpe de JobAI#109 : la lecture (ici), sa mesure contre les choix de Marc (JobAI#211),
puis son entrée dans la note et la levée du plafond de 85 (JobAI#212). **Rien ici ne change une note.**

## Contexte

La tâche disait « le texte de l'annonce est jeté après ingestion ». C'est périmé : depuis l'ADR-0025 (JobAI#149), un extrait de
2 000 caractères, expurgé des données personnelles, est gardé avec chaque offre (`texteNote`) et lu par le barème, mais par
mots-clés seulement. Marc a décidé le 2026-10-19 de **garder** le texte, données personnelles retirées avant stockage, et de
compter le coût dans le repère de 20 $/mois.

Le plafond de 85 sur les notes calculées existe parce que des mots-clés ne prouvent pas qu'un poste convient (ADR-0009). Le lever
suppose de savoir si une lecture par un modèle se trompe moins que les mots-clés, et rien ne le mesure encore. Le protocole de
précision (`docs/claude/11-protocole.md`) demande cette mesure avant de changer la note : d'où la découpe.

## Décision

1. **Un modèle lit le titre et l'extrait, et rend un rôle parmi les cinq lignes de `profil.pointsRole`** (combinaison,
   coordination, technique, technicien, horsSujet), **une adéquation de 0 à 100 et une à trois raisons.** Ce sont les mêmes rôles
   que lisent les mots-clés : la comparaison se fait ligne pour ligne. Pour qu'il n'y ait qu'un vocabulaire, `scoreFitRole` est
   devenu `pointsRole[roleDe(...)]` ; son comportement est inchangé (tests du barème intacts).
2. **Haiku 5.5, appel d'outil forcé** (ADR-0035), consigne bâtie avec les mots du profil. L'annonce est assainie et balisée comme
   donnée (`promptSafety`) ; le modèle n'a aucun outil, ne voit ni la fiche de Marc ni son nom.
3. **Le code vérifie, il ne répare pas.** Rôle hors liste, adéquation non entière ou hors 0–100, plus de trois raisons, raison
   vide ou de plus de 160 caractères : toute la lecture est refusée. Les raisons passent par `expurgerPII` avant d'être gardées.
4. **La lecture se garde dans sa propre table** (`lectures_annonce`, une ligne par offre, supprimée avec l'offre) : c'est un
   résultat payant, daté et versionné d'un modèle, qui se jette et se refait sans réécrire l'offre. L'ajouter à `Offre` aurait
   fait partir un nouveau champ vers tous les chemins qui recopient une offre (surface MCP comprise).
5. **Un appel payant ne part que sur un geste** : l'outil MCP `lire_annonces`, jamais un cron ni une page. Un lot ne dépasse pas 20
   annonces ; sans `ids`, il lit les mieux notées pas encore lues ; une annonce déjà lue n'est pas relue sans `relire`. Chaque ligne
   rend le rôle du modèle, le rôle des mots-clés, leur accord et les raisons.
6. **Les relevés de coût d'un lot s'écrivent en file** (`lib/serie.ts`). Le compteur se met à jour par lecture-modification-écriture
   non atomique (`lib/coutLlmStore.ts`) ; l'analyse du CV était son seul site d'appel, donc sans concurrence. Un lot lance cinq
   appels de front : sans file, un appel facturé disparaîtrait du cumul.

## Impact coût LLM

Environ 1 100 jetons en entrée (consigne, schéma d'outil, 2 000 caractères d'extrait) et 100 en sortie : 0,00011 $ + 0,00005 $,
soit **environ 0,00016 $ US l'annonce**. Pour les 6 513 offres ouvertes : de l'ordre de **1 $ US une fois**, puis quelques
centimes par semaine pour les nouvelles [Probable : calculé sur les prix publiés de Haiku 5.5, 0,10 $ / 0,50 $ par million de
jetons, pas mesuré]. **La mesure réelle est la preuve de la tâche** : le bloc `usage` du hub, après un premier lot.

## Ce que cet ADR ne décide pas

- **L'entrée dans la note et la levée du plafond de 85** : JobAI#212, après la mesure (JobAI#211) sur les offres que Marc a
  déjà tranchées (postulé, refusé, écarté), seule vérité terrain disponible.
- **Le texte complet de l'annonce.** La décision de Marc dit « garder le texte complet » ; ce qui est gardé reste l'extrait de
  2 000 caractères (ADR-0025). La lecture porte donc sur le début de l'annonce, et `caracteresLus` le dit pour chaque lecture. Si la
  mesure montre que la fin des annonces compte, une tâche étendra l'extrait (13 Mo pour 2 000 caractères × 6 500 offres : le volume
  est à recalculer avant). [À trancher avec Marc sur les chiffres de JobAI#211]
- **Une passe automatique** sur les nouvelles offres : elle n'a d'intérêt qu'une fois la lecture dans la note.

## Alternatives rejetées

- **Une colonne sur `offers`** : voir plus haut (fuite vers les chemins qui recopient une offre).
- **Lire d'abord toutes les offres par un cron** : une dépense quotidienne sans geste, pour une lecture qui ne sert encore à rien.
- **Laisser le modèle donner la note** : ce serait un second barème, invérifiable ligne à ligne. Il donne un rôle, que le code sait
  comparer à celui des mots-clés.
- **Un modèle plus gros** : la tâche est de classer un texte court, pas de raisonner (ADR-0035).

## Risques

- **R1 — le modèle lit une annonce qui lui dit quoi répondre.** Elle est de la donnée balisée, le modèle n'a aucun outil, et sa
  sortie est un rôle, un entier et trois phrases bornés : le pire effet est une lecture fausse sur UNE offre, visible dans le
  tableau de JobAI#211. Aucune note n'en dépend avant JobAI#212.
- **R2 — une raison recopie une donnée personnelle** : expurgée avant stockage ; l'extrait lu l'était déjà.
- **R3 — le lot dépense sans qu'on le voie** : borné à 20, compté dans `usage`, jamais lancé seul.
- **R4 — une lecture écrite avec un cadre périmé** : `version` et `modele` sont gardés avec chaque lecture ; une ligne illisible
  est comptée (`lecturesIllisibles`), jamais devinée.

## Méthode de test

`tests/lectureAnnonce.test.ts`, sur données fictives et un SDK remplacé : validation en bloc, expurgation, un seul compte par
appel y compris quand la réponse est refusée, annonce en bloc de données et absente de la consigne, rôle des mots-clés égal à
`pointsRole[roleDe]`, file série, lots bornés, choix des annonces, outil MCP de bout en bout (rien écrit au suivi, rien relu, pas
d'appel payant quand une source est muette). En production, après déploiement : un lot de `lire_annonces`, le coût lu dans `usage`.
