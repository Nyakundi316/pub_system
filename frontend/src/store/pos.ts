import { create } from 'zustand';
import type { CartLine, Product } from '../lib/types';

const TAX_RATE = 0.16; // display only — the API recomputes authoritatively

interface PosState {
  lines: CartLine[];
  tabId: number | null;
  customerId: number | null;
  discount: number;
  add: (product: Product) => void;
  setQty: (productId: number, quantity: number) => void;
  remove: (productId: number) => void;
  setTab: (tabId: number | null) => void;
  setCustomer: (customerId: number | null) => void;
  setDiscount: (amount: number) => void;
  clear: () => void;
}

export const usePos = create<PosState>((set) => ({
  lines: [],
  tabId: null,
  customerId: null,
  discount: 0,
  add: (product) =>
    set((s) => {
      const existing = s.lines.find((l) => l.product.id === product.id);
      return existing
        ? { lines: s.lines.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l)) }
        : { lines: [...s.lines, { product, quantity: 1 }] };
    }),
  setQty: (productId, quantity) =>
    set((s) => ({
      lines: quantity <= 0 ? s.lines.filter((l) => l.product.id !== productId) : s.lines.map((l) => (l.product.id === productId ? { ...l, quantity } : l)),
    })),
  remove: (productId) => set((s) => ({ lines: s.lines.filter((l) => l.product.id !== productId) })),
  setTab: (tabId) => set({ tabId }),
  setCustomer: (customerId) => set({ customerId }),
  setDiscount: (discount) => set({ discount }),
  clear: () => set({ lines: [], tabId: null, customerId: null, discount: 0 }),
}));

export function posTotals(lines: CartLine[], discount: number) {
  const subtotal = lines.reduce((sum, l) => sum + l.product.sellingPrice * l.quantity, 0);
  const taxableBase = lines.filter((l) => l.product.taxable).reduce((sum, l) => sum + l.product.sellingPrice * l.quantity, 0);
  const discountShare = subtotal > 0 ? (discount * taxableBase) / subtotal : 0;
  const tax = Math.max(0, (taxableBase - discountShare) * TAX_RATE);
  const total = Math.max(0, subtotal - discount + tax);
  const cost = lines.reduce((sum, l) => sum + l.product.costPrice * l.quantity, 0);
  return { subtotal, tax, total, discount, grossProfit: subtotal - discount - cost };
}
