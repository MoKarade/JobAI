# ADR-0034 — Comparer les exigences d'une offre à la fiche de compétences, au clic, pour les meilleures offres

**Date** : 2026-10-19 · **Statut** : Proposé — tâche JobAI#157 (mission JobAI#147, plan « analyse du CV et dossier
employeur », étape A4). Dépend de la fiche de compétences (ADR-0033). Coût IA : un appel Haiku par clic (Haiku 5.5 depuis ADR-0035).

## Contexte

La note lit des mots du titre et un extrait d'annonce ; elle ne dit pas **ce que l'offre exige** ni ce que Marc a déjà
prouvé. La fiche de compétences (ADR-0033) donne enfin, pour chaque compétence du vocabulaire fermé, un niveau et une
preuve tirée du CV. Il manque le pas suivant : poser l'une à côté de l'autre, pour les offres qui méritent d'être lues.

## Décision

1. **Le modèle extrait, le code compare.** Le modèle ne voit **pas** la fiche de Marc. Il lit l'extrait d'annonce
   gardé avec l'offre et rend une liste d'exigences : chacune est une **phrase recopiée de l'annonce** et un identifiant
   du vocabulaire fermé (`lib/competences.ts`), ou `autre` quand l'exigence n'y entre pas. C'est le code qui décide
   ensuite, ligne par ligne :
   - identifiant sur la fiche en `pratique` ou `maitrise` → **tu as**, avec le niveau, la phrase du CV et le poste ;
   - identifiant sur la fiche en `notions` seulement → **notions seulement** ;
   - identifiant absent de la fiche → **il te manque** (sous-entendu : « pas sur ta fiche », pas « tu ne sais pas ») ;
   - `autre` → **hors fiche** : l'annonce le demande, la fiche ne sait pas le comparer. Dit comme tel, jamais rangé
     dans « tu as » ni dans « il te manque ».
2. **Aucune exigence sans source dans l'annonce, vérifiée par le code.** Une ligne est écartée (et la raison dite)
   quand : la phrase fait moins de 8 ou plus de 200 caractères ; elle ne se retrouve pas dans le texte de l'annonce lu
   par le modèle (mise en page, casse, accents ignorés) ; ou, pour un identifiant du vocabulaire, elle ne nomme pas la
   compétence (les `indices` de l'ADR-0033). Une compétence citée deux fois compte une fois. Au plus 15 lignes.
3. **Rien à comparer, rien dit.** Avant tout appel, le code refuse en le disant : pas de fiche (le CV n'a pas été
   ré-analysé depuis l'ADR-0033), pas de texte d'annonce gardé (seule `texteNote` compte ; le repli sur la note de
   provenance n'est pas une annonce), offre périmée ou historique, offre hors des 100 meilleures. Une réponse sans
   aucune exigence valide se dit « aucune exigence repérée », jamais « tout est couvert ».
4. **Les 100 meilleures seulement, au clic seulement.** Rang = 1 + nombre d'offres ouvertes (ni historique ni périmées)
   de note strictement plus haute ; l'offre doit avoir une note et un rang ≤ 100. Pas de passage automatique : l'issue
   permettait « un bouton ou une fois par jour », on retient le bouton, qui ne coûte rien tant que Marc n'y touche pas.
5. **Rien n'est écrit et la note ne bouge pas.** Le résultat est affiché, pas conservé (comme le brouillon de candidature,
   JobAI#108) ; aucun fichier de la notation n'est modifié (`lib/scoring.ts`, `lib/noteOffre.ts` intacts), et le suivi
   de Marc (statut, priorité, date d'envoi, note) n'est pas touché.
6. **Le coût est compté au site d'appel**, dans le même compteur que les trois autres, donc dans le bloc `usage` du hub
   (`enregistrerUsageLlm`, avant toute validation).

## Impact coût LLM

Haiku 4,5 à l'écriture de cet ADR, passé à Haiku 5.5 depuis (ADR-0035) : entrée ≈ 1 200 jetons (vocabulaire 25 lignes à l'origine, 38 depuis le 26/10/2026, + extrait de 2 000 caractères au plus), sortie ≤ 1 500 jetons
(`max_tokens`). Environ 0,003 à 0,01 $ US par clic ; les 100 meilleures offres, comparées une fois chacune, coûteraient
de l'ordre de 0,3 à 1 $ US. Pas de plafond dur (décision de Marc du 16/10 : surveiller) ; le montant s'ajoute au bloc
`usage`.

## Risques

- **R1 — l'extrait est tronqué à 2 000 caractères** (ADR-0025). « Il te manque » parle de ce qui a été lu, pas de
  toute l'annonce : l'écran affiche le nombre de caractères comparés.
- **R2 — le vocabulaire est fermé.** Beaucoup d'exigences réelles (permis, langues, outils hors liste) tomberont en
  « hors fiche ». C'est voulu : mieux vaut « je ne sais pas comparer » qu'un verdict inventé.
- **R3 — le modèle peut rattacher une exigence au mauvais identifiant.** La porte « la phrase nomme la compétence »
  (indices écrits à la main) en arrête une partie ; ce qui passe est montré avec la phrase de l'annonce, que Marc peut
  juger d'un coup d'œil. C'est ce que « 5 offres relues avec Marc » vérifie.
- **R4 — cliquer plusieurs fois sur la même offre paie plusieurs fois.** Rien n'est conservé ; le bouton est désactivé
  pendant l'appel. À rediscuter si la dépense publiée le montre.
- **R5 — texte d'annonce non maîtrisé.** Il passe par `sanitizePromptText` et le balisage de données
  (`baliserDonnees`) ; le modèle n'a aucun outil sauf celui qui rend la liste ; la sortie passe par Zod puis par la
  vérification ci-dessus.

## Audit sur le jeu de départ (protocole de précision)

Mesuré le 2026-10-19 avec `eligibiliteComparaison` sur le jeu de départ (`SEED`, 53 offres, fictives) :

| Constat | Nombre |
| --- | --- |
| Offres du jeu de départ | 53 |
| Ouvertes (ni `histo`, ni périmée) | 38 |
| Avec un `texteNote` non vide | 0 |
| Refusées : « aucun texte d'annonce » | 38 |
| Refusées : périmée ou archivée | 15 |
| Éligibles à la comparaison | 0 |

Lecture : sur le jeu de départ, la fonction ne change rien à aucune offre (aucune n'est éligible), et elle ne touche ni la note ni le suivi. Ce que ça ne dit pas : la part des offres de production qui portent un `texteNote` (pas d'accès à la base depuis cette session). L'audit sur de vraies offres est la preuve de la tâche : 5 offres relues avec Marc, verdict accepté ou refusé, coût lu dans le bloc `usage` du hub.

## Retour arrière

Retirer le bouton et l'action : aucune donnée, aucune migration, aucune note n'est concernée.

## Révision du 2026-10-26 — le vocabulaire passe de 25 à 38 lignes (JobAI#157)

Les cinq comparaisons du 24/10 ont rendu presque tout en « hors fiche » (3 offres hors domaine : 0 couverte ; 2 offres de robotique et de conception électrique : 1 couverte sur 3 et 1 sur 2). Décision de Marc (24/10/2026) : « Élargir le vocabulaire ». Treize lignes s'ajoutent, toutes de **fiche seule** (`reglaNote` faux, aucune expression) : marques de robots, simulation de robots, plateformes d'automates, réseaux industriels, IHM, variateurs et servomoteurs, logiciels de schémas électriques, sécurité des machines, pneumatique et hydraulique, maintenance industrielle, amélioration continue, encadrement d'équipe, électronique embarquée. Elles servent à NOMMER ce qu'une offre demande (donc « il te manque » au lieu de « hors fiche ») ; elles ne lisent aucune offre et ne déplacent aucune note (`lib/scoring.ts` et `lib/noteOffre.ts` intacts, notes identiques). `COMPETENCES_MAX` passe de 25 à 40 (la fiche stockée accepte plus de lignes, rien n'est migré).

Choix des treize lignes : à partir des termes cherchés chaque matin et des métiers visés de Marc, pas d'un relevé des exigences réelles (le texte des annonces n'est lisible que par l'application) [Probable]. Une ligne qui ne sert à rien se retire d'une ligne de code. Une compétence nouvelle n'entre sur la fiche qu'après une ré-analyse du CV (appel payant) et un geste de Marc ; sans cela, toute offre qui la demande dira « il te manque », ce qui est vrai de la fiche actuelle mais pas forcément du CV.
