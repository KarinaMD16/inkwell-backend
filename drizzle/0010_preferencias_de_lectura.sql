-- Preferencias del lector (tamaño, letra, interlineado y tema) guardadas en la cuenta, para verlas igual
-- en todos los dispositivos. Tabla nueva: no toca ninguna otra.
CREATE TABLE "reading_prefs" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"size" integer DEFAULT 19 NOT NULL,
	"serif" boolean DEFAULT true NOT NULL,
	"spacing" text DEFAULT 'normal' NOT NULL,
	"theme" text DEFAULT 'claro' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_prefs_size_check" CHECK ("reading_prefs"."size" between 15 and 26),
	CONSTRAINT "reading_prefs_spacing_check" CHECK ("reading_prefs"."spacing" in ('justo', 'normal', 'amplio')),
	CONSTRAINT "reading_prefs_theme_check" CHECK ("reading_prefs"."theme" in ('claro', 'sepia', 'oscuro'))
);
--> statement-breakpoint
ALTER TABLE "reading_prefs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reading_prefs" ADD CONSTRAINT "reading_prefs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;