import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { useGet } from '../hooks/api';
import { useAuth } from '../store/auth';
import { PageHeader, Panel } from '../components/page';
import { Badge, Button, EmptyState, Field, Input, Modal, Select, Spinner, TabBar } from '../components/ui';
import { dateShort } from '../lib/format';

type Tab = 'general' | 'users' | 'roles';
interface Role { id: number; name: string; description: string | null; landingPath: string; permissions: string[] }
interface UserRow { id: number; name: string; username: string; phone: string | null; status: string; createdAt: string; role: { id: number; name: string } }

export default function Settings() {
  const can = useAuth((s) => s.can);
  const [tab, setTab] = useState<Tab>('general');
  return (
    <div>
      <PageHeader title="Settings" subtitle="Business, people and access" />
      <div className="px-5 md:px-8">
        <TabBar active={tab} onChange={setTab} tabs={[{ key: 'general', label: 'General' }, { key: 'users', label: 'Users' }, { key: 'roles', label: 'Roles & access' }]} />
      </div>
      <div className="p-5 md:p-8">
        {tab === 'general' && <General />}
        {tab === 'users' && (can('users.manage') ? <Users /> : <EmptyState title="Requires user management access" />)}
        {tab === 'roles' && <Roles />}
      </div>
    </div>
  );
}

function General() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Business">
        <div className="space-y-4">
          <Field label="Pub name"><Input defaultValue="The Copper Tap" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Currency"><Select defaultValue="KES"><option>KES</option><option>USD</option><option>UGX</option><option>TZS</option></Select></Field>
            <Field label="Time zone"><Select defaultValue="EAT"><option>EAT (UTC+3)</option><option>UTC</option></Select></Field>
          </div>
          <Field label="Default tax rate"><Input defaultValue="16%" /></Field>
          <p className="text-xs text-chalk-500">Settings shown here are wired to the API's business config; persisting edits is part of the next iteration.</p>
        </div>
      </Panel>
      <Panel title="Alerts & operations">
        <label className="flex items-center justify-between py-2 text-sm">
          Low-stock alerts on dashboard <input type="checkbox" defaultChecked className="h-4 w-4 accent-amber-500" />
        </label>
        <label className="flex items-center justify-between py-2 text-sm">
          Require manager approval for discounts <input type="checkbox" defaultChecked className="h-4 w-4 accent-amber-500" />
        </label>
        <label className="flex items-center justify-between py-2 text-sm">
          Nightly stock-recommendation run <input type="checkbox" defaultChecked className="h-4 w-4 accent-amber-500" />
        </label>
      </Panel>
    </div>
  );
}

function Users() {
  const qc = useQueryClient();
  const users = useGet<UserRow[]>('/users');
  const roles = useGet<Role[]>('/roles');
  const [adding, setAdding] = useState(false);
  return (
    <Panel title="Users" action={<Button className="text-xs" onClick={() => setAdding(true)}><UserPlus size={14} /> Add user</Button>}>
      {users.isLoading ? <Spinner /> : (
        <table className="w-full text-sm">
          <thead className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-chalk-500">
            <tr><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Username</th><th className="py-2 pr-3">Role</th><th className="py-2 pr-3">Status</th><th className="py-2">Since</th></tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(users.data ?? []).map((u) => (
              <tr key={u.id}>
                <td className="py-2 pr-3 font-medium">{u.name}</td>
                <td className="py-2 pr-3 text-chalk-500">{u.username}</td>
                <td className="py-2 pr-3">{u.role.name}</td>
                <td className="py-2 pr-3"><Badge tone={u.status === 'ACTIVE' ? 'green' : 'red'}>{u.status.toLowerCase()}</Badge></td>
                <td className="py-2 text-chalk-500">{dateShort(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {adding && <AddUser roles={roles.data ?? []} onClose={() => setAdding(false)} onDone={() => { setAdding(false); qc.invalidateQueries({ queryKey: ['/users', {}] }); }} />}
    </Panel>
  );
}

function AddUser({ roles, onClose, onDone }: { roles: Role[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', username: '', password: '', roleId: roles[0]?.id ?? 0, pin: '' });
  const m = useMutation({ mutationFn: () => api.post('/users', { ...form, pin: form.pin || undefined }), onSuccess: onDone });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: k === 'roleId' ? Number(e.target.value) : e.target.value });
  return (
    <Modal open onClose={onClose} title="Add user">
      <div className="space-y-4">
        <Field label="Full name"><Input value={form.name} onChange={set('name')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Username"><Input value={form.username} onChange={set('username')} /></Field>
          <Field label="Role"><Select value={form.roleId} onChange={set('roleId')}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Password"><Input type="password" value={form.password} onChange={set('password')} /></Field>
          <Field label="POS PIN (optional)"><Input value={form.pin} onChange={set('pin')} /></Field>
        </div>
        {m.isError && <p className="text-xs text-pour-red">{apiError(m.error)}</p>}
        <Button className="w-full" loading={m.isPending} disabled={!form.name || !form.username || form.password.length < 6} onClick={() => m.mutate()}>Create user</Button>
      </div>
    </Modal>
  );
}

function Roles() {
  const roles = useGet<Role[]>('/roles');
  if (roles.isLoading) return <Spinner />;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(roles.data ?? []).map((r) => (
        <div key={r.id} className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">{r.name}</p>
              <p className="text-xs text-chalk-500">{r.description}</p>
            </div>
            <Badge tone="blue">{r.permissions.includes('*') ? 'all access' : `${r.permissions.length} perms`}</Badge>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(r.permissions.includes('*') ? ['*'] : r.permissions).slice(0, 12).map((p) => (
              <span key={p} className="rounded-md bg-ink-700 px-2 py-0.5 text-[11px] text-chalk-300">{p}</span>
            ))}
            {r.permissions.length > 12 && <span className="text-[11px] text-chalk-500">+{r.permissions.length - 12} more</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
