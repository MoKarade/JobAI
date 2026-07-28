CREATE TABLE "offer_reasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"offer_id" text NOT NULL,
	"ton" text NOT NULL,
	"texte" text NOT NULL,
	"ordre" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "offer_reasons_ton_ck" CHECK ("offer_reasons"."ton" IN ('atout', 'reserve'))
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'seed' NOT NULL,
	"date_reperage" text NOT NULL,
	"entreprise" text NOT NULL,
	"poste" text NOT NULL,
	"lien" text DEFAULT '' NOT NULL,
	"km" real,
	"salaire_affiche" text,
	"priorite" text DEFAULT 'Moyenne' NOT NULL,
	"statut" text DEFAULT 'Identifiee' NOT NULL,
	"date_envoi" text DEFAULT '' NOT NULL,
	"score" integer,
	"score_source" text,
	"notes" text DEFAULT '' NOT NULL,
	"user_note" text DEFAULT '' NOT NULL,
	"histo" boolean DEFAULT false NOT NULL,
	"perimee_le" timestamp with time zone,
	"cree_le" timestamp with time zone DEFAULT now() NOT NULL,
	"maj_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_source_ck" CHECK ("offers"."source" IN ('seed', 'jobbank', 'user')),
	CONSTRAINT "offers_priorite_ck" CHECK ("offers"."priorite" IN ('Haute', 'Moyenne', 'Basse')),
	CONSTRAINT "offers_statut_ck" CHECK ("offers"."statut" IN ('Identifiee', 'CVenvoye', 'Relance', 'Entrevue', 'Refusee', 'Offre')),
	CONSTRAINT "offers_score_source_ck" CHECK ("offers"."score_source" IS NULL OR "offers"."score_source" IN ('manuel', 'calcule')),
	CONSTRAINT "offers_score_bornes_ck" CHECK ("offers"."score" IS NULL OR ("offers"."score" >= 0 AND "offers"."score" <= 100)),
	CONSTRAINT "offers_km_ck" CHECK ("offers"."km" IS NULL OR "offers"."km" >= 0)
);
--> statement-breakpoint
ALTER TABLE "offer_reasons" ADD CONSTRAINT "offer_reasons_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offer_reasons_offer_idx" ON "offer_reasons" USING btree ("offer_id","ordre");--> statement-breakpoint
CREATE INDEX "offers_score_idx" ON "offers" USING btree ("histo","score");--> statement-breakpoint
CREATE INDEX "offers_entreprise_idx" ON "offers" USING btree ("entreprise");