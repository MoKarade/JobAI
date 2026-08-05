#!/usr/bin/env bash
# scripts/build-necessaire.sh — ce commit change-t-il ce que le site SERT ?
#
# ⚠️ CONVENTION VERCEL, ET ELLE EST CONTRE-INTUITIVE : sortir avec 0 IGNORE le build,
# sortir avec 1 le LANCE. Codée à l'envers, cette logique n'empêcherait pas un déploiement
# de trop — elle les empêcherait TOUS, en silence, et la production se figerait sur un
# commit ancien pendant qu'on croit livrer. C'est vérifié dans la documentation avant
# d'écrire ce fichier, pas supposé.
#
# POURQUOI IL EXISTE
# Le 2026-08-05, douze commits en deux heures ont produit douze déploiements de production,
# jusqu'à épuiser le quota du compte — et plusieurs ne touchaient QUE des `.md` et des
# tests, c'est-à-dire rien de ce que le site sert. Un quota est une ressource partagée
# entre les six projets de Marc : le gaspiller ici, c'est bloquer les autres.
#
# CE QU'IL NE FAIT JAMAIS : sauter un build par erreur. Toute incertitude — historique
# tronqué, commande qui échoue, diff illisible — se résout en LANÇANT le build. Un build de
# trop coûte une minute ; un build sauté à tort fige la production sans rien dire, et c'est
# exactement la panne qu'on ne diagnostique pas (« CI verte, site à jour » — sauf que non).

set -uo pipefail

lancer() { echo "build : $1"; exit 1; }
ignorer() { echo "build ignoré : $1"; exit 0; }

# Sans parent, on ne peut pas comparer. Le clone de Vercel est superficiel : ce cas est
# normal, pas une anomalie — et il se résout en construisant.
git rev-parse --verify HEAD^ >/dev/null 2>&1 || lancer "pas d'historique pour comparer"

FICHIERS=$(git diff --name-only HEAD^ HEAD) || lancer "diff illisible"
[ -n "$FICHIERS" ] || lancer "aucun fichier lisible dans le diff"

# Ce qui ne peut PAS changer ce que le site sert. Tout le reste construit — y compris ce
# qu'on n'a pas prévu, ce qui est le point : la liste des exemptions est FERMÉE, la liste
# de ce qui construit est ouverte.
while IFS= read -r f; do
  case "$f" in
    *.md) ;;
    docs/*) ;;
    tests/*) ;;
    .github/*) ;;
    *) lancer "$f" ;;
  esac
done <<< "$FICHIERS"

ignorer "documentation et tests uniquement"
