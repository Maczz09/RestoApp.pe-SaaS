import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { resolveWsCorsOrigins } from './notifications.gateway';

/** Public QR data only, with isolated branch rooms. Never sends orders or finances. */
@WebSocketGateway({ cors: { origin: resolveWsCorsOrigins() }, path: '/api/carta-socket.io' })
export class CartaGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;
  handleConnection(client: Socket) {
    const sedeId = client.handshake.query['sedeId'];
    if (typeof sedeId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(sedeId)) {
      client.disconnect(true); return;
    }
    void client.join(`carta-publica:sede:${sedeId}`);
  }
  emitDisponibilidadCambiada(sedeId: string, productoId: string, disponible: boolean) {
    if (!sedeId || !this.server) return;
    this.server.to(`carta-publica:sede:${sedeId}`).emit('disponibilidad:cambiada', { productoId, disponible });
  }
}
