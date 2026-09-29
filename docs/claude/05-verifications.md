## 5. Vérifications avant commit

```bash
npm run typecheck && npm run test && npm run lint && npm run build
```

Les quatre sont bloquants, `lint` compris. Jamais `--no-verify`.

La **CI** (`.github/workflows/`) rejoue ce gate. ⚠️ **Sans PR, rien n'affiche un ✗ dans
l'interface** : une CI rouge peut passer inaperçue sur plusieurs commits d'affilée — vécu 4×.
Le push n'est donc pas fini tant que le run n'a pas été **consulté**.

**Les migrations ne se lancent pas à la main.** `npm run db:generate` produit le fichier SQL ;
c'est `lib/migrations.ts` (`assurerMigrations`) qui l'applique **au premier accès aux données**,
une fois par processus, Drizzle arbitrant entre instances via `__drizzle_migrations`. Demande
explicite de Marc le 2026-07-31 : « je veux plus jamais avoir à faire run db migrate, je veux
full auto ». `npm run db:migrate` (`scripts/migrer.ts`) reste là pour appliquer et **prouver**
depuis un poste, pas pour la production. Un échec de migration n'éteint pas l'app : les pages
servent ce que la base a déjà, avec un écran honnête (`lib/panne.ts`) plutôt qu'une page blanche.

