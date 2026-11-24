CREATE TABLE "story_tags" (
	"story_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "story_tags_story_id_tag_id_pk" PRIMARY KEY("story_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "story_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "title_style" jsonb;--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "words" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "kind" text DEFAULT 'Original' NOT NULL;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "subgenres" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "characters" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "free_tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "license" text DEFAULT 'Todos los derechos reservados' NOT NULL;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "language" text DEFAULT 'es' NOT NULL;--> statement-breakpoint
ALTER TABLE "stories" ADD COLUMN "search_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "story_tags" ADD CONSTRAINT "story_tags_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_tags" ADD CONSTRAINT "story_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "story_tags_tag" ON "story_tags" USING btree ("tag_id","story_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_kind_slug" ON "tags" USING btree ("kind","slug");--> statement-breakpoint
CREATE INDEX "tags_slug_prefix" ON "tags" USING btree ("slug" text_pattern_ops);--> statement-breakpoint
CREATE INDEX "stories_author" ON "stories" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "stories_search" ON "stories" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
-- Lo que sigue pasa los datos que ya existían al modelo nuevo. Con la base vacía no hace nada.
UPDATE "stories" SET "kind" = 'Fanfic' WHERE "fandom" <> 'Original';--> statement-breakpoint
WITH src AS (
	SELECT "id" AS story_id, 'genero' AS kind, "genre" AS name FROM "stories"
	UNION ALL SELECT "id", 'fandom', "fandom" FROM "stories" WHERE "fandom" <> 'Original'
	UNION ALL SELECT "id", 'relacion', "relation" FROM "stories" WHERE "relation" IS NOT NULL
	UNION ALL SELECT "id", 'tropo', unnest("tropes") FROM "stories"
	UNION ALL SELECT "id", 'advertencia', unnest("warnings") FROM "stories"
), named AS (
	SELECT story_id, kind, name, trim(both '-' from regexp_replace(translate(lower(name), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'), '[^a-z0-9]+', '-', 'g')) AS slug FROM src
)
INSERT INTO "tags" ("kind", "slug", "name")
SELECT DISTINCT ON (kind, slug) kind, slug, name FROM named WHERE slug <> '' ORDER BY kind, slug, name;--> statement-breakpoint
WITH src AS (
	SELECT "id" AS story_id, 'genero' AS kind, "genre" AS name FROM "stories"
	UNION ALL SELECT "id", 'fandom', "fandom" FROM "stories" WHERE "fandom" <> 'Original'
	UNION ALL SELECT "id", 'relacion', "relation" FROM "stories" WHERE "relation" IS NOT NULL
	UNION ALL SELECT "id", 'tropo', unnest("tropes") FROM "stories"
	UNION ALL SELECT "id", 'advertencia', unnest("warnings") FROM "stories"
), named AS (
	SELECT story_id, kind, name, trim(both '-' from regexp_replace(translate(lower(name), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'), '[^a-z0-9]+', '-', 'g')) AS slug FROM src
)
INSERT INTO "story_tags" ("story_id", "tag_id")
SELECT named.story_id, "tags"."id" FROM named JOIN "tags" ON "tags"."kind" = named.kind AND "tags"."slug" = named.slug
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "tags" SET "uses" = (
	SELECT count(*) FROM "story_tags" JOIN "stories" ON "stories"."id" = "story_tags"."story_id"
	WHERE "story_tags"."tag_id" = "tags"."id" AND "stories"."published"
);--> statement-breakpoint
UPDATE "stories" SET "search_text" = trim(regexp_replace(translate(lower(concat_ws(' ', "title", "tagline", "genre", nullif("fandom", 'Original'), "relation", array_to_string("tropes", ' '), array_to_string("warnings", ' '))), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'), '[^a-z0-9]+', ' ', 'g'));
