CREATE TABLE "entreprises_lieux" (
	"nom" text PRIMARY KEY NOT NULL,
	"lat" real NOT NULL,
	"lon" real NOT NULL,
	"precision" text NOT NULL,
	"geocode_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entreprises_lieux_lat_ck" CHECK ("entreprises_lieux"."lat" >= 45 AND "entreprises_lieux"."lat" <= 49),
	CONSTRAINT "entreprises_lieux_lon_ck" CHECK ("entreprises_lieux"."lon" >= -75 AND "entreprises_lieux"."lon" <= -68),
	CONSTRAINT "entreprises_lieux_precision_ck" CHECK ("entreprises_lieux"."precision" IN ('exacte', 'ville'))
);
