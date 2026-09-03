declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    JWT_SECRET: string;
    ZOHO_MODE?: string;
    ZOHO_CLIENT_ID?: string;
    ZOHO_CLIENT_SECRET?: string;
    ZOHO_REFRESH_TOKEN?: string;
    ZOHO_DATA_CENTER?: string;
  }
}
