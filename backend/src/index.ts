import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { createApp } from './app';
import { env } from './config/env';
import { bus } from './lib/events';
import { prisma } from './lib/prisma';

const app = createApp();
const httpServer = createServer(app);

// Realtime: push domain events to connected bar/kitchen/waiter clients.
const io = new SocketServer(httpServer, { cors: { origin: env.corsOrigin } });
io.on('connection', (socket) => {
  const room = (socket.handshake.query.room as string) || 'floor';
  socket.join(room);
});
bus.on('domain', (event) => io.emit(event.type, event));

httpServer.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Pub System API listening on http://localhost:${env.port}  (env: ${env.nodeEnv})`);
});

async function shutdown() {
  await prisma.$disconnect();
  httpServer.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
