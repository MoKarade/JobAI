# ADR-0020 — Le gros chiffre de la carte devient l'arrivage

**Statut** : Accepté (Marc, 2026-09-21)
**Révise** : le volet « Widget hub » d'[ADR-0001](./0001-fondations-jobai.md), qui mettait la
meilleure offre en position 0. Le reste d'ADR-0001 est intact.

## Contexte

Marc, 2026-09-21 : « la carte jobai je veux que ce soit le nombre de nouvelles offres le gros
chiffre et le graph ».

ADR-0001 avait choisi la **meilleure offre du moment** comme gros chiffre, pour que la carte
réponde à « qu'est-ce qui vaut le coup en ce moment » plutôt qu'à « combien j'en ai ». Le
raisonnement tenait, et il ignorait un fait du hub qui n'existait pas encore quand il a été
écrit.

⚠️ **Le hub indexe l'historique d'une métrique PAR SON LIBELLÉ** — `serieMetrique(historique,
elue.label)` dans `Hubperso/lib/historique.ts`, et le héros de la carte est
`metrics.find(m => m.primary) ?? metrics[0]` dans `Hubperso/lib/carte.ts`. Or le libellé de la
meilleure offre est `Meilleure : <entreprise>` : il **change de clé** dès que l'offre de tête
change d'employeur. Sa série repartait donc de zéro, et la carte affichait « pas encore
d'historique » sous le seul chiffre mis en avant.

**Le chiffre héros était structurellement le seul à ne pas pouvoir porter de courbe.** La
demande de Marc n'est donc pas qu'une préférence de mise en page : « le graph » était
inatteignable tant que le héros portait un nom variable.

**Mesuré** : le libellé `Nouvelles (7 j)` est publié sans condition depuis le 2026-08-14
(`c900e39`, `[HUB-01]`), soit 38 jours ; la rétention du hub est de 90 jours
(`RETENTION_JOURS`, `Hubperso/lib/historiqueDb.ts`). **La série existe déjà** — elle n'était
simplement jamais élue. La courbe apparaît donc avec son historique réel, sans attendre.

## Décision

1. `primary: true` **et** la position 0 vont à **`Nouvelles (7 j)`**, sans condition.
   Les deux disent la même chose à dessein : un hub pinné sur un contrat antérieur à v1.3
   ignore `primary` et retombe sur `metrics[0]`.
2. **La meilleure offre reste publiée**, en métrique secondaire. Elle garde son `severity: ok`
   au-dessus de 80. Elle n'est pas retirée de la carte, elle cesse d'en être le titre.
3. **Le libellé du héros est FIGÉ** (`LIBELLE_HEROS`, exporté). Ce n'est plus un titre, c'est
   une **clé partagée avec un autre dépôt** : le renommer jette la série accumulée, sans que
   rien ne rougisse côté hub — il n'a aucun moyen de savoir qu'une série et sa remplaçante
   parlent du même sujet.
4. Le repli d'alors (`primary` sur l'arrivage quand aucune offre n'est notée) **disparaît** :
   il existait parce que l'ancien héros n'était pas toujours là. `resume.nouvelles` existe
   toujours, et un zéro y est une information vraie — « rien n'est arrivé cette semaine ».

## Impact quotas / coût

**Nul.** Aucun appel réseau, aucun champ nouveau, contrat inchangé (v1.3), aucune migration.

## Analyse de risques

| Risque | Traitement |
|---|---|
| Un lot futur renomme le libellé « en mieux » et jette la courbe | Garde qui fige la valeur EXACTE, avec sa raison écrite dedans |
| Deux « 7 j » se côtoient : le compteur (arrivage sur 7 jours) et la variation affichée par le hub (évolution sur 7 jours) | Assumé et dit ici. Ce sont deux grandeurs différentes, et aucune n'est fausse : l'une est un stock d'arrivée, l'autre son évolution |
| Un compteur qui retombe à 0 quand la veille s'arrête ressemble à « rien à faire » | C'est précisément le signal qu'on veut voir, et il n'est pas seul : `dataAsOf` + `expectedMaxAgeSec` + `alertesVeille` disent déjà qu'une passe est figée |
| La meilleure offre perd sa mise en avant | Assumé par Marc. Elle reste la première métrique secondaire, donc immédiatement sous le héros |

## Méthode de test

Cinq gardes, deux perturbations **mesurées** :

- héros remis sur la meilleure offre (le comportement d'ADR-0001) → **3 rouges**, un par
  garde visée ;
- libellé du héros renommé → **3 rouges**, dont la garde qui fige la valeur exacte. Sans
  elle, toutes les autres sont auto-satisfaites : elles comparent à la constante, donc un
  renommage les laisserait vertes pendant que le hub perdrait la série.

## Conséquences

**Positif** — le gros chiffre porte enfin une courbe, et elle a 38 jours d'historique réel
dès la première lecture. Le compteur qui bouge le plus souvent est aussi celui qu'on regarde.

**Négatif** — la meilleure offre n'est plus le premier chiffre lu. C'est l'arbitrage de Marc.

**Risque accepté** — `Nouvelles (7 j)` est une fenêtre glissante : deux relevés à quelques
heures d'écart peuvent différer parce qu'une offre est SORTIE de la fenêtre, pas parce qu'une
nouvelle est entrée. La courbe dit l'arrivage net, pas le nombre d'arrivées.

## Alternatives rejetées

- **Garder la meilleure offre en héros et stabiliser son libellé** (« Meilleure offre », avec
  l'entreprise déplacée en `hint` ou en détail). Techniquement possible et ça rendrait la
  courbe traçable — mais ce n'est pas ce que Marc a demandé, et le score de la meilleure offre
  bouge peu : sa courbe raconterait moins que celle de l'arrivage.
- **Publier une métrique NEUVE au libellé plus joli** (« Nouvelles offres »). Jette 38 jours
  d'historique déjà accumulé pour un gain purement cosmétique.
- **Élire le héros côté hub** (« la métrique qui a le plus bougé »). Refusé par le hub
  lui-même, et pour une bonne raison écrite dans `lib/carte.ts` : la mise en page dépendrait
  alors des données, et la carte changerait de visage au gré des chiffres.

## Réversibilité

**Totale, et sans perte.** Deux lignes à déplacer, aucune migration. Le hub conserve TOUS les
relevés pendant 90 jours, métriques comprises : les deux séries continuent d'être enregistrées
quel que soit le héros élu — seule l'élection change.
