/**
 * Hardware integration seams. These are the interfaces the rest of the system
 * codes against; the mock implementations let everything run on a laptop. Swap
 * a mock for a real driver (ESC/POS printer, card terminal SDK, keg flow meter,
 * scale) without touching business logic.
 */

export interface ReceiptPrinter {
  print(receipt: { title: string; lines: string[]; total: number }): Promise<void>;
  openDrawer(): Promise<void>;
}

export interface PaymentTerminal {
  charge(amount: number, method: 'CARD' | 'MOBILE_MONEY'): Promise<{ approved: boolean; reference: string }>;
}

export interface BarcodeScanner {
  onScan(handler: (code: string) => void): void;
}

export interface FlowMeter {
  /** Millilitres poured since last reset — used to reconcile draft beer. */
  read(tapId: string): Promise<number>;
}

export interface Scale {
  /** Grams on the pan — for portioned garnishes / spirits by weight. */
  read(): Promise<number>;
}

// ---- Mock implementations (development / no hardware attached) ---------------

export const mockPrinter: ReceiptPrinter = {
  async print(receipt) {
    // eslint-disable-next-line no-console
    console.log(`[printer] ${receipt.title} — ${receipt.lines.length} lines, total ${receipt.total}`);
  },
  async openDrawer() {
    // eslint-disable-next-line no-console
    console.log('[printer] cash drawer kick');
  },
};

export const mockTerminal: PaymentTerminal = {
  async charge(amount, method) {
    return { approved: true, reference: `MOCK-${method}-${Date.now()}` };
  },
};

export const mockFlowMeter: FlowMeter = {
  async read() {
    return 0;
  },
};
