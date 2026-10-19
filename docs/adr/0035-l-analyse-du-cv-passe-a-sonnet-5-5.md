# ADR-0035 — L'analyse du CV passe à Sonnet 5.5, les autres appels à Haiku 5.5, et le coût se chiffre par modèle

**Date** : 2026-10-19 · **Statut** : Proposé — tâche JobAI#158 (mission JobAI#147, plan « analyse du CV et dossier
employeur », étape A5). Coût IA : oui, l'analyse d'un CV coûte environ deux fois plus par jeton qu'avant.

## Contexte

Tous les appels du dépôt utilisaient Haiku 4.5 (ADR-0009 : « Haiku suffit largement »). La règle de Marc est « dernière
génération seulement ». Depuis l'ADR-0033, l'analyse du CV rend aussi la fiche de compétences et les faits qui serviront
en entrevue : c'est la lecture la plus lourde du dépôt, et elle n'a lieu qu'une fois par CV, sur un geste de Marc.

## Décision

1. **L'analyse du CV appelle `claude-sonnet-5-5`** (`lib/cv/extraction.ts`). Prix relus le 2026-10-19 sur la page de
   tarifs de l'API : 2 $ par million de jetons en entrée, 10 $ en sortie. Source de l'identifiant : la page « Models
   overview » de la même documentation.
2. **Les trois autres appels passent à `claude-haiku-5-5`** (comparaison d'offre, brouillon de candidature, tendances de
   la veille). C'est le choix de Marc, tapé sur la carte du fil le 2026-10-19 (« Haiku 5.5 ») ; la tâche demandait de le
   trancher avec lui. Haiku 5.5 est publié à 0,10 $ / 0,50 $ par million de jetons (grille des prompts de 100 000 jetons
   ou moins ; 0,50 $ / 2,50 $ au-delà), soit dix fois moins que Haiku 4.5, et c'est la dernière génération. Réglages,
   relus dans la documentation de Haiku 5.5 :
   - **L'appel forcé d'outil est accepté** (contrairement à Sonnet 5.5) : comparaison et brouillon gardent
     `tool_choice` « tool ». Le modèle ne pense alors pas avant l'outil.
   - **Les tendances (texte libre) passent à l'effort `low`.** Haiku 5.5 pense par défaut (effort `medium`) et la pensée
     se facture au prix de sortie ; quatre phrases sur des chiffres donnés n'en demandent pas.
   - **Aucun `temperature`, `top_p` ni `top_k`** (un autre que le défaut rend 400) : le dépôt n'en envoie aucun.
   - **Les plafonds de sortie montent d'un tiers environ** (tokenizer plus gourmand de 30 % pour le même texte, pensée
     comprise dans `max_tokens`) : tendances 700 → 1 200, brouillon 3 000 → 4 000, comparaison 1 500 → 2 000.
   - **Le prix est dans `PRIX_PAR_MODELE`** avec la grille basse : les trois appels envoient quelques milliers de jetons,
     très loin des 100 000. Un appel qui les dépasserait serait sous-estimé dans le bloc `usage`.
3. **Sonnet 5.5 refuse l'appel forcé d'outil.** `tool_choice` « tool » ou « any » rend une erreur 400 sur ce modèle
   (documentation de Sonnet 5.5). L'appel passe donc à `tool_choice: auto`, et la consigne dit d'appeler l'outil
   `rendre_profil`. Un modèle qui répondrait en texte donne « pas de résultat structuré » et son appel est compté.
   `strict` n'est pas posé : le schéma est déjà validé par Zod, et le mode strict limite les mots-clés de schéma admis.
4. **Pas de pensée avant l'outil.** Au défaut (pensée adaptative, effort « high ») le modèle réfléchit avant de
   répondre, et cette pensée se facture au prix de sortie. L'extraction recopie un document : `thinking: between_tools`
   et `effort: medium`, qui coupe la pensée d'avant l'outil.
5. **`max_tokens` passe de 5 000 à 8 000.** Le tokenizer de Sonnet 5.5 découpe le même texte en plus de jetons ; une
   réponse coupée par la limite est un échec dit, pas une fiche vide.
6. **Le compteur de coût devient un compteur PAR MODÈLE.** Un jeton de Sonnet ne coûte pas le prix d'un jeton de Haiku :
   les compter ensemble au prix de Haiku aurait sous-estimé le coût du CV de moitié, dans le bloc `usage` du hub.
   `enregistrerUsageLlm(usage, modele)` : le nom du modèle est obligatoire à chaque site d'appel. Les prix sont dans
   `PRIX_PAR_MODELE` (`lib/coutLlm.ts`) ; un modèle sans prix connu n'est jamais facturé au prix d'un autre, son appel
   est compté « non mesuré » et le montant est publié comme sous-estimé. Un test refuse tout identifiant de modèle écrit
   dans `lib/` qui n'a pas de prix.
7. **Le compteur déjà en base se relit sans migration.** L'ancien format, à plat, est lu comme celui de Haiku 4.5 : c'est
   exact, aucun autre modèle n'avait été appelé. Le premier appel écrit le nouveau format (`parModele`).

## Impact coût LLM

Une analyse : un CV de quelques milliers de mots fait environ 5 000 à 15 000 jetons d'entrée et 3 000 à 6 000 en sortie,
soit environ 0,04 à 0,09 $ US avec Sonnet 5.5, contre 0,02 à 0,04 $ avec Haiku 4.5 [Probable : ordre de grandeur calculé
sur les prix publiés, pas mesuré]. **La mesure réelle est la preuve de la tâche** : elle se lit dans le bloc `usage` du
hub après la prochaine analyse de Marc. Le cumul mensuel de référence (20 $ CA) n'est pas un plafond dur (« surveiller »,
16/10).

Les trois autres appels, à Haiku 5.5 : une comparaison d'offre (≈ 1 600 jetons d'entrée, ≤ 2 000 en sortie) coûte au plus
de l'ordre de 0,001 $ US, un brouillon de candidature et une analyse des tendances de l'ordre de quelques millièmes de
dollar [Probable : calculé sur les prix publiés, pas mesuré]. C'est environ dix fois moins qu'à Haiku 4.5.

## Risques

- **R1 — Le modèle répond en texte au lieu d'appeler l'outil.** Sans appel forcé, c'est possible. Visible : l'analyse dit
  « pas de résultat structuré (fin : …) ». Remède : relancer ; si cela se répète, poser `strict` sur l'outil.
- **R2 — L'API refuse un paramètre.** `thinking: between_tools` et `output_config.effort` sont décrits dans la
  documentation de Sonnet 5.5 et typés par le SDK installé, mais **aucun appel réel n'a été fait depuis cette session**
  (pas de clé). Visible : l'analyse affiche « Appel à l'API refusé… » avec le message de l'API. Retour arrière : une ligne.
- **R3 — Qualité de la fiche.** Un modèle plus fort devrait mieux recopier les phrases ; c'est la relecture de la fiche
  avec Marc (JobAI#155) qui le dira, la vérification du code (phrase retrouvée dans le CV) reste le filet.

- **R4 — Haiku 5.5 non éprouvé en réel pour ces trois appels** (pas de clé dans la session). Visible : « Appel à l'API
  refusé… » avec le message de l'API, ou « pas de liste structurée » / « brouillon coupé ». Retour arrière : remettre le
  nom du modèle et les trois plafonds ; le prix de Haiku 5.5 peut rester dans `PRIX_PAR_MODELE`.
- **R5 — qualité des textes de Haiku 5.5** (brouillon, tendances) : jugée à l'usage par Marc ; la vérification du code
  (phrases retrouvées dans l'annonce ou le CV) reste le filet des deux appels qui citent.

## Retour arrière

Pour l'analyse du CV : remettre `MODELE = "claude-haiku-4-5-20251001"`, `tool_choice` forcé et retirer `thinking` /
`output_config` dans `lib/cv/extraction.ts`. Pour les trois autres appels : remettre le nom `claude-haiku-4-5-20251001`
et les anciens plafonds. Le compteur par modèle reste valide et n'a pas à être touché.

⚠️ **Pas de `git revert` complet de la PR une fois que `parModele` est écrit en base** : l'ancien code ne sait pas lire ce
format, il publierait « illisible » et n'écrirait plus rien. Revert partiel seulement (l'appel du CV), ou reconvertir
le JSON du compteur à plat en base avant de revenir.
