import type { ReactNode } from 'react';
import { cx } from './ui';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-white/5 px-5 py-5 md:px-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-chalk-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A headline KPI. Deliberately not a perfect grid cell — sizes vary by emphasis. */
export function StatTile({ label, value, delta, tone, className }: { label: string; value: ReactNode; delta?: string; tone?: 'green' | 'red' | 'amber'; className?: string }) {
  const toneClass = tone === 'green' ? 'text-pour-green' : tone === 'red' ? 'text-pour-red' : 'text-amber-400';
  return (
    <div className={cx('card p-5', className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-chalk-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {delta && <p className={cx('mt-1 text-xs font-medium', toneClass)}>{delta}</p>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('card', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          {title && <h2 className="text-sm font-semibold text-chalk-300">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
