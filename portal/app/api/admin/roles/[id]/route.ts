import { database } from '@/db';
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
    const body = await request.json() as { name?: string; description?: string; permissionIds?: number[] };
    const existing = await database.prepare('SELECT id, system_role FROM roles WHERE id = ?').bind(id).first<{ id: number; system_role: number }>();
    if (!existing) return json({ error: 'Role not found.' }, { status: 404 });
    const proposedName = body.name?.trim();
    const proposedSlug = proposedName?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (proposedName !== undefined && (proposedName.length < 2 || !proposedSlug)) return json({ error: 'Enter a valid role name.' }, { status: 400 });
    if (proposedSlug && !existing.system_role) {
      const duplicate = await database.prepare('SELECT id FROM roles WHERE slug = ? AND id <> ?').bind(proposedSlug, id).first();
      if (duplicate) return json({ error: 'A role with this name already exists.' }, { status: 409 });
    }
    const permissionIds = Array.isArray(body.permissionIds) ? [...new Set(body.permissionIds)].filter((permissionId) => Number.isInteger(permissionId) && permissionId > 0) : null;
    if (permissionIds && !permissionIds.length) return json({ error: 'Select at least one permission for this role.' }, { status: 400 });
    if (permissionIds?.length) {
      const validPermissions = await database.prepare(`SELECT id FROM permissions WHERE id IN (${permissionIds.map(() => '?').join(',')})`).bind(...permissionIds).all<{ id: number }>();
      if (validPermissions.results.length !== permissionIds.length) return json({ error: 'One or more selected permissions no longer exist.' }, { status: 400 });
    }
    const statements = [];
    if (proposedName && proposedSlug && !existing.system_role) statements.push(database.prepare('UPDATE roles SET name = ?, slug = ? WHERE id = ?').bind(proposedName, proposedSlug, id));
    if (typeof body.description === 'string') statements.push(database.prepare('UPDATE roles SET description = ? WHERE id = ?').bind(body.description.trim(), id));
    if (permissionIds) {
      statements.push(database.prepare('DELETE FROM role_permissions WHERE role_id = ?').bind(id));
      for (const permissionId of permissionIds) statements.push(database.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(id, permissionId));
    }
    if (statements.length) await database.batch(statements);
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
    const role = await database.prepare('SELECT id, name, system_role FROM roles WHERE id = ?').bind(id).first<{ id: number; name: string; system_role: number }>();
    if (!role) return json({ error: 'Role not found.' }, { status: 404 });
    if (role.system_role) return json({ error: 'Built-in roles cannot be deleted.' }, { status: 400 });
    const assigned = await database.prepare('SELECT COUNT(*)::integer AS count FROM user_roles WHERE role_id = ?').bind(id).first<{ count: number }>();
    if ((assigned?.count ?? 0) > 0) return json({ error: 'Remove this role from its users before deleting it.' }, { status: 409 });
    await database.prepare('DELETE FROM roles WHERE id = ?').bind(id).run();
    await writeAudit({ user: actor, action: 'role.delete', resource: 'role', resourceId: id, request, details: { name: role.name } });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
