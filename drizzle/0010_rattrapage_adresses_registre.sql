-- RATTRAPAGE : rendre géocodables les adresses que le registre a DÉJÀ inscrites.
--
-- ⚠️ MÊME ERREUR, UNE QUATRIÈME FOIS — ET CETTE FOIS DANS LE COMMIT QUI PORTAIT LA LEÇON.
--
-- Le géocodage par adresse ne retente une entreprise posée au centre-ville qu'après sept
-- jours (`DELAI_RETENTE_POSITION_MS`). Ce délai est calibré sur une question dont la
-- réponse ne change pas — « OpenStreetMap connaît-il cette entreprise ? ». Acquérir une
-- adresse civique CHANGE la question, donc `adressesDepuisRegistre` remet désormais
-- `geocode_le` à l'époque en écrivant l'adresse.
--
-- Mais cette remise à zéro ne vaut que pour les écritures À VENIR. Les quinze adresses
-- déjà inscrites gardaient leur horodatage récent : mesuré en production le 2026-08-05,
-- « precisees=0/0 » — le chemin livré n'avait tout simplement rien à traiter, et n'aurait
-- rien eu pendant une semaine. C'est mot pour mot ce qui est arrivé à `ville`, puis à
-- `adresse`, puis à la colonne `adresse_source` : une règle qui arrive après coup se livre
-- AVEC ce qui rattrape l'existant, jamais « plus tard ».
--
-- POURQUOI UNE MIGRATION PLUTÔT QU'UN CORRECTIF DANS LE CODE
-- Le rattrapage doit s'exécuter UNE fois et ne jamais recommencer, sinon il rouvrirait à
-- chaque passe des lignes que le géocodeur vient de refuser — on remplacerait « ne
-- s'éteint jamais trop tôt » par « ne s'éteint jamais ». Drizzle tient déjà ce registre
-- (`__drizzle_migrations`), et `lib/migrations.ts` l'applique au démarrage sans que Marc
-- ait une commande à taper. Aucun marqueur à inventer, aucun état de plus à tenir.
--
-- CE QU'ELLE NE TOUCHE PAS : les positions exactes (rien à améliorer), et les lignes sans
-- adresse (leur délai de sept jours garde toute sa raison d'être).
UPDATE "entreprises_lieux"
SET "geocode_le" = to_timestamp(0)
WHERE "adresse_source" = 'registre'
  AND "precision" = 'ville';
