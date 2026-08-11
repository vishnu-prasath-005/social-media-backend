import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const FOLLOW_USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  isVerified: true,
  bio: true,
} as const;

@Injectable()
export class FollowsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async follow(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new BadRequestException('Cannot follow yourself');
    }
    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    if (existing) throw new ConflictException('Already following this user');
    const relationship = await this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id: followingId },
        select: { id: true, _count: { select: { followers: true, following: true, posts: { where: { isDeleted: false } } } } },
      });
      if (!target) throw new NotFoundException('User not found');
      await tx.follow.create({ data: { followerId, followingId } });
      target._count.followers += 1;
      return target;
    });

    this.notifications
      .notifyInteraction({ actorId: followerId, recipientId: followingId, type: NotificationType.FOLLOW })
      .catch(() => {});
    return this.relationshipResponse(relationship, true, await this.isFollowing(followingId, followerId));
  }

  async unfollow(followerId: string, followingId: string) {
    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    if (!existing) throw new NotFoundException('Not following this user');
    await this.prisma.follow.delete({
      where: { followerId_followingId: { followerId, followingId } },
    });
    const target = await this.prisma.user.findUnique({
      where: { id: followingId },
      select: { id: true, _count: { select: { followers: true, following: true, posts: { where: { isDeleted: false } } } } },
    });
    if (!target) throw new NotFoundException('User not found');
    return this.relationshipResponse(target, false, await this.isFollowing(followingId, followerId));
  }

  async getFollowers(userId: string, cursor?: string, rawLimit: number = 20) {
    const limit = Math.min(Number(rawLimit) || 20, 50);
    const where = cursor
      ? { followingId: userId, createdAt: { lt: new Date(cursor) } }
      : { followingId: userId };

    const rows = await this.prisma.follow.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      select: { createdAt: true, follower: { select: FOLLOW_USER_SELECT } },
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    return {
      data: data.map((r) => r.follower),
      nextCursor: hasMore ? data[data.length - 1].createdAt.toISOString() : null,
      hasMore,
    };
  }

  async getFollowing(userId: string, cursor?: string, rawLimit: number = 20) {
    const limit = Math.min(Number(rawLimit) || 20, 50);
    const where = cursor
      ? { followerId: userId, createdAt: { lt: new Date(cursor) } }
      : { followerId: userId };

    const rows = await this.prisma.follow.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      select: { createdAt: true, following: { select: FOLLOW_USER_SELECT } },
    });

    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    return {
      data: data.map((r) => r.following),
      nextCursor: hasMore ? data[data.length - 1].createdAt.toISOString() : null,
      hasMore,
    };
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const row = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });
    return !!row;
  }

  private relationshipResponse(target: any, isFollowing: boolean, isFollowedBy: boolean) {
    return {
      userId: target.id,
      isFollowing,
      isFollowedBy,
      followerCount: target._count.followers,
      followingCount: target._count.following,
      postCount: target._count.posts,
    };
  }
}
