# ADR-0008 — « Poste de nuit » : le sombre devient l'identité, l'épure cesse d'être une soustraction

- **Statut** : accepté
- **Date** : 2026-08-13
- **Décideur** : Marc, sur maquette (trois directions proposées, une retenue, densité réglée
  au curseur)

## Contexte

Marc : « on dirait un logiciel de gestion tellement c'est moche et plat ».

C'est le troisième passage sur l'apparence de l'app, et les deux premiers expliquent le
troisième :

- **ADR-0003 (2026-07-28)** a emprunté la mise en page de FinanceAI et gardé l'ambre.
- **Le 2026-08-05**, sur la demande « plus simple, plus rond, plus propre », l'écran a été
  épuré : ombres retirées, contours retirés, liserés de palier retirés, cinq tuiles de
  compteurs réduites à une barre, ambre déclarée « rare ».

Chacun de ces gestes, pris isolément, était juste : l'écran d'avant empilait ombre + rayon +
liseré sur chaque offre, et ces trois signaux se neutralisaient. Le diagnostic était bon.

Mais **rien n'est venu remplacer ce qui partait**. Le résultat est un fond gris très clair
portant des rectangles blancs sans contour, sans ombre et presque sans couleur — la
définition d'un logiciel de gestion. C'est le constat central de cet ADR :

> Retirer ce qui est laid ne produit pas du beau. Ça produit du neutre.

Une épure est un demi-travail : elle libère la place, elle ne la remplit pas. Il manquait un
geste POSITIF — un monde, pas un nettoyage.

## Décision

Adopter **« Poste de nuit »** : une direction **sombre en identité**, chaude, dont la
profondeur est réelle et assumée.

1. **Neutre chaud (~90°) dans les deux thèmes**, au lieu du bleu-gris (265°). Un gris neutre
   se lit comme un défaut de fabrique ; un gris tiré vers l'ambre se lit comme un choix. La
   teinte étant la même en clair et en sombre, les deux thèmes sont la MÊME app.
2. **Le sombre porte l'identité**, le clair en est le pendant fidèle — pas l'inverse. C'est
   le soir qu'on regarde des offres, pas le matin. Charbon **chaud**, jamais le bleu-noir
   habituel : c'est sur une teinte tiède que l'ambre publiée au hub devient lumineuse au
   lieu de jurer. Trois niveaux de surface qui s'éclairent en montant (fond → carte →
   relief).
3. **Le contour revient sur les surfaces** — revirement assumé du 2026-08-05 (voir plus bas).
4. **Densité 1,20.** Un fond sombre pèse plus lourd qu'un fond clair : il lui faut PLUS
   d'air, pas autant. Valeur réglée par Marc au curseur sur maquette, pas devinée.
5. **Le tableau de bord devient un entonnoir** : quatre étages proportionnels (suivies → CV
   envoyés → réponses → entrevues). Cinq nombres alignés ne disaient rien de leur RAPPORT —
   que 8 CV pour 38 offres, c'était la vraie information, et elle n'apparaissait nulle part.
6. **Une jauge de distance** sous chaque kilométrage, un segment par palier du barème.
7. **Les tuiles de la carte sont assombries par filtre CSS** en thème sombre.

**Ce qui NE change pas** : l'ambre `#f2a31b` reste `app.color` publiée au hub (ADR-0003
tient sur ce point) ; `lib/couleurNote.ts` reste la source de la couleur d'une note ; les
routes, les composants et les tests sont intacts.

## Pourquoi le contour revient

La règle du 2026-08-05 — « une carte blanche sur un fond gris se détache déjà, la lumière
suffit » — est **vraie en clair et fausse en sombre**.

Mesuré sur les jetons : entre le fond (18,2 %) et une carte (22,2 %), l'écart de clarté est
de 4 points. En clair, entre 96,5 % et 99,4 %, il est de 2,9 points — et c'était **déjà**
trop faible. Sans trait, les cartes fondent dans le fond : c'est très exactement le « plat »
que Marc signale.

Un seul trait, très discret, et **aucune ombre au repos** : on ne réempile pas les trois
signaux de l'écran d'avant. Le palier d'une offre continue de se dire par le cercle de sa
note, jamais par un liseré.

## Impact quotas / coût

Nul. Aucune dépendance ajoutée, aucun appel réseau nouveau, aucun domaine externe de plus.
Le poids CSS varie de quelques centaines d'octets.

Le filtre des tuiles a été choisi **contre** un fournisseur de tuiles sombres (CartoDB) :
celui-ci aurait ajouté un domaine à la frontière réseau de l'app pour un gain esthétique.

## Analyse de risques

- **Le filtre de tuiles inverserait les épingles s'il visait le conteneur.** La couleur d'une
  épingle vient de `couleurNote` et ENCODE une donnée : l'inverser ferait lire un 92 en
  violet. Le filtre vise donc `.leaflet-tile-pane` seul — les épingles vivent dans
  `.leaflet-overlay-pane`. C'est cette séparation qui rend le geste sûr.
- **La jauge de distance pouvait dupliquer le barème.** Elle lit `PALIERS_DISTANCE_KM`, que
  `scoreDistance` applique elle-même : une règle, un exemplaire. Verrouillé par test (voir
  ci-dessous) — sans quoi un seuil réglé dans la fonction laisserait l'écran décrire un
  barème périmé, sans qu'aucun test ne tombe.
- **Le thème clair reste le point faible connu.** Il est cohérent (même teinte, même
  structure, même échelle) mais il ne porte pas l'identité comme le sombre. C'est le coût
  annoncé de la direction, accepté par Marc.

## Méthode de test

- `tests/scoring.test.ts` — trois cas verrouillent le couplage jauge ↔ barème : points à la
  borne exacte, bascule au palier suivant juste au-dessus, ordre et couverture de la table.
  **Discrimination prouvée** : en réintroduisant des seuils en dur dans `scoreDistance`
  (12 km au lieu de 10), le test tombe ; restauré, il passe.
- Gate complet vert avant livraison : `typecheck` + `test` + `lint` + `build`.
- Le rendu lui-même a été validé sur maquette avant d'écrire une ligne de CSS — trois
  directions montrées sur les VRAIES offres, puis la densité réglée au curseur.

## Conséquences

**Positif** — l'app a un monde plutôt qu'une absence de bruit ; la profondeur répond au grief
principal ; l'entonnoir et la jauge rendent visibles deux informations qui existaient déjà
en base sans jamais atteindre l'écran.

**Négatif** — le thème clair est désormais le parent pauvre. Il fonctionne, il n'enchante pas.

**Risques acceptés** — le filtre CSS sur les tuiles donne un rendu moins juste qu'un vrai
fond de carte sombre (les teintes des parcs et de l'eau virent). Prix assumé pour ne pas
ajouter de domaine externe.

## Alternatives rejetées

- **« Chantier »** (signalisation industrielle, clair, contraste dur, mono capitales) —
  la plus affirmée, écartée par Marc.
- **« Dossier »** (papier froid, Georgia à grande échelle, filets) — la plus sobre, écartée :
  c'est aussi celle qui ressemblait le plus à l'existant, donc celle où le risque de
  retomber dans le plat était le plus élevé.
- **Continuer d'épurer** — c'est précisément ce qui a produit le problème. Une quatrième
  soustraction aurait donné un écran encore plus neutre.
- **Un fournisseur de tuiles sombres** — un domaine externe de plus pour de l'esthétique.
- **Imposer le sombre et retirer le thème clair** — `prefers-color-scheme` décide, c'est la
  règle de la maison ; supprimer le clair aurait réglé le point faible en trahissant l'usage
  de qui travaille en clair.

## Réversibilité

Totale, et c'est ce qui rend la décision peu risquée : le changement vit dans les jetons CSS
et deux composants. Aucun schéma, aucune donnée, aucune route touchée. Revenir en arrière est
un `git revert`.
