# ADR-0040 — Une distance approchée par le début du code postal, dite approchée partout

**Date** : 2026-10-21 · **Statut** : proposé (JobAI#92, mission JobAI#88). Coût IA : aucun. Nouvelle source de données : GeoNames
(codes postaux du Canada), publiée sous licence CC-BY 4.0. Le protocole de précision (`docs/claude/11-protocole.md`) s'applique :
l'approximation entre dans la note par le chemin existant (`scoreAvecDistance`), sans toucher à `lib/scoring.ts`.

## Contexte

La passe de veille du 2026-10-21 (`diagnostic_flux`, `fin: "flux-termine"`, 7 462 offres jugées sur le lieu) en compte **3 874
« lieu inconnu »** : leur ville est un texte que ni la liste des municipalités ni le registre mesuré ne reconnaissent (« Canada »,
« Remote », une région). Elles entrent en base (ADR-0019) mais sans distance : le barème leur donne 10 points sur 20, autant qu'à
25 km, et le filtre de km les écarte. Or **chacune porte un code postal** : les lettres inconnues du même diagnostic (`J` 1 858, `G` 1 260, `H` 750, `E` 3, `A` 2, `B` 1)
totalisent exactement 3 874. Le Guichet publie le code complet (`J0T1L0`, `G1L1P1`…) ; l'ingestion le lit pour la bande (ADR-0018)
puis le jette. Les 25 débuts les plus fréquents de ces offres (`regionsInconnues`) ont tous un centre dans la source retenue
(vérifié le 2026-10-21).

## Décision

1. **Source : les centres des débuts de code postal (3 caractères, « RTA ») de GeoNames**, fichier `CA.zip` de
   `download.geonames.org/export/zip/`, licence **CC-BY 4.0** (mention dans le README et dans `lib/data/fsaQuebec.ts`). On garde les
   **421 lignes du Québec** (bandes G, H, J, moins `H0H`, le code du Père Noël, posé au pôle Nord), une latitude et une longitude chacune, **arrondies à deux décimales (≈ 1 km)** et committées dans `lib/data/fsaQuebec.ts`. Deux
   décimales, parce qu'un centre de région n'est pas connu au mètre ; et c'est aussi ce qui laisse `tests/piiGuard.test.ts` (aucune
   coordonnée précise en dur) intact, sans exception à lui ajouter.
   Aucune requête réseau à l'exécution, aucun secret, aucune donnée personnelle : le domicile n'y est pas, il reste côté serveur
   (garde-fou n°1 de `lib/distances.ts`).
2. **L'offre porte son début de code postal** : colonne `offers.code_postal`, trois caractères (`J0K`), `NULL` si la source n'en
   donne pas ou s'il est mal formé. Les trois caractères, pas les six : la distance n'en demande pas plus, et c'est moins de donnée
   gardée (dépôt public, garde-fou n°1 de JobAI). Écrit à l'ingestion pour les offres neuves ; **rattrapé pour les offres déjà
   suivies** quand le flux les revoit (même mécanique que le lien, `liensARafraichir`), car sans ce rattrapage les 3 874 offres du
   constat ne bougeraient jamais.
3. **Le repli ne passe qu'après la mesure, jamais avant.** Pour une offre sans distance, `planifierDistances` essaie d'abord la
   position de l'employeur (exacte ou ville, avec les gardes d'ADR-0021). **Seulement si elle n'aboutit pas**, et que l'offre a un
   début de code postal connu, la distance est celle du centre de ce code, **arrondie au kilomètre** (pas au dixième : le dixième
   mentirait sur la précision). Elle s'écrit avec `km_source = 'postale'`.
4. **Elle se dit approchée partout où elle s'affiche** : « ≈ 47 km » sur la carte d'offre et sur la fiche, jamais « 47 km ». Elle
   ne devient **jamais** la distance d'un employeur sur la carte des entreprises (`lib/carte.ts` ne reprend que les `km` mesurés).
5. **Elle se remplace dès qu'une vraie mesure existe.** `planifierDistances` ne retouche pas un `km` connu, sauf s'il est `postale` :
   quand l'employeur est enfin situé, la mesure prend la place et `km_source` redevient `NULL`. Une distance relevée à la main par
   Marc n'est jamais `postale`, donc jamais écrasée.
6. **Elle entre dans la note comme n'importe quelle distance** (chemin `scoreAvecDistance`, notes manuelles intactes, plafond de 85
   inchangé). Ce n'est pas un nouveau barème : c'est la valeur « inconnue » (10/20) qui est remplacée par une valeur approchée.
7. **Le rapport de passe le dit** : `distancesPostales` (écrites cette passe) et `lieuInconnuSansDistance` (le compte qui doit
   baisser) rejoignent `resume` et la ligne `[distances] passe terminée`.

## Ce que la source ne sait pas (et que la décision accepte)

- **Un début de code postal rural couvre une région, pas un point.** Les codes en `0` en deuxième caractère (`J0K`, `G0L`…) sont les
  zones rurales les plus étendues : le centre de `G0L` est Trois-Pistoles, la zone s'étire sur plus de 100 km. L'erreur peut y
  atteindre plusieurs dizaines de kilomètres [Probable : d'après la taille des régions, non mesurée]. C'est la raison de l'arrondi au
  kilomètre, du « ≈ », et de la place du repli : après la mesure de l'employeur, jamais avant.
- **Le code d'une annonce est parfois celui du siège social, pas du lieu de travail** (ADR-0018 : 44 offres régionales portaient un
  code hors région). Une offre au bureau de Montréal d'un employeur dont le siège est à Québec peut donc recevoir la distance de
  Québec. L'erreur n'est pas évitable avec cette source ; elle est bornée parce que le repli ne joue que pour les offres que rien
  d'autre ne situe, et elle est affichée comme approchée.
- **421 lignes ne sont pas tous les codes** : un début absent de la table ne reçoit pas de distance (échec fermé), et le compte
  `lieuInconnuSansDistance` le rend visible.

## Méthode de test

Pure et sans réseau : début de code lu de `J0T1L0`, `j0t 1l0`, `J0T`, rejets (`""`, `K1A0B1` hors Québec, `12345`) ; table : 400 lignes
au moins, clés `[GHJ]\d[A-Z]`, coordonnées dans le Québec ; `planifierDistances` : repli postal seulement sans position d'employeur,
mesure qui remplace une `postale`, `km` manuel intact, notes manuelles intactes, centre absent = rien d'écrit ; rattrapage du code des
offres déjà suivies (une ligne seulement si le code manque et que la source en donne un valide). Contrôle en production après la
première passe : `lieuInconnuSansDistance` baisse dans `etat_synchro`, et les notes des offres touchées sont lues avant/après
(`diagnostic_bareme`).

## Alternatives rejetées

- **Les limites cartographiques de Statistique Canada** (région de tri d'acheminement, licence du gouvernement ouvert) : source
  officielle, mais des dizaines de mégaoctets de polygones à réduire en centres. Cet ADR ne gagne rien en précision (un centre de
  polygone reste un centre) et gagne du poids et un outil de conversion.
- **Les données de Postes Canada** : non redistribuables.
- **Interroger Nominatim pour chaque début de code** : un service bénévole à une requête par seconde, pour une table qui ne change
  presque jamais ; une dépendance à l'exécution pour une donnée statique.
- **Garder les six caractères** : plus de donnée gardée pour une précision que le centre d'un début de code ne permet pas d'utiliser.
- **Ne pas remplacer l'inconnu, seulement l'afficher** : laisserait le barème donner 10/20 à une offre dont on connaît la région à
  quelques dizaines de kilomètres près, ce que cette tâche existe pour retirer.
