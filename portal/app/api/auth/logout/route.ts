import { authenticateRequest, errorResponse, json, revokeCurrentSession } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof authenticateRequest>> | null = null;
  try {
    user = await authenticateRequest(request);
  } catch (error) {
    if (!(error instanceof Response) || ![401, 403].includes(error.status)) return errorResponse(error);
  }

  try {
    const cookie = await revokeCurrentSession(request);
    if (user) await writeAudit({ user, action: 'auth.logout', resource: 'session', request });
    return json({ ok: true }, { headers: { 'set-cookie': cookie } });
  } catch (error) {
    return errorResponse(error);
  }
}
