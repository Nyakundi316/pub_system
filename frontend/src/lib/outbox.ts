import type { AxiosError } from 'axios';
import { create } from 'zustand';
import { api, apiError } from './api';
import { queryClient } from './queryClient';
import { useAuth } from '../store/auth';

/**
 * Offline outbox for the till. A sale that can't reach the API is parked in
 * IndexedDB and replayed later. Every sale carries a clientRef the server
 * dedupes on, so a replay whose response got lost can't double-charge or
 * double-deduct stock.
 */

export interface SalePayload {
  clientRef: string;
  soldAt: string;
  tabId?: number;
  customerId?: number;
  discountAmount?: number;
  items: { productId: number; quantity: number }[];
  payments?: { method: string; amount: number }[];
}

export interface QueuedSale {
  clientRef: string;
  userId: number;
  payload: SalePayload;
  total: number;
  queuedAt: string;
  state: 'pending' | 'failed';
  error?: string;
}

export type SubmitResult = { queued: false; change?: number } | { queued: true };

// ---- IndexedDB -----------------------------------------------------------------

const STORE = 'outbox';
let opening: Promise<IDBDatabase> | null = null;

function openDb() {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('copper-tap-pos', 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'clientRef' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opening = null;
      reject(req.error);
    };
  });
  return opening;
}

async function inStore<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = op(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const readAll = () => inStore<QueuedSale[]>('readonly', (s) => s.getAll());
const put = (entry: QueuedSale) => inStore('readwrite', (s) => s.put(entry));
const drop = (clientRef: string) => inStore('readwrite', (s) => s.delete(clientRef));

// ---- Live state for the UI ------------------------------------------------------

interface OutboxState {
  entries: QueuedSale[];
  syncing: boolean;
  lastSyncedAt: Date | null;
}

export const useOutbox = create<OutboxState>(() => ({ entries: [], syncing: false, lastSyncedAt: null }));

async function reload() {
  const entries = await readAll();
  entries.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  useOutbox.setState({ entries });
}

// ---- Submitting -----------------------------------------------------------------

/** RFC 4122 v4. crypto.randomUUID only exists on https/localhost; bar tablets often sit on plain LAN http. */
export function newClientRef(): string {
  if (typeof crypto.randomUUID === 'function' && window.isSecureContext) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** No response at all, or the proxy telling us the API behind it is down. */
function isUnreachable(err: unknown) {
  const res = (err as AxiosError).response;
  return !res || res.status === 502 || res.status === 503 || res.status === 504;
}

export async function submitSale(payload: SalePayload, total: number): Promise<SubmitResult> {
  try {
    const { data } = await api.post<{ change?: number }>('/sales', payload);
    return { queued: false, change: data.change };
  } catch (err) {
    if (!isUnreachable(err)) throw err;
    const userId = useAuth.getState().user?.id;
    if (userId === undefined) throw err;
    try {
      await put({ clientRef: payload.clientRef, userId, payload, total, queuedAt: new Date().toISOString(), state: 'pending' });
    } catch {
      throw err; // no IndexedDB (locked-down browser) — surface the original failure
    }
    await reload();
    return { queued: true };
  }
}

// ---- Replaying ------------------------------------------------------------------

async function drain() {
  const me = useAuth.getState().user?.id;
  if (me === undefined) return;

  // Only replay this bartender's sales — they'd otherwise be booked to whoever logged in next.
  const mine = (await readAll())
    .filter((e) => e.state === 'pending' && e.userId === me)
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));

  let sent = 0;
  for (const entry of mine) {
    try {
      await api.post('/sales', entry.payload);
      await drop(entry.clientRef);
      sent++;
    } catch (err) {
      if (isUnreachable(err) || (err as AxiosError).response?.status === 401) break; // still offline — try later
      await put({ ...entry, state: 'failed', error: apiError(err) });
    }
  }

  if (sent > 0) {
    useOutbox.setState({ lastSyncedAt: new Date() });
    queryClient.invalidateQueries({ queryKey: ['/tabs'] });
    queryClient.invalidateQueries({ queryKey: ['/dashboard/kpis'] });
  }
}

export async function flushOutbox() {
  if (useOutbox.getState().syncing) return;
  useOutbox.setState({ syncing: true });
  try {
    // Two open tills in one browser must not replay the same queue side by side.
    if (navigator.locks) await navigator.locks.request('pos-outbox', { ifAvailable: true }, (lock) => (lock ? drain() : undefined));
    else await drain();
  } catch {
    /* IndexedDB unavailable — nothing was ever queued */
  } finally {
    await reload().catch(() => undefined);
    useOutbox.setState({ syncing: false });
  }
}

export async function retryQueued(clientRef: string) {
  const entry = useOutbox.getState().entries.find((e) => e.clientRef === clientRef);
  if (!entry) return;
  await put({ ...entry, state: 'pending', error: undefined });
  await flushOutbox();
}

export async function discardQueued(clientRef: string) {
  await drop(clientRef);
  await reload();
}

/** Wire the outbox to connectivity: replay on reconnect and on a slow heartbeat. */
export function startOutboxSync() {
  const kick = () => void flushOutbox();
  kick();
  window.addEventListener('online', kick);
  const heartbeat = window.setInterval(() => {
    if (useOutbox.getState().entries.some((e) => e.state === 'pending')) kick();
  }, 20_000);
  return () => {
    window.removeEventListener('online', kick);
    window.clearInterval(heartbeat);
  };
}
