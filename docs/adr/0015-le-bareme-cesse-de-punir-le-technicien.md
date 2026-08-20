# ADR-0015 — Le barème cesse de punir le titre de technicien

**Statut** : Proposé — réponses de Marc du 2026-08-20, après lecture de son CV
**Relève du** : §8 du CLAUDE.md (protocole de précision)
**Débloque** : le volet D3 d'ADR-0014, qui attendait le CV. Il est lu ; ce qui suit le remplace.

## Ce que le CV a montré

Le parcours de Marc va d'un poste de responsable technique à un poste de chargé de projet,
puis à un poste dont le TITRE est celui d'un métier technique alors que les responsabilités
décrites incluent l'encadrement d'une équipe. Trois niveaux de titre en trois ans, dont le
dernier « redescend » sur le papier sans redescendre dans les faits.

⚠️ **C'est exactement le cas que le barème traite le plus mal.** `scoreFitRole` rend
`pointsRole.technicien` — 14 sur 40 — dès qu'un titre contient « technicien » sans mot de
coordination, et le commentaire du code dit pourquoi : « recul hiérarchique par rapport au
poste actuel ». La règle suppose un poste actuel de niveau supérieur, stable et lisible dans
un titre. Aucune des trois suppositions ne tient ici.

Interrogé, Marc a répondu que **les deux niveaux l'intéressent également**. La pénalité n'a
donc pas seulement une prémisse fausse : elle écarte des offres qu'il veut voir.

## D1 — Un titre de technicien vaut ce que vaut un contenu technique

`pointsRole.technicien` passe de 14 à la valeur de `pointsRole.technique`. Un poste technique
sans encadrement vaut la même chose, que son titre porte le mot « technicien » ou non.

⚠️ **La branche n'est pas supprimée, elle est ré-évaluée.** `scoreFitRole` continue de
distinguer les deux cas, parce que la distinction reste vraie et qu'un futur profil — un
Marc de 35 ans avec dix ans d'encadrement derrière lui — voudra peut-être la repénaliser.
Effacer la branche rendrait ce réglage impossible sans réécrire la fonction ; changer sa
valeur le laisse à portée d'une constante.

## D2 — Une exigence d'expérience hors d'atteinte pénalise doucement

Marc a demandé que ça « diminue le score mais pas drastiquement ». `senioritePlancher` passe
de 5 à 7 : l'écart maximal entre « aucune exigence » (11) et « exigence hors d'atteinte »
tombe de 6 à 4 points, et l'écart entre le meilleur cas (15) et le pire de 10 à 8.

⚠️ **Les paliers eux-mêmes ne bougent PAS**, et c'est délibéré :
`paliersSenioriteDepuisAnnees` les recalcule à partir des années d'expérience réelles dès que
le CV est déposé dans l'app. Les figer ici sur une valeur devinée entrerait en collision avec
ce calibrage automatique le jour où il s'active — deux sources pour la même règle, la faute
la plus chère de ce dépôt.

## Ce qui reste hors de ce lot, et pourquoi

**Le niveau hiérarchique d'une offre n'est pas mesuré**, et il ne le sera pas ici. Marc a
répondu « tout ça » à la question de la direction de carrière : monter, approfondir, viser
mieux, basculer vers la gestion de projet. Aucune direction n'est donc à privilégier — et un
score de progression qui ne privilégie aucune direction ne serait qu'un bruit ajouté à la
note. La bonne réponse à « tout ça » est de ne rien pénaliser, pas d'inventer une échelle.

**Aucun fait personnel n'entre dans le code.** Le dépôt est public. Les années d'expérience,
les titres occupés et les outils vivent dans le profil en base, remplis par le dépôt du CV
dans l'app (ADR-0009). Ce lot ne touche que des constantes de barème, valables pour
n'importe quel profil.

## Impact quotas et coût

Aucun appel réseau, aucun appel LLM. Deux constantes.

## Méthode de test

1. **Audit §8 sur toutes les offres du seed**, avant/après, rendu avant modification du
   pipeline. L'écart attendu est concentré sur les titres de technicien.
2. **Non-régression du plafond** : aucune note calculée ne doit passer au-dessus de 85.
3. **Discrimination prouvée par mutation.**
4. **La somme des pondérations reste 100** (test existant).

## Conséquences

**Positif** — les offres de technicien en automatisation, en régulation, en génie
manufacturier cessent d'être reléguées ; ce sont précisément celles que le parcours de Marc
rend accessibles.

**Négatif** — le barème distingue moins qu'avant. Un jour où Marc ne voudra plus de postes
techniques, il faudra rebaisser la constante — mais c'est UNE constante, et l'ADR dit où.

**Risques acceptés** — le seed contient plusieurs titres de technicien notés à la main :
leurs notes calculées vont se rapprocher des manuelles par le haut. L'audit doit vérifier
qu'aucune ne les dépasse.

## Alternatives rejetées

- **Supprimer la branche `technicien`** : perd la capacité de repénaliser plus tard.
- **Calibrer le barème sur le titre actuel de Marc** : il a répondu que les deux niveaux
  l'intéressent. Choisir pour lui aurait produit un tri qu'il n'a pas demandé.
- **Bâtir un score de progression hiérarchique** : sans direction privilégiée, il n'aurait
  rien mesuré. Voir plus haut.

## Réversibilité

Deux constantes du profil. Les remettre à 14 et 5 rend le barème d'avant, à la ligne près.
