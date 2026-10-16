# ADR-0026 — Le salaire et l'expérience exigée du flux sont lus

**Date** : 2026-10-16 · **Statut** : Proposé — tâche JobAI#150 (mission JobAI#146, plan « refonte de la note »,
étape 2). Les deux règles de conversion ci-dessous sont des décisions PROVISOIRES soumises à Marc sur une carte du
fil JobAI ; les changer touche une constante.

## Contexte

Le flux du Guichet publie, pour chaque offre, un salaire et une expérience exigée. L'app écrivait
`salaireAffiche: null` pour toute offre venue du flux et devinait la séniorité dans le texte de l'annonce. Le
salaire, premier critère de Marc, ne pesait donc rien dans la note : l'axe est inerte (`profil.ts`), faute d'un
montant annuel à lui donner.

Formats mesurés dans le flux du 2026-10-16 (43 483 offres vues, 1 494 régionales ; `diagnostic_flux`) :

- `salary` : « $25.00 hourly » ; « $20.00 to $25.00 hourly (to be negotiated) » ; « $45,000.00 to $50,000.00
  annually (to be negotiated) ». 401 valeurs distinctes ; les 40 plus fréquentes ne contiennent que `hourly` et
  `annually`.
- `experience` : neuf classes seulement (« 1 year to less than 2 years » 407, « 2 years to less than 3 years » 279,
  « Experience an asset » 253, « 1 to less than 7 months » 196, « 3 years to less than 5 years » 141, « 7 months to
  less than 1 year » 114, « 5 years or more » 65, « No experience (will train) » 38, « Will train » 1).

## Décision

1. **Lecture** (`lib/ingest/conditionsFlux.ts`, pures) : `lireSalaireAnnuel`, `lireExperienceMois`,
   `salaireAffichable`. Elles REFUSENT de deviner : unité inconnue, texte libre, montant hors de 10 000–1 000 000 $
   par an → `null`.
2. **Conversion en annuel** : taux horaire × **2 080 h** ; jour × 260 ; semaine × 52 ; deux semaines × 26 ; mois × 12.
   *Provisoire.*
3. **Fourchette** : on retient la **borne basse** (ce qu'on est sûr d'avoir ; même règle que la séniorité,
   ADR-0024). *Provisoire.*
4. **Expérience** : en mois, borne basse de la classe ; « Experience an asset » et « will train » valent 0 (le champ
   dit que rien n'est exigé — c'est une lecture, pas une absence). Un texte non reconnu → `null`, jamais 0.
5. **Gardé avec l'offre** : `salaire_affiche` (le texte tel que publié, borné à 80 caractères, il s'affiche déjà sur
   la carte), `salaire_annuel` et `experience_mois` (migration 0026, colonnes facultatives, ajout seulement).
6. **La séniorité lit le champ structuré avant le texte** (`scoreSeniorite`, années entières par le bas). C'est le seul
   changement de barème de cette tâche.
7. **Le salaire n'entre PAS encore dans la note.** L'offre le porte, l'axe reste inerte jusqu'à JobAI#152, qui
   l'applique avec un aperçu avant/après. Le brancher ici déplacerait toutes les notes sans que Marc ait vu l'écart.

## Impact coût LLM

Nul. Regex pures, aucun appel.

## Audit sur du réel (protocole §11)

Le texte source des offres existantes n'est pas conservé (ADR-0024), et les offres déjà en base n'ont pas ces champs :
elles gardent leur note. L'audit porte donc sur la DISTRIBUTION du flux du 2026-10-16 (1 494 offres régionales), points
de séniorité du profil par défaut (`paliersSeniorite` 15/13/9, « non précisé » 11) :

| Classe d'expérience | Offres | Points avant (texte muet) | Points après | Écart |
|---|---|---|---|---|
| Aucune exigence, atout, < 1 an, 1 an, 2 ans | 1 288 (86 %) | 11 | 15 | +4 |
| 3 à moins de 5 ans | 141 (9 %) | 11 | 13 | +2 |
| 5 ans ou plus | 65 (4 %) | 11 | 9 | −2 |

**Effet attendu** : l'immense majorité des offres du flux gagne 4 points de séniorité, et l'ordre entre elles se met à
suivre l'exigence (les postes qui demandent 5 ans et plus passent sous les autres). Ce « avant » suppose que le texte
de l'annonce ne dit presque jamais « N ans » [Probable, non mesuré : le texte n'est conservé que depuis
ADR-0025] ; l'écart réel se lira sur les offres de la première passe.

## Risques

- **Surestimation par le bas** : une fourchette « à négocier » lue par sa borne basse sous-estime le salaire réel.
  C'est le choix prudent ; l'affichage garde le texte complet.
- **2 080 h** : un poste à 37,5 h/semaine rapporterait 1 950 h. L'écart (6 %) ne change pas d'ordre de grandeur.
- **Unités non observées** : `daily`, `weekly`, `monthly`, `bi-weekly` sont gérées sans avoir été vues dans les 40
  valeurs les plus fréquentes ; les 248 valeurs « autres » restent à inventorier [À vérifier sur la première passe].
- **Offres existantes** : sans ces champs, elles ne changent pas. Elles les recevront si la source les republie ; pas
  de rattrapage en masse dans cette tâche.

## Retour arrière

Colonnes facultatives : cesser de les écrire ramène l'état d'avant. Pour la séniorité, `experienceMois` absent
rend la lecture du texte.
