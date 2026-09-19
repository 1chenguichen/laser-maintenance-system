import { Server, Namespace } from 'socket.io';
import { INestApplication } from '@nestjs/common';

let io: Server | null = null;
let wsNamespace: Namespace | null = null;

export function setupSocketIO(app: INestApplication) {
  const httpServer = app.getHttpServer();
  io = new Server(httpServer, {
    cors: { origin: '*' },
  });

  // Create a namespace for our WebSocket events
  wsNamespace = io.of('/ws');

  // Handle customer connections
  wsNamespace.on('connection', (socket) => {
    console.log('[Socket.IO] Client connected:', socket.id);

    // Bind customer
    socket.on('bind_customer', (data: { customerId: string }) => {
      socket.join(`customer:${data.customerId}`);
      console.log('[Socket.IO] Customer', data.customerId, 'joined room');
    });

    // Handle CS messages
    socket.on('cs_send_to_customer', (data: { customerId: string; message: string; from: string }) => {
      wsNamespace?.to(`customer:${data.customerId}`).emit('cs_message', {
        message: data.message,
        from: data.from,
        timestamp: Date.now(),
      });
    });

    socket.on('disconnect', () => {
      console.log('[Socket.IO] Client disconnected:', socket.id);
    });
  });

  console.log('[Socket.IO] Server initialized on /ws namespace');
  return io;
}

export function getSocketIO(): Server | null {
  return io;
}

export function getWsNamespace(): Namespace | null {
  return wsNamespace;
}

export function sendToCustomer(customerId: string, event: string, data: any) {
  console.log(`[Socket.IO] sendToCustomer: ${event} -> customer:${customerId}`);
  wsNamespace?.to(`customer:${customerId}`).emit(event, data);
}
