import { authenticateRequest, errorResponse, json } from '@/lib/auth';
import { integrationStatus, servicesFor } from '@/lib/zoho';

export async function GET(request: Request) {
  try {
    const user = await authenticateRequest(request, 'portal.access');
    return json({ user, services: servicesFor(user), integration: integrationStatus() });
  } catch (error) {
    return errorResponse(error);
  }
}
