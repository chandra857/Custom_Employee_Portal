# Workplace Hub — Custom Employee Portal

Workplace Hub is a secure employee portal that provides one role-controlled entry point to Zoho People, CRM, Desk, and Books. It includes custom credentials, JWT sessions, backend permission enforcement, user and role administration, and an audit trail.

The deployable application is in [`portal`](./portal).

## Included

- Custom email/password authentication with PBKDF2 password hashing
- Signed JWTs in `HttpOnly`, `SameSite=Strict` cookies
- 30-minute standard sessions and 8-hour remembered sessions
- Server-side role and permission validation on every protected API
- Admin user lifecycle: create, edit, role assignment, deactivate, and session revocation
- Built-in Admin, HR, Sales, Support, Finance, and Manager roles
- Custom role creation, permission editing, and safe deletion
- Role-filtered Zoho application dashboard
- Zoho OAuth refresh-token integration layer with credentials kept server-side
- Audit logs for login, logout, denied access, admin changes, and Zoho launches
- Persistent relational schema and generated migrations
- Responsive employee and administrator interfaces

## Run locally

Requirements: Node.js 22.13 or newer.

```powershell
cd portal
npm install
Copy-Item .env.example .dev.vars
Copy-Item .openai/hosting.example.json .openai/hosting.json
```

Replace `JWT_SECRET` in `.dev.vars` with at least 32 random characters. Do not commit `.dev.vars`; it is ignored by Git.

```powershell
npm run db:migrate:local
npm run dev
```

Open `http://localhost:3000`.

Demo accounts are created automatically after the migration on the first login. All use password `Admin@123`:

| Role | Email | Authorized application |
|---|---|---|
| Administrator | `admin@workplace.test` | All services and admin tools |
| Human Resources | `hr@workplace.test` | Zoho People |
| Sales | `sales@workplace.test` | Zoho CRM |
| Support | `support@workplace.test` | Zoho Desk |
| Finance | `finance@workplace.test` | Zoho Books |

Change or remove all demo accounts before a production rollout.

## Configure Zoho One

The default `ZOHO_MODE=demo` makes the full portal and RBAC flow usable without exposing or inventing Zoho credentials.

For a live connection:

1. Create a Zoho API client in the Zoho API Console under the organization-owned integration account.
2. Grant only the scopes required for People, CRM, Desk, and Books.
3. Generate a long-lived refresh token for that client.
4. Set the production-only variables shown in `portal/.env.example` and change `ZOHO_MODE` to `live`.
5. Never place the client secret or refresh token in Git, frontend code, logs, or screenshots.

The backend exchanges the refresh token for short-lived access tokens and sends those tokens only to Zoho APIs. They are never returned to employees' browsers.

### Native Zoho portal boundary

Backend API access through one organization-owned service account does not automatically sign employees into Zoho's native web applications. Direct links to `people.zoho.com`, `crm.zoho.com`, `desk.zoho.com`, and `books.zoho.com` still follow Zoho's own user/session or SSO rules. For employees who must not have Zoho identities, expose the required Zoho data and actions inside Workplace Hub through the backend API layer. For native-app access, configure Zoho Directory/SSO and provision the appropriate Zoho users and application licenses.

## Data model

The demo uses Cloudflare D1, a managed relational SQL database suited to the deployed Worker runtime. The schema contains the requested `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, and `audit_logs` tables, plus `sessions` for revocation and timeout enforcement.

The schema source is `portal/db/schema.ts`; generated SQL migrations are in `portal/drizzle`.

## Production checklist

- Replace demo users and temporary passwords.
- Set a random production `JWT_SECRET` of at least 32 characters.
- Store Zoho credentials only as encrypted deployment environment variables.
- Keep the site private or limit it to the intended workforce.
- Configure native Zoho SSO only if direct native-app access is required.
- Review OAuth scopes and apply least privilege.
- Add organization retention rules for audit logs.
- Verify custom domain HTTPS and security headers at the edge.
- Add backups, monitoring, incident alerts, and an account recovery workflow before broad rollout.

## Build

```powershell
cd portal
npm run build
```

The production output is a Cloudflare Worker-compatible application with a callable `fetch` entry point.
