# ADR-0038 — Le domaine est gradué (retenu, voisin, autre) et les métiers précis se proposent depuis le CV

**Date** : 2026-10-21 · **Statut** : proposé (JobAI#151, mission JobAI#146, plan « refonte de la note », étape 3). Aucun coût IA.
L'application attend le geste de Marc sur `/profil` (le même que l'ADR-0032) ; les plafonds du voisin (55) et les seuils de
la proposition sont des hypothèses à relire sur l'aperçu.

## Contexte

Mesure en production le 2026-10-21 (outil `diagnostic_bareme`, profil v8) : 6 513 offres ouvertes notées, toutes avec un code de
profession ; 322 dans les métiers retenus, 6 191 hors d'eux. Les métiers retenus sont les quatre domaines par défaut (21, 22, 70,
92), gardés par Marc le 2026-10-19.

Les 30 premières offres sont **toutes** dans les métiers retenus (facteur de domaine 1) et pourtant elles ne sont pas toutes celles
que Marc vise : on y lit, par code et par titre, un aménagement paysager (22114), un physicien du laser (21100), un chercheur en
chimie (21101), des techniciens de fabrication (22302) à côté de chargés de projet en construction (70010). Le défaut n'est pas
qu'une offre hors domaine passe devant : c'est que **deux chiffres retiennent des centaines de métiers**, et que le plancher de rôle
(ADR-0013, D2) remonte chacun d'eux au même niveau (28 sur 28 dans les 30 premières).

Aujourd'hui, hors des métiers retenus, la note est multipliée par 0,5 (`facteurHorsDomaine`). Marc a demandé le 2026-10-19 que
l'offre hors domaine soit **plafonnée à 40**.

## Décision

1. **Trois niveaux, calculés sur le code de profession seul** (`niveauDomaine`, `lib/nocProfession.ts`, pur) :
   - **retenu** : le code est dans les métiers retenus (cinq chiffres exacts, ou son préfixe de deux chiffres) ;
   - **voisin** : pas retenu, mais il partage son préfixe de **deux** chiffres (domaine et niveau) avec un métier retenu ;
   - **autre** : un code lu, hors de tout cela ;
   - **inconnu** : pas de code lisible, ou aucun métier retenu. Jamais pénalisé (règle d'ADR-0013 : une absence n'est pas un refus).
   Le voisinage se mesure sur deux chiffres et non un : le premier chiffre seul réunirait tout « sciences naturelles et
   appliquées », c'est-à-dire le défaut qu'on corrige.
2. **Un plafond par niveau remplace le multiplicateur** quand le profil est au domaine gradué (`domaineGradue`, vrai seulement après le
   geste de Marc) : voisin **55** [Supposition : sous le palier B (65), au-dessus de l'autre domaine], autre **40** [réponse de Marc].
   Le facteur reste 1 : aucune offre n'est pénalisée deux fois. Un plafond ne relève jamais une note déjà plus basse.
3. **Même geste que l'ADR-0032** : `appliquerNouveauBareme` allume `domaineGradue` avec le salaire lu. Marc voit un seul aperçu,
   valide un seul barème. Un profil enregistré avant cet ADR est comblé à faux par la migration (`lib/profilStocke.ts`) et note
   exactement comme hier.
4. **L'aperçu dit le haut de la liste** : comptes par niveau, nombre d'offres que le plafond abaisse, et composition des 30 premières
   offres avant et après (retenu / voisin / autre). C'est la lecture de « aucun métier hors domaine dans le haut de la liste ».
   `diagnostic_bareme` rend le niveau de chaque offre de ses « meilleures ».
5. **Une proposition de métiers précis, tirée du CV** (`lib/propositionMetiers.ts`, pure) : pour chaque code de cinq chiffres porté
   par au moins **3** offres ouvertes, la part de ses offres dont le titre se lit comme le domaine de Marc (même fonction que la note :
   `scoreFitRole` au-dessus de « technicien » et « hors sujet », avec les mots du profil). Le code est **pré-coché** à partir de
   **50 %** (20 codes au plus), montré sans l'être dessous. `/profil` monte l'écran des métiers (le composant existait sans être
   monté) avec la proposition à cocher : « Mettre la proposition dans le champ », puis « Enregistrer ». **Rien n'est enregistré
   sans le geste de Marc.**

## Ce que cet ADR ne change pas

- Les quatre domaines par défaut restent retenus tant que Marc ne remplace pas la liste : le haut de la liste ne bouge donc, par la
  gradation seule, que pour les offres hors de ces domaines (déjà sous 43 avec le multiplicateur). **Le gain sur le haut de la liste
  vient de la proposition** : retenir des métiers précis fait des autres codes de leur domaine des voisins (plafond 55) au lieu de
  retenus.
- Les notes manuelles, le plafond des notes calculées (85), les poids de l'ADR-0032 : inchangés.
- Le plancher de rôle ne touche que les métiers retenus : un voisin ne le reçoit pas.

## Alternatives rejetées

- **Garder le multiplicateur 0,5 et ajouter un niveau** : deux pénalités qui se cumulent, une note inexplicable (« pourquoi 29 ? »).
- **Voisin = même premier chiffre** : trop large (voir plus haut). **Voisin = même rôle lu dans le titre** : second vocabulaire.
- **Choisir les métiers à la place de Marc** (liste écrite dans le code) : une décision de Marc devenue une constante.
- **Pré-remplir et enregistrer la proposition** : changerait des notes sans geste. La proposition remplit le champ, Marc enregistre.

## Risques

- **R1 — la proposition lit les titres avec le vocabulaire du profil**, anglais compris dans la mesure où le profil porte des mots
  anglais. Un code utile dont les titres n'ont pas ces mots n'est pas proposé : Marc peut le taper (le champ libre reste). La
  proposition montre aussi, sans les cocher, les codes lus de justesse.
- **R2 — « manager » et d'autres mots de coordination lisent des restaurants.** Même défaut que la note (ADR-0017) ; les titres
  montrés à côté de chaque code le rendent visible avant de cocher.
- **R3 — 55 et 40 sont des nombres**, pas une structure : s'ils déplacent trop ou trop peu, c'est `plafondVoisin` et
  `plafondHorsDomaine` du profil, et l'aperçu les chiffre. [À trancher par Marc sur l'aperçu]
- **R4 — le haut de la liste ne change pas tant que Marc ne remplace pas les quatre domaines par des métiers précis.** C'est dit
  dans l'aperçu (comptes avant et après) ; la preuve de la tâche se lit après ses deux gestes.

## Méthode de test

Tests purs sur données fictives : `tests/domaineGradue.test.ts` (niveaux, plafonds, absence de double pénalité, profil d'avant
identique, migration, aperçu, diagnostic) et `tests/propositionMetiers.test.ts` (seuils, ordre déterministe, rien d'inventé).
En production, après déploiement : `diagnostic_bareme` (niveau de chaque « meilleure », compte hors domaine) et `/profil`
(aperçu avec la composition du haut de liste, proposition rendue sur les offres suivies).
