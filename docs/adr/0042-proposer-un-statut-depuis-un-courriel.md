# ADR-0042 — Proposer un statut depuis un courriel de recruteur : des mots-clés, une offre ou rien, jamais d'écriture

**Date** : 2026-10-21 · **Statut** : proposé (JobAI#218, mission JobAI#105). Coût IA : **nul** (mots-clés, aucun modèle). Suite d'ADR-0041 (accès Gmail en lecture seule).

## Contexte

JobAI#107 lit les courriels reçus de Marc. Un courriel de recruteur dit souvent où en est une candidature (accusé de réception, entrevue, refus, offre), mais le statut appartient à Marc (garde-fou n°2 : `lib/suivi.ts` n'écrit que sur son geste). Il faut donc **proposer**, avec la preuve sous les yeux, et **s'abstenir** dès que le rapprochement ou le sens est douteux (protocole de précision, `docs/claude/11-protocole.md`).

## Décision

1. **Deux fonctions pures**, sans I/O : `lib/gmail/rapprochement.ts` (courriel → UNE offre ou aucune) et `lib/gmail/proposition.ts` (sens du courriel → statut proposé).
2. **Rapprochement.** Signal principal : l'enseigne de l'offre (`cleEnseigne`, mot entier, 4 caractères au moins) dans le nom d'affichage, le sujet ou l'extrait, ou égale à un segment du domaine de l'expéditeur. Plusieurs offres de la même enseigne : le titre du poste repris (deux mots significatifs au moins, un seul meilleur score) ; à défaut, l'unique offre dont le CV est parti ; sinon **ambigu → aucune proposition**. Jamais de sous-chaîne (« Zorbex » n'est pas « Zorbexa »).
3. **Sens.** Phrases-clés françaises et anglaises sur texte normalisé (sans accents ni ponctuation). Un seul sens ressort, ou rien : refus + accusé → refus (les refus recopient la formule d'accusé) ; accusé + entrevue → entrevue ; toute autre combinaison (refus + entrevue, entrevue + offre, accusé + offre) → **incertain, aucune proposition**.
4. **Un statut ne recule jamais.** Accusé → `CVenvoye` seulement si l'offre est `Identifiee` ; entrevue seulement depuis `Identifiee`, `CVenvoye` ou `Relance` ; refus jamais sur `Refusee` ni `Offre` ; offre sur tout sauf `Offre`.
5. **Un courriel par offre** : le plus récent qui propose quelque chose ; les autres sont comptés.
6. **Lecture seule, à deux niveaux.** L'outil MCP `propositions_statut` (`readOnlyHint: true`) ne rend que des propositions : `statutPropose`, `statutActuel`, la **phrase source** (extrait déjà expurgé), le sujet (expurgé), le nom d'affichage de l'expéditeur (jamais l'adresse), les indices de rapprochement. L'écriture reste `modifier_suivi`, sur le geste de Marc. Le texte d'un courriel est une donnée (garde-fou n°6) : assaini par `sanitizePromptText`, jamais obéi ; une consigne glissée dans un courriel ne change pas le sens lu (test).
7. **Les abstentions sont un résultat.** Le bilan compte chaque courriel écarté avec sa raison (`sans-signal`, `sens-incertain`, `aucune-offre`, `plusieurs-offres`, `deja-a-jour`, `courriel-plus-recent`) : c'est ce compte, relu sur de vrais courriels, qui dit si les phrases-clés sont trop étroites ou trop larges.
8. **Sans accès Gmail, l'outil le dit** (état nommé + étape à faire, JobAI#201) au lieu de rendre une liste vide : « pas d'accès » ≠ « aucune réponse ».

## Mesure sur courriels réels : 2026-10-22

Accès Gmail ouvert par Marc le 2026-10-21 (JobAI#201). `propositions_statut` appelé en production le 2026-10-22 (`jours` 60, `max` 50) : **4 courriels lus** (boîte de réception, 60 jours, sans promotions, réseaux sociaux ni forums), **0 proposition**, **4 `sans-signal`**, 0 `sens-incertain`, 0 `aucune-offre`, 0 `plusieurs-offres`, 0 `deja-a-jour`. Aucune offre n'a été modifiée.

Ce que ce résultat dit : aucun des 4 courriels ne porte de phrase-clé de réponse de recruteur, donc rien n'a été proposé à tort (précision : aucune proposition fausse, sur zéro proposition). Ce qu'il ne dit pas : le rappel (les réponses manquées) n'est pas mesurable sans réponse réelle dans la boîte, et 4 courriels ne suffisent pas à juger les phrases-clés. La mesure se refait à la première réponse de recruteur reçue : Marc juge chaque proposition (juste / fausse) et chaque abstention `sens-incertain` ou `plusieurs-offres` (à tort / à raison), et on consigne les comptes ici. Seuil visé : **aucune proposition fausse** ; une proposition fausse corrige la règle avant tout usage par l'écran (JobAI#219). Un modèle ne s'ajoute que si la mesure montre des abstentions à tort nombreuses, dans le repère de 20 $/mois.

## Limites connues [Probable]

- Les phrases-clés ne couvrent que le français et l'anglais, et que ce que Gmail met dans l'`extrait` (~200 caractères) : un refus dit plus bas dans le courriel n'est pas vu, il tombe en `sans-signal`.
- Une enseigne au nom très courant ou à un seul mot générique peut se rattacher à tort par le texte ; le nom d'affichage et le domaine pèsent autant que l'extrait, pas davantage. La mesure ci-dessus tranchera.
