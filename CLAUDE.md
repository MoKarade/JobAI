# CLAUDE.md — JobAI

<!-- Court exprès (modèle MemoryAI/CarAI). Le texte complet de l'ancien fichier est dans docs/claude/ ; « CLAUDE.md §N » dans le code = docs/claude/NN-*.md (table : docs/correspondance.md). -->

## Contexte
- **JobAI** suit la recherche d'emploi de Marc (région de Québec) : offres notées selon son profil, statuts de candidature, réponses de recruteurs, aide IA (analyse d'offres, CV/lettres).
- Stack : Next.js 15 (App Router, Server Actions) · Neon + Drizzle · Auth.js v5 (`providers: []`, session du hub) · Anthropic SDK · Zod · vitest.
- Déploiement : Vercel sur `emploi.hubperso.com`. Dépôt **PUBLIC**, branche par défaut `main`. Widget hub : `GET /api/hub/summary`.
- État : `HANDOVER.md` (à lire en premier) ; plan : `BACKLOG.md` ; décisions : `docs/adr/`. Marc valide, il ne code pas.

## Commandes
- `npm run dev` · `npm run db:generate` (SQL de migration ; application auto par `lib/migrations.ts`) · `/review` · `/lesson` · `/handover`.
- Gate avant CHAQUE commit, les quatre bloquants : `npm run typecheck && npm run test && npm run lint && npm run build`. Jamais `--no-verify`, jamais derrière un `| grep`.

## Les six garde-fous JobAI (détail : `docs/claude/01-principes.md`)
1. **Dépôt public : aucune donnée personnelle**, jamais (domicile, statut migratoire, refus, noms de tiers). Verrou : `tests/piiGuard.test.ts` ; annonce ingérée → `expurgerPII`.
2. **Le suivi appartient à Marc** : `statut`, `prio`, `dateEnvoi`, `userNote` écrits seulement par `lib/suivi.ts`, sur geste de Marc.
3. **No fake data** : métrique non mesurée → `status:"building"` ou `—` ; offre incertaine = périmée ; note calculée plafonnée à 85.
4. **Aucun scraping** : sources publiques officielles et API officielles seulement ; ADR avant toute nouvelle source.
5. **Échec fermé, server-side only** : jetons et LLM côté serveur ; chaque Server Action appelle `requireSession` ; jamais de secret en dur.
6. **Texte non maîtrisé** (offre, courriel) → `sanitizePromptText` + balisage ; le LLM propose, Zod valide, Marc confirme.
- Notation/matching : protocole de précision d'abord (`docs/claude/11-protocole.md`). Migrations : jamais `db:migrate` en production (`docs/claude/05-verifications.md`).

## Git et CI
- Direct sur `main` depuis un poste ; session distante : `claude/<slug>` + PR draft ; agence : `agence/<session>/<sujet>`. `--base main` explicite. Jamais `--force`, retour arrière = `git revert`.
- Un push n'est fini que quand la CI a été CONSULTÉE ; changement servi : vérifier le déploiement Vercel `READY` (`docs/claude/06-deploiement.md`). Un check requis n'a JAMAIS de `paths:`.
- Commits, code, docs et UI en français ; commit préfixé par l'ID du backlog (`[V1-03] …`). Pas d'emoji dans l'UI ni les commits.

## Pour aller plus loin (à lire seulement si nécessaire)
- Anciens titres -> chemins : `docs/correspondance.md`. Sections : `docs/claude/` (`01-principes`, `02-conventions`, `03-workflow-git`, `04-commandes`, `05-verifications`, `06-deploiement`, `07-hub`, `08-documentation`, `10-style-compte-rendu`, `11-protocole`).
- Leçons apprises (175 règles durables) : `docs/claude/lecons.md` ; leurs histoires : `docs/LESSONS.md`. Compte-rendu : `docs/COMPTE-RENDU.md`.
