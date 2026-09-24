import { type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useEffect } from 'react';
import { Loader2, X } from 'lucide-react';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

// ---- Button ------------------------------------------------------------------

type Variant = 'primary' | 'ghost' | 'danger' | 'outline' | 'subtle';
const variants: Record<Variant, string> = {
  primary: 'bg-amber-500 text-ink-900 hover:bg-amber-400 disabled:bg-amber-600/50',
  ghost: 'text-chalk-300 hover:bg-white/5 hover:text-chalk-100',
  danger: 'bg-pour-red/90 text-white hover:bg-pour-red',
  outline: 'border border-white/10 text-chalk-100 hover:border-white/25 hover:bg-white/5',
  subtle: 'bg-ink-700 text-chalk-100 hover:bg-ink-600',
};

export function Button({
  variant = 'primary',
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant],
        className,
      )}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
    </button>
  );
}

// ---- Inputs ------------------------------------------------------------------

export function Field({ label, hint, children }: { label?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-xs font-medium uppercase tracking-wide text-chalk-500">{label}</span>}
      {children}
      {hint && <span className="block text-xs text-chalk-500">{hint}</span>}
    </label>
  );
}

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={cx('input-field', props.className)} />;

export const Select = ({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={cx('input-field appearance-none', props.className)}>
    {children}
  </select>
);

// ---- Badge -------------------------------------------------------------------

const tones: Record<string, string> = {
  neutral: 'bg-ink-600 text-chalk-300',
  amber: 'bg-amber-500/15 text-amber-400',
  green: 'bg-pour-green/15 text-pour-green',
  red: 'bg-pour-red/15 text-pour-red',
  blue: 'bg-pour-blue/15 text-pour-blue',
};

export const Badge = ({ tone = 'neutral', children }: { tone?: keyof typeof tones; children: ReactNode }) => (
  <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone])}>{children}</span>
);

// ---- Feedback ----------------------------------------------------------------

export const Spinner = ({ label }: { label?: string }) => (
  <div className="flex items-center gap-2 text-chalk-500">
    <Loader2 size={16} className="animate-spin" />
    {label && <span className="text-sm">{label}</span>}
  </div>
);

export const EmptyState = ({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) => (
  <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-6 py-12 text-center">
    {icon && <div className="text-chalk-500">{icon}</div>}
    <p className="font-medium text-chalk-300">{title}</p>
    {hint && <p className="max-w-sm text-sm text-chalk-500">{hint}</p>}
  </div>
);

// ---- Modal -------------------------------------------------------------------

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={cx('w-full animate-slide-up rounded-t-2xl border border-white/10 bg-ink-800 shadow-rail sm:rounded-2xl', wide ? 'max-w-3xl' : 'max-w-md')}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-white/5 px-5 py-4">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-chalk-500 hover:bg-white/5 hover:text-chalk-100">
            <X size={18} />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ---- Tabs (uncontrolled-lite) ------------------------------------------------

export function TabBar<T extends string>({ tabs, active, onChange }: { tabs: { key: T; label: string; count?: number }[]; active: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-white/5">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cx(
            'relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition',
            active === t.key ? 'text-amber-400' : 'text-chalk-500 hover:text-chalk-300',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-xs text-chalk-500">{t.count}</span>}
          {active === t.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-amber-400" />}
        </button>
      ))}
    </div>
  );
}
