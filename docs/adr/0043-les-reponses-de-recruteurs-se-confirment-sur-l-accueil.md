# ADR-0043 — Les réponses de recruteurs se confirment d'un geste sur l'accueil

**Date** : 2026-10-22 · **Statut** : proposé (JobAI#219, mission JobAI#105). Coût IA : nul. Suite d'ADR-0041 (accès Gmail) et d'ADR-0042 (propositions de statut).

## Contexte

`propositions_statut` (ADR-0042) sait lire la boîte de Marc et proposer un statut avec sa phrase source, mais seulement quand Claude l'appelle. Marc met encore à jour ses candidatures à la main. Il faut les propositions **sous ses yeux, à l'accueil**, avec un geste pour les accepter — sans jamais écrire un statut à sa place (garde-fou n°2).

## Décision

1. **Un bloc « Réponses de recruteurs »** entre les trois chiffres et le détail du suivi. Il liste, par offre, le statut actuel, le statut proposé, la phrase du courriel qui le justifie, l'expéditeur (nom d'affichage, jamais l'adresse) et la date de réception. **Il n'apparaît que s'il y a quelque chose à confirmer** : une liste de gestes en attente, comme les relances, pas un tableau d'état. L'état de la connexion Gmail reste lisible dans `etat_synchro`.
2. **Deux gestes, des boutons de 48 px** (`--touche`, au-dessus des 44 px exigés) : « Confirmer : <statut> » et « Écarter ». Couleurs en variables, classes du socle (`.bouton`, `.bouton-principal`, `.bouton-second`).
3. **« Confirmer » écrit, par `modifierOffre`** — le chemin du menu de statut (même validation, même date d'envoi, même revalidation). Le statut posé est **celui que le serveur a gardé pour ce courriel**, jamais une valeur envoyée par le client. Si Marc a déjà changé le statut à la main depuis la lecture, rien n'est écrit et le dit (une offre ne recule jamais, ADR-0042).
4. **« Écarter » n'écrit rien dans le suivi.** Il garde seulement l'identifiant du courriel (`sync_state`, clé `gmail-traitees`, 300 derniers) pour qu'il ne revienne pas.
5. **Gmail n'est jamais lu dans le chemin d'affichage.** L'accueil lit l'état gardé (`gmail-propositions`, une ligne de `sync_state`, aucune migration) ; la relecture de la boîte part **après la réponse** (`after()`), réservée par `reserverPasse` au plus une fois par quart d'heure, sur 14 jours et 30 courriels (plus étroit que l'outil MCP : celle-ci se rejoue). Un refus de Google ou un accès non configuré laisse l'état gardé intact ; l'erreur est journalisée.
6. **Le texte d'un courriel est une donnée** : rendu comme texte par React (jamais en balisage), assaini à la lecture (extrait expurgé par `expurgerPII`, sujet aussi).
7. **L'état gardé est validé à la frontière** (Zod) : une ligne illisible ou d'une autre forme vaut « rien gardé », jamais une proposition inventée.

## Ce que cette tâche ne fait pas

Elle ne change aucune règle de lecture du sens ou de rapprochement (ADR-0042), ne lit pas le corps des courriels, n'envoie rien, n'étiquette rien dans Gmail. Un refus n'est pas archivé ni la candidature fermée : le statut passe à « Refusée », le reste est à Marc.

## Limites connues

- Au 2026-10-22 la boîte de Marc ne contient aucune réponse de recruteur sur 60 jours (ADR-0042, mesure) : en production, le bloc est donc vide et invisible tant qu'une réponse n'arrive pas. La preuve en production de l'affichage attend cette première réponse.
- Le délai de relecture (15 min) signifie qu'une réponse arrivée à l'instant apparaît au plus tard au deuxième chargement après ce délai.
