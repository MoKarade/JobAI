ALTER TABLE "entreprises_lieux" DROP CONSTRAINT "entreprises_lieux_lat_ck";--> statement-breakpoint
ALTER TABLE "entreprises_lieux" DROP CONSTRAINT "entreprises_lieux_lon_ck";--> statement-breakpoint
ALTER TABLE "villes" DROP CONSTRAINT "villes_lat_ck";--> statement-breakpoint
ALTER TABLE "villes" DROP CONSTRAINT "villes_lon_ck";--> statement-breakpoint
ALTER TABLE "villes" ADD COLUMN "verifie_le" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "entreprises_lieux" ADD CONSTRAINT "entreprises_lieux_lat_ck" CHECK ("entreprises_lieux"."lat" >= 44.5 AND "entreprises_lieux"."lat" <= 63);--> statement-breakpoint
ALTER TABLE "entreprises_lieux" ADD CONSTRAINT "entreprises_lieux_lon_ck" CHECK ("entreprises_lieux"."lon" >= -80 AND "entreprises_lieux"."lon" <= -56.5);--> statement-breakpoint
ALTER TABLE "villes" ADD CONSTRAINT "villes_lat_ck" CHECK ("villes"."lat" >= 44.5 AND "villes"."lat" <= 63);--> statement-breakpoint
ALTER TABLE "villes" ADD CONSTRAINT "villes_lon_ck" CHECK ("villes"."lon" >= -80 AND "villes"."lon" <= -56.5);