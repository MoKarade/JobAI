---
description: Passe le diff courant à la flotte d'agents de JobAI
allowed-tools: Bash(git diff:*), Bash(git status:*), Bash(git log:*)
---

Passe le diff courant au crible de la flotte.

État courant :
!`git status --short`

Diff :
!`git diff HEAD`

## Procédure

1. **Toujours**, en parallèle : `gardien-des-garde-fous`, `code-reviewer`,
   `chasseur-de-pannes-muettes`.
2. **Selon les fichiers touchés** :
   - un composant, une page, `app/globals.css` → `auditeur-accessibilite` ;
   - quelque chose de livré (une tâche du backlog avance) → `gardien-des-documents`.
3. Agrège en une synthèse : 🔴 bloquant / 🟠 à corriger / 🟡 suggestion, chacun avec
   `fichier:ligne` et la correction concrète.
4. Verdict global : **prêt à committer** ou **corrections requises**.

## Règles de lecture des retours

- **Une violation d'un garde-fou de `CLAUDE.md` §1 est bloquante**, quelle que soit la
  qualité du reste. Elle ne se nuance pas.
- **Un finding est une HYPOTHÈSE**, pas un fait. Vérifie le vrai code avant de coder un
  correctif — un mauvais correctif coûte plus cher que le finding non corrigé.
- **Entre deux agents qui se contredisent, celui qui a MESURÉ l'emporte** sur celui qui a
  déduit de la structure du code.
- Le gate déterministe (`typecheck`, `test`, `lint`, `build`) reste obligatoire après la
  revue : la flotte ne le remplace pas.
