import { env } from 'cloudflare:workers';
import { hashPassword } from './auth-crypto';

const permissionRows = [
  ['portal.access', 'Portal access', 'Sign in and use the employee portal'],
  ['zoho.people.access', 'Zoho People', 'Open HR tools and information'],
  ['zoho.crm.access', 'Zoho CRM', 'Open sales and customer tools'],
  ['zoho.desk.access', 'Zoho Desk', 'Open support and case tools'],
  ['zoho.books.access', 'Zoho Books', 'Open finance and accounting tools'],
  ['admin.users.manage', 'Manage users', 'Create, edit, deactivate, and assign users'],
  ['admin.roles.manage', 'Manage roles', 'Create roles and assign permissions'],
  ['audit.read', 'Read audit logs', 'Review sign-ins and access activity'],
] as const;

const roleRows = [
  ['Administrator', 'admin', 'Full portal administration and every connected service'],
  ['Human Resources', 'hr', 'HR operations through Zoho People'],
  ['Sales', 'sales', 'Sales operations through Zoho CRM'],
  ['Support', 'support', 'Customer support through Zoho Desk'],
  ['Finance', 'finance', 'Accounting operations through Zoho Books'],
  ['Manager', 'manager', 'Cross-functional team visibility'],
] as const;

const rolePermissions: Record<string, string[]> = {
  admin: permissionRows.map(([key]) => key),
  hr: ['portal.access', 'zoho.people.access'],
  sales: ['portal.access', 'zoho.crm.access'],
  support: ['portal.access', 'zoho.desk.access'],
  finance: ['portal.access', 'zoho.books.access'],
  manager: ['portal.access', 'zoho.people.access', 'zoho.crm.access'],
};

const demoUsers = [
  ['admin@workplace.test', 'Aarav Mehta', 'Operations', 'admin'],
  ['hr@workplace.test', 'Maya Patel', 'People & Culture', 'hr'],
  ['sales@workplace.test', 'Rohan Shah', 'Sales', 'sales'],
  ['support@workplace.test', 'Neha Rao', 'Customer Success', 'support'],
  ['finance@workplace.test', 'Kabir Singh', 'Finance', 'finance'],
] as const;

let seedPromise: Promise<void> | null = null;

export function ensureDemoData() {
  seedPromise ??= seedDemoData().catch((error) => {
    seedPromise = null;
    throw error;
  });
  return seedPromise;
}

async function seedDemoData() {
  const count = await env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>();
  if ((count?.count ?? 0) > 0) return;

  await env.DB.batch([
    ...permissionRows.map(([key, name, description]) => env.DB.prepare('INSERT OR IGNORE INTO permissions (key, name, description) VALUES (?, ?, ?)').bind(key, name, description)),
    ...roleRows.map(([name, slug, description]) => env.DB.prepare('INSERT OR IGNORE INTO roles (name, slug, description, system_role) VALUES (?, ?, ?, 1)').bind(name, slug, description)),
  ]);

  const permissions = await env.DB.prepare('SELECT id, key FROM permissions').all<{ id: number; key: string }>();
  const roles = await env.DB.prepare('SELECT id, slug FROM roles').all<{ id: number; slug: string }>();
  const permissionId = new Map(permissions.results.map((item) => [item.key, item.id]));
  const roleId = new Map(roles.results.map((item) => [item.slug, item.id]));

  const grants = Object.entries(rolePermissions).flatMap(([role, keys]) => keys.map((key) => {
    return env.DB.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)').bind(roleId.get(role), permissionId.get(key));
  }));
  if (grants.length) await env.DB.batch(grants);

  const { hash, salt } = await hashPassword('Admin@123');
  await env.DB.batch(demoUsers.map(([email, fullName, department]) => env.DB.prepare(`
    INSERT OR IGNORE INTO users (email, full_name, department, password_hash, password_salt, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).bind(email, fullName, department, hash, salt)));

  const users = await env.DB.prepare('SELECT id, email FROM users').all<{ id: number; email: string }>();
  const userId = new Map(users.results.map((item) => [item.email, item.id]));
  await env.DB.batch(demoUsers.map(([email, , , role]) => env.DB.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').bind(userId.get(email), roleId.get(role))));
}
