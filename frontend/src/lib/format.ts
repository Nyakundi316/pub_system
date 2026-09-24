const currency = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', maximumFractionDigits: 0 });
const currency2 = new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en-KE', { notation: 'compact', maximumFractionDigits: 1 });

export const money = (v: number | string | null | undefined, cents = false) =>
  (cents ? currency2 : currency).format(Number(v ?? 0));

export const shortMoney = (v: number | string | null | undefined) => 'KES ' + compact.format(Number(v ?? 0));

export const pct = (v: number | null | undefined, digits = 1) => `${Number(v ?? 0).toFixed(digits)}%`;

export const qty = (v: number | string | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

export const dateShort = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' });

export const timeShort = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });

export const dateTime = (iso: string | Date) => `${dateShort(iso)} · ${timeShort(iso)}`;
