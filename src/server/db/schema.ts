// Drizzle table definitions (DESIGN §5). Tables are added milestone by milestone.
import { sql } from "drizzle-orm";
import {
  boolean,
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
