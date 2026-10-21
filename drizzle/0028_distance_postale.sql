ALTER TABLE "offers" ADD COLUMN "km_source" text;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "code_postal" text;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_km_source_ck" CHECK ("offers"."km_source" IS NULL OR ("offers"."km_source" = 'postale' AND "offers"."km" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_code_postal_ck" CHECK ("offers"."code_postal" IS NULL OR "offers"."code_postal" ~ '^[A-Z][0-9][A-Z]$');