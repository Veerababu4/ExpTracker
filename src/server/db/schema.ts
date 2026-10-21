// Drizzle table definitions (DESIGN §5). Tables are added milestone by milestone.
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ── M1: accounts ──────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(), // always lower-case
  displayName: text("display_name").notNull(),
  mobile: text("mobile"), // optional, 10 digits
  email: text("email"), // optional
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  failedLogins: integer("failed_logins").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  recoveryFailures: integer("recovery_failures").notNull().default(0),
  recoveryLockedUntil: timestamp("recovery_locked_until", { withTimezone: true }),
  lastFamilyId: uuid("last_family_id").references((): AnyPgColumn => families.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const securityAnswers = pgTable(
  "security_answers",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slot: smallint("slot").notNull(), // 1 or 2
    questionCode: text("question_code").notNull(),
    answerHash: text("answer_hash").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.slot] })],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // SHA-256 (hex) of the cookie token; the token itself is never stored
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeFamilyId: uuid("active_family_id").references((): AnyPgColumn => families.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ── M2: families ──────────────────────────────────────────────────────────────

export const memberRole = pgEnum("member_role", ["HEAD", "MEMBER"]);
export const memberStatus = pgEnum("member_status", ["ACTIVE", "REMOVED", "LEFT"]);
export const joinRequestStatus = pgEnum("join_request_status", ["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);

export const families = pgTable("families", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  joinCode: text("join_code").notNull().unique(), // 8 characters, stored without the dash
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

export const familyMembers = pgTable(
  "family_members",
  {
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("MEMBER"),
    status: memberStatus("status").notNull().default("ACTIVE"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
    // M3: high-value alert limits for this person in this family; null = default (₹2,000 / ₹20,000).
    highAlertPaise: bigint("high_alert_paise", { mode: "number" }),
    veryHighAlertPaise: bigint("very_high_alert_paise", { mode: "number" }),
  },
  (t) => [
    primaryKey({ columns: [t.familyId, t.userId] }),
    index("family_members_user_idx").on(t.userId),
    // The database itself guarantees exactly one active head per family.
    uniqueIndex("family_one_head").on(t.familyId).where(sql`${t.role} = 'HEAD' and ${t.status} = 'ACTIVE'`),
  ],
);

export const joinRequests = pgTable(
  "join_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: joinRequestStatus("status").notNull().default("PENDING"),
    createdAt: createdAt(),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("join_requests_one_pending").on(t.familyId, t.userId).where(sql`${t.status} = 'PENDING'`),
    index("join_requests_user_idx").on(t.userId),
  ],
);

/** Who changed what (DESIGN §5). details holds before/after values; never passwords or answers. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id").references(() => families.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    details: jsonb("details"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_family_idx").on(t.familyId, t.at)],
);

// ── M3: expenses ──────────────────────────────────────────────────────────────

export const paymentMode = pgEnum("payment_mode", ["CASH", "UPI", "CARD", "NET_BANKING", "OTHER"]);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    hidden: boolean("hidden").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(1000),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("categories_family_name").on(t.familyId, sql`lower(${t.name})`)],
);

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    /** The member the expense belongs to (who entered it). Edits by the head don't change it. */
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    expenseDate: date("expense_date", { mode: "string" }).notNull(),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("INR"),
    categoryId: uuid("category_id").references(() => categories.id),
    paymentMode: paymentMode("payment_mode"),
    note: text("note"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    deletedBy: uuid("deleted_by").references(() => users.id),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("expenses_family_date").on(t.familyId, t.expenseDate).where(sql`${t.deletedAt} is null`),
    check("expenses_amount_range", sql`${t.amountPaise} between 100 and 100000000`),
    check("expenses_currency_inr", sql`${t.currency} = 'INR'`),
    check("expenses_note_length", sql`char_length(${t.note}) <= 200`),
  ],
);

// ── M4: receipts and site settings ────────────────────────────────────────────

/** Raw file bytes (PostgreSQL bytea) as a Node Buffer. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/** One receipt per expense (photo or PDF), stored in the database so it's private and backed up with it. */
export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyId: uuid("family_id")
      .notNull()
      .references(() => families.id, { onDelete: "cascade" }),
    expenseId: uuid("expense_id")
      .notNull()
      .unique()
      .references(() => expenses.id, { onDelete: "cascade" }),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    data: bytea("data").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("receipts_family_idx").on(t.familyId),
    check("receipts_content_type", sql`${t.contentType} in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')`),
    check("receipts_size", sql`${t.sizeBytes} between 1 and 2097152 and ${t.sizeBytes} = octet_length(${t.data})`),
  ],
);

/** Site-wide switches set by the site admin (e.g. receipts_enabled). A missing key means the default. */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
