import { env } from 'cloudflare:workers';
import { clientIp, writeAudit } from './audit';
import { signJwt, verifyJwt } from './auth-crypto';
import type { PortalUser } from './types';

const COOKIE_NAME = 'portal_session';
const DEFAULT_SESSION_SECONDS = 30 * 60;
const REMEMBERED_SESSION_SECONDS = 8 * 60 * 60;

type JwtPayload = {
  sub: number;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  iat: number;
  exp: number;
  jti: string;
};

type UserRow = {
  id: number;
  email: string;
  full_name: string;
  department: string;
  is_active: number;
  roles: string | null;
  permissions: string | null;
};

function secret() {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters.');
  return env.JWT_SECRET;
}

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get('cookie') ?? '';
  const match = cookies.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function mapUser(row: UserRow): PortalUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    department: row.department,
    roles: row.roles ? row.roles.split(',') : [],
    permissions: row.permissions ? row.permissions.split(',') : [],
  };
}

export async function findUserWithAccess(where: 'id' | 'email', value: number | string) {
  const row = await env.DB.prepare(`
    SELECT u.id, u.email, u.full_name, u.department, u.is_active,
      GROUP_CONCAT(DISTINCT r.slug) AS roles,
      GROUP_CONCAT(DISTINCT p.key) AS permissions
    FROM users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    LEFT JOIN roles r ON r.id = ur.role_id
    LEFT JOIN role_permissions rp ON rp.role_id = r.id
    LEFT JOIN permissions p ON p.id = rp.permission_id
    WHERE u.${where} = ?
    GROUP BY u.id
  `).bind(value).first<UserRow>();
  return row ? { row, user: mapUser(row) } : null;
}

export async function createSession(request: Request, user: PortalUser, remember: boolean) {
  const now = Math.floor(Date.now() / 1000);
  const duration = remember ? REMEMBERED_SESSION_SECONDS : DEFAULT_SESSION_SECONDS;
  const expiresAt = now + duration;
  const sessionId = crypto.randomUUID();
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    name: user.fullName,
    roles: user.roles,
    permissions: user.permissions,
    iat: now,
    exp: expiresAt,
    jti: sessionId,
  };
  const token = await signJwt(payload, secret());
  await env.DB.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, last_seen_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(sessionId, user.id, expiresAt, now, clientIp(request), request.headers.get('user-agent')).run();
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return {
    token,
    cookie: `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=${duration}`,
  };
}

export async function authenticateRequest(request: Request, permission?: string): Promise<PortalUser> {
  const method = request.method.toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) throw new Response('Cross-origin request blocked.', { status: 403 });
  }

  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : cookieValue(request, COOKIE_NAME);
  if (!token) throw new Response('Authentication required.', { status: 401 });

  const payload = await verifyJwt<JwtPayload>(token, secret());
  const now = Math.floor(Date.now() / 1000);
  if (!payload || payload.exp <= now) throw new Response('Session expired.', { status: 401 });

  const session = await env.DB.prepare('SELECT id, revoked_at, expires_at FROM sessions WHERE id = ? AND user_id = ?').bind(payload.jti, payload.sub).first<{ id: string; revoked_at: number | null; expires_at: number }>();
  if (!session || session.revoked_at || session.expires_at <= now) throw new Response('Session is no longer active.', { status: 401 });

  const result = await findUserWithAccess('id', payload.sub);
  if (!result || !result.row.is_active) throw new Response('Account is inactive.', { status: 403 });

  await env.DB.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').bind(now, payload.jti).run();
  if (permission && !result.user.permissions.includes(permission)) {
    await writeAudit({ user: result.user, action: 'permission.denied', resource: permission, status: 'denied', request });
    throw new Response('You do not have permission for this action.', { status: 403 });
  }
  return result.user;
}

export async function revokeCurrentSession(request: Request) {
  const token = cookieValue(request, COOKIE_NAME);
  if (token) {
    const payload = await verifyJwt<JwtPayload>(token, secret());
    if (payload) await env.DB.prepare('UPDATE sessions SET revoked_at = unixepoch() WHERE id = ?').bind(payload.jti).run();
  }
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict${secure}; Max-Age=0`;
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function errorResponse(error: unknown) {
  if (error instanceof Response) {
    const message = await error.clone().text().catch(() => '');
    return json({ error: message || error.statusText || 'Request failed.' }, { status: error.status });
  }
  console.error(error);
  return json({ error: 'The server could not complete the request.' }, { status: 500 });
}
