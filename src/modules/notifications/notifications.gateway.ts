import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

interface AuthenticatedSocket extends Socket {
  data: { userId: string };
}

@WebSocketGateway({
  namespace: 'notifications',
  cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000', credentials: true },
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  afterInit() {
    this.logger.log('Notifications WebSocket gateway initialized');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractToken(client);
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      });

      client.data.userId = payload.sub;

      // Personal room — receives targeted notifications (likes, comments, follows)
      client.join(`user:${payload.sub}`);

      // Global broadcast room — receives new-post events from any user
      client.join('broadcast');

      this.logger.log(`Connected: ${client.id} (user: ${payload.sub})`);
    } catch {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(
      `Disconnected: ${client.id} (user: ${client.data?.userId ?? 'unknown'})`,
    );
  }

  private extractToken(client: Socket): string {
    const token =
      client.handshake.auth?.token ??
      client.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) throw new Error('Missing token');
    return token;
  }
}
