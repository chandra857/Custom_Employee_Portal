import { database } from '@/db';
import { authenticateRequest, errorResponse, json } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';

type RoleRow = {
  id: number; name: string; slug: string; description: string; system_role: number;
  permission_ids: string | null; permissions: string | null; user_count: number;
};

function mapRole(row: RoleRow) {
  return {
    id: row.id, name: row.name, slug: row.slug, description: row.description, systemRole: Boolean(row.system_role),
    permissionIds: row.permission_ids ? row.permission_ids.split(',').map(Number) : [],
    permissions: row.permissions ? row.permissions.split(',') : [], userCount: row.user_count,
  };
}

export async function GET(request: Request) {
  try {
    await authenticateRequest(request, 'admin.roles.manage');
    const [roles, permissions] = await Promise.all([
      database.prepare(`
        SELECT r.id, r.name, r.slug, r.description, r.system_role,
          STRING_AGG(DISTINCT p.id::text, ',') AS permission_ids, STRING_AGG(DISTINCT p.name, ',') AS permissions,
          (SELECT COUNT(*)::integer FROM user_roles ur2 WHERE ur2.role_id = r.id) AS user_count
        FROM roles r LEFT JOIN role_permissions rp ON rp.role_id = r.id LEFT JOIN permissions p ON p.id = rp.permission_id
        GROUP BY r.id ORDER BY r.system_role DESC, r.name ASC
      `).all<RoleRow>(),
      database.prepare('SELECT id, key, name, description FROM permissions ORDER BY name').all(),
    ]);
    return json({ roles: roles.results.map(mapRole), permissions: permissions.results });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await authenticateRequest(request, 'admin.roles.manage');
    const body = await request.json() as { name?: string; description?: string; permissionIds?: number[] };
    const name = body.name?.trim() ?? '';
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (name.length < 2 || !slug) return json({ error: 'Enter a valid role name.' }, { status: 400 });
    const permissionIds = [...new Set(body.permissionIds ?? [])].filter((id) => Number.isInteger(id) && id > 0);
    if (!permissionIds.length) return json({ error: 'Select at least one permission for this role.' }, { status: 400 });
    const validPermissions = await database.prepare(`SELECT id FROM permissions WHERE id IN (${permissionIds.map(() => '?').join(',')})`).bind(...permissionIds).all<{ id: number }>();
    if (validPermissions.results.length !== permissionIds.length) return json({ error: 'One or more selected permissions no longer exist.' }, { status: 400 });
    const existing = await database.prepare('SELECT id FROM roles WHERE slug = ?').bind(slug).first();
    if (existing) return json({ error: 'A role with this name already exists.' }, { status: 409 });
    const role = await database.prepare('INSERT INTO roles (name, slug, description, system_role) VALUES (?, ?, ?, 0) RETURNING id').bind(name, slug, body.description?.trim() ?? '').first<{ id: number }>();
    if (role && permissionIds.length) await database.batch(permissionIds.map((permissionId) => database.prepare('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?) ON CONFLICT DO NOTHING').bind(role.id, permissionId)));
    await writeAudit({ user: actor, action: 'role.create', resource: 'role', resourceId: role?.id, request, details: { name, permissionIds } });
    return json({ id: role?.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
