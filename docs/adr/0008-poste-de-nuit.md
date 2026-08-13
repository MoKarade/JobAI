# ADR-0008 — « Poste de nuit » : le sombre devient l'identité, l'épure cesse d'être une soustraction

- **Statut** : accepté — **révisé le jour même** (voir « Révision du 2026-08-13 » en fin de
  document : le thème clair a été retiré)
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

1. **Neutre chaud (~90°)**, au lieu du bleu-gris (265°). Un gris neutre se lit comme un
   défaut de fabrique ; un gris tiré vers l'ambre se lit comme un choix.
2. **Le sombre porte l'identité.** C'est le soir qu'on regarde des offres, pas le matin.
   Charbon **chaud**, jamais le bleu-noir habituel : c'est sur une teinte tiède que l'ambre
   publiée au hub devient lumineuse au lieu de jurer. Trois niveaux de surface qui
   s'éclairent en montant (fond → carte → relief).
   *(Rédigé initialement « le clair en est le pendant fidèle » — la révision de fin de
   document a supprimé le clair.)*
3. **Le contour revient sur les surfaces** — revirement assumé du 2026-08-05 (voir plus bas).
4. **Densité 1,20.** Un fond sombre pèse plus lourd qu'un fond clair : il lui faut PLUS
   d'air, pas autant. Valeur réglée par Marc au curseur sur maquette, pas devinée.
5. **Le tableau de bord devient un entonnoir** : quatre étages proportionnels (suivies → CV
   envoyés → réponses → entrevues). Cinq nombres alignés ne disaient rien de leur RAPPORT —
   que 8 CV pour 38 offres, c'était la vraie information, et elle n'apparaissait nulle part.
6. **Une jauge de distance** sous chaque kilométrage, un segment par palier du barème.
7. **Les tuiles de la carte sont assombries par filtre CSS.**

**Ce qui NE change pas** : l'ambre `#f2a31b` reste `app.color` publiée au hub (ADR-0003
tient sur ce point) ; `lib/couleurNote.ts` reste la source de la couleur d'une note ; les
routes, les composants et les tests sont intacts.

## Pourquoi le contour revient

La règle du 2026-08-05 — « une carte blanche sur un fond gris se détache déjà, la lumière
suffit » — était **vraie sur le fond clair d'alors, fausse sur le charbon**.

Mesuré sur les jetons : entre le fond (18,2 %) et une carte (22,2 %), l'écart de clarté est
de 4 points. Sans trait, les cartes fondent dans le fond : c'est très exactement le « plat »
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
- **Le thème clair était le point faible connu.** Il est cohérent (même teinte, même
  structure, même échelle) mais il ne porte pas l'identité comme le sombre. Ce risque
  annoncé s'est réalisé le jour même : voir la révision en fin de document.

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

**Négatif** — le thème clair est devenu le parent pauvre, puis a été retiré (révision).

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
- ~~**Imposer le sombre et retirer le thème clair**~~ — écartée d'abord au motif que
  `prefers-color-scheme` décide, c'est la règle de la maison. **Retenue quelques heures plus
  tard** : voir la révision ci-dessous.

## Réversibilité

Totale, et c'est ce qui rend la décision peu risquée : le changement vit dans les jetons CSS
et deux composants. Aucun schéma, aucune donnée, aucune route touchée. Revenir en arrière est
un `git revert`.

---

## Révision du 2026-08-13 — le thème clair est retiré

### Ce qui s'est passé

L'ADR ci-dessus annonçait un risque (« le thème clair est le parent pauvre ») et l'acceptait.
Il s'est réalisé le jour même, et pas comme une gêne esthétique : comme un **rapport de bug**.

Marc, devant la version déployée : « c'est pas exactement comme ton preview […] les couleurs
sont pas les mêmes ». Quatre des cinq écarts qu'il signalait étaient de vraies régressions,
corrigées par ailleurs. **Le cinquième n'en était pas une** : son système est réglé en clair,
il regardait donc le pendant fade — pendant que la maquette validée, elle, était sombre.

C'est le vrai enseignement, et il n'est pas esthétique :

> Un second thème qui n'a jamais été montré à la validation n'est pas une option offerte à
> l'utilisateur. C'est une version non validée de l'app, servie au hasard du réglage de son
> système — et le jour où elle s'affiche, elle se lit comme un défaut.

La direction a été choisie sur maquette, la densité réglée au curseur, la couleur arbitrée
écran par écran. Tout ce travail portait sur **une** apparence. L'autre n'a été ni montrée,
ni réglée, ni approuvée.

### Décision

**L'app est sombre, pour tout le monde, tout le temps.** Décision de Marc, sur question
directe : « Sombre imposé, point. »

- `:root` porte les jetons sombres, `color-scheme: dark` déclaré.
- **Aucune `@media (prefers-color-scheme: …)` ne subsiste** dans `app/globals.css` —
  vérifiable par `grep`, et c'est la forme la plus courte de la garantie.
- Les accents sont calibrés une fois, pour le charbon, sans variante (mesurés : texte 15,6:1,
  texte adouci 6,5:1, ambre-texte 8,4:1, bleu-texte 7,0:1 sur surface — tous au-dessus du AA).
- `viewport.themeColor` (`app/layout.tsx`) passe d'une paire de media queries à **une seule
  valeur**, `#141209`. L'entrée `light` aurait blanchi la barre système au-dessus d'un écran
  charbon chez qui règle son OS en clair.
- `manifest.ts` (`background_color`/`theme_color`) passe de `#f2f3f5` à `#141209` : c'est la
  couleur de l'écran de démarrage Android **avant** que le CSS ne charge — une valeur claire
  y produisait un flash blanc à chaque ouverture de l'app installée.
- Le filtre des tuiles n'est plus conditionné : il s'applique toujours.

### Ce que ça coûte

Qui travaille en plein jour n'a plus de version claire. C'est assumé, et c'est le sens de
« point » : JobAI est une app privée à **un seul utilisateur**, qui vient de choisir. Un
thème clair reviendra le jour où il sera dessiné et validé comme le sombre l'a été — pas
comme un sous-produit gratuit d'une media query.

### Contrôle

`grep prefers-color-scheme app/globals.css` ne doit rendre **aucune règle** (une seule
occurrence, dans un commentaire qui explique justement pourquoi il n'y en a plus). Une
deuxième apparition signifierait qu'un second thème est en train de se reformer sans avoir
été validé — c'est exactement ce que cette révision interdit.
