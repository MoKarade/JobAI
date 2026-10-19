# ADR-0034 — Comparer les exigences d'une offre à la fiche de compétences, au clic, pour les meilleures offres

**Date** : 2026-10-19 · **Statut** : Proposé — tâche JobAI#157 (mission JobAI#147, plan « analyse du CV et dossier
employeur », étape A4). Dépend de la fiche de compétences (ADR-0033). Coût IA : un appel Haiku par clic.

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

Haiku 4,5, entrée ≈ 1 200 jetons (vocabulaire 25 lignes + extrait de 2 000 caractères au plus), sortie ≤ 1 500 jetons
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

À remplir avec le résultat mesuré (voir HANDOVER du 2026-10-19).

## Retour arrière

Retirer le bouton et l'action : aucune donnée, aucune migration, aucune note n'est concernée.
