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
| [0001](./0001-fondations-jobai.md) | Fondations de JobAI (identité, stack, phases, périmètre) | Accepté — volet workflow git modifié par ADR-0002 |
| [0002](./0002-developpement-direct-sur-main.md) | Développement direct sur `main`, sans branche ni PR | Accepté |
| [0003](./0003-direction-visuelle.md) | Direction visuelle : densité FinanceAI, accent ambre conservé | Accepté |
| [0004](./0004-carte-google-maps.md) | Carte Google Maps : entreprises précises, domicile affiché, trajets | Annulé le jour même |
| [0005](./0005-precision-de-la-veille.md) | Précision de la veille | Révisé (3 conclusions sur 4 réfutées par la mesure) |
| [0006](./0006-variantes-de-raison-sociale.md) | Dédoublonner malgré les variantes de raison sociale | Accepté |
| [0007](./0007-google-maps-geocoding-repli.md) | Google Maps Geocoding, en repli étroit de Nominatim | Accepté |
| [0008](./0008-poste-de-nuit.md) | « Poste de nuit » : le sombre en identité, l'épure cesse d'être une soustraction | Accepté — supersède la direction du 2026-08-05 ; ADR-0003 tient sur l'ambre |
