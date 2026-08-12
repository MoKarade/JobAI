-- La fiche d'une entreprise, enrichie par Google Places (New) : site, téléphone, horaires.
--
-- POURQUOI ELLE EXISTE
-- [CARTE-03-PLACES], 2026-08-12. Demande de Marc : « enrichir les fiches entreprise ».
--
-- POURQUOI C'EST SCOPÉ AUX ENTREPRISES RÉSOLUES PAR GOOGLE GEOCODING
-- `place_google_id` n'est renseigné QUE quand l'entreprise a été positionnée via le repli
-- Google Maps Geocoding (migration 0015) — Google rend le `place_id` gratuitement dans la
-- même réponse que la position. Une entreprise résolue par Nominatim ou le registre n'a pas
-- ce champ, et ne PEUT PAS être enrichie sans une recherche Places séparée (coût et risque
-- d'homonyme en plus) — un chantier différent, pas fait ici.
--
-- POURQUOI TROIS ÉTATS, COMME LES BORNES DE RECHARGE (migration 0011/0012)
-- `details_le` NULL = jamais interrogé. `details_le` posé + colonnes NULL = interrogé,
-- Google ne publie rien pour ce lieu. `details_le` posé + colonnes remplies = ce que Google
-- publie. Confondre « jamais interrogé » et « rien à publier » ferait passer un lieu non
-- mesuré pour un lieu sans site web — un renseignement faux avec l'aplomb d'un fait
-- (garde-fou n°3).

ALTER TABLE "entreprises_lieux" ADD COLUMN "place_google_id" text;--> statement-breakpoint
ALTER TABLE "entreprises_lieux" ADD COLUMN "site_web" text;--> statement-breakpoint
ALTER TABLE "entreprises_lieux" ADD COLUMN "telephone" text;--> statement-breakpoint
ALTER TABLE "entreprises_lieux" ADD COLUMN "horaires_google" text[];--> statement-breakpoint
ALTER TABLE "entreprises_lieux" ADD COLUMN "details_le" timestamp with time zone;