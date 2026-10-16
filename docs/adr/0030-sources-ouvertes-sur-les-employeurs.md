# ADR-0030 — Les sources ouvertes sur les employeurs : ce qui est admis, et comment on les lit

**Date** : 2026-10-16 · **Statut** : Proposé — tâche JobAI#160 (mission JobAI#147, plan « analyse du CV et dossier
employeur », étape B2). Garde-fou n°4 : un ADR AVANT toute nouvelle source. Ce texte pose les règles ; la section
« Mesure » reçoit les chiffres lus en production, dans une PR de documentation qui suit le déploiement de la sonde.

## Contexte

Aucune source sur les employeurs n'est lue aujourd'hui, et leur disponibilité depuis l'app n'a jamais été vérifiée : une
session Claude ne voit pas le monde (sa passerelle refuse la plupart des hôtes), et le registre des entreprises est
derrière Cloudflare, qui a refusé l'adresse des runners GitHub. Vérifié depuis la session le 2026-10-16 : le fichier du
registre (ZIP de 269 Mo, plages d'octets acceptées) et le RENA (JSON de 1,6 Mo) y répondent ; seule l'app déployée dit si
Vercel passe aussi.

## Décision

**Trois sources sont admises à la MESURE** — publiques, officielles, à licence ouverte — et aucune ne touche encore la
notation :

1. **Registre des entreprises du Québec (REQ), fichier de données ouvertes.** Licence CC-BY-NC-SA 4.0 : usage personnel et
   non commercial, partage dans les mêmes conditions. JobAI sert la recherche d'emploi de Marc, rien n'est revendu, et le
   dépôt ne contient AUCUNE donnée du registre (il est public) : on lit, on compte, on ne recopie pas. Lecture de la seule
   entrée `Nom.csv` (NEQ et dénominations) du ZIP, par plages d'octets (fin du ZIP, répertoire central, plage de l'entrée),
   jamais le ZIP entier. Ni administrateurs, ni actionnaires, ni adresses (garde-fou n°1).
2. **Registre des entreprises non admissibles aux contrats publics (RENA), Données Québec, CC-BY 4.0.** On ne lit que le
   nom de l'entreprise ; les colonnes qui nomment des personnes ne sont jamais lues.
3. **Catalogue de données ouvertes du Canada (CKAN), pour les salaires par code de profession.** La clé de ces salaires est
   le code de profession : la couverture se mesure en part d'offres suivies qui portent un code, pas en employeurs. Le
   jeu de données précis se choisit après la mesure.

**Aucun scraping** : ni la recherche en ligne du registre, ni aucune page web. Seuls des fichiers et des API publiés pour
être consommés. La sonde s'identifie honnêtement (`JobAI-sonde/1.0`) et ne se fait pas passer pour un navigateur : un
refus de Cloudflare est une mesure, pas un obstacle à contourner.

**Un rattachement par nom est un indice, pas une identité.** Égalité des noms normalisés (même règle que la liste et la
carte), jamais de sous-chaîne. Un nom qui répond à plusieurs NEQ est « ambigu » et ne compte pas comme trouvé. Un employeur
« en cause » dans le RENA n'est jamais affiché comme tel sur la foi d'une simple égalité de nom : une vérification humaine
d'abord (un homonyme pourrait être accusé à tort).

**L'outil MCP `sonde_employeurs` est en lecture seule, ne rend aucun nom d'entreprise, et n'écrit rien.** Un taux n'est
valide que si le `fin` de sa source vaut « termine » ; un budget de temps épuisé rend des comptes partiels, jamais un
pourcentage.

## Alternatives rejetées

- **Interroger la recherche en ligne du registre, entreprise par entreprise** : du scraping, que le garde-fou n°4 interdit.
- **Charger le registre en base** : la licence l'admet pour un usage personnel, mais 650 Mo bruts pour une mesure de
  rattachement et un recoupement de noms n'ont aucune raison d'être stockés avant qu'un usage soit décidé.
- **Rapprocher par sous-chaîne pour « retrouver plus »** : c'est le défaut d'`apparier` (« Robert » / « Groupe Robert »),
  qui fabrique des rattachements faux avec l'allure d'une mesure.

## Conséquences

- Aucune colonne, aucune migration, aucune route de plus ; un outil MCP en lecture seule.
- Chaque usage futur de ces sources (afficher un NEQ, un signal d'inadmissibilité, un salaire de référence) est une tâche
  à part, avec son propre ADR si elle ajoute une source ou change la notation.

## Mesure

À compléter avec les chiffres lus en production (JobAI#160) : taux de rattachement au REQ (uniques, ambigus), employeurs
en cause dans le RENA (un compte), couverture des codes de profession et catalogue des salaires.
