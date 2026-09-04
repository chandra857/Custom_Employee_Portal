import { database } from '@/db';
import { authenticateRequest, errorResponse, json } from '@/lib/auth';
import { hashPassword } from '@/lib/auth-crypto';
import { writeAudit } from '@/lib/audit';

function numericId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await authenticateRequest(request, 'admin.users.manage');
    const id = numericId((await context.params).id);
    if (!id) return json({ error: 'Invalid user id.' }, { status: 400 });
    const body = await request.json() as { fullName?: string; department?: string; isActive?: boolean; roleIds?: number[]; password?: string };
    const existing = await database.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'User not found.' }, { status: 404 });
    if (id === actor.id && body.isActive === false) return json({ error: 'You cannot deactivate your own account.' }, { status: 400 });
    const roleIds = Array.isArray(body.roleIds) ? [...new Set(body.roleIds)].filter((roleId) => Number.isInteger(roleId) && roleId > 0) : null;
    if (roleIds?.length) {
      const validRoles = await database.prepare(`SELECT id FROM roles WHERE id IN (${roleIds.map(() => '?').join(',')})`).bind(...roleIds).all<{ id: number }>();
      if (validRoles.results.length !== roleIds.length) return json({ error: 'One or more selected roles no longer exist.' }, { status: 400 });
    }

    const statements = [];
    if (body.fullName?.trim()) statements.push(database.prepare('UPDATE users SET full_name = ?, updated_at = EXTRACT(EPOCH FROM NOW())::integer WHERE id = ?').bind(body.fullName.trim(), id));
    if (body.department?.trim()) statements.push(database.prepare('UPDATE users SET department = ?, updated_at = EXTRACT(EPOCH FROM NOW())::integer WHERE id = ?').bind(body.department.trim(), id));
    if (typeof body.isActive === 'boolean') statements.push(database.prepare('UPDATE users SET is_active = ?, updated_at = EXTRACT(EPOCH FROM NOW())::integer WHERE id = ?').bind(body.isActive ? 1 : 0, id));
    if (body.password) {
      if (body.password.length < 8) return json({ error: 'Password must contain at least 8 characters.' }, { status: 400 });
      const password = await hashPassword(body.password);
      statements.push(database.prepare('UPDATE users SET password_hash = ?, password_salt = ?, updated_at = EXTRACT(EPOCH FROM NOW())::integer WHERE id = ?').bind(password.hash, password.salt, id));
    }
    if (roleIds) {
      statements.push(database.prepare('DELETE FROM user_roles WHERE user_id = ?').bind(id));
      for (const roleId of roleIds) statements.push(database.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(id, roleId));
    }
    if (statements.length) await database.batch(statements);
    if (body.isActive === false || body.password) await database.prepare('UPDATE sessions SET revoked_at = EXTRACT(EPOCH FROM NOW())::integer WHERE user_id = ? AND revoked_at IS NULL').bind(id).run();
    await writeAudit({ user: actor, action: 'user.update', resource: 'user', resourceId: id, request, details: { fields: Object.keys(body) } });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await authenticateRequest(request, 'admin.users.manage');
    const id = numericId((await context.params).id);
    if (!id) return json({ error: 'Invalid user id.' }, { status: 400 });
    if (id === actor.id) return json({ error: 'You cannot remove your own account.' }, { status: 400 });
    const existing = await database.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'User not found.' }, { status: 404 });
    await database.batch([
      database.prepare('UPDATE users SET is_active = 0, updated_at = EXTRACT(EPOCH FROM NOW())::integer WHERE id = ?').bind(id),
      database.prepare('UPDATE sessions SET revoked_at = EXTRACT(EPOCH FROM NOW())::integer WHERE user_id = ? AND revoked_at IS NULL').bind(id),
    ]);
    await writeAudit({ user: actor, action: 'user.deactivate', resource: 'user', resourceId: id, request });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
