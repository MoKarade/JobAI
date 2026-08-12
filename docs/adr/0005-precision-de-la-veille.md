# ADR-0005 — Précision de la veille : lire l'annonce, et retenir l'employeur

**Date** : 2026-08-11 · **Statut** : accepté (décisions de Marc du 2026-08-11)

> §8 de `CLAUDE.md` exige un ADR **avant toute ligne de code** dès qu'on touche la notation
> ou le matching. Ce chantier change ce qui ENTRE dans la note : il commence donc ici.

## Contexte — ce que la mesure dit, pas ce qu'on suppose

Marc, le 2026-08-11 : « devrait trouver beaucoup plus d'adresses, ça marche pas comme je
veux, je devrais avoir toutes les offres possibles… je veux grandement augmenter la
précision et la qualité de la recherche ».

Trois mesures faites le jour même tranchent le diagnostic.

### 1. Toutes les offres notent 68, et 68 est la note de l'ignorance

Les 22 offres du dépôt du 11 août notent **68**, sauf deux. Ce n'est pas un hasard de
barème : c'est exactement ce que `computeScore` rend pour un titre SEUL.

| Composante | Sans description | Avec description | Ce que vaut le défaut |
|---|---|---|---|
| `fitRole` (40) | 28 | **40** | le titre seul plafonne à 28 |
| `distance` (20) | 10 | 10 | défaut « non mesurée » |
| `seniorite` (15) | 11 | 9 | **le défaut est plus GÉNÉREUX que le fait** |
| `salaire` (15) | 9 | 9 | défaut « non affiché » |
| `immigration` (10) | **10** | 10 | **note MAXIMALE par défaut** |
| **Total** | **68** | **78** | (85 avec distance et salaire réels) |

**30 des 68 points viennent de ce qu'on ignore.** Deux défauts sont pires que neutres :
`immigration` donne 10/10 — la note pleine sur le critère qui compte le plus pour Marc — à
une offre dont on n'a jamais lu si l'employeur accepte un permis de travail ; et
`seniorite` récompense l'ignorance (11) plus que la lecture (9).

Conséquence : **le classement ne classe rien**. Marc regarde une liste triée par une note
qui mesure surtout notre méconnaissance. Ajouter des offres à ce plateau n'augmente pas la
qualité, ça allonge une liste indifférenciée.

### 2. La description est la même donnée que l'adresse

`get_job_details` (Indeed) rend le TEXTE de l'annonce. C'est là que vivent, ensemble :
l'adresse civique (mesuré : ~1 annonce sur 4), les années d'expérience exigées, le salaire,
et les mentions de permis de travail. **Un seul appel achète les quatre.**

Aujourd'hui la veille ne l'appelle que pour chercher l'adresse, et seulement quand le quota
le permet. Le reste — le salaire, la séniorité, l'immigration — est jeté alors qu'il était
dans la même réponse.

### 3. On refait chaque matin le travail de la veille

L'adresse est une propriété de l'**employeur**, pas de l'offre. Il y a ~80 employeurs
suivis pour ~66 offres/jour. La veille du 9 août a dépensé son budget à chercher l'adresse
par OFFRE, a lu 18 annonces, obtenu 5 adresses — et le lendemain a recommencé de zéro sur
les mêmes employeurs.

Rien ne mémorise « on a déjà cherché pour Davie, sans succès, le 9 ». Le budget se
redépense donc sur les mêmes échecs au lieu d'attaquer les employeurs neufs.

## Décision

Trois chantiers, dans cet ordre — **la profondeur avant le volume** (choix de Marc).
Le volume seul empilerait des lignes à 68/100.

### Chantier 1 — `[VEILLE-06]` Lire l'annonce, et en tirer les quatre champs

- `get_job_details` sur **chaque** offre retenue, et on garde tout : `description`,
  `salaireAffiche`, l'adresse, la date.
- La `description` entre dans le dépôt (le schéma la porte déjà, on l'envoie vide
  aujourd'hui). Elle nourrit `computeScore` — c'est le gain de 68 → 78-85.
- **Corriger les deux défauts qui récompensent l'ignorance** : `immigration` et
  `seniorite` ne doivent pas noter plus haut qu'un fait lu. Un défaut neutre se place au
  milieu de sa plage, jamais au maximum. *(Modification de barème ⇒ audit sur les 38 offres
  du seed avant/après, §8.)*
- ⚠️ **Une offre non lue n'est PAS déposée** (choix de Marc). Elle part dans une file
  d'attente `data/veille/attente.json` — hors de `data/depot/`, donc jamais ingérée — que
  la passe du lendemain traite EN PREMIER. Sans cette file, une offre non lue disparaîtrait
  au prochain tri de la source : « garder pour demain » n'existe que si demain sait quoi
  reprendre.

### Chantier 2 — `[LIEU-05]` L'adresse devient une fiche d'employeur qui s'accumule

- Une table `employeurs_adresse` : nom, adresse, source, URL, **date du dernier essai**,
  **nombre d'échecs**.
- La recherche d'adresse cible les employeurs **sans adresse et non essayés récemment**,
  les plus récents d'abord — jamais l'offre. Le budget d'un matin va aux employeurs NEUFS.
- **Remplacer la garde de ville par la garde du géocodeur.** Aujourd'hui on exige que le
  nom de la ville apparaisse dans l'adresse : ça rejette « Sainte-Foy » pour une offre
  annoncée à « Québec », qui est pourtant juste. Le bon discriminant existe déjà — le
  géocodeur pose l'adresse et on vérifie qu'elle tombe **à moins de N km du centre de la
  ville annoncée**. Plus permissif sur les arrondissements, plus strict sur les homonymes.
- Sonder **Overpass par NOM d'entreprise** sur la région. C'est une autre question que
  Nominatim (recherche de tags, pas géocodage d'adresse) et la frontière réseau existe
  déjà (`lib/overpass.ts`). À mesurer avant d'y croire : témoin négatif obligatoire.

### Chantier 3 — `[VEILLE-07]` Le volume, une fois que la profondeur paie

- **La pagination d'abord.** ZipRecruiter rend `limit: 5` avec `total: 63` — on capte 8 %
  d'une seule recherche. *(À vérifier : le connecteur expose-t-il un décalage ? Sinon, le
  levier est le nombre de requêtes, pas la page.)*
- Plus de villes : Saint-Augustin-de-Desmaures, Beauport, Charlesbourg, Sainte-Foy,
  Saint-Nicolas, Saint-Apollinaire — pas seulement Québec et Lévis.
- **Rotation sur plusieurs jours**, comme `selectionnerSources` le fait déjà : l'union
  converge sur une semaine au lieu de saturer un matin.
- Les deux connecteurs, avec leurs rôles : ZipRecruiter pour la LARGEUR (5 par appel, mais
  quota confortable), Indeed pour la PROFONDEUR (`get_job_details`, quota serré).

## Pourquoi pas autrement

- **Plus d'offres d'abord.** Rejeté par Marc, et la mesure lui donne raison : 100 lignes de
  plus à 68/100 n'aident pas à décider.
- **Déposer les offres non lues avec une note plate.** Rejeté par Marc : le jeu de données
  reste vrai, au prix d'un jour de décalage. Risque assumé et nommé — une annonce peut
  fermer entre-temps.
- **Un LLM pour extraire l'adresse du texte.** Différé : la regex de forme civique suffit
  pour ce qu'on cherche, et un appel LLM par annonce coûterait plus que le gain mesuré.

## Révision du 2026-08-12 — la mesure réfute une partie du diagnostic

Les 44 annonces lues le jour même ont été passées au barème. Deux affirmations de cet ADR
ne survivent pas à l'épreuve, et il vaut mieux l'écrire que de laisser une décision reposer
dessus.

**Réfuté — « il faut corriger les défauts d'ignorance du barème ».** Le tableau d'ouverture
opposait le défaut `immigration` (10/10) et le défaut `seniorite` (11) à ce qu'un fait lu
rapporte. Mesuré sur du réel, aucun des deux ne justifie de toucher au barème :

- `immigration` à 10 par défaut est **empiriquement juste** : sur 49 offres, six seulement
  portent une vraie barrière. Baisser le défaut punirait la majorité pour n'avoir rien à se
  reprocher, ce qui est le contraire du but.
- `seniorite` à 11 sans donnée contre 9 pour « 5 ans exigés » n'est **pas une inversion** :
  une exigence de cinq ans EST un moins bon appariement pour trois ans d'expérience qu'une
  offre qui n'exige rien. Le défaut est légèrement au-dessus du milieu de plage (5-15), ce
  qui correspond à la réalité des annonces qui taisent l'exigence.

**Confirmé, mais ailleurs que prévu — le défaut est de VOCABULAIRE.** Une offre demandait
d'être « apte aux **enquêtes de sécurité** » : la même exigence fédérale que « cote de
sécurité », déjà dans la liste, sous un autre nom. Elle obtenait la note pleine et remontait
donc en tête. Le correctif n'est pas un seuil, c'est six mots ajoutés à `MOTS_DISQUALIFIANTS`
— et un test qui prouve que la liste ne mord ni sur la résidence au Québec (Marc y habite)
ni sur le vocabulaire SST, omniprésent en milieu industriel.

**Réfuté — « toutes les offres notent 68 ».** C'était vrai le 11 août, sans description.
Avec 44 descriptions sur 49, la distribution s'étale sur **treize notes distinctes**, de 48
à 84 ; quatorze restent à 68 (les cinq non lues, et neuf dont le texte tombe là). La lecture
des annonces a donc fait, à elle seule, l'essentiel du travail que ce chantier promettait.

**Dérive documentaire relevée au passage** : le §8 de `CLAUDE.md` demande un audit « sur les
38 offres du seed (23 actives + 15 historiques, notées à la main) ». Le seed en compte 53,
dont **23** portent `scoreSource: "manuel"`. C'est ce jeu de 23 qui fait référence.

## Ce qu'on saura mesurer

| Indicateur | Aujourd'hui | Attendu |
|---|---|---|
| Offres notées **autrement** que 68 | 2 / 22 | > 80 % |
| Adresses connues (employeurs) | 41 sans adresse | qui **baisse** chaque semaine |
| Offres lues / déposées | 0 / 22 | 100 % par construction |

Le rapport quotidien porte déjà ces trois lignes. Si l'une ne bouge pas, le chantier
correspondant n'a rien donné — et on le saura sans rouvrir le dossier.
