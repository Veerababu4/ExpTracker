CREATE TYPE "public"."payment_mode" AS ENUM('CASH', 'UPI', 'CARD', 'NET_BANKING', 'OTHER');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"name" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 1000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"expense_date" date NOT NULL,
	"amount_paise" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"category_id" uuid,
	"payment_mode" "payment_mode",
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone,
	"deleted_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "expenses_amount_range" CHECK ("expenses"."amount_paise" between 100 and 100000000),
	CONSTRAINT "expenses_currency_inr" CHECK ("expenses"."currency" = 'INR'),
	CONSTRAINT "expenses_note_length" CHECK (char_length("expenses"."note") <= 200)
);
--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "high_alert_paise" bigint;--> statement-breakpoint
ALTER TABLE "family_members" ADD COLUMN "very_high_alert_paise" bigint;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_family_name" ON "categories" USING btree ("family_id",lower("name"));--> statement-breakpoint
CREATE INDEX "expenses_family_date" ON "expenses" USING btree ("family_id","expense_date") WHERE "expenses"."deleted_at" is null;
--> statement-breakpoint
-- Families created before M3 get the default categories (new families get them when created).
INSERT INTO "categories" ("family_id", "name", "sort_order")
SELECT f."id", c.name, c.sort_order FROM "families" f
CROSS JOIN (VALUES ('Groceries', 10), ('Vegetables & fruits', 20), ('Milk & dairy', 30), ('Subscriptions', 40), ('Health & medicines', 50), ('Online shopping', 60), ('Utilities (power, water, gas)', 70), ('Mobile & internet', 80), ('Rent / EMI', 90), ('Fuel & transport', 100), ('Education', 110), ('Dining out', 120), ('Household & repairs', 130), ('Personal care', 140), ('Gifts & festivals', 150), ('Travel', 160), ('Other', 170)) AS c(name, sort_order);
