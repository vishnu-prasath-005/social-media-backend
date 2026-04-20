import { ForbiddenException, Logger, NotFoundException } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '@prisma/client';

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
  };
}

@WebSocketGateway({
  namespace: 'chat',
  cors: { origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000', credentials: true },
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  // Track which thread each socket is currently in (for typing cleanup on disconnect)
  private readonly socketActiveThread = new Map<string, string>();

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  afterInit() {
    this.logger.log('Chat WebSocket gateway initialized');
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token = this.extractToken(client);
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      });

      client.data.userId = payload.sub;
      client.join(`user:${payload.sub}`);

      this.logger.log(`Connected: ${client.id} (user: ${payload.sub})`);
    } catch {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Disconnected: ${client.id} (user: ${client.data?.userId ?? 'unknown'})`);

    // Clear typing indicator for the thread this socket was in
    const threadId = this.socketActiveThread.get(client.id);
    if (threadId && client.data?.userId) {
      this.server.to(`thread:${threadId}`).emit('typing:update', {
        threadId,
        userId: client.data.userId,
        isTyping: false,
      });
      this.socketActiveThread.delete(client.id);
    }
  }

  // ─── Thread rooms ───────────────────────────────────────────────────────────

  @SubscribeMessage('thread:join')
  async handleJoinThread(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() threadId: string,
  ) {
    const isMember = await this.chatService.verifyParticipant(
      threadId,
      client.data.userId,
    );
    if (!isMember) throw new WsException('Forbidden');

    client.join(`thread:${threadId}`);
    this.socketActiveThread.set(client.id, threadId);
    return { joined: threadId };
  }

  @SubscribeMessage('thread:leave')
  handleLeaveThread(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() threadId: string,
  ) {
    client.leave(`thread:${threadId}`);
    if (this.socketActiveThread.get(client.id) === threadId) {
      this.socketActiveThread.delete(client.id);
    }
    return { left: threadId };
  }

  // ─── Messaging ──────────────────────────────────────────────────────────────

  @SubscribeMessage('message:send')
  async handleMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const userId = client.data.userId;

    let message;
    try {
      message = await this.chatService.sendMessage(userId, dto);
    } catch (e) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) {
        throw new WsException(e.message);
      }
      throw e;
    }

    // Clear typing on send
    this.server.to(`thread:${dto.threadId}`).emit('typing:update', {
      threadId: dto.threadId,
      userId,
      isTyping: false,
    });

    // Path 1: deliver to all clients in the thread room
    this.server.to(`thread:${dto.threadId}`).emit('message:received', message);

    // Path 2: deliver to each participant's user room + persist notification
    const participantIds = await this.chatService.getThreadParticipantIds(
      dto.threadId,
    );
    for (const pid of participantIds) {
      if (pid !== userId) {
        this.server
          .to(`user:${pid}`)
          .emit('message:new', { threadId: dto.threadId, message });

        // Persist a notification so it appears in the recipient's notification feed
        this.notificationsService
          .notifyInteraction({
            actorId: userId,
            recipientId: pid,
            type: NotificationType.NEW_MESSAGE,
          })
          .catch((err) =>
            this.logger.error(`Failed to persist message notification: ${err}`),
          );
      }
    }

    return message;
  }

  // ─── Read receipts ──────────────────────────────────────────────────────────

  @SubscribeMessage('thread:read')
  async handleMarkRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() threadId: string,
  ) {
    await this.chatService.markRead(threadId, client.data.userId);

    this.server
      .to(`thread:${threadId}`)
      .emit('thread:read', { threadId, userId: client.data.userId });
  }

  // ─── Emoji reactions ────────────────────────────────────────────────────────

  @SubscribeMessage('reaction:toggle')
  async handleReactionToggle(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() { messageId, emoji }: { messageId: string; emoji: string },
  ) {
    const userId = client.data.userId;

    const msg = await this.chatService.getMessageThread(messageId);
    if (!msg) throw new WsException('Message not found');

    const isMember = await this.chatService.verifyParticipant(
      msg.threadId,
      userId,
    );
    if (!isMember) throw new WsException('Forbidden');

    const reactions = await this.chatService.toggleReaction(
      userId,
      messageId,
      emoji,
    );

    this.server.to(`thread:${msg.threadId}`).emit('reaction:update', {
      messageId,
      threadId: msg.threadId,
      reactions,
    });

    return reactions;
  }

  // ─── Typing indicators ──────────────────────────────────────────────────────

  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() threadId: string,
  ) {
    // Broadcast to others in the thread (not back to the sender)
    client.to(`thread:${threadId}`).emit('typing:update', {
      threadId,
      userId: client.data.userId,
      isTyping: true,
    });
  }

  @SubscribeMessage('typing:stop')
  handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() threadId: string,
  ) {
    client.to(`thread:${threadId}`).emit('typing:update', {
      threadId,
      userId: client.data.userId,
      isTyping: false,
    });
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private extractToken(client: Socket): string {
    const token =
      client.handshake.auth?.token ??
      client.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) throw new WsException('Missing token');
    return token;
  }
}
