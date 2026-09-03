import { env } from 'cloudflare:workers';
import { createSession, errorResponse, findUserWithAccess, json } from '@/lib/auth';
import { verifyPassword } from '@/lib/auth-crypto';
import { writeAudit } from '@/lib/audit';
import { ensureDemoData } from '@/lib/seed';

type LoginBody = { email?: string; password?: string; remember?: boolean };

export async function POST(request: Request) {
  try {
    await ensureDemoData();
    const body = await request.json<LoginBody>();
    const email = body.email?.trim().toLowerCase() ?? '';
    if (!email || !body.password) return json({ error: 'Enter your work email and password.' }, { status: 400 });

    const recent = await env.DB.prepare(`
      SELECT COUNT(*) AS count FROM audit_logs
      WHERE actor_email = ? AND action = 'auth.login' AND status = 'failed' AND created_at > unixepoch() - 300
    `).bind(email).first<{ count: number }>();
    if ((recent?.count ?? 0) >= 5) return json({ error: 'Too many unsuccessful attempts. Try again in a few minutes.' }, { status: 429 });

    const account = await env.DB.prepare('SELECT id, email, password_hash, password_salt, is_active FROM users WHERE email = ?').bind(email).first<{ id: number; email: string; password_hash: string; password_salt: string; is_active: number }>();
    const valid = account ? await verifyPassword(body.password, account.password_salt, account.password_hash) : false;
    if (!account || !valid || !account.is_active) {
      await writeAudit({ actorEmail: email, action: 'auth.login', resource: 'session', status: 'failed', details: { reason: 'invalid_credentials' }, request });
      return json({ error: 'Email or password is incorrect.' }, { status: 401 });
    }

    const result = await findUserWithAccess('id', account.id);
    if (!result) return json({ error: 'Account access is not configured.' }, { status: 403 });
    await env.DB.prepare('UPDATE users SET last_login_at = unixepoch(), updated_at = unixepoch() WHERE id = ?').bind(account.id).run();
    const session = await createSession(request, result.user, Boolean(body.remember));
    await writeAudit({ user: result.user, action: 'auth.login', resource: 'session', request });
    return json({ user: result.user }, { headers: { 'set-cookie': session.cookie } });
  } catch (error) {
    return errorResponse(error);
  }
}
