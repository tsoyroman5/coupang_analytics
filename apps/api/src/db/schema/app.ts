// apps/api/src/db/schema/app.ts
import { pgSchema, uuid, text, timestamp, primaryKey, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const app = pgSchema('app');
export const memberRole = app.enum('member_role', ['owner', 'member']);

export const tenants = app.table('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),            // business/store display name
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = app.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name'),                      // person's name, optional
  passwordHash: text('password_hash'),     // nullable if you add OAuth later
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`),
]);

export const tenantMembers = app.table('tenant_members', {
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: memberRole('role').notNull().default('owner'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [primaryKey({ columns: [t.tenantId, t.userId] })]);