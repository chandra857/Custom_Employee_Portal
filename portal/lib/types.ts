export type PortalUser = {
  id: number;
  email: string;
  fullName: string;
  department: string;
  roles: string[];
  permissions: string[];
};

export type ServiceKey = 'people' | 'crm' | 'desk' | 'books';

export type ZohoService = {
  key: ServiceKey;
  name: string;
  purpose: string;
  permission: string;
  url: string;
  color: string;
};
