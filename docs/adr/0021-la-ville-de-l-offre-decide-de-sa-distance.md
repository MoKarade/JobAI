# ADR-0021 — La ville de l'OFFRE décide de sa distance, et un centre de ville doit être une ville

- **Statut** : **Accepté** (Marc, 2026-09-21 : « enchaine les lots » — feu vert du Lot 3 du
  plan en quatre lots ; le CONTENU du lot a changé en cours de mesure, voir « Ce que le lot
  devait être »).
- **Date** : 2026-09-21
- **Exigé par** : garde-fou n°3 (*no fake data*) — ce lot retire des distances FAUSSES avant
  d'en ajouter des approchées — et le protocole §11, la distance étant une entrée de la note.
- **Se lit après** : ADR-0019 (toutes les québécoises entrent), ADR-0007 (le barème),
  ADR-0004/0016 (le domicile).

## Ce que le lot devait être, et ce que la mesure a trouvé

`[GEO-BOOTSTRAP]` disait : « la table `villes` existe et n'est pas exploitée pour donner un km
approché aux offres ». **C'est faux, et c'est moi qui l'avais écrit.** L'étape « 0 bis » de
`mesurerDistances` (chantier #07, 2026-08-12) épingle DÉJÀ tout employeur au centre de sa
ville dès que ce centre est en base, sans une seule requête réseau. Deuxième fois en deux
jours qu'un remède est prescrit depuis un journal sans ouvrir le code qui produit la ligne
(règle n° 159, écrite hier pour `[BORNES-03]`).

En cherchant pourquoi si peu d'offres ont un km, la mesure a trouvé l'inverse du problème
annoncé. Relevé du 2026-09-21 sur la production (MCP, `chercher_offres scoreMin=65`,
185 correspondances) :

| Offre | Ville annoncée | km affiché | Note |
|---|---|---|---|
| Coffrages Synergy — construction project manager | **Lavaltrie** | **6,1** | 76 |
| Université du Québec — restoration project coordinator | **Montréal** | **5,1** | 76 |
| Société québécoise des infrastructures — instrumentation technician | **Montréal** | **6,1** | 74 |
| Action-Habitation de Québec — project manager | Québec | 4,5 | 78 |

Lavaltrie est à ~200 km du domicile, Montréal à ~233 km. **Les seize offres de Coffrages
Synergy portent toutes 6,1 km.** Ce ne sont pas des distances manquantes : ce sont des
distances FAUSSES, plausibles, au sommet de la liste de Marc, et sans la réserve « la
distance reste à mesurer » — cette réserve ne s'affiche que quand `km` est `null`.

Les 29 autres offres du relevé n'ont pas de km et notent toutes **exactement 70**, le
plateau « distance inconnue » du barème.

## Les deux mécanismes

**D1 — un employeur n'a qu'UNE position, une offre a SA ville.** `[Certain]`, lu dans le
code. `entreprises_lieux.nom` est la clé primaire : une position par employeur. `villeDe(nom)`
(`lib/actions.ts`) rend la ville de la PREMIÈRE offre de cet employeur qui en porte une, et
`planifierDistances` applique cette position à TOUTES ses offres. L'Université du Québec et la
Société québécoise des infrastructures ont leur siège à Québec et publient à Montréal : leurs
offres montréalaises héritent de la position de Québec. Avant ADR-0019 toutes les offres
étaient régionales, donc l'erreur maximale valait quelques dizaines de kilomètres ; depuis,
elle vaut la largeur du Québec.

**D2 — le lecteur d'une VILLE n'exige pas que la réponse SOIT une ville.** `[Certain]` pour
l'asymétrie du code, `[Probable]` comme cause du cas Lavaltrie. `lireReponseMunicipalite`
filtre sur la classe Nominatim (`place`/`boundary`) — son commentaire dit pourquoi : « le champ
`ville` d'une annonce contient parfois autre chose qu'une ville ». `lireReponse`, qui lit les
réponses de `urlRecherche` (le chemin qui REMPLIT la table `villes`), ne filtre QUE sur les
bornes. Or `urlRecherche` interroge « `<ville>`, Québec, Canada », ce qui biaise Nominatim vers
la ville de Québec : une rue ou un lieu-dit homonyme y est accepté comme le CENTRE de la
municipalité lointaine. Un seul faux centre contamine ensuite toutes les offres de cette ville.

Je ne peux pas le prouver depuis cette session : `lib/geocodage.ts` écrit lui-même que « la
session de développement n'a PAS accès à Nominatim ». Ce qui est prouvé, c'est l'asymétrie des
deux lecteurs et le fait qu'aucune autre écriture ne peut poser 6,1 km sur une offre de
Lavaltrie.

**Ce que D2 implique et qui est désagréable** : les lignes de `villes` déjà écrites ont été
acceptées par le lecteur permissif. Je ne peux pas dire, hors ligne, lesquelles sont fausses.

## Décision

Quatre changements, et rien d'autre.

1. **Un centre de ville doit être une ville.** `geocoderPlusieurs` lit désormais par
   `lireReponseVille`, qui exige la même classe (`place`/`boundary`) que
   `lireReponseMunicipalite`, en plus des bornes. Une seule règle de classe, deux consommateurs.

2. **Les bornes deviennent celles du QUÉBEC, pas de la région de Québec.** `BORNES` valait
   45–49 / −75…−68 : Gatineau (−75,70), Rouyn (−79,0), Sept-Îles (50,2 / −66,4) et Gaspé
   (−64,5) étaient REFUSÉS — leur ville ne pouvait pas entrer dans la table, donc leurs offres
   ne pouvaient JAMAIS recevoir de distance, et rien ne le disait (elles étaient comptées
   « introuvables », comme une ville que Nominatim ne connaît pas). C'est le pendant direct
   d'ADR-0019 : on a ouvert l'ingestion au Québec sans ouvrir la géographie.
   Les bornes gardent leur rôle — refuser un autre pays et une inversion de signe — mais sur
   la boîte englobante du Québec, avec marge. Elles ne tracent pas la frontière et ne le
   prétendent pas.

3. **Une position ne mesure une offre que si elle est PLAUSIBLE pour la ville de cette
   offre.** Même règle que `deciderPrecision` et même rayon (`RAYON_VALIDATION_KM` = 30 km),
   un troisième consommateur de la même constante. Si le centre de la ville de l'offre est
   connu et que la position de l'employeur en est à plus de 30 km, on n'écrit RIEN : l'offre
   garde `km: null` et retrouve sa réserve honnête. Les distances déjà écrites dans ce cas
   sont EFFACÉES (`km → null`), sur le modèle d'`invaliderDistancesPrecisees` — un km faux
   déjà en base ne se corrige pas tout seul, `planifierDistances` ne retouchant jamais une
   offre qui a déjà un km.

4. **Les centres écrits par l'ancien lecteur sont RE-VÉRIFIÉS, pas supprimés.** Nouvelle
   colonne `villes.verifie_le`, `NULL` sur tout ce qui existe. La passe de géocodage re-pose
   la question à Nominatim pour ces lignes-là, sous le lecteur strict, en priorité après les
   villes manquantes. Une re-vérification qui CONTREDIT le centre stocké de plus de
   `RAYON_VALIDATION_KM` corrige la ligne et efface les km qui en découlaient.

## Pourquoi pas les alternatives

- **Supprimer toutes les lignes de `villes` et laisser la passe les refaire.** Elles se
  refont à 8 par passe : Marc perdrait toutes ses distances régionales — celles qui sont
  justes — pendant des semaines, pour retirer les quelques fausses. On échangerait un chiffre
  faux contre un écran vide.
- **Ne rien distruster et se contenter du filtre de classe.** Le filtre empêche les NOUVEAUX
  faux centres ; il ne touche pas aux lignes déjà posées, donc Lavaltrie resterait à 6,1 km.
  C'est le demi-correctif qui déplace un chiffre faux au lieu de le corriger.
- **Ajouter une colonne `ville` à `entreprises_lieux` pour régler D1.** Ça règle le symptôme
  (savoir de quelle ville vient la position) sans régler la cause (un employeur a plusieurs
  établissements). La garde de plausibilité règle les deux cas avec une règle déjà écrite,
  déjà testée, déjà comprise dans ce dépôt.
- **Importer un jeu de centroïdes de municipalités du Québec.** L'egress de cette session est
  bloqué (403 du mandataire sur `ftp.maps.canada.ca` et `geogratis.gc.ca`, mesuré le
  2026-09-21), et un fichier de données versionné devrait de toute façon être re-vérifié.
  La voie autorisée pour géocoder reste Nominatim (garde-fou n°4).

## Ce que ça coûte, et ce que ça ne règle pas

- **Des distances vont DISPARAÎTRE avant d'en arriver d'autres.** C'est voulu : une offre sans
  km dit « distance à mesurer », une offre à 6,1 km ment. Le nombre exact ne se connaîtra qu'à
  la première passe en production — il ne se prédit pas depuis cette session.
- **Le débit reste de 8 villes par passe** (`MAX_VILLES_PAR_PASSE`), et la re-vérification
  partage cette file. Ce lot ajoute la PRIORITÉ (les villes qui débloquent le plus d'offres
  d'abord, à la place de l'ordre d'itération des employeurs, qui était arbitraire) mais pas le
  débit : `lib/geocodageCron.ts` interdit explicitement d'agrandir la passe, et une passe de
  plus est une décision à part.
- **`situer=0/2820` ne descendra pas d'un coup.** Ce lot rend la file honnête et la trie ; il
  ne la vide pas.
