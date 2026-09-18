# ADR-0019 — Toutes les offres québécoises entrent, le filtre de distance tranche à l'écran

- **Statut** : **Accepté** (décision Marc, 2026-09-18 : « je veux aussi que toutes les 43k
  offres tu les importes mais ensuite quand on filtre on voit seulement celles proches
  (filtre par km) », puis « go lot 2 » après avoir entendu la réserve d'ordre ci-dessous).
- **Date** : 2026-09-18
- **Exigé par** : garde-fou n°4 (« *Verrou : ADR avant toute nouvelle source* ») — ce n'est
  pas une source NEUVE, c'est un changement de ce que la seule source ingère, et l'effet sur
  le volume est d'un ordre de grandeur.
- **Se lit après** : ADR-0010 (sources lues par l'app), ADR-0018 (la bande postale),
  `[VEILLE-51]` (la veille n'a plus qu'une source).

## Contexte — le chiffre qui a déclenché la décision

Marc, le 2026-09-18, après une passe lancée au bouton : « je pensais avoir plein d'offres
mais juste 20 de plus ». Mesuré dans les journaux de cette passe (20:23) :

```
ingérées=21/1600 · doublons=1535 · lieu-inconnu=38 · hors-région=6 · sous-plancher=0
```

1535 + 38 + 6 + 0 + 21 = **1600**, au chiffre près. Trois faits en sortent :

1. **`trouvees` vaut EXACTEMENT `MAX_RETENUES_FLUX`.** Le plafond a mordu : la lecture s'est
   arrêtée sur `plafond-retenues`, donc la source n'a lu qu'un **PRÉFIXE** du flux. Elle n'a
   pas vu les 43 071 offres, ni même toutes les régionales.
2. **1 535 des 1 600 étaient déjà en base.** Le Guichet republie les mêmes annonces chaque
   jour ; le bassin que la source sait atteindre est saturé par les 1 689 offres suivies.
3. **Le filtre de région refuse 5 782 offres québécoises par passe.** Mesuré le même soir sur
   le flux COMPLET (`fin: "flux-termine"`, donc concluant) : 43 071 vues → **7 239
   québécoises** (`estPeutEtreQuebec`) → **1 457** « dans la région », **2 034** « hors
   région » d'après le nom de ville, **3 748** « lieu inconnu ».

## Décision

**Tout ce qui passe `estPeutEtreQuebec` entre en base.** Les trois verdicts de `situer` ne
REFUSENT plus rien à l'ingestion ; ils sont ENREGISTRÉS sur l'offre (colonne `situation`) et
c'est l'écran qui tranchera, par la distance.

Trois changements, et rien d'autre :

1. `MAX_RETENUES_FLUX` : **1 600 → 12 000**. Dérivé de la mesure du 2026-09-18 (7 239
   québécoises), avec 1,65× de marge pour la variation quotidienne. Le plafond reste — il
   protège la mémoire et le mur de la fonction — mais il cesse de mordre en régime normal.
2. `sourceGuichetFlux` : le prédicat `garder` ne refuse plus les `hors-region`, et le quota
   `MAX_LIEUX_INCONNUS_FLUX` ne borne plus les `lieu-inconnu`. Les COMPTEURS restent : ce sont
   eux qui disent la distribution, et c'est la distribution qui a permis de trancher.
3. `trier` : les deux `continue` sur `hors-region` et `lieu-inconnu` disparaissent. Le verdict
   est écrit dans `situation`.

## Ce que ça coûte — MESURÉ avant d'être codé

| Poste | Mesure |
|---|---|
| `trier` sur 7 239 offres | **368 ms** (banc local, distribution réaliste). Le CPU n'est pas le sujet. |
| Lecture du flux complet | **5 s** pour 43 071 offres (`diagnostic_flux`, 2026-09-18). |
| Écritures | ~7 200 offres / 200 par lot = **~37 allers-retours**, autant pour les raisons (2 par offre). À la latence Neon, de l'ordre de 10 s. |
| Mur de la fonction | `maxDuration = 300` sur `/api/cron/veille`. La marge est large. |
| Mémoire | ~7 200 descriptions retenues en mémoire, de l'ordre de 20 Mo. |

Le premier passage écrit ~5 500 offres d'un coup (7 239 moins les 1 689 déjà suivies) ; les
suivants retombent au rythme réel des nouvelles annonces.

## Le risque assumé, et il est réel

**Entre ce lot et le filtre de distance à l'écran, l'app est MOINS utilisable qu'avant.**
5 782 offres arrivent sans distance mesurée — le barème accorde 10 points sur 20 à une
distance INCONNUE, donc une offre de Montréal peut noter comme une offre de Québec, et la
liste triée par note se retrouve mêlée.

J'ai proposé l'ordre inverse (distance, puis écran, puis import) pour qu'aucun état
intermédiaire ne soit pire que l'actuel. **Marc a tranché « go lot 2 ».** C'est sa décision,
elle est prise en connaissance de ce paragraphe, et elle est réversible : l'ingestion est
additive, rien n'est détruit, et le filtre à venir travaillera sur des offres déjà en base
plutôt que d'attendre qu'elles reviennent.

## Pourquoi une colonne `situation`, alors que le lot ne la demandait pas

`trier` CALCULE déjà le verdict de `situer` pour chaque offre — c'est ce calcul qui servait à
refuser. Ne plus refuser sans l'enregistrer reviendrait à jeter une mesure qu'on vient de
payer, et à présenter 2 034 offres jugées « hors région » exactement comme les 1 457 jugées
« dans la région ». La colonne est additive (`null` = pas mesurée, pour tout ce qui précède),
elle ne change aucun comportement aujourd'hui, et c'est elle que le filtre de l'écran lira.

## Alternatives rejetées

- **Garder le filtre de région et se contenter de relever le plafond.** Aurait ramené au plus
  1 457 offres au lieu de 1 600 : +0 en pratique, puisque 1 535 sont déjà connues. C'est
  exactement le statu quo que Marc a constaté.
- **Filtrer par bande postale à l'ingestion** (ne garder que G/J proches). La bande dit la
  région administrative, pas la distance : `G0L`, `G0M`, `G0X` sont des codes ruraux qui
  couvrent des centaines de kilomètres. Un filtre par bande refuserait des offres proches et
  accepterait des lointaines — il remplacerait une mesure par un pari.
- **Noter la distance inconnue plus sévèrement pour compenser.** Touche `lib/scoring.ts`, donc
  le protocole §11 (ADR dédié + audit sur tout le seed + non-régression). Hors périmètre, et
  ce serait traiter un problème d'AFFICHAGE par un changement de BARÈME.
