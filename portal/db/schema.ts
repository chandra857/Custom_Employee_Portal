import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull(),
  fullName: text('full_name').notNull(),
  department: text('department').notNull().default('General'),
  passwordHash: text('password_hash').notNull(),
  passwordSalt: text('password_salt').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
  updatedAt: integer('updated_at').notNull().default(sql`(unixepoch())`),
  lastLoginAt: integer('last_login_at'),
}, (table) => [uniqueIndex('users_email_unique').on(table.email)]);

export const roles = sqliteTable('roles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description').notNull().default(''),
  systemRole: integer('system_role', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (table) => [uniqueIndex('roles_slug_unique').on(table.slug)]);

export const permissions = sqliteTable('permissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
}, (table) => [uniqueIndex('permissions_key_unique').on(table.key)]);

export const userRoles = sqliteTable('user_roles', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roleId: integer('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
}, (table) => [primaryKey({ columns: [table.userId, table.roleId] })]);

export const rolePermissions = sqliteTable('role_permissions', {
  roleId: integer('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionId: integer('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
}, (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })]);

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull(),
  lastSeenAt: integer('last_seen_at').notNull().default(sql`(unixepoch())`),
  revokedAt: integer('revoked_at'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
}, (table) => [index('sessions_user_idx').on(table.userId), index('sessions_expiry_idx').on(table.expiresAt)]);

export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  actorEmail: text('actor_email'),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  resourceId: text('resource_id'),
  status: text('status').notNull().default('success'),
  details: text('details').notNull().default('{}'),
  ipAddress: text('ip_address'),
  createdAt: integer('created_at').notNull().default(sql`(unixepoch())`),
}, (table) => [index('audit_created_idx').on(table.createdAt), index('audit_user_idx').on(table.userId)]);
