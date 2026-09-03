import { env } from 'cloudflare:workers';
import type { PortalUser } from './types';

type AuditInput = {
  user?: PortalUser | null;
  actorEmail?: string | null;
  action: string;
  resource: string;
  resourceId?: string | number | null;
  status?: 'success' | 'denied' | 'failed';
  details?: Record<string, unknown>;
  request?: Request;
};

export function clientIp(request?: Request) {
  return request?.headers.get('cf-connecting-ip') ?? request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
}

export async function writeAudit(input: AuditInput) {
  await env.DB.prepare(`
    INSERT INTO audit_logs (user_id, actor_email, action, resource, resource_id, status, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.user?.id ?? null,
    input.user?.email ?? input.actorEmail ?? null,
    input.action,
    input.resource,
    input.resourceId == null ? null : String(input.resourceId),
    input.status ?? 'success',
    JSON.stringify(input.details ?? {}),
    clientIp(input.request),
  ).run();
}
