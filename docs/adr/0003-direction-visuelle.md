# ADR-0003 — Direction visuelle : densité FinanceAI, accent ambre conservé

- **Statut** : accepté
- **Date** : 2026-07-28
- **Décideur** : Marc

## Contexte

Juste après la mise en ligne, Marc a demandé « améliorer affichage, page accueil, meilleur
UI un peu comme FinanceAI ». Deux identités visuelles étaient en présence :

- **FinanceAI** — sobre, dense, hiérarchie nette, navigation par onglets. C'est l'app que
  Marc utilise le plus, donc celle dont les habitudes sont déjà acquises.
- **JobAI** — identité terminal/ambre héritée de l'artifact `tracker-emploi-v4.html` :
  accent `#f2a31b`, chiffres en monospace, bordure gauche colorée par palier. **Cette ambre
  n'est pas décorative** : c'est `app.color` publié au hub, elle identifie JobAI parmi les
  autres widgets de `hubperso.com`.

Le risque, écrit au backlog avant de coder : mélanger les deux au jugé donnerait un résultat
bâtard — ni la sobriété de l'une, ni le caractère de l'autre.

## Décision

**Adopter la langue de MISE EN PAGE de FinanceAI, garder la COULEUR de JobAI.**

Concrètement :

1. **Navigation par onglets**, et par de vraies **routes** (`/`, `/references`, plus tard
   `/carte`) — pas un état client. Chaque onglet a une URL : il se met en signet, le bouton
   Retour fonctionne, et la page ne charge que ce qu'elle affiche.
2. **La page d'accueil cesse d'être un mur.** Le barème, les entreprises cibles, les
   salaires du marché et le SWOT partent sous `/references` : ce sont des documents qu'on
   consulte, pas des choses qu'on fait.
3. **Densité et hiérarchie** : échelle d'espacement unique, tuiles de compteurs plus
   compactes, une seule graisse de titre par niveau.
4. **L'ambre reste l'accent**, et reste réservée : accent de marque et signal d'action, pas
   décoration de surface.

Ce n'est pas un mélange d'identités : une langue de mise en page et une couleur de marque
sont deux choses séparables. On emprunte la première, on garde la seconde.

## Pourquoi

- Marc utilise FinanceAI quotidiennement ; réutiliser sa grammaire (onglets, tuiles,
  hiérarchie) rend JobAI immédiatement lisible sans rien réapprendre.
- Converger **complètement** vers FinanceAI aurait effacé l'ambre — donc désaccordé le
  widget du hub, qui identifie l'app par cette couleur. Un détail qui se paie ailleurs.
- Ne rien changer et « juste soigner » n'aurait pas réglé le vrai problème signalé : la
  page d'accueil est un mur où tout est empilé au même niveau.

## Conséquences

- `/` ne porte plus que ce qui appelle une ACTION : à faire, compteurs, ajout, liste.
- Les pages sous onglets partagent un cadre commun (`components/Cadre.tsx`) ; la page de
  connexion ne l'utilise pas — elle est hors session, elle n'a aucun onglet à proposer.
- L'ambre est verrouillée par le contrat hub : la changer imposerait de re-pinner l'identité
  publiée (`app.color`) et de vérifier le rendu du widget. Ce n'est plus un choix de CSS.

## Alternatives rejetées

- **Converger complètement vers FinanceAI** — désaccorde le widget du hub, et fait perdre
  ce qui distingue l'app d'un gabarit.
- **Garder l'identité terminal et se contenter de peaufiner** — ne règle pas la page
  d'accueil, qui est le point de départ de la demande.
- **Onglets en état client plutôt qu'en routes** — casse le bouton Retour, empêche la mise
  en signet, et oblige à charger toutes les sections pour n'en montrer qu'une.
