-- Novedades: qué avisos quiere cada persona y hasta cuándo los leyó. Tabla nueva; no toca ninguna otra.
CREATE TABLE "notification_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"chapters" boolean DEFAULT true NOT NULL,
	"replies" boolean DEFAULT true NOT NULL,
	"followers" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_prefs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;