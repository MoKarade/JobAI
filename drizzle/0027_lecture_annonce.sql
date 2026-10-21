CREATE TABLE "lectures_annonce" (
	"offer_id" text PRIMARY KEY NOT NULL,
	"lecture" text NOT NULL,
	"lu_le" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lectures_annonce" ADD CONSTRAINT "lectures_annonce_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;