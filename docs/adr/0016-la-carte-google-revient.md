# ADR-0016 — La carte Google revient, et le domicile avec elle

**Statut** : Proposé — décisions de Marc du 2026-08-20
**Ressuscite** : ADR-0004, accepté puis ANNULÉ par Marc quelques heures plus tard le
2026-07-29. Les trois raisons de l'annulation sont levées une par une, ci-dessous.
**Révise** : le garde-fou n°1 du `CLAUDE.md`, pour la seconde fois.

## Pourquoi ADR-0004 avait été annulé, et ce qui change

| Raison de l'annulation (2026-07-29) | Décision du 2026-08-20 |
|---|---|
| Facturation Google obligatoire vs « zéro abonnement » | **Facturation activée.** Alerte de budget à 1 $, usage perso très sous les quotas gratuits |
| Le domicile ne devait pas atteindre le navigateur | **Il l'atteint.** La carte est derrière un login mono-adresse : le « client », c'est Marc |
| Le lien `maps/dir/?api=1` suffisait au besoin | Il ne suffit plus : Marc veut le tracé ET la durée **dans** l'app |

⚠️ **Cet ADR ne « corrige » pas une erreur : il enregistre un changement d'avis.** Le lien
externe reste la bonne solution pour qui refuse la facturation, et il RESTE en place comme
repli quand les clés sont absentes. Ce que Marc achète ici, c'est le tracé et la durée sans
quitter l'app ; ce qu'il paie, c'est un compte de facturation et ses coordonnées qui
atteignent Google.

## Garde-fou n°1, troisième version

**Ce qui reste absolu, et ne se négociera pas :** aucune coordonnée du domicile ni d'un lieu
personnel dans un fichier VERSIONNÉ (variables d'environnement et base uniquement,
`tests/piiGuard.test.ts` inchangé), et aucune donnée de localisation servie à une requête
NON AUTHENTIFIÉE.

**Ce qui change :** la page carte, derrière la session mono-adresse, peut afficher le
domicile et l'utiliser comme origine des trajets.

⚠️ **La différence entre les deux est le seul point qui compte.** « Le domicile ne sort
jamais » protégeait deux choses très différentes — le dépôt public, et le navigateur de
Marc. La première protection est un invariant ; la seconde était une politique, et Marc la
change. Écrire les deux dans la même phrase les a fait tomber ensemble en 2026-07-29 puis
remonter ensemble aujourd'hui, alors qu'une seule aurait dû bouger.

## Décisions

### D1 — Fond Google Maps, deux clés, deux périmètres

`@vis.gl/react-google-maps`. Une clé **CLIENT** (chargement de la carte JS, restreinte au
domaine) et une clé **SERVEUR** (Places + Routes, jamais envoyée au navigateur). Une clé
unique ferait porter les droits serveur par une valeur lisible dans la page.

⚠️ **ÉCHEC FERMÉ ET REPLI DIT.** Clés absentes ⇒ la carte retombe sur Leaflet et le lien
externe, en le DISANT à l'écran. Une carte grise sans explication serait indiscernable
d'une panne.

### D2 — Le domicile s'affiche et sert d'origine

Épingle distincte, coordonnées depuis `DOMICILE_LAT`/`DOMICILE_LON`. Les durées de trajet
sont calculées **côté serveur** (Routes API) et **mises en cache en base** — jamais un appel
par affichage, sinon la facture suit le nombre de fois où Marc ouvre la page.

### D3 — Les positions approximatives sont VISIBLES et DITES

`filtrerAdresseConnue` masque aujourd'hui toute entreprise sans adresse exacte. Elles
apparaissent désormais avec une **épingle distincte** et la mention « position
approximative ».

⚠️ C'est la règle que ce dépôt tient partout ailleurs : une donnée incertaine se montre ET
se nomme. Les afficher comme les autres ferait passer un centre-ville pour une usine ; les
cacher fait croire que l'offre n'existe pas.

### D4 — Ce que la carte gagne, dans cet ordre

1. **Filtres**, identiques à ceux de l'accueil, appliqués aux épingles. C'est le plus utile
   et le moins risqué : aucune API, une règle de filtrage déjà écrite et testée.
2. **Rayons de trajet** (15 / 30 / 50 min) depuis le domicile. ⚠️ En MINUTES, pas en
   kilomètres : un rayon kilométrique est un cercle, un rayon de trajet est une forme — et
   c'est la seconde qui décide si Marc postule.
3. **Tournée multi-entreprises** : enchaîner plusieurs employeurs en un trajet.
4. **Densité des bonnes offres** : où se concentrent les offres bien notées.

L'ordre est une décision, pas une liste de souhaits : chaque étage suppose le précédent, et
les deux derniers coûtent des appels Routes que le cache doit absorber avant qu'on les ouvre.

## Impact quotas et coût

**C'est le point sensible de cet ADR.** Places et Routes sont facturés à l'appel. Le cache
en base est donc une contrainte de COÛT, pas une optimisation : sans lui, une tournée
recalculée à chaque affichage multiplie les appels par le nombre de visites.

Plafond de sûreté : un compteur d'appels Routes par jour, avec un refus DIT quand il est
atteint. La même discipline que le frein LLM — un filet anti-emballement qui ne se
désactive jamais.

## Analyse de risques

| # | Risque | Traitement |
|---|---|---|
| R1 | Une clé serveur fuit vers le navigateur | Deux clés, deux périmètres ; test qui refuse la clé serveur dans un composant client |
| R2 | La facture dérive | Cache en base, compteur d'appels/jour avec refus dit, alerte de budget à 1 $ côté Google |
| R3 | Le domicile atterrit dans un fichier versionné | `tests/piiGuard.test.ts` inchangé, et il est le mur |
| R4 | Les clés manquent en production | Repli Leaflet + lien externe, DIT à l'écran |
| R5 | Une position approximative est prise pour exacte | D3 : épingle distincte et mention |

## Méthode de test

1. **Fonctions pures** pour le regroupement, le cache et les rayons — testables sans réseau.
2. **Aucun appel réseau en test** : les clients Google sont injectés.
3. **Test de fuite de clé** : la clé serveur ne doit apparaître dans aucun module client.
4. **Repli sans clé** : la page rend, et dit pourquoi elle est dégradée.

## Ce que Marc doit faire, et que je ne peux pas faire

1. Créer le compte de facturation Google Cloud et l'alerte de budget à 1 $.
2. Créer les DEUX clés (client restreinte au domaine, serveur restreinte aux API).
3. Les poser en variables d'environnement Vercel, avec `DOMICILE_LAT` / `DOMICILE_LON`.

Tant que ce n'est pas fait, le code se construit et se teste, mais la carte reste sur son
repli — et elle le dit.

## Alternatives rejetées

- **Rester sur le lien externe** (l'état actuel) : ne donne ni tracé ni durée dans l'app.
  C'était le bon choix sous « zéro facturation » ; Marc lève cette contrainte.
- **MapLibre + routage libre** : gratuit, mais les coordonnées du domicile partiraient vers
  un service tiers non contrôlé — ou exigeraient de l'auto-héberger, un chantier plus lourd
  que la facturation qu'il évite.
- **Rayons en kilomètres** : un cercle ne dit rien d'un trajet réel. Voir D4.

## Réversibilité

Retirer les clés d'environnement suffit à retomber sur Leaflet et le lien externe : le repli
de D1 n'est pas un mode dégradé accidentel, c'est le chemin d'annulation.
