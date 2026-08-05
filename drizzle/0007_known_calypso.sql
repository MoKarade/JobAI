ALTER TABLE "entreprises_lieux" ADD COLUMN "adresse_source" text;--> statement-breakpoint
-- ⚠️ RENSEIGNER L'EXISTANT AVANT DE POSER LA CONTRAINTE — sinon la migration ÉCHOUE.
--
-- La contrainte exige qu'une adresse ait toujours une source. Or les lignes déjà en base
-- ont une adresse et, à cet instant, pas encore de source : appliquée telle quelle, la
-- migration serait refusée par Postgres sur les données réelles, et le schéma resterait
-- bloqué en production alors que tout passe en local sur une base vide.
--
-- `'osm'` est la bonne valeur, et ce n'est pas une supposition : jusqu'à aujourd'hui, le
-- SEUL chemin qui écrivait `adresse` est le géocodage Nominatim/OpenStreetMap
-- (`rattraperAdresses` et `passeGeocodage`). Aucune autre source n'a jamais alimenté cette
-- colonne.
--
-- C'est la quatrième fois que ce dépôt ajoute une colonne : les trois précédentes
-- (`ville`, `ville` encore, `adresse`) ont toutes été livrées sans ce qui remplissait
-- l'existant, et sont restées vides à vie pour tout ce qui était déjà là. Le rattrapage
-- part avec la colonne, dans le même fichier.
UPDATE "entreprises_lieux" SET "adresse_source" = 'osm' WHERE "adresse" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "entreprises_lieux" ADD CONSTRAINT "entreprises_lieux_adresse_source_ck" CHECK ("entreprises_lieux"."adresse_source" IN ('osm', 'registre'));--> statement-breakpoint
ALTER TABLE "entreprises_lieux" ADD CONSTRAINT "entreprises_lieux_adresse_avec_source_ck" CHECK (("entreprises_lieux"."adresse" IS NULL) = ("entreprises_lieux"."adresse_source" IS NULL));
