import { env } from 'cloudflare:workers';
import { authenticateRequest, errorResponse, json } from '@/lib/auth';
import { integrationStatus } from '@/lib/zoho';

export async function GET(request: Request) {
  try {
    await authenticateRequest(request, 'admin.users.manage');
    const [users, roles, sessions, activity] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS count FROM users WHERE is_active = 1').first<{ count: number }>(),
      env.DB.prepare('SELECT COUNT(*) AS count FROM roles').first<{ count: number }>(),
      env.DB.prepare('SELECT COUNT(*) AS count FROM sessions WHERE revoked_at IS NULL AND expires_at > unixepoch()').first<{ count: number }>(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE created_at > unixepoch() - 86400").first<{ count: number }>(),
    ]);
    return json({ activeUsers: users?.count ?? 0, roles: roles?.count ?? 0, activeSessions: sessions?.count ?? 0, activity24h: activity?.count ?? 0, integration: integrationStatus() });
  } catch (error) {
    return errorResponse(error);
  }
}
