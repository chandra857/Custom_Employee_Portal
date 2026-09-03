import { authenticateRequest, errorResponse, json } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { getService, integrationStatus } from '@/lib/zoho';

export async function POST(request: Request, context: { params: Promise<{ service: string }> }) {
  try {
    const { service: serviceKey } = await context.params;
    const service = getService(serviceKey);
    if (!service) return json({ error: 'Unknown Zoho service.' }, { status: 404 });
    const user = await authenticateRequest(request, service.permission);
    await writeAudit({ user, action: 'zoho.launch', resource: service.key, request, details: { mode: integrationStatus().mode } });
    return json({ url: service.url, mode: integrationStatus().mode, notice: 'Native Zoho pages require a Zoho session or configured SSO. API-backed portal features use the server connection.' });
  } catch (error) {
    return errorResponse(error);
  }
}
