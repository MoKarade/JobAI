## 4. Commandes utiles

- `npm run dev` · `npm run typecheck` · `npm run test` · `npm run build` · `npm run lint`
- `npm run db:generate` — produit le SQL de migration. **L'application est automatique** au
  premier accès aux données (`lib/migrations.ts`) ; `db:migrate` ne sert qu'à forcer et prouver
  depuis un poste (voir §5).
- `/review` — panel d'agents sur le diff courant · `/lesson "…"` — consigne une leçon
- `/handover` — régénère `HANDOVER.md` à partir de l'état réel

