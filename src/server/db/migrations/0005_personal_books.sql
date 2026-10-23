CREATE TYPE "public"."book_kind" AS ENUM('FAMILY', 'PERSONAL');--> statement-breakpoint
CREATE TABLE "expense_sharing" (
	"user_id" uuid NOT NULL,
	"from_month" date NOT NULL,
	"family_id" uuid,
	"set_by" uuid,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_sharing_user_id_from_month_pk" PRIMARY KEY("user_id","from_month"),
	CONSTRAINT "expense_sharing_first_of_month" CHECK (extract(day from "expense_sharing"."from_month") = 1)
);
--> statement-breakpoint
ALTER TABLE "families" ALTER COLUMN "join_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "kind" "book_kind" DEFAULT 'FAMILY' NOT NULL;--> statement-breakpoint
ALTER TABLE "join_requests" ADD COLUMN "include_expenses" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_sharing" ADD CONSTRAINT "expense_sharing_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_sharing" ADD CONSTRAINT "expense_sharing_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_sharing" ADD CONSTRAINT "expense_sharing_set_by_users_id_fk" FOREIGN KEY ("set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "families_one_personal" ON "families" USING btree ("created_by") WHERE "families"."kind" = 'PERSONAL';--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_join_code_kind" CHECK (("families"."kind" = 'FAMILY') = ("families"."join_code" is not null));--> statement-breakpoint
-- M8 data (DESIGN §3.8 P1): every existing user gets a personal book "My expenses" — owner as HEAD, the default categories.
INSERT INTO "families" ("name", "kind", "created_by")
SELECT 'My expenses', 'PERSONAL', u."id" FROM "users" u
WHERE NOT EXISTS (SELECT 1 FROM "families" f WHERE f."created_by" = u."id" AND f."kind" = 'PERSONAL');--> statement-breakpoint
INSERT INTO "family_members" ("family_id", "user_id", "role")
SELECT f."id", f."created_by", 'HEAD' FROM "families" f WHERE f."kind" = 'PERSONAL'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "categories" ("family_id", "name", "sort_order")
SELECT f."id", d."name", d."n" * 10
FROM "families" f
CROSS JOIN (VALUES ('Groceries', 1), ('Vegetables & fruits', 2), ('Milk & dairy', 3), ('Subscriptions', 4),
  ('Health & medicines', 5), ('Online shopping', 6), ('Utilities (power, water, gas)', 7), ('Mobile & internet', 8),
  ('Rent / EMI', 9), ('Fuel & transport', 10), ('Education', 11), ('Dining out', 12), ('Household & repairs', 13),
  ('Personal care', 14), ('Gifts & festivals', 15), ('Travel', 16), ('Other', 17)) AS d("name", "n")
WHERE f."kind" = 'PERSONAL'
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- M8 go-live (P9): everyone starts personal only from the month this runs in (India time). That month's live family
-- expenses move to their owner's personal book; earlier months stay in the family. Run it right after the merge.
CREATE TEMPORARY TABLE "m8_moves" AS
SELECT e."id" AS "expense_id", e."family_id" AS "from_id", p."id" AS "to_id", e."owner_id", c."name" AS "category_name"
FROM "expenses" e
JOIN "families" fam ON fam."id" = e."family_id" AND fam."kind" = 'FAMILY'
JOIN "families" p ON p."created_by" = e."owner_id" AND p."kind" = 'PERSONAL'
LEFT JOIN "categories" c ON c."id" = e."category_id"
WHERE e."deleted_at" IS NULL
  AND e."expense_date" >= date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date;--> statement-breakpoint
-- A family category the personal book doesn't have is copied into it (the book is the owner's own).
INSERT INTO "categories" ("family_id", "name", "sort_order")
SELECT DISTINCT ON (m."to_id", lower(m."category_name")) m."to_id", m."category_name", 1000
FROM "m8_moves" m WHERE m."category_name" IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "audit_log" ("family_id", "actor_id", "action", "entity_type", "entity_id", "details")
SELECT b."book", NULL, 'EXPENSE_MOVED', 'expense', m."expense_id"::text,
  jsonb_build_object('fromKind', 'FAMILY', 'toKind', 'PERSONAL', 'why', 'go_live')
FROM "m8_moves" m CROSS JOIN LATERAL (VALUES (m."from_id"), (m."to_id")) AS b("book");--> statement-breakpoint
UPDATE "receipts" r SET "family_id" = m."to_id" FROM "m8_moves" m WHERE r."expense_id" = m."expense_id";--> statement-breakpoint
UPDATE "expenses" e SET
  "family_id" = m."to_id",
  "category_id" = (SELECT pc."id" FROM "categories" pc WHERE pc."family_id" = m."to_id" AND lower(pc."name") = lower(m."category_name"))
FROM "m8_moves" m WHERE e."id" = m."expense_id";--> statement-breakpoint
DROP TABLE "m8_moves";
