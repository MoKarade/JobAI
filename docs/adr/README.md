# Décisions d'architecture (ADR)

Une décision structurante = un fichier `NNNN-slug.md`, numéroté à la suite, jamais réécrit
après acceptation (on en publie un nouveau qui remplace l'ancien).

**Statuts** : `Proposé` · `Accepté` · `Remplacé par ADR-NNNN` · `Abandonné`.

> **Accepté ≠ Implémenté.** Un ADR fixe la décision ; l'avancement vit dans `BACKLOG.md`
> et l'état courant dans `HANDOVER.md`. Ne jamais déduire d'un ADR accepté que le code existe.

**Sections attendues** : Contexte · Décision · Impact quotas/coût · Analyse de risques ·
Méthode de test · Conséquences (positif / négatif / risques acceptés) · Alternatives rejetées
(avec le pourquoi du rejet) · Réversibilité.

| ADR | Titre | Statut |
|---|---|---|
| [0001](./0001-fondations-jobai.md) | Fondations de JobAI (identité, stack, phases, périmètre) | Accepté |
