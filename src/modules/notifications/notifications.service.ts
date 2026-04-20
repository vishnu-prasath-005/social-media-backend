import { Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';

const ACTOR_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isVerified: true,
} as const;

const POST_SNIPPET_SELECT = {
  id: true,
  content: true,
  createdAt: true,
  author: { select: ACTOR_SELECT },
} as const;

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  isRead: true,
  createdAt: true,
  postId: true,
  commentId: true,
  actor: { select: ACTOR_SELECT },
} as const;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  /**
   * Persists a per-user interaction notification and pushes it in real-time.
   * Self-notifications are silently dropped — never notify a user of their own action.
   */
  async notifyInteraction(params: {
    actorId: string;
    recipientId: string;
    type: NotificationType;
    postId?: string;
    commentId?: string;
  }): Promise<void> {
    if (params.actorId === params.recipientId) return;

    const notification = await this.prisma.notification.create({
      data: params,
      select: NOTIFICATION_SELECT,
    });

    this.gateway.server
      .to(`user:${params.recipientId}`)
      .emit('notification:new', notification);
  }

  /**
   * Persists one broadcast record for a new post (NOT one row per user)
   * and pushes it to all connected clients via the shared 'broadcast' room.
   * Clients that are offline can poll GET /notifications/broadcast?since=<ISO>.
   */
  async broadcastNewPost(actorId: string, postId: string): Promise<void> {
    const record = await this.prisma.broadcastNotification.create({
      data: { actorId, postId, type: NotificationType.NEW_POST },
      select: {
        id: true,
        type: true,
        createdAt: true,
        actor: { select: ACTOR_SELECT },
        post: { select: POST_SNIPPET_SELECT },
      },
    });

    // Exclude the author's own socket room so they never receive their own post broadcast.
    this.gateway.server
      .to('broadcast')
      .except(`user:${actorId}`)
      .emit('notification:new_post', record);
  }

  async getForUser(userId: string, cursor?: string, rawLimit?: number) {
    const limit = Math.min(Number(rawLimit) || 20, 50);

    const items = await this.prisma.notification.findMany({
      where: { recipientId: userId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: NOTIFICATION_SELECT,
    });

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    return { data, nextCursor: hasMore ? data[data.length - 1].id : null, hasMore };
  }

  /**
   * Fallback endpoint for clients that were offline and missed the WS broadcast.
   * Returns new-post events since the given ISO timestamp, newest first.
   */
  async getBroadcast(since?: string, rawLimit?: number) {
    const limit = Math.min(Number(rawLimit) || 20, 50);

    const data = await this.prisma.broadcastNotification.findMany({
      where: since ? { createdAt: { gt: new Date(since) } } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        createdAt: true,
        actor: { select: ACTOR_SELECT },
        post: { select: POST_SNIPPET_SELECT },
      },
    });

    return { data };
  }

  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { recipientId: userId, isRead: false },
    });
    return { count };
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { id: notificationId, recipientId: userId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { recipientId: userId, isRead: false },
      data: { isRead: true },
    });
  }
}
