# ADR-0028 — La revue du CV coche d'avance ce qui a une preuve

**Date** : 2026-10-16 · **Statut** : Proposé — tâche JobAI#156 (mission JobAI#147, plan « analyse du CV et dossier
employeur », étape A3). **Amende** l'ADR-0009 (point 2 des arbitrages et partis pris de l'écran de revue), avec l'accord
de Marc donné dans le fil JobAI le 16/10/2026.

## Contexte

L'ADR-0009 voulait « rien de coché d'avance » : un geste par écart, pour que la revue ne devienne pas un accusé de
réception. Depuis l'ADR-0027, le principal fait du CV (les années d'expérience) se calcule en code, avec son détail
ligne par ligne : le cocher à la main revient à confirmer un calcul que Marc peut refaire. Valider écart par écart est
devenu lourd pour ce qui n'a pas besoin de jugement.

## Décision

Un écart est coché d'avance si, et seulement si, `Ecart.preuve` est vrai. `calculerEcarts` le décide ; l'écran ne
décide rien.

`preuve` est vrai quand les trois conditions tiennent : l'écart est un **fait** (pas une conséquence sur le barème), sa
valeur proposée est **établie** (pas « non établi »), et sa **provenance est non vide** (une source qui se lit à l'écran).

Aujourd'hui, un seul écart y répond : « Années d'expérience » (détail du calcul comme source). Les autres restent
décochés, et Marc les coche lui-même :
- les listes (langues, diplômes, outils, postes) et le parcours : aucune source citée ;
- toute **conséquence** (barème de séniorité, termes de veille, vocabulaire technique, analyse de position) : c'est une
  déduction du code, pas une lecture du CV — elle modifie les notes, donc elle demande un geste ;
- un « non établi » proposé à la place d'une valeur existante : il effacerait ce que le profil sait déjà.

> **Amendé par ADR-0033 (JobAI#155)** : la fiche de compétences est un fait avec preuve (chaque ligne cite sa phrase et
> son poste, retrouvés dans le texte du CV) : elle est cochée d'avance, comme les années. Et l'écart « vocabulaire
> technique du barème » n'existe plus : les outils du CV n'entrent plus dans `motsTechnique`.

Un seul bouton « Appliquer N changements » valide ; les cases cochées d'avance sont marquées « source citée » pour dire
pourquoi. Le compteur et le texte du pied de l'écran restent exacts quand tout est décoché.

## Ce qui ne change pas (ADR-0009)

- Rien ne s'applique avant « Appliquer » ; une note posée à la main n'est jamais recalculée.
- Faits et conséquences restent séparés visuellement ; une provenance absente se dit en toutes lettres.
- Une liste vide proposée n'efface rien ; le SWOT s'enrichit, il ne se régénère pas.

## Alternatives rejetées

- **Tout cocher d'avance** : redevient un accusé de réception, et fait passer une modification du barème sous couvert
  de confirmer une date.
- **Cocher aussi la conséquence du fait coché** (barème de séniorité) : c'est exactement le cas où la validation d'un fait
  déplace toutes les notes. Marc le coche, ou non.
- **Citer une source inventée pour les listes** afin de les cocher : une source qui n'en est pas une est du faux
  contenu (garde-fou n°3). Elles se cocheront le jour où l'extraction cite réellement leur emplacement.

## Conséquences

- Le geste minimal pour valider un CV dont les dates sont lisibles : relire le détail des années, cliquer « Appliquer ».
- Un nouveau CV ouvre un écran neuf (clé = identifiant du CV) : les cases ne se transmettent pas d'une analyse à l'autre.
- Rien d'autre qu'un champ booléen dans `Ecart` et une fonction pure, `retenusParDefaut`.

## Preuve attendue

Marc ouvre l'écran « À valider » après une analyse : les années sont cochées avec « source citée », le reste est
décoché, un clic sur « Appliquer » suffit.
