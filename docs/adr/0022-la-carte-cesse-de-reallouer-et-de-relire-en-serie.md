# ADR-0022 — L'identité d'un employeur devient la MÊME partout, et la carte cesse de lire en série

- **Statut** : **Accepté** (Marc, 2026-09-21 — « pose tes questions » puis choix par question
  ciblée : égalité stricte pour le regroupement, pas de mesure préalable sur téléphone,
  inclure le coût serveur dans ce lot).
- **Date** : 2026-09-21
- **Exigé par** : ce lot touche à quels employeurs se RETROUVENT sous la même épingle/carte —
  un résultat affiché, donc une décision, donc un ADR avant le code.
- **Se lit après** : `[CARTE-PERF]` (le lot précédent, ×3 sans changer la sémantique).

## Contexte

Le lot précédent (`indexEmployeurs`, même jour) a rendu O(1) le regroupement par SOUS-CHAÎNE
(`apparier`) que `construireVue` et `grouperParEntreprise` employaient — sans toucher à la
RÈGLE. Il restait ~1,1 s de calcul par écran (mesuré, corpus de forme production), et Marc a
demandé d'aller plus loin.

Rendre le regroupement VRAIMENT O(1) — une clé de `Map`, pas une recherche — exige une
ÉGALITÉ, pas une sous-chaîne : `x.includes(y)` n'a pas d'index natif, une égalité en a un
(`Map.get`). Ça change la RÈGLE : « Robert » cesse de tomber sur « Groupe Robert ».

## Ce que la mesure a trouvé en creusant

`lib/employeurs.ts` porte DÉJÀ deux règles, documentées comme telles depuis sa création :
`apparier` (sous-chaîne, floue — pour l'AFFICHAGE) et `memeEmployeur` (égalité après
normalisation des accents/casse/forme juridique — pour les DONNÉES). Le fichier raconte
lui-même pourquoi la frontière existe : `apparier("Robert", "Groupe Robert")` vaut `true`, et
`positionDe` l'employait un temps pour ÉCRIRE une position — donc une offre de « Robert »
aurait reçu en silence la position, la distance et la note de « Groupe Robert ». Corrigé
depuis, `positionDe` utilise `memeEmployeur`.

**Ce même défaut vivait encore côté AFFICHAGE, personne ne l'avait remarqué.**
`construireVue` et `grouperParEntreprise` employaient `apparier` pour décider quelles offres
partagent une épingle ou une carte de la liste. Un faux regroupement visuel se corrige à
l'œil — c'est pour ça que personne ne l'a signalé — mais il reste faux : deux entreprises
sans rapport affichées comme une seule.

**Passer à `memeEmployeur` (identité stricte, DÉJÀ écrite et testée) a un coût réel, mesuré**
avant de trancher (`SEED` × `ENTREPRISES_CIBLES`, offres actives) :

| | `apparier` (sous-chaîne) | `memeEmployeur` (strict) |
|---|---|---|
| Employeurs SEED sans cible correspondante | 0 | **2** — `STERIS` / `STERIS Canada`, `Exo-s Saint-Damien` / `Exo-s` |

Les deux cas sont des suffixes de LIEU ou de RÉGION (« Canada », « Saint-Damien »), pas une
forme juridique — `normaliserNomEmployeur` ne les retire pas. Sans conséquence en PRODUCTION
aujourd'hui : ces deux offres portent déjà un `km` écrit à la main dans `SEED`, et
`planifierDistances` ne retouche jamais un `km` connu — `positionDe` n'est donc jamais
consulté pour elles. Mais une offre FUTURE, ingérée sous « STERIS » alors que seul
« STERIS Canada » est géocodé, ne trouverait plus sa position par ce biais — elle
re-basculerait dans la file `employeursASituer` et se ferait géocoder à nouveau sous son
propre nom. Ce n'est pas un régression introduite par ce lot : c'est une propriété
PRÉEXISTANTE de `memeEmployeur`/`positionDe`, simplement rendue visible par la mesure.
Signalé, **non corrigé** (scope non demandé) — porté au BACKLOG sous `[EMPLOYEUR-VARIANTE]`.

## Décision

1. **L'affichage (`construireVue`, `grouperParEntreprise`) utilise `memeEmployeur` — la MÊME
   identité que les DONNÉES (`positionDe`, `lib/distances.ts`).** Plus une seule règle par
   question, mais UNE règle pour toute la notion « même employeur », implémentée en O(1) via
   `cleGroupement(nom, secours)` : une clé de `Map` normalisée, avec un secours (l'id de
   l'offre) pour ne jamais fusionner deux noms vides — `memeEmployeur("", "")` refuse déjà
   cette égalité, une clé de `Map` ne peut pas « refuser » sans ce secours.
2. **`apparier` survit, pour un seul usage : le proofreading.** `tests/reference.test.ts`
   (« ai-je oublié une cible pour cet employeur, même sous un nom approché ? ») et
   `villeDeLEntreprise` (le libellé de ville d'un lien Google Maps — une résolution douteuse
   s'y voit à l'œil, dans l'interface de Google, immédiatement). Dans les deux cas, un faux
   positif coûte un coup d'œil humain, jamais une fusion silencieuse — c'est exactement le
   registre où le flou reste défendable.
3. **La page Carte lit ses cinq sources en parallèle, pas en série** (`[CARTE-PERF]`, non
   mesuré au démarrage du lot, trouvé en investiguant le « coût serveur » demandé par Marc) :
   `domicile()`, le rayon réglé, `lireOffres()`, `entreprisesLieux`, `trajets` — quatre des
   cinq ne dépendent d'AUCUNE des autres, et étaient pourtant `await`ées l'une après l'autre.
   `app/page.tsx` avait déjà cette forme (`Promise.all`, lot précédent) ; cette page-ci en
   était la seule restante avec cinq allers-retours Neon séquentiels.

## Pourquoi pas les alternatives

- **Garder `apparier` pour l'affichage, indexer autrement (préfixes, n-grammes).** Un index
  de sous-chaîne existe (trie, suffix array), mais c'est une structure de données entière
  pour préserver un flou dont la mesure montre qu'il fusionne aussi ce qu'il ne devrait pas.
  Le coût de complexité n'achète rien : le défaut STERIS/Exo-s existe déjà côté DONNÉES
  depuis que `positionDe` a été corrigé, et personne n'a demandé de le ramener.
- **Mesurer d'abord sur le téléphone de Marc.** Refusé par Marc explicitement (« code
  directement ») : l'estimation (~1,1 s sur ce conteneur, probablement 3-6 s sur téléphone)
  suffisait à motiver le lot.
- **Laisser le coût serveur au BACKLOG.** Refusé par Marc explicitement (« l'inclure dans ce
  lot ») — et la mesure a montré que le vrai levier n'était PAS où `lireOffres()` semblait le
  suggérer (aucune limite de lignes — indexé, pas un problème mesurable ici) mais dans
  l'ORDONNANCEMENT des requêtes de la page, un défaut structurel indépendant du volume.

## Ce que ça coûte, et ce que ça ne règle pas

- Les deux offres SEED (STERIS, Exo-s Saint-Damien) restent affichées correctement — leur
  `km` manuel ne bouge pas. Ce qui change : elles forment désormais chacune leur PROPRE
  entrée sur la carte au lieu de partager celle de leur cible — c'est le résultat attendu,
  pas un défaut.
- `[EMPLOYEUR-VARIANTE]` reste ouvert : une variante de nom (« STERIS » ingérée alors que
  seul « STERIS Canada » est géocodé) refait un géocodage au lieu de retrouver la position
  existante. Coût : un appel Nominatim de plus, jamais une donnée fausse.
