import { env } from 'cloudflare:workers';
import { authenticateRequest, errorResponse, json } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    await authenticateRequest(request, 'audit.read');
    const logs = await env.DB.prepare(`
      SELECT id, actor_email, action, resource, resource_id, status, details, ip_address, created_at
      FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 100
    `).all();
    return json({ logs: logs.results });
  } catch (error) {
    return errorResponse(error);
  }
}
