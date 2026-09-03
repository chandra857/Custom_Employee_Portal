import { authenticateRequest, errorResponse, json, revokeCurrentSession } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    const user = await authenticateRequest(request);
    const cookie = await revokeCurrentSession(request);
    await writeAudit({ user, action: 'auth.logout', resource: 'session', request });
    return json({ ok: true }, { headers: { 'set-cookie': cookie } });
  } catch (error) {
    return errorResponse(error);
  }
}
