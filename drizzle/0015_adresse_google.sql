-- Une cinquième origine d'adresse : Google Maps Geocoding, en repli de Nominatim.
--
-- POURQUOI ELLE EXISTE
-- [CARTE-03], 2026-08-12. Nominatim (OpenStreetMap) ne reconnaît pas la plupart des PME par
-- leur nom — c'est un service communautaire, pas un annuaire d'entreprises. Le registre du
-- Québec comble une partie du trou, mais une soixantaine d'employeurs suivis restent
-- introuvables des deux côtés. Google Maps Geocoding est nettement meilleur pour reconnaître
-- une raison sociale : c'est son cœur de métier, contrairement à Nominatim.
--
-- POURQUOI ELLE EST À PART, ET NON RANGÉE SOUS « recherche »
-- « recherche » (migration 0014) porte volontairement la mise en garde « à confirmer » : elle
-- vient d'une lecture de page web par un agent, invérifiable au-delà de son URL. Une réponse
-- de Google Maps Geocoding est un résultat STRUCTURÉ d'un géocodeur — de la même nature que
-- `osm`, pas de la même nature qu'une page lue. La confondre avec « recherche » aurait fait
-- porter une mise en garde infondée à une source qui n'en a pas besoin, ou aurait fait
-- perdre la mise en garde de l'autre en les fusionnant sous un label commun.
--
-- ⚠️ NOTE SUR CETTE MIGRATION : `drizzle-kit generate` a proposé de RECRÉER les colonnes
-- `bornes_rapide`/`bornes_tarif` — un faux diff, dû à un trou dans l'historique des snapshots
-- (0012 à 0014 n'ont jamais eu de `meta/NNNN_snapshot.json`, ces migrations ayant été écrites
-- à la main). Ces colonnes existent DÉJÀ en production depuis la migration 0012 ; les
-- réécrire aurait fait échouer le déploiement (« column already exists »). Retirées à la
-- main — seul le changement de contrainte, réellement nouveau, reste ci-dessous.

ALTER TABLE "entreprises_lieux" DROP CONSTRAINT "entreprises_lieux_adresse_source_ck";--> statement-breakpoint
ALTER TABLE "entreprises_lieux" ADD CONSTRAINT "entreprises_lieux_adresse_source_ck" CHECK ("entreprises_lieux"."adresse_source" IN ('osm', 'google', 'registre', 'offre', 'recherche'));
