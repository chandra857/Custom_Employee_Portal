import type { PortalUser, ServiceKey, ZohoService } from './types';

const dataCenter = () => process.env.ZOHO_DATA_CENTER?.trim() || 'com';

export const serviceCatalog: ZohoService[] = [
  { key: 'people', name: 'Zoho People', purpose: 'HR management, leave and employee records', permission: 'zoho.people.access', url: 'https://people.zoho.com', color: 'teal' },
  { key: 'crm', name: 'Zoho CRM', purpose: 'Sales pipeline and customer relationships', permission: 'zoho.crm.access', url: 'https://crm.zoho.com', color: 'blue' },
  { key: 'desk', name: 'Zoho Desk', purpose: 'Support tickets and customer cases', permission: 'zoho.desk.access', url: 'https://desk.zoho.com', color: 'orange' },
  { key: 'books', name: 'Zoho Books', purpose: 'Accounting, expenses and financial operations', permission: 'zoho.books.access', url: 'https://books.zoho.com', color: 'violet' },
];

export function servicesFor(user: PortalUser) {
  return serviceCatalog.filter((service) => user.permissions.includes(service.permission));
}

export function getService(key: string) {
  return serviceCatalog.find((service) => service.key === key);
}

let accessTokenCache: { token: string; expiresAt: number } | null = null;

export function integrationStatus() {
  const live = process.env.ZOHO_MODE === 'live' && Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN);
  return { mode: live ? 'live' : 'demo', connected: live, dataCenter: dataCenter() };
}

async function getAccessToken() {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now() + 60_000) return accessTokenCache.token;
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_CLIENT_SECRET || !process.env.ZOHO_REFRESH_TOKEN) throw new Error('Zoho OAuth credentials are not configured.');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
  });
  const response = await fetch(`https://accounts.zoho.${dataCenter()}/oauth/v2/token`, { method: 'POST', body });
  if (!response.ok) throw new Error(`Zoho token refresh failed with status ${response.status}.`);
  const result = await response.json() as { access_token: string; expires_in?: number };
  accessTokenCache = { token: result.access_token, expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000 };
  return result.access_token;
}

const apiRoots: Record<ServiceKey, string> = {
  people: `https://people.zoho.${dataCenter()}/people/api`,
  crm: `https://www.zohoapis.${dataCenter()}/crm/v8`,
  desk: `https://desk.zoho.${dataCenter()}/api/v1`,
  books: `https://www.zohoapis.${dataCenter()}/books/v3`,
};

export async function zohoRequest(service: ServiceKey, path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Zoho-oauthtoken ${token}`);
  headers.set('Accept', 'application/json');
  const response = await fetch(`${apiRoots[service]}${path.startsWith('/') ? path : `/${path}`}`, { ...init, headers });
  if (!response.ok) throw new Error(`Zoho ${service} request failed with status ${response.status}.`);
  return response.json();
}
