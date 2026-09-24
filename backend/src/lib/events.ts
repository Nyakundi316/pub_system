import { EventEmitter } from 'node:events';

/**
 * Tiny in-process event bus. Business modules emit domain events here without
 * knowing anything about WebSockets; index.ts bridges these to Socket.IO so the
 * bar display and waiter apps update live. Keeps the transport swappable.
 */
export type DomainEvent =
  | { type: 'order.created'; saleId: number; tabId?: number | null; total: number }
  | { type: 'order.paid'; saleId: number }
  | { type: 'order.void'; saleId: number }
  | { type: 'stock.low'; stockItemId: number; name: string };

class Bus extends EventEmitter {
  publish(event: DomainEvent) {
    this.emit('domain', event);
  }
}

export const bus = new Bus();
