// Drizzle table definitions (DESIGN §5). Tables are added milestone by milestone.
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
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
  lastFamilyId: uuid("last_family_id"), // foreign key added with families in M2
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
    activeFamilyId: uuid("active_family_id"), // foreign key added with families in M2
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);
