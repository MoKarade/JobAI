## 2. Conventions de code

- **Langue** : code, commentaires, commits et docs **en français**. UI en français.
- **TypeScript strict** + `noUncheckedIndexedAccess`. Pas de `any` silencieux.
- **Fonctions pures testées** : la logique (notation, fusion, agrégation, résumé hub) vit
  hors des I/O et des composants. C'est ce qui rend le reste testable.
- **Erreurs honnêtes** : jamais de `catch` qui avale. Un échec de plateforme (429, crédit
  épuisé, quota Gmail) se distingue d'un échec métier et ne s'impute jamais à l'item.
- **Pas d'emoji** dans l'UI produit ni dans les commits. Tolérés comme marqueurs de statut
  dans `BACKLOG.md` et `HANDOVER.md` uniquement.
- **Discipline de scope** : on livre par phases (voir `BACKLOG.md`). Ne pas anticiper.
- **Un seul thème, le sombre** (ADR-0008, révision du 13/08/2026 : le clair a été retiré ; c'est une
  décision de Marc, pas un oubli de `prefers-color-scheme`). Les couleurs vivent en variables dans
  `app/globals.css` (noms du socle commun : `--fond`, `--surface`, `--surface-douce`, `--bordure`,
  `--bordure-champ`, `--texte`, `--texte-doux`, `--accent`, `--sur-accent`, `--repere`…) et nulle part
  ailleurs : ni littéral de couleur dans un composant, ni hors du bloc `:root` du CSS. `--accent` est
  réservé à l'action principale. Cibles tactiles >= 44 px, champs à 16 px. Verrou : `tests/theme.test.ts`
  (paires de contraste WCAG comprises). `.carte`, `.pastille` et `.etiquette` gardent leur sens JobAI
  (offre, statut) ; le second bouton du socle est `.bouton--discret`.
