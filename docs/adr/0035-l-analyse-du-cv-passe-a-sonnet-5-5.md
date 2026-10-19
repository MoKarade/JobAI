# ADR-0035 — L'analyse du CV passe à Sonnet 5.5, et le coût se chiffre par modèle

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
2. **Les trois autres appels restent à Haiku 4.5** (comparaison d'offre, brouillon de candidature, tendances de la
   veille). Leur choix est à trancher avec Marc : la tâche le dit, et rien ici ne le fait à sa place. À savoir pour cette
   décision : Haiku 5.5, plus récent, est publié à 0,10 $ / 0,50 $, soit dix fois moins cher que Haiku 4.5.
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

## Risques

- **R1 — Le modèle répond en texte au lieu d'appeler l'outil.** Sans appel forcé, c'est possible. Visible : l'analyse dit
  « pas de résultat structuré (fin : …) ». Remède : relancer ; si cela se répète, poser `strict` sur l'outil.
- **R2 — L'API refuse un paramètre.** `thinking: between_tools` et `output_config.effort` sont décrits dans la
  documentation de Sonnet 5.5 et typés par le SDK installé, mais **aucun appel réel n'a été fait depuis cette session**
  (pas de clé). Visible : l'analyse affiche « Appel à l'API refusé… » avec le message de l'API. Retour arrière : une ligne.
- **R3 — Qualité de la fiche.** Un modèle plus fort devrait mieux recopier les phrases ; c'est la relecture de la fiche
  avec Marc (JobAI#155) qui le dira, la vérification du code (phrase retrouvée dans le CV) reste le filet.

## Retour arrière

Remettre `MODELE = "claude-haiku-4-5-20251001"`, `tool_choice` forcé et retirer `thinking` / `output_config` dans
`lib/cv/extraction.ts`. Le compteur par modèle reste valide et n'a pas à être touché.

⚠️ **Pas de `git revert` complet de la PR une fois que `parModele` est écrit en base** : l'ancien code ne sait pas lire ce
format, il publierait « illisible » et n'écrirait plus rien. Revert partiel seulement (l'appel du CV), ou reconvertir
le JSON du compteur à plat en base avant de revenir.
