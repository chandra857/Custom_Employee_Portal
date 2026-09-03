'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SyntheticEvent } from 'react';
import {
  Activity, ArrowRight, BadgeCheck, BookOpen, BriefcaseBusiness, Building2,
  CheckCircle2, ChevronRight, CircleUserRound, Clock3, Headphones, KeyRound, LayoutDashboard,
  LockKeyhole, LogOut, Menu, MoreHorizontal, Pencil, Plus, RefreshCw, Search,
  ShieldCheck, ShieldEllipsis, Trash2, UserRoundPlus, UsersRound, X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type PortalUser = { id: number; email: string; fullName: string; department: string; roles: string[]; permissions: string[] };
type Service = { key: 'people' | 'crm' | 'desk' | 'books'; name: string; purpose: string; permission: string; url: string; color: string };
type Session = { user: PortalUser; services: Service[]; integration: { mode: 'demo' | 'live'; connected: boolean; dataCenter: string } };
type AdminUser = { id: number; email: string; fullName: string; department: string; isActive: boolean; createdAt: number; lastLoginAt: number | null; roleIds: number[]; roles: string[] };
type Permission = { id: number; key: string; name: string; description: string };
type Role = { id: number; name: string; slug: string; description: string; systemRole: boolean; permissionIds: number[]; permissions: string[]; userCount: number };
type AuditLog = { id: number; actor_email: string | null; action: string; resource: string; resource_id: string | null; status: string; details: string; ip_address: string | null; created_at: number };
type Overview = { activeUsers: number; roles: number; activeSessions: number; activity24h: number; integration: Session['integration'] };
type View = 'home' | 'users' | 'roles' | 'activity';

const demoAccounts = [
  { label: 'Admin', email: 'admin@workplace.test' }, { label: 'HR', email: 'hr@workplace.test' },
  { label: 'Sales', email: 'sales@workplace.test' }, { label: 'Support', email: 'support@workplace.test' },
  { label: 'Finance', email: 'finance@workplace.test' },
];

const serviceIcons = { people: UsersRound, crm: BriefcaseBusiness, desk: Headphones, books: BookOpen };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('content-type', 'application/json');
  const response = await fetch(url, { ...init, headers });
  const body = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

function dateTime(unix: number | null) {
  return unix ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(unix * 1000)) : 'Never';
}

export function PortalApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<View>('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [addUserOpen, setAddUserOpen] = useState(false);

  const refreshSession = useCallback(async () => {
    try { setSession(await api<Session>('/api/auth/me')); }
    catch { setSession(null); }
    finally { setChecking(false); }
  }, []);

  useEffect(() => { void refreshSession(); }, [refreshSession]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await context.registerTool({
        name: 'list_authorized_zoho_services', title: 'List authorized Zoho services',
        description: 'Return the Zoho services currently available to the signed-in employee.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: () => ({ services: session?.services.map((service) => ({ key: service.key, name: service.name })) ?? [] }),
      }, { signal: lifecycle.signal });
      if (session?.user.permissions.includes('admin.users.manage')) await context.registerTool({
        name: 'start_employee_creation', title: 'Start employee creation',
        description: 'Open the employee form so an administrator can review and create a new portal user.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: () => { setView('users'); setAddUserOpen(true); return { status: 'form_opened' }; },
      }, { signal: lifecycle.signal });
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [session]);

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 3800);
  }, []);

  if (checking) return <LoadingScreen />;
  if (!session) return <Login onLogin={setSession} />;

  const isAdmin = session.user.permissions.includes('admin.users.manage');
  const nav = [
    { key: 'home' as const, label: 'My workspace', icon: LayoutDashboard, show: true },
    { key: 'users' as const, label: 'Employees', icon: UsersRound, show: isAdmin },
    { key: 'roles' as const, label: 'Roles & access', icon: ShieldEllipsis, show: session.user.permissions.includes('admin.roles.manage') },
    { key: 'activity' as const, label: 'Audit activity', icon: Activity, show: session.user.permissions.includes('audit.read') },
  ].filter((item) => item.show);

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } finally { setSession(null); setView('home'); }
  }

  return (
    <div className="portal-shell">
      <aside className={`portal-sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-brand brand-lockup">
          <span className="brand-mark"><Building2 aria-hidden="true" /></span><span>Workplace <b>Hub</b></span>
          <button className="sidebar-close" onClick={() => setMenuOpen(false)} aria-label="Close navigation"><X /></button>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Portal navigation">
          {nav.map(({ key, label, icon: Icon }) => (
            <button key={key} className={view === key ? 'active' : ''} onClick={() => { setView(key); setMenuOpen(false); }}>
              <Icon aria-hidden="true" /><span>{label}</span>{view === key && <ChevronRight className="nav-arrow" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-security"><span><ShieldCheck /></span><div><b>Access protected</b><small>RBAC policies active</small></div></div>
        <div className="sidebar-profile"><span className="avatar">{initials(session.user.fullName)}</span><div><b>{session.user.fullName}</b><small>{session.user.department}</small></div><button onClick={logout} aria-label="Sign out"><LogOut /></button></div>
      </aside>
      {menuOpen && <button className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}

      <main className="portal-main">
        <header className="portal-header">
          <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open navigation"><Menu /></button>
          <div className="header-search"><Search /><span>Search your workspace</span><kbd>⌘ K</kbd></div>
          <div className="header-right"><span className={`connection ${session.integration.connected ? 'live' : ''}`}><i />{session.integration.connected ? 'Zoho connected' : 'Demo mode'}</span><span className="header-avatar">{initials(session.user.fullName)}</span></div>
        </header>

        <div className="portal-content">
          {view === 'home' && <Workspace session={session} onNotice={flash} />}
          {view === 'users' && <UsersAdmin addOpen={addUserOpen} setAddOpen={setAddUserOpen} onNotice={flash} />}
          {view === 'roles' && <RolesAdmin onNotice={flash} />}
          {view === 'activity' && <AuditActivity />}
        </div>
      </main>
      {notice && <output className="toast-notice"><CheckCircle2 />{notice}</output>}
    </div>
  );
}

function LoadingScreen() {
  return <main className="loading-screen"><span className="brand-mark"><Building2 /></span><b>Workplace Hub</b><span className="loading-line" /></main>;
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState('admin@workplace.test');
  const [password, setPassword] = useState('Admin@123');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api<{ user: PortalUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password, remember }) });
      const current = await api<Session>('/api/auth/me');
      onLogin({ ...current, user: result.user });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Sign-in failed.'); }
    finally { setBusy(false); }
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-labelledby="portal-title">
        <div className="brand-lockup"><span className="brand-mark"><Building2 /></span><span>Workplace <b>Hub</b></span></div>
        <div className="story-copy"><span className="eyebrow"><ShieldCheck /> Secure employee access</span><h1 id="portal-title">One doorway.<br />Only the tools you need.</h1><p>Your company workspace brings approved Zoho services together, with access shaped around your role.</p></div>
        <div className="service-rack" aria-label="Connected Zoho services">
          {(['people', 'crm', 'desk', 'books'] as const).map((key) => {
            const Icon = serviceIcons[key]; const names = { people: 'People', crm: 'CRM', desk: 'Desk', books: 'Books' };
            const details = { people: 'HR workspace', crm: 'Sales workspace', desk: 'Support workspace', books: 'Finance workspace' };
            return <article className={`service-chip ${key}`} key={key}><span className="service-icon"><Icon /></span><span><b>Zoho {names[key]}</b><small>{details[key]}</small></span><BadgeCheck className="verified" /></article>;
          })}
        </div>
        <div className="trust-line"><LockKeyhole /> Protected by role-based permissions and activity monitoring</div>
      </section>
      <section className="login-panel" aria-labelledby="sign-in-title">
        <div className="mobile-brand brand-lockup"><span className="brand-mark"><Building2 /></span><span>Workplace <b>Hub</b></span></div>
        <form className="login-card" onSubmit={submit}>
          <div className="welcome-mark"><span>W</span></div>
          <div><p className="eyebrow plain">EMPLOYEE PORTAL</p><h2 id="sign-in-title">Welcome back</h2><p className="form-intro">Sign in with your company portal credentials.</p></div>
          <div className="demo-accounts" aria-label="Demo accounts">{demoAccounts.map((account) => <button type="button" className={email === account.email ? 'selected' : ''} key={account.email} onClick={() => { setEmail(account.email); setPassword('Admin@123'); }}>{account.label}</button>)}</div>
          <div className="field-group"><label htmlFor="email">Work email</label><Input id="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
          <div className="field-group"><div className="label-row"><label htmlFor="password">Password</label><button type="button">Forgot password?</button></div><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
          <label className="remember-row"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>Keep me signed in on this device</span></label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <Button className="sign-in-button" size="lg" type="submit" disabled={busy}>{busy ? 'Checking access…' : 'Sign in to your workspace'} {!busy && <ArrowRight />}</Button>
          <div className="demo-note"><BadgeCheck /><p><b>Demo access is ready</b><span>All demo accounts use password Admin@123.</span></p></div>
        </form>
        <footer>Need help? <button type="button">Contact your administrator</button></footer>
      </section>
    </main>
  );
}

function Workspace({ session, onNotice }: { session: Session; onNotice: (message: string) => void }) {
  const user = session.user;
  async function launch(service: Service) {
    try {
      const result = await api<{ url: string; mode: string; notice: string }>(`/api/zoho/${service.key}/launch`, { method: 'POST', body: '{}' });
      window.open(result.url, '_blank', 'noopener,noreferrer');
      if (result.mode === 'demo') onNotice('Zoho opened. Native access still follows your Zoho sign-in or SSO policy.');
    } catch (error) { onNotice(error instanceof Error ? error.message : 'Service could not be opened.'); }
  }
  return (
    <section>
      <div className="page-heading"><div><span className="page-kicker">MY WORKSPACE</span><h1>Good to see you, {user.fullName.split(' ')[0]}.</h1><p>These services are available through your assigned {user.roles.join(', ')} role{user.roles.length > 1 ? 's' : ''}.</p></div><div className="heading-date"><Clock3 /><span><small>Local time</small><b>{new Intl.DateTimeFormat('en-IN', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date())}</b></span></div></div>
      <div className="access-summary"><div className="summary-icon"><KeyRound /></div><div><span>YOUR ACCESS</span><b>{session.services.length} Zoho service{session.services.length === 1 ? '' : 's'} enabled</b></div><div className="summary-roles">{user.roles.map((role) => <Badge variant="outline" key={role}>{role}</Badge>)}</div><ShieldCheck className="summary-shield" /></div>
      <div className="section-title"><div><h2>Authorized applications</h2><p>Launch only the tools approved for your role.</p></div><span className="sync-time"><RefreshCw /> Permissions checked now</span></div>
      {session.services.length ? <div className="service-grid">{session.services.map((service) => { const Icon = serviceIcons[service.key]; return (
        <article className={`app-card ${service.color}`} key={service.key}><div className="app-top"><span className="app-icon"><Icon /></span><span className="access-badge"><i /> Access granted</span></div><div className="app-copy"><span>ZOHO ONE</span><h3>{service.name}</h3><p>{service.purpose}</p></div><button onClick={() => launch(service)}>Open application <ArrowRight /></button></article>
      ); })}</div> : <div className="empty-state"><LockKeyhole /><h3>No services assigned</h3><p>Ask your administrator to add a Zoho permission to your role.</p></div>}
      <div className="security-note"><ShieldCheck /><div><b>Your Zoho credentials stay private</b><p>The portal validates every request against your current permissions. Backend API credentials are never sent to your browser.</p></div><span>{session.integration.connected ? 'LIVE CONNECTION' : 'SAFE DEMO MODE'}</span></div>
    </section>
  );
}

function UsersAdmin({ addOpen, setAddOpen, onNotice }: { addOpen: boolean; setAddOpen: (open: boolean) => void; onNotice: (message: string) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]); const [roles, setRoles] = useState<Role[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null); const [loading, setLoading] = useState(true); const [editing, setEditing] = useState<AdminUser | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [userData, roleData, overviewData] = await Promise.all([api<{ users: AdminUser[] }>('/api/admin/users'), api<{ roles: Role[]; permissions: Permission[] }>('/api/admin/roles'), api<Overview>('/api/admin/overview')]);
      setUsers(userData.users); setRoles(roleData.roles); setOverview(overviewData);
    } catch (error) { onNotice(error instanceof Error ? error.message : 'Could not load users.'); }
    finally { setLoading(false); }
  }, [onNotice]);
  useEffect(() => { void load(); }, [load]);

  async function deactivate(user: AdminUser) {
    if (!window.confirm(`Deactivate ${user.fullName}? Their active sessions will end immediately.`)) return;
    try { await api(`/api/admin/users/${user.id}`, { method: 'DELETE', body: '{}' }); onNotice(`${user.fullName} was deactivated.`); await load(); }
    catch (error) { onNotice(error instanceof Error ? error.message : 'Could not deactivate user.'); }
  }
  return (
    <section>
      <div className="page-heading admin-heading"><div><span className="page-kicker">ADMINISTRATION</span><h1>Employees</h1><p>Manage portal identities, roles, and active access.</p></div><Button onClick={() => setAddOpen(true)}><UserRoundPlus /> Add employee</Button></div>
      <div className="metric-grid"><Metric icon={UsersRound} label="Active employees" value={overview?.activeUsers ?? '—'} tone="blue" /><Metric icon={ShieldEllipsis} label="Configured roles" value={overview?.roles ?? '—'} tone="violet" /><Metric icon={CircleUserRound} label="Active sessions" value={overview?.activeSessions ?? '—'} tone="teal" /><Metric icon={Activity} label="Events · 24 hours" value={overview?.activity24h ?? '—'} tone="orange" /></div>
      <div className="data-card"><div className="data-card-head"><div><h2>Employee directory</h2><p>{users.length} portal accounts</p></div><div className="mini-search"><Search /><span>Search employees</span></div></div>
        {loading ? <RowsLoading /> : <Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Last sign-in</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader><TableBody>{users.map((user) => <TableRow key={user.id}><TableCell><div className="person-cell"><span>{initials(user.fullName)}</span><div><b>{user.fullName}</b><small>{user.email}</small></div></div></TableCell><TableCell>{user.department}</TableCell><TableCell><div className="role-list">{user.roles.map((role) => <Badge variant="secondary" key={role}>{role}</Badge>)}</div></TableCell><TableCell><span className={`status-pill ${user.isActive ? 'active' : 'inactive'}`}><i />{user.isActive ? 'Active' : 'Inactive'}</span></TableCell><TableCell>{dateTime(user.lastLoginAt)}</TableCell><TableCell><div className="row-actions"><Button variant="ghost" size="icon-sm" onClick={() => setEditing(user)} aria-label={`Edit ${user.fullName}`}><Pencil /></Button><Button variant="ghost" size="icon-sm" onClick={() => deactivate(user)} aria-label={`Deactivate ${user.fullName}`} disabled={!user.isActive}><Trash2 /></Button></div></TableCell></TableRow>)}</TableBody></Table>}
      </div>
      <UserDialog open={addOpen} onOpenChange={setAddOpen} roles={roles} onSaved={async () => { onNotice('Employee account created.'); await load(); }} />
      <UserDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} roles={roles} user={editing} onSaved={async () => { setEditing(null); onNotice('Employee access updated.'); await load(); }} />
    </section>
  );
}

function UserDialog({ open, onOpenChange, roles, user, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; roles: Role[]; user?: AdminUser | null; onSaved: () => Promise<void> }) {
  const [fullName, setFullName] = useState(''); const [email, setEmail] = useState(''); const [department, setDepartment] = useState(''); const [password, setPassword] = useState(''); const [roleIds, setRoleIds] = useState<number[]>([]); const [active, setActive] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (open) { setFullName(user?.fullName ?? ''); setEmail(user?.email ?? ''); setDepartment(user?.department ?? ''); setPassword(''); setRoleIds(user?.roleIds ?? []); setActive(user?.isActive ?? true); setError(''); } }, [open, user]);
  async function submit(event: SyntheticEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); try { if (user) await api(`/api/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify({ fullName, department, isActive: active, roleIds, ...(password ? { password } : {}) }) }); else await api('/api/admin/users', { method: 'POST', body: JSON.stringify({ fullName, email, department, password, roleIds }) }); onOpenChange(false); await onSaved(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save employee.'); } finally { setBusy(false); } }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="admin-dialog"><DialogHeader><DialogTitle>{user ? 'Edit employee access' : 'Add an employee'}</DialogTitle><DialogDescription>{user ? 'Changes apply to the employee’s next request.' : 'Create a portal identity and assign its first role.'}</DialogDescription></DialogHeader><form onSubmit={submit} className="dialog-form"><div className="dialog-grid"><label>Full name<Input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label><label>Department<Input value={department} onChange={(e) => setDepartment(e.target.value)} required /></label></div><label>Work email<Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={Boolean(user)} /></label><label>{user ? 'New password (optional)' : 'Temporary password'}<Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required={!user} minLength={8} /></label><fieldset><legend>Assigned roles</legend><div className="permission-grid">{roles.map((role) => <label key={role.id}><Checkbox checked={roleIds.includes(role.id)} onCheckedChange={(checked) => setRoleIds((current) => checked ? [...current, role.id] : current.filter((id) => id !== role.id))} /><span><b>{role.name}</b><small>{role.description}</small></span></label>)}</div></fieldset>{user && <label className="active-toggle"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Account is active</span></label>}{error && <p className="dialog-error">{error}</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : user ? 'Save changes' : 'Create employee'}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function RolesAdmin({ onNotice }: { onNotice: (message: string) => void }) {
  const [roles, setRoles] = useState<Role[]>([]); const [permissions, setPermissions] = useState<Permission[]>([]); const [loading, setLoading] = useState(true); const [editing, setEditing] = useState<Role | 'new' | null>(null);
  const load = useCallback(async () => { setLoading(true); try { const data = await api<{ roles: Role[]; permissions: Permission[] }>('/api/admin/roles'); setRoles(data.roles); setPermissions(data.permissions); } catch (error) { onNotice(error instanceof Error ? error.message : 'Could not load roles.'); } finally { setLoading(false); } }, [onNotice]);
  useEffect(() => { void load(); }, [load]);
  async function remove(role: Role) { if (!window.confirm(`Delete the ${role.name} role?`)) return; try { await api(`/api/admin/roles/${role.id}`, { method: 'DELETE', body: '{}' }); onNotice('Role deleted.'); await load(); } catch (error) { onNotice(error instanceof Error ? error.message : 'Could not delete role.'); } }
  return <section><div className="page-heading admin-heading"><div><span className="page-kicker">ACCESS CONTROL</span><h1>Roles & permissions</h1><p>Decide which Zoho services and portal actions each role can use.</p></div><Button onClick={() => setEditing('new')}><Plus /> Create role</Button></div>{loading ? <RowsLoading /> : <div className="role-card-grid">{roles.map((role) => <article className="role-card" key={role.id}><div className="role-card-top"><span className={`role-symbol role-${role.slug}`}><ShieldCheck /></span><div className="role-menu"><button onClick={() => setEditing(role)} aria-label={`Edit ${role.name}`}><Pencil /></button>{!role.systemRole && <button onClick={() => remove(role)} aria-label={`Delete ${role.name}`}><Trash2 /></button>}</div></div><div><span className="role-type">{role.systemRole ? 'BUILT-IN ROLE' : 'CUSTOM ROLE'}</span><h2>{role.name}</h2><p>{role.description}</p></div><div className="role-stats"><span><b>{role.userCount}</b> {role.userCount === 1 ? 'user' : 'users'}</span><span><b>{role.permissionIds.length}</b> permissions</span></div><div className="role-permissions">{role.permissions.slice(0, 3).map((permission) => <Badge variant="secondary" key={permission}>{permission}</Badge>)}{role.permissions.length > 3 && <Badge variant="outline">+{role.permissions.length - 3}</Badge>}</div><button className="manage-role" onClick={() => setEditing(role)}>Manage access <ArrowRight /></button></article>)}</div>}<RoleDialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)} role={editing === 'new' ? null : editing} permissions={permissions} onSaved={async () => { setEditing(null); onNotice(editing === 'new' ? 'Role created.' : 'Role permissions updated.'); await load(); }} /></section>;
}

function RoleDialog({ open, onOpenChange, role, permissions, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; role: Role | null; permissions: Permission[]; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [permissionIds, setPermissionIds] = useState<number[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (open) { setName(role?.name ?? ''); setDescription(role?.description ?? ''); setPermissionIds(role?.permissionIds ?? []); setError(''); } }, [open, role]);
  async function submit(event: SyntheticEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); try { if (role) await api(`/api/admin/roles/${role.id}`, { method: 'PATCH', body: JSON.stringify({ name, description, permissionIds }) }); else await api('/api/admin/roles', { method: 'POST', body: JSON.stringify({ name, description, permissionIds }) }); onOpenChange(false); await onSaved(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save role.'); } finally { setBusy(false); } }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="admin-dialog"><DialogHeader><DialogTitle>{role ? `Manage ${role.name}` : 'Create a role'}</DialogTitle><DialogDescription>Permissions are enforced by the backend on every protected request.</DialogDescription></DialogHeader><form onSubmit={submit} className="dialog-form"><label>Role name<Input value={name} onChange={(e) => setName(e.target.value)} required disabled={Boolean(role?.systemRole)} /></label><label>Description<Input value={description} onChange={(e) => setDescription(e.target.value)} /></label><fieldset><legend>Permissions</legend><div className="permission-grid permission-list">{permissions.map((permission) => <label key={permission.id}><Checkbox checked={permissionIds.includes(permission.id)} onCheckedChange={(checked) => setPermissionIds((current) => checked ? [...current, permission.id] : current.filter((id) => id !== permission.id))} /><span><b>{permission.name}</b><small>{permission.description}</small></span></label>)}</div></fieldset>{error && <p className="dialog-error">{error}</p>}<DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : role ? 'Save permissions' : 'Create role'}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function AuditActivity() {
  const [logs, setLogs] = useState<AuditLog[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { void api<{ logs: AuditLog[] }>('/api/admin/audit').then((data) => setLogs(data.logs)).catch(() => setLogs([])).finally(() => setLoading(false)); }, []);
  const labels: Record<string, string> = { 'auth.login': 'Signed in', 'auth.logout': 'Signed out', 'zoho.launch': 'Opened Zoho service', 'user.create': 'Created employee', 'user.update': 'Updated employee', 'user.deactivate': 'Deactivated employee', 'role.create': 'Created role', 'role.update': 'Updated role', 'role.delete': 'Deleted role', 'permission.denied': 'Permission denied' };
  return <section><div className="page-heading"><div><span className="page-kicker">SECURITY MONITORING</span><h1>Audit activity</h1><p>Review the most recent authentication, access, and administration events.</p></div><div className="audit-healthy"><ShieldCheck /><span><small>Audit system</small><b>Recording activity</b></span></div></div><div className="data-card audit-card">{loading ? <RowsLoading /> : <Table><TableHeader><TableRow><TableHead>Event</TableHead><TableHead>Actor</TableHead><TableHead>Resource</TableHead><TableHead>Status</TableHead><TableHead>Time</TableHead></TableRow></TableHeader><TableBody>{logs.map((log) => <TableRow key={log.id}><TableCell><div className="event-cell"><span><Activity /></span><b>{labels[log.action] ?? log.action}</b></div></TableCell><TableCell>{log.actor_email ?? 'System'}</TableCell><TableCell>{log.resource}{log.resource_id ? ` · ${log.resource_id}` : ''}</TableCell><TableCell><span className={`status-pill ${log.status === 'success' ? 'active' : 'inactive'}`}><i />{log.status}</span></TableCell><TableCell>{dateTime(log.created_at)}</TableCell></TableRow>)}</TableBody></Table>}</div></section>;
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof UsersRound; label: string; value: string | number; tone: string }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}><Icon /></span><div><span>{label}</span><b>{value}</b></div><MoreHorizontal /></article>;
}

function RowsLoading() {
  return <div className="rows-loading"><span /><span /><span /><span /></div>;
}
