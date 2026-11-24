ALTER TABLE "profiles" ADD COLUMN "link" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "banner_url" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "birthdate" date;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;