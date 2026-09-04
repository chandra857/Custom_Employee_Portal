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
Copy-Item .env.example .env.local
```

Replace `JWT_SECRET` in `.env.local` with at least 32 random characters. Do not commit `.env.local`; it is ignored by Git.

Start the Netlify development environment from the `portal` directory. It runs Next.js together with a local PostgreSQL-compatible database:

```powershell
npx netlify dev
```

In a second terminal, apply the checked-in database migration once:

```powershell
cd portal
npx netlify database migrations apply
```

Open the local URL printed by Netlify CLI. For frontend-only work, `npm run dev` also starts Next.js, but database-backed sign-in requires `netlify dev` or a valid `NETLIFY_DB_URL`.

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

The portal uses Netlify Database, a managed PostgreSQL database available to the deployed Next.js server runtime. The schema contains `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, and `audit_logs`, plus `sessions` for revocation and timeout enforcement.

SQL migrations are stored in `portal/netlify/database/migrations` and are applied automatically during Netlify deploys.

## Deploy to Netlify

The repository contains a root `netlify.toml` that selects `portal` as the base directory, runs `npm run build`, and publishes the Next.js output. Connect this GitHub repository to Netlify and deploy the `main` branch; no manual publish-directory override is required.

The database migration generates and stores a random session-signing secret automatically. For centrally managed production secrets, you can override it with a `JWT_SECRET` environment variable containing at least 32 random characters. Add the `ZOHO_*` values from `portal/.env.example` only when enabling live Zoho OAuth.

Netlify detects `@netlify/database`, provisions the database for eligible projects, and applies the checked-in migration during deployment. If the account is not on a credit-based plan, enable one or configure an external PostgreSQL database before using the authenticated features.

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

The production output is a standard Next.js application supported by Netlify's OpenNext adapter.
