import { io, type Socket } from 'socket.io-client';

// Lazily-created shared socket. The bar display and floor views subscribe to the
// same domain events the API publishes (order.created / paid / void).
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: '/socket.io', query: { room: 'floor' }, transports: ['websocket', 'polling'] });
  }
  return socket;
}
