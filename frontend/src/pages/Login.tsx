import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { api, apiError } from '../lib/api';
import { useAuth } from '../store/auth';
import { Button, Field, Input, Select } from '../components/ui';

const DEMO = [
  ['owner1', 'Owner'],
  ['cashier1', 'Cashier'],
  ['storekeeper1', 'Storekeeper'],
  ['accountant1', 'Accountant'],
] as const;

export default function Login() {
  const navigate = useNavigate();
  const { accessToken, setSession } = useAuth();
  const [username, setUsername] = useState('owner1');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (accessToken) return <Navigate to="/" replace />;

  const submit = async (e?: React.FormEvent, asUser?: string) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/auth/login', { username: asUser ?? username, password: 'password123' });
      setSession(data);
      navigate('/');
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Left — brand story panel (hidden on small screens) */}
      <div className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0 bg-gradient-to-br from-ink-800 via-ink-900 to-black" />
        <div className="absolute -right-24 top-1/4 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-500 text-lg font-bold text-ink-900">CT</div>
            <span className="text-lg font-semibold">The Copper Tap</span>
          </div>
          <div className="max-w-md">
            <h1 className="text-4xl font-semibold leading-tight">Every pour, every shilling — accounted for.</h1>
            <p className="mt-4 text-chalk-500">
              Fast service at the bar, honest numbers in the back office. Sign in to open a shift, ring up a round, or see what's
              selling tonight.
            </p>
          </div>
          <p className="text-xs text-chalk-500">© {new Date().getFullYear()} Copper Tap · Riverside, Nairobi</p>
        </div>
      </div>

      {/* Right — the actual form */}
      <div className="flex items-center justify-center px-6 py-16">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div className="lg:hidden">
            <div className="mb-6 grid h-11 w-11 place-items-center rounded-xl bg-amber-500 text-lg font-bold text-ink-900">CT</div>
          </div>
          <div>
            <h2 className="text-2xl font-semibold">Sign in</h2>
            <p className="mt-1 text-sm text-chalk-500">Use your staff credentials or a demo account below.</p>
          </div>

          <Field label="Branch">
            <Select defaultValue="riverside">
              <option value="riverside">Riverside · Nairobi</option>
              <option value="mombasa">Nyali · Mombasa</option>
            </Select>
          </Field>
          <Field label="Username">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>

          {error && <p className="rounded-lg bg-pour-red/10 px-3 py-2 text-sm text-pour-red">{error}</p>}

          <Button type="submit" loading={busy} className="w-full">
            <KeyRound size={16} /> Sign in
          </Button>

          <div className="pt-2">
            <p className="mb-2 text-xs uppercase tracking-wide text-chalk-500">Quick demo login</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO.map(([u, label]) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => submit(undefined, u)}
                  className="rounded-lg border border-white/10 px-3 py-2 text-left text-sm hover:border-amber-500/40 hover:bg-white/5"
                >
                  <span className="block font-medium">{label}</span>
                  <span className="text-xs text-chalk-500">{u}</span>
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
