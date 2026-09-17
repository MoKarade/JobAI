# ADR-0018 — La bande postale tranche les lieux que personne ne sait nommer

**Statut** : Accepté — demande de Marc du 2026-09-17 (« fais la règle de bande »), après la
mesure qu'il avait lui-même débloquée en demandant les deux autres lots.
**Relève de** : `[VEILLE-42]`. Ne relève PAS du §11 (la note et le matching offre↔profil ne
bougent pas) — mais la méthode du §11 a été suivie quand même : mesure sur le réel AVANT toute
ligne de code, parce qu'une règle géographique écrite de mémoire est une table inventée.
**Révise** : rien. `HORS_PORTEE`, la liste blanche des municipalités et le registre mesuré
(ADR du registre des lieux, `lib/ingest/lieux.ts`) gardent tous leur priorité — la bande passe
APRÈS eux tous.

## Le problème

`situer` place une offre par le NOM de sa ville : liste noire (`HORS_PORTEE`), puis liste
blanche des municipalités, puis registre mesuré, puis repli sur la description. Tout ce qu'aucun
de ces quatre ne sait trancher tombe en `lieu-inconnu`.

Mesuré sur une passe complète du flux (2026-09-17, 19:25 UTC, `fin: "flux-termine"`,
42 957 offres lues) : **3 705 offres en `lieu-inconnu`**, contre 1 445 placées dans la région et
2 021 hors région. Plus de la moitié des québécoises ne sont donc placées par aucune règle.

Or `lieu-inconnu` n'est pas gratuit : `sourceGuichetFlux` rapporte ces offres pour que leur
lieu soit MESURÉ par Nominatim, et il n'en rapporte que **`MAX_LIEUX_INCONNUS_FLUX = 40` par
passe**. Quarante places, disputées par 3 705 offres, servies dans l'ordre du flux.

## Ce qui a manqué jusqu'ici, et pourquoi la mesure a dû venir en premier

Le remède évident — trier par code postal — était écrit dans le ticket depuis un mois, et il
était impossible à écrire honnêtement : **rien ne disait quelle bande est lointaine**. Répondre
« H est l'île de Montréal, J le sud-ouest » aurait été une connaissance récitée de mémoire, donc
une table inventée, capable de condamner en silence une bande que la région utilise.

La mesure qui tranche existait dans le flux sans être comptée : les offres rejetées par
`HORS_PORTEE` le sont sur le **NOM** de leur ville (Montréal, Toronto, Ontario…), par une règle
**indépendante du code postal**. Leur distribution par bande dit donc « quelle bande porte ce
qui est loin », sans circularité. Lue contre celle des offres RETENUES — qui dit quelle bande
porte ce qui est proche —, elle tranche.

## La mesure (2026-09-17, passe complète, `fin: "flux-termine"`)

| Bande | Placées DANS la région | Placées HORS région | Décidables | Part régionale | `lieu-inconnu` |
|---|---|---|---|---|---|
| **G** | 1 401 | 390 | 1 791 | **78,2 %** | 1 210 |
| **J** | 43 | 884 | 927 | **4,6 %** | 1 784 |
| **H** | 1 | 745 | 746 | **0,13 %** | 707 |
| M | 0 | 1 | 1 | — | 0 |
| K | 0 | 1 | 1 | — | 0 |
| E | 0 | 0 | 0 | — | 2 |
| A | 0 | 0 | 0 | — | 2 |

« Décidables » = les offres que le nom a suffi à placer, donc celles sur lesquelles la bande
peut être jugée. « Part régionale » = placées dans la région ÷ décidables.

Et un fait qui décide de l'applicabilité : **aucune offre non placée n'est sans code postal**
(`(vide)` est absent du compte). La couverture est de 100 %.

## Décision

**1. Une bande n'est rejetée que si la mesure la montre essentiellement jamais régionale.**
Critère, écrit pour être re-appliqué : au moins ~500 offres décidables (sinon l'échantillon ne
dit rien) ET une part régionale inférieure à 1 %. Aujourd'hui **une seule bande passe ce
critère : `H`** (746 décidables, 0,13 %).

- `G` est la bande de la région elle-même (78,2 %) : jamais.
- `J` est à 4,6 % — une offre régionale sur vingt-deux. Rejeter `J` gagnerait 1 784 offres par
  passe et **parierait contre une sur vingt-deux**. Refusé : un faux rejet coûte une offre que
  Marc ne verra jamais et dont rien ne signalera l'absence ; un non-rejet coûte une place de
  quota. Les deux erreurs ne sont pas du même prix.
- `M`, `K` : un seul décidable chacune, aucune évidence, et zéro offre non placée à gagner.
- `E`, `A` : **zéro** décidable — on ne sait rien d'elles. Quatre offres. Ne rien savoir n'est
  pas une raison de rejeter.

**2. La bande est consultée EN DERNIER, après toutes les règles de nom.**
Ordre de `situer` : nom vide → `HORS_PORTEE` → liste blanche → registre mesuré → repli sur la
description → **bande** → `lieu-inconnu`.

C'est ce qui rend le coût d'aujourd'hui **nul par construction**, et pas seulement faible :
l'unique offre régionale à code `H` est acceptée par son NOM, trois étapes avant que la bande
ne soit lue. La bande ne tranche que ce que personne d'autre n'a su trancher.

**3. L'instrument de diagnostic n'applique PAS la règle, et c'est délibéré.**
`diagnostiquerFlux` continue d'appeler `situer` sans code postal. Un instrument qui incorpore la
règle qu'il sert à calibrer ne peut plus la falsifier : `lettresHorsRegion` se remplirait des
offres que la bande vient de rejeter, et le contraste deviendrait circulaire. Conséquence à
dire tout haut : **les `verdicts` du diagnostic ne sont pas l'état de la production** — ils
décrivent ce que les règles de NOM seules savent placer. Bénéfice secondaire : le compte de la
bande rejetée dans `lettresInconnues` EST exactement le rendement de la règle.

## Impact quotas / coût

Aucun appel réseau ajouté : la bande est une lecture de chaîne sur une donnée déjà présente
dans le flux. Le gain porte sur le quota de mesure : **707 offres par passe (19,1 % des 3 705
non placées) cessent de disputer les 40 places** de `MAX_LIEUX_INCONNUS_FLUX`, qui vont aux
bandes où une offre régionale est plausible.

⚠️ **Non mesuré, et je ne l'annonce donc pas comme un gain** : le nombre de NOMS DISTINCTS parmi
ces 707. Le quota se consomme par nom, pas par offre — 707 offres peuvent être vingt noms comme
sept cents. Le gain en places libérées est donc borné par ce compte, que l'instrument ne rend
pas aujourd'hui.

## Analyse de risques

| Risque | Ce qui le contient |
|---|---|
| Une offre régionale à code `H` refusée | Elle est acceptée par son nom avant que la bande ne soit lue. Mesuré : c'est le cas de l'unique offre concernée. |
| Un employeur régional publiant sous le code postal de son siège `H` **et** sous un nom de ville inconnu | Non contenu. C'est le vrai risque résiduel, et il est accepté : la part régionale de `H` chez les décidables est de 0,13 %. |
| La liste se périme (le Guichet change de format, la région s'étend) | Le critère est écrit ci-dessus et la mesure est re-jouable par `diagnostic_flux` en une commande. Un test interdit `G` et `J` dans la liste. |
| La règle contamine l'instrument | Le diagnostic n'applique pas la règle, et un test le verrouille. |

## Méthode de test

- Fonction PURE (`bandeHorsRegion`), testée sur la bande rejetée, une bande gardée, un code
  absent, un code malformé.
- `situer` : une offre à bande rejetée et nom inconnu sort `hors-region` ; la MÊME offre avec un
  nom de la liste blanche reste `dans-la-region` ; avec un verdict mesuré, la mesure gagne.
- Ratchet : la liste des bandes rejetées ne contient ni `G` ni `J`, avec les chiffres mesurés en
  commentaire — l'ajouter rougit et force à relire la mesure.
- Chaque garde prouvée par mutation.

## Conséquences

**Positif** — 19,1 % des offres non placées cessent de disputer le quota de mesure ; le tri se
fait sans requête ni homonyme ; la règle est calibrée sur du mesuré et re-mesurable.

**Négatif** — `situer` gagne un paramètre, et `OffreBrute` un champ : deux contrats élargis pour
une règle qui ne rejette aujourd'hui qu'une bande. Le diagnostic cesse de décrire la production.

**Risques acceptés** — l'employeur régional à siège montréalais publiant sous un nom de ville
inconnu (0,13 % mesuré). Et `J` reste non trié : la moitié du problème de `[VEILLE-42]` demeure,
volontairement.

## Alternatives rejetées

- **Rejeter `J` aussi** — 1 784 offres gagnées, mais 4,6 % de part régionale. Le prix d'un faux
  rejet (une offre invisible à jamais, sans trace) n'est pas celui d'un faux maintien (une place
  de quota).
- **Poser la bande AVANT la liste blanche** — plus simple et plus rentable en apparence ; perdrait
  les 44 offres régionales à code hors bande, mesurées.
- **Élargir `HORS_PORTEE` avec les noms de l'île de Montréal** — c'est `[VEILLE-33]` : la liste
  compare par SOUS-CHAÎNE, donc `saint-laurent` exclurait aussi `Saint-Laurent-de-l'Île-d'Orléans`,
  qui est dans la région.
- **Un seuil calculé à l'exécution sur la mesure du jour** — la règle changerait toute seule au
  gré d'une passe, sans que personne ne relise le contraste. Une liste écrite, datée et gardée
  par un test se relit.

## Réversibilité

Totale et immédiate : vider `BANDES_HORS_REGION` rend le comportement exact d'avant. Aucune
donnée n'est écrite ni détruite — une offre rejetée par la bande n'est simplement pas ingérée,
et le flux la re-présente à chaque passe.
