// apps/api/src/db/schema/app.ts
import {
  pgSchema,
  uuid,
  text,
  timestamp,
  primaryKey,
  uniqueIndex,
  integer,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const app = pgSchema("app");
export const memberRole = app.enum("member_role", ["owner", "member"]);
export const connectionStatus = app.enum("connection_status", [
  "pending",
  "active",
  "invalid",
  "expired",
]);

export const tenants = app.table("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(), // business/store display name
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const users = app.table(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"), // person's name, optional
    passwordHash: text("password_hash"), // nullable if you add OAuth later
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex("users_email_lower_uq").on(sql`lower(${t.email})`)],
);

export const tenantMembers = app.table(
  "tenant_members",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.userId] })],
);

export const coupangConnections = app.table(
  "coupang_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    vendorId: text("vendor_id").notNull(),
    credentialsEnc: text("credentials_enc").notNull(), // base64 ciphertext of {accessKey, secretKey}
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    keyVersion: integer("key_version").notNull(),
    accessKeyHint: text("access_key_hint").notNull(), // last 4 chars, for masked display only
    status: connectionStatus("status").notNull().default("pending"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [unique("coupang_conn_tenant_vendor_uq").on(t.tenantId, t.vendorId)],
);
