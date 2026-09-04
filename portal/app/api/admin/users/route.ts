import { env } from 'cloudflare:workers';
import { authenticateRequest, errorResponse, json } from '@/lib/auth';
import { hashPassword } from '@/lib/auth-crypto';
import { writeAudit } from '@/lib/audit';

type UserListRow = {
  id: number; email: string; full_name: string; department: string; is_active: number;
  created_at: number; last_login_at: number | null; role_ids: string | null; roles: string | null;
};

function mapUser(row: UserListRow) {
  return {
    id: row.id, email: row.email, fullName: row.full_name, department: row.department,
    isActive: Boolean(row.is_active), createdAt: row.created_at, lastLoginAt: row.last_login_at,
    roleIds: row.role_ids ? row.role_ids.split(',').map(Number) : [], roles: row.roles ? row.roles.split(',') : [],
  };
}

export async function GET(request: Request) {
  try {
    await authenticateRequest(request, 'admin.users.manage');
    const users = await env.DB.prepare(`
      SELECT u.id, u.email, u.full_name, u.department, u.is_active, u.created_at, u.last_login_at,
        GROUP_CONCAT(DISTINCT r.id) AS role_ids, GROUP_CONCAT(DISTINCT r.name) AS roles
      FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id LEFT JOIN roles r ON r.id = ur.role_id
      GROUP BY u.id ORDER BY u.is_active DESC, u.full_name ASC
    `).all<UserListRow>();
    return json({ users: users.results.map(mapUser) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authenticateRequest(request, 'admin.users.manage');
    const body = await request.json<{ email?: string; fullName?: string; department?: string; password?: string; roleIds?: number[] }>();
    const email = body.email?.trim().toLowerCase() ?? '';
    const fullName = body.fullName?.trim() ?? '';
    const department = body.department?.trim() || 'General';
    if (!email.includes('@') || fullName.length < 2 || (body.password?.length ?? 0) < 8) return json({ error: 'Provide a valid email, name, and password of at least 8 characters.' }, { status: 400 });
    const roleIds = [...new Set(body.roleIds ?? [])].filter((id) => Number.isInteger(id) && id > 0);
    if (!roleIds.length) return json({ error: 'Select at least one role for the employee.' }, { status: 400 });
    const validRoles = await env.DB.prepare(`SELECT id FROM roles WHERE id IN (${roleIds.map(() => '?').join(',')})`).bind(...roleIds).all<{ id: number }>();
    if (validRoles.results.length !== roleIds.length) return json({ error: 'One or more selected roles no longer exist.' }, { status: 400 });
    const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (exists) return json({ error: 'A user with this email already exists.' }, { status: 409 });
    const password = await hashPassword(body.password!);
    const created = await env.DB.prepare(`
      INSERT INTO users (email, full_name, department, password_hash, password_salt, is_active)
      VALUES (?, ?, ?, ?, ?, 1) RETURNING id
    `).bind(email, fullName, department, password.hash, password.salt).first<{ id: number }>();
    if (created && roleIds.length) await env.DB.batch(roleIds.map((roleId) => env.DB.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)').bind(created.id, roleId)));
    await writeAudit({ user: actor, action: 'user.create', resource: 'user', resourceId: created?.id, request, details: { email, roleIds } });
    return json({ id: created?.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
