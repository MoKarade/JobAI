CREATE TABLE "villes" (
	"nom" text PRIMARY KEY NOT NULL,
	"lat" real NOT NULL,
	"lon" real NOT NULL,
	"geocode_le" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "villes_lat_ck" CHECK ("villes"."lat" >= 45 AND "villes"."lat" <= 49),
	CONSTRAINT "villes_lon_ck" CHECK ("villes"."lon" >= -75 AND "villes"."lon" <= -68)
);
