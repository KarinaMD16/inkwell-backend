-- Listas de lectura: las colecciones que arma cada persona y las historias de cada una.
-- Dos tablas nuevas; no toca ninguna otra.
CREATE TABLE "reading_list_items" (
	"list_id" uuid NOT NULL,
	"story_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_list_items_list_id_story_id_pk" PRIMARY KEY("list_id","story_id")
);
--> statement-breakpoint
ALTER TABLE "reading_list_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reading_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_lists_name_check" CHECK (char_length("reading_lists"."name") between 1 and 60)
);
--> statement-breakpoint
ALTER TABLE "reading_lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reading_list_items" ADD CONSTRAINT "reading_list_items_list_id_reading_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."reading_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_list_items" ADD CONSTRAINT "reading_list_items_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_lists" ADD CONSTRAINT "reading_lists_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reading_list_items_story" ON "reading_list_items" USING btree ("story_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reading_lists_user_name" ON "reading_lists" USING btree ("user_id",lower("name"));