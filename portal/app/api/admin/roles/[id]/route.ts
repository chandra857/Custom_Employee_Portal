import { env } from 'cloudflare:workers';
import { authenticateRequest, errorResponse, json } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';

function getId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await authenticateRequest(request, 'admin.roles.manage');
    const id = getId((await context.params).id);
    if (!id) return json({ error: 'Invalid role id.' }, { status: 400 });
    const body = await request.json<{ name?: string; description?: string; permissionIds?: number[] }>();
    const existing = await env.DB.prepare('SELECT id, system_role FROM roles WHERE id = ?').bind(id).first<{ id: number; system_role: number }>();
    if (!existing) return json({ error: 'Role not found.' }, { status: 404 });
    const statements = [];
    if (body.name?.trim() && !existing.system_role) statements.push(env.DB.prepare('UPDATE roles SET name = ? WHERE id = ?').bind(body.name.trim(), id));
    if (typeof body.description === 'string') statements.push(env.DB.prepare('UPDATE roles SET description = ? WHERE id = ?').bind(body.description.trim(), id));
    if (Array.isArray(body.permissionIds)) {
      statements.push(env.DB.prepare('DELETE FROM role_permissions WHERE role_id = ?').bind(id));
      for (const permissionId of [...new Set(body.permissionIds)].filter(Number.isInteger)) statements.push(env.DB.prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)').bind(id, permissionId));
    }
    if (statements.length) await env.DB.batch(statements);
    await writeAudit({ user: actor, action: 'role.update', resource: 'role', resourceId: id, request, details: { fields: Object.keys(body) } });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await authenticateRequest(request, 'admin.roles.manage');
    const id = getId((await context.params).id);
    if (!id) return json({ error: 'Invalid role id.' }, { status: 400 });
    const role = await env.DB.prepare('SELECT id, name, system_role FROM roles WHERE id = ?').bind(id).first<{ id: number; name: string; system_role: number }>();
    if (!role) return json({ error: 'Role not found.' }, { status: 404 });
    if (role.system_role) return json({ error: 'Built-in roles cannot be deleted.' }, { status: 400 });
    const assigned = await env.DB.prepare('SELECT COUNT(*) AS count FROM user_roles WHERE role_id = ?').bind(id).first<{ count: number }>();
    if ((assigned?.count ?? 0) > 0) return json({ error: 'Remove this role from its users before deleting it.' }, { status: 409 });
    await env.DB.prepare('DELETE FROM roles WHERE id = ?').bind(id).run();
    await writeAudit({ user: actor, action: 'role.delete', resource: 'role', resourceId: id, request, details: { name: role.name } });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
