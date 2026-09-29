## 11. Protocole de précision (toute modification de la NOTATION ou du MATCHING)

La note de fit est le cœur du produit : elle décide ce que Marc regarde en premier.
Toute modification de `lib/scoring.ts` ou de la logique de matching offre↔profil exige :

1. **ADR d'abord** — problème, impact coût LLM estimé, risques, méthode de test. Aucune
   ligne de code avant l'ADR.
2. **Audit sur du réel** — exécuter la nouvelle logique sur **TOUTES les offres du seed**
   (`SEED.length`, 53 au 2026-08-20 — ⚠️ ne PAS recopier le compte ici : il a déjà dérivé de
   38 à 53, et un nombre périmé dans un protocole le fait sous-spécifier en silence, l'audit
   se croyant complet sur un préfixe) et rendre le tableau
   [entreprise | poste | note avant | note après | écart] **avant** de modifier le pipeline.
   Prouver sur du réel, jamais sur 2-3 cas choisis.
3. **Non-régression** — les offres à note manuelle font foi : une note calculée qui dépasse
   une note vérifiée à la main est un bug (plafond 85).
4. **Fonctions pures + revue flotte** — logique isolée des I/O, testable, revue avant merge.
