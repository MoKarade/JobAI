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
| [0008](./0008-poste-de-nuit.md) | « Poste de nuit » : le sombre en identité, l'épure cesse d'être une soustraction | Accepté — révisé le jour même (thème clair retiré) ; supersède la direction du 2026-08-05 ; ADR-0003 tient sur l'ambre |
| [0009](./0009-profil-pilote-par-le-cv.md) | Le profil sort du code, et le CV le remplit | Accepté — retire `[V3-00]` (CV via Google Drive) |
| [0010](./0010-sources-lues-par-lapp.md) | Lire les offres depuis l'app : sources candidates, mesure d'accès, extraction | Accepté (Marc, 2026-08-19) — sonde livrée ; aucune ingestion ouverte |
| [0011](./0011-connecteur-mcp-claude-ai.md) | Un connecteur MCP pour claude.ai, avec écriture | Accepté (Marc, 2026-08-19) |
| [0012](./0012-tri-par-code-de-profession.md) | Trier le flux du Guichet par le code de profession (NOC 2021) | Proposé — décision Marc « go pour le tri par noc2021 » (2026-08-19) ; volet « filtre, pas note » révisé par ADR-0013 |
| [0013](./0013-le-domaine-pondere-la-note.md) | Le domaine pondère la note, et le flux entre en entier | Proposé — décisions Marc du 2026-08-20 |
