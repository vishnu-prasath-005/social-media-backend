import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LikerResponse, LikersPageResponse } from './types/like-response.type';

const LIKER_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isVerified: true,
} as const;

@Injectable()
export class LikesService {
  private readonly logger = new Logger(LikesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async likePost(userId: string, postId: string): Promise<void> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
      select: { id: true, authorId: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.postLike.create({ data: { userId, postId } });
        await tx.post.update({
          where: { id: postId },
          data: { likeCount: { increment: 1 } },
        });
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Post already liked');
      }
      throw e;
    }

    this.notifications
      .notifyInteraction({
        actorId: userId,
        recipientId: post.authorId,
        type: NotificationType.LIKE_POST,
        postId,
      })
      .catch((err) => this.logger.error('Failed to send like notification', err));
  }

  async unlikePost(userId: string, postId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.postLike.deleteMany({ where: { userId, postId } });
      if (count > 0) {
        await tx.post.updateMany({
          where: { id: postId, likeCount: { gt: 0 } },
          data: { likeCount: { decrement: 1 } },
        });
      }
    });
  }

  async likeComment(userId: string, commentId: string): Promise<void> {
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, isDeleted: false },
      select: { id: true, authorId: true },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.commentLike.create({ data: { userId, commentId } });
        await tx.comment.update({
          where: { id: commentId },
          data: { likeCount: { increment: 1 } },
        });
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Comment already liked');
      }
      throw e;
    }

    this.notifications
      .notifyInteraction({
        actorId: userId,
        recipientId: comment.authorId,
        type: NotificationType.LIKE_COMMENT,
        commentId,
      })
      .catch((err) => this.logger.error('Failed to send comment-like notification', err));
  }

  async unlikeComment(userId: string, commentId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.commentLike.deleteMany({
        where: { userId, commentId },
      });
      if (count > 0) {
        await tx.comment.updateMany({
          where: { id: commentId, likeCount: { gt: 0 } },
          data: { likeCount: { decrement: 1 } },
        });
      }
    });
  }

  async getPostLikers(
    postId: string,
    cursor?: string,
    rawLimit?: number,
  ): Promise<LikersPageResponse> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
      select: { id: true },
    });
    if (!post) throw new NotFoundException('Post not found');

    const limit = Math.min(Number(rawLimit) || 20, 50);

    const likes = await this.prisma.postLike.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      // Composite cursor: unique within the postId scope
      ...(cursor && {
        cursor: { userId_postId: { userId: cursor, postId } },
        skip: 1,
      }),
      select: {
        userId: true,
        createdAt: true,
        user: { select: LIKER_USER_SELECT },
      },
    });

    const hasMore = likes.length > limit;
    const data = hasMore ? likes.slice(0, limit) : likes;

    return {
      data: data as LikerResponse[],
      nextCursor: hasMore ? data[data.length - 1].userId : null,
      hasMore,
    };
  }
}
