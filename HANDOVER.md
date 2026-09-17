# HANDOVER — JobAI

> État courant du projet, **à lire en premier** à chaque reprise de session.
> Antichronologique : la session la plus récente en haut. Ne rien inventer ici — si un point
> n'a pas été vérifié, écrire « à confirmer ».

---

## Session 2026-09-17 (nuit) — `[VEILLE-42]` : la règle de bande, calibrée puis livrée

Marc : « fais la règle de bande ». Livrée, avec son ADR-0018 — mais en deux temps, parce que
le premier n'existait pas encore.

**Le contraste qui manquait, et qu'aucun compte ne donnait.** `lettresInconnues` décrit la
queue à trier, l'inventaire des retenues décrit la région — aucun des deux ne dit quelle bande
est LOINTAINE. J'ai donc d'abord ajouté `lettresHorsRegion` : la bande des offres que
`HORS_PORTEE` rejette **par le nom de leur ville**, verdict indépendant du code postal, donc
non circulaire. Mesuré sur une passe complète (42 957 offres, `fin: "flux-termine"`) :

| bande | dans-région | hors-région | décidables | part régionale | non placées |
|---|---|---|---|---|---|
| G | 1 401 | 390 | 1 791 | **78,2 %** | 1 210 |
| J | 43 | 884 | 927 | **4,6 %** | 1 784 |
| H | 1 | 745 | 746 | **0,13 %** | 707 |

**Une seule bande est rejetée : `H`.** Critère écrit pour être re-appliqué : ≥ ~500 décidables
(sinon l'échantillon ne dit rien) ET part régionale sous 1 %. `G` est la bande de la région.
`J` gagnerait 1 784 offres par passe et parierait contre une régionale sur vingt-deux — refusé :
un faux rejet coûte une offre que Marc ne verra jamais et dont rien ne signalera l'absence, un
non-rejet coûte une place de quota. Les deux erreurs n'ont pas le même prix.

**La bande est lue EN DERNIER** — après la liste noire, la liste blanche, le registre mesuré et
le repli sur la description. C'est ce qui rend son coût **nul par construction** : les 44 offres
régionales à code hors bande (siège social de l'employeur) sont acceptées par leur NOM plusieurs
étapes avant. La poser plus haut les perdrait toutes, et c'est l'alternative que l'ADR rejette.

**Le gain, dit honnêtement.** 707 offres par passe (19,1 % des non placées) cessent de disputer
les **40** places de `MAX_LIEUX_INCONNUS_FLUX`. ⚠️ Le quota se consomme par NOM, pas par offre :
le gain en places est borné par le nombre de noms distincts parmi ces 707, que l'instrument ne
mesure pas. Je ne l'annonce donc pas comme un gain chiffré.

**L'instrument n'applique PAS la règle, et un test le verrouille.** Un instrument qui incorpore
la règle qu'il calibre ne peut plus la falsifier. Conséquence à dire tout haut : **les
`verdicts` de `diagnostic_flux` ne sont pas l'état de la production** — ils décrivent ce que les
règles de NOM seules savent placer. Bénéfice : le compte de `H` dans `lettresInconnues` EST
exactement le rendement de la règle.

**Cinq mutations, toutes discriminantes** : bande posée avant la liste blanche → l'offre placée
par son nom est perdue ; analyseur qui cesse de porter le code → la règle n'atteint plus
personne ; instrument qui applique la règle → le contraste se contamine ; liste vidée → trois
tests dont l'anti-vacuité du ratchet.

**Reste ouvert** : `J`, 48 % de la queue, volontairement non triée. Et le ratchet interdit `G`
et `J` dans la liste — les ajouter doit forcer à relire la mesure, pas à re-baser le test.

### ✅ EFFET VÉRIFIÉ EN PRODUCTION, 19:41:30 UTC — avec son contrôle négatif

Marc a lancé la passe depuis `/sources`. Elle a tourné sur `dpl_7N9Cvsx…` (= `cfc9b36`).

**Le témoin d'avant est écrit dans le dépôt** — `BACKLOG.md` ligne 2255, consigné à l'audit du
matin, AVANT la règle : « `mont-royal×6`, `pointe-aux-trembles×4`, `sherrington×5` tombent
encore en lieu inconnu ».

**La passe de 19:41:30 rend** :

```
[veille] bouton-app — ingérées=2/1600 … hors-région=6 … lieu-inconnu=39 …
[veille] lieux refusés — inconnus : sherrington×5 · grande-riviere×3 · saint-michel×3 ·
         gaspe×2 · parc-bon-air×2 · … · woburn×1
```

| Nom | Avant la règle | Après |
|---|---|---|
| `mont-royal` | ×6 en lieu inconnu | **absent** |
| `pointe-aux-trembles` | ×4 en lieu inconnu | **absent** |
| `sherrington` | ×5 en lieu inconnu | **×5, inchangé** |

⚠️ **C'est `sherrington` qui fait la preuve, pas les deux disparitions.** Seules, elles
s'expliqueraient aussi par une passe qui ne contient tout simplement pas ces offres. Le même
compte exact sur un nom que la règle NE vise PAS dit que la tranche de flux est comparable —
donc que ce qui a disparu a été RETIRÉ, pas absent. Un contrôle négatif, pas un avant/après nu.

Compteurs : `hors-région` 4 → **6**, `lieu-inconnu` 40 → **39** (le total nommé fait bien 39).
Ils vont dans le bon sens mais ne prouvent rien seuls — ce sont les comptes du pipeline, sur ce
que la source lui a déjà transmis ; la règle, elle, agit en amont dans la source.

⚠️ **`saint-michel×3` est TOUJOURS là, et c'est une bonne nouvelle.** C'est le cas d'homonymie
que la règle devait éviter d'écraser (arrondissement de Montréal vs Saint-Michel-de-Bellechasse
et autres). Son maintien dit que son code postal n'est pas en bande `H` : la règle ne l'a pas
pris pour ce qu'il n'est pas.

**Contrôle de demain 11:42 UTC retiré** (`trig_01Sn1k2gJhyABCWHB3FFr8UN`) : il n'a plus d'objet,
la réponse est là.

### Ce qui était écrit à 19:45 UTC, avant la passe de Marc

**Prouvé** : CI verte et déploiement `READY` sur `cfc9b36`, aliasé sur `emploi.hubperso.com`.
Et la non-contamination de l'instrument, vérifiée sur la production APRÈS la mise en ligne :
`lettresInconnues` affiche toujours `H = 707`, identique à la mesure d'avant la règle. Si la
règle avait fui dans l'instrument, `H` aurait disparu de ce compte — c'est le seul contrôle qui
pouvait rougir ce soir, et il est vert.

⚠️ **NON PROUVÉ : l'effet de la règle sur l'ingestion.** Il ne s'observe que sur une PASSE de
veille, et aucune n'a tourné depuis le déploiement (logs Vercel interrogés sur 3 h : rien).
`diagnostic_flux` ne peut pas y répondre — l'instrument n'applique délibérément pas la règle.
Ne pas lire son `lieu-inconnu: 3705` comme « la règle ne fait rien » : il mesure autre chose.

**Comment ce sera tranché** : cron de veille `0 11 * * *`, parti à 11:31:50 UTC les 16 et 17/09.
Contrôle armé pour le 2026-09-18 à 11:42 UTC (`trig_01Sn1k2gJhyABCWHB3FFr8UN`) — la rétention
des logs Vercel est d'environ 17 minutes, donc la lecture doit être immédiate. Marc peut aussi
lancer la passe depuis `/sources` à tout moment et la réponse arrive en une minute.

**Ce qu'il faudra regarder, et ce qui ne prouvera rien** : `lieu-inconnu=40` restera
probablement à 40 — c'est le PLAFOND `MAX_LIEUX_INCONNUS_FLUX`, et il reste 1 210 inconnues en
`G` plus 1 784 en `J` pour le remplir. Un 40 inchangé n'est PAS un échec. Le vrai signal est la
ligne `[veille] lieux refusés — inconnus : …` : plus aucun nom de l'île de Montréal ne doit y
figurer, et `hors-région` doit monter.

---

## Session 2026-09-17 (fin) — `[VEILLE-42]` : l'instrument avant la règle

**Ce qui est livré : une MESURE, pas un correctif.** `diagnostic_flux` rend deux comptes de
plus — `lettresInconnues` (la bande postale, non tronquée) et `regionsInconnues` (la région de
tri, top 25) — calculés sur la seule population « lieu inconnu », et relayés par l'outil MCP.

**Pourquoi je n'ai pas écrit la règle tout de suite.** Le remède annoncé par le ticket est le
code postal, et il est juste : une région de tri n'a pas d'homonyme, là où « Saint-Laurent »
en a un dans la région (`[VEILLE-33]`). Mais il n'y avait rien pour le concevoir : les onze
inventaires du diagnostic (`inventaireRetenues`) portent sur les offres DÉJÀ ACCEPTÉES,
c'est-à-dire la population INVERSE de celle qu'une règle de tri doit trancher. Écrire une
bande postale de mémoire aurait produit une table inventée, capable d'admettre en silence des
offres lointaines — exactement ce que le garde-fou « no fake data » interdit. L'instrument
part donc en premier, et la règle se décidera sur la distribution mesurée.

**À lire avec son dénominateur.** `verdicts["lieu-inconnu"]` est publié juste à côté : un
compte de classes n'est pas une proportion. Et l'égalité de totalité est gardée sur
`lettresInconnues`, pas sur `regionsInconnues` — ce dernier est tronqué au top 25, donc son
total serait court dès que la queue s'allonge, c'est-à-dire quand la mesure devient utile.

**Trois discriminations prouvées par mutation** (sauvegarde par `cp`, jamais `git checkout`) :
le tally remonté d'un cran décrit tout le flux (5 au lieu de 3) ; une offre sans code postal
abandonnée en silence fait tomber le compte `(vide)` ; le relais MCP retiré rend `undefined`.

**LA MESURE A ÉTÉ FAITE dans la foulée** (19:05 UTC, `fin: "flux-termine"`, 42 856 offres en
5,2 s — `dans-la-region: 1443`, `hors-region: 2020`, `lieu-inconnu: 3683`) :

- **100 % des non placées portent un code postal.** `(vide)` est ABSENT de `lettresInconnues`.
  C'est ce qui rend le remède seulement APPLICABLE, et personne ne le savait.
- Bandes : **J 1776 (48,2 %) · G 1207 (32,8 %) · H 696 (18,9 %) · E 2 · A 2**.
- ⚠️ **La contre-mesure change le remède.** L'inventaire `postalcode-lettre` des offres
  RETENUES (1 443) donne **G 1399, J 43, H 1** : quarante-quatre offres RÉGIONALES portent un
  code hors bande — l'employeur y met son siège social, pas le lieu de travail. Un rejet franc
  par bande posé AVANT la liste blanche les perdrait toutes. Et `G` ne se rejette pas : c'est
  la bande de la région elle-même.

**Et le gain n'est pas celui que le ticket annonce.** Les 3 683 non placées sont DÉJÀ hors
ingestion (`garder` ne retient que `dans-la-region`) : une bande ne changerait rien à ce qui
entre. Ce qu'elle économise, ce sont les MESURES Nominatim du registre des lieux ; ce qu'elle
risque, c'est de figer en « hors région » un nom que la mesure aurait placé dedans.

**Conception qui en découle — À VALIDER PAR MARC, rien n'est codé.** Poser le test de bande LÀ
OÙ `resolus` est consulté : après `HORS_PORTEE`, après la liste blanche, à la place du recours
Nominatim. Les 44 offres J/H restent acceptées PAR LEUR NOM, et la bande ne tranche que pour
les noms que personne ne connaît. Coût : `situer` doit recevoir le code postal, qui vit dans le
bloc BRUT — changement de signature sur tous ses appelants, donc un lot à part avec son ADR.

`[VEILLE-42]` reste donc OUVERT, mais il a changé de nature : ce n'est plus « on ne sait pas »,
c'est « on sait, et l'arbitrage appartient à Marc ».

---

## Session 2026-09-17 (soir) — trois lots du backlog, « fais tout à la suite »

**`[VEILLE-34]` — le barème cesse de buter sur un accent** (ADR-0017, protocole §11 respecté :
cadrage puis audit sur le SEED entier AVANT toute ligne). `normaliserTitre` replie désormais les
accents, **des deux côtés** — les mots du profil y passent aussi, parce que Marc les saisit
depuis `/profil`.
⚠️ **Le gain d'aujourd'hui est NUL, et l'ADR le dit** : les 33 offres du suivi dont le titre
contient « charge de projet » sont TOUTES accentuées, les 2 « electromeca » aussi, et le SEED ne
bouge pas d'un point. Le chiffre du ticket (« 4 offres de 8 à 28 ») avait été mesuré quand
ZipRecruiter était une source. On livre pour le SILENCE que ça ferme, pas pour un gain.

**`[VEILLE-33]` — « Quebec Province » n'est plus la ville de Québec.** Une frontière de mot
n'aurait rien changé (« quebec » est un mot entier des deux côtés) : c'est le QUALIFICATIF qui
distingue, d'où `PROVINCE_PAS_LA_VILLE`. Verdict `lieu-inconnu`, jamais `hors-region` — on ne
sait pas où est l'offre. Une règle, deux consommateurs (le champ `ville` ET le repli par la
description).

**`[CV-11]` — le `CLAUDE.md` passe de 1 854 à 496 lignes.** Les 153 leçons de la §9 (1 536
lignes, 83 % du fichier) sont dans `docs/LESSONS.md`, VERBATIM ; la §9 garde leur RÈGLE, une
ligne chacune, reprise au caractère près du gras que chaque incident avait déjà produit.
⚠️ **Perte assumée** : les histoires n'arrivent plus en session, il faut aller les lire.
⚠️ **Le plafond de 150 n'est pas atteint et ne le sera pas** — l'en-tête le dit maintenant au
lieu d'annoncer un chiffre que le fichier violait depuis toujours.
⚠️ **Le rituel change** : ajouter une leçon = DEUX écritures dans le même commit, l'histoire
dans `docs/LESSONS.md` et la règle en §9.

**Vérifications** : gate complet vert aux trois lots (1 655 puis 1 660 tests). Mutations —
2 pour `[VEILLE-34]` (dont le repli asymétrique, qui casse tout le corpus accentué), 3 pour
`[VEILLE-33]`, et trois contrôles mécaniques pour `[CV-11]` (corps verbatim, 153/153 règles,
reste du fichier inchangé).

**⚠️ Ce qui reste à surveiller** : aucun des trois lots n'a d'effet mesurable sur la prochaine
passe — `[VEILLE-34]` a un gain nul aujourd'hui, `[VEILLE-33]` attend un cas qui ne se présente
peut-être pas, `[CV-11]` ne touche pas le produit. Ne pas les compter comme vérifiés en
production tant qu'un cas réel ne les a pas exercés.

---

## Mesure 2026-09-17 (17:31 UTC) — `[LIEN-03]` a tiré : 226 liens rafraîchis

Passe lancée par Marc depuis `/sources`. `[veille] bouton-app — … liens=226 sources=2`.

**226 offres suivies portaient un lien périmé.** ⚠️ À lire avec son dénominateur : 226 sur les
**1 548** offres que le flux a re-présentées ce jour-là (~15 %), pas 226 sur ce que Marc
regarde. Avant/après sur ses 17 offres ouvertes notées 60+ : **une seule** a changé,
`Groupe DSD Inc` (`49422722` → `50155497`). Le gros du rattrapage est dans la longue traîne.

**L'écart n'est pas cosmétique** : 730 000 numéros d'annonce séparent les deux liens — c'est une
autre annonce, republiée plus tard. Et la règle est conservatrice : sur 17 offres, elle n'a
réécrit que celle qui avait bougé.

**⚠️ Ce qui reste ouvert.** Marc a écrit « des jobs périmés », au pluriel ; le correctif n'en
explique qu'un dans sa liste. S'il en voit encore, il faut qu'il en NOMME un : `jobbank.gc.ca`
est injoignable depuis la session (HTTP 000), je ne peux pas vérifier l'état d'une annonce.

**`[BORNES-02]`** : `bornes=0/0` — plus aucun lieu à mesurer (21 restaient le matin). ⚠️ Par
quel chemin, je ne peux pas le dire : une passe déclenchée par une PAGE a 35 s de budget contre
25 s pour le cron, et a pu suffire sans l'enveloppe. Le verdict viendra du prochain cron.

---

## Session 2026-09-17 (suite) — `[LIEN-03]` : le lien suivait la première annonce, pas l'offre

Marc : « il y a des jobs périmés qui devraient plus être là, tu check pas assez bien à chaque
jour ».

**⚠️ La plainte désigne le balayage ; la mesure désigne autre chose.** `resume_suivi` :
`confirmees` 1 635, `jamaisConfirmees` 0, `plusVieilleVueJours` **4** — aucune offre ouverte
n'est restée plus de quatre jours sans être revue, pour un seuil de péremption à 2 jours. Le
balayage fait son travail. Ce qui ne bougeait pas, c'est le **LIEN** : une offre déjà connue est
comptée « doublon » par `trier`, et **rien d'elle n'était jamais réécrit**. Le Guichet republie
le même poste sous un nouveau numéro d'annonce : l'entrée restait ouverte à juste titre, en
pointant sur l'annonce fermée vue la première fois.

**Livré** : `liensARafraichir` (PURE), à partir du MÊME matcheur que le marquage « vue »
(`brutesParIdStocke`). Deux refus d'écrasement (lien vide, lien identique), **seul le lien**
écrit — ni statut, ni priorité, ni date d'envoi, ni note (garde-fou n°2), ni ville, ni note de
fit. Branché dans les DEUX chemins d'écriture, sinon le défaut rouvrait par la porte d'à côté
(`[FERMETURE-03]`). La ligne `[veille]` porte maintenant `liens=N`.

**⚠️ Ce que je n'ai pas pu mesurer** : `jobbank.gc.ca` est injoignable depuis la session
(HTTP 000 sur cinq URL du suivi), donc l'AMPLEUR reste inconnue — combien des 17 offres ouvertes
notées 60+ pointent sur une annonce fermée. Le mécanisme est établi par le code, pas le nombre.
La preuve viendra de `liens=N` à la prochaine passe.

**Décision de Marc au passage** : le délai de péremption reste à 2 jours. Le descendre à 1
fermerait des offres vivantes au premier hoquet du flux — incident déjà vécu (40 offres périmées
en 3 jours sur une panne d'infrastructure).

---

## Session 2026-09-17 — `[BORNES-02]` : l'étape affamée reçoit une enveloppe à elle

Marc, après le contrôle : « corrige les bornes ».

**Ce qui est livré** : `BUDGET_BORNES_VEILLE_MS` (20 s), une enveloppe DÉDIÉE à
`mesurerBornes`, accordée par le SEUL cron de veille — dont la route est à
`maxDuration = 300`. Le cron de géocodage (60 s) ne la reçoit pas et garde exactement le
comportement d'avant. Le budget partagé de 25 s n'est pas touché.

**⚠️ Le remède que je recommandais hier était FAUX, et c'est le point à retenir.** J'avais
écrit « remonter `mesurerBornes` AVANT les étapes Nominatim ». En lisant le code : `bornesLe`
ne se pose qu'UNE fois par lieu, et `raffinerPositions` tourne juste avant. Mesurer les bornes
avant lui les figerait définitivement depuis le centre-ville — et pas dans un cas marginal :
une entreprise épinglée au centre à l'étape « 0 bis » est la PREMIÈRE candidate au raffinage de
la même passe (le tri prend le `geocodeLe` le plus ancien, et elle porte `EPOQUE_A_RETENTER`).
On aurait troqué une étape affamée contre une donnée fausse sur chaque nouvelle entreprise.

**⚠️ Et le budget partagé ne pouvait pas être agrandi.** Son propre commentaire l'interdit :
l'agrandir oblige à re-dériver le pire cas contre le mur de 60 s d'une fonction Vercel, et il
écrit « vouloir un débit plus haut = ajouter une PASSE, JAMAIS agrandir celle-ci ». D'où
l'enveloppe à part, accordée uniquement là où le mur l'autorise.

**⚠️ Correction de mon attribution d'hier.** J'ai dit « l'essentiel part dans les recherches
Nominatim ». C'était une déduction, pas une mesure : le journal donne le budget restant en fin
de passe, jamais la durée par étape. Un candidat que j'avais manqué vit entre les deux —
`adressesDepuisRegistre` n'est bornée par RIEN et traite 1 042 entreprises contre 28 821
établissements. Ce qui est mesuré : l'amont, dans son ensemble, consomme ~17,5 s des 25 s.
Qui exactement, personne ne le sait — d'où `[DISTANCES-01]` au backlog (publier la durée de
chaque étape), signalé et non corrigé.

**Verrou** : `tests/budgetPasse.test.ts`, quatre invariants — l'enveloppe suffit à COMMENCER
une requête, elle est accordée par la veille ET consommée par l'étape (les deux moitiés, sinon
c'est le trou de `[FERMETURE-03]`), le cron 60 s ne la reçoit pas, et le mur de la route qui
l'accorde tient budget partagé + enveloppe avec une marge de 2×. Cinq mutations, cinq rouges
distincts.

**⚠️ Ce que ça ne prouve pas** : que les 21 lieux seront mesurés. Ça se lit sur la ligne
`[bornes]` de la prochaine passe (fenêtre 11:00–12:00 UTC), pas sur un déploiement vert.

---

## Contrôle 2026-09-17 (12:06 UTC) — l'accélération tient, et ma prédiction sur les bornes est fausse

**Aucune ligne de code changée.** Contrôle de la première passe tournant avec la borne à 40.

**`[TRAJETS-03]` fait ce qui était annoncé.** Cron de veille du 2026-09-17, 11:31:50 UTC :

    [trajets] 40 durée(s) remplie(s) · 241 restante(s) pour les passes suivantes

La borne tient, aucun refus de budget, aucune coupure au mur — le risque du mur de 60 s ne
concerne que le cron de géocodage en reprise, et il ne s'est pas présenté. Attendu 237, mesuré
241 : le stock GROSSIT d'environ quatre par jour (offres ingérées puis entreprises placées), le
drainage NET est donc ~36/jour et l'horizon reste ~7 jours.

**🔴 `[BORNES-02]` : ce que j'ai écrit hier est DÉMENTI par la mesure.** J'avais écrit « ce
n'est pas un blocage, la passe tourne deux fois par jour, ça finira tout seul ». Deuxième passe
consécutive à `0 lieu(x) mesuré(s)`, et le reste à mesurer ne descend pas — il **MONTE** :
`bornes=0/14` le 16/09, `bornes=0/21` le 17/09. La condition d'action que j'avais moi-même
posée (« si le compte cesse de descendre ») est dépassée.

**Ce qui l'explique, et c'est structurel.** Le budget restant à la FIN de la passe est
remarquablement stable — 7 409 ms puis 7 722 ms — donc l'amont consomme ~17,5 s des 25 s de
façon reproductible. L'essentiel part dans les recherches Nominatim (`situerLot`, 8 appels à
~2 s), qui ont rendu `situées=0/10` les deux jours : du temps dépensé sans rien placer, pendant
que l'étape suivante a besoin de 15 s d'un coup pour seulement COMMENCER une requête Overpass.
Et les DEUX passes quotidiennes ont le même budget et le même ordre : elles s'affament de la
même façon. La « seconde chance » que je supposais n'existe pas.

Pourquoi ça marchait avant : les 1 286 mesures ont été prises quand l'amont était moins cher.
Le registre a grandi (1 005 entreprises absentes), l'amont s'est renchéri, et l'étape est passée
SOUS le seuil sans qu'une seule ligne ne change.

**Remède recommandé, NON APPLIQUÉ** (défaut préexistant, hors périmètre) : remonter
`mesurerBornes` AVANT les étapes Nominatim. L'ORDRE est la politique d'allocation d'un budget
partagé ; une étape placée en avant-dernier derrière un poste qui grossit finit toujours par ne
plus jamais tourner. Attend le feu vert de Marc.

---

## Session 2026-09-16 — `[TRAJETS-03]` : le débit des durées passe de ~23 jours à ~7

Marc, après le contrôle du matin : « accélère les trajets ».

**Une constante, et elle est maintenant DÉRIVÉE.**
`MATRICE_MAX_PAR_PASSE = ROUTES_ELEMENTS_MAX_PAR_JOUR − MARGE_CLICS_PAR_JOUR` = 50 − 10 = **40**
par passe, contre 12 avant. Sur les 277 durées restantes mesurées ce matin : **~7 jours** au
lieu de ~23.

**Trois décisions, et chacune répond à un mode de panne précis.**

1. **40 et pas 48.** La passe et le clic partagent le MÊME compteur, et la matrice ne remplit
   qu'une DURÉE — le tracé sur la carte vient du clic (`obtenirTrajet`), qui coûte un élément
   de plus. À 48, il resterait deux clics par jour tant que la passe a du travail. Un jour de
   rattrapage en plus contre cinq fois plus de marge : l'arbitrage n'est pas serré.
2. **Dérivée, pas écrite en dur.** Une borne par passe posée au-dessus du plafond quotidien
   ferait refuser la réservation ENTIÈRE à chaque passe (`consommerBudgetRoutes` refuse
   `n + elements > plafond`) : plus une seule durée remplie, pour toujours, avec « Budget
   Routes du jour épuisé » pour seule trace — une configuration qui se bloque elle-même en
   ressemblant à un frein qui marche.
3. **Le commentaire est réécrit en BUDGET, pas en durée.** L'ancien promettait « trois jours »
   et s'était périmé sans bruit quand le stock a grandi (c'est le constat du matin même). Une
   borne exprimée en « ce qu'on accepte de dépenser par jour » reste vraie quel que soit le
   stock ; le rythme se lit dans le journal, `[trajets] N remplie(s) · M restante(s)`.

**Verrou** : `tests/budgetRoutes.test.ts`, trois invariants DÉRIVÉS des constantes (jamais de
leur valeur du jour) — la passe ne peut pas demander plus que le jour, elle laisse au moins un
clic, elle remplit encore quelque chose. Trois mutations, trois rouges distincts.

**⚠️ À surveiller, et c'est le seul point** : la passe écrit une ligne par élément, à la fin
d'une invocation qui a déjà ingéré et géocodé. Le cron de veille a 300 s (large), mais le cron
de géocodage qui la REPREND quand elle est restée muette n'a que 60 s. Une coupure au mur y
laisserait des éléments réservés pour un travail à moitié écrit — du budget perdu, jamais une
ligne fausse, et la passe suivante refait le reliquat. Si ça se produit, le remède est de
grouper les écritures en une seule, pas de redescendre la borne.

**Prochaine passe de veille** : demain, fenêtre 11:00–12:00 UTC (plan hobby, cf. le contrôle
ci-dessous). On devrait y lire `[trajets] 40 durée(s) remplie(s) · ~237 restante(s)`.

---

## Contrôle 2026-09-16 (12:11 UTC) — la matrice passe, et les bornes touchent au but

**Aucune ligne de code changée.** Ce contrôle était un rendez-vous pris la veille pour juger
deux mécanismes sur la production, pas pour livrer.

**`[TRAJETS-01]` et `[TRAJETS-02]` sont CLOS.** Cron de veille du 2026-09-16, 11:31:50 UTC :

    [trajets] 12 durée(s) remplie(s) · 277 restante(s) pour les passes suivantes

Douze, c'est `MATRICE_MAX_PAR_PASSE` en entier : l'appel a été accepté et douze lignes de
trajet ont été écrites. **Première réussite de `computeRouteMatrix` depuis l'existence du
lot.** Le geste console de Marc (« Routes API » dans les restrictions de la clé serveur)
couvre donc bien les deux méthodes de l'API — le clic (`computeRoutes`, prouvé le 15/09) et
la passe nocturne (la matrice, prouvée ici). Le budget, remis à zéro à minuit, a servi une
réservation de douze éléments qui ont tous produit une durée : plus une seule ligne « Budget
Routes du jour épuisé ».

**`[BORNES-01]` : de `1178/1300` à 14 lieux restants.** Les grappes que le budget avait
laissées de côté le 15/09 ont été servies par les passes suivantes — le découpage n'était pas
en cause, comme annoncé. Il reste deux grappes, quatorze lieux.

**⚠️ Deux points d'observation ouverts, aucun corrigé** (ils sont au `BACKLOG.md`) :
- `[BORNES-02]` — la même passe a fait `0/2 grappe(s) interrogée(s)` : il restait 7 409 ms
  quand l'étape des bornes a été atteinte, contre les 15 000 ms qu'une requête Overpass exige
  pour seulement COMMENCER. L'étape est avant-dernière dans un budget de 25 000 ms partagé,
  donc elle ne tourne que les jours où tout ce qui précède tient en moins de dix secondes.
  Pas un blocage : `mesurerDistances` tourne deux fois par jour, et c'est ce qui a drainé les
  1 286 autres. À ne toucher que si le compte cesse de descendre.
- `[TRAJETS-03]` — 277 durées restantes à 12 par passe font ~23 jours, alors que le commentaire
  de la constante promet « trois jours ». Le stock a grandi, le chiffre n'a pas suivi. Le
  budget quotidien n'est utilisé qu'au quart (12 éléments sur 50). Monter la constante est une
  décision de DÉPENSE : elle revient à Marc.

**⚠️ Leçon de MÉTHODE, et elle a failli coûter un faux verdict.** Le compte Vercel est en plan
**hobby** : un cron `0 11 * * *` y est déclenché **à l'heure près, pas à la minute** (celui-ci
a tiré à 11:31), et la rétention des journaux est courte — mesuré à 11:25, la plus vieille
ligne gardée datait de 11:08, et une fenêtre de 24 h ne rendait que 8 lignes. Un contrôle posé
à 11:20 ne voyait donc RIEN, et ce rien ne prouvait rien. Corollaire pour les prochains
rendez-vous : viser la FIN de la fenêtre d'une heure (≈ 12:05 UTC), jamais l'heure planifiée.

---

## Session 2026-09-15 (fin) — `[TRAJETS-02]` : le budget comptait des appels jamais facturés

Marc : « budget épuisé mais j'ai juste fait 2 recherches, pourquoi ». **Ses deux clics ne
coûtaient que 2 éléments sur 50.**

**Le compte, mesuré dans les journaux** : quatre passes de matrice ont réservé 12 éléments
chacune (`MATRICE_MAX_PAR_PASSE`), soit **48**, et toutes les quatre ont été REFUSÉES en 403
par Google. Aucune route calculée, aucune facturation — et 48 éléments dépensés au compteur.
Ses deux clics ont fait le reste : 50/50.

**Le défaut** : `consommerBudgetRoutes` réserve AVANT l'appel, ce qui est juste pour un appel
que Google ACCEPTE (« un appel parti est facturé même si sa réponse est illisible »). C'est
faux d'un 403 `API_KEY_SERVICE_BLOCKED` : Google refuse la clé à la porte. Le frein posé pour
protéger l'argent a donc fini par bloquer la VÉRIFICATION du correctif qui réglait ce 403 —
le même défaut payé deux fois.

**Livré** : `nonFacture` est posé par le site qui a VU la réponse (appel jamais parti, ou
401/403), et le budget est rendu — au JOUR de la réservation, jamais sous zéro. **Restent
dépensés** : 429 (le quota est justement ce qu'on protège), 5xx (on ne sait pas), et la
réponse illisible d'un appel ACCEPTÉ (elle, a bien été facturée).

⚠️ **Ce que ça ne répare PAS** : les 48 éléments du 15/09 sont déjà écrits. Le compteur reste
à 50/50 jusqu'à sa remise à zéro (minuit, fuseau de Marc). Aucun chemin de correction manuelle
n'a été ajouté — ce serait un override d'un frein de dépense, et ça se décide.

⚠️ **Ce que les tests ne peuvent pas faire** : éprouver le compteur lui-même (`lib/etat.ts`
importe Neon directement). Ils éprouvent la DÉCISION sur le vrai module avec un `fetch`
injecté, et le BRANCHEMENT par scan des deux appelants. Trois mutations, trois rouges.

**Vérifications** : gate complet vert.

---

## Session 2026-09-15 (tard) — la carte grandit VRAIMENT, mesuré au navigateur

Marc : « la carte est trop petite encore, elle a pas grandi ». **Il avait raison, et le lot
précédent n'y était pour rien de visible.**

**Mesuré** (Chromium, page reconstituée avec la vraie feuille et le vrai balisage) : sur
1366×648, le plan faisait **337 px avant ET après** le repli des filtres. Les 170 px libérés
étaient allés au DÉFILEMENT (277 → 102 px), pas à la carte — parce que `.plan-ecran` est à son
PLANCHER (`min-height: 26rem`) sur un portable : il reçoit déjà plus que ce qui tient, donc
tout gain au-dessus ne fait que réduire le débordement.

**Deux correctifs, qui ne servent pas le même écran** :

1. **La bande d'état** (`.carte-etat`). Les compteurs et le bouton « Situer » portaient bien
   `display: inline`… mais ils étaient enfants directs de `main`, un conteneur FLEX : la
   spécification BLOCKIFIE les items de flex, donc la règle était **inerte** depuis le 13/09,
   avec un commentaire qui affirmait le contraire. Une enveloppe les en sort. Mesuré :
   **102 px → 54 px**. C'est ce qui donne les **+80 px sur 1920×960**, où le plancher ne mord
   pas.
2. **Le plancher**, 26rem → **36rem**. C'est le seul levier sur un portable, et il se paie en
   défilement. Mesuré :

   | viewport | plan | défilement de `main` |
   |---|---|---|
   | 1366×648 | 337 → **497 px** | 102 → 181 px |
   | 1536×744 | 337 → **497 px** | 6 → 85 px |
   | 1920×960 | 545 → **625 px** | 0 → 0 px |

⚠️ **L'arbitrage est assumé et il RÉVISE une demande antérieure** : « je veux pas pouvoir
scroll sous la map » (2026-08-21). Sur un portable, cette promesse n'était de toute façon
déjà plus tenue (102 px de défilement avant ce lot). La carte passe devant.

⚠️ **Ce que les tests ne peuvent PAS faire ici** : mesurer des pixels — il n'y a pas de
navigateur dans la suite. `tests/carteHauteur.test.ts` verrouille les MÉCANISMES (l'enveloppe
existe, l'inline vise ses enfants, le plancher ne redescend pas sous 34rem, il reste un
plancher et non une hauteur). Les chiffres, eux, vivent à côté de la déclaration dans
`app/globals.css`, datés.

**Vérifications** : gate complet vert. Trois mutations, trois rouges distincts (plancher
rabaissé, règle inline remise sur les items flex, enveloppe retirée).

---

## Session 2026-09-15 (soir) — `[TRAJETS-01]` CLOS, et la carte gagne la barre de filtres

**Les trajets marchent.** Marc a ajouté « Routes API » aux restrictions de la clé serveur, et
le clic de trajet sur la Carte rend une durée. Le 403 est réglé — restera à confirmer la
MATRICE (elle demande plus d'un élément et le budget du jour était épuisé) au prochain passage.

**`[CARTE-04]` — la barre de filtres se replie, sur la carte SEULEMENT.** Demande : « rends la
carte plus grande », avec la liste gardée à côté (choix de Marc entre trois options). Sur cette
page la hauteur est la ressource rare : tout ce qui vit au-dessus du plan se retranche de lui,
et la barre — recherche, trois bascules, quatre groupes de seuils — en est le plus gros poste.
Repliée, elle tient sur une ligne.

C'est un ARBITRAGE, écrit comme tel dans le code : filtrer coûte un clic de plus sur la carte.
Le pli est posé AU POINT D'APPEL, jamais dans `Filtres` — la liste garde sa barre à l'air
libre, où la hauteur ne manque pas, et un test interdit au pli d'y déborder.

⚠️ **Ce qui rend le pli honnête, c'est son indice.** `resumerFiltres` dit TOUT ce qui filtre —
la recherche, les trois bascules, les quatre seuils. `resumerSeuils` ne couvrait que les
seuils : s'en contenter aurait laissé une recherche active agir derrière un pli fermé, et fait
chercher un bug dans les données. Son exhaustivité est DÉRIVÉE de `FILTRES_VIDES` : un filtre
ajouté plus tard sans passer par là fait rougir la suite.

⚠️ **« Situer » reste HORS du pli** — c'est une action, pas un filtre, et son compte rendu avec
elle. Un test vise l'ORDRE, pas seulement la présence.

⚠️ **Un cas impossible est resté VERT en test** : ma table de cas portait une catégorie qui
n'existe pas (`production`). Vitest ne typecheck pas — seul `tsc` l'a vu, au gate. La valeur
est maintenant DÉRIVÉE de `CATEGORIES`.

**Vérifications** : gate complet vert (1 619 tests). Deux mutations : vider l'indice de la
recherche et des bascules fait tomber 6 tests, déplacer « Situer » dans le pli en fait tomber 1.

---

## Session 2026-09-15 (17:18 UTC) — le 403 a disparu, et le budget bloque la vérification

Marc a fait le geste console. Passe suivante :

`[trajets] sautée : Budget Routes du jour épuisé (48/50 éléments) — demain, ou le lien
Google Maps.`

**Plus de 403 — et ça ne prouve RIEN.** L'appel n'est pas parti : il a été refusé en amont par
le frein quotidien. On ne sait donc pas encore si l'ajout de « Routes API » aux restrictions de
la clé a réglé le problème. Ne pas lire cette ligne comme une réussite.

**Ce qui a mangé le budget** : les appels REFUSÉS. `consommerBudgetRoutes` réserve AVANT
l'appel — justifié pour un appel que Google accepte (« un appel parti est facturé même si sa
réponse est illisible »), FAUX pour un 403 que Google refuse à la porte et ne facture pas.
48 des 50 éléments du jour ont été brûlés sans qu'un seul trajet n'existe. Le frein posé pour
protéger l'argent bloque désormais la réparation d'un défaut qui n'a rien coûté. Au backlog
sous `[TRAJETS-02]`, avec le correctif proposé (rendre le budget sur un refus de configuration,
jamais sur un 429 ni sur un appel accepté).

**Le test qui reste possible AUJOURD'HUI** : un clic de trajet sur la Carte coûte **1 élément**
(`obtenirTrajet` → `consommerBudgetRoutes(1)`) et il en reste 2. C'est le seul moyen de savoir
aujourd'hui si le geste console a marché — la matrice, elle, en demande plus et sera refusée
jusqu'à demain.

---

## Session 2026-09-15 (17:05 UTC) — LA CAUSE : `API_KEY_SERVICE_BLOCKED`

La citation de la réponse brute, livrée une heure plus tôt, a rendu son verdict au premier
passage :

`[{ "error": { "code": 403, "message": "Requests to this API routes.googleapis.com method
google.maps.routing.v2.Routes.ComputeRouteMatrix are blocked.", "status":
"PERMISSION_DENIED", "details": [ { …, "reason": "API_KEY_SERVICE_BLOCKED", … } ] } }]`

**LE GESTE, pour Marc** : Console Google → **Identifiants** → la clé serveur
(`GOOGLE_MAPS_API_KEY`) → **Restrictions d'API** → ajouter **« Routes API »**. L'API est
ACTIVÉE ; c'est la CLÉ qui ne l'autorise pas. Le message d'origine (« doit être activée »)
envoyait donc bien au mauvais endroit — la supposition de départ est confirmée par la mesure.

**ET LE DÉFAUT QUI L'AVAIT CACHÉE** : `API_KEY_SERVICE_BLOCKED` est dans la table
`PAR_REASON` depuis le premier commit. Elle n'a jamais été atteinte parce que
`computeRouteMatrix` est un endpoint de **STREAMING** : son refus arrive enveloppé dans un
TABLEAU (`[{ "error": … }]`), et `.error` sur un tableau vaut `undefined`. Un refus
parfaitement reconnaissable est resté « cause inconnue » pendant deux lots. Corrigé par
`denvelopper`, verrouillé par le corps EXACT relevé en production.

⚠️ **La morale des trois lots, et elle vaut au-delà de Google** : la logique de classement
était juste à chaque fois ; c'est le CHEMIN D'ALIMENTATION qui perdait l'information — le
corps déduit du statut, puis le `json()` qui jetait le non-JSON, puis l'enveloppe non ouverte.
**Un classificateur correct nourri d'une donnée amputée rend un verdict faux avec aplomb.**
Devant un « inconnu » qui persiste, auditer ce qu'on DONNE au classificateur avant de toucher
au classificateur.

**Vérifications** : gate complet vert. Mutation : retirer `denvelopper` fait tomber 3 tests,
dont celui qui porte le corps réel.

---

## Session 2026-09-15 (soir) — premier passage réel : le message ne ment plus, mais il ne dit rien

Marc a lancé la veille à 15:45 UTC. La ligne est tombée :

`[trajets] échec : Routes API refuse la clé (403). Google n'a donné aucune explication
lisible — relever la réponse brute pour trancher.`

**La moitié qui marche** : la branche « cause inconnue » a fait son travail — elle a REFUSÉ
d'affirmer « l'API n'est pas activée ». C'est précisément ce que le lot précédent visait.

**La moitié qui manquait** : le module promettait de CITER ce qu'il ne sait pas interpréter,
mais les cinq sites lisaient `reponse.json().catch(() => null)` — donc le corps était jeté
AVANT d'arriver au module dès qu'il n'était pas du JSON. Un corps vide, une page HTML et un
JSON sans `message` rendaient la même phrase, alors que ce sont trois diagnostics opposés.
Corrigé : lecture en TEXTE, JSON tenté dessus, citation bornée de ce qui reste. Trois phrases
distinctes désormais — cause non reconnue / réponse brute citée / réponse VIDE.

**Ce qu'on sait à ce stade, et c'est peu** : le refus ne porte ni `reason` connue, ni phrase
lisible. Le prochain passage citera la réponse telle quelle. Si elle est VIDE, ça oriente
ailleurs que l'API elle-même — un refus sans corps d'erreur ne ressemble pas à un refus de
Routes API.

**`[PROFIL-02]` est clos par les mêmes journaux**, sans une ligne de code. Le `console.warn`
est apparu : `[profil] document antérieur à 5 champ(s) du barème, comblés depuis le défaut :
faits.parcours, ponderation.conditions, pointsConditions, facteurHorsDomaine, termesParJour`.
Rien n'était filtré — la ligne n'avait pas été émise dans la fenêtre regardée la veille. La
migration du profil comble bien cinq champs, dont un que je n'avais pas nommé.

**Vu en passant, pas un défaut** : `[bornes] 0/6 grappe(s) interrogée(s)` avec `budget
restant=0 ms`. La passe de distances a consommé le budget avant les bornes. Le découpage en
grappes tient ; c'est l'ordre des étapes dans le budget qui décide, et `bornes=0/126` sur cette
passe-là n'infirme rien.

**Vérifications** : gate complet vert. Deux mutations : rendre `brut` toujours nul fait tomber
5 tests, revenir à `.json()` aux cinq sites en fait tomber 6.

---

## Session 2026-09-15 (fin) — `[TRAJETS-01]` : le message accusait la mauvaise cause

**Le défaut n'était pas le 403, c'était la PHRASE.** `[trajets] échec : Matrice refusée (403) :
« Routes API » doit être activée et dans les restrictions de la clé serveur` — cette phrase
était écrite EN DUR, déduite du seul nombre 403. Or Google refuse pour au moins six raisons :
API non activée, API absente des restrictions de la clé, clé NAVIGATEUR utilisée côté serveur,
restriction par IP, clé invalide, facturation inactive. Chacune se répare à un endroit
DIFFÉRENT de la console — et cinq fois sur six, le message envoyait Marc au mauvais, en lui
laissant croire le problème réglé une fois le geste inutile accompli.

**Livré.** `lib/erreurGoogle.ts` (nouveau, PUR) lit la cause là où Google la met vraiment :
`error.details[].reason`, un identifiant stable et documenté — jamais `error.message`, qui est
de la prose que Google traduit et remanie. Il rend ensuite LE geste de CETTE cause. Les cinq
sites de refus y passent : `appelerRoutes`, `appelerMatrice`, le géocodage d'entreprise,
l'autocomplétion Places et les détails Places. Une cause non reconnue n'est plus déguisée en
« API non activée » : elle est CITÉE telle que Google l'a écrite, avec le code HTTP.

**Ce que ça ne fait pas, et il faut le dire** : je ne peux pas basculer un interrupteur dans la
console Google depuis ici. Ce lot ne rétablit pas les trajets — il fait que le prochain passage
NOMME le geste à faire au lieu d'en supposer un. La vraie cause se lira dans les journaux au
prochain `[trajets]`.

**Vérifications** : gate complet vert. Les cinq branchements sont prouvés par MUTATION — en
faisant cesser la lecture du corps aux cinq sites, exactement cinq tests tombent, un par site ;
et en refaisant du repli « cause inconnue » un « API non activée », six tests tombent. Sans
cette preuve, les tests de 403 seraient restés verts sur un code qui jette la réponse (c'est
d'ailleurs ce qu'ils faisaient avant : leurs faux `fetch` ne portaient aucun corps).

⚠️ **Correction d'une ligne de la session précédente** : « Geste console Google côté Marc, déjà
connu » (ci-dessous) était faux. Rien n'était connu — c'est le code qui affirmait connaître.

---

## Session 2026-09-15 (suite) — les trois correctifs CONSTATÉS en production

Marc a ouvert l'app à 12:49 UTC. Les journaux et `resume_suivi` tranchent, chacun par une
mesure.

**`[FERMETURE-03]` — tiré, et persisté.** `perimees` 624 → **645 (+21)**, `jamaisConfirmees`
**21 → 0**, `suivies` 1588 → 1568. Les 21 offres qu'aucun balayage n'avait jamais confirmées
sont aux archives, avec leur lien et leur recherche web.
⚠️ **Conséquence à connaître** : `meilleureNote` est passée de **85 à 78**. Les mieux notées du
suivi étaient précisément ces offres du jeu de départ (Chantier Davie 85, Groupe Leclerc 84,
STERIS 80…). C'est ce que Marc a demandé, et c'est réversible — mais ça change ce que l'accueil
montre en premier.

**`[BORNES-01]` — de 0 à 1 178.** `[bornes] 1/6 grappe(s) interrogée(s) · 225 borne(s) vue(s) ·
1178 lieu(x) mesuré(s) · marque=1028/1178 vitesse=150/1178 tarif=189/1178`, et
`bornes=1178/1300` dans le bilan de la passe. Une grappe sur six a suffi au budget (`budget
restant=0 ms`) ; les cinq autres repasseront, comme prévu.
⚠️ **Ma supposition était fausse, et la mesure la corrige** : j'avais annoncé « probablement un
homonyme géocodé à l'autre bout du monde ». **AUCUN aberrant n'a été signalé.** Les six grappes
sont des amas LÉGITIMES — le suivi couvre désormais Gaspé, Cacouna, Cap-Chat, Vaudreuil : plus
de 3° d'étalement réel. La garde ne bloquait pas sur une donnée sale, elle bloquait sur la
croissance normale du bassin. Le découpage était donc le bon remède, pour une raison que je
n'avais pas.

**`[PROFIL-01]` — l'erreur a disparu.** Aucun log de niveau warning ou error dans la fenêtre,
et les entrées `GET /profil` et `GET /references` ont un corps VIDE. La `ZodError` « profil
actif illisible » de la veille n'est plus là : les pages relisent le profil sans incident.
**Confirmé par Marc dans la foulée** : `/profil` affiche bien les faits tirés de son CV. La
branche « aucun CV actif » est écartée — c'est l'écran qui a tranché ce que les journaux ne
pouvaient pas dire, et `[PROFIL-01]` est clos.

⚠️ **Il reste une limite d'OBSERVABILITÉ, pas du correctif** : aucun `[profil] document
antérieur à N champ(s)…` n'a été capté. On ne sait donc pas si la migration a comblé quelque
chose ou si le document n'avait plus rien à combler — et le `console.warn` devait justement
être ce signal, alors que les `console.log` des mêmes requêtes passent. Une promesse
d'observabilité qu'on ne peut pas relire n'en est pas une : au backlog sous `[PROFIL-02]`, à
trancher lors du prochain passage sur ce module plutôt qu'à chasser à froid.

**Autre chose vue en passant, non corrigée** : `[trajets] échec : Matrice refusée (403) —
« Routes API » doit être activée et dans les restrictions de la clé serveur`. Geste console
Google côté Marc, déjà connu.

---

## Session 2026-09-15 — la fermeture d'office n'atteignait pas la base

Vérification du lendemain, et elle a trouvé quelque chose.

**Mesuré** (`resume_suivi`, 12:30 UTC) : `perimees` 606 → **624** (+18) et `suivies` 1593 →
1588 — donc une passe a bien tourné. Mais `jamaisConfirmees` reste à **21**, inchangé, avec
`seuilFermetureJours` toujours à 27. La péremption ordinaire s'écrit ; la fermeture d'office,
non.

**La cause, lue dans le code** : `lib/veilleComplete.ts` n'écrit `perimeeLe` en base que pour
les identifiants listés dans `rapport.perimees`. Les fermetures d'office vivaient dans
`rapport.fermetureAuto.fermetures` et dans `rapport.offres` — jamais dans cette liste. Le
mécanisme calculait juste, rendait juste, passait ses tests, et **n'écrivait rien**.

⚠️ **C'est exactement le piège dont j'avais écrit la leçon la veille**, dans le même lot
(« un mécanisme livré vert, testé, et mort à l'arrivée »). Je l'avais évité sur
`couvertureComplete` et repris par la porte d'à côté. Ce qui l'a rendu invisible : mon test
d'intégration vérifiait `rapport.offres` — ce que la passe REND —, et l'écriture vit un
module plus haut.

**Le correctif** : les fermetures entrent dans `rapport.perimees`, la liste que la
persistance parcourt déjà. **Une seule liste**, pas une seconde boucle chez l'appelant : deux
chemins d'écriture pour le même fait auraient divergé, et le troisième mécanisme de
péremption aurait été oublié pareil. Le POURQUOI de chaque fermeture reste dans
`fermetureAuto`, qui nomme ses offres et son motif d'abstention.

**Le verrou qui manquait** : un invariant sur le CONTRAT dont l'écriture dépend — toute offre
que la passe rend avec un `perimeeLe` que l'entrée n'avait pas DOIT figurer dans
`rapport.perimees`. Il vaut pour la péremption ordinaire, pour la fermeture d'office, et pour
le prochain mécanisme. Plus une garde à l'autre bout : la persistance parcourt bien cette
liste-là. Mutation jouée : remettre le code d'hier fait tomber le test.

**Ce qui reste NON prouvé, et il faut le dire** : `[PROFIL-01]` et `[BORNES-01]` n'ont laissé
aucune trace — la rétention des journaux Vercel semble être de l'ordre de l'heure (une
requête sur 16 h ne rend que les 30 dernières minutes), et ni `/profil` ni `/references`
n'ont été ouverts. Leur code est déployé et vert ; leur effet en production n'est pas
constaté. Prochaine vérification programmée.

---

## Session 2026-09-14 (suite 4) — les bornes de recharge se mesurent de nouveau

`[BORNES-01]`, demandé par Marc après le lot précédent.

**La panne** : `bornes=0/1293 (1293 en échec)`, précédé de « boîte englobante anormalement
large — interrogation annulée ». La mesure interroge Overpass **une fois pour tout le lot**
(correction d'août : une requête par entreprise vidait le budget), avec une garde qui refuse
une boîte absurde. La garde a fini par refuser le lot ENTIER — et le refus était **définitif**
par construction : un échec ne marque aucune ligne, donc le lot du lendemain est identique,
donc la boîte aussi. Un seul lieu mal géocodé gèle 1 292 mesures, tous les jours, avec une
ligne d'erreur pour seule trace.

**Le correctif** : la garde décide désormais du **découpage**, plus de l'abandon.
`grapperPourBornes` (`lib/bornes.ts`, PURE) fait grossir une grappe tant que SA VRAIE boîte —
marge de 15 km comprise — respecte l'étendue. Chaque boîte est donc valide par construction,
sans inventer de taille de cellule ni supposer une latitude pour convertir la marge en degrés
de longitude. Sur la forme réelle des données (un amas régional dense plus quelques points
isolés), ça fait une requête pour l'amas et une par isolé : le coût nominal ne bouge pas.

La passe interroge les **plus grosses grappes d'abord** — quand le budget ne suffit pas pour
toutes, il sert au plus grand nombre —, et ce qui n'est pas atteint n'est ni mesuré ni en
échec : ça repasse. Le journal rend `interrogées/grappes` et le nombre de bornes vues.

⚠️ **Ce qu'aucune requête régionale ne peut couvrir est NOMMÉ**, avec ses coordonnées et la
consigne « à re-géocoder ». « 1 293 en échec » ne se corrige pas ; « Machin inc. (48,85 ; 2,35) »
se corrige.

⚠️ **Un test-garde a rougi sur un lot qui ne touchait pas à ce qu'il défend** : il cherchait
littéralement `budgetMs < DELAI_MAX_MS`, et la grandeur comparée s'appelle maintenant `reste`
(le budget restant à l'instant de la grappe — strictement plus juste, puisqu'il y a plusieurs
requêtes). Réancré sur le FAIT, avec une anti-vacuité sur la provenance de la constante.

Gate complet vert. `tests/bornes.test.ts` (+11 cas : découpage, déterminisme, aucun lieu
perdu, chaque boîte sous la garde, aberrants nommés, plus une garde de CÂBLAGE lue sur la
source décommentée). Cinq mutations jouées — dont une qui a révélé que rien ne couvrait le
branchement dans `mesurerBornes` : casser l'étendue passée depuis `lib/actions.ts` laissait
toute la suite verte.

---

## Session 2026-09-14 (suite 3) — le profil enregistré se relit

`[PROFIL-01]`, demandé par Marc après le lot précédent.

**La panne** : le document de profil en base ne passait plus `ProfilSchema` — quatre champs
manquants, tous ajoutés au MÊME commit (ADR-0014 D2). Le document n'est pas corrompu, il est
**antérieur** au barème d'aujourd'hui, et rien ne l'avait relu depuis.

**⚠️ Ce que j'avais annoncé était trop large, et c'est mesuré** : « tout réglage enregistré
est ignoré, `termesParJour` compris » est FAUX. Le rayon et les métiers vivent dans leurs
propres lignes d'état ; `lib/scoring.ts` note avec `PROFIL_DEFAUT` par défaut ; et
`termesParJour` n'est lu par aucun code hors du défaut — c'est la Routine qui l'applique
depuis le protocole. Ce qui était réellement cassé : la FICHE (`/profil` et `/references`
montraient le barème et le SWOT du CODE au lieu de ceux tirés du CV de Marc) et surtout
**`validerProfil`, qui refusait — donc plus aucun CV validable**.

**Le correctif** : `lib/profilStocke.ts` (PURE) comble depuis `PROFIL_DEFAUT` ce que le
document n'a pas, **récursivement** (le cas réel, `ponderation.conditions`, est DANS un objet
déjà présent : une migration à un seul niveau l'aurait raté), puis passe le schéma STRICT.

Trois refus maintenus, chacun délibéré :
- une valeur **présente** n'est jamais écrasée, même différente du défaut — c'est le choix de
  Marc, et c'est le test qui sépare une migration d'un écrasement ;
- une valeur présente mais **fausse** lève toujours : « ce champ n'existait pas encore » et
  « ce champ est cassé » sont deux situations opposées ;
- un document qui n'est pas un objet lève : fabriquer un profil complet à partir de rien
  reviendrait à servir le défaut sous l'apparence d'un profil validé.

⚠️ **Pas d'assouplissement du schéma**, qui aurait réparé l'écran en une ligne et fait de
chaque ajout futur une dérive silencieuse. Et **la liste des champs à combler se DÉRIVE du
défaut** : le prochain champ du barème est couvert le jour où il y entre, sans que personne
n'y pense — ce dépôt a payé cinq fois des listes écrites à la main.

⚠️ **Pas de réécriture en base non plus** : un chemin de lecture qui écrit court contre les
vraies écritures. Inutile ici — la prochaine validation de CV part du profil MIGRÉ et
persiste la forme complète, donc la dérive se soigne d'elle-même.

Un `console.warn` NOMME les champs comblés à chaque lecture : une migration muette ferait
disparaître la seule trace que certains réglages viennent du défaut et non de Marc. C'est
aussi le signal qui prouvera, dans les journaux Vercel, que le correctif a pris effet.

Gate complet vert. `tests/profilStocke.test.ts` (11 cas, le document réel reconstitué depuis
`PROFIL_DEFAUT` moins les quatre champs), plus la lecture unifiée : `profilActif` et
`profilCourantOuDefaut` passent par la MÊME fonction, sans quoi la fiche s'afficherait
pendant que la validation refuserait.

---

## Session 2026-09-14 (suite 2) — la vérification se fait toute seule

Marc : « quasi toutes les offres sont à vérifier, mais je veux pas revérifier manuellement,
je veux que tu le mettes en place ».

**Mesuré d'abord** (`[MESURE-01]`, `resume_suivi` étendu, production 2026-09-14) :
1 593 offres vivantes, dont **1 572 confirmées** par un balayage et **21 jamais vues**,
toutes âgées de 30 à 90 jours. La plus ancienne « dernière vue » date de 4 jours : la veille
tourne. Ce n'est donc pas « quasi toutes » — mais le chiffre n'existait nulle part, et c'est
ça qu'il fallait réparer en premier.

**`[FERMETURE-01]`** — `lib/fermetureAuto.ts` (PURE) ferme d'office, dans la passe
quotidienne, les offres qu'aucun balayage ne peut confirmer. Le seuil d'âge se **MESURE** :
`lib/dureeVie.ts` donne l'âge auquel la survie observée tombe sous 10 %, et c'est lui qui
ferme. Écrire « 60 jours » aurait été une politique inventée, fausse au premier changement de
rythme du marché. Quand la mesure ne conclut pas (trop peu de fermetures observées, courbe
qui ne descend pas), **rien ne se ferme** — échec fermé.

Trois gardes, chacune avec son MOTIF dans le rapport (« rien à fermer » et « je n'avais pas
le droit de regarder » sont deux situations opposées) : la passe n'a rien vu · le journal ne
couvre pas la majorité du suivi · la durée de vie n'est pas mesurable. Plus : on ne ferme
jamais plus que ce que la passe vient de confirmer, les plus vieilles d'abord, et **jamais ce
que Marc a travaillé** (statut changé, date d'envoi, note perso).

⚠️ **Pas de garde sur `couvertureComplete`, volontairement** — c'est la garde que le voisin
immédiat a et que celle-ci n'a pas, donc elle est justifiée par écrit dans le module. Elle
répond à « la passe a-t-elle relancé tous les termes ? », ce qui est décisif pour une offre
DÉJÀ VUE et ne dit rien d'une offre JAMAIS vue. La garder aurait eu l'air prudent et aurait
surtout été inopérant : **aucun lot n'est déposé depuis le 2026-08-21**, donc la production
tourne en couverture incomplète et la règle n'aurait jamais tiré. Un mécanisme livré vert,
testé, et mort à l'arrivée — un test dédié couvre maintenant ce cas.

**`[FERMETURE-02]`** — la pastille « à vérifier » SE TAIT quand le journal a perdu la majorité
du suivi. Le journal est un seul JSON dans une ligne d'état : perdu ou écrit à moitié, il
rendait toutes les offres « jamais revues » d'un coup, et l'écran affichait une accusation
contre le suivi entier. Ça ne dit rien des offres, ça dit que le journal est en panne.

⚠️ **Bug préexistant vu dans les journaux Vercel, NON corrigé** : le profil actif stocké en
base ne passe plus son schéma Zod (`ponderation.conditions`, `pointsConditions`,
`facteurHorsDomaine`, `termesParJour` manquants) — `/references` se replie sur le profil par
défaut. Conséquence : **tout réglage que Marc a enregistré est ignoré**, y compris
`termesParJour`. Au backlog (`[PROFIL-01]`).

Gate complet vert. Nouveaux tests : `fermetureAuto` (17), plus deux tests qui TRAVERSENT la
passe (le module pouvait être juste sans être appelé, et l'être sans jamais tirer). Neuf
mutations jouées ; deux témoins d'intégration se sont révélés protégés par la borne plutôt
que par la garde qu'ils prétendaient éprouver — corrigés en les rendant les plus vieux.

---

## Session 2026-09-14 (suite) — cliquer pour avoir l'offre, et savoir ce qu'on regarde

Marc : « les liens marchent pas forcément, je veux juste cliquer pour avoir l'offre, parce
que ça m'étonne certaines devraient être périmées ». Deux plaintes, **une seule cause** — le
jeu de départ.

**Ce que la mesure a montré** (2026-09-14, les 32 offres ouvertes notées 60 et plus) :
14 liens mènent à une vraie annonce, 10 sont des jetons `to.indeed.com`, 4 des listes
d'emplois d'employeur, 4 des pages d'accueil. Les **18 liens faibles sont exactement les 18
offres du jeu de départ** de cette liste ; les 14 offres ingérées portent toutes une annonce.
Et les offres « qui devraient être périmées » sont les **38 offres du jeu de départ**
(2026-02-25 → 2026-07-30) : elles ne sont jamais entrées dans le journal de veille, et
`appliquerBalayage` ne compte d'absences que pour ce qu'il a vu lui-même. Elles sont donc
inpérimables **par construction**, et rien à l'écran ne le disait.

**`[LIEN-01]`** — `lib/lienOffre.ts` (PURE) classe ce qu'un lien ATTEINT : `offre`, `liste`
(accueil ou liste d'emplois), `redirection` (jeton d'agrégateur), `aucun`. Le libellé du lien
dit la destination (« l'offre » / « le site » / « lien Indeed ») au lieu de promettre
« offre ↗ » partout, et un **second chemin** — « chercher l'annonce ↗ », une recherche web
sur employeur + poste — apparaît dès que le lien ne mène pas à l'annonce.
La règle porte sur le **dernier segment** du chemin : la mutation en `includes` naïf classe
« liste » les 14 liens qui marchent (`/jobsearch/` contient `jobs`). Genre et adresse
viennent du MÊME appel (`lienDeOffre`) — deux règles séparées auraient fini par rendre
cliquable un lien qu'on venait de déclarer inutilisable.

**`[LIEN-02]`** — `lib/fraicheur.ts` (PURE) : une offre que la veille n'a jamais vue et dont
le repérage date de plus que la patience de la veille elle-même
(`JOURS_AVANT_DOUTE = SEUIL_ABSENCES_PEREMPTION`, dérivé, jamais choisi) porte une pastille
**« à vérifier »** et, une fois dépliée, la phrase « repérée il y a N jours, jamais revue par
un balayage ». Ambre et trait TIRETÉ, contre le rouge plein de « périmée » : on ne sait pas,
ce n'est pas la même chose que savoir que c'est fermé (contraste mesuré 8,74:1 sur le fond
des cartes, contre 5,76:1 pour « périmée »).

🧭 **Tranché sans feu vert, à confirmer par Marc** : ces 38 offres ne sont **pas** archivées
d'office sur leur âge. Ce sont les mieux notées du suivi ; les retirer sur une supposition
ferait l'inverse de ce qui est demandé — Marc veut cliquer pour vérifier, et il a maintenant
un lien qui le lui permet. L'alternative écartée : un seuil d'âge qui périme automatiquement.

⚠️ **Bug préexistant trouvé en chemin, non corrigé** (`[DUREE-03]` au backlog) : `joursEntre`
rend `NaN` et non `0` sur une date malformée. `lib/fraicheur.ts` s'en protège ; `observer` et
`survie` restent exposés, sans conséquence connue (ils ne lisent que des dates écrites par
l'app).

Gate complet vert. Nouveaux tests : `lienOffre` (48), `fraicheur` (10), `liensOffreCables`
(11, garde de câblage — le module pouvait être juste sans être appelé). Chaque garde prouvée
par mutation. `lib/scoring.ts` et la logique de matching non touchés : protocole §11 non
déclenché.

---

## Session 2026-09-14 — durée de vie des offres, archives, couverture totale

Trois demandes de Marc, tranchées par lui avant de coder : couvrir **tout le bassin** de
termes à chaque passe (plutôt qu'ouvrir le lien de chaque offre, qui serait du scraping),
un **vrai écran Archives**, et une historique orientée « le marché bouge à quelle vitesse ? ».

**`[DUREE-01]`** — la donnée était déjà collectée (le journal de veille garde par offre la
première et la dernière vue) ; ce qui manquait, c'est ce qu'on en tire. Le piège est la
CENSURE : une partie des offres est encore ouverte, donc leur durée n'est pas finie. Jeter
ces offres biaise la médiane vers le bas (les longues sont justement celles qui durent),
les traiter comme fermées la biaise dans l'autre sens. C'est **Kaplan-Meier** qui répond, et
le test central est construit pour discriminer : sur le même jeu, les deux naïves donnent 10
jours, l'estimateur juste en donne 15.

Écran `/archives` : la vitesse du marché (médiane globale, par type de poste, par employeur,
effectif à côté de chaque chiffre) puis les offres fermées avec leur durée observée.

**`[DUREE-02]`** — la rotation des termes est supprimée : `termesParJour` passe de 18 au
bassin entier (48). Une offre absente d'un lot l'est désormais de la requête qui la
trouvait, donc son absence veut dire quelque chose.

⚠️ **Et c'est le cas PARTIEL qui a demandé le vrai travail.** Le quota Indeed se referme en
s'aggravant, donc une passe peut légitimement s'arrêter au milieu du bassin. Baisser
simplement le seuil aurait périmé en deux jours tout un pan du suivi sur un empêchement
d'infrastructure. Le lot porte donc sa propre couverture (`couverture: {demandes, balayes}`,
additif et optionnel), chaque source dit si elle a tout balayé, et le seuil bas (2 jours au
lieu de 5) ne s'applique QU'AUX absences constatées sous couverture prouvée — via un
compteur séparé dans le journal. Échec fermé partout : pas de preuve ⇒ ancien seuil.

**À surveiller** : 48 termes par passe au lieu de 18, c'est 2,7× plus d'appels Indeed sur un
quota partagé. Si les rapports montrent des couvertures systématiquement incomplètes, c'est
`termesParJour` qu'on redescend — et le seuil bas cessera de s'appliquer tout seul, sans
rien périmer à tort entre-temps. Le rapport de passe le DIT (« couverture incomplète »).

## Session 2026-09-13 — refonte téléphone `[MOBILE-01]`

Marc : « pas adapté pour téléphone, refonte de l'interface totale, moins de texte,
plus simple, gros boutons, pas de scroll sur le côté ». Trois arbitrages pris par
lui avant de coder : **tout redessiner** (pas seulement la mise en page), **barre de
navigation en bas**, **résumé court puis la liste**.

**Mesuré au navigateur avant / après**, sur l'accueil réel avec le CSS compilé, à
375, 390 et 412 px :

| | avant | après |
|---|---|---|
| défilement latéral | 94 px | **0** |
| cibles sous 44 px | 26 | **0** |
| plus petite police rendue | 11,2 px | **13 px** |
| hauteur avant la première offre | 1 267 px | **690 px** |

Ce qui a changé : navigation fixée en bas (Suivi · Carte · Plus ; la même barre
remonte en haut au-dessus de 56 rem, `display: contents`, pas un second composant) ·
bandeau de trois chiffres en tête de l'accueil, relances / entonnoir / ajout sous des
`<details>` natifs (zéro JS au chargement) · les quatre seuils de filtre sous un pli,
avec l'indice de ce qui est actif · neutres passés du chaud au froid pour que l'ambre
tranche · cible tactile devenue un jeton (`--touche`) · phrases d'explication coupées
partout où le FAIT suffit.

`tests/mobile.test.ts` verrouille les causes mesurées (largeur intrinsèque, cible en
dur, police sous plancher, champ de saisie sous 16 px, réserve de la barre), pas le
symptôme — le `overflow-x: clip` du filet le masquerait. Six assertions, chacune
prouvée par mutation.

**Défaut préexistant corrigé en passant** : le bloc des relances écrivait
`var(--bordure)` et `var(--texte-doux)` — deux jetons qui n'existent pas. Une variable
CSS inconnue ne lève rien et n'apparaît dans aucun test.

**À confirmer par Marc sur son téléphone.** Le harnais de mesure vit dans le
scratchpad de la session (DOM réel recopié + CSS compilé) ; il n'est pas committé —
un test de rendu exigerait Playwright en dépendance, ce que ce dépôt n'a pas.

## Session 2026-08-24 — la vraie cause du grand vide : la liste, pas la carte

Marc a fini par trouver lui-même : « quand j'agrandi la map, les offres se mettent
en dessous. il y a 1600 offres du coup ça demande un grand espace ». Le CARTE-K de
la session précédente (recalage Google Maps) était juste — mais le vrai coupable du
« grand espace vide » était ailleurs : en mode agrandi, `.plan-ecran` passe à une
seule colonne et `.carte-liste-colonne` n'est plus étirée par la grille — sa ligne
implicite se dimensionne à son contenu, ~1600 offres de haut.

`[CARTE-L]` (`app/globals.css`) : `.carte-liste-colonne` reçoit `height: 82vh` en
mode agrandi, comme la carte juste au-dessus — la liste défilait déjà seule en
interne (`overflow-y:auto`), il ne manquait qu'une hauteur explicite pour que ce
défilement serve à quelque chose. Gate complet vert, déployé (`d1169bb`, `READY`),
webhook Vercel sans accroc cette fois.

**Reste à confirmer par Marc** : que la carte agrandie ne laisse plus d'espace vide
sous elle. Si le symptôme persiste, il reste un candidat non exploré — la carte
« Michigan » du HANDOVER précédent pourrait ne pas être entièrement expliquée par
CARTE-K seul.

## Session 2026-08-21 (suite 3) — la carte se recale enfin, capture à l'appui

Marc a envoyé une capture d'écran : deux cartes Google superposées (Québec en haut,
Michigan en bas), un grand vide entre les deux. Cause trouvée — `defaultBounds` ne
calcule qu'UNE fois au montage, et Google Maps ne réécoute JAMAIS le CSS de son
conteneur tout seul. Les resserrements `[CARTE-J]` (pourtant mesurés et réels côté
CSS) n'atteignaient donc jamais l'écran : Google dessinait sur son ancien canevas.

`SuivreRedimensionnement` (`components/CarteGoogle.tsx`) observe le `<div>` réel de
la carte (`ResizeObserver`) et déclenche `google.maps.event.trigger(map, "resize")`
+ un `fitBounds` sur le cadrage courant (via une ref, pas une fermeture figée) à
chaque changement de taille. Gate complet vert.

**Webhook Vercel manqué DEUX fois d'affilée** (record sur ce dépôt — d'habitude un
seul commit vide suffit) : `dd494bc`… non, ici `99d8fc1` puis `b4ef411` n'ont produit
AUCUN déploiement plusieurs minutes durant. Un second commit vide (`8d3765a`) a fini
par passer, mais le build lui-même a pris ~70 s au lieu des ~10-40 s habituels — à
surveiller si ça recommence. `emploi.hubperso.com` sert `8d3765a`, confirmé `READY`.


## Session 2026-08-21 (suite 2) — 403 élargi, map écrasée MESURÉE, tri de la liste

Marc, après le lot `[CARTE-H]` : « jai encore erreur 403, rends la map plus grande de
base, jai aussi encore beaucoup le soucis de scroll sous la map, corrige. aussi pour les
offres a droite de la map, laisse moi les classer (note, distance, etc) ». Détail complet
au BACKLOG `[CARTE-I]`.

**Le 403 avait une deuxième source, jamais traduite.** `[CARTE-H]` ne traduisait le 403
QUE pour Routes ; `lib/geocodage.ts` (Geocoding, Places Autocomplete, Place Details)
rendait un HTTP 403 générique. Si Marc n'a activé que Routes dans la console, Geocoding
ou Places pouvaient encore refuser la clé sans qu'aucun message ne le dise. Les trois
nomment maintenant l'API et le geste console.

**Le vrai bug du « scroll persistant » : la carte s'écrasait, MESURÉ avec un harnais
Playwright fidèle** (la vraie barre de filtres — 16 boutons — pas une maquette simplifiée) :
39,7 px de carte sur 1280×720. Ce n'était pas un défilement qui revenait, c'était un plan
sans plancher qui perdait la bataille contre une barre de filtres généreuse. Corrigé par
trois gestes mesurés (note de `BoutonSituer` repliée, rythme resserré SUR CETTE PAGE
seulement, plancher `min-height: 26rem` sur `.plan-ecran` + `main` qui absorbe un éventuel
écart résiduel par un défilement interne CONTENU, jamais celui de toute la page).

**Tri de la liste** (note/distance/nom) ajouté dans `lib/carte.ts` (pur, testé) +
`ListeCarte.tsx` (devient client). Gate complet vert (81 fichiers, 1398 tests).

**Déploiement : webhook GitHub→Vercel manqué une 4ᵉ fois, remède appliqué.** CI verte sur
`dd494bc` (run 300), mais six minutes après le push, `list_deployments` ET `get_deployment`
montraient tous deux `9ffa65b` ([CARTE-H], le commit PRÉCÉDENT) comme dernier `READY` —
aucune entrée pour `dd494bc`. Récidive du pattern déjà consigné §9 (2026-07-31, 08-12,
08-14). Remède : commit vide `d742025` (pousse un nouvel événement de push, sans toucher
au code — `dd494bc` était déjà bon). Vérifié : `emploi.hubperso.com` sert désormais
`dpl_CyDPhkXE1oPmZn1q4he1gMLRWwpG`, sha `d742025` (donc le contenu de `dd494bc` + rien de
plus), `readyState: READY`. **Ce qui reste À VÉRIFIER PAR MARC** : le 403 doit encore se
corriger côté console Google (activer « Geocoding API » et « Places API (New) », en plus
de Routes déjà fait, dans les restrictions de la clé serveur, projet hubperso) — le code ne
peut rien de plus ici, le message le dit exactement.


## Session 2026-08-21 (suite) — quatre retours de test réels sur la carte, mesurés

Marc, après avoir testé la carte en vrai : « je veux pas pouvoir scroll sous la map…
les entreprises sont toujours écrites 1 au lieu de la moyenne des notes des offres…
les boutons sont moches et mauvaise couleur… je veux pouvoir cliquer sur la carte pour
désélectionner la sélection ». Détail complet au BACKLOG `[CARTE-H]`. En bref :

1. **Défilement** — l'ancien `calc(100vh - 13rem)` était un chiffre deviné, il a
   re-dérivé. Remplacé par un remplissage FLEX (nouveau prop `pleinEcran` sur `Cadre`) qui
   ne devine rien — **vérifié par un harnais Playwright** (page statique, la vraie feuille
   de style) avant de committer : desktop sans défilement de page, mobile redevient un
   flux normal, le mode « agrandir » garde son 82vh et son défilement.
2. **Note « 1 »** — la pastille d'une épingle APPROXIMATIVE affichait un compte
   d'entreprises, pas la note. Corrigé : `note ?? "—"` partout, la distinction reste dans
   le style (petite, grisée, pointillée).
3. **Boutons moches** — ils utilisaient `.bouton`, le style du bouton de CONNEXION (violet
   du gabarit). Passés à `.filtre`/`.filtre--actif`, la convention déjà en place partout
   ailleurs (dont la carte Leaflet, qui portait déjà la règle en commentaire).
4. **Clic pour désélectionner** — `onClick` sur le fond de la carte Google appelle
   `setSelection(null)`. Sans risque avec les clics d'épingle : deux canaux d'événements
   séparés (`click` du fond vs `gmp-click` du marqueur), vérifié dans les typings.

Gate complet vert (81 fichiers, 1386 tests). Rien à vérifier en prod que Marc n'ait pas
déjà signalé — ce sont ses propres retours qui ont guidé ce lot.


## Session 2026-08-21 — accueil regroupé par entreprise (+ où en est la carte Google)

**Trois choses distinctes se sont passées le 2026-08-21**, et elles ne sont pas au même
stade — à ne pas confondre en reprenant la session.

1. **Carte Google (ADR-0016), six lots A/B/C/E/F/G — LIVRÉ sur `main`.** Voir `[CARTE-G]`
   au BACKLOG pour le détail. Reste à Marc : vérifier en prod contre les vraies clés.
2. **Correctifs de retours de test réels sur cette carte — PR `#14`, EN ATTENTE DE MERGE,
   PAS ENCORE SUR `main`.** Sept correctifs (403 Routes traduit en geste console, fond
   sombre, note = moyenne des offres du groupe, tournée retirée, densité en couleurs HEX
   au lieu d'oklch — les objets `google.maps` ne rendent rien avec oklch, en SILENCE —,
   texte sous la carte retiré, plus de défilement). Gate vert, CI verte. ⚠️ Tentative de
   merge bloquée par un rate-limit de l'API GitHub (`update_pull_request` → « API rate
   limit already exceeded ») — pas un problème de code, à retenter.
3. **Accueil regroupé par entreprise — LIVRÉ sur `main`, ce commit-ci.** Demande de Marc :
   « regrouper toutes les offres par entreprise, mettre l'entreprise avec la meilleure note
   en moyenne en premier, permettre de cliquer sur la carte entreprise pour avoir plus
   d'info sur l'entreprise et voir toutes les offres avec notes, possible de cliquer chaque
   offre pour avoir la même carte que les offres actuelles ». Détail au BACKLOG
   `[ACCUEIL-01]`. En bref : `lib/groupesEntreprise.ts` (déjà en place, socle testé)
   regroupe et classe ; nouveau `components/CarteEntreprise.tsx` réutilise `CarteOffre` telle
   quelle pour chaque offre dépliée — même geste « clic agrandit, ça ne navigue pas ».
   `components/ListeOffres.tsx` groupe le résultat FILTRÉ, pas l'inverse : le compte affiché
   reste un compte d'offres (demande du 2026-08-19), le regroupement est un second fait, en
   dessous.

### ⚠️ Le conteneur a RE-REVERTI en cours de session

`main` local est retombé à `[BORNE-02]` (sept commits en retard sur `origin/main`), et
`node_modules` avait de nouveau perdu ses paquets récents (`unpdf`). Aucun travail non
commité n'a été perdu cette fois — la réparation habituelle a suffi : refspec de `main`
manquante (`git config --add remote.origin.fetch …`), `git fetch` + `checkout -B main
FETCH_HEAD`, `npm ci`, vérification du paquet par code de sortie.

### Reste ouvert

- Merger la PR `#14` dès que le rate-limit GitHub se libère.
- La fiche entreprise de l'accueil n'expose PAS les champs Google Places (adresse,
  téléphone, horaires) que porte la fiche de la carte — la demande de Marc lisait « voir
  toutes les offres avec notes » comme le contenu du dépliage. À confirmer si Marc en veut
  plus.


## Session 2026-08-19 — « peut-on supprimer la Routine ? », réponse partielle MESURÉE

**Non.** Et ce n'est pas une prudence, c'est un chiffre.

Ce que la Routine dépose, passé au barème lui-même — 268 offres distinctes sur 9 lots :

| | |
|---|---|
| coordination seule | **54 %** |
| hors sujet | 32 % |
| technicien sans encadrement | 6 % |
| technique seule | 5 % |
| **combinaison (coordination ET technique)** | **4 %** |

Soit **~64 % portant une dimension coordination ou technique**. Titres réels :
« Coordonnateur Fiabilité Maintenance », « Superviseur de production », « Surintendant ».
L'échantillon régional du Guichet, lui : *sod layer*, *car washer*, *hairstylist*,
*kitchen helper*. Et trois employeurs du Guichet cherchés dans le suivi → **0/3**.

### ⚠️ Ce qui manque pour trancher, et que je ne masque pas

1. Mon échantillon Guichet était les **15 premières** retenues, pas un tirage. Le
   raisonnement sur préfixe m'a déjà trompé trois fois aujourd'hui.
2. **On ne peut PAS comparer les deux populations avec ce barème** : son vocabulaire est
   français, les titres du Guichet sont anglais — il rendrait « hors sujet » quel que soit
   le mérite. J'ai failli faire cette comparaison injuste. La comparaison honnête passe par
   la distribution NOC (`[NOC-02]`).

**Conclusion tenable aujourd'hui** : la Routine est productive et reste la seule source
alignée sur le profil. Sa redondance est INCONNUE, pas nulle.

### Toujours bloqué

`diagnostic_flux` n'apparaît toujours pas côté claude.ai après deux reconnexions. Le code est
déployé et le serveur l'expose (test de transport). Il faut **retirer puis rajouter** le
connecteur, pas seulement reconnecter.


## Session 2026-08-19 — le diagnostic devient un outil MCP (je peux le prendre moi-même)

Marc : « fait rouler le diagnostic ». **Je ne pouvais pas**, et c'est mesuré, pas supposé :
`jobbank.gc.ca` rend **403 depuis la passerelle** de session, et
`/api/diagnostic/flux-guichet` rend **401 `non_authentifie`** — le format de la middleware,
donc je n'ai pas de session. C'était la quatrième fois que je demandais à Marc de coller un
JSON.

Livré : l'outil MCP **`diagnostic_flux`**, en lecture seule. Désormais je prends la mesure
moi-même au lieu de la demander.

- ⚠️ **Le `fetch` vers le Guichet reste dans `lib/ingest/`** (garde-fou n°4 : le seul dossier
  autorisé à contacter une source d'offres). L'outil ne fait pas la requête — elle lui est
  INJECTÉE par la route, comme le reste de ses entrées/sorties.
- ⚠️ **Une seule implémentation, deux consommateurs** : `lib/ingest/diagnosticFlux.ts`. Deux
  copies de la liste des champs inventoriés auraient répondu différemment à la même question,
  et le jour où l'une ajoute un champ l'autre mesure autre chose — cinq fois payé sur ce dépôt.
  La route HTTP est devenue mince.
- ⚠️ **Budget adapté au MUR de chaque route** : 120 s en HTTP (mur 300), **40 s en MCP**
  (mur 60). Un budget plus long que le mur ne borne rien : l'appel serait coupé par le dehors
  sans rendre le `fin` qui dit si la lecture était complète.
- L'outil rend par défaut le résumé + **la table des professions avec ses titres** — pas les
  onze inventaires : un rapport qu'on ne peut pas lire en entier ne se lit pas du tout.
  `champ` permet d'en demander un autre. Chaque appel relit le flux, et la description le dit.

Le test de surface a attrapé le nouvel outil au passage — c'est exactement son rôle : la
liste des outils EST le contrat public, un outil ajouté sans décision devient appelable.

### Ce qu'il reste pour `[NOC-02]`

Reconnecter le MCP dans claude.ai (il s'est déconnecté en cours de session) — ou, si c'est
plus rapide, un dernier appel navigateur à `/api/diagnostic/flux-guichet`. Ensuite je prends
la mesure seul.


## Session 2026-08-19 — tri du flux Guichet par code de profession (ADR-0012, cadrage)

Décision de Marc : « go pour le tri par noc2021 ». Ça touche le matching offre↔profil, donc
le **§8** s'applique : ADR d'abord, audit sur du réel ensuite, code en dernier.

**Le choix de conception** : `noc2021` sert de **filtre d'INGESTION**, pas de composante de
note. Aucune offre du suivi actuel ne porte de code NOC (elles viennent d'Indeed ou d'une
saisie manuelle) — un filtre d'ingestion ne peut donc pas modifier une note existante, ce qui
retire tout risque de régression sur les 38 notes vérifiées à la main. Le brancher dans
`computeScore` serait un chantier séparé.

⚠️ **Adaptation assumée du §8, étape 2** : le protocole demande l'audit sur les 38 offres du
seed. Impossible et vide de sens ici — **le seed n'a aucun code NOC**. L'audit porte donc sur
les offres du Guichet, la seule population concernée. On ne saute pas l'étape, on la porte sur
la bonne population.

**Livré** : `lib/nocProfession.ts` (lecture PURE, aucune sémantique devinée — le module ne
sait pas ce qui intéresse Marc), 11 tests, 3 discriminations prouvées. Plus la table de
décision dans le diagnostic : par code, le compte **et des titres réels distincts**, sur les
offres régionales seulement.

**Rien n'est branché sur le pipeline.**

### ⚠️ Ce que je ne sais PAS, et qui décide

- La distribution des codes sur les offres **régionales** — celle que j'ai vue portait sur le
  Canada (223 québécoises sur 2000).
- Que le 2ᵉ chiffre soit bien le niveau de qualification : c'est une lecture de la NORME,
  cohérente avec les données observées, **pas une mesure**. Le tableau code↔titre est ce qui
  la confirmera ou la démentira.

### Ce que Marc a à faire

Un appel à `/api/diagnostic/flux-guichet`. On y lira `inventaireRetenues.noc2021` (les codes
des offres régionales, par fréquence) et `exemplesRetenues` (les titres réels de chacun).
C'est cette table qui décide de la liste — `[NOC-02]`.


## Session 2026-08-19 — le connecteur MCP MARCHE (lot 4/4, chantier clos)

Marc l'a branché dans claude.ai : « ça marche ». Vérifié depuis une session sur les VRAIES
données — `resume_suivi` rend **193 offres suivies, 100 périmées, meilleure note 88** ;
`chercher_offres` à 75+ rend **110 correspondances** avec `tronque: true` honoré. Les quatre
outils répondent.

C'est la seule vérification qui vaut : un déploiement vert ne prouve rien, leçon payée trois
fois ici.

### Ce que le dernier kilomètre a coûté

Deux défauts qu'**aucun test ne pouvait voir**, trouvés en cherchant à faire MARCHER la
chose plutôt qu'à la finir :

1. Un enregistrement légitime rendait **500 sans corps** — les routes OAuth n'appelaient pas
   `assurerMigrations`. La suite tourne sur PGlite, où le harnais applique les migrations
   lui-même : le trou était structurellement invisible en test.
2. Le SDK refuse de réutiliser un transport sans état. La route en crée bien un par requête,
   mais la question ouverte était la bonne : **sans état, le serveur ne se souvient jamais
   d'avoir été initialisé** — `tools/list` devait donc marcher sur un serveur neuf, sinon
   seul le premier échange aurait fonctionné.

### Où en est le reste

Le flux Guichet (`[VEILLE-40]`, `[VEILLE-44]`) attend toujours une décision : **1 300 offres
régionales par passe** contre quelques dizaines suivies, et un échantillon dominé par des
postes peu qualifiés. Le tri est le sujet, pas le volume — et `noc2021` en est le candidat.


## Session 2026-08-19 — MCP lot 3/4 : OAuth 2.1 (le connecteur est prêt côté app)

`lib/mcp/oauth.ts` (logique pure), `lib/oauthStore.ts` (état — **hors de `lib/mcp/`** pour
que le garde de frontière reste absolu), cinq routes, migration `0019_connecteur_mcp`.
`MCP_TOKEN` **retiré dans le même commit**, comme promis au lot 2.

**Le contrôle critique.** `jugerRedirectUri` valide par `new URL()`, hôte EXACT, et rejette
tout `username`/`password`. Les **deux chaînes qui traversaient le `startsWith` de FinanceAI**
sont dans les tests : `http://127.0.0.1.evil.com/cb` (sous-domaine) et
`http://127.0.0.1@evil.com/cb` (userinfo). Réintroduire la version fautive les fait tomber —
vérifié.

**Usage unique et rotation prouvés sur une VRAIE Postgres** (PGlite + le SQL de migration
réellement committé) : deux échanges simultanés du même code, un seul gagne. Le motif naïf
« lire puis écrire » en fait gagner deux — mesuré.

**`/oauth/authorize` reste derrière la garde de session**, et c'est tout le modèle : le
middleware envoie Marc au login Google et le ramène avec les mêmes paramètres. Aucun écran de
connexion à écrire, même compte, mêmes deux étages d'autorisation. L'appartenance est re-vérifiée
**à chaque appel** de `/api/mcp`, pas seulement à l'émission du jeton.

### ⚠️ Deux listes de tables recopiées, toutes deux déjà fausses

En dérivant la liste du script de migration, découvert qu'elle nommait **trois tables sur
onze** : les huit autres étaient créées puis jamais vérifiées après migration — donc une
migration à moitié appliquée serait sortie en SUCCÈS, la panne même que ce script existe pour
empêcher. Et `tests/db.test.ts` annonçait « les huit tables attendues ». Les deux dérivent
maintenant du schéma.

### VÉRIFIÉ EN PRODUCTION (pas seulement en test)

| Vérification | Résultat |
|---|---|
| Découverte OAuth | 200, endpoints à la bonne origine |
| `/api/mcp` sans jeton | 401 + `WWW-Authenticate` vers la métadonnée de ressource |
| `redirect_uri` userinfo (`@evil.com`) | refusé — `userinfo-interdit` |
| `redirect_uri` sous-domaine (`127.0.0.1.evil.com`) | refusé — `http-hors-loopback` |
| Enregistrement légitime | **201** |
| `/oauth/authorize` sans session | 307 vers le login, **tous les paramètres préservés** |
| `/oauth/token`, code bidon | 400 `invalid_grant` |

⚠️ **Le premier passage réel a trouvé un défaut que les tests ne pouvaient pas voir** : un
enregistrement légitime rendait **500 sans corps**, parce que les trois tables n'existaient
pas encore. L'app se migre elle-même depuis juillet, mais seulement là où on le lui demande —
`lib/donnees.ts` et `lib/cv/depot.ts` le font, les routes OAuth non. Corrigé (les huit
fonctions du store passent par `prete()`), et les trois routes qui touchent la base NOMMENT
désormais la panne au lieu d'un 500 muet.

### Ce que Marc a à faire (lot 4)

1. **Rien à configurer.** Aucun nouveau secret ; l'appartenance se juge sur
   `AUTHORIZED_EMAIL`, déjà en place. La migration s'applique toute seule (vérifié).
2. Dans claude.ai → Connecteurs → connecteur personnalisé, URL
   `https://emploi.hubperso.com/api/mcp`. Il proposera une connexion Google.
3. ⚠️ **Un déploiement vert ne prouve rien** — leçon payée trois fois ici. Le seul signal
   valable est une conversation réelle : demande-lui « résume mon suivi JobAI », puis une
   écriture (« passe l'offre X en CV envoyé ») pour voir l'avant/après.

*(Une ligne `oauth_clients` nommée « sonde-claude-code » vient de mes vérifications. Elle ne
donne aucun accès — un client enregistré sans autorisation de Marc est une ligne inerte.)*


## Session 2026-08-19 — MCP lot 2/4 : le serveur et sa route (+ un bug de fuseau trouvé au passage)

`lib/mcp/serveur.ts` (SEUL fichier autorisé à importer le SDK — mesuré : il tire `express`,
`cors`, `hono`, `jose`, `ajv`) et `app/api/mcp/route.ts` (transport Web-standard du SDK, sans
état, réponses JSON — un flux SSE sur une fonction serverless est facturé jusqu'à son mur de
temps). Quatre outils : `chercher_offres`, `lire_offre`, `resume_suivi`, `modifier_suivi`.

**13 tests par un VRAI client MCP**, pas en appelant les handlers : appeler un handler
contourne la validation du SDK, donc n'éprouve pas ce que claude.ai verra. Trois
discriminations prouvées (base muette rendue en liste vide, écriture quand rien ne change,
écriture annoncée en lecture seule).

⚠️ **Garde provisoire** : `MCP_TOKEN` (bearer, temps constant, échec fermé 503/401). claude.ai
n'accepte QUE OAuth — ce jeton rend le connecteur testable dès maintenant, et **il se retire
dans le même commit que l'arrivée d'OAuth** (lot 3), sinon c'est un second chemin d'entrée sur
la même surface d'écriture. À poser dans les variables Vercel pour essayer.

### ⚠️ Deux dates écrites en UTC, trouvées en écrivant le lot

`modifierOffre` posait la date d'envoi avec `new Date().toISOString()`. **Mesuré** : un CV
marqué envoyé à 20 h 30 le 19 août était enregistré au **20 août** (Vercel tourne en UTC, Marc
vit à UTC−4). La règle est dans le CLAUDE.md depuis longtemps ; deux chemins d'écriture y
échappaient — le second (`lib/cv/actions.ts`) n'a été trouvé qu'en grepant après avoir corrigé
le premier. Les deux passent maintenant par `aujourdhui()` de `lib/ajout.ts`.

Une règle qui ne vit que dans un document se reperd : `tests/datesEcrites.test.ts` la scanne
désormais, en DISCRIMINANT l'horloge fraîche (`new Date()`, interdite) d'une date déjà donnée
par une source (`new Date(t)`, légitime). Régression prouvée.

### ⚠️ Un test qui mentait sur son mécanisme

« REJETTE un champ hors du domaine de Marc » passait — mais Zod **strippe** les clés inconnues
au lieu de lever : `{score: 100}` devient `{}`, donc le refus observé était « patch vide ».
Refait sur le cas qui compte : une demande MIXTE (`{priorite, score}`) où la priorité bouge et
le score ne bouge pas.

### Reste

Lot 3 : OAuth 2.1. Lot 4 : conversation RÉELLE depuis claude.ai.


## Session 2026-08-19 — un connecteur MCP pour claude.ai (ADR-0011, lot 1/4)

Demande de Marc : « ensuite je veux un mcp ». Deux décisions lui ont été posées avant tout
code, parce qu'elles changent l'ampleur d'un ordre de grandeur. Ses réponses : **claude.ai
tout de suite** (donc OAuth 2.1 — mesuré : leurs connecteurs n'acceptent rien d'autre) et
**écriture large**.

L'écriture **amende le garde-fou n°2** (« le suivi appartient à Marc. Exception : aucune »).
C'est consigné dans `docs/adr/0011-connecteur-mcp-claude-ai.md`, avec les quatre conditions
qui bornent l'exception : elle ne couvre que ce que Marc demande, tout passe par
`lib/suivi.ts`, l'avant/après remplace l'écran, et le moteur garde ses calculs.

### ⚠️ Ce que la relecture de `promptSafety.ts` a trouvé, et qui compte plus que le lot

Son en-tête dit ce qui protégeait vraiment l'app contre l'injection indirecte — et **ce
n'était pas l'assainissement** : « le modèle ne fait que PROPOSER » et « aucun outil n'est
exposé au modèle : il ne peut rien écrire ». **Un connecteur qui écrit casse les deux.**
`sanitizePromptText` ne comble pas l'écart : il neutralise ce qui fait FRONTIÈRE, jamais ce
qui fait sens, donc une consigne en langage naturel dans un nom d'employeur (venu du flux du
Guichet) traverse intacte, par conception.

Ce qui borne le dégât est désormais la SURFACE : quatre champs, jamais une offre périmée,
jamais les calculs du moteur, aucune suppression, aucun outil sortant, et un avant/après
rendu à chaque écriture. Pire cas : un statut faux, visible et réversible. Risque assumé par
la décision de Marc, pas ignoré — et l'en-tête de `promptSafety.ts` le dit maintenant, parce
qu'une doc qui affirme une chose fausse est pire qu'une doc absente.

### Livré (lot 1/4)

`lib/mcp/vue.ts` (la forme publiée, composée CHAMP PAR CHAMP — un champ ajouté au modèle
interne n'est pas publié par accident), `lecture.spec.ts` (recherche, offre, résumé),
`ecriture.spec.ts` (modification via `appliquerModification`, avant/après). 32 tests,
`tests/mcpSurface.test.ts` verrouille la frontière : aucun `.spec.ts` n'importe le SDK MCP ni
la base, aucune coordonnée n'est publiée. Trois discriminations prouvées.

### Reste à faire

Lot 2 : le serveur MCP + le transport HTTP. Lot 3 : OAuth 2.1 (découverte, enregistrement
dynamique, PKCE S256, rotation) — ⚠️ le `redirect_uri` se valide par origine EXACTE via
`new URL()`, jamais `startsWith` : c'est le finding CRITIQUE de FinanceAI. Lot 4 : branchement
vérifié par une conversation RÉELLE depuis claude.ai, jamais par un déploiement vert.


## Session 2026-08-19 (soir, 4e passe) — l'inventaire mesurait la mauvaise population

L'inventaire de valeurs a rendu ses chiffres, et ils ont révélé un défaut **dans le
diagnostic lui-même** : `state` disait BC 561, ON 480, AB 393, **QC 223**. L'inventaire
portait sur les 2000 PREMIÈRES offres du flux — le Canada entier — pas sur les 1306 offres
régionales. Donc « English 1726 » était le chiffre du Canada, et les codes postaux dominants
venaient de Surrey et Calgary. **Troisième fois** que je conclus depuis un préfixe non
représentatif (20 offres pour le recensement, 42 % du flux pour le plafond, le Canada ici).

Corrigé : **deux inventaires nommés par leur population** — `inventaireVues` (décrit le
FORMAT) et `inventaireRetenues` (décrit ce qu'on ingérerait, et c'est lui qui décide). Plus
`brutsRetenus` : les blocs XML des 15 premières offres retenues, pour apparier un code de
profession à son titre au lieu de le supposer. Discrimination prouvée.

### Ce qui tient malgré la mauvaise population (ça ne dépend pas d'elle)

- **`noc2021` est un vrai code à cinq chiffres** (63200, 62020, 44100, 73300…), 257 valeurs
  distinctes. C'est le filtre indépendant de la langue qu'on cherchait.
- **`education` (11 valeurs), `experience` (9), `jobtype` (3), `workterm` (4),
  `worklanguage` (4) sont des ÉNUMÉRATIONS propres** — directement exploitables, zéro
  traitement de langue.
- **`salary` est structuré** : « $37.00 hourly », « $4,337.00 to $6,413.00 monthly (to be
  negotiated) ». Analysable par motif.

### ⚠️ Le gabarit des descriptions a CHANGÉ entre deux appels

Les libellés sont passés du français à l'anglais (« Durée de l'emploi » → « Work Term ») et
CHAQUE description a raccourci de 44 à 49 caractères. `vues` est passé de 41 062 à 41 195 :
le flux est reconstruit souvent, et **le texte de ses descriptions n'est pas stable**.
Argument de plus pour lire les champs DÉDIÉS (qui sont des énumérations) plutôt que d'extraire
des faits du texte.

### Ce que Marc a à faire

Un dernier appel à `/api/diagnostic/flux-guichet`. Le rapport porte maintenant
`inventaireRetenues` (la bonne population) et `professions` (code ↔ titre appariés). C'est
ça qui décide du critère de tri, et donc si la source vaut d'être branchée.


## Session 2026-08-19 (soir, 3e passe) — la passe COMPLÈTE du flux Guichet

`fin: "flux-termine"` — la première mesure qui autorise à conclure.

| | |
|---|---|
| Offres dans le flux | 41 062 |
| Lues | 128,5 Mo en 4,7 s (~27 Mo/s) |
| Québécoises | 6 631 |
| — **dans la région** | **1 300** |
| — hors région | 1 965 |
| — lieu inconnu | 3 366 (50,8 %) |
| Illisibles | **0** |

**L'analyseur est confirmé** : `champsRenseignes` colle exactement à `balisesVues`. Et le
mystère du passage précédent est résolu — `city`, `state` et `postalcode` sont au même
compte EXACT (1972/2000) : ils sont émis ensemble ou omis ensemble, et il manquait les trois
aux vingt premières offres du flux.

**Onze champs présents sur 100 % des offres, inutilisés.** Trois pourraient tout changer :
`noc2021` (code de profession normalisé — classerait une offre SANS mots-clés, donc sans le
problème bilingue de [VEILLE-32]/[VEILLE-34]), `postalcode` (lieu exact, la région de tri
sépare Montréal de Québec sans une seule requête Nominatim ni piège d'homonyme), et
`salary`/`education`/`experience` (ce que le barème compte aujourd'hui comme « inconnu »).

⚠️ **Aucune de leurs VALEURS n'a été vue.** Savoir qu'une balise existe ne dit pas ce
qu'elle porte. Livré donc un **inventaire de valeurs** (`Inventaire` dans `guichetFlux.ts`,
borné à 400 classes par champ, `(autres)` dit) : la route compte les valeurs par classe
avant qu'on s'en serve.

⚠️ **Piège mesuré sur [VEILLE-42]** : ajouter `saint-laurent` à `HORS_PORTEE` pour écarter
l'arrondissement montréalais exclurait aussi **Saint-Laurent-de-l'Île-d'Orléans**, qui est
dans la région (comparaison par sous-chaîne, `HORS_PORTEE` consulté en premier). C'est
[VEILLE-33] qui se rappelle à nous. Le code postal ne connaît pas d'homonyme.

### La vraie question, et elle est pour Marc

**1 300 offres régionales** contre quelques dizaines suivies aujourd'hui. Brancher la source
telle quelle noierait le tableau : l'échantillon reste dominé par *sod layer*, *car washer*,
*hairstylist*, *labourer*. Le volume n'est pas le sujet — le TRI l'est.

### Ce que Marc a à faire

Rappeler `/api/diagnostic/flux-guichet` une dernière fois. Le rapport porte maintenant
`inventaire` : les valeurs de `noc2021`, `postalcode`, `salary`, `education`, `experience`,
`jobtype`, `workterm`. C'est ça qui décide comment trier — et donc si la source vaut d'être
branchée.


## Session 2026-08-19 (soir, suite) — le premier passage RÉEL du flux Guichet

Marc a appelé `/api/diagnostic/flux-guichet`. La mesure a validé la lecture en flux et
trouvé **trois défauts dans mon code**, dont deux qui perdaient des données en silence.

**Ce qui tient** : `illisibles: 0` sur plus de dix-huit mille offres — l'analyseur lit tout.
Environ 56 Mo en 2,3 s sans jamais charger le flux (~25 Mo/s : le lire entier coûte quelques
secondes). Flux frais, et gros.

**Défaut n°1 — mon recensement ne concluait rien.** Il rendait un ENSEMBLE de noms sur vingt
offres. `city` et `state` n'y étaient pas, et j'ai failli conclure que le format n'a pas de
ville — il en a une. Un ensemble sur un petit échantillon ne distingue pas « champ absent du
format » de « champ absent de ces offres-là ». Refait en COMPTES sur deux mille offres, plus
une mesure jumelle (`champsRenseignes`) qui compte ce que l'analyseur en tire : les deux se
vérifient l'une l'autre.

**Défaut n°2 — `&apos;` non décodée, et elle perdait des villes de la RÉGION.** Le flux écrit
`Val-d&apos;Or`. Mesuré : `L&apos;Islet` et `Saint-Pierre-de-l&apos;Ile-d&apos;Orleans`
tombaient en « lieu inconnu » ; `L&apos;Ancienne-Lorette` ne passait que par accident.
Corrigé dans `texteSimple` (`&apos;` + entités numériques, `&amp;` en dernier).

**Défaut n°3 — le plafond mordait à ~42 % du flux**, donc aucun compte n'était une mesure.
Relevé de 500 à 5000.

### Les deux constats qui comptent le plus, et qui ne sont pas des bugs

1. **Le flux est très majoritairement peu qualifié** : *sod layer*, *car washer*,
   *hairstylist*, *labourer*. Le volume est là ; la valeur pour le profil de Marc reste à
   démontrer.
2. **Les titres sont en ANGLAIS**, les descriptions bilingues. C'est exactement
   `[VEILLE-32]` / `[VEILLE-34]` — brancher cette source avant de les corriger noterait
   tout à zéro.

### Ce que Marc a à faire

Rappeler **une fois** `/api/diagnostic/flux-guichet` avec les correctifs en ligne. Cette
fois on attend `fin: "flux-termine"` — la seule fin qui autorise à conclure. On y lira le
vrai total d'offres régionales, `champsRenseignes` (city/state confirmés ou non), et la
liste complète des villes inconnues. Rien n'est branché sur la passe d'ici là.


## Session 2026-08-19 (soir) — l'ingestion du flux Guichet, en streaming

Demande de Marc : « vas-y pour l'ingestion du flux Guichet en streaming ». Livré :
`lib/ingest/guichetFlux.ts` (lecture par morceaux, aucune accumulation), ses 29 tests, et
`app/api/diagnostic/flux-guichet` pour MESURER le flux réel avant de le brancher.

**La contrainte** : le flux pèse ~134 Mo. Le module lit par morceaux, découpe dès qu'une
offre est complète, la juge, la jette si elle est hors région — le pic mémoire dépend de la
taille d'UNE offre, jamais du flux. Quatre fins distinctes (`flux-termine`, `budget-depasse`,
`plafond-retenues`, `tampon-deborde`) : une lecture partielle ne peut pas se lire comme une
lecture complète, et un tampon qui déborde est une PANNE, jamais un vide.

**Discrimination prouvée** en cassant le code quatre fois : sans l'annulation du flux, avec
un découpage naïf, sans la borne de tampon, sans `stream: true` au décodage — chaque test
visé tombe, puis remis en état. Le test d'annulation ne discriminait rien au premier jet
(mon flux d'épreuve se fermait tout seul, et `cancel()` sur un flux clos ne rappelle jamais
la source) : refait sur un flux qui coule encore, le cas réel.

⚠️ **Le format des champs est une HYPOTHÈSE, pas une lecture.** L'échantillon dont il vient
était tronqué par le plafond de la sonde, et la passerelle de session refuse `jobbank.gc.ca`.
D'où `recenserBalises`, qui rapporte les noms RÉELLEMENT rencontrés, et la route de
diagnostic qui les remonte.

### Ce que Marc a à faire

Appeler **une fois** `/api/diagnostic/flux-guichet` (connecté) et me donner la réponse. Ce
qu'on y cherche, dans l'ordre : `balisesVues` (est-ce que `title`/`city`/`url`/`company`
existent vraiment ?), `verdicts` et `villesInconnues` (le registre sait-il placer ce que le
Guichet nomme ?), puis l'échantillon. Tant que ce n'est pas lu, **le flux n'est branché sur
aucune passe** — le dépôt de fichiers reste la seule source active.

Détail complet : `docs/adr/0010-sources-lues-par-lapp.md`, section « second lot ».


## Veille du 2026-08-19 — et une PII de tiers trouvée EN LIGNE

Lot du jour déposé par FICHIER (`data/depot/2026-08-19.json`, 51 offres). Indeed seul :
ZipRecruiter n'exposait aucun outil au moment du balayage — un ÉTAT du jour, pas un fait
durable (le protocole dit de le mesurer à l'instant de s'en servir, et c'est ce qui a été fait).

⚠️ **Le fait marquant n'est pas le lot, c'est ce qu'il a révélé.** Une annonce ELEM rédigée en
ANGLAIS portait le nom d'une personne tierce derrière une civilité anglaise (« Ms. … »).
`expurgerPII` n'avait AUCUN motif de civilité ; `piiGuard` n'en connaissait que les formes
FRANÇAISES. Le nom a donc traversé l'outil ET la garde — et il était **déjà dans
`data/depot/2026-08-18.json`**, dans un dépôt public, depuis la veille.

Fermé dans le même lot : motif « personne nommée » (FR + EN) dans `expurger.ts`, même motif
ajouté au scan des dépôts ET à la vérification générale de `piiGuard`, sept cas de
discrimination (dont « MS Office » et « M. Sc. » qui ne doivent PAS mordre), et **rattrapage
sur les huit dépôts existants**. Vérifié : plus aucune trace dans `data/`.

⚠️ **Ce qui n'est PAS réglé, et que seul Marc peut trancher** : le nom reste dans
l'HISTORIQUE git (commit du 18 août), donc dans les forks et miroirs éventuels. Un commit
correctif ne l'en retire pas.


## Session 2026-08-18 — le rapport de veille, et le rayon réglable

### [VEILLE-35] la découverte de pages carrières, retirée

Demande de Marc : « supprime le truc de recherche page carrière ça marche pas ». Elle ne
marchait effectivement pas — un `200` de SmartRecruiters ne prouve rien sans offres réelles
(témoin négatif déjà mesuré), et les identifiants devinés trouvaient des homonymes
d'Amsterdam. Retirée entièrement : la source, son bouton, ses écritures d'état. Le nettoyage
a fait tomber cinq imports orphelins, chacun attrapé par ESLint — c'est ce que vaut un lint
bloquant.

### [VEILLE-36] un rapport qui ne peut plus se contredire

Le 17 août l'écran affichait « 100 trouvées · 0 nouvelle · 26 déjà connues » : **74 offres
disparaissaient sans motif**. Le tri travaillait très bien ; c'est le compte rendu qui mentait
par omission, et il existait en DEUX copies incomplètes (le bouton assemblait la sienne, la
page une autre). `lib/rapportVeille.ts` en fait une fonction PURE, `components/RapportVeille.tsx`
un rendu unique servi aux deux endroits — automatique comme manuel, la demande de Marc.
Le champ `sansMotif` **expose le reliquat** (`trouvees − (nouvelles + Σ refus)`) au lieu de
laisser le lecteur faire la soustraction. Les notes moyennes EXCLUENT une note absente au lieu
de la compter zéro (sinon la moyenne décrit la complétude de la saisie, pas la qualité des
offres) et rendent `null` quand aucune n'est connue — jamais un 0 qui aurait l'air mesuré.
Les villes ne sont nommées que sous les deux motifs qui se décident sur le lieu.

### [VEILLE-37] le rayon, réglable depuis l'app

Demande de Marc : « permet moi de faire une recherche et de régler le kilométrage alentour ».
C'était son critère n°1 et la seule valeur qu'il ne pouvait pas toucher sans un commit.

⚠️ **Ce qui comptait n'était pas le réglage, c'est ce qu'il PÉRIME.** Le registre des lieux
est consulté AVANT toute nouvelle mesure : un verdict rendu sous l'ancien rayon et laissé en
place n'aurait jamais été revu — Marc aurait élargi son rayon et rien n'aurait changé, sans
qu'aucune erreur ne s'affiche. `rejugerRegistre` re-dérive tous les verdicts, **sans une seule
requête**, parce que le registre stocke la distance mesurée et pas seulement le verdict.
Les `introuvable` restent intacts (leur problème n'est pas la distance) ; `le` et `essais`
sont conservés (re-juger n'est pas re-mesurer) ; le nombre de bascules est rapporté côté
taille du registre, parce que « 0 sur 0 » et « 0 sur 40 » disent le contraire l'un de l'autre.
Le rayon atteint aussi la NOTE, pas seulement l'acceptation. Bornes 5–300 km, une saisie hors
bornes est dite et jamais rognée en silence.

Gate vert au commit : typecheck · 1002 tests · lint · build.

### [VEILLE-38] la fraîcheur du dépôt — un silence mesuré, puis fermé

⚠️ **Trouvé en mesurant, pas en lisant** : la veille n'a plus qu'**UNE seule source**, le
dépôt de fichiers. `RECHERCHES_GUICHET` est vide (404 prouvé) et les pages carrières sont
parties avec [VEILLE-35]. `selectionnerSources` rend `depot-fichier` et rien d'autre, quel
que soit le jour — vérifié par sonde.

Conséquence que rien ne montrait : le dépôt lit une **fenêtre de sept jours**. Un jour sans
lot déposé, il rend quand même ceux de la veille, tout passe en « déjà connue », et le rapport
affiche « 0 nouvelle » — exactement ce qu'il afficherait un jour sans embauche. Ce projet a
déjà payé ce silence (cron muet trois jours, péremption en série, tous les voyants au vert).
Le rapport porte désormais `depot: { dernierJour, retardJours }`, dérivé de ce que la source
a RÉELLEMENT lu, et l'écran le dit AVANT les chiffres qu'il disqualifie.

Prouvé contre le vrai dossier : 18 août `retard=0` (muet) · 19 août `retard=1` · 21 août
`retard=3` (« rompu ») · 30 août fenêtre vide (`retard=null`). Les quatre rendaient le même
écran auparavant. Seuil d'alerte à DEUX jours : crier au premier matin manqué apprendrait à
ignorer le voyant.

### Sur « quasi-forcément une localisation » — mesuré, largement atteint

Sonde sur les **309 offres des huit lots réels** : 298 « dans la région », 4 « hors région »,
**7 seulement « lieu inconnu »** — et ces sept sont légitimes (5 × « canada », 1 champ vide,
1 « dorval »). Les 47 du 17 août ne venaient pas du dépôt mais de `smartrecruiters:dexterra`,
source retirée depuis. Sur le canal qui alimente réellement la veille, la localisation est
donc trouvée dans **97,7 %** des cas. Il reste [VEILLE-33] (comparaison par sous-chaîne)
comme défaut de JUSTESSE, pas de couverture.

### ⚠️ Ce que « full auto » peut et ne peut pas vouloir dire ici

Le bouton et le cron **ne vont chercher aucune offre sur Internet** : ils relisent le dépôt,
trient, notent, périment. Les offres nouvelles arrivent par la Routine quotidienne, qui tire
dans une session Claude où vivent les connecteurs Indeed et ZipRecruiter. Du point de vue de
Marc c'est bien automatique — il ne fait rien — mais la chaîne passe par une session, pas par
l'app, et aucune ligne de code de l'app ne peut la remplacer : ces deux services n'ont pas
d'API publique et le moissonnage est interdit (garde-fou n°4). [VEILLE-38] est la conséquence
directe : puisque la seule source vivante est hors de l'app, son silence devait devenir visible.


### Ce qui reste ouvert

- **[VEILLE-32] + [VEILLE-34]** — deux défauts MESURÉS du barème (vocabulaire de notation
  monolingue alors que le bassin de termes est bilingue : 6 offres récupérées ; accents non
  normalisés : 4 offres). Non corrigés **délibérément** — §8 impose un ADR puis l'audit sur
  les 38 offres du seed AVANT toute ligne, et les deux touchent la même fonction : un seul ADR.
- **[VEILLE-33]** — `situer()` compare par sous-chaîne, donc « Quebec Province » passe.
- **« qu'on trouve quasi-forcément une localisation »** — [VEILLE-31] a posé la mesure,
  [VEILLE-33] et l'élargissement des replis de géocodage restent à faire.

---

## Session 2026-08-17 (fin) — les 47 « lieu inconnu » : nommés, puis mesurés

Compte rendu de Marc : `261 trouvée(s) · 1 nouvelle · 170 déjà connue(s) · 16 sous le
plancher · 27 hors région · 47 lieu inconnu`. La somme est exacte (1+170+16+27+47 = 261) :
le tri n'a pas de fuite. Le problème est ailleurs — **47 offres jetées parce que `situer()`
ne reconnaissait pas leur ville**, sans que rien ne dise lesquelles.

### Ce qui n'allait pas — la mécanique, pas le symptôme

`situer()` tranchait par une **liste blanche** de ~130 municipalités, écrite pour un rayon de
50 km, rallongée à la main quand le rayon est passé à 75. Un nom qui n'y figure pas est
refusé, qu'il soit à 20 km ou à 3 000. C'est un pari, et il était invérifiable : `refusees`
portait le motif et l'objet (entreprise, titre) mais **pas la ville** — le seul champ sur
lequel les deux motifs géographiques se décident.

### Livré, en deux temps

- **[VEILLE-30] nommer.** `Tri.refusees` porte la `ville`. `villesRefusees` (PURE) la
  regroupe et la trie par fréquence : une ligne remplace quarante-sept. Nommées dans la trace
  serveur, dans le compte rendu du bouton, et dans la réponse du point de dépôt.
- **[VEILLE-31] mesurer.** La question « cette ville est-elle à moins de 75 km ? » a une
  réponse mesurable, et le géocodeur qui la donne était déjà là. `lib/ingest/lieux.ts` tient
  un registre `nom normalisé → verdict`, alimenté par `geocoderMunicipalites` (nouvelle
  question dans `lib/geocodage.ts` : sans suffixe de province, **sans les bornes régionales** —
  savoir que Toronto est loin est l'information, pas un rejet) et par la distance réelle au
  domicile. `situer()` le consulte APRÈS les deux listes ; celles-ci gardent la priorité et ne
  coûtent aucune requête.

Bornes : 6 noms par passe (sous le cap interne de 8 — verrouillé par test), budget 12 s,
mesure AVANT le tri pour que le verdict serve au lot du jour, `try/catch` pour qu'une panne
du géocodeur ne coûte jamais l'intake. La dépense **s'éteint** : les sources répètent les
mêmes villes, un nom mesuré ne se redemande jamais. Un `introuvable` est retenté à des
paliers qui s'espacent (`[3, 14, 60]` jours) — jamais condamné à vie.

### Un quasi-incident de sécurité, trouvé par le build

`mesurerLieuxInconnus` a d'abord été écrite dans `lib/actions.ts`. Le build a refusé
(`Only async functions are allowed to be exported in a "use server" file` — sur la constante
de budget). En cherchant à réutiliser `domicile()`, j'allais l'exporter du même fichier : dans
un fichier `"use server"`, **toute fonction async exportée devient un point d'entrée HTTP
anonyme**. Les coordonnées du domicile de Marc seraient devenues récupérables par un POST.
Elles n'étaient protégées que par l'absence d'un mot-clé, et aucun test n'aurait bronché.
`domicile()` vit désormais dans `lib/domicile.ts`, un module ordinaire où aucun `export` ne
peut faire ça ; `mesurerLieuxInconnus` dans `lib/mesureLieux.ts`, même raison.

### À vérifier en production

- Le registre `veille-lieux` se remplit : chercher `[lieux] demandés=… jugés=…` dans les
  journaux, et la ligne `[veille] lieux refusés — inconnus : …` qui nomme ce qui reste.
- **Le compte de « lieu inconnu » doit BAISSER passe après passe**, et une partie doit
  basculer en « hors région » (on sait, et c'est trop loin) plutôt que rester inconnue.
  C'est le signal de convergence : s'il stagne, c'est que les noms ne sont pas géocodables
  et il faudra regarder ce que les sources écrivent vraiment dans ce champ.
- Les 16 « sous le plancher » restent **non nommées à l'écran** (elles le sont dans
  `refusees`) — proposé à Marc, sans réponse pour l'instant.

---

## Session 2026-08-17 (suite) — « sources=1 » expliqué, et la recherche mise entre les mains de Marc

### Pourquoi `sources=1` — c'était un compte exact, pas une panne

`rapport.sources.length` compte les sources INTERROGÉES. Trois familles, deux vides :

1. **Guichet-Emplois — zéro, par décision.** `RECHERCHES_GUICHET = []` : le flux RSS répond
   404 sur toutes les adresses testées, désactivé avec la preuve à côté.
2. **Pages carrières — zéro, faute de producteur.** `veille-ats` était vide depuis le premier
   jour : les analyseurs, `sourceAts` et `jetonProbable` existaient tous, mais rien n'écrivait
   la liste. C'est `[ATS-04]` qui l'a branché.
3. **Dépôt de la Routine — un.** Le seul canal vivant.

⚠️ **Correction d'un diagnostic donné plus tôt dans la session** : l'absence de ligne `[ats]`
au cron de 15:00 n'avait rien à voir avec la réservation. La passe tournait sur `658f603`
([ATS-03]), soit **un commit avant** [ATS-04], déployé 38 min plus tard.

### Ce qui n'a PAS pu être mesuré, et pourquoi

Le rendement réel de la découverte reste **inconnu**. Une tentative de mesure d'ici (180
essais sur les 36 cibles) a rendu 180 « absent » — chiffre **nul et non avenu** : les cinq
hôtes ATS répondent 403 par le proxy de la session, et `verifierAts` traduit un `fetch` qui
lève en `absent`. La mesure ne portait que sur le blocage local. La production n'a pas ce
proxy. Ne pas re-conclure de ce 0/180.

### Livré

- **[ATS-05]** — un nom présent dans les cibles ET dans les offres était planifié DEUX FOIS
  dans la même passe (mesuré : 10 essais pour 5 paires). Dédoublonnage dans
  `planifierDecouverte`, pour tous ses appelants.
- **[BORNE-04]** — la trace ne dit plus « (Google non configuré) » quand il n'y avait
  simplement rien à raffiner.
- **[ATS-06] délai de retente escaladant** (décision Marc). `verifierAts` rend `refute` sur
  une seule constatation qui recouvre deux situations : un homonyme (`recruitee/ace` →
  Amsterdam) et un **board mondial légitime** sans poste régional ce jour-là (`alstom`,
  `honeywell`, `domtar`, `labatt`, `dexterra`). Un délai fixe de 60 jours, calibré sur la
  première seule, mettait deux mois à l'étagère les plus gros employeurs de la liste.
  Paliers `[7, 21, 60]` selon le nombre de réfutations CONSÉCUTIVES ; le compteur se remet à
  zéro dès qu'un autre verdict rompt la série.
- **[ATS-07] écran `/sources`** (demande Marc). Il répond à « d'où viennent mes offres »
  depuis l'app, et porte le bouton qui lance la recherche de pages carrières : barre de
  progression, arrêt immédiat, journal de ce qui a été trouvé et écarté avec son motif.
  Douze lots suffisent à couvrir les 36 cibles — au lieu de quinze jours d'attente.

### État vérifié en production (2026-08-17, ~17:20 UTC)

- Déploiement `c093fc5` READY ; les deux crons répondent au format de la ROUTE
  (`{"ok":false,"erreur":"non autorisé"}`), donc le code est bien atteint.
- [BORNE-03] **confirmé** : `[bornes] 67 borne(s) dans la boîte · 2 lieu(x) mesuré(s)` à
  15:52, contre trois instances perdues par timeout à 15:00 sur l'ancien déploiement.
  Réserve : `marque=0/2 vitesse=0/2 tarif=0/2` — OSM ne renseigne aucun de ces trois champs
  pour ces deux employeurs. À surveiller quand le lot grossira.
- Réservation de veille libre le **18/08 à 11:00 UTC** ; première ligne `[ats]` attendue au
  cron de 15:00 UTC — sauf si Marc lance le balayage depuis `/sources` avant.

---

## Session 2026-08-14 (suite) — la veille ne tournait plus depuis trois jours

### Ce qui a été constaté, pas supposé

La Routine de veille du jour n'a pas pu chercher : **le connecteur Indeed s'est déconnecté**
en cours de session (outils absents, confirmé deux fois ; `ListConnectors` le donne pourtant
installé et activé — c'est son serveur MCP qui a lâché). Zéro offre trouvée, rien inventé.

En vérifiant si l'app avait au moins reçu des offres par son propre canal, j'ai trouvé bien
pire : **`/api/cron/veille` n'apparaît dans AUCUN journal Vercel les 12, 13 et 14 août**,
pendant que `/api/cron/geocodage` y figure chaque nuit avec son compte rendu complet
(vérifié : 03:00:29 UTC le 14, HTTP 200, journal détaillé). Les deux crons sont déclarés
côte à côte dans le même `vercel.json`, les deux routes sont structurellement identiques.

Trois jours sans veille. Rien ne le disait : les offres cessent de se rafraîchir, l'app
affiche les anciennes, la péremption les éteint une par une.

### Ce qui est corrigé

Le vrai défaut n'est pas le cron : c'est qu'une action quotidienne dépendait d'un
**déclencheur unique dont le silence est invisible**. Le géocodage et la mesure de distances
avaient chacun leur réservation ; l'ingestion, elle, n'en avait aucune.

- `lib/veilleComplete.ts` — la passe entière, appelable par n'importe quel déclencheur.
  Déplacement **VERBATIM** depuis la route, prouvé sur le COMPTE de chaque écriture et sur
  leur ORDRE (la garantie « les offres d'abord, le journal ensuite » tient à cet ordre).
- `CLE_VEILLE` / `DELAI_VEILLE_MS` (20 h) — bornes **dérivées** de l'écart de 12 h entre les
  deux crons : > 12 h sinon double passe, < 24 h sinon jour sauté. Discrimination prouvée
  dans les deux sens.
- Le cron de géocodage — celui dont on a la preuve qu'il tourne — reprend la passe quand elle
  est en retard, et rend la main après (un seul travail par invocation, comme avant).

Quand le cron de veille reviendra, il reprendra naturellement la main : c'est la réservation
qui arbitre, pas l'ordre des déclencheurs.

### Mise en ligne — elle a demandé un second push

`a30409d` (CI #178 verte) n'a produit **aucun déploiement Vercel** : pas un build raté, pas un
vieux SHA rejoué — zéro entrée, quarante minutes durant, alors que les deux déploiements
précédents étaient apparus en trois secondes. Troisième occurrence du webhook GitHub non
livré (07-31, 08-12, 08-14).

Deux fausses pistes écartées avant d'agir : un « Redeploy » du tableau de bord aurait rejoué
`150e54b`, dont l'arbre est ANTÉRIEUR au correctif ; et un commit de docs poussé ensuite aurait
été IGNORÉ par `build-necessaire.sh` (il ne compare que `HEAD^..HEAD`), laissant le correctif
hors ligne sans qu'aucun voyant ne change.

Remède appliqué : **commit vide** `ce682c7` — aucun fichier touché, donc aucun risque sur le
code, et un diff vide sort en `exit 1` (« aucun fichier lisible ») ⇒ build LANCÉ, vérifié par
sonde avant le push. Déploiement créé **2 s** après, `READY` en 46 s,
`dpl_8MJ8FwFMyoSYTYM1CbUZdA1NL71v`, alias `emploi.hubperso.com`. Production vivante (401 propre
du endpoint hub). Le premier passage utile est celui du cron de géocodage, à 03:00 UTC.

⚠️ Le conteneur a reverti l'arbre **une seconde fois** pendant l'opération, au même point
(`[BORNE-02]`) : le premier commit vide s'était posé sur la base périmée et a été JETÉ, pas
rejoué. Le tell : `scripts/build-necessaire.sh: No such file or directory` sur un fichier lu
quinze minutes plus tôt.

### Ce qui reste à faire

- **`[VEILLE-11]`, côté Marc** : voir dans Vercel POURQUOI le cron ne part plus (Settings →
  Cron Jobs, ou `vercel crons ls`). Illisible depuis une session Claude — pas de jeton, et le
  MCP Vercel n'expose pas les crons. Le filet rend la panne inoffensive, il ne la corrige pas
  à la source.
- **`[VEILLE-12]`** : publier la fraîcheur de la dernière passe dans le résumé hub (alerte
  au-delà de 36 h). C'est ce qui manquait le plus — trois jours ont passé faute d'un écran
  qui dise « la veille n'a pas tourné ».

## Session 2026-08-14 — la bulle de la carte, et un revert de conteneur

### Ce que Marc a signalé

« Dans la carte, quand je clique sur une offre l'info-bulle n'est pas celle qu'il y avait
dans le preview. Je veux que ce soit la même et les mêmes couleurs. »

### Ce que la vérification a montré AVANT de coder

Les quatre neutres de l'app et ceux de la maquette « Poste de nuit » sont **identiques au
hex près** (`#1e1b12`, `#332e20`, `#a79e88`, `#f0eadb`). L'écart ne venait donc pas des
jetons. Trois causes réelles :

1. **Deux couleurs EN DUR du thème clair** avaient survécu dans cette bulle : `#a2540a`
   (orange foncé, mention de position approximative — quasi éteint sur le charbon) et
   `#ccc3` (gris clair, filet des groupes). Aucun test ne les voyait.
2. **La structure différait** : la maquette met le poste à gauche et la note à droite en
   monospace tabulaire sur une ligne à filet ; le code faisait une puce avec « 85/100 » en
   dessous — donc des notes à des abscisses variables, illisibles en colonne.
3. **Le caractère `↗`** dépendait de la police. La maquette le dessinait ; c'est le cas
   maintenant (SVG, suit `currentColor`).

Verrou posé : `tests/styles.test.ts` refuse tout `#rrggbb` dans une règle. La feuille est à
zéro couleur en dur, donc **aucune exemption**. Discrimination prouvée.

### ⚠️ Le conteneur a reverti l'arbre de travail EN PLEINE TÂCHE

`git log` local remonté de sept commits (jusqu'à `[BORNE-02]`), `node_modules` amputé des
paquets du jour. Rien de perdu — `git ls-remote` donnait le bon tip — **mais j'avais
commencé à éditer la version périmée du fichier**, qui ne connaissait ni les bornes de
recharge, ni le site, ni le téléphone, ni les horaires. Cette édition les aurait toutes
supprimées sous couvert d'un restylage. Jetée, refaite sur la bonne base.

Corollaire : après le revert, `refs/remotes/origin/main` MANQUAIT (la refspec de ce clone ne
suit qu'une branche), donc `@{u}` ne résolvait plus et le garde d'arrêt annonçait « 173
commits non poussés » sur un dépôt parfaitement à jour. Ref rétabli.

**Réflexe à garder** : un fichier qui montre du code supprimé récemment = suspecter le
revert AVANT toute autre hypothèse, et repartir du serveur.

## Session 2026-08-13 (suite) — le CV pilote le profil (ADR-0009)

### État en une page

| | |
|---|---|
| **Gate** | `typecheck` + `test` (**907**) + `lint` (0 erreur) + `build` verts. `npm audit --omit=dev` = **0**. |
| **La demande** | Marc : « je veux la possibilité d'uploader mon CV pour que la recherche de job se fasse par rapport à ça, et que tout s'update, les scores, les SWOT, les critères ». Il a demandé un plan et des questions d'abord — quatre posées, quatre tranchées. |
| **Le constat qui a changé la forme du travail** | Le profil de Marc EXISTAIT déjà, éclaté dans trois fichiers qui ne savaient pas qu'ils décrivaient un profil (`scoring.ts`, `reference.ts`, `ingest/sources.ts`). Le vrai travail n'était pas « analyser un PDF ». |
| **Ses quatre choix** | CV **conservé en base** · **rien ne s'applique sans sa validation** · **re-notation immédiate** à la validation · **chantier livré entier**. |
| **Ce qui n'était PAS négociable** | Une note `scoreSource: "manuel"` n'est jamais écrasée par un recalcul. Pas dans la question — c'est la règle du barème. |

### Ce qu'il reste à faire, côté Marc

**`ANTHROPIC_API_KEY` dans l'environnement Vercel.** Sans elle, le téléversement fonctionne,
le fichier est stocké, et l'extraction rend un échec NOMMÉ (« clé absente ») — jamais un
profil inventé. Une fois la clé posée, « ré-analyser » suffit : pas besoin de re-téléverser.

### Trois erreurs que j'ai faites, et ce qu'elles ont appris

1. **J'ai écrit un lecteur de PDF à la main.** Il passait ses propres tests. Sur les deux
   premiers PDF réels rencontrés : un faux « c'est un scan » sur un document plein de texte,
   et — bien pire — **76 784 caractères de binaire d'image annoncés comme un SUCCÈS**, prêts
   à produire un profil entièrement inventé. Remplacé par `unpdf`, correct sur les deux.
2. **J'ai mis la CI au rouge** en exigeant la présence de PDF qui n'existent que sur ma
   machine. Les committer était exclu (l'un montre du contenu réel du Drive de Marc). Les
   cas sont désormais construits et lus par pdf.js.
3. **Le garde PII m'a corrigé deux fois de suite** : les coordonnées d'un rectangle
   ressemblaient à un NAS, puis le commentaire qui citait la valeur fautive a rejoué
   l'échec. C'est la donnée d'épreuve qui s'adapte, jamais le motif.

### Une garde manquante, trouvée en vérifiant

`routesGardees.test.ts` ne voyait PAS la disparition du `await auth()` d'une page — il
éprouve la middleware, ce qui est son périmètre. Mais chaque page porte une revérification
que les commentaires appellent « défense en profondeur », et rien ne la protégeait.
L'invariant tenait partout ; il est maintenant verrouillé.

### La revue a trouvé sept défauts, tous réels, tous corrigés

Panel lancé sur le diff complet (pannes muettes + sécurité/vie privée). Aucun faux positif.

**Le plus grave, et il l'était vraiment** : `extraireFaits` nettoyait les coordonnées dans un
objet… que personne ne lisait. Ce qui partait en base était un étalement de la réponse BRUTE
du modèle avec trois champs seulement ré-écrits par-dessus — `langues`, `diplomes`, `outils`,
`titresOccupes` et la provenance traversaient intacts, jusqu'au profil et jusqu'à l'écran.
L'app promet le contraire à Marc en toutes lettres sur l'écran de dépôt. Corrigé en composant
un objet nettoyé champ par champ (ajouter un champ au schéma sans le nettoyer casse désormais
le typage), et verrouillé par `tests/cvExtraction.test.ts` — qui éprouve **le champ
réellement persisté**, avec discrimination prouvée sur la version fautive.

**Les six autres** : le filtre anti-évasion acceptait `[ \t]` là où il fallait `\s` (une
balise coupée par un retour à la ligne refermait le bloc de données) ; le `catch` de
`/references` était totalement muet là où `/profil` disait la même panne ; la boucle de
re-notation n'était pas gardée et l'écran restait vide sur rejet ; `activerProfil` pouvait
laisser zéro CV actif sans le dire ; une proposition illisible était indiscernable de
« pas de proposition » ; et `profilVersion` — dont mon propre commentaire disait qu'il
« empêche de confondre les notes de plusieurs barèmes » — n'était **jamais persisté**.
Colonne ajoutée (migration 0018), écrite à chaque re-notation : un lot mi-ancien mi-nouveau
se voit désormais en base.

### Ce qui reste ouvert

- **La Routine quotidienne porte ses termes de recherche dans son prompt**, hors du dépôt :
  un CV validé enrichit le profil sans changer ce qu'elle tape le matin. Divergence réelle,
  écrite dans l'ADR plutôt que laissée croire résolue (`[CV-08]`).
- `lib/cv/actions.ts` et `lib/cv/depot.ts` (les I/O) ne sont pas testés — la logique pure
  l'est, à 46 tests (`[CV-09]`).
- Un PDF scanné reste illisible : l'app le dit et donne le remède (`[CV-10]`).
- **`CLAUDE.md` fait 867 lignes pour un « plafond assumé : 150 »**, et il se charge à chaque
  session (`[CV-11]`).

## Session 2026-08-13 — « on dirait un logiciel de gestion » : la refonte visuelle

### État en une page

| | |
|---|---|
| **Gate** | `typecheck` + `test` (**834**, +6) + `lint` (0 erreur) + `build` verts, jugés par exit code. |
| **Le grief** | Marc : « on dirait un logiciel de gestion tellement c'est moche et plat ». |
| **La cause, écrite** | L'épure du 5 août n'a procédé que par SOUSTRACTION (ombres, contours, liserés, 4 tuiles sur 5, ambre « rare »). Chaque geste était juste, mais rien n'a remplacé ce qui partait : il restait des rectangles blancs sur du gris. Voir [ADR-0008](./docs/adr/0008-poste-de-nuit.md). |
| **Ce qui est livré** | « Poste de nuit » : neutre CHAUD (~90°), **sombre imposé — le thème clair est retiré** (révision d'ADR-0008, voir plus bas), contour de retour sur les surfaces, densité 1,20, tableau de bord en ENTONNOIR, jauge de distance, tuiles de carte assombries. |
| **Comment ça a été décidé** | Sur maquette, avant d'écrire une ligne de CSS : trois directions rendues sur les VRAIES offres, Marc en choisit une, puis règle la densité au curseur (1,20) et tranche l'échelle de couleur. |
| **Ce qui NE change pas** | L'ambre `#f2a31b` (`app.color` publiée au hub), `lib/couleurNote.ts`, les routes, les composants, les tests. Refonte de la peau, pas du squelette — réversible par `git revert`. |

### Deux pièges rencontrés, tous deux consignés en leçon

1. **Ma maquette avait supprimé le dégradé de couleur par note** — sans voir que
   `lib/couleurNote.ts` le faisait déjà, à la demande de Marc du 6 août. Il l'a lu comme une
   nouvelle demande : c'était une RÉGRESSION que je lui faisais valider. Recenser ce que
   l'écran fait déjà AVANT de le redessiner.
2. **« Le contraste suffit » n'avait jamais été chiffré.** L'écart de clarté fond↔carte vaut
   4 points en sombre et 2,9 en clair : insuffisant dans les DEUX thèmes. C'est ce qui
   justifie le retour du contour, et c'est une mesure, pas un goût.

### Fin de session — le thème clair est retiré

Marc, devant la version déployée : « c'est pas exactement comme ton preview […] les couleurs
sont pas les mêmes ». Cinq écarts signalés, **quatre étaient de vraies régressions** (halo
ambre absent, bulles Leaflet blanches, lueur de la marque perdue, carte dépliée non surélevée,
cercle de note à 3 rem au lieu de 3,3) — corrigées en `b3856f2`.

**Le cinquième n'en était pas une** : son système est réglé en clair, il regardait donc le
pendant fade pendant que la maquette validée était sombre. Question posée, réponse de Marc :
**« Sombre imposé, point. »**

L'app n'a plus qu'un thème. `:root` porte les jetons sombres, plus une seule
`@media (prefers-color-scheme: …)` dans `app/globals.css`, `viewport.themeColor` et le
manifeste passent à `#141209`. Le verrou est un **test**, pas une promesse de `grep` :
`tests/styles.test.ts` → « l'app n'a qu'un thème » (discrimination prouvée — en réintroduisant
une media query de thème, il tombe).

La leçon vaut au-delà de la couleur : **un second thème jamais montré à la validation n'est
pas une option offerte, c'est une version non validée de l'app servie au hasard du réglage
système** — et le jour où elle s'affiche, elle se lit comme un défaut.

Deux voisins réglés au passage : l'encre des épingles de la carte était une COPIE de
`encreSurNote()` figée dans le CSS (même classe que la table des paliers de distance) — elle
vient maintenant de `lib/couleurNote.ts`, posée en ligne avec le fond ; et le fond des `code`
gardait la teinte bleu-gris 265° d'avant ADR-0008.

### Ce qui reste ouvert

- **Plus de thème clair du tout.** Qui travaille en plein jour n'a pas de version claire.
  Assumé : app privée à un seul utilisateur, qui vient de choisir. Un clair reviendra le jour
  où il sera dessiné et validé comme le sombre l'a été.
- **La demande suivante de Marc n'est pas commencée** : téléverser son CV pour que la
  recherche, les notes, les SWOT et les critères s'alignent dessus. Il a demandé **un plan et
  des questions**, pas du code.
- **Le filtre CSS des tuiles** donne un rendu moins juste qu'un vrai fond sombre (les teintes
  de l'eau et des parcs virent). Assumé pour ne pas ajouter de domaine externe.
- **Non vérifié à l'écran par moi** : cette session n'a pas d'accès authentifié à l'app.
  Le rendu réel est à confirmer par Marc après déploiement.

## Session 2026-08-11 — la Routine poussait dans le vide, et je regardais le mauvais blocage

### État en une page

| | |
|---|---|
| **Gate** | `typecheck` + `test` (**735**) + `lint` + `build` verts, jugés par exit code. |
| **Ce qui s'est passé les 9 et 11** | La Routine a tourné deux fois, correctement : 142 offres trouvées, 66 après dédoublonnage, gate vert. **Les deux fois, `git push` a été refusé 403** — et les deux commits sont morts avec leur conteneur. |
| **La cause, mesurée** | `MoKarade/JobAI` n'est pas dans les sources d'une session fraîchement allumée, et la liste d'outils autorisés d'une telle session ne contient **aucun `mcp__*`** : elle ne peut donc même pas s'ajouter le dépôt. `add_repo` existe pourtant — mais seulement depuis une session de développement. |
| **Ma faute** | J'ai relayé **deux fois** à Marc le message d'erreur (« ajoutez le dépôt aux sources ») comme si c'était un geste à sa portée, sans vérifier que ce chemin existait de son côté. Il n'existait pas. |
| **Correctif** | La Routine ne crée plus de session : elle tire dans la session de développement (`persistent_session_id`), qui a déjà le dépôt, Indeed et la recherche web. Ancien déclencheur supprimé. **Rien à faire côté Marc.** |
| **Prix assumé** | Si cette session est archivée, la Routine perd sa cible et se recrée depuis la nouvelle. Plus petit que le prix d'un commit perdu chaque matin. |

### Ce que j'ai vérifié plutôt que repris sur parole

La session de la Routine rapportait `OPTIONS …/api/ingest/depot` → **204**, et en concluait
que l'en-tête de `lib/ingest/depotFichier.ts` était périmé. Re-mesuré depuis cette session le
11/08, sur `OPTIONS` **et** sur `POST` : **403 au CONNECT**, les deux fois. La prémisse de
l'en-tête tient donc pour cette session, et elle n'a pas été réécrite. L'asymétrie est réelle
mais inverse de ce qui était supposé — c'est la session NEUVE qui a le réseau, pas celle de
développement.

### Ce que la Routine a bien fait, et qui est maintenant dans le prompt

Elle a **exclu les agences de placement** de la recherche d'adresse (Manpower, Randstad,
Groupe RP, Horus, Recrutement Harmonie) : l'adresse d'une agence est le bureau du recruteur,
pas le lieu de travail — exactement le défaut AMETEK. Idem Voyages Laurier (quatre
succursales, aucune adresse complète) et Wabtec (siège américain). Elle a préféré le vide à
l'approximation. La règle est passée dans `docs/ROUTINE-DEPOT.md` : un jugement qui dépend de
la lucidité d'une exécution à l'autre n'est pas une garde.

### Ce qui reste ouvert

- **Le quota Indeed se referme en s'aggravant** : 26 s → 29 → 51 → 58 à chaque appel refusé.
  La veille du 11 n'a pas pu être reprise à la main dans la foulée de l'exécution du matin.
- **Cinq reverts de conteneur** dans la journée. Deux éditions non poussées ont été perdues
  et refaites. La règle « seul un push protège » se paie à chaque fois qu'on l'oublie.
- **Signature des commits** : toujours bloquée (clé de signature de 0 octet dans le conteneur).

---

## Session 2026-08-06 — la borne la plus proche, le registre épuisé, la veille débloquée

### État en une page

| | |
|---|---|
| **Gate** | `typecheck` + `test` (**715**) + `lint` (0 avertissement) + `build` verts, jugés par exit code. |
| **Le vrai défaut des bornes** | La mesure fonctionnait (`bornes=81/81`, aucune ligne d'erreur, migration `0011` appliquée) — c'est le **plafond de 350 m** qui rendait la réponse inutile : presque aucun employeur industriel n'a de borne à trois coins de rue, donc l'écran affichait « aucune » partout. Exact, et sans valeur. |
| **[BORNE-05]** | Le plafond est retiré : `proximiteBorne` rend **la plus proche, quelle que soit sa distance**. La portée de la requête passe de 350 m à 15 km (`PORTEE_RECHERCHE_M`), et `ETENDUE_MAX_DEG` de 2 à 3 — la marge coûte ~0,4° en longitude, et un lot Portneuf↔Charlevoix arrivait à 1,99°, au bord du refus. |
| **Ce qu'on rapporte en plus** | La **marque** (`network` → `brand` → `operator` → `name` : le réseau AVANT le nom, qui porte souvent le stationnement d'accueil), la **vitesse** (`fast_charge`, prises à courant continu, puissance ≥ 25 kW) et le **tarif publié**. Nouvelles colonnes `bornes_rapide`, `bornes_tarif` ; migration `0012` efface les dates pour tout remesurer au nouveau sens. |
| **Prix moyen : non** | ⚠️ **OpenStreetMap ne porte pas de prix moyen.** Il porte `fee` (payant ou non) et, plus rarement, `charge` — le tarif relevé sur la borne. On rend ça, et « payante, tarif non publié » sinon. Fabriquer une moyenne à partir de tarifs de catalogue donnerait un chiffre crédible que personne n'a mesuré (garde-fou n°3). |
| **Couverture réelle** | Inconnue tant que la passe n'a pas tourné : le proxy de la session **refuse Overpass** (403 au CONNECT sur les trois instances), impossible de mesurer d'ici. D'où la ligne `[bornes] … marque=X/N vitesse=Y/N tarif=Z/N` — c'est la production qui répondra, pas une supposition. |

### Deux défauts trouvés en écrivant les tests

- **`prisePresente` rendait `true` sur un tag ABSENT.** Écrit `texte(v)?.toLowerCase()` puis
  comparé à `null`, le prédicat comparait en fait `undefined` à `null` : toutes les bornes
  passaient pour rapides, y compris celles qui déclarent `socket:chademo=no`. Le `null` se
  teste **avant** le `?.`, jamais après.
- **La boîte et la distance n'utilisaient pas le même modèle de Terre.** Les boîtes
  employaient 111 320 m par degré (WGS84 à l'équateur), `distanceM` une sphère de 6 371 km,
  soit 111 195 m. La boîte était 0,11 % plus petite que la portée demandée, mesurée par la
  fonction même qui filtre ensuite : 17 m de manque sur 15 km — invisible à 350 m. Un seul
  `RAYON_TERRE_M`, partagé.

### `[LIEU-01]` — le registre est épuisé comme levier, et c'est mesuré

`registre=0/58 (5 ambigues) (53 absentes)`. La ligne `[registre] pistes` nomme enfin les
cas, et elle tranche dans les deux sens :

- **Ce qui se corrigeait** : le complément entre parenthèses. `Adecco (Papiers White Birch -
  Stadacona)` ne trouvait rien pendant que le registre contient « ADECCO » ; idem `JDHM
  (Après sinistre)`. `clesDeRecherche` cherche donc AUSSI sans la parenthèse — du côté de la
  question, jamais dans `cleNom` (dont dérive le `nomCle` déjà stocké à l'import : y toucher
  désaccorderait les deux en silence).
- **Ce qu'il ne faut PAS corriger** : `S Huot Inc` → « RÉAL HUOT INC. » (autre entreprise),
  `Groupe Mundial` (division Metal Bernard) → « Casino Mundial », `Evident Scientific` →
  « RADIO EVIDENTIA ». Trois adresses fausses, trois mauvaises portes. Un test verrouille ces
  trois cas : il tombe si quelqu'un ajoute un retrait de mot générique ou un préfixe.
- **Ce qui n'est nulle part** : `Permafil`, `Agilean`, `AMETEK` — « rien sous X ».

Reste donc ouvert : la plupart des employeurs sont épinglés au **centre de leur ville**, et
ni OpenStreetMap (qui ne cartographie pas les PME) ni le registre ne les placeront. Le
prochain levier honnête est une **adresse saisie par Marc** (`adresseSource: "manuelle"`),
pas un rapprochement plus souple.

### `[VEILLE-05]` — un second canal, sans jeton

Livré : `data/depot/AAAA-MM-JJ.json`, lu par `lib/ingest/depotFichier.ts`, déclaré source
**hors rotation** dans `passe.ts`. Une session de développement a le connecteur Indeed **et**
le dépôt git, mais aucun accès réseau vers l'app — elle écrit un fichier et le pousse.
**Premier lot réel : 26 offres, 25 retenues par `trier()`, 1 sous le plancher.**

⚠️ **La Routine quotidienne est créée mais SANS le connecteur Indeed.** `create_trigger` a
refusé de le transmettre (« the connectors parameter is not available for this
organization »), et les sessions qu'elle allume n'auront donc pas `mcp__Indeed__*`. Le prompt
s'arrête proprement dans ce cas plutôt que d'écrire un lot vide — un lot vide se lirait
« la veille a tourné et n'a rien vu », et ferait périmer des offres encore ouvertes. **Geste
de Marc, un seul** : ajouter le connecteur Indeed à la Routine
« JobAI — veille Indeed quotidienne » (`trig_01PBbNZQEnNu4tXuQ6He9yFs`, 11:00 UTC) depuis
l'écran Routines de claude.ai.

### Ce qui reste ouvert

- **Signature des commits** : toujours bloquée (clé de signature de 0 octet dans le conteneur).

---

## Session 2026-08-05 (soir) — le registre des entreprises, et les adresses qui viennent avec

### État en une page

| | |
|---|---|
| **Gate** | `typecheck` + `test` (**649**) + `lint` (0 avertissement) + `build` verts, jugés par exit code. CI consultée après chaque push. |
| **Bornes de recharge** | ✅ **Mesuré en production, 76/76.** C'était `2/6 (3 en échec) · budget restant=0 ms` : une requête Overpass PAR entreprise, et un échec coûte le délai × trois instances de repli. Désormais **une seule requête pour tout le lot** (boîte englobante, proximité calculée en local), et le coût réseau ne dépend plus du nombre de lieux. La passe rend maintenant 27 s de budget sur 35. |
| **Registre des entreprises** | Importé : **28 821 établissements** de la région + **59 194 dénominations** (`registre_etablissements`, `registre_noms`). Fichier officiel téléchargé par Marc — l'IP des runners GitHub est refusée par Cloudflare, et le datastore de Données Québec ne contient qu'une page d'erreur (leur propre moissonneur a heurté le même mur). Aucun fichier de personnes n'est lu (garde-fou n°1). |
| **Adresses sans réseau** | `adressesDepuisRegistre` comble les adresses manquantes **sans aucun appel réseau**, donc sans budget de temps. Deux chemins de recherche : le nom d'établissement, puis les **dénominations** — le second manquait, et c'est lui qui a fait passer le rapprochement de `11/73` à un chiffre en progression. |
| **Position par l'adresse** | ✅ **Mesuré : `precisees=4/6 (4 par adresse)`.** Quand on tient une adresse du registre, on la géocode **elle** au lieu du nom de l'entreprise — OpenStreetMap ne cartographie pas les raisons sociales, mais une adresse civique est son cœur de métier. La première passe après le rattrapage a rendu 4 positions exactes sur 6 candidates (1 hors rayon écartée, 1 introuvable). |
| **Source de l'adresse** | Colonne `adresse_source` (`osm` \| `registre`), contrainte en base « l'une sans l'autre, jamais ». Dite à l'écran : les deux ne valent pas la même chose. |
| **Diagnostic** | Les refus du registre sont **nommés**, pas seulement comptés (`[registre] absentes — …`). « 53 absentes » ne se vérifie pas ; trois causes possibles appellent trois correctifs opposés. |

### Ce qui reste ouvert

- **Les 53 absentes du registre** : les noms sont connus (`AMETEK`, `Evident Scientific`,
  `Permafil Inc.`, `Groupe Mundial`, `Garoy Construction inc.`…). Ce qui manque encore,
  c'est ce que le registre porte SOUS ces noms — la ligne `[registre] pistes` le dira à la
  prochaine passe. Ne rien élargir avant : une clé de rapprochement trop stricte, un
  organisme absent du registre régional et une marque ≠ raison sociale se corrigent de
  trois façons contraires. `Groupe Laberge (118)` est un cas à part : 118 établissements
  dans la région, le refus est défendable tant qu'on ne sait pas auquel le poste se rattache.
- **Rappel de fonctionnement** : la passe ne tourne **que** quand Marc ouvre l'app — la
  session ne peut pas s'authentifier à sa place pour la déclencher.
- **Refonte visuelle totale** — demandée explicitement par Marc comme chantier suivant,
  séquencée après le ratio.
- **Signature des commits** : toujours bloquée (clé de signature de 0 octet dans le
  conteneur).

### Le piège du jour, en une phrase

Une passe de fond lancée par `after()` **vit dans l'invocation de la page** : elle hérite
de son `maxDuration`, elle ne s'y ajoute pas. Trois `GET /carte` d'affilée sont morts en
« Task timed out after 30 seconds » sans qu'une ligne de trace ne sorte, parce qu'un budget
laissé à `null` n'est pas un grand budget — c'est aucune borne. Verrouillé par
`tests/budgetPasse.test.ts`, qui relit les trois exemplaires du fait sur le disque.

---

## Session 2026-08-05 — filtres partout, bornes de recharge, et la chasse aux sources close

### État en une page

| | |
|---|---|
| **Gate** | `typecheck` + `test` (562 à ce moment-là, **641** au soir) + `lint` + `build` verts. Jugé par **exit code**, jamais derrière un `\| grep`. |
| **Sources d'offres** | ❌ **Les sept sont mortes, mesurées.** Le verdict complet est en tête de `scripts/sonder-ouvert.ts` et dans `docs/ROUTINE-DEPOT.md`. Les deux jeux Données Québec nommés « Offres d'emploi » — la dernière piste — sont ceux des **villes de Laval et de Montréal**, leurs propres postes, à 250 km. Il n'existe aucun jeu provincial d'offres. |
| **Le seul canal qui produit** | `POST /api/ingest/depot`, alimenté par une Routine claude.ai. Son prompt vivait **uniquement dans la Routine** — invisible, non versionné, incorrigible ; il est désormais dans `docs/ROUTINE-DEPOT.md`, avec les recherches à lancer et la lecture du rapport de refus. |
| **Filtres** | Identiques sur la liste et la carte (`lib/filtres.ts`, `components/Filtres.tsx`). `proches: boolean` est devenu `distanceMaxKm` à paliers (10 / 25 / 50) ; `sansDistanceMesuree` distingue « loin » de « pas mesuré ». |
| **Carte** | Part des offres, se complète **sans clic** (`after()` + `reserverPasse`). Le gate est `km === null` (le résultat visé), jamais `!positions.has(nom)` — ce dernier ne converge pas quand la position est inscrite sous un autre nom. Un seul `after()`, travaux en série : deux `after()` s'exécutent en parallèle (mesuré). |
| **Bornes de recharge** | `[BORNE-01..03]` livré : `lib/bornes.ts` (pur) + `lib/overpass.ts` + migration `0006`. **Trois états, pas deux** : `bornesLe` NULL = jamais interrogé, posé sans distance = aucune à moins de 350 m, posé avec = la distance. Un échec de sonde n'écrit **pas** la date, donc la ligne est retentée. ✅ **A tourné, et le premier résultat était mauvais** : `2/6 (3 en échec)`, budget épuisé. Corrigé le soir même par la requête unique — voir la section du soir. |
| **Adresses** | `rattraperAdresses` valide la position obtenue par la **distance à l'ancre** (`> RAYON_VALIDATION_KM` ⇒ écartée) : sans ça, un homonyme d'ailleurs s'inscrivait « exacte » à vie — mesuré à 233 km. Budget partagé avec `situerLot` par un chrono unique, sinon chacun repartait à zéro et le total doublait. ⚠️ **À confirmer en production.** |
| **Interface** | `[UX-13]` : les 22 tailles de police sont devenues une **échelle de six pas** (zéro `font-size` littéral restant), fond neutre (il tirait sur le crème), espacements +25 %, interlignage 1,65, mesure de lecture à 68 caractères. |
| **Schéma** | Tout chemin de lecture garantit désormais son schéma : `getTrackerState` (sondage du hub) était le seul à ne pas appeler `assurerMigrations` — ça marchait par chance, ses colonnes datant de la première migration. |

### Ce qui reste ouvert

- **Vérifier en production** que `rattraperAdresses` et `mesurerBornes` ont réellement
  tourné — journaux Vercel, pas déduction. Les deux sont livrés et testés sur du simulé.
- **Faire tourner la Routine tous les jours** avec le prompt de `docs/ROUTINE-DEPOT.md`.
  C'est la réponse à « pas assez d'offres » : un dépôt en 72 h ne remplit pas une liste.
- **Analyse LLM des offres** et **lecture Gmail via DriveAI** : acceptés, non commencés.
- **Signature des commits** : bloquée — la clé de signature de l'environnement est un
  fichier vide (0 octet). Il faut une vraie clé SSH dans le conteneur, déclarée comme
  *Signing key* sur le compte GitHub de Marc.

---

## Session 2026-07-31 — la veille produit du réel, et la carte le montre

> ⚠️ Les entrées des 29 et 30 juillet n'ont jamais été consignées : ce qui suit rattrape
> l'état à partir du code réel, pas d'une mémoire de session. Ce qui n'a pas été vérifié
> aujourd'hui est marqué « à confirmer ».

### État en une page

| | |
|---|---|
| **Gate** | `typecheck` + `test` (**534**) + `lint` (0 avertissement) + `build` verts. Jugé par **exit code**, jamais derrière un `\| grep` — un filtre masque le code de sortie. |
| **Base** | Migrations **appliquées automatiquement au démarrage** (`lib/migrations.ts`, demande de Marc : « plus jamais à faire run db:migrate »). Mémorisée par processus, n'échoue jamais vers l'appelant. `0004` = colonne `offers.ville`. |
| **Veille** | ✅ **Produit du réel.** Premier vrai lot le 2026-07-31 : 45 offres reçues, 40 ajoutées (38 → 78 actives), vérifié dans les journaux Vercel. Le chemin est `POST /api/ingest/depot` — une Routine claude.ai envoie, l'app trie (même filtre région, même plancher `fitRole`, même dédoublonnage que le cron). Les sources automatiques restent mortes : Guichet-Emplois 404 sur 5 URL, ATS américains sans employeur local, Jobillico/Québec emploi/Isarta sans flux. |
| **Distance** | `DOMICILE_ADRESSE` géocodée une fois et conservée en base (`sync_state`), sinon `DOMICILE_LAT`/`LON`. Mesure automatique après réponse (`after()`), bornée à une passe / 5 min. |
| **Carte** | Part des **offres** depuis `[CARTE-01]`, plus des seules 36 entreprises cibles. Deux manques distincts : `aSituer` (se règle à la prochaine passe) et `sansLieu` (la source n'annonce pas de ville — aucune passe n'y changera rien). |
| **Employeurs** | Un seul endroit décide que deux noms désignent le même employeur : `lib/employeurs.ts` (`apparier`, `positionDe`), appelé par la carte ET la mesure des distances (`[DIST-02]`). Avant, la mesure comparait littéralement et re-géocodait ce qui était déjà situé. |
| **Adresse** | Récupérée d'OpenStreetMap (`display_name`) et stockée (`entreprises_lieux.adresse`, migration 0005), **uniquement sur une position exacte** — sur un repli au centre-ville ce serait l'adresse de la mairie. `rattraperAdresses` complète l'existant : les entreprises situées avant la colonne ne seraient jamais retentées. ⚠️ **Jamais tourné en vrai au 31/07** — testé sur du simulé seulement. |
| **Relances** | ✅ Branchées (`components/Relances.tsx` sur l'accueil). `lib/aFaire.ts` consomme désormais `lib/relances.ts` : il portait sa propre règle et ne surveillait que `CVenvoye`, si bien qu'une candidature déjà relancée disparaissait à jamais. |
| **Déploiement** | ⚠️ **Le webhook GitHub → Vercel a manqué trois pushes le 31/07** (`8145e4c`, `f479ae0`, `92d6dc6` n'ont AUCUN déploiement). Vérifier le SHA servi en production, pas l'existence d'un déploiement récent — et « Redeploy » rejoue l'ancien commit, il ne rattrape pas. |
| **Ville d'une offre** | Trois chemins la remplissent : l'ingestion (dépôt et cron, rattrapage compris — on complète, on n'écrase jamais), et le formulaire d'ajout manuel où elle est **facultative**. Une saisie vide vaut absence, jamais une chaîne vide. |
| **Interface** | Refonte « épurée » livrée (`[UX-11]`) : ombres douces à la place des bordures, pastilles, champ de recherche en pill. L'identité (ambre `#f2a31b`, logo monospace) est conservée. |
| **Relances** | `lib/relances.ts` livré et testé (seuils 14 j / 45 j, `Relance` n'est PAS une réponse du recruteur). ⚠️ **Pas encore branché à l'interface** — la logique existe, rien ne l'affiche. |

### Le défaut le plus coûteux de la session, et sa correction

La colonne `ville` n'était écrite par **aucun** des quatre chemins d'insertion : chacun
recopiait sa propre liste de colonnes, et l'ajout de `ville` a été oublié dans les quatre.
Le type la porte, la lecture la lit, l'écriture la perd — sans erreur, sans log. Les 40
offres du premier lot réel sont donc en base sans ville, donc sans position, donc sans
distance et absentes de la carte : le critère numéro un de Marc, perdu en silence.

Correction à la cause (`[CARTE-01]`) : `lib/persistance.ts` porte l'unique copie des
colonnes, `tests/persistance.test.ts` la verrouille en DÉRIVANT la liste attendue de
`OffreSchema`, et un second garde interdit à un cinquième chemin de réénumérer les colonnes.
Le rattrapage des 40 passe par `/api/ingest/depot`, qui complète — sans jamais écraser — la
ville d'une offre déjà suivie, et le compte remonte au rapport (`villesCompletees`).

### Ce qui reste ouvert

- **Rejouer un dépôt** pour rattraper les villes des 40 offres, puis vérifier qu'elles
  apparaissent sur la carte. Le prompt de la Routine est INCHANGÉ.
- **Brancher le suivi des relances à l'interface** (`lib/relances.ts` est prêt).
- **Analyse LLM des offres** et **lecture Gmail via DriveAI** : acceptés par Marc, non
  commencés. Passer par DriveAI évite un scope Google restreint sur JobAI.
- La liste d'améliorations UX que Marc a proposé d'envoyer.

---

## Session 2026-07-28 — cadrage, fondations, fork personnalisé

### État en une page

| | |
|---|---|
| **Dépôt** | `MoKarade/JobAI`, **PUBLIC** (il l'a toujours été ; la doc a longtemps prétendu le contraire — décision Marc du 2026-08-14 : il reste public, cf. garde-fou n°1 du `CLAUDE.md`). Créé par Marc. Forké depuis `app-template` (contenu identique, un commit `Initial commit`). |
| **Branches** | **Développement direct sur `main`**, sans branche de travail ni PR (ADR-0002). `main` est la branche par défaut du dépôt (réglé par Marc). ⚠️ La branche `claude/hopeful-lovelace-4d09zx` (ancienne branche par défaut) traîne encore sur le distant, sans usage — `[B-07]`. |
| **Gate** | `typecheck` + `test` + `lint` + `build` verts. Rejoué par la CI à chaque push. |
| **CI** | `.github/workflows/ci.yml` : un seul job `gate` (typecheck · tests · lint · build). Node épinglé par `.nvmrc` (**22**, pas 20 comme les autres dépôts : Node 20 est en fin de support et cette session développe en 22). ⚠️ Le job `garde-fous` a été retiré le 2026-07-28 : ses deux `git grep` doublaient `tests/piiGuard.test.ts` en moins précis, avaient divergé, et tenaient la CI au rouge depuis quatre commits. **Sans PR, une CI rouge ne se voit pas toute seule — la consulter fait partie du push.** |
| **Endpoint hub** | `GET /api/hub/summary` branché sur les vraies données via `getTrackerState()`. `503` si `HUB_TOKEN` absent · `401` si jeton invalide · `200` + `building` tant qu'aucune donnée réelle · `200` + `error` si l'état est illisible (jamais un 500 muet). Métrique en position 0 = la meilleure offre du moment. |
| **Base de données** | Neon (`us-east-2`), migration `0000` **appliquée**. Migrations `0001` (villes) appliquée par Marc le 2026-07-29 ; ⚠️ **la `0002` (table `entreprises_lieux`, carte par entreprises) reste à appliquer** — `npm run db:migrate` (le script vérifie lui-même le résultat). Jeu de départ **chargé**. Connexion paresseuse : le module s'importe au build sans `DATABASE_URL`, l'erreur ne part qu'à la première requête réelle. ⚠️ Le mot de passe initial a été exposé en conversation le 2026-07-28 et **doit avoir été régénéré** — à confirmer. |
| **Sécurité des dépendances** | `npm audit --omit=dev` → **0 vulnérabilité**. drizzle-orm monté en 0.45.2 (injection SQL), Next en 15.5.22 (8 avis HIGH), `postcss`/`sharp` forcés par `overrides`. ✅ **BatchChef corrigé** le 2026-07-28 (PR #22 mergée) : drizzle 0.45.2 + overrides, `npm audit --omit=dev` → 0. ⚠️ Reste ouvert là-bas : **aucune CI**. |
| **Auth utilisateur** | ✅ **Fonctionnelle en production.** Auth.js v5 **sans fournisseur** (`providers: []`) : JobAI n'émet plus de session, elle LIT celle que le hub pose sur `.hubperso.com` (ADR 0001, étape 1). Qui entre : **deux étages** — le propriétaire (`AUTHORIZED_EMAIL`, sans réseau) puis `aAccesHub` (`lib/accesHub.ts`, `POST /api/acces` du hub, cache 60 s positifs seulement), revérifiés à CHAQUE lecture dans le callback `jwt`. Middleware **fail-closed** (503 si `AUTH_SECRET`/`AUTHORIZED_EMAIL` manquent). Décision de garde en fonctions pures testées. La page `/connexion` traduit les codes d'erreur d'Auth.js en cause actionnable. |
| **Logique métier** | Complète, testée et branchée : `lib/types.ts` (schémas Zod), `lib/scoring.ts` (barème), `lib/seed.ts` (38 offres), `lib/suivi.ts` (fusion, modification, résumé), `lib/filtres.ts`, `lib/hubSummary.ts`, `lib/actions.ts`, `lib/export.ts`, `lib/ajout.ts`, `lib/aFaire.ts`, `lib/carte.ts`, `lib/geocodage.ts`, `lib/lienTrajet.ts`, `lib/chargerEnv.ts`, `lib/panne.ts`. **340 tests**, dont 19 d'intégration sur PGlite. |
| **UI** | **Navigation par onglets** (vraies routes) : `Suivi` (`/`), `Carte` (`/carte` — épingles par ENTREPRISE depuis [UX-09], repli honnête au centre-ville, fiches avec offres + trajet) et `Références` (`/references`), cadre partagé `components/Cadre.tsx`, direction visuelle actée par [ADR-0003](./docs/adr/0003-direction-visuelle.md) — densité FinanceAI, accent ambre conservé. L'onglet Suivi s'ouvre sur **« À faire maintenant »** (entrevues, relances échues, candidatures à envoyer, offres à vérifier — chacune justifiée par un fait du suivi), puis tableau de bord, ajout manuel et liste (recherche + 5 filtres) ; barème, entreprises, salaires et SWOT sont passés sous `Références`. **Écriture** (statut, priorité, note perso), **vue détaillée** `/offre/[id]`, marquage **périmée**, **export CSV** qui suit les filtres affichés, **lien « Trajet dans Google Maps »** par offre (destination seule — l'origine vient du compte Google de Marc, jamais de l'app ; le chantier carte Google ADR-0004 a été ANNULÉ au profit de ce lien). Styles bi-thème reprenant l'identité de l'artifact. |
| **Chargement du suivi** | `npm run db:seed` charge les 38 offres. **Idempotent et non destructif** : relançable après une mise à jour du jeu de départ, le suivi de Marc est préservé. |
| **Déploiement** | ✅ **EN LIGNE** sur `https://emploi.hubperso.com` (projet Vercel `job-ai`, DNS Cloudflare en DNS only). Vérifié le 2026-07-28 : dernier déploiement production `READY` sur le SHA de `main`, **zéro erreur runtime**. ⚠️ **Vercel ne bloque pas sur la CI** — les quatre commits à CI rouge ont été déployés normalement. Les deux chaînes sont indépendantes : vérifier les deux. ⚠️ Le proxy réseau de la session Claude **refuse `emploi.hubperso.com`** (403 au CONNECT) : la vérification passe par les outils Vercel, pas par `curl`. |
| **Widget hub** | ✅ **ACTIF**. PR #12 de Hubperso mergée (entrée `jobai`), `HUB_TOKEN_JOBAI` posé, hub redéployé. |
| **Chantier courant** | **Chantiers #01 (V1) et #05 terminés côté Claude** sauf `[UX-05]` (agrégateur — décision de Marc requise, pas du code). `[UX-09]` (carte par entreprises) est livré et revu ; son exercice réel (migration `0002` + « Situer ») est côté Marc. Voir `BACKLOG.md`. |

### Ce qui a été fait

- Lecture intégrale des 8 dépôts de l'écosystème (hub-contract, app-template, Hubperso,
  FinanceAI, DriveAI, BatchChef, claude-config, claude-code-toolkit) pour établir le contrat,
  la procédure de branchement au hub et la méthode de travail.
- Analyse des trois pièces fournies par Marc : l'artifact `tracker-emploi-v4.html` (référence
  UI et métier), le `HANDOVER.md` de la session du 27/07 et le squelette `jobtracker`.
- **ADR-0001** : identité, stack, phases V1→V4, périmètre, alternatives rejetées.
- `CLAUDE.md` (constitution, 6 garde-fous non négociables), `BACKLOG.md`, `docs/adr/`.
- Fork personnalisé : identité JobAI, route déplacée sous `/api/`, contrat d'échec 503,
  `.env.example` complété, `package.json` renommé, tests adaptés et étendus.
- **PR #1 mergée** (en merge commit `53b17ff`, pas en squash) — c'était la première et la
  dernière : **ADR-0002** acte le développement direct sur `main`, décidé après le
  va-et-vient de cette PR. Le filet perdu est remplacé par la CI.
- **CI en place** `[B-05]`. Ses deux garde-fous en bash ont été retirés le 2026-07-28 au
  profit du seul `tests/piiGuard.test.ts` — voir `BACKLOG.md` `[B-05]` pour le détail de
  l'incident (CI rouge quatre commits durant, non vue faute de PR).

### Décisions de cette session (détail dans ADR-0001)

IA : analyse d'offres + rédaction de CV/lettres + notation automatique + tri des réponses
Gmail · V1 = port fidèle + hub · Neon + Drizzle · scan Gmail dans JobAI (pas via DriveAI) ·
widget avec la meilleure offre en position 0 · CV lu depuis Google Drive · outillage niveau
DriveAI · dépôt privé.

### Réponses aux questions ouvertes du 27/07

1. **Réutiliser le scan Gmail de DriveAI ? Non.** Vérifié dans le dépôt : DriveAI n'expose
   que `api/hub/summary.ts` vers l'extérieur ; son moteur Gmail vit dans Apps Script à
   l'intérieur du compte Google de Marc, et sa surface Gmail est verrouillée par un check CI
   requis (`test/surface-gmail-ecriture.test.js`). JobAI implémente son propre scan.
   ⚠️ **DriveAI archive les courriels** : une requête limitée à `in:inbox` raterait tout ce
   qu'il a déjà rangé.
2. **Publier un schéma JobAI dans `hub-contract` ? Non.** Le contrat est générique par
   construction. JobAI expose un `HubSummary` standard ; son résumé interne reste privé.
3. **Le scan modifie-t-il les statuts ? Non.** Il propose, Marc valide.

### Risques et points ouverts

1. ⚠️ **Deux scopes Google restreints sur la même app OAuth.** La V2 demande
   `gmail.readonly`, et le choix « CV lu depuis Drive » ajoute un scope Drive. Ce sont des
   scopes *restreints* chez Google : en mode Test, les refresh tokens expirent au bout de
   7 jours [Probable — à confirmer dans la console Google Cloud] ; en production, ils
   déclenchent une vérification lourde. Les autres apps de Marc ne demandent que
   `openid/email/profile`, donc c'est un terrain neuf. **Piste** : `drive.file` + sélecteur
   de fichier Google (l'app ne voit que le fichier explicitement choisi) — satisfait le choix
   « depuis Drive » sans le scope large. À trancher par ADR-0002 avant la V2.
2. **Le contrat est pinné en `v1.0.0`**, donc **sans** le bloc `usage`. Sans effet en V1
   (aucun coût à publier) ; bloquant en V3. Un champ inconnu est stripé silencieusement.
3. **Ajouter JobAI au hub exige un redéploiement du hub** : `SOURCE_DEFS` est du code
   (`Hubperso/lib/sources.ts`), pas de la configuration, et `tests/sources.test.ts` est
   exhaustif — il cassera tant que les trois endroits ne sont pas mis à jour.
4. ~~**Le garde-fou n°1 n'a pas encore de vrai test-garde**~~ — **résolu** le 2026-07-28
   (`tests/piiGuard.test.ts`, `[V1-10]`). Ce qui reste ouvert est sa **portée assumée** :
   il détecte des FORMES (adresse, coordonnées, civilité, secret affecté), pas un nom de
   personne isolé — un motif générique de patronyme est inutilisable en français. Les six
   garde-fous ont désormais un verrou codé, sauf le n°4 (aucun scraping), qui reste tenu par
   l'ADR et la revue.

### Mise en ligne — FAITE le 2026-07-28

Neon, client OAuth Google, secrets, projet Vercel, DNS `emploi.hubperso.com`, déclaration
au hub : tout est en place et vérifié par les journaux. La procédure reste dans
[`docs/DEPLOIEMENT.md`](./docs/DEPLOIEMENT.md) pour la prochaine app.

**Trois pièges rencontrés à la mise en ligne, tous corrigés dans le code** :
1. La page rendait l'écran d'erreur générique de Next quand le schéma n'était pas appliqué.
   Elle explique désormais la panne et donne la commande à lancer.
2. La page de connexion disait « connexion refusée » sans distinguer un mauvais compte
   d'une variable manquante. Les codes d'Auth.js sont maintenant traduits.
3. Le hub applique `.trim()` à son jeton, JobAI ne le faisait pas : un espace invisible
   dans une variable Vercel donnait un 401 permanent entre deux valeurs d'apparence
   identique. Corrigé des deux côtés, verrouillé par tests.

### Reste à faire côté Marc (action humaine)

- [x] ~~Changer la branche par défaut en `main`~~ — fait le 2026-07-28.
      *(L'auto-merge et la protection de branche sont sans objet depuis l'ADR-0002 :
      décision de Marc, on n'y revient pas sans nouvel ADR.)*
- [x] ~~Neon, projet Vercel + DNS, client OAuth Google, les deux `HUB_TOKEN`~~ —
      **tout fait le 2026-07-28** `[V1-11]` `[V1-12]` `[V1-13]` `[V1-15]`. Cette liste est
      restée cochée « à faire » pendant que l'app était en ligne : le genre de dérive qui
      fait recommencer une étape déjà faite à la session suivante.

**Ce qui reste réellement côté Marc — deux points, aucun lié à la V1 :**

- [ ] ⚠️ **Confirmer que le mot de passe Neon a été régénéré.** Il a été exposé en
      conversation le 2026-07-28. Tant que ce n'est pas confirmé, considérer qu'il ne l'est pas.
- [x] ~~BatchChef vulnérable (injection SQL drizzle)~~ — **corrigé et mergé** le
      2026-07-28 (PR `batchchef-#22`). 🧭 Reste à trancher : BatchChef n'a **aucune CI**,
      lui poser le job `gate` de JobAI ?
- [ ] ⚠️ **Appliquer la migration `0002` (`npm run db:migrate`)** — table
      `entreprises_lieux`, sans laquelle l'onglet Carte affiche « Tables de la carte
      absentes ». *(La `0001` a été appliquée le 2026-07-29.)* Puis, une fois en ligne,
      **cliquer « Situer N entreprises »** sur l'onglet Carte, plusieurs passes (~6 par
      passe, cadence Nominatim) : c'est le seul vrai signal que le géocodage fonctionne (le
      proxy de la session Claude refuse Nominatim, donc l'appel réel n'a pas pu être exercé).
- [ ] Accorder (ou refuser) la suppression de la branche distante
      `claude/hopeful-lovelace-4d09zx` `[B-07]`.

### Comment reprendre

1. `git fetch origin && git status` — vérifier l'état réel avant de juger quoi que ce soit.
   On travaille **directement sur `main`** : un commit poussé est en ligne, il n'y a pas de
   revue pour rattraper. Le gate avant commit n'est pas une formalité.
2. Lire `BACKLOG.md`. Le chantier #01 (V1) est livré à une tâche près ; l'essentiel du
   travail restant est au chantier #05.
3. Le chantier #05 est livré sauf `[UX-05]`. ⚠️ `[UX-05]` (agrégateur
   multi-sources) attendent une **décision de Marc**, pas du code : ne pas les démarrer
   sans elle. `[NOTE-SALAIRE]` exige un ADR avant la moindre ligne (protocole §8).
4. Les trois pièces de référence de Marc (artifact HTML, squelette `jobtracker`, handover du
   27/07) ne sont **pas** dans le dépôt : elles ont été fournies en pièces jointes de session.
   L'artifact reste la référence pour le portage de l'UI `[V1-06]`.
